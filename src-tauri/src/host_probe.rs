use crate::ssh::transport::{format_host_port_authority, normalize_host_literal};
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostProbeTarget {
    id: serde_json::Value,
    host: String,
    port: Option<u16>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostProbeResult {
    id: serde_json::Value,
    host: String,
    port: u16,
    status: &'static str,
    latency_ms: Option<u64>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostProbeRequest {
    targets: Vec<HostProbeTarget>,
    timeout_ms: Option<u64>,
}

#[tauri::command]
pub async fn probe_hosts(req: HostProbeRequest) -> Result<Vec<HostProbeResult>, String> {
    probe_hosts_inner(req).await.map_err(|err| err.to_string())
}

async fn probe_hosts_inner(req: HostProbeRequest) -> Result<Vec<HostProbeResult>> {
    if req.targets.len() > 256 {
        bail!("at most 256 hosts can be probed at once");
    }

    let timeout_ms = req.timeout_ms.unwrap_or(1_500).clamp(100, 10_000);
    let mut out = Vec::with_capacity(req.targets.len());

    for target in req.targets {
        validate_target(&target)?;
        out.push(probe_one(target, timeout_ms).await);
    }

    Ok(out)
}

fn validate_target(target: &HostProbeTarget) -> Result<()> {
    if target.host.trim().is_empty() {
        bail!("host is required");
    }
    Ok(())
}

async fn probe_one(target: HostProbeTarget, timeout_ms: u64) -> HostProbeResult {
    let host = normalize_host_literal(&target.host);
    let port = target.port.unwrap_or(22);
    let authority = format_host_port_authority(&host, port);
    let started = Instant::now();
    let result = timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect((host.as_str(), port)),
    )
    .await;

    match result {
        Ok(Ok(_stream)) => HostProbeResult {
            id: target.id,
            host,
            port,
            status: "online",
            latency_ms: Some(started.elapsed().as_millis() as u64),
            error: None,
        },
        Ok(Err(err)) => HostProbeResult {
            id: target.id,
            host,
            port,
            status: "offline",
            latency_ms: None,
            error: Some(format!("{authority}: {err}")),
        },
        Err(_) => HostProbeResult {
            id: target.id,
            host,
            port,
            status: "offline",
            latency_ms: None,
            error: Some(format!("{authority}: timed out after {timeout_ms}ms")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    fn target(id: u64, host: &str, port: u16) -> HostProbeTarget {
        HostProbeTarget {
            id: serde_json::json!(id),
            host: host.to_string(),
            port: Some(port),
        }
    }

    #[tokio::test]
    async fn probes_reachable_hosts() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accept = tokio::spawn(async move {
            let _ = listener.accept().await;
        });

        let results = probe_hosts_inner(HostProbeRequest {
            targets: vec![target(1, "127.0.0.1", port)],
            timeout_ms: Some(500),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "online");
        assert!(results[0].latency_ms.is_some());
        accept.await.unwrap();
    }

    #[tokio::test]
    async fn marks_unreachable_hosts_offline() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let results = probe_hosts_inner(HostProbeRequest {
            targets: vec![target(1, "127.0.0.1", port)],
            timeout_ms: Some(500),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "offline");
        assert!(results[0].error.is_some());
    }

    #[tokio::test]
    async fn normalizes_bracketed_ipv6_targets_before_probe_result() {
        let results = probe_hosts_inner(HostProbeRequest {
            targets: vec![target(1, "[2001:db8::42]", 22)],
            timeout_ms: Some(100),
        })
        .await
        .unwrap();

        assert_eq!(results[0].host, "2001:db8::42");
        assert_eq!(results[0].status, "offline");
        assert!(results[0]
            .error
            .as_deref()
            .unwrap_or("")
            .contains("[2001:db8::42]:22"));
    }

    #[tokio::test]
    async fn rejects_empty_hosts() {
        let err = probe_hosts_inner(HostProbeRequest {
            targets: vec![target(1, " ", 22)],
            timeout_ms: Some(100),
        })
        .await
        .unwrap_err();

        assert!(err.to_string().contains("host is required"));
    }
}
