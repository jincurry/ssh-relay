use crate::ssh::transport::{
    format_host_port_authority, normalize_host_literal, open_proxy_stream, open_ssh_transport,
    validate_proxy_request, ProxyRequest,
};
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[derive(Deserialize)]
pub struct JumpTestRequest {
    nodes: Vec<PathNode>,
    proxy: Option<PathProxy>,
    timeout_ms: Option<u64>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathNode {
    label: String,
    host: Option<String>,
    port: Option<u16>,
    kind: Option<String>,
}

#[derive(Clone, Deserialize)]
pub struct PathProxy {
    kind: String,
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    cmd: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHopResult {
    from: String,
    to: String,
    status: &'static str,
    latency_ms: Option<u64>,
    message: String,
}

#[tauri::command]
pub async fn test_jump_chain(req: JumpTestRequest) -> Result<Vec<JumpHopResult>, String> {
    test_connection_path(req)
        .await
        .map_err(|err| err.to_string())
}

async fn test_connection_path(req: JumpTestRequest) -> Result<Vec<JumpHopResult>> {
    validate_request(&req)?;

    let timeout_ms = req.timeout_ms.unwrap_or(1_500).clamp(100, 10_000);
    let mut out = Vec::new();

    for (idx, pair) in req.nodes.windows(2).enumerate() {
        let from = &pair[0];
        let to = &pair[1];
        let can_probe_direct =
            idx == 0 && to.host.as_deref().unwrap_or("").trim().len() > 0 && to.port.is_some();
        let can_probe_via_proxy = from.kind.as_deref() == Some("proxy")
            && to.host.as_deref().unwrap_or("").trim().len() > 0
            && to.port.is_some()
            && matches!(
                req.proxy.as_ref().map(|proxy| proxy.kind.as_str()),
                Some("socks5" | "http")
            );
        let can_probe_proxy_command = from.kind.as_deref() == Some("proxy")
            && to.host.as_deref().unwrap_or("").trim().len() > 0
            && to.port.is_some()
            && req.proxy.as_ref().map(|proxy| proxy.kind.as_str()) == Some("cmd");
        let is_proxy_command_node = from.kind.as_deref() == Some("local")
            && to.kind.as_deref() == Some("proxy")
            && req.proxy.as_ref().map(|proxy| proxy.kind.as_str()) == Some("cmd");

        if can_probe_direct {
            out.push(probe_edge(from, to, timeout_ms).await);
        } else if can_probe_via_proxy {
            out.push(
                probe_proxy_edge(
                    from,
                    to,
                    req.proxy.as_ref().expect("proxy checked"),
                    timeout_ms,
                )
                .await,
            );
        } else if can_probe_proxy_command {
            out.push(
                probe_proxy_command_edge(
                    from,
                    to,
                    req.proxy.as_ref().expect("proxy checked"),
                    timeout_ms,
                )
                .await,
            );
        } else if is_proxy_command_node {
            out.push(JumpHopResult {
                from: from.label.clone(),
                to: to.label.clone(),
                status: "ok",
                latency_ms: Some(0),
                message: "ProxyCommand configured; target edge will execute it".to_string(),
            });
        } else {
            out.push(JumpHopResult {
                from: from.label.clone(),
                to: to.label.clone(),
                status: "unchecked",
                latency_ms: None,
                message: if to.host.is_none() || to.port.is_none() {
                    "node has no concrete host/port to probe".to_string()
                } else {
                    "requires an authenticated SSH channel from the previous hop".to_string()
                },
            });
        }
    }

    Ok(out)
}

fn validate_request(req: &JumpTestRequest) -> Result<()> {
    if req.nodes.len() < 2 {
        bail!("at least two nodes are required");
    }

    if let Some(proxy) = &req.proxy {
        validate_proxy_request(&ProxyRequest::from(proxy.clone()))?;
    }

    for node in &req.nodes {
        if node.label.trim().is_empty() {
            bail!("node label is required");
        }
        if let Some(kind) = &node.kind {
            if !matches!(kind.as_str(), "local" | "proxy" | "hop" | "target") {
                bail!("unknown node kind: {kind}");
            }
        }
        if let Some(host) = &node.host {
            if host.trim().is_empty() {
                bail!("node host cannot be empty");
            }
        }
    }

    Ok(())
}

async fn probe_edge(from: &PathNode, to: &PathNode, timeout_ms: u64) -> JumpHopResult {
    let host = normalize_host_literal(to.host.as_deref().unwrap_or_default());
    let port = to.port.unwrap_or(22);
    let authority = format_host_port_authority(&host, port);
    let started = Instant::now();
    let result = timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect((host.as_str(), port)),
    )
    .await;

    match result {
        Ok(Ok(_stream)) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "ok",
            latency_ms: Some(started.elapsed().as_millis() as u64),
            message: format!("tcp {authority} reachable"),
        },
        Ok(Err(err)) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!("tcp {authority} failed: {err}"),
        },
        Err(_) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!("tcp {authority} timed out after {timeout_ms}ms"),
        },
    }
}

async fn probe_proxy_edge(
    from: &PathNode,
    to: &PathNode,
    proxy: &PathProxy,
    timeout_ms: u64,
) -> JumpHopResult {
    let proxy_host = normalize_host_literal(proxy.host.as_deref().unwrap_or_default());
    let proxy_port = proxy.port.unwrap_or_default();
    let proxy_authority = format_host_port_authority(&proxy_host, proxy_port);
    let target_host = normalize_host_literal(to.host.as_deref().unwrap_or_default());
    let target_port = to.port.unwrap_or(22);
    let target_authority = format_host_port_authority(&target_host, target_port);
    let started = Instant::now();
    let proxy_request = ProxyRequest::from(proxy.clone());

    match timeout(
        Duration::from_millis(timeout_ms),
        open_proxy_stream(&target_host, target_port, &proxy_request),
    )
    .await
    {
        Ok(Ok(_stream)) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "ok",
            latency_ms: Some(started.elapsed().as_millis() as u64),
            message: format!("{} proxy connected to {target_authority}", proxy.kind),
        },
        Ok(Err(err)) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!(
                "{} proxy {proxy_authority} failed to reach {target_authority}: {err}",
                proxy.kind
            ),
        },
        Err(_) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!(
                "{} proxy {proxy_authority} timed out after {timeout_ms}ms",
                proxy.kind
            ),
        },
    }
}

async fn probe_proxy_command_edge(
    from: &PathNode,
    to: &PathNode,
    proxy: &PathProxy,
    timeout_ms: u64,
) -> JumpHopResult {
    let target_host = to.host.as_deref().unwrap_or_default();
    let target_port = to.port.unwrap_or(22);
    let started = Instant::now();
    let proxy_request = ProxyRequest::from(proxy.clone());

    let result = timeout(Duration::from_millis(timeout_ms), async {
        let mut stream = open_ssh_transport(
            target_host,
            target_port,
            Some(&proxy_request),
            None,
            timeout_ms,
        )
        .await?;
        let mut first = [0_u8; 1];
        let n = timeout(Duration::from_millis(timeout_ms), stream.read(&mut first)).await??;
        if n == 0 {
            bail!("ProxyCommand exited before target data was available");
        }
        Result::<()>::Ok(())
    })
    .await;

    match result {
        Ok(Ok(())) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "ok",
            latency_ms: Some(started.elapsed().as_millis() as u64),
            message: format!("ProxyCommand connected to {target_host}:{target_port}"),
        },
        Ok(Err(err)) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!("ProxyCommand failed to reach {target_host}:{target_port}: {err}"),
        },
        Err(_) => JumpHopResult {
            from: from.label.clone(),
            to: to.label.clone(),
            status: "failed",
            latency_ms: None,
            message: format!("ProxyCommand timed out after {timeout_ms}ms"),
        },
    }
}

impl From<PathProxy> for ProxyRequest {
    fn from(proxy: PathProxy) -> Self {
        Self {
            kind: proxy.kind,
            host: proxy.host,
            port: proxy.port,
            username: proxy.username,
            password: proxy.password,
            cmd: proxy.cmd,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn node(label: &str, host: Option<&str>, port: Option<u16>) -> PathNode {
        PathNode {
            label: label.to_string(),
            host: host.map(str::to_string),
            port,
            kind: None,
        }
    }

    #[tokio::test]
    async fn probes_first_reachable_tcp_edge() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accept = tokio::spawn(async move {
            let _ = listener.accept().await;
        });

        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                node("local", None, None),
                node("target", Some("127.0.0.1"), Some(port)),
            ],
            proxy: None,
            timeout_ms: Some(500),
        })
        .await
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "ok");
        assert!(results[0].latency_ms.is_some());
        accept.await.unwrap();
    }

    #[tokio::test]
    async fn formats_bracketed_ipv6_direct_probe_messages() {
        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                node("local", None, None),
                node("target", Some("[2001:db8::42]"), Some(22)),
            ],
            proxy: None,
            timeout_ms: Some(100),
        })
        .await
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "failed");
        assert!(results[0].message.contains("tcp [2001:db8::42]:22"));
    }

    #[tokio::test]
    async fn marks_deeper_hops_unchecked_without_ssh_channel() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accept = tokio::spawn(async move {
            let _ = listener.accept().await;
        });

        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                node("local", None, None),
                node("bastion", Some("127.0.0.1"), Some(port)),
                node("target", Some("10.0.0.8"), Some(22)),
            ],
            proxy: None,
            timeout_ms: Some(500),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "ok");
        assert_eq!(results[1].status, "unchecked");
        assert!(results[1].message.contains("authenticated SSH channel"));
        accept.await.unwrap();
    }

    #[tokio::test]
    async fn probes_http_connect_proxy_edge() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy = tokio::spawn(async move {
            let _ = listener.accept().await.expect("first tcp probe");
            let (mut stream, _) = listener.accept().await.expect("http connect probe");
            let mut request = Vec::new();
            let mut buf = [0_u8; 128];
            loop {
                let n = stream.read(&mut buf).await.expect("read connect request");
                if n == 0 {
                    break;
                }
                request.extend_from_slice(&buf[..n]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("CONNECT target.internal:2222 HTTP/1.1"));
            assert!(request.contains("Proxy-Authorization: Basic ZWRnZTpzZWNyZXQ="));
            stream
                .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                .await
                .expect("write connect response");
        });

        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                PathNode {
                    label: "local".to_string(),
                    host: None,
                    port: None,
                    kind: Some("local".to_string()),
                },
                PathNode {
                    label: "http-proxy".to_string(),
                    host: Some("127.0.0.1".to_string()),
                    port: Some(port),
                    kind: Some("proxy".to_string()),
                },
                PathNode {
                    label: "target".to_string(),
                    host: Some("target.internal".to_string()),
                    port: Some(2222),
                    kind: Some("target".to_string()),
                },
            ],
            proxy: Some(PathProxy {
                kind: "http".to_string(),
                host: Some("127.0.0.1".to_string()),
                port: Some(port),
                username: Some("edge".to_string()),
                password: Some("secret".to_string()),
                cmd: None,
            }),
            timeout_ms: Some(1_000),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "ok");
        assert_eq!(results[1].status, "ok");
        assert!(results[1].message.contains("http proxy connected"));
        proxy.await.unwrap();
    }

    #[tokio::test]
    async fn probes_socks5_proxy_edge() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let proxy = tokio::spawn(async move {
            let _ = listener.accept().await.expect("first tcp probe");
            let (mut stream, _) = listener.accept().await.expect("socks probe");
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

            let mut head = [0_u8; 5];
            stream
                .read_exact(&mut head)
                .await
                .expect("read socks connect head");
            assert_eq!(&head[..4], &[0x05, 0x01, 0x00, 0x03]);
            let mut rest = vec![0_u8; head[4] as usize + 2];
            stream
                .read_exact(&mut rest)
                .await
                .expect("read socks connect target");
            assert_eq!(&rest[..head[4] as usize], b"db.internal");
            assert_eq!(
                u16::from_be_bytes([rest[head[4] as usize], rest[head[4] as usize + 1]]),
                5432
            );
            stream
                .write_all(&[0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x13, 0x88])
                .await
                .expect("write socks connect response");
        });

        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                PathNode {
                    label: "local".to_string(),
                    host: None,
                    port: None,
                    kind: Some("local".to_string()),
                },
                PathNode {
                    label: "socks-proxy".to_string(),
                    host: Some("127.0.0.1".to_string()),
                    port: Some(port),
                    kind: Some("proxy".to_string()),
                },
                PathNode {
                    label: "db".to_string(),
                    host: Some("db.internal".to_string()),
                    port: Some(5432),
                    kind: Some("target".to_string()),
                },
            ],
            proxy: Some(PathProxy {
                kind: "socks5".to_string(),
                host: Some("127.0.0.1".to_string()),
                port: Some(port),
                username: None,
                password: None,
                cmd: None,
            }),
            timeout_ms: Some(1_000),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "ok");
        assert_eq!(results[1].status, "ok");
        assert!(results[1].message.contains("socks5 proxy connected"));
        proxy.await.unwrap();
    }

    #[cfg(not(windows))]
    #[tokio::test]
    async fn probes_proxy_command_edge() {
        let results = test_connection_path(JumpTestRequest {
            nodes: vec![
                PathNode {
                    label: "local".to_string(),
                    host: None,
                    port: None,
                    kind: Some("local".to_string()),
                },
                PathNode {
                    label: "ProxyCommand".to_string(),
                    host: None,
                    port: None,
                    kind: Some("proxy".to_string()),
                },
                PathNode {
                    label: "target".to_string(),
                    host: Some("db.internal".to_string()),
                    port: Some(2222),
                    kind: Some("target".to_string()),
                },
            ],
            proxy: Some(PathProxy {
                kind: "cmd".to_string(),
                host: None,
                port: None,
                username: None,
                password: None,
                cmd: Some("printf 'SSH-2.0-relay-test %h %p\\n'".to_string()),
            }),
            timeout_ms: Some(1_000),
        })
        .await
        .unwrap();

        assert_eq!(results[0].status, "ok");
        assert!(results[0].message.contains("ProxyCommand configured"));
        assert_eq!(results[1].status, "ok");
        assert!(results[1].message.contains("ProxyCommand connected"));
        assert!(results[1].latency_ms.is_some());
    }

    #[tokio::test]
    async fn rejects_invalid_proxy_settings() {
        let err = test_connection_path(JumpTestRequest {
            nodes: vec![
                node("local", None, None),
                node("target", Some("127.0.0.1"), Some(22)),
            ],
            proxy: Some(PathProxy {
                kind: "cmd".to_string(),
                host: None,
                port: None,
                username: None,
                password: None,
                cmd: Some("connect %h".to_string()),
            }),
            timeout_ms: Some(100),
        })
        .await
        .unwrap_err();

        assert!(err.to_string().contains("ProxyCommand"));
    }
}
