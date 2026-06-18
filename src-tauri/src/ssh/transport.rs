use crate::ssh::auth::{authenticate_with_fallbacks, expand_private_key_path, SshAuth};
use crate::ssh::known_hosts::{check_host_key, learn_host_key, HostKeyStatus};
use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use russh::client;
use russh::ChannelStream;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{Ipv4Addr, Ipv6Addr};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::Arc;
use std::task::{Context as TaskContext, Poll};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};
use tokio::net::TcpStream;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

pub trait AsyncSshStream: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> AsyncSshStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub type BoxedSshStream = Box<dyn AsyncSshStream>;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    pub kind: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub cmd: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHostRequest {
    pub host: String,
    pub port: Option<u16>,
    pub user: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub private_key_passphrase: Option<String>,
    pub totp_code: Option<String>,
    pub proxy: Option<ProxyRequest>,
    pub strict_host_key: Option<bool>,
    pub trust_unknown_host_key: Option<bool>,
    pub connect_timeout_ms: Option<u64>,
    pub server_alive_interval_ms: Option<u64>,
    pub server_alive_count_max: Option<usize>,
}

pub fn client_config(
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
) -> Arc<client::Config> {
    let server_alive_interval_ms = server_alive_interval_ms
        .filter(|value| *value > 0)
        .map(|value| value.clamp(1_000, 600_000));
    Arc::new(client::Config {
        inactivity_timeout: if server_alive_interval_ms.is_some() {
            None
        } else {
            Some(Duration::from_secs(30))
        },
        keepalive_interval: server_alive_interval_ms.map(Duration::from_millis),
        keepalive_max: server_alive_count_max.unwrap_or(3).min(20),
        nodelay: true,
        ..Default::default()
    })
}

pub async fn open_tcp_stream(
    target_host: &str,
    target_port: u16,
    proxy: Option<&ProxyRequest>,
    timeout_ms: u64,
) -> Result<TcpStream> {
    let timeout_ms = timeout_ms.clamp(100, 30_000);
    timeout(Duration::from_millis(timeout_ms), async {
        match proxy {
            Some(proxy) if proxy.kind == "socks5" || proxy.kind == "http" => {
                open_proxy_stream(target_host, target_port, proxy).await
            }
            Some(proxy) if proxy.kind == "cmd" => {
                bail!("ProxyCommand transport is process-backed; use open_ssh_transport instead")
            }
            _ => {
                let connect_host = normalize_host_literal(target_host);
                TcpStream::connect((connect_host.as_str(), target_port))
                    .await
                    .with_context(|| {
                        format!(
                            "failed to connect to {}",
                            format_host_port_authority(target_host, target_port)
                        )
                    })
            }
        }
    })
    .await
    .with_context(|| {
        format!(
            "timed out connecting to {} after {timeout_ms}ms",
            format_host_port_authority(target_host, target_port)
        )
    })?
}

pub async fn open_ssh_transport(
    target_host: &str,
    target_port: u16,
    proxy: Option<&ProxyRequest>,
    jump_hosts: Option<&[JumpHostRequest]>,
    timeout_ms: u64,
) -> Result<BoxedSshStream> {
    let timeout_ms = timeout_ms.clamp(100, 30_000);
    timeout(Duration::from_millis(timeout_ms), async {
        if let Some(jump_hosts) = jump_hosts.filter(|hosts| !hosts.is_empty()) {
            return open_jump_chain_transport(target_host, target_port, jump_hosts, timeout_ms)
                .await;
        }

        open_base_ssh_transport(target_host, target_port, proxy, timeout_ms).await
    })
    .await
    .with_context(|| {
        format!(
            "timed out connecting to {} after {timeout_ms}ms",
            format_host_port_authority(target_host, target_port)
        )
    })?
}

async fn open_base_ssh_transport(
    target_host: &str,
    target_port: u16,
    proxy: Option<&ProxyRequest>,
    timeout_ms: u64,
) -> Result<BoxedSshStream> {
    match proxy {
        Some(proxy) if proxy.kind == "cmd" => {
            open_proxy_command_stream(target_host, target_port, proxy).await
        }
        _ => {
            let stream = open_tcp_stream(target_host, target_port, proxy, timeout_ms).await?;
            let _ = stream.set_nodelay(true);
            Ok(Box::new(stream) as BoxedSshStream)
        }
    }
}

pub async fn open_proxy_stream(
    target_host: &str,
    target_port: u16,
    proxy: &ProxyRequest,
) -> Result<TcpStream> {
    validate_proxy_request(proxy)?;
    let proxy_host = normalize_host_literal(proxy.host.as_deref().unwrap_or_default());
    let proxy_port = proxy.port.unwrap_or_default();
    let proxy_authority = format_host_port_authority(&proxy_host, proxy_port);
    let mut stream = TcpStream::connect((proxy_host.as_str(), proxy_port))
        .await
        .with_context(|| format!("failed to connect to proxy {proxy_authority}"))?;
    match proxy.kind.as_str() {
        "socks5" => socks5_connect(&mut stream, target_host, target_port, proxy).await?,
        "http" => http_connect(&mut stream, target_host, target_port, proxy).await?,
        other => bail!("unsupported proxy transport: {other}"),
    }
    Ok(stream)
}

pub fn validate_proxy_request(proxy: &ProxyRequest) -> Result<()> {
    match proxy.kind.as_str() {
        "none" => Ok(()),
        "socks5" | "http" => {
            if proxy.host.as_deref().unwrap_or("").trim().is_empty() || proxy.port.is_none() {
                bail!("proxy host and port are required");
            }
            Ok(())
        }
        "cmd" => {
            let cmd = proxy.cmd.as_deref().unwrap_or("");
            if !cmd.contains("%h") || !cmd.contains("%p") {
                bail!("ProxyCommand must include %h and %p");
            }
            Ok(())
        }
        _ => bail!("unknown proxy type"),
    }
}

pub fn validate_jump_hosts(jump_hosts: &[JumpHostRequest]) -> Result<()> {
    for jump in jump_hosts {
        if jump.host.trim().is_empty() {
            bail!("jump host is required");
        }
        if jump.user.trim().is_empty() {
            bail!("jump user is required");
        }
        if jump.password.as_deref().unwrap_or("").is_empty()
            && jump
                .private_key_path
                .as_deref()
                .unwrap_or("")
                .trim()
                .is_empty()
        {
            bail!("jump password or privateKeyPath is required");
        }
        if let Some(proxy) = &jump.proxy {
            validate_proxy_request(proxy)?;
        }
        if let Some(path) = jump
            .private_key_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
        {
            validate_private_key_file(&expand_private_key_path(path))?;
        }
    }
    Ok(())
}

async fn open_jump_chain_transport(
    target_host: &str,
    target_port: u16,
    jump_hosts: &[JumpHostRequest],
    timeout_ms: u64,
) -> Result<BoxedSshStream> {
    validate_jump_hosts(jump_hosts)?;

    let mut sessions = Vec::with_capacity(jump_hosts.len());

    let first = &jump_hosts[0];
    let first_port = first.port.unwrap_or(22);
    let first_timeout_ms = jump_timeout_ms(first, timeout_ms);
    let first_stream = open_base_ssh_transport(
        &first.host,
        first_port,
        first.proxy.as_ref(),
        first_timeout_ms,
    )
    .await
    .with_context(|| format!("failed to connect to jump host {}:{first_port}", first.host))?;
    let mut current_session = connect_jump_session(first_stream, first).await?;

    for next in &jump_hosts[1..] {
        let next_port = next.port.unwrap_or(22);
        let next_timeout_ms = jump_timeout_ms(next, timeout_ms);
        let channel = timeout(
            Duration::from_millis(next_timeout_ms),
            current_session.channel_open_direct_tcpip(
                &next.host,
                u32::from(next_port),
                "127.0.0.1",
                0,
            ),
        )
        .await
        .with_context(|| {
            format!(
                "timed out opening SSH channel from jump host to {}:{next_port} after {next_timeout_ms}ms",
                next.host
            )
        })?
        .with_context(|| {
            format!(
                "failed to open SSH channel from jump host to {}:{next_port}",
                next.host
            )
        })?;
        sessions.push(current_session);
        current_session = connect_jump_session(Box::new(channel.into_stream()), next).await?;
    }

    let target_channel = timeout(
        Duration::from_millis(timeout_ms),
        current_session.channel_open_direct_tcpip(
            target_host,
            u32::from(target_port),
            "127.0.0.1",
            0,
        ),
    )
    .await
    .with_context(|| {
        format!(
            "timed out opening SSH channel from jump host to {target_host}:{target_port} after {timeout_ms}ms"
        )
    })?
    .with_context(|| {
        format!("failed to open SSH channel from jump host to {target_host}:{target_port}")
    })?;
    sessions.push(current_session);

    Ok(Box::new(JumpChainStream {
        stream: target_channel.into_stream(),
        _sessions: sessions,
    }) as BoxedSshStream)
}

fn jump_timeout_ms(jump: &JumpHostRequest, fallback_ms: u64) -> u64 {
    jump.connect_timeout_ms
        .unwrap_or(fallback_ms)
        .clamp(100, 30_000)
}

async fn connect_jump_session(
    stream: BoxedSshStream,
    jump: &JumpHostRequest,
) -> Result<client::Handle<TransportClient>> {
    let port = jump.port.unwrap_or(22);
    let config = client_config(jump.server_alive_interval_ms, jump.server_alive_count_max);
    let handler = TransportClient {
        host: jump.host.clone(),
        port,
        strict_host_key: jump.strict_host_key.unwrap_or(true),
        trust_unknown_host_key: jump.trust_unknown_host_key.unwrap_or(false),
    };
    let mut session = client::connect_stream(config, stream, handler)
        .await
        .with_context(|| {
            format!(
                "failed to start SSH session to jump host {}:{port}",
                jump.host
            )
        })?;
    authenticate_jump_session(&mut session, jump)
        .await
        .with_context(|| format!("failed to authenticate jump host {}:{port}", jump.host))?;
    Ok(session)
}

async fn authenticate_jump_session(
    session: &mut client::Handle<TransportClient>,
    jump: &JumpHostRequest,
) -> Result<()> {
    authenticate_with_fallbacks(
        session,
        SshAuth {
            user: &jump.user,
            password: jump.password.as_deref(),
            private_key_path: jump.private_key_path.as_deref(),
            private_key_passphrase: jump.private_key_passphrase.as_deref(),
            totp_code: jump.totp_code.as_deref(),
            rejected_message: "SSH authentication rejected by jump host",
        },
    )
    .await
}

struct JumpChainStream {
    stream: ChannelStream<client::Msg>,
    _sessions: Vec<client::Handle<TransportClient>>,
}

impl AsyncRead for JumpChainStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut TaskContext<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.stream).poll_read(cx, buf)
    }
}

impl AsyncWrite for JumpChainStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut TaskContext<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.stream).poll_write(cx, buf)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut TaskContext<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.stream).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: Pin<&mut Self>,
        cx: &mut TaskContext<'_>,
    ) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.stream).poll_shutdown(cx)
    }
}

struct TransportClient {
    host: String,
    port: u16,
    strict_host_key: bool,
    trust_unknown_host_key: bool,
}

#[derive(Debug, thiserror::Error)]
enum TransportClientError {
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

impl client::Handler for TransportClient {
    type Error = TransportClientError;

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
                        TransportClientError::KnownHosts {
                            host: self.host.clone(),
                            port: self.port,
                            message: err.to_string(),
                        }
                    })?;
                    Ok(true)
                } else {
                    Err(TransportClientError::UnknownHostKey {
                        host: self.host.clone(),
                        port: self.port,
                        fingerprint,
                    })
                }
            }
            Ok(HostKeyStatus::Changed { line, fingerprint }) => {
                Err(TransportClientError::HostKeyChanged {
                    host: self.host.clone(),
                    port: self.port,
                    line,
                    fingerprint,
                })
            }
            Err(err) => Err(TransportClientError::KnownHosts {
                host: self.host.clone(),
                port: self.port,
                message: err.to_string(),
            }),
        }
    }
}

async fn open_proxy_command_stream(
    target_host: &str,
    target_port: u16,
    proxy: &ProxyRequest,
) -> Result<BoxedSshStream> {
    validate_proxy_request(proxy)?;
    let rendered = render_proxy_command(
        proxy.cmd.as_deref().unwrap_or_default(),
        target_host,
        target_port,
    )?;
    let mut command = proxy_command_shell(&rendered);
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to start ProxyCommand: {rendered}"))?;
    let mut child_stdin = child
        .stdin
        .take()
        .context("ProxyCommand stdin was not captured")?;
    let mut child_stdout = child
        .stdout
        .take()
        .context("ProxyCommand stdout was not captured")?;
    let child_stderr = child.stderr.take();
    let (client_side, process_side) = tokio::io::duplex(64 * 1024);
    let (mut process_read, mut process_write) = tokio::io::split(process_side);

    tokio::spawn(async move {
        let to_child = tokio::spawn(async move {
            let _ = tokio::io::copy(&mut process_read, &mut child_stdin).await;
            let _ = child_stdin.shutdown().await;
        });
        let from_child = tokio::spawn(async move {
            let _ = tokio::io::copy(&mut child_stdout, &mut process_write).await;
            let _ = process_write.shutdown().await;
        });
        let stderr = tokio::spawn(async move {
            if let Some(mut child_stderr) = child_stderr {
                let mut sink = tokio::io::sink();
                let _ = tokio::io::copy(&mut child_stderr, &mut sink).await;
            }
        });
        let _ = child.wait().await;
        to_child.abort();
        from_child.abort();
        stderr.abort();
    });

    Ok(Box::new(client_side) as BoxedSshStream)
}

fn render_proxy_command(command: &str, target_host: &str, target_port: u16) -> Result<String> {
    validate_proxy_command_target_host(target_host)?;

    let mut rendered = String::with_capacity(command.len() + target_host.len() + 8);
    let mut chars = command.chars();
    while let Some(ch) = chars.next() {
        if ch != '%' {
            rendered.push(ch);
            continue;
        }

        match chars.next() {
            Some('%') => rendered.push('%'),
            Some('h') => rendered.push_str(target_host),
            Some('p') => rendered.push_str(&target_port.to_string()),
            Some(other) => {
                rendered.push('%');
                rendered.push(other);
            }
            None => rendered.push('%'),
        }
    }

    Ok(rendered)
}

fn validate_proxy_command_target_host(target_host: &str) -> Result<()> {
    if target_host.trim() != target_host || target_host.is_empty() {
        bail!("ProxyCommand target host is empty or contains surrounding whitespace");
    }
    if target_host.chars().any(is_shell_sensitive_host_char) {
        bail!("ProxyCommand target host contains shell-sensitive characters");
    }
    Ok(())
}

fn is_shell_sensitive_host_char(ch: char) -> bool {
    ch.is_whitespace()
        || matches!(
            ch,
            '\'' | '"'
                | '`'
                | '$'
                | ';'
                | '&'
                | '|'
                | '<'
                | '>'
                | '('
                | ')'
                | '{'
                | '}'
                | '*'
                | '?'
                | '\\'
                | '!'
                | '\n'
                | '\r'
        )
}

pub(crate) fn normalize_host_literal(host: &str) -> String {
    let text = host.trim();
    if let Some(inner) = text
        .strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
    {
        if inner.contains(':') {
            return inner.to_string();
        }
    }
    text.to_string()
}

pub(crate) fn format_host_port_authority(host: &str, port: u16) -> String {
    let normalized = normalize_host_literal(host);
    if normalized.contains(':') {
        format!("[{normalized}]:{port}")
    } else {
        format!("{normalized}:{port}")
    }
}

#[cfg(windows)]
fn proxy_command_shell(rendered: &str) -> Command {
    let mut command = Command::new("cmd");
    command.arg("/C").arg(rendered);
    command
}

#[cfg(not(windows))]
fn proxy_command_shell(rendered: &str) -> Command {
    let mut command = Command::new("sh");
    command.arg("-c").arg(rendered);
    command
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

async fn http_connect(
    stream: &mut TcpStream,
    target_host: &str,
    target_port: u16,
    proxy: &ProxyRequest,
) -> Result<()> {
    let target_authority = format_host_port_authority(target_host, target_port);
    let auth = match (
        proxy.username.as_deref().filter(|value| !value.is_empty()),
        proxy.password.as_deref(),
    ) {
        (Some(username), Some(password)) => {
            let token = BASE64_STANDARD.encode(format!("{username}:{password}"));
            format!("Proxy-Authorization: Basic {token}\r\n")
        }
        _ => String::new(),
    };
    let request =
        format!("CONNECT {target_authority} HTTP/1.1\r\nHost: {target_authority}\r\n{auth}\r\n");
    stream.write_all(request.as_bytes()).await?;
    let mut response = Vec::new();
    let mut buf = [0_u8; 256];
    while response.len() < 4096 {
        let n = stream.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        response.extend_from_slice(&buf[..n]);
        if response.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let status = String::from_utf8_lossy(&response);
    if status.starts_with("HTTP/1.0 200 ") || status.starts_with("HTTP/1.1 200 ") {
        Ok(())
    } else {
        bail!(
            "HTTP CONNECT rejected: {}",
            status.lines().next().unwrap_or("empty response")
        )
    }
}

async fn socks5_connect(
    stream: &mut TcpStream,
    target_host: &str,
    target_port: u16,
    proxy: &ProxyRequest,
) -> Result<()> {
    let has_auth = proxy
        .username
        .as_deref()
        .map(|value| !value.is_empty())
        .unwrap_or(false)
        && proxy.password.is_some();
    let methods: &[u8] = if has_auth { &[0x00, 0x02] } else { &[0x00] };
    stream.write_all(&[0x05, methods.len() as u8]).await?;
    stream.write_all(methods).await?;
    let mut greeting = [0_u8; 2];
    stream.read_exact(&mut greeting).await?;
    if greeting[0] != 0x05 {
        bail!("invalid SOCKS5 greeting response version");
    }
    if greeting[1] == 0x02 {
        socks5_username_password_auth(stream, proxy).await?;
    } else if greeting[1] != 0x00 {
        bail!("SOCKS5 proxy rejected supported authentication methods");
    }

    let target_host = normalize_host_literal(target_host);
    let target = socks5_target_address(&target_host)?;
    let mut request = Vec::with_capacity(6 + target.payload.len());
    request.extend_from_slice(&[0x05, 0x01, 0x00]);
    request.push(target.atyp);
    request.extend_from_slice(&target.payload);
    request.extend_from_slice(&target_port.to_be_bytes());
    stream.write_all(&request).await?;

    let mut head = [0_u8; 4];
    stream.read_exact(&mut head).await?;
    if head[0] != 0x05 {
        bail!("invalid SOCKS5 response version");
    }
    if head[1] != 0x00 {
        bail!("SOCKS5 connect failed with reply code {}", head[1]);
    }
    match head[3] {
        0x01 => {
            let mut rest = [0_u8; 6];
            stream.read_exact(&mut rest).await?;
        }
        0x03 => {
            let mut len = [0_u8; 1];
            stream.read_exact(&mut len).await?;
            let mut rest = vec![0_u8; len[0] as usize + 2];
            stream.read_exact(&mut rest).await?;
        }
        0x04 => {
            let mut rest = [0_u8; 18];
            stream.read_exact(&mut rest).await?;
        }
        atyp => bail!("unsupported SOCKS5 bind address type {atyp}"),
    }
    Ok(())
}

struct Socks5TargetAddress {
    atyp: u8,
    payload: Vec<u8>,
}

fn socks5_target_address(target_host: &str) -> Result<Socks5TargetAddress> {
    if let Ok(address) = target_host.parse::<Ipv4Addr>() {
        return Ok(Socks5TargetAddress {
            atyp: 0x01,
            payload: address.octets().to_vec(),
        });
    }
    if let Ok(address) = target_host.parse::<Ipv6Addr>() {
        return Ok(Socks5TargetAddress {
            atyp: 0x04,
            payload: address.octets().to_vec(),
        });
    }

    let host_bytes = target_host.as_bytes();
    if host_bytes.len() > u8::MAX as usize {
        bail!("target host is too long for SOCKS5 domain request");
    }
    let mut payload = Vec::with_capacity(1 + host_bytes.len());
    payload.push(host_bytes.len() as u8);
    payload.extend_from_slice(host_bytes);
    Ok(Socks5TargetAddress {
        atyp: 0x03,
        payload,
    })
}

async fn socks5_username_password_auth(stream: &mut TcpStream, proxy: &ProxyRequest) -> Result<()> {
    let username = proxy.username.as_deref().unwrap_or("");
    let password = proxy.password.as_deref().unwrap_or("");
    if username.is_empty() {
        bail!("SOCKS5 username is required for proxy authentication");
    }
    if username.len() > u8::MAX as usize || password.len() > u8::MAX as usize {
        bail!("SOCKS5 proxy username and password must be at most 255 bytes");
    }
    let mut req = Vec::with_capacity(3 + username.len() + password.len());
    req.push(0x01);
    req.push(username.len() as u8);
    req.extend_from_slice(username.as_bytes());
    req.push(password.len() as u8);
    req.extend_from_slice(password.as_bytes());
    stream.write_all(&req).await?;
    let mut response = [0_u8; 2];
    stream.read_exact(&mut response).await?;
    if response != [0x01, 0x00] {
        bail!("SOCKS5 proxy authentication failed");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[test]
    fn validates_proxy_requests() {
        assert!(validate_proxy_request(&ProxyRequest {
            kind: "none".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: None,
        })
        .is_ok());
        assert!(validate_proxy_request(&ProxyRequest {
            kind: "socks5".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(1080),
            username: None,
            password: None,
            cmd: None,
        })
        .is_ok());
        assert!(validate_proxy_request(&ProxyRequest {
            kind: "http".to_string(),
            host: None,
            port: Some(8080),
            username: None,
            password: None,
            cmd: None,
        })
        .is_err());
        assert!(validate_proxy_request(&ProxyRequest {
            kind: "cmd".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: Some("connect %h".to_string()),
        })
        .is_err());
    }

    #[test]
    fn renders_proxy_command_placeholders() {
        assert_eq!(
            render_proxy_command("connect -S %h:%p", "db.internal", 5432).unwrap(),
            "connect -S db.internal:5432"
        );
    }

    #[test]
    fn renders_proxy_command_percent_literals_once() {
        assert_eq!(
            render_proxy_command(
                "printf 'literal=%%h target=%h port=%p'",
                "db.internal",
                5432
            )
            .unwrap(),
            "printf 'literal=%h target=db.internal port=5432'"
        );
        assert_eq!(
            render_proxy_command("connect %% %x %h", "db.internal", 5432).unwrap(),
            "connect % %x db.internal"
        );
    }

    #[test]
    fn rejects_shell_sensitive_proxy_command_targets() {
        for target in [
            "db.internal;touch /tmp/pwned",
            "db.internal && whoami",
            "$(whoami)",
            "`whoami`",
            "db internal",
            " db.internal",
            "db.internal ",
        ] {
            let err = render_proxy_command("connect %h %p", target, 5432).unwrap_err();
            assert!(
                err.to_string().contains("ProxyCommand target host"),
                "{target} produced {err:#}"
            );
        }
    }

    #[test]
    fn formats_proxy_transport_host_authorities() {
        assert_eq!(normalize_host_literal("[2001:db8::1]"), "2001:db8::1");
        assert_eq!(normalize_host_literal(" example.com "), "example.com");
        assert_eq!(
            format_host_port_authority("2001:db8::1", 2200),
            "[2001:db8::1]:2200"
        );
        assert_eq!(
            format_host_port_authority("[2001:db8::1]", 2200),
            "[2001:db8::1]:2200"
        );
        assert_eq!(
            format_host_port_authority("example.com", 2200),
            "example.com:2200"
        );
    }

    #[test]
    fn builds_socks5_target_addresses_for_domains_and_ip_literals() {
        let domain = socks5_target_address("target.internal").unwrap();
        assert_eq!(domain.atyp, 0x03);
        assert_eq!(domain.payload, b"\x0ftarget.internal");

        let ipv4 = socks5_target_address("192.0.2.10").unwrap();
        assert_eq!(ipv4.atyp, 0x01);
        assert_eq!(ipv4.payload, [192, 0, 2, 10]);

        let ipv6 = socks5_target_address("2001:db8::42").unwrap();
        assert_eq!(ipv6.atyp, 0x04);
        assert_eq!(
            ipv6.payload,
            [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x42]
        );
    }

    #[test]
    fn builds_client_config_from_server_alive_options() {
        let default_config = client_config(None, None);
        assert_eq!(
            default_config.inactivity_timeout,
            Some(Duration::from_secs(30))
        );
        assert_eq!(default_config.keepalive_interval, None);
        assert_eq!(default_config.keepalive_max, 3);

        let keepalive_config = client_config(Some(15_000), Some(4));
        assert_eq!(keepalive_config.inactivity_timeout, None);
        assert_eq!(
            keepalive_config.keepalive_interval,
            Some(Duration::from_secs(15))
        );
        assert_eq!(keepalive_config.keepalive_max, 4);

        let clamped_config = client_config(Some(500), Some(99));
        assert_eq!(
            clamped_config.keepalive_interval,
            Some(Duration::from_secs(1))
        );
        assert_eq!(clamped_config.keepalive_max, 20);
    }

    #[test]
    fn validates_jump_hosts() {
        let mut jump = JumpHostRequest {
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
        };
        assert!(validate_jump_hosts(&[jump.clone()]).is_ok());

        jump.user.clear();
        assert!(validate_jump_hosts(&[jump.clone()]).is_err());

        jump.user = "ops".to_string();
        jump.password = None;
        assert!(validate_jump_hosts(&[jump.clone()]).is_err());

        jump.private_key_path = Some("/tmp/id_ed25519".to_string());
        assert!(validate_jump_hosts(&[jump]).is_err());
    }

    #[cfg(not(windows))]
    #[tokio::test]
    async fn opens_proxy_command_stream() {
        let proxy = ProxyRequest {
            kind: "cmd".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: Some("printf 'ready:%h:%p\\n'; cat".to_string()),
        };
        let mut stream = open_ssh_transport("db.internal", 5432, Some(&proxy), None, 1_000)
            .await
            .expect("open proxy command stream");
        let mut hello = vec![0_u8; "ready:db.internal:5432\n".len()];
        stream
            .read_exact(&mut hello)
            .await
            .expect("read proxy command greeting");
        assert_eq!(String::from_utf8_lossy(&hello), "ready:db.internal:5432\n");

        stream
            .write_all(b"ping\n")
            .await
            .expect("write through proxy command");
        let mut echo = vec![0_u8; 5];
        stream.read_exact(&mut echo).await.expect("read cat echo");
        assert_eq!(&echo, b"ping\n");
    }

    #[tokio::test]
    async fn opens_http_connect_proxy_with_basic_auth() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy_task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("http proxy accept");
            let mut request = Vec::new();
            let mut buf = [0_u8; 128];
            loop {
                let n = stream.read(&mut buf).await.expect("read http connect");
                request.extend_from_slice(&buf[..n]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("CONNECT target.internal:2222 HTTP/1.1"));
            assert!(request.contains("Proxy-Authorization: Basic cHJveHl1c2VyOnByb3h5cGFzcw=="));
            stream
                .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                .await
                .expect("write http connect response");
        });

        let proxy = ProxyRequest {
            kind: "http".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
            username: Some("proxyuser".to_string()),
            password: Some("proxypass".to_string()),
            cmd: None,
        };

        open_proxy_stream("target.internal", 2222, &proxy)
            .await
            .expect("http proxy auth connect");
        proxy_task.await.unwrap();
    }

    #[tokio::test]
    async fn brackets_ipv6_targets_for_http_connect_proxy() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy_task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("http proxy accept");
            let mut request = Vec::new();
            let mut buf = [0_u8; 128];
            loop {
                let n = stream.read(&mut buf).await.expect("read http connect");
                request.extend_from_slice(&buf[..n]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("CONNECT [2001:db8::42]:2200 HTTP/1.1"));
            assert!(request.contains("Host: [2001:db8::42]:2200"));
            stream
                .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                .await
                .expect("write http connect response");
        });

        let proxy = ProxyRequest {
            kind: "http".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
            username: None,
            password: None,
            cmd: None,
        };

        open_proxy_stream("2001:db8::42", 2200, &proxy)
            .await
            .expect("http proxy ipv6 connect");
        proxy_task.await.unwrap();
    }

    #[tokio::test]
    async fn opens_socks5_proxy_with_username_password_auth() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy_task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("socks proxy accept");
            let mut greeting = [0_u8; 4];
            stream
                .read_exact(&mut greeting)
                .await
                .expect("read socks greeting");
            assert_eq!(greeting, [0x05, 0x02, 0x00, 0x02]);
            stream
                .write_all(&[0x05, 0x02])
                .await
                .expect("select username/password auth");

            let mut auth_head = [0_u8; 2];
            stream
                .read_exact(&mut auth_head)
                .await
                .expect("read socks auth head");
            assert_eq!(auth_head, [0x01, 9]);
            let mut username = vec![0_u8; 9];
            stream
                .read_exact(&mut username)
                .await
                .expect("read username");
            assert_eq!(&username, b"proxyuser");
            let mut password_len = [0_u8; 1];
            stream
                .read_exact(&mut password_len)
                .await
                .expect("read password length");
            let mut password = vec![0_u8; password_len[0] as usize];
            stream
                .read_exact(&mut password)
                .await
                .expect("read password");
            assert_eq!(&password, b"proxypass");
            stream
                .write_all(&[0x01, 0x00])
                .await
                .expect("accept socks auth");

            let mut head = [0_u8; 5];
            stream
                .read_exact(&mut head)
                .await
                .expect("read socks connect");
            assert_eq!(&head[..4], &[0x05, 0x01, 0x00, 0x03]);
            let mut rest = vec![0_u8; head[4] as usize + 2];
            stream.read_exact(&mut rest).await.expect("read target");
            assert_eq!(&rest[..head[4] as usize], b"target.internal");
            stream
                .write_all(&[0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x13, 0x88])
                .await
                .expect("write socks success");
        });

        let proxy = ProxyRequest {
            kind: "socks5".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
            username: Some("proxyuser".to_string()),
            password: Some("proxypass".to_string()),
            cmd: None,
        };

        open_proxy_stream("target.internal", 2222, &proxy)
            .await
            .expect("socks proxy auth connect");
        proxy_task.await.unwrap();
    }

    #[tokio::test]
    async fn sends_ipv6_literal_targets_with_socks5_ipv6_address_type() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy_task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("socks proxy accept");
            let mut greeting = [0_u8; 3];
            stream
                .read_exact(&mut greeting)
                .await
                .expect("read socks greeting");
            assert_eq!(greeting, [0x05, 0x01, 0x00]);
            stream
                .write_all(&[0x05, 0x00])
                .await
                .expect("write socks method");

            let mut head = [0_u8; 4];
            stream
                .read_exact(&mut head)
                .await
                .expect("read socks connect head");
            assert_eq!(head, [0x05, 0x01, 0x00, 0x04]);
            let mut rest = [0_u8; 18];
            stream
                .read_exact(&mut rest)
                .await
                .expect("read ipv6 target");
            assert_eq!(
                &rest[..16],
                &[0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x42]
            );
            assert_eq!(u16::from_be_bytes([rest[16], rest[17]]), 2200);
            let mut response = vec![0x05, 0x00, 0x00, 0x04];
            response.extend_from_slice(&[0; 18]);
            stream
                .write_all(&response)
                .await
                .expect("write socks connect response");
        });

        let proxy = ProxyRequest {
            kind: "socks5".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some(port),
            username: None,
            password: None,
            cmd: None,
        };

        open_proxy_stream("[2001:db8::42]", 2200, &proxy)
            .await
            .expect("socks proxy ipv6 connect");
        proxy_task.await.unwrap();
    }
}
