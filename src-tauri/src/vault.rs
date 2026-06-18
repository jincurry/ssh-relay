use anyhow::{bail, Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use data_encoding::{BASE32, BASE32_NOPAD};
use hmac::{Hmac, Mac};
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha1 = Hmac<Sha1>;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Credential {
    name: String,
    kind: String,
    fingerprint: String,
    used: u8,
    path: Option<String>,
    private_path: Option<String>,
    status: String,
    message: Option<String>,
}

#[tauri::command]
pub fn list_credentials() -> Vec<Credential> {
    list_ssh_public_keys(&default_ssh_dir()).unwrap_or_default()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairCredentialRequest {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRepairResult {
    path: String,
    status: String,
    message: String,
}

#[tauri::command]
pub fn repair_private_key_permissions(
    req: RepairCredentialRequest,
) -> Result<CredentialRepairResult, String> {
    repair_private_key_permissions_inner(Path::new(&req.path)).map_err(|err| err.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainSecretRequest {
    host: String,
    port: Option<u16>,
    user: String,
    kind: String,
    private_key_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKeychainSecretRequest {
    host: String,
    port: Option<u16>,
    user: String,
    kind: String,
    private_key_path: Option<String>,
    secret: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainSecretResponse {
    found: bool,
    secret: Option<String>,
    account: String,
    message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainWriteResponse {
    saved: bool,
    account: String,
    message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TotpSecretRequest {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTotpSecretRequest {
    id: String,
    secret: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TotpCodeRequest {
    id: String,
    digits: Option<u8>,
    period: Option<u64>,
    timestamp: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TotpCodeResponse {
    code: String,
    remaining_seconds: u64,
    period: u64,
    digits: u8,
    account: String,
}

#[tauri::command]
pub fn get_keychain_secret(req: KeychainSecretRequest) -> Result<KeychainSecretResponse, String> {
    get_keychain_secret_inner(&req).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_keychain_secret(
    req: SaveKeychainSecretRequest,
) -> Result<KeychainWriteResponse, String> {
    save_keychain_secret_inner(&req).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_keychain_secret(req: KeychainSecretRequest) -> Result<KeychainWriteResponse, String> {
    delete_keychain_secret_inner(&req).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn save_totp_secret(req: SaveTotpSecretRequest) -> Result<KeychainWriteResponse, String> {
    save_totp_secret_inner(&req).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_totp_code(req: TotpCodeRequest) -> Result<TotpCodeResponse, String> {
    get_totp_code_inner(&req).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn delete_totp_secret(req: TotpSecretRequest) -> Result<KeychainWriteResponse, String> {
    delete_totp_secret_inner(&req).map_err(|err| err.to_string())
}

fn list_ssh_public_keys(dir: &Path) -> Result<Vec<Credential>> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }

    for entry in fs::read_dir(dir).with_context(|| format!("failed to read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("pub") {
            continue;
        }
        if let Ok(credential) = credential_from_public_key(&path) {
            out.push(credential);
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn credential_from_public_key(path: &Path) -> Result<Credential> {
    let text =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    parse_public_key(path, &text)
}

fn parse_public_key(path: &Path, text: &str) -> Result<Credential> {
    let mut parts = text.split_whitespace();
    let key_type = parts.next().context("public key type is missing")?;
    let blob = parts.next().context("public key blob is missing")?;
    let decoded = STANDARD
        .decode(blob)
        .context("public key blob is not base64")?;
    let fingerprint = openssh_sha256_fingerprint(&decoded);
    let name = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("ssh-key")
        .to_string();

    let private_path = private_key_path(path);
    let private_status = private_key_status(&private_path);

    Ok(Credential {
        name,
        kind: key_kind(key_type).to_string(),
        fingerprint,
        used: 0,
        path: Some(path.to_string_lossy().to_string()),
        private_path: Some(private_path.to_string_lossy().to_string()),
        status: private_status.status,
        message: private_status.message,
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PrivateKeyStatus {
    status: String,
    message: Option<String>,
}

fn private_key_path(public_key_path: &Path) -> PathBuf {
    match public_key_path.file_stem() {
        Some(stem) => public_key_path.with_file_name(stem),
        None => public_key_path.to_path_buf(),
    }
}

fn private_key_status(path: &Path) -> PrivateKeyStatus {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => {
            return PrivateKeyStatus {
                status: "missing".to_string(),
                message: Some("matching private key was not found".to_string()),
            }
        }
    };

    if !metadata.is_file() {
        return PrivateKeyStatus {
            status: "warning".to_string(),
            message: Some("matching private key path is not a regular file".to_string()),
        };
    }

    #[cfg(unix)]
    {
        let mode = metadata.permissions().mode() & 0o777;
        if mode & 0o077 != 0 {
            return PrivateKeyStatus {
                status: "warning".to_string(),
                message: Some(format!(
                    "private key permissions {mode:03o} are too open; use chmod 600"
                )),
            };
        }
    }

    PrivateKeyStatus {
        status: "ready".to_string(),
        message: Some("private key is present".to_string()),
    }
}

fn repair_private_key_permissions_inner(path: &Path) -> Result<CredentialRepairResult> {
    if path.as_os_str().is_empty() {
        bail!("private key path is required");
    }
    if path.extension().and_then(|ext| ext.to_str()) == Some("pub") {
        bail!("select the private key, not the .pub file");
    }
    let metadata =
        fs::metadata(path).with_context(|| format!("failed to read {}", path.display()))?;
    if !metadata.is_file() {
        bail!("{} is not a regular file", path.display());
    }

    #[cfg(unix)]
    {
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o600);
        fs::set_permissions(path, permissions)
            .with_context(|| format!("failed to update {}", path.display()))?;
        let status = private_key_status(path);
        return Ok(CredentialRepairResult {
            path: path.to_string_lossy().to_string(),
            status: status.status,
            message: status
                .message
                .unwrap_or_else(|| "private key permissions repaired".to_string()),
        });
    }

    #[cfg(not(unix))]
    {
        bail!("automatic private key permission repair is only available on Unix-like systems")
    }
}

const KEYCHAIN_SERVICE: &str = "RELAY SSH Manager";

fn get_keychain_secret_inner(req: &KeychainSecretRequest) -> Result<KeychainSecretResponse> {
    validate_keychain_request(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    )?;
    let account = keychain_account(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    );
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(KeychainSecretResponse {
            found: true,
            secret: Some(secret),
            account,
            message: Some("secret loaded from system keychain".to_string()),
        }),
        Err(KeyringError::NoEntry) => Ok(KeychainSecretResponse {
            found: false,
            secret: None,
            account,
            message: Some("secret not found in system keychain".to_string()),
        }),
        Err(err) => {
            Err(err).with_context(|| format!("failed to read system keychain entry {account}"))
        }
    }
}

fn save_keychain_secret_inner(req: &SaveKeychainSecretRequest) -> Result<KeychainWriteResponse> {
    validate_keychain_request(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    )?;
    if req.secret.is_empty() {
        bail!("secret is required");
    }

    let account = keychain_account(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    );
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    entry
        .set_password(&req.secret)
        .with_context(|| format!("failed to save system keychain entry {account}"))?;

    Ok(KeychainWriteResponse {
        saved: true,
        account,
        message: "secret saved to system keychain".to_string(),
    })
}

fn delete_keychain_secret_inner(req: &KeychainSecretRequest) -> Result<KeychainWriteResponse> {
    validate_keychain_request(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    )?;
    let account = keychain_account(
        &req.host,
        req.port,
        &req.user,
        &req.kind,
        req.private_key_path.as_deref(),
    );
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(KeychainWriteResponse {
            saved: false,
            account,
            message: "secret deleted from system keychain".to_string(),
        }),
        Err(KeyringError::NoEntry) => Ok(KeychainWriteResponse {
            saved: false,
            account,
            message: "secret was not present in system keychain".to_string(),
        }),
        Err(err) => {
            Err(err).with_context(|| format!("failed to delete system keychain entry {account}"))
        }
    }
}

fn save_totp_secret_inner(req: &SaveTotpSecretRequest) -> Result<KeychainWriteResponse> {
    validate_totp_id(&req.id)?;
    decode_totp_secret(&req.secret)?;

    let account = totp_keychain_account(&req.id);
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    entry
        .set_password(&normalize_totp_secret(&req.secret))
        .with_context(|| format!("failed to save system keychain entry {account}"))?;

    Ok(KeychainWriteResponse {
        saved: true,
        account,
        message: "TOTP secret saved to system keychain".to_string(),
    })
}

fn get_totp_code_inner(req: &TotpCodeRequest) -> Result<TotpCodeResponse> {
    validate_totp_id(&req.id)?;
    let digits = req.digits.unwrap_or(6);
    let period = req.period.unwrap_or(30);
    validate_totp_params(digits, period)?;

    let account = totp_keychain_account(&req.id);
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    let secret = entry
        .get_password()
        .with_context(|| format!("failed to read system keychain entry {account}"))?;
    let timestamp = req.timestamp.unwrap_or_else(current_unix_timestamp);
    let (code, remaining_seconds) = generate_totp_code(&secret, timestamp, period, digits)?;

    Ok(TotpCodeResponse {
        code,
        remaining_seconds,
        period,
        digits,
        account,
    })
}

fn delete_totp_secret_inner(req: &TotpSecretRequest) -> Result<KeychainWriteResponse> {
    validate_totp_id(&req.id)?;
    let account = totp_keychain_account(&req.id);
    let entry = Entry::new(KEYCHAIN_SERVICE, &account)
        .with_context(|| format!("failed to open system keychain entry {account}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(KeychainWriteResponse {
            saved: false,
            account,
            message: "TOTP secret deleted from system keychain".to_string(),
        }),
        Err(KeyringError::NoEntry) => Ok(KeychainWriteResponse {
            saved: false,
            account,
            message: "TOTP secret was not present in system keychain".to_string(),
        }),
        Err(err) => {
            Err(err).with_context(|| format!("failed to delete system keychain entry {account}"))
        }
    }
}

fn validate_keychain_request(
    host: &str,
    port: Option<u16>,
    user: &str,
    kind: &str,
    private_key_path: Option<&str>,
) -> Result<()> {
    if host.trim().is_empty() {
        bail!("host is required");
    }
    if user.trim().is_empty() {
        bail!("user is required");
    }
    if port == Some(0) {
        bail!("port is required");
    }
    match kind {
        "password" | "proxyPassword" => Ok(()),
        "privateKeyPassphrase" => {
            if private_key_path.unwrap_or("").trim().is_empty() {
                bail!("privateKeyPath is required for private key passphrases");
            }
            Ok(())
        }
        _ => bail!("unsupported keychain secret kind: {kind}"),
    }
}

fn keychain_account(
    host: &str,
    port: Option<u16>,
    user: &str,
    kind: &str,
    private_key_path: Option<&str>,
) -> String {
    let host = host.trim().to_lowercase();
    let user = user.trim();
    let port = port.unwrap_or(22);
    match kind {
        "privateKeyPassphrase" => format!(
            "ssh:private-key-passphrase:{user}@{host}:{port}:{}",
            private_key_path.unwrap_or("").trim()
        ),
        "proxyPassword" => format!("proxy:password:{user}@{host}:{port}"),
        _ => format!("ssh:password:{user}@{host}:{port}"),
    }
}

fn totp_keychain_account(id: &str) -> String {
    format!("totp:{}", id.trim())
}

fn validate_totp_id(id: &str) -> Result<()> {
    let value = id.trim();
    if value.is_empty() {
        bail!("TOTP id is required");
    }
    if value.len() > 128 {
        bail!("TOTP id is too long");
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '@'))
    {
        bail!("TOTP id may only contain letters, numbers, dash, underscore, dot, or @");
    }
    Ok(())
}

fn validate_totp_params(digits: u8, period: u64) -> Result<()> {
    if !(6..=8).contains(&digits) {
        bail!("TOTP digits must be between 6 and 8");
    }
    if !(15..=120).contains(&period) {
        bail!("TOTP period must be between 15 and 120 seconds");
    }
    Ok(())
}

fn normalize_totp_secret(secret: &str) -> String {
    secret
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace() && *ch != '-' && *ch != '=')
        .flat_map(|ch| ch.to_uppercase())
        .collect()
}

fn decode_totp_secret(secret: &str) -> Result<Vec<u8>> {
    let normalized = normalize_totp_secret(secret);
    if normalized.is_empty() {
        bail!("TOTP secret is required");
    }
    if let Ok(decoded) = BASE32_NOPAD.decode(normalized.as_bytes()) {
        return Ok(decoded);
    }
    let pad_len = (8 - (normalized.len() % 8)) % 8;
    let padded = format!("{}{}", normalized, "=".repeat(pad_len));
    BASE32
        .decode(padded.as_bytes())
        .context("TOTP secret must be base32")
}

fn generate_totp_code(
    secret: &str,
    timestamp: u64,
    period: u64,
    digits: u8,
) -> Result<(String, u64)> {
    validate_totp_params(digits, period)?;
    let key = decode_totp_secret(secret)?;
    let counter = timestamp / period;
    let mut mac = HmacSha1::new_from_slice(&key).context("failed to initialize TOTP HMAC")?;
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let binary = ((u32::from(digest[offset]) & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);
    let modulus = 10_u32.pow(u32::from(digits));
    let code = binary % modulus;
    let remaining_seconds = period - (timestamp % period);
    Ok((
        format!("{code:0width$}", width = digits as usize),
        remaining_seconds,
    ))
}

fn current_unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn openssh_sha256_fingerprint(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let encoded = base64::engine::general_purpose::STANDARD_NO_PAD.encode(digest);
    format!("SHA256:{encoded}")
}

fn key_kind(key_type: &str) -> &str {
    match key_type {
        "ssh-ed25519" => "ED25519 key",
        "ssh-rsa" => "RSA key",
        "ecdsa-sha2-nistp256" => "ECDSA P-256 key",
        "ecdsa-sha2-nistp384" => "ECDSA P-384 key",
        "ecdsa-sha2-nistp521" => "ECDSA P-521 key",
        other => other,
    }
}

fn default_ssh_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("relay-vault-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    #[test]
    fn computes_openssh_sha256_fingerprint_without_padding() {
        assert_eq!(
            openssh_sha256_fingerprint(b"hello"),
            "SHA256:LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ"
        );
    }

    #[test]
    fn parses_public_key_metadata() {
        let dir = temp_root("parse");
        let path = dir.join("id_ed25519.pub");
        fs::write(&path, "ssh-ed25519 aGVsbG8= work key\n").expect("write pub key");
        let credential = credential_from_public_key(&path).expect("parse pub key");
        assert_eq!(credential.name, "id_ed25519");
        assert_eq!(credential.kind, "ED25519 key");
        assert_eq!(
            credential.fingerprint,
            "SHA256:LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ"
        );
        assert_eq!(credential.path, Some(path.to_string_lossy().to_string()));
        assert_eq!(
            credential.private_path,
            Some(dir.join("id_ed25519").to_string_lossy().to_string())
        );
        assert_eq!(credential.status, "missing");
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn lists_public_keys_sorted_and_skips_invalid_files() {
        let dir = temp_root("list");
        fs::write(dir.join("z_key.pub"), "not-a-valid-key\n").expect("write invalid key");
        fs::write(dir.join("b_key.pub"), "ssh-rsa aGVsbG8=\n").expect("write rsa key");
        fs::write(dir.join("a_key.pub"), "ssh-ed25519 aGVsbG8=\n").expect("write ed25519 key");
        fs::write(dir.join("private_key"), "secret").expect("write private key");
        let credentials = list_ssh_public_keys(&dir).expect("list keys");
        assert_eq!(
            credentials
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>(),
            vec!["a_key", "b_key"]
        );
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn returns_empty_credentials_when_ssh_dir_is_missing() {
        let dir = std::env::temp_dir().join(format!(
            "relay-vault-test-missing-dir-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);

        let credentials = list_ssh_public_keys(&dir).expect("list missing dir");

        assert!(credentials.is_empty());
    }

    #[test]
    fn returns_empty_credentials_when_no_public_keys_are_present() {
        let dir = temp_root("empty-list");
        fs::write(dir.join("id_ed25519"), "secret").expect("write private key");

        let credentials = list_ssh_public_keys(&dir).expect("list empty dir");

        assert!(credentials.is_empty());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn reports_missing_private_key_for_public_key() {
        let dir = temp_root("missing-private");
        let public_path = dir.join("id_missing.pub");
        fs::write(&public_path, "ssh-ed25519 aGVsbG8=\n").expect("write pub key");

        let credential = credential_from_public_key(&public_path).expect("parse public key");

        assert_eq!(credential.status, "missing");
        assert!(credential
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("not found"));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn builds_stable_keychain_accounts() {
        assert_eq!(
            keychain_account(" Example.COM ", Some(2222), "deploy", "password", None),
            "ssh:password:deploy@example.com:2222"
        );
        assert_eq!(
            keychain_account(
                "example.com",
                None,
                "deploy",
                "privateKeyPassphrase",
                Some(" ~/.ssh/id_ed25519 ")
            ),
            "ssh:private-key-passphrase:deploy@example.com:22:~/.ssh/id_ed25519"
        );
        assert_eq!(
            keychain_account(" proxy.local ", Some(8080), "edge", "proxyPassword", None),
            "proxy:password:edge@proxy.local:8080"
        );
    }

    #[test]
    fn validates_keychain_secret_requests() {
        assert!(
            validate_keychain_request("example.com", Some(22), "deploy", "password", None).is_ok()
        );
        assert!(validate_keychain_request(
            "proxy.local",
            Some(8080),
            "edge",
            "proxyPassword",
            None
        )
        .is_ok());
        assert!(validate_keychain_request(
            "example.com",
            Some(22),
            "deploy",
            "privateKeyPassphrase",
            Some("~/.ssh/id_ed25519")
        )
        .is_ok());
        assert!(validate_keychain_request("", Some(22), "deploy", "password", None).is_err());
        assert!(
            validate_keychain_request("example.com", Some(0), "deploy", "password", None).is_err()
        );
        assert!(validate_keychain_request(
            "example.com",
            Some(22),
            "deploy",
            "privateKeyPassphrase",
            None
        )
        .is_err());
        assert!(
            validate_keychain_request("example.com", Some(22), "deploy", "totp", None).is_err()
        );
    }

    #[test]
    fn builds_stable_totp_keychain_accounts() {
        assert_eq!(totp_keychain_account(" prod-2fa "), "totp:prod-2fa");
    }

    #[test]
    fn generates_rfc6238_totp_codes() {
        let secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        let vectors = [
            (59, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
            (20000000000, "65353130"),
        ];

        for (timestamp, expected) in vectors {
            let (code, remaining) =
                generate_totp_code(secret, timestamp, 30, 8).expect("generate TOTP");
            assert_eq!(code, expected);
            assert!(remaining >= 1 && remaining <= 30);
        }
    }

    #[test]
    fn normalizes_and_validates_totp_secrets() {
        assert_eq!(
            normalize_totp_secret(" gezd gnbv-gy3t==== "),
            "GEZDGNBVGY3T"
        );
        assert!(decode_totp_secret("JBSWY3DPEHPK3PXP").is_ok());
        assert!(decode_totp_secret("not valid!").is_err());
        assert!(validate_totp_id("prod-2fa").is_ok());
        assert!(validate_totp_id("../bad").is_err());
        assert!(validate_totp_params(6, 30).is_ok());
        assert!(validate_totp_params(5, 30).is_err());
        assert!(validate_totp_params(6, 5).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn detects_too_open_private_key_permissions() {
        let dir = temp_root("open-private");
        let public_path = dir.join("id_open.pub");
        let private_path = dir.join("id_open");
        fs::write(&public_path, "ssh-ed25519 aGVsbG8=\n").expect("write pub key");
        fs::write(&private_path, "PRIVATE KEY").expect("write private key");
        fs::set_permissions(&private_path, fs::Permissions::from_mode(0o644))
            .expect("set open permissions");

        let credential = credential_from_public_key(&public_path).expect("parse public key");

        assert_eq!(credential.status, "warning");
        assert!(credential
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("644"));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn repairs_private_key_permissions_to_owner_read_write() {
        let dir = temp_root("repair-private");
        let private_path = dir.join("id_repair");
        fs::write(&private_path, "PRIVATE KEY").expect("write private key");
        fs::set_permissions(&private_path, fs::Permissions::from_mode(0o644))
            .expect("set open permissions");

        let result =
            repair_private_key_permissions_inner(&private_path).expect("repair permissions");
        let mode = fs::metadata(&private_path)
            .expect("metadata")
            .permissions()
            .mode()
            & 0o777;

        assert_eq!(mode, 0o600);
        assert_eq!(result.status, "ready");
        fs::remove_dir_all(dir).expect("cleanup");
    }
}
