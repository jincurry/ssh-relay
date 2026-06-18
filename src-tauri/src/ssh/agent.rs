#[cfg(unix)]
use russh::keys::agent::client::AgentClient;
use serde::Serialize;
use std::env;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshAgentStatus {
    pub available: bool,
    pub socket: Option<String>,
    pub identity_count: usize,
    pub status: &'static str,
    pub message: String,
}

#[tauri::command]
pub async fn ssh_agent_status() -> SshAgentStatus {
    let socket = env::var("SSH_AUTH_SOCK")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let Some(socket_value) = socket else {
        return missing_agent_status();
    };

    agent_status_for_socket(socket_value).await
}

#[cfg(unix)]
async fn agent_status_for_socket(socket_value: String) -> SshAgentStatus {
    match AgentClient::connect_env().await {
        Ok(mut agent) => match agent.request_identities().await {
            Ok(identities) => agent_status_from_identity_count(socket_value, identities.len()),
            Err(err) => agent_error_status(
                Some(socket_value),
                format!("failed to list ssh-agent identities: {err:?}"),
            ),
        },
        Err(err) => agent_error_status(
            Some(socket_value),
            format!("failed to connect to ssh-agent: {err:?}"),
        ),
    }
}

#[cfg(not(unix))]
async fn agent_status_for_socket(socket_value: String) -> SshAgentStatus {
    agent_error_status(
        Some(socket_value),
        "ssh-agent integration is not available on this platform".to_string(),
    )
}

fn missing_agent_status() -> SshAgentStatus {
    SshAgentStatus {
        available: false,
        socket: None,
        identity_count: 0,
        status: "missing",
        message: "SSH_AUTH_SOCK is not set".to_string(),
    }
}

fn agent_status_from_identity_count(socket: String, identity_count: usize) -> SshAgentStatus {
    let status = if identity_count == 0 {
        "empty"
    } else {
        "ready"
    };
    let message = if identity_count == 0 {
        "ssh-agent connected; no identities loaded".to_string()
    } else {
        format!("ssh-agent ready; {identity_count} identities loaded")
    };

    SshAgentStatus {
        available: true,
        socket: Some(socket),
        identity_count,
        status,
        message,
    }
}

fn agent_error_status(socket: Option<String>, message: String) -> SshAgentStatus {
    SshAgentStatus {
        available: false,
        socket,
        identity_count: 0,
        status: "error",
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_missing_agent_socket() {
        assert_eq!(
            missing_agent_status(),
            SshAgentStatus {
                available: false,
                socket: None,
                identity_count: 0,
                status: "missing",
                message: "SSH_AUTH_SOCK is not set".to_string(),
            }
        );
    }

    #[test]
    fn reports_empty_connected_agent() {
        assert_eq!(
            agent_status_from_identity_count("/tmp/agent.sock".to_string(), 0),
            SshAgentStatus {
                available: true,
                socket: Some("/tmp/agent.sock".to_string()),
                identity_count: 0,
                status: "empty",
                message: "ssh-agent connected; no identities loaded".to_string(),
            }
        );
    }

    #[test]
    fn reports_ready_agent_identity_count() {
        assert_eq!(
            agent_status_from_identity_count("/tmp/agent.sock".to_string(), 3),
            SshAgentStatus {
                available: true,
                socket: Some("/tmp/agent.sock".to_string()),
                identity_count: 3,
                status: "ready",
                message: "ssh-agent ready; 3 identities loaded".to_string(),
            }
        );
    }
}
