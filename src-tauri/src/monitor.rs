use crate::ssh::auth::{authenticate_with_fallbacks, SshAuth};
use crate::ssh::known_hosts::{check_host_key, learn_host_key, HostKeyStatus};
use crate::ssh::transport::{
    client_config, open_ssh_transport, validate_jump_hosts, validate_proxy_request,
    JumpHostRequest, ProxyRequest,
};
use anyhow::{bail, Context, Result};
use russh::client;
use russh::{ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(target_os = "linux")]
use std::time::Duration;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSample {
    cpu: u8,
    memory: u8,
    disk: u8,
    network_down_mbps: f64,
    load: String,
    uptime: String,
    os: String,
    processes: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMonitorRequest {
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
pub async fn sample_monitor() -> MonitorSample {
    sample_linux_monitor()
        .await
        .unwrap_or_else(fallback_monitor)
}

#[tauri::command]
pub async fn sample_remote_monitor(req: RemoteMonitorRequest) -> Result<MonitorSample, String> {
    validate_remote_monitor_request(&req).map_err(to_string)?;
    sample_remote_linux_monitor(&req).await.map_err(to_string)
}

#[cfg(target_os = "linux")]
async fn sample_linux_monitor() -> Option<MonitorSample> {
    let cpu_start = parse_cpu_stat(&fs::read_to_string("/proc/stat").ok()?)?;
    let net_start = parse_net_dev(&fs::read_to_string("/proc/net/dev").ok()?);
    tokio::time::sleep(Duration::from_millis(120)).await;
    let cpu_end = parse_cpu_stat(&fs::read_to_string("/proc/stat").ok()?)?;
    let net_end = parse_net_dev(&fs::read_to_string("/proc/net/dev").ok()?);

    Some(MonitorSample {
        cpu: cpu_usage(cpu_start, cpu_end),
        memory: parse_meminfo_percent(&fs::read_to_string("/proc/meminfo").ok()?)?,
        disk: disk_percent("/"),
        network_down_mbps: network_down_mbps(net_start, net_end, 0.120),
        load: parse_loadavg(&fs::read_to_string("/proc/loadavg").unwrap_or_default()),
        uptime: parse_uptime(&fs::read_to_string("/proc/uptime").unwrap_or_default()),
        os: parse_os_release(&fs::read_to_string("/etc/os-release").unwrap_or_default()),
        processes: count_processes(),
    })
}

#[cfg(not(target_os = "linux"))]
async fn sample_linux_monitor() -> Option<MonitorSample> {
    None
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CpuTimes {
    idle: u64,
    total: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct NetBytes {
    rx: u64,
    tx: u64,
}

fn parse_cpu_stat(text: &str) -> Option<CpuTimes> {
    let line = text.lines().find(|line| line.starts_with("cpu "))?;
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|part| part.parse().ok())
        .collect();
    if values.len() < 4 {
        return None;
    }
    let idle = values.get(3).copied().unwrap_or(0) + values.get(4).copied().unwrap_or(0);
    let total = values.iter().sum();
    Some(CpuTimes { idle, total })
}

fn cpu_usage(start: CpuTimes, end: CpuTimes) -> u8 {
    let total = end.total.saturating_sub(start.total);
    if total == 0 {
        return 0;
    }
    let idle = end.idle.saturating_sub(start.idle);
    (((total.saturating_sub(idle)) as f64 / total as f64) * 100.0)
        .round()
        .clamp(0.0, 100.0) as u8
}

fn parse_meminfo_percent(text: &str) -> Option<u8> {
    let mut total = None;
    let mut available = None;
    for line in text.lines() {
        if line.starts_with("MemTotal:") {
            total = line
                .split_whitespace()
                .nth(1)
                .and_then(|v| v.parse::<u64>().ok());
        }
        if line.starts_with("MemAvailable:") {
            available = line
                .split_whitespace()
                .nth(1)
                .and_then(|v| v.parse::<u64>().ok());
        }
    }
    let total = total?;
    let available = available?;
    if total == 0 {
        return None;
    }
    Some(
        (((total - available) as f64 / total as f64) * 100.0)
            .round()
            .clamp(0.0, 100.0) as u8,
    )
}

fn parse_net_dev(text: &str) -> NetBytes {
    let mut total = NetBytes::default();
    for line in text.lines().skip(2) {
        let Some((iface, values)) = line.split_once(':') else {
            continue;
        };
        let iface = iface.trim();
        if iface == "lo" {
            continue;
        }
        let parts: Vec<&str> = values.split_whitespace().collect();
        if parts.len() < 16 {
            continue;
        }
        total.rx = total
            .rx
            .saturating_add(parts[0].parse::<u64>().unwrap_or(0));
        total.tx = total
            .tx
            .saturating_add(parts[8].parse::<u64>().unwrap_or(0));
    }
    total
}

fn network_down_mbps(start: NetBytes, end: NetBytes, seconds: f64) -> f64 {
    if seconds <= 0.0 {
        return 0.0;
    }
    let bytes = end.rx.saturating_sub(start.rx) as f64;
    let mbps = bytes / 1024.0 / 1024.0 / seconds;
    (mbps * 10.0).round() / 10.0
}

fn monitor_sample_from_parts(
    cpu_start: CpuTimes,
    cpu_end: CpuTimes,
    net_start: NetBytes,
    net_end: NetBytes,
    memory: u8,
    disk: u8,
    load: String,
    uptime: String,
    os: String,
    processes: usize,
    interval_seconds: f64,
) -> MonitorSample {
    MonitorSample {
        cpu: cpu_usage(cpu_start, cpu_end),
        memory,
        disk,
        network_down_mbps: network_down_mbps(net_start, net_end, interval_seconds),
        load,
        uptime,
        os,
        processes,
    }
}

fn parse_loadavg(text: &str) -> String {
    text.split_whitespace().next().unwrap_or("0.00").to_string()
}

fn parse_uptime(text: &str) -> String {
    let seconds = text
        .split_whitespace()
        .next()
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(0.0) as u64;
    let days = seconds / 86_400;
    let hours = (seconds % 86_400) / 3_600;
    if days > 0 {
        format!("{days}d {hours}h")
    } else {
        format!("{hours}h")
    }
}

fn parse_os_release(text: &str) -> String {
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("PRETTY_NAME=") {
            return value.trim_matches('"').to_string();
        }
    }
    "Linux".to_string()
}

#[cfg(target_os = "linux")]
fn disk_percent(path: &str) -> u8 {
    let output = Command::new("df").args(["-P", path]).output();
    output
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| parse_df_percent(&text))
        .unwrap_or(0)
}

#[cfg(not(target_os = "linux"))]
fn disk_percent(_path: &str) -> u8 {
    0
}

fn parse_df_percent(text: &str) -> Option<u8> {
    let line = text.lines().nth(1)?;
    line.split_whitespace()
        .nth(4)?
        .trim_end_matches('%')
        .parse::<u8>()
        .ok()
}

#[cfg(target_os = "linux")]
fn count_processes() -> usize {
    fs::read_dir("/proc")
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .chars()
                .all(|ch| ch.is_ascii_digit())
        })
        .count()
}

#[cfg(not(target_os = "linux"))]
fn count_processes() -> usize {
    0
}

fn fallback_monitor() -> MonitorSample {
    MonitorSample {
        cpu: 0,
        memory: 0,
        disk: 0,
        network_down_mbps: 0.0,
        load: "0.00".to_string(),
        uptime: "0h".to_string(),
        os: std::env::consts::OS.to_string(),
        processes: 0,
    }
}

struct MonitorClient {
    host: String,
    port: u16,
    strict_host_key: bool,
    trust_unknown_host_key: bool,
}

#[derive(Debug, thiserror::Error)]
enum MonitorClientError {
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

impl client::Handler for MonitorClient {
    type Error = MonitorClientError;

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
                        MonitorClientError::KnownHosts {
                            host: self.host.clone(),
                            port: self.port,
                            message: err.to_string(),
                        }
                    })?;
                    Ok(true)
                } else {
                    Err(MonitorClientError::UnknownHostKey {
                        host: self.host.clone(),
                        port: self.port,
                        fingerprint,
                    })
                }
            }
            Ok(HostKeyStatus::Changed { line, fingerprint }) => {
                Err(MonitorClientError::HostKeyChanged {
                    host: self.host.clone(),
                    port: self.port,
                    line,
                    fingerprint,
                })
            }
            Err(err) => Err(MonitorClientError::KnownHosts {
                host: self.host.clone(),
                port: self.port,
                message: err.to_string(),
            }),
        }
    }
}

async fn sample_remote_linux_monitor(req: &RemoteMonitorRequest) -> Result<MonitorSample> {
    let port = req.port.unwrap_or(22);
    let config = client_config(req.server_alive_interval_ms, req.server_alive_count_max);
    let handler = MonitorClient {
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
    .with_context(|| format!("failed to connect to {}:{port}", req.host))?;
    let mut session = client::connect_stream(config, stream, handler)
        .await
        .with_context(|| format!("failed to connect to {}:{port}", req.host))?;
    authenticate_with_fallbacks(
        &mut session,
        SshAuth {
            user: &req.user,
            password: req.password.as_deref(),
            private_key_path: req.private_key_path.as_deref(),
            private_key_passphrase: req.private_key_passphrase.as_deref(),
            totp_code: req.totp_code.as_deref(),
            rejected_message: "monitor authentication rejected by server",
        },
    )
    .await?;

    let sample = sample_monitor_over_ssh_session(&mut session).await;
    let _ = session
        .disconnect(Disconnect::ByApplication, "", "English")
        .await;
    sample
}

pub async fn sample_monitor_over_ssh_session<H>(
    session: &mut client::Handle<H>,
) -> Result<MonitorSample>
where
    H: client::Handler,
{
    let mut channel = session
        .channel_open_session()
        .await
        .context("failed to open monitor SSH channel")?;
    channel
        .exec(true, remote_monitor_script())
        .await
        .context("failed to execute remote monitor sampler")?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status = None;
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => stdout.extend_from_slice(&data),
            Some(ChannelMsg::ExtendedData { data, .. }) => stderr.extend_from_slice(&data),
            Some(ChannelMsg::ExitStatus {
                exit_status: status,
            }) => exit_status = Some(status),
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
            _ => {}
        }
    }
    if exit_status.unwrap_or(0) != 0 {
        let err = String::from_utf8_lossy(&stderr);
        bail!("remote monitor sampler failed: {}", err.trim());
    }
    let text = String::from_utf8(stdout).context("remote monitor output is not UTF-8")?;
    parse_remote_monitor_output(&text)
}

fn validate_remote_monitor_request(req: &RemoteMonitorRequest) -> Result<()> {
    if req.host.trim().is_empty() {
        bail!("host is required");
    }
    if req.user.trim().is_empty() {
        bail!("user is required");
    }
    if req.password.as_deref().unwrap_or("").is_empty()
        && req
            .private_key_path
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
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

fn parse_remote_monitor_output(text: &str) -> Result<MonitorSample> {
    let values: HashMap<&str, &str> = text
        .lines()
        .filter_map(|line| line.split_once('='))
        .map(|(key, value)| (key.trim(), value.trim()))
        .collect();

    let get_u64 = |key: &str| -> Result<u64> {
        values
            .get(key)
            .context(format!("missing remote monitor field {key}"))?
            .parse()
            .with_context(|| format!("invalid remote monitor field {key}"))
    };
    let get_u8 = |key: &str| -> Result<u8> {
        values
            .get(key)
            .context(format!("missing remote monitor field {key}"))?
            .parse::<u8>()
            .with_context(|| format!("invalid remote monitor field {key}"))
            .map(|value| value.min(100))
    };
    let get_string = |key: &str, fallback: &str| -> String {
        values
            .get(key)
            .filter(|value| !value.is_empty())
            .copied()
            .unwrap_or(fallback)
            .to_string()
    };

    Ok(monitor_sample_from_parts(
        CpuTimes {
            idle: get_u64("cpu1_idle")?,
            total: get_u64("cpu1_total")?,
        },
        CpuTimes {
            idle: get_u64("cpu2_idle")?,
            total: get_u64("cpu2_total")?,
        },
        NetBytes {
            rx: get_u64("net1_rx")?,
            tx: 0,
        },
        NetBytes {
            rx: get_u64("net2_rx")?,
            tx: 0,
        },
        get_u8("memory")?,
        get_u8("disk")?,
        get_string("load", "0.00"),
        get_string("uptime", "0h"),
        get_string("os", "Linux"),
        get_u64("processes")? as usize,
        0.120,
    ))
}

fn remote_monitor_script() -> &'static str {
    r#"sh -lc 'cpu_line() { awk "/^cpu / { idle=\$5+\$6; total=0; for (i=2; i<=NF; i++) total+=\$i; print idle, total; }" /proc/stat; }; net_rx() { awk -F "[: ]+" "NR>2 && \$2 != \"lo\" { rx+=\$3 } END { print rx+0 }" /proc/net/dev; }; set -- $(cpu_line); echo cpu1_idle=$1; echo cpu1_total=$2; echo net1_rx=$(net_rx); sleep 0.12; set -- $(cpu_line); echo cpu2_idle=$1; echo cpu2_total=$2; echo net2_rx=$(net_rx); awk "/MemTotal:/ { total=\$2 } /MemAvailable:/ { available=\$2 } END { if (total > 0) printf \"memory=%.0f\\n\", (total - available) * 100 / total; else print \"memory=0\" }" /proc/meminfo; df -P / | awk "NR==2 { gsub(/%/, \"\", \$5); print \"disk=\" \$5+0 }"; awk "{ print \"load=\" \$1 }" /proc/loadavg; awk "{ seconds=\$1; days=int(seconds/86400); hours=int((seconds%86400)/3600); if (days > 0) printf \"uptime=%dd %dh\\n\", days, hours; else printf \"uptime=%dh\\n\", hours }" /proc/uptime; awk -F= "/^PRETTY_NAME=/ { gsub(/^\\\"|\\\"$/, \"\", \$2); print \"os=\" \$2; found=1 } END { if (!found) print \"os=Linux\" }" /etc/os-release 2>/dev/null; echo processes=$(find /proc -maxdepth 1 -type d -regex ".*/[0-9]+" 2>/dev/null | wc -l)'"#
}

fn to_string(err: anyhow::Error) -> String {
    err.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cpu_usage_from_two_snapshots() {
        let start = parse_cpu_stat("cpu  100 0 100 800 0 0 0 0 0 0\n").expect("start cpu");
        let end = parse_cpu_stat("cpu  150 0 150 900 0 0 0 0 0 0\n").expect("end cpu");
        assert_eq!(cpu_usage(start, end), 50);
    }

    #[test]
    fn parses_memory_usage_from_meminfo() {
        let text = "MemTotal:       1000 kB\nMemAvailable:    250 kB\n";
        assert_eq!(parse_meminfo_percent(text), Some(75));
    }

    #[test]
    fn parses_network_totals_ignoring_loopback() {
        let text = r#"
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 100 1 0 0 0 0 0 0 200 1 0 0 0 0 0 0
  eth0: 1048576 2 0 0 0 0 0 0 2097152 2 0 0 0 0 0 0
"#;
        assert_eq!(
            parse_net_dev(text),
            NetBytes {
                rx: 1_048_576,
                tx: 2_097_152
            }
        );
    }

    #[test]
    fn parses_remote_monitor_output() {
        let text = "\
cpu1_idle=800
cpu1_total=1000
net1_rx=1048576
cpu2_idle=900
cpu2_total=1200
net2_rx=2097152
memory=75
disk=42
load=0.31
uptime=2d 3h
os=Ubuntu 24.04 LTS
processes=123
";

        let sample = parse_remote_monitor_output(text).expect("parse remote monitor");

        assert_eq!(sample.cpu, 50);
        assert_eq!(sample.memory, 75);
        assert_eq!(sample.disk, 42);
        assert_eq!(sample.network_down_mbps, 8.3);
        assert_eq!(sample.load, "0.31");
        assert_eq!(sample.uptime, "2d 3h");
        assert_eq!(sample.os, "Ubuntu 24.04 LTS");
        assert_eq!(sample.processes, 123);
    }

    #[test]
    fn formats_uptime_and_os_release() {
        assert_eq!(parse_uptime("176400.00 1.00"), "2d 1h");
        assert_eq!(
            parse_os_release("NAME=Ubuntu\nPRETTY_NAME=\"Ubuntu 24.04 LTS\"\n"),
            "Ubuntu 24.04 LTS"
        );
    }

    #[test]
    fn parses_df_percent() {
        let df = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 100 58 42 58% /\n";
        assert_eq!(parse_df_percent(df), Some(58));
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn samples_current_linux_host() {
        let sample = sample_linux_monitor().await.expect("linux monitor sample");
        assert!(sample.cpu <= 100);
        assert!(sample.memory <= 100);
        assert!(sample.disk <= 100);
        assert!(!sample.os.is_empty());
        assert!(sample.processes > 0);
    }
}
