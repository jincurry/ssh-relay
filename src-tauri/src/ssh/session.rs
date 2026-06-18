use crate::ipc::FrameAggregator;
use crate::monitor::{sample_monitor_over_ssh_session, MonitorSample};
use crate::ssh::auth::{authenticate_with_fallbacks, expand_private_key_path, SshAuth};
use crate::ssh::known_hosts::{check_host_key, learn_host_key, HostKeyStatus};
use crate::ssh::transport::{
    client_config, open_ssh_transport, validate_jump_hosts, validate_proxy_request,
    JumpHostRequest, ProxyRequest,
};
use crate::AppState;
use anyhow::{anyhow, bail, Context, Result};
use russh::client;
use russh::{ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{ipc::Channel, State};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

#[derive(Default)]
pub struct SshRegistry {
    sessions: parking_lot::Mutex<HashMap<String, SshSession>>,
}

struct SshSession {
    input: mpsc::UnboundedSender<SshInput>,
}

enum SshInput {
    Data(Vec<u8>),
    Resize {
        cols: u32,
        rows: u32,
    },
    SampleMonitor {
        reply: oneshot::Sender<Result<MonitorSample, String>>,
    },
    Close,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshOpenRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    term: Option<String>,
    cols: Option<u32>,
    rows: Option<u32>,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshResizeRequest {
    session_id: String,
    cols: u32,
    rows: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshMonitorRequest {
    session_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshOpenResponse {
    session_id: String,
    mode: &'static str,
}

struct RelayClient {
    host: String,
    port: u16,
    strict_host_key: bool,
    trust_unknown_host_key: bool,
}

#[derive(Debug, thiserror::Error)]
enum RelayClientError {
    #[error(transparent)]
    Ssh(#[from] russh::Error),
    #[error("Unknown server key for {host}:{port} ({fingerprint})")]
    UnknownHostKey {
        host: String,
        port: u16,
        fingerprint: String,
    },
    #[error(
        "Server key changed for {host}:{port}; known_hosts line {line}; received {fingerprint}"
    )]
    HostKeyChanged {
        host: String,
        port: u16,
        line: usize,
        fingerprint: String,
    },
    #[error("known_hosts error for {host}:{port}: {message}")]
    KnownHosts {
        host: String,
        port: u16,
        message: String,
    },
}

impl client::Handler for RelayClient {
    type Error = RelayClientError;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if !self.strict_host_key {
            return Ok(true);
        }

        match check_host_key(&self.host, self.port, server_public_key) {
            Ok(HostKeyStatus::Known) => Ok(true),
            Ok(HostKeyStatus::Unknown { fingerprint }) => {
                if self.trust_unknown_host_key {
                    learn_host_key(&self.host, self.port, server_public_key).map_err(|err| {
                        RelayClientError::KnownHosts {
                            host: self.host.clone(),
                            port: self.port,
                            message: err.to_string(),
                        }
                    })?;
                    Ok(true)
                } else {
                    Err(RelayClientError::UnknownHostKey {
                        host: self.host.clone(),
                        port: self.port,
                        fingerprint,
                    })
                }
            }
            Ok(HostKeyStatus::Changed { line, fingerprint }) => {
                Err(RelayClientError::HostKeyChanged {
                    host: self.host.clone(),
                    port: self.port,
                    line,
                    fingerprint,
                })
            }
            Err(err) => Err(RelayClientError::KnownHosts {
                host: self.host.clone(),
                port: self.port,
                message: err.to_string(),
            }),
        }
    }
}

#[tauri::command]
pub async fn ssh_open(
    state: State<'_, AppState>,
    req: SshOpenRequest,
    output: Channel<Vec<u8>>,
) -> Result<SshOpenResponse, String> {
    validate_open_request(&req).map_err(to_string)?;
    validate_private_key_path_for_auth(&req).map_err(to_string)?;

    let config = client_config(req.server_alive_interval_ms, req.server_alive_count_max);

    let port = req.port.unwrap_or(22);
    let handler = RelayClient {
        host: req.host.clone(),
        port,
        strict_host_key: req.strict_host_key.unwrap_or(true),
        trust_unknown_host_key: req.trust_unknown_host_key.unwrap_or(false),
    };
    let stream = open_ssh_transport(
        &req.host,
        port,
        req.proxy.as_ref(),
        req.jump_hosts.as_deref(),
        req.connect_timeout_ms.unwrap_or(30_000),
    )
    .await
    .with_context(|| {
        format!(
            "failed to connect to {}:{}",
            req.host,
            req.port.unwrap_or(22)
        )
    })
    .map_err(to_string)?;
    let mut ssh_session = client::connect_stream(config, stream, handler)
        .await
        .with_context(|| {
            format!(
                "failed to connect to {}:{}",
                req.host,
                req.port.unwrap_or(22)
            )
        })
        .map_err(to_string)?;

    authenticate(&mut ssh_session, &req)
        .await
        .map_err(to_string)?;

    let mut ssh_channel = ssh_session
        .channel_open_session()
        .await
        .context("failed to open SSH session channel")
        .map_err(to_string)?;
    let cols = req.cols.unwrap_or(120);
    let rows = req.rows.unwrap_or(32);
    ssh_channel
        .request_pty(
            false,
            req.term.as_deref().unwrap_or("xterm-256color"),
            cols,
            rows,
            0,
            0,
            &[],
        )
        .await
        .context("failed to request remote PTY")
        .map_err(to_string)?;
    ssh_channel
        .request_shell(true)
        .await
        .context("failed to start remote shell")
        .map_err(to_string)?;

    let session_id = Uuid::new_v4().to_string();
    let (tx, mut input) = mpsc::unbounded_channel();
    state
        .ssh
        .sessions
        .lock()
        .insert(session_id.clone(), SshSession { input: tx });

    let registry = state.ssh.clone();
    let task_session_id = session_id.clone();
    tokio::spawn(async move {
        let result: Result<()> = async move {
            let mut frames = FrameAggregator::new();
            let mut tick = tokio::time::interval(Duration::from_millis(crate::ipc::FRAME_MS));

            loop {
                tokio::select! {
                    command = input.recv() => {
                        match command {
                            Some(SshInput::Data(data)) => ssh_channel.data(data.as_slice()).await.context("failed to write SSH channel data")?,
                            Some(SshInput::Resize { cols, rows }) => {
                                ssh_channel.window_change(cols, rows, 0, 0).await.context("failed to resize remote PTY")?;
                            }
                            Some(SshInput::SampleMonitor { reply }) => {
                                let result = sample_monitor_over_ssh_session(&mut ssh_session).await.map_err(to_string);
                                let _ = reply.send(result);
                            }
                            Some(SshInput::Close) | None => {
                                let _ = ssh_channel.eof().await;
                                let _ = ssh_session.disconnect(Disconnect::ByApplication, "", "English").await;
                                break;
                            }
                        }
                    }
                    msg = ssh_channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { data }) => {
                                if let Some(frame) = frames.push(&data) {
                                    output.send(frame).map_err(|e| anyhow!(e.to_string()))?;
                                }
                            }
                            Some(ChannelMsg::ExtendedData { data, .. }) => {
                                if let Some(frame) = frames.push(&data) {
                                    output.send(frame).map_err(|e| anyhow!(e.to_string()))?;
                                }
                            }
                            Some(ChannelMsg::ExitStatus { .. }) | Some(ChannelMsg::Eof) | None => {
                                if let Some(frame) = frames.flush() {
                                    output.send(frame).map_err(|e| anyhow!(e.to_string()))?;
                                }
                                let _ = ssh_session.disconnect(Disconnect::ByApplication, "", "English").await;
                                break;
                            }
                            _ => {}
                        }
                    }
                    _ = tick.tick() => {
                        if let Some(frame) = frames.flush() {
                            output.send(frame).map_err(|e| anyhow!(e.to_string()))?;
                        }
                    }
                }
            }

            Ok(())
        }.await;
        registry.sessions.lock().remove(&task_session_id);
        if let Err(err) = result {
            eprintln!("ssh session failed: {err:#}");
        }
    });

    Ok(SshOpenResponse {
        session_id,
        mode: "russh",
    })
}

#[tauri::command]
pub fn ssh_write(
    state: State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let sessions = state.ssh.sessions.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "unknown ssh session".to_string())?;
    session.input.send(SshInput::Data(data)).map_err(to_string)
}

#[tauri::command]
pub fn ssh_resize(state: State<'_, AppState>, req: SshResizeRequest) -> Result<(), String> {
    let sessions = state.ssh.sessions.lock();
    let session = sessions
        .get(&req.session_id)
        .ok_or_else(|| "unknown ssh session".to_string())?;
    session
        .input
        .send(SshInput::Resize {
            cols: req.cols,
            rows: req.rows,
        })
        .map_err(to_string)
}

#[tauri::command]
pub async fn ssh_sample_monitor(
    state: State<'_, AppState>,
    req: SshMonitorRequest,
) -> Result<MonitorSample, String> {
    let input = state
        .ssh
        .sessions
        .lock()
        .get(&req.session_id)
        .map(|session| session.input.clone())
        .ok_or_else(|| "unknown ssh session".to_string())?;
    let (reply, response) = oneshot::channel();
    input
        .send(SshInput::SampleMonitor { reply })
        .map_err(to_string)?;
    response
        .await
        .map_err(|_| "ssh session monitor request was cancelled".to_string())?
}

#[tauri::command]
pub fn ssh_close(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let session = state
        .ssh
        .sessions
        .lock()
        .remove(&session_id)
        .ok_or_else(|| "unknown ssh session".to_string())?;
    session.input.send(SshInput::Close).map_err(to_string)
}

fn validate_open_request(req: &SshOpenRequest) -> Result<()> {
    if req.host.trim().is_empty() {
        bail!("host is required");
    }
    if req.user.trim().is_empty() {
        bail!("user is required");
    }
    if req.password.as_deref().unwrap_or("").is_empty()
        && req.private_key_path.as_deref().unwrap_or("").is_empty()
    {
        bail!("password or privateKeyPath is required");
    }
    if let Some(proxy) = &req.proxy {
        validate_proxy_request(proxy)?;
    }
    if let Some(jump_hosts) = &req.jump_hosts {
        validate_jump_hosts(jump_hosts)?;
    }
    Ok(())
}

fn validate_private_key_path_for_auth(req: &SshOpenRequest) -> Result<()> {
    let Some(path) = req
        .private_key_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    else {
        return Ok(());
    };

    validate_private_key_file(&expand_private_key_path(path))
}

fn validate_private_key_file(path: &PathBuf) -> Result<()> {
    let metadata = fs::metadata(path)
        .with_context(|| format!("failed to read private key at {}", path.display()))?;
    if !metadata.is_file() {
        bail!("private key at {} is not a regular file", path.display());
    }

    #[cfg(unix)]
    {
        let mode = metadata.permissions().mode() & 0o777;
        if mode & 0o077 != 0 {
            bail!(
                "private key permissions {mode:03o} for {} are too open; run chmod 600 {}",
                path.display(),
                path.display()
            );
        }
    }

    Ok(())
}

async fn authenticate(
    session: &mut client::Handle<RelayClient>,
    req: &SshOpenRequest,
) -> Result<()> {
    authenticate_with_fallbacks(
        session,
        SshAuth {
            user: &req.user,
            password: req.password.as_deref(),
            private_key_path: req.private_key_path.as_deref(),
            private_key_passphrase: req.private_key_passphrase.as_deref(),
            totp_code: req.totp_code.as_deref(),
            rejected_message: "SSH authentication rejected by server",
        },
    )
    .await
}

fn to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::known_hosts::public_key_fingerprint;
    use russh::client::Handler;

    fn valid_req() -> SshOpenRequest {
        SshOpenRequest {
            host: "127.0.0.1".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            term: Some("xterm-256color".to_string()),
            cols: Some(120),
            rows: Some(32),
            strict_host_key: Some(false),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
            proxy: None,
            jump_hosts: None,
        }
    }

    fn temp_key_path(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "relay-session-key-test-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp key dir");
        root.join("id_ed25519")
    }

    #[test]
    fn rejects_missing_host() {
        let mut req = valid_req();
        req.host.clear();
        assert!(validate_open_request(&req).is_err());
    }

    #[test]
    fn rejects_missing_user() {
        let mut req = valid_req();
        req.user.clear();
        assert!(validate_open_request(&req).is_err());
    }

    #[test]
    fn requires_password_or_private_key() {
        let mut req = valid_req();
        req.password = None;
        req.private_key_path = None;
        assert!(validate_open_request(&req).is_err());

        req.private_key_path = Some("/tmp/id_ed25519".to_string());
        assert!(validate_open_request(&req).is_ok());
    }

    #[test]
    fn validates_session_proxy_settings() {
        let mut req = valid_req();
        req.proxy = Some(ProxyRequest {
            kind: "socks5".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(1080),
            username: None,
            password: None,
            cmd: None,
        });
        assert!(validate_open_request(&req).is_ok());

        req.proxy = Some(ProxyRequest {
            kind: "http".to_string(),
            host: None,
            port: Some(8080),
            username: None,
            password: None,
            cmd: None,
        });
        assert!(validate_open_request(&req).is_err());

        req.proxy = Some(ProxyRequest {
            kind: "cmd".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: Some("connect %h %p".to_string()),
        });
        assert!(validate_open_request(&req).is_ok());
    }

    #[test]
    fn validates_session_jump_hosts() {
        let mut req = valid_req();
        req.jump_hosts = Some(vec![JumpHostRequest {
            host: "bastion.internal".to_string(),
            port: Some(22),
            user: "ops".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            strict_host_key: Some(false),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: Some(5_000),
            server_alive_interval_ms: Some(15_000),
            server_alive_count_max: Some(4),
        }]);
        assert!(validate_open_request(&req).is_ok());

        req.jump_hosts.as_mut().unwrap()[0].host.clear();
        assert!(validate_open_request(&req).is_err());
    }

    #[test]
    fn expands_tilde_private_key_paths() {
        assert!(expand_private_key_path("~/.ssh/id_ed25519")
            .ends_with(PathBuf::from(".ssh").join("id_ed25519")));
        assert_eq!(
            expand_private_key_path("/tmp/key"),
            PathBuf::from("/tmp/key")
        );
    }

    #[test]
    fn rejects_missing_private_key_before_auth() {
        let mut req = valid_req();
        req.password = None;
        req.private_key_path = Some(format!("/tmp/relay-missing-key-{}", std::process::id()));

        let err = validate_private_key_path_for_auth(&req).expect_err("missing key rejected");

        assert!(err.to_string().contains("failed to read private key"));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_too_open_private_key_permissions_before_auth() {
        let path = temp_key_path("open");
        fs::write(&path, "PRIVATE KEY").expect("write private key");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644))
            .expect("set open permissions");
        let mut req = valid_req();
        req.password = None;
        req.private_key_path = Some(path.to_string_lossy().to_string());

        let err = validate_private_key_path_for_auth(&req).expect_err("open key rejected");

        assert!(err.to_string().contains("permissions 644"));
        assert!(err.to_string().contains("chmod 600"));
        fs::remove_dir_all(path.parent().expect("key parent")).expect("cleanup");
    }

    #[tokio::test]
    async fn rejects_unknown_host_key_when_strict_without_trust() {
        let key = russh::keys::parse_public_key_base64(
            "AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ",
        )
        .expect("parse key");
        let mut client = RelayClient {
            host: format!("relay-unknown-{}.invalid", std::process::id()),
            port: 22,
            strict_host_key: true,
            trust_unknown_host_key: false,
        };

        let err = client
            .check_server_key(&key)
            .await
            .expect_err("unknown key rejected");
        assert!(err.to_string().contains("Unknown server key"));
        assert!(err.to_string().contains(&public_key_fingerprint(&key)));
    }
}
