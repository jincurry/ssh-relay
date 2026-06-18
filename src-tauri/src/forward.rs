use crate::ssh::auth::{authenticate_with_fallbacks, expand_private_key_path, SshAuth};
use crate::ssh::known_hosts::{check_host_key, learn_host_key, HostKeyStatus};
use crate::ssh::transport::{
    client_config, open_ssh_transport, validate_jump_hosts, validate_proxy_request,
    JumpHostRequest, ProxyRequest,
};
use crate::AppState;
use anyhow::{anyhow, bail, Context, Result};
use russh::client;
use russh::{Channel, ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::net::SocketAddr;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::State;
use tokio::io::{self, AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardRule {
    id: String,
    kind: String,
    bind_host: String,
    bind_port: u16,
    target_host: String,
    target_port: u16,
    display: String,
    active: bool,
    started_at_ms: u128,
}

#[tauri::command]
pub fn list_forwards(state: State<'_, AppState>) -> Vec<ForwardRule> {
    state.forwards.snapshot()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartForwardRequest {
    kind: String,
    bind_host: Option<String>,
    bind_port: u16,
    target_host: Option<String>,
    target_port: Option<u16>,
    ssh: Option<ForwardSshRequest>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ForwardSshRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[tauri::command]
pub async fn start_forward(
    state: State<'_, AppState>,
    req: StartForwardRequest,
) -> Result<ForwardRule, String> {
    let spec = ForwardSpec::try_from(req).map_err(to_string)?;
    state.forwards.start(spec).await.map_err(to_string)
}

#[tauri::command]
pub async fn stop_forward(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.forwards.stop(&id).await.map_err(to_string)
}

#[derive(Default)]
pub struct ForwardRegistry {
    rules: parking_lot::Mutex<HashMap<String, RunningForward>>,
}

struct RunningForward {
    rule: ForwardRule,
    task: JoinHandle<()>,
    stop: Option<oneshot::Sender<()>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ForwardSpec {
    kind: String,
    bind_host: String,
    bind_port: u16,
    target_host: String,
    target_port: u16,
    ssh: Option<ForwardSshRequest>,
}

impl ForwardRegistry {
    pub fn snapshot(&self) -> Vec<ForwardRule> {
        let mut rules: Vec<_> = self
            .rules
            .lock()
            .values()
            .map(|entry| {
                let mut rule = entry.rule.clone();
                rule.active = !entry.task.is_finished();
                rule
            })
            .collect();
        rules.sort_by(|a, b| a.started_at_ms.cmp(&b.started_at_ms));
        rules
    }

    async fn start(&self, spec: ForwardSpec) -> Result<ForwardRule> {
        if spec.kind == "R" {
            return self.start_remote(spec).await;
        }
        if spec.kind == "L" && spec.ssh.is_some() {
            return self.start_local_ssh(spec).await;
        }
        if spec.kind == "D" && spec.ssh.is_some() {
            return self.start_dynamic_ssh(spec).await;
        }

        let listener = TcpListener::bind((spec.bind_host.as_str(), spec.bind_port))
            .await
            .with_context(|| format!("failed to bind {}:{}", spec.bind_host, spec.bind_port))?;
        let local_addr = listener
            .local_addr()
            .context("failed to read listener address")?;
        let id = Uuid::new_v4().to_string();
        let started_at_ms = now_ms();
        let bind_host = normalize_bound_host(&spec.bind_host, local_addr);
        let bind_port = local_addr.port();
        let display = display_rule(
            &spec.kind,
            local_addr.port(),
            &spec.target_host,
            spec.target_port,
        );
        let target = ForwardTarget::from_spec(&spec);
        let rule = ForwardRule {
            id: id.clone(),
            kind: spec.kind.clone(),
            bind_host,
            bind_port,
            target_host: spec.target_host.clone(),
            target_port: spec.target_port,
            display,
            active: true,
            started_at_ms,
        };

        let target = Arc::new(target);
        let task = tokio::spawn(async move {
            accept_loop(listener, target).await;
        });

        self.rules.lock().insert(
            id,
            RunningForward {
                rule: rule.clone(),
                task,
                stop: None,
            },
        );
        Ok(rule)
    }

    async fn start_local_ssh(&self, spec: ForwardSpec) -> Result<ForwardRule> {
        let ssh = spec.ssh.clone().ok_or_else(|| {
            anyhow!("local -L SSH forwarding requires SSH authentication details")
        })?;
        validate_ssh_request(&ssh)?;
        validate_private_key_path_for_auth(&ssh)?;

        let listener = TcpListener::bind((spec.bind_host.as_str(), spec.bind_port))
            .await
            .with_context(|| format!("failed to bind {}:{}", spec.bind_host, spec.bind_port))?;
        let local_addr = listener
            .local_addr()
            .context("failed to read listener address")?;
        let bind_host = normalize_bound_host(&spec.bind_host, local_addr);
        let bind_port = local_addr.port();
        let ssh_session = connect_forward_session(&ssh, &spec).await?;
        let ssh_session = Arc::new(AsyncMutex::new(ssh_session));

        let id = Uuid::new_v4().to_string();
        let started_at_ms = now_ms();
        let rule = ForwardRule {
            id: id.clone(),
            kind: spec.kind.clone(),
            bind_host,
            bind_port,
            target_host: spec.target_host.clone(),
            target_port: spec.target_port,
            display: display_rule("L", bind_port, &spec.target_host, spec.target_port),
            active: true,
            started_at_ms,
        };

        let target_host = spec.target_host.clone();
        let target_port = spec.target_port;
        let (stop_tx, stop_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            accept_ssh_direct_loop(listener, ssh_session, target_host, target_port, stop_rx).await;
        });

        self.rules.lock().insert(
            id,
            RunningForward {
                rule: rule.clone(),
                task,
                stop: Some(stop_tx),
            },
        );
        Ok(rule)
    }

    async fn start_dynamic_ssh(&self, spec: ForwardSpec) -> Result<ForwardRule> {
        let ssh = spec.ssh.clone().ok_or_else(|| {
            anyhow!("dynamic -D SSH forwarding requires SSH authentication details")
        })?;
        validate_ssh_request(&ssh)?;
        validate_private_key_path_for_auth(&ssh)?;

        let listener = TcpListener::bind((spec.bind_host.as_str(), spec.bind_port))
            .await
            .with_context(|| format!("failed to bind {}:{}", spec.bind_host, spec.bind_port))?;
        let local_addr = listener
            .local_addr()
            .context("failed to read listener address")?;
        let bind_host = normalize_bound_host(&spec.bind_host, local_addr);
        let bind_port = local_addr.port();
        let ssh_session = connect_forward_session(&ssh, &spec).await?;
        let ssh_session = Arc::new(AsyncMutex::new(ssh_session));

        let id = Uuid::new_v4().to_string();
        let started_at_ms = now_ms();
        let rule = ForwardRule {
            id: id.clone(),
            kind: spec.kind.clone(),
            bind_host,
            bind_port,
            target_host: String::new(),
            target_port: 0,
            display: display_rule("D", bind_port, "", 0),
            active: true,
            started_at_ms,
        };

        let (stop_tx, stop_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            accept_ssh_socks_loop(listener, ssh_session, stop_rx).await;
        });

        self.rules.lock().insert(
            id,
            RunningForward {
                rule: rule.clone(),
                task,
                stop: Some(stop_tx),
            },
        );
        Ok(rule)
    }

    async fn start_remote(&self, spec: ForwardSpec) -> Result<ForwardRule> {
        let ssh = spec
            .ssh
            .clone()
            .ok_or_else(|| anyhow!("remote -R forwarding requires SSH authentication details"))?;
        validate_ssh_request(&ssh)?;
        validate_private_key_path_for_auth(&ssh)?;

        let ssh_session = connect_forward_session(&ssh, &spec).await?;
        let requested_port = spec.bind_port as u32;
        let allocated = ssh_session
            .tcpip_forward(spec.bind_host.clone(), requested_port)
            .await
            .with_context(|| {
                format!(
                    "failed to request remote forward {}:{}",
                    spec.bind_host, spec.bind_port
                )
            })?;
        let bind_port = if requested_port == 0 {
            allocated as u16
        } else {
            spec.bind_port
        };

        let id = Uuid::new_v4().to_string();
        let started_at_ms = now_ms();
        let rule = ForwardRule {
            id: id.clone(),
            kind: spec.kind.clone(),
            bind_host: spec.bind_host.clone(),
            bind_port,
            target_host: spec.target_host.clone(),
            target_port: spec.target_port,
            display: display_rule("R", bind_port, &spec.target_host, spec.target_port),
            active: true,
            started_at_ms,
        };

        let (stop_tx, stop_rx) = oneshot::channel();
        let task = tokio::spawn(async move {
            let _ = stop_rx.await;
            let _ = ssh_session
                .cancel_tcpip_forward(spec.bind_host, bind_port as u32)
                .await;
            let _ = ssh_session
                .disconnect(Disconnect::ByApplication, "", "English")
                .await;
        });

        self.rules.lock().insert(
            id,
            RunningForward {
                rule: rule.clone(),
                task,
                stop: Some(stop_tx),
            },
        );
        Ok(rule)
    }

    async fn stop(&self, id: &str) -> Result<()> {
        let mut entry = self
            .rules
            .lock()
            .remove(id)
            .ok_or_else(|| anyhow!("unknown forward rule"))?;
        if let Some(stop) = entry.stop.take() {
            let _ = stop.send(());
            let _ = tokio::time::timeout(Duration::from_secs(2), entry.task).await;
        } else {
            entry.task.abort();
        }
        Ok(())
    }
}

impl Drop for ForwardRegistry {
    fn drop(&mut self) {
        for (_, mut entry) in self.rules.get_mut().drain() {
            if let Some(stop) = entry.stop.take() {
                let _ = stop.send(());
            }
            entry.task.abort();
        }
    }
}

impl Clone for ForwardRule {
    fn clone(&self) -> Self {
        Self {
            id: self.id.clone(),
            kind: self.kind.clone(),
            bind_host: self.bind_host.clone(),
            bind_port: self.bind_port,
            target_host: self.target_host.clone(),
            target_port: self.target_port,
            display: self.display.clone(),
            active: self.active,
            started_at_ms: self.started_at_ms,
        }
    }
}

impl TryFrom<StartForwardRequest> for ForwardSpec {
    type Error = anyhow::Error;

    fn try_from(req: StartForwardRequest) -> Result<Self> {
        let bind_host = req.bind_host.unwrap_or_else(|| "127.0.0.1".to_string());
        validate_endpoint("bindHost", &bind_host)?;
        let (target_host, target_port) = match req.kind.as_str() {
            "L" | "R" => {
                let target_host = req.target_host.unwrap_or_default();
                let target_port = req.target_port.unwrap_or(0);
                validate_endpoint("targetHost", &target_host)?;
                validate_port("targetPort", target_port)?;
                (target_host, target_port)
            }
            "D" => (String::new(), 0),
            other => bail!("unsupported forward kind {other}; expected L, R, or D"),
        };

        Ok(Self {
            kind: req.kind,
            bind_host,
            bind_port: req.bind_port,
            target_host,
            target_port,
            ssh: req.ssh,
        })
    }
}

#[derive(Clone)]
struct RemoteForwardClient {
    host: String,
    port: u16,
    strict_host_key: bool,
    trust_unknown_host_key: bool,
    target_host: String,
    target_port: u16,
}

#[derive(Debug, thiserror::Error)]
enum RemoteForwardClientError {
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

impl client::Handler for RemoteForwardClient {
    type Error = RemoteForwardClientError;

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
                        RemoteForwardClientError::KnownHosts {
                            host: self.host.clone(),
                            port: self.port,
                            message: err.to_string(),
                        }
                    })?;
                    Ok(true)
                } else {
                    Err(RemoteForwardClientError::UnknownHostKey {
                        host: self.host.clone(),
                        port: self.port,
                        fingerprint,
                    })
                }
            }
            Ok(HostKeyStatus::Changed { line, fingerprint }) => {
                Err(RemoteForwardClientError::HostKeyChanged {
                    host: self.host.clone(),
                    port: self.port,
                    line,
                    fingerprint,
                })
            }
            Err(err) => Err(RemoteForwardClientError::KnownHosts {
                host: self.host.clone(),
                port: self.port,
                message: err.to_string(),
            }),
        }
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<client::Msg>,
        _connected_address: &str,
        _connected_port: u32,
        originator_address: &str,
        originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let target_host = self.target_host.clone();
        let target_port = self.target_port;
        let origin = format!("{originator_address}:{originator_port}");
        tokio::spawn(async move {
            if let Err(err) = relay_forwarded_channel(channel, &target_host, target_port).await {
                eprintln!("remote forward channel from {origin} failed: {err:#}");
            }
        });
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ForwardTarget {
    Local { host: String, port: u16 },
    DynamicSocks,
}

impl ForwardTarget {
    fn from_spec(spec: &ForwardSpec) -> Self {
        match spec.kind.as_str() {
            "D" => Self::DynamicSocks,
            _ => Self::Local {
                host: spec.target_host.clone(),
                port: spec.target_port,
            },
        }
    }
}

async fn accept_loop(listener: TcpListener, target: Arc<ForwardTarget>) {
    loop {
        let accepted = listener.accept().await;
        let (client, _) = match accepted {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("forward accept failed: {err}");
                break;
            }
        };
        let target = Arc::clone(&target);
        tokio::spawn(async move {
            if let Err(err) = relay_forward(client, &target).await {
                eprintln!("forward relay failed: {err:#}");
            }
        });
    }
}

async fn relay_forward(client: TcpStream, target: &ForwardTarget) -> Result<()> {
    match target {
        ForwardTarget::Local { host, port } => relay_connection(client, host, *port).await,
        ForwardTarget::DynamicSocks => relay_socks5(client).await,
    }
}

async fn relay_connection(
    mut client: TcpStream,
    target_host: &str,
    target_port: u16,
) -> Result<()> {
    let mut upstream = TcpStream::connect((target_host, target_port))
        .await
        .with_context(|| format!("failed to connect forward target {target_host}:{target_port}"))?;
    io::copy_bidirectional(&mut client, &mut upstream)
        .await
        .context("failed to relay bytes")?;
    Ok(())
}

async fn relay_socks5(mut client: TcpStream) -> Result<()> {
    let request = read_socks5_request(&mut client).await?;
    let mut upstream = match TcpStream::connect((request.host.as_str(), request.port)).await {
        Ok(stream) => stream,
        Err(err) => {
            let _ = write_socks5_reply(&mut client, 0x05).await;
            return Err(err).with_context(|| {
                format!(
                    "failed to connect SOCKS target {}:{}",
                    request.host, request.port
                )
            });
        }
    };

    write_socks5_reply(&mut client, 0x00).await?;
    io::copy_bidirectional(&mut client, &mut upstream)
        .await
        .context("failed to relay SOCKS bytes")?;
    Ok(())
}

async fn accept_ssh_direct_loop(
    listener: TcpListener,
    ssh_session: Arc<AsyncMutex<client::Handle<RemoteForwardClient>>>,
    target_host: String,
    target_port: u16,
    mut stop: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            _ = &mut stop => {
                let session = ssh_session.lock().await;
                let _ = session.disconnect(Disconnect::ByApplication, "", "English").await;
                break;
            }
            accepted = listener.accept() => {
                let (client, origin) = match accepted {
                    Ok(pair) => pair,
                    Err(err) => {
                        eprintln!("ssh direct forward accept failed: {err}");
                        break;
                    }
                };
                let ssh_session = Arc::clone(&ssh_session);
                let target_host = target_host.clone();
                tokio::spawn(async move {
                    if let Err(err) = relay_ssh_direct_client(
                        client,
                        ssh_session,
                        target_host,
                        target_port,
                        origin,
                    ).await {
                        eprintln!("ssh direct forward relay failed: {err:#}");
                    }
                });
            }
        }
    }
}

async fn accept_ssh_socks_loop(
    listener: TcpListener,
    ssh_session: Arc<AsyncMutex<client::Handle<RemoteForwardClient>>>,
    mut stop: oneshot::Receiver<()>,
) {
    loop {
        tokio::select! {
            _ = &mut stop => {
                let session = ssh_session.lock().await;
                let _ = session.disconnect(Disconnect::ByApplication, "", "English").await;
                break;
            }
            accepted = listener.accept() => {
                let (client, origin) = match accepted {
                    Ok(pair) => pair,
                    Err(err) => {
                        eprintln!("ssh SOCKS accept failed: {err}");
                        break;
                    }
                };
                let ssh_session = Arc::clone(&ssh_session);
                tokio::spawn(async move {
                    if let Err(err) = relay_ssh_socks_client(client, ssh_session, origin).await {
                        eprintln!("ssh SOCKS relay failed: {err:#}");
                    }
                });
            }
        }
    }
}

async fn relay_ssh_direct_client(
    client: TcpStream,
    ssh_session: Arc<AsyncMutex<client::Handle<RemoteForwardClient>>>,
    target_host: String,
    target_port: u16,
    origin: SocketAddr,
) -> Result<()> {
    let channel = {
        let session = ssh_session.lock().await;
        session
            .channel_open_direct_tcpip(
                target_host.clone(),
                target_port as u32,
                origin.ip().to_string(),
                origin.port() as u32,
            )
            .await
            .with_context(|| {
                format!("failed to open SSH direct-tcpip channel to {target_host}:{target_port}")
            })?
    };
    relay_tcp_and_channel(
        client,
        channel,
        "local forward client",
        "SSH direct-tcpip channel",
    )
    .await
}

async fn relay_ssh_socks_client(
    mut client: TcpStream,
    ssh_session: Arc<AsyncMutex<client::Handle<RemoteForwardClient>>>,
    origin: SocketAddr,
) -> Result<()> {
    let request = read_socks5_request(&mut client).await?;
    let channel_result = {
        let session = ssh_session.lock().await;
        session
            .channel_open_direct_tcpip(
                request.host.clone(),
                request.port as u32,
                origin.ip().to_string(),
                origin.port() as u32,
            )
            .await
    };

    let channel = match channel_result {
        Ok(channel) => {
            write_socks5_reply(&mut client, 0x00).await?;
            channel
        }
        Err(err) => {
            let _ = write_socks5_reply(&mut client, 0x05).await;
            return Err(err).with_context(|| {
                format!(
                    "failed to open SSH direct-tcpip SOCKS channel to {}:{}",
                    request.host, request.port
                )
            });
        }
    };

    relay_tcp_and_channel(
        client,
        channel,
        "SOCKS client",
        "SSH SOCKS direct-tcpip channel",
    )
    .await
}

async fn connect_forward_session(
    ssh: &ForwardSshRequest,
    spec: &ForwardSpec,
) -> Result<client::Handle<RemoteForwardClient>> {
    let port = ssh.port.unwrap_or(22);
    let config = client_config(ssh.server_alive_interval_ms, ssh.server_alive_count_max);
    let handler = RemoteForwardClient {
        host: ssh.host.clone(),
        port,
        strict_host_key: ssh.strict_host_key.unwrap_or(true),
        trust_unknown_host_key: ssh.trust_unknown_host_key.unwrap_or(false),
        target_host: spec.target_host.clone(),
        target_port: spec.target_port,
    };
    let stream = open_ssh_transport(
        &ssh.host,
        port,
        ssh.proxy.as_ref(),
        ssh.jump_hosts.as_deref(),
        ssh.connect_timeout_ms.unwrap_or(30_000),
    )
    .await
    .with_context(|| format!("failed to connect to {}:{port}", ssh.host))?;
    let mut session = client::connect_stream(config, stream, handler)
        .await
        .with_context(|| format!("failed to connect to {}:{port}", ssh.host))?;

    authenticate_remote_forward(&mut session, ssh).await?;
    Ok(session)
}

async fn authenticate_remote_forward(
    session: &mut client::Handle<RemoteForwardClient>,
    ssh: &ForwardSshRequest,
) -> Result<()> {
    authenticate_with_fallbacks(
        session,
        SshAuth {
            user: &ssh.user,
            password: ssh.password.as_deref(),
            private_key_path: ssh.private_key_path.as_deref(),
            private_key_passphrase: ssh.private_key_passphrase.as_deref(),
            totp_code: ssh.totp_code.as_deref(),
            rejected_message: "SSH authentication rejected by server",
        },
    )
    .await
}

async fn relay_forwarded_channel(
    channel: Channel<client::Msg>,
    target_host: &str,
    target_port: u16,
) -> Result<()> {
    let upstream = TcpStream::connect((target_host, target_port))
        .await
        .with_context(|| {
            format!("failed to connect remote forward target {target_host}:{target_port}")
        })?;
    relay_tcp_and_channel(
        upstream,
        channel,
        "remote forward target",
        "remote forward channel",
    )
    .await
}

async fn relay_tcp_and_channel(
    mut stream: TcpStream,
    mut channel: Channel<client::Msg>,
    stream_label: &str,
    channel_label: &str,
) -> Result<()> {
    let mut stream_closed = false;
    let mut buf = vec![0_u8; 64 * 1024];

    loop {
        tokio::select! {
            read = stream.read(&mut buf), if !stream_closed => {
                match read {
                    Ok(0) => {
                        stream_closed = true;
                        channel.eof().await.with_context(|| format!("failed to close {channel_label} input"))?;
                    }
                    Ok(n) => {
                        channel.data(&buf[..n]).await.with_context(|| format!("failed to write {channel_label} data"))?;
                    }
                    Err(err) => return Err(err).with_context(|| format!("failed to read {stream_label}")),
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        stream.write_all(&data).await.with_context(|| format!("failed to write {stream_label}"))?;
                    }
                    Some(ChannelMsg::Eof) | None => {
                        if !stream_closed {
                            channel.eof().await.ok();
                        }
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct SocksRequest {
    host: String,
    port: u16,
}

async fn read_socks5_request(client: &mut TcpStream) -> Result<SocksRequest> {
    let mut head = [0_u8; 2];
    client
        .read_exact(&mut head)
        .await
        .context("failed to read SOCKS greeting")?;
    if head[0] != 0x05 {
        bail!("unsupported SOCKS version {}", head[0]);
    }
    let mut methods = vec![0_u8; head[1] as usize];
    client
        .read_exact(&mut methods)
        .await
        .context("failed to read SOCKS auth methods")?;
    if !methods.contains(&0x00) {
        client.write_all(&[0x05, 0xff]).await.ok();
        bail!("SOCKS client does not support no-auth method");
    }
    client
        .write_all(&[0x05, 0x00])
        .await
        .context("failed to write SOCKS greeting response")?;

    let mut req = [0_u8; 4];
    client
        .read_exact(&mut req)
        .await
        .context("failed to read SOCKS request header")?;
    if req[0] != 0x05 {
        bail!("unsupported SOCKS request version {}", req[0]);
    }
    if req[1] != 0x01 {
        write_socks5_reply(client, 0x07).await.ok();
        bail!("only SOCKS CONNECT command is supported");
    }

    let host = match req[3] {
        0x01 => {
            let mut octets = [0_u8; 4];
            client
                .read_exact(&mut octets)
                .await
                .context("failed to read SOCKS IPv4 address")?;
            std::net::Ipv4Addr::from(octets).to_string()
        }
        0x03 => {
            let mut len = [0_u8; 1];
            client
                .read_exact(&mut len)
                .await
                .context("failed to read SOCKS domain length")?;
            let mut name = vec![0_u8; len[0] as usize];
            client
                .read_exact(&mut name)
                .await
                .context("failed to read SOCKS domain")?;
            String::from_utf8(name).context("SOCKS domain is not UTF-8")?
        }
        0x04 => {
            let mut octets = [0_u8; 16];
            client
                .read_exact(&mut octets)
                .await
                .context("failed to read SOCKS IPv6 address")?;
            std::net::Ipv6Addr::from(octets).to_string()
        }
        atyp => {
            write_socks5_reply(client, 0x08).await.ok();
            bail!("unsupported SOCKS address type {atyp}");
        }
    };
    let mut port_bytes = [0_u8; 2];
    client
        .read_exact(&mut port_bytes)
        .await
        .context("failed to read SOCKS port")?;
    let port = u16::from_be_bytes(port_bytes);
    if port == 0 {
        write_socks5_reply(client, 0x04).await.ok();
        bail!("SOCKS target port is required");
    }

    Ok(SocksRequest { host, port })
}

async fn write_socks5_reply(client: &mut TcpStream, code: u8) -> Result<()> {
    client
        .write_all(&[0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await
        .context("failed to write SOCKS reply")
}

fn validate_endpoint(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("{label} is required");
    }
    if value.chars().any(char::is_whitespace) {
        bail!("{label} must not contain whitespace");
    }
    Ok(())
}

fn validate_port(label: &str, port: u16) -> Result<()> {
    if port == 0 {
        bail!("{label} is required");
    }
    Ok(())
}

fn validate_ssh_request(req: &ForwardSshRequest) -> Result<()> {
    validate_endpoint("ssh.host", &req.host)?;
    if req.user.trim().is_empty() {
        bail!("ssh.user is required");
    }
    if req.password.as_deref().unwrap_or("").is_empty()
        && req.private_key_path.as_deref().unwrap_or("").is_empty()
    {
        bail!("remote -R forwarding requires password or privateKeyPath");
    }
    if let Some(proxy) = &req.proxy {
        validate_proxy_request(proxy)?;
    }
    if let Some(jump_hosts) = &req.jump_hosts {
        validate_jump_hosts(jump_hosts)?;
    }
    Ok(())
}

fn validate_private_key_path_for_auth(req: &ForwardSshRequest) -> Result<()> {
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

fn display_rule(kind: &str, bind_port: u16, target_host: &str, target_port: u16) -> String {
    match kind {
        "L" => format!("localhost:{bind_port} -> {target_host}:{target_port}"),
        "R" => format!("remote:{bind_port} -> {target_host}:{target_port}"),
        "D" => format!("localhost:{bind_port} -> SOCKS5"),
        _ => format!("{kind} localhost:{bind_port} -> {target_host}:{target_port}"),
    }
}

fn normalize_bound_host(requested: &str, bound: SocketAddr) -> String {
    if requested == "0.0.0.0" || requested == "::" {
        requested.to_string()
    } else {
        bound.ip().to_string()
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_millis()
}

fn to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    fn start_req(target_port: u16) -> StartForwardRequest {
        StartForwardRequest {
            kind: "L".to_string(),
            bind_host: Some("127.0.0.1".to_string()),
            bind_port: 0,
            target_host: Some("127.0.0.1".to_string()),
            target_port: Some(target_port),
            ssh: None,
        }
    }

    fn dynamic_req() -> StartForwardRequest {
        StartForwardRequest {
            kind: "D".to_string(),
            bind_host: Some("127.0.0.1".to_string()),
            bind_port: 0,
            target_host: None,
            target_port: None,
            ssh: None,
        }
    }

    fn remote_req(target_port: u16) -> StartForwardRequest {
        StartForwardRequest {
            kind: "R".to_string(),
            bind_host: Some("127.0.0.1".to_string()),
            bind_port: 0,
            target_host: Some("127.0.0.1".to_string()),
            target_port: Some(target_port),
            ssh: None,
        }
    }

    fn ssh_req() -> ForwardSshRequest {
        ForwardSshRequest {
            host: "127.0.0.1".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            strict_host_key: Some(false),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        }
    }

    #[test]
    fn validates_local_forward_spec() {
        let spec = ForwardSpec::try_from(start_req(8080)).expect("valid -L forward");
        assert_eq!(spec.kind, "L");
        assert_eq!(spec.bind_host, "127.0.0.1");
        assert_eq!(spec.bind_port, 0);
        assert_eq!(spec.target_host, "127.0.0.1");
        assert_eq!(spec.target_port, 8080);
        assert_eq!(spec.ssh, None);
    }

    #[test]
    fn preserves_ssh_auth_for_local_forward_spec() {
        let mut req = start_req(8080);
        let mut ssh = ssh_req();
        ssh.proxy = Some(ProxyRequest {
            kind: "socks5".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(1080),
            username: None,
            password: None,
            cmd: None,
        });
        req.ssh = Some(ssh);

        let spec = ForwardSpec::try_from(req).expect("valid SSH-backed -L forward");

        assert_eq!(spec.kind, "L");
        assert_eq!(spec.target_host, "127.0.0.1");
        assert_eq!(spec.target_port, 8080);
        let ssh = spec.ssh.expect("ssh config");
        assert_eq!(ssh.user, "deploy");
        assert_eq!(ssh.proxy.expect("proxy").kind, "socks5");
    }

    #[test]
    fn validates_forward_ssh_proxy_settings() {
        let mut ssh = ssh_req();
        ssh.proxy = Some(ProxyRequest {
            kind: "http".to_string(),
            host: None,
            port: Some(8080),
            username: None,
            password: None,
            cmd: None,
        });
        assert!(validate_ssh_request(&ssh).is_err());

        ssh.proxy = Some(ProxyRequest {
            kind: "cmd".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: Some("connect %h %p".to_string()),
        });
        assert!(validate_ssh_request(&ssh).is_ok());
    }

    #[test]
    fn validates_forward_ssh_jump_hosts() {
        let mut ssh = ssh_req();
        ssh.jump_hosts = Some(vec![JumpHostRequest {
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
        assert!(validate_ssh_request(&ssh).is_ok());

        ssh.jump_hosts.as_mut().unwrap()[0].user.clear();
        assert!(validate_ssh_request(&ssh).is_err());
    }

    #[test]
    fn validates_remote_forward_spec() {
        let spec = ForwardSpec::try_from(remote_req(8080)).expect("valid -R forward");
        assert_eq!(spec.kind, "R");
        assert_eq!(spec.bind_host, "127.0.0.1");
        assert_eq!(spec.bind_port, 0);
        assert_eq!(spec.target_host, "127.0.0.1");
        assert_eq!(spec.target_port, 8080);
    }

    #[test]
    fn validates_dynamic_socks_spec() {
        let spec = ForwardSpec::try_from(dynamic_req()).expect("valid -D forward");
        assert_eq!(spec.kind, "D");
        assert_eq!(spec.bind_host, "127.0.0.1");
        assert_eq!(spec.bind_port, 0);
        assert_eq!(spec.target_host, "");
        assert_eq!(spec.target_port, 0);
    }

    #[test]
    fn preserves_ssh_auth_for_dynamic_socks_spec() {
        let mut req = dynamic_req();
        req.ssh = Some(ssh_req());

        let spec = ForwardSpec::try_from(req).expect("valid SSH-backed -D forward");

        assert_eq!(spec.kind, "D");
        assert_eq!(spec.target_host, "");
        assert_eq!(spec.target_port, 0);
        assert_eq!(spec.ssh.expect("ssh config").user, "deploy");
    }

    #[test]
    fn rejects_unknown_forward_kinds() {
        let mut req = start_req(8080);
        req.kind = "X".to_string();
        let err = ForwardSpec::try_from(req).expect_err("unknown forward kind is invalid");
        assert!(err.to_string().contains("unsupported forward kind X"));
    }

    #[test]
    fn rejects_missing_target() {
        let mut req = start_req(0);
        req.target_host = Some("".to_string());
        let err = ForwardSpec::try_from(req).expect_err("empty target host is invalid");
        assert!(err.to_string().contains("targetHost is required"));
    }

    #[tokio::test]
    async fn snapshot_marks_finished_forward_tasks_inactive() {
        let registry = ForwardRegistry::default();
        let id = "finished-forward".to_string();
        let task = tokio::spawn(async {});

        registry.rules.lock().insert(
            id.clone(),
            RunningForward {
                rule: ForwardRule {
                    id: id.clone(),
                    kind: "L".to_string(),
                    bind_host: "127.0.0.1".to_string(),
                    bind_port: 15432,
                    target_host: "127.0.0.1".to_string(),
                    target_port: 5432,
                    display: "localhost:15432 -> 127.0.0.1:5432".to_string(),
                    active: true,
                    started_at_ms: 1,
                },
                task,
                stop: None,
            },
        );

        tokio::task::yield_now().await;
        let snapshot = registry.snapshot();
        assert_eq!(snapshot.len(), 1);
        assert!(!snapshot[0].active);
    }

    #[tokio::test]
    async fn starts_lists_relays_and_stops_local_forward() {
        let echo = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind echo server");
        let echo_port = echo.local_addr().expect("echo addr").port();
        let echo_task = tokio::spawn(async move {
            let (mut socket, _) = echo.accept().await.expect("accept echo client");
            let mut buf = [0_u8; 64];
            let n = socket.read(&mut buf).await.expect("read echo bytes");
            socket.write_all(&buf[..n]).await.expect("write echo bytes");
        });

        let registry = ForwardRegistry::default();
        let rule = registry
            .start(ForwardSpec::try_from(start_req(echo_port)).expect("valid forward"))
            .await
            .expect("start forward");
        assert_eq!(registry.snapshot().len(), 1);
        assert_eq!(rule.kind, "L");
        assert!(rule.bind_port > 0);

        let mut client = TcpStream::connect(("127.0.0.1", rule.bind_port))
            .await
            .expect("connect to forward");
        client
            .write_all(b"relay")
            .await
            .expect("write through forward");
        let mut buf = [0_u8; 5];
        client
            .read_exact(&mut buf)
            .await
            .expect("read through forward");
        assert_eq!(&buf, b"relay");

        registry.stop(&rule.id).await.expect("stop forward");
        assert!(registry.snapshot().is_empty());
        echo_task.await.expect("echo task");
    }

    #[tokio::test]
    async fn rejects_remote_forward_start_without_ssh_auth() {
        let registry = ForwardRegistry::default();
        let result = registry
            .start(ForwardSpec::try_from(remote_req(8080)).expect("valid remote forward"))
            .await;
        let err = match result {
            Ok(_) => panic!("remote forward without auth should be invalid"),
            Err(err) => err,
        };

        assert!(err.to_string().contains("requires SSH authentication"));
    }

    #[test]
    fn validates_remote_forward_ssh_auth() {
        let mut req = ssh_req();
        assert!(validate_ssh_request(&req).is_ok());

        req.password = None;
        req.private_key_path = None;
        let err = validate_ssh_request(&req).expect_err("auth is required");
        assert!(err.to_string().contains("password or privateKeyPath"));
    }

    #[tokio::test]
    async fn starts_dynamic_socks_and_relays_connect_requests() {
        let echo = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("bind echo server");
        let echo_port = echo.local_addr().expect("echo addr").port();
        let echo_task = tokio::spawn(async move {
            let (mut socket, _) = echo.accept().await.expect("accept echo client");
            let mut buf = [0_u8; 64];
            let n = socket.read(&mut buf).await.expect("read echo bytes");
            socket.write_all(&buf[..n]).await.expect("write echo bytes");
        });

        let registry = ForwardRegistry::default();
        let rule = registry
            .start(ForwardSpec::try_from(dynamic_req()).expect("valid dynamic forward"))
            .await
            .expect("start dynamic forward");
        assert_eq!(rule.kind, "D");
        assert_eq!(
            rule.display,
            format!("localhost:{} -> SOCKS5", rule.bind_port)
        );

        let mut client = TcpStream::connect(("127.0.0.1", rule.bind_port))
            .await
            .expect("connect to socks forward");
        client
            .write_all(&[0x05, 0x01, 0x00])
            .await
            .expect("write greeting");
        let mut greeting = [0_u8; 2];
        client
            .read_exact(&mut greeting)
            .await
            .expect("read greeting response");
        assert_eq!(greeting, [0x05, 0x00]);

        let mut request = vec![0x05, 0x01, 0x00, 0x03, 9];
        request.extend_from_slice(b"127.0.0.1");
        request.extend_from_slice(&echo_port.to_be_bytes());
        client
            .write_all(&request)
            .await
            .expect("write connect request");
        let mut reply = [0_u8; 10];
        client
            .read_exact(&mut reply)
            .await
            .expect("read connect response");
        assert_eq!(reply[0], 0x05);
        assert_eq!(reply[1], 0x00);

        client
            .write_all(b"socks")
            .await
            .expect("write through socks");
        let mut buf = [0_u8; 5];
        client
            .read_exact(&mut buf)
            .await
            .expect("read through socks");
        assert_eq!(&buf, b"socks");

        registry.stop(&rule.id).await.expect("stop dynamic forward");
        echo_task.await.expect("echo task");
    }
}
