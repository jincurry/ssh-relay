use anyhow::{bail, Context, Result};
use russh::client::{self, KeyboardInteractiveAuthResponse, Prompt};
use russh::keys::agent::{client::AgentClient, AgentIdentity};
use russh::keys::ssh_key::PublicKey;
use russh::keys::{key::PrivateKeyWithHashAlg, load_secret_key};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub struct SshAuth<'a> {
    pub user: &'a str,
    pub password: Option<&'a str>,
    pub private_key_path: Option<&'a str>,
    pub private_key_passphrase: Option<&'a str>,
    pub totp_code: Option<&'a str>,
    pub rejected_message: &'a str,
}

pub async fn authenticate_with_fallbacks<H>(
    session: &mut client::Handle<H>,
    req: SshAuth<'_>,
) -> Result<()>
where
    H: client::Handler,
{
    if let Some(path) = req.private_key_path.filter(|p| !p.trim().is_empty()) {
        let key_path = expand_private_key_path(path);
        if authenticate_with_agent(session, req.user, &key_path).await? {
            return Ok(());
        }
        let key = load_secret_key(&key_path, req.private_key_passphrase)
            .with_context(|| format!("failed to load private key at {}", key_path.display()))?;
        let hash = session.best_supported_rsa_hash().await?.flatten();
        let auth = session
            .authenticate_publickey(
                req.user.to_string(),
                PrivateKeyWithHashAlg::new(Arc::new(key), hash),
            )
            .await
            .context("public key authentication failed")?;
        if auth.success() {
            return Ok(());
        }
    }

    if let Some(password) = req.password.filter(|p| !p.is_empty()) {
        let auth = session
            .authenticate_password(req.user.to_string(), password.to_string())
            .await
            .context("password authentication failed")?;
        if auth.success() {
            return Ok(());
        }
    }

    if authenticate_keyboard_interactive(session, &req).await? {
        return Ok(());
    }

    bail!("{}", req.rejected_message)
}

async fn authenticate_with_agent<H>(
    session: &mut client::Handle<H>,
    user: &str,
    key_path: &Path,
) -> Result<bool>
where
    H: client::Handler,
{
    let Some(mut agent) = connect_agent().await else {
        return Ok(false);
    };
    let identities = match agent.request_identities().await {
        Ok(identities) => identities,
        Err(_) => return Ok(false),
    };
    let Some(identity) = select_agent_identity(&identities, key_path) else {
        return Ok(false);
    };
    let hash = session.best_supported_rsa_hash().await?.flatten();
    let auth = session
        .authenticate_publickey_with(
            user.to_string(),
            identity.public_key().into_owned(),
            hash,
            &mut agent,
        )
        .await
        .context("ssh-agent public key authentication failed")?;
    Ok(auth.success())
}

async fn connect_agent(
) -> Option<AgentClient<impl russh::keys::agent::client::AgentStream + Send + Unpin>> {
    AgentClient::connect_env().await.ok()
}

fn select_agent_identity<'a>(
    identities: &'a [AgentIdentity],
    key_path: &Path,
) -> Option<&'a AgentIdentity> {
    if let Some(public_key) = load_public_key_for_identity_file(key_path) {
        if let Some(identity) = identities
            .iter()
            .find(|identity| identity.public_key().as_ref() == &public_key)
        {
            return Some(identity);
        }
    }

    identities.iter().find(|identity| {
        let comment = identity.comment();
        !comment.is_empty()
            && (Path::new(comment) == key_path
                || key_path
                    .file_name()
                    .is_some_and(|name| comment.ends_with(&name.to_string_lossy().to_string())))
    })
}

fn load_public_key_for_identity_file(key_path: &Path) -> Option<PublicKey> {
    let public_key_path = public_key_path_for_identity_file(key_path);
    let text = fs::read_to_string(public_key_path).ok()?;
    PublicKey::from_openssh(text.trim()).ok()
}

fn public_key_path_for_identity_file(key_path: &Path) -> PathBuf {
    let mut value = key_path.as_os_str().to_os_string();
    value.push(".pub");
    PathBuf::from(value)
}

async fn authenticate_keyboard_interactive<H>(
    session: &mut client::Handle<H>,
    req: &SshAuth<'_>,
) -> Result<bool>
where
    H: client::Handler,
{
    if req.password.filter(|value| !value.is_empty()).is_none()
        && req.totp_code.filter(|value| !value.is_empty()).is_none()
    {
        return Ok(false);
    }

    let mut response = session
        .authenticate_keyboard_interactive_start(req.user.to_string(), Some(String::new()))
        .await
        .context("keyboard-interactive authentication failed")?;

    for _ in 0..8 {
        match response {
            KeyboardInteractiveAuthResponse::Success => return Ok(true),
            KeyboardInteractiveAuthResponse::Failure { .. } => return Ok(false),
            KeyboardInteractiveAuthResponse::InfoRequest {
                name,
                instructions,
                prompts,
            } => {
                let Some(responses) = keyboard_interactive_responses(
                    &name,
                    &instructions,
                    &prompts,
                    req.password,
                    req.totp_code,
                ) else {
                    return Ok(false);
                };
                response = session
                    .authenticate_keyboard_interactive_respond(responses)
                    .await
                    .context("keyboard-interactive authentication response failed")?;
            }
        }
    }

    bail!("keyboard-interactive authentication sent too many prompt rounds")
}

fn keyboard_interactive_responses(
    name: &str,
    instructions: &str,
    prompts: &[Prompt],
    password: Option<&str>,
    totp_code: Option<&str>,
) -> Option<Vec<String>> {
    let context = format!("{name}\n{instructions}");
    let mut responses = Vec::with_capacity(prompts.len());
    for prompt in prompts {
        let value = response_for_prompt(&context, &prompt.prompt, password, totp_code)?;
        responses.push(value);
    }
    Some(responses)
}

fn response_for_prompt(
    context: &str,
    prompt: &str,
    password: Option<&str>,
    totp_code: Option<&str>,
) -> Option<String> {
    let prompt_lc = prompt.to_lowercase();
    let context_lc = context.to_lowercase();
    let combined = format!("{context_lc}\n{prompt_lc}");

    if is_totp_prompt(&combined) {
        return Some(totp_code.filter(|value| !value.is_empty())?.to_string());
    }
    if is_password_prompt(&prompt_lc) {
        return Some(password.filter(|value| !value.is_empty())?.to_string());
    }
    if prompt.trim().is_empty() {
        return Some(String::new());
    }

    None
}

fn is_password_prompt(prompt: &str) -> bool {
    prompt.contains("password") || prompt.contains("passphrase")
}

fn is_totp_prompt(text: &str) -> bool {
    text.contains("otp")
        || text.contains("totp")
        || text.contains("2fa")
        || text.contains("two-factor")
        || text.contains("two factor")
        || text.contains("one-time")
        || text.contains("one time")
        || text.contains("authenticator")
        || text.contains("verification code")
        || text.contains("security code")
        || text.contains("token")
        || text.contains("passcode")
}

pub fn expand_private_key_path(path: &str) -> PathBuf {
    if path == "~" {
        if let Some(home) = home_dir() {
            return home;
        }
    }

    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }

    PathBuf::from(path)
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prompt(text: &str) -> Prompt {
        Prompt {
            prompt: text.to_string(),
            echo: false,
        }
    }

    #[test]
    fn answers_keyboard_interactive_password_and_totp_prompts() {
        let responses = keyboard_interactive_responses(
            "SSH",
            "Enter credentials",
            &[prompt("Password:"), prompt("Verification code:")],
            Some("secret"),
            Some("123456"),
        )
        .expect("responses");

        assert_eq!(responses, vec!["secret", "123456"]);
    }

    #[test]
    fn rejects_unknown_keyboard_interactive_prompts() {
        assert!(keyboard_interactive_responses(
            "SSH",
            "",
            &[prompt("Mother's maiden name:")],
            Some("secret"),
            Some("123456"),
        )
        .is_none());
    }

    #[test]
    fn detects_totp_prompts_from_context() {
        let responses = keyboard_interactive_responses(
            "Two factor authentication",
            "",
            &[prompt("Code:")],
            Some("secret"),
            Some("654321"),
        )
        .expect("responses");

        assert_eq!(responses, vec!["654321"]);
    }

    #[test]
    fn expands_tilde_private_key_paths() {
        let expanded = expand_private_key_path("~/.ssh/id_ed25519");
        assert!(expanded.ends_with(PathBuf::from(".ssh").join("id_ed25519")));
    }

    #[test]
    fn derives_openssh_public_key_sidecar_path() {
        assert_eq!(
            public_key_path_for_identity_file(Path::new("/home/deploy/.ssh/id_ed25519")),
            PathBuf::from("/home/deploy/.ssh/id_ed25519.pub")
        );
    }

    #[test]
    fn selects_agent_identity_by_comment_path() {
        let key = PublicKey::from_openssh(
            "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ deploy@test",
        )
        .expect("public key");
        let identity = AgentIdentity::PublicKey {
            key,
            comment: "/home/deploy/.ssh/id_ed25519".to_string(),
        };

        assert!(
            select_agent_identity(&[identity], Path::new("/home/deploy/.ssh/id_ed25519")).is_some()
        );
    }

    #[test]
    fn selects_agent_identity_by_public_key_sidecar() {
        let root = env::temp_dir().join(format!("relay-auth-agent-test-{}", std::process::id()));
        fs::create_dir_all(&root).expect("temp dir");
        let key_path = root.join("id_ed25519");
        let public_key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ deploy@test";
        fs::write(public_key_path_for_identity_file(&key_path), public_key).expect("pub key");
        let key = PublicKey::from_openssh(public_key).expect("public key");
        let identity = AgentIdentity::PublicKey {
            key,
            comment: "unrelated-comment".to_string(),
        };

        assert!(select_agent_identity(&[identity], &key_path).is_some());
        fs::remove_dir_all(root).expect("cleanup");
    }
}
