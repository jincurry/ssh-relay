use anyhow::{Context, Result};
use russh::keys::known_hosts::{check_known_hosts, learn_known_hosts};
#[cfg(test)]
use russh::keys::known_hosts::{check_known_hosts_path, learn_known_hosts_path};
use russh::keys::ssh_key::{HashAlg, PublicKey};
#[cfg(test)]
use std::path::Path;

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum HostKeyStatus {
    Known,
    Unknown { fingerprint: String },
    Changed { line: usize, fingerprint: String },
}

pub fn check_host_key(host: &str, port: u16, pubkey: &PublicKey) -> Result<HostKeyStatus> {
    classify_check_result(check_known_hosts(host, port, pubkey), pubkey)
}

#[cfg(test)]
pub fn check_host_key_path(
    host: &str,
    port: u16,
    pubkey: &PublicKey,
    path: &Path,
) -> Result<HostKeyStatus> {
    classify_check_result(check_known_hosts_path(host, port, pubkey, path), pubkey)
}

pub fn learn_host_key(host: &str, port: u16, pubkey: &PublicKey) -> Result<()> {
    learn_known_hosts(host, port, pubkey).context("failed to record host key")
}

#[cfg(test)]
pub fn learn_host_key_path(host: &str, port: u16, pubkey: &PublicKey, path: &Path) -> Result<()> {
    learn_known_hosts_path(host, port, pubkey, path).context("failed to record host key")
}

pub fn public_key_fingerprint(pubkey: &PublicKey) -> String {
    pubkey.fingerprint(HashAlg::Sha256).to_string()
}

fn classify_check_result(
    result: Result<bool, russh::keys::Error>,
    pubkey: &PublicKey,
) -> Result<HostKeyStatus> {
    match result {
        Ok(true) => Ok(HostKeyStatus::Known),
        Ok(false) => Ok(HostKeyStatus::Unknown {
            fingerprint: public_key_fingerprint(pubkey),
        }),
        Err(russh::keys::Error::KeyChanged { line }) => Ok(HostKeyStatus::Changed {
            line,
            fingerprint: public_key_fingerprint(pubkey),
        }),
        Err(err) => Err(err).context("failed to read known_hosts"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use russh::keys::parse_public_key_base64;
    use std::fs;
    use std::path::PathBuf;

    fn temp_known_hosts(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("relay-known-hosts-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        root.join("known_hosts")
    }

    fn key_one() -> PublicKey {
        parse_public_key_base64(
            "AAAAC3NzaC1lZDI1NTE5AAAAIJdD7y3aLq454yWBdwLWbieU1ebz9/cu7/QEXn9OIeZJ",
        )
        .expect("parse key")
    }

    fn key_two() -> PublicKey {
        parse_public_key_base64(
            "AAAAC3NzaC1lZDI1NTE5AAAAIA6rWI3G1sz07DnfFlrouTcysQlj2P+jpNSOEWD9OJ3X",
        )
        .expect("parse key")
    }

    #[test]
    fn classifies_unknown_and_records_known_host() {
        let path = temp_known_hosts("learn");
        let key = key_one();

        let unknown =
            check_host_key_path("example.test", 2222, &key, &path).expect("check unknown");
        assert_eq!(
            unknown,
            HostKeyStatus::Unknown {
                fingerprint: public_key_fingerprint(&key),
            }
        );

        learn_host_key_path("example.test", 2222, &key, &path).expect("learn key");
        assert_eq!(
            check_host_key_path("example.test", 2222, &key, &path).expect("check known"),
            HostKeyStatus::Known
        );

        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn detects_changed_key_with_line_number() {
        let path = temp_known_hosts("changed");
        let old_key = key_one();
        let new_key = key_two();
        learn_host_key_path("example.test", 22, &old_key, &path).expect("learn key");

        assert_eq!(
            check_host_key_path("example.test", 22, &new_key, &path).expect("check changed"),
            HostKeyStatus::Changed {
                line: 2,
                fingerprint: public_key_fingerprint(&new_key),
            }
        );

        fs::remove_file(path).expect("cleanup");
    }
}
