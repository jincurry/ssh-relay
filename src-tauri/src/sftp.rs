use crate::ssh::auth::{authenticate_with_fallbacks, SshAuth};
use crate::ssh::known_hosts::{check_host_key, learn_host_key, HostKeyStatus};
use crate::ssh::transport::{
    client_config, open_ssh_transport, validate_jump_hosts, validate_proxy_request,
    JumpHostRequest, ProxyRequest,
};
use anyhow::{bail, Context, Result};
use base64::Engine;
use russh::client;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, OpenFlags};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

const MAX_REMOTE_TEXT_BYTES: u64 = 1024 * 1024;
const MAX_IPC_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_TRANSFER_CHUNK_BYTES: u64 = 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalPathRequest {
    path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteTextRequest {
    path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirRequest {
    parent: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileRequest {
    parent: String,
    name: String,
    size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteLocalFileBase64Request {
    parent: String,
    name: String,
    content_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadLocalFileChunkBase64Request {
    path: String,
    offset: u64,
    length: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteLocalFileChunkBase64Request {
    path: String,
    offset: u64,
    content_base64: String,
    truncate: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TruncateLocalFileRequest {
    path: String,
    size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrzszPickUploadRequest {
    directory: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpListRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: Option<String>,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpReadTextRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpWriteTextRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    content: String,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpReadFileBase64Request {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpWriteFileBase64Request {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    content_base64: String,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpReadFileChunkBase64Request {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    offset: u64,
    length: u64,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpWriteFileChunkBase64Request {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    path: String,
    offset: u64,
    content_base64: String,
    truncate: Option<bool>,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSftpCreateDirRequest {
    host: String,
    port: Option<u16>,
    user: String,
    password: Option<String>,
    private_key_path: Option<String>,
    private_key_passphrase: Option<String>,
    totp_code: Option<String>,
    proxy: Option<ProxyRequest>,
    jump_hosts: Option<Vec<JumpHostRequest>>,
    parent: String,
    name: String,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

struct RemoteSftpAuth<'a> {
    host: &'a str,
    port: Option<u16>,
    user: &'a str,
    password: Option<&'a str>,
    private_key_path: Option<&'a str>,
    private_key_passphrase: Option<&'a str>,
    totp_code: Option<&'a str>,
    proxy: Option<&'a ProxyRequest>,
    jump_hosts: Option<&'a [JumpHostRequest]>,
    strict_host_key: Option<bool>,
    trust_unknown_host_key: Option<bool>,
    connect_timeout_ms: Option<u64>,
    server_alive_interval_ms: Option<u64>,
    server_alive_count_max: Option<usize>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirListing {
    path: String,
    parent: Option<String>,
    entries: Vec<LocalEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    name: String,
    path: String,
    kind: String,
    size: u64,
    mtime: String,
    editable: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChunkBase64 {
    content_base64: String,
    bytes_read: u64,
    total_size: u64,
    done: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDirListing {
    path: String,
    parent: Option<String>,
    entries: Vec<RemoteEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    name: String,
    path: String,
    kind: String,
    size: u64,
    mtime: String,
    editable: bool,
}

struct SftpClient {
    host: String,
    port: u16,
    strict_host_key: bool,
    trust_unknown_host_key: bool,
}

impl client::Handler for SftpClient {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if !self.strict_host_key {
            return Ok(true);
        }

        match check_host_key(&self.host, self.port, server_public_key)? {
            HostKeyStatus::Known => Ok(true),
            HostKeyStatus::Unknown { fingerprint } => {
                if self.trust_unknown_host_key {
                    learn_host_key(&self.host, self.port, server_public_key)?;
                    Ok(true)
                } else {
                    bail!(
                        "Unknown server key for {}:{} ({fingerprint})",
                        self.host,
                        self.port
                    );
                }
            }
            HostKeyStatus::Changed { line, fingerprint } => {
                bail!(
                    "Server key changed for {}:{}; known_hosts line {line}; received {fingerprint}",
                    self.host,
                    self.port
                )
            }
        }
    }
}

#[tauri::command]
pub fn list_local_dir(req: LocalPathRequest) -> Result<LocalDirListing, String> {
    let path = normalize_local_path(req.path.as_deref()).map_err(to_string)?;
    list_local_dir_inner(&path).map_err(to_string)
}

#[tauri::command]
pub fn get_local_path_info(req: LocalPathRequest) -> Result<LocalEntry, String> {
    let path = normalize_local_path(req.path.as_deref()).map_err(to_string)?;
    local_entry_from_path(&path).map_err(to_string)
}

#[tauri::command]
pub fn pick_trzsz_upload_paths(
    app: AppHandle,
    req: TrzszPickUploadRequest,
) -> Result<Vec<String>, String> {
    let dialog = app.dialog().file();
    if req.directory.unwrap_or(false) {
        let Some(path) = dialog.blocking_pick_folder() else {
            return Ok(Vec::new());
        };
        return file_path_to_string(path)
            .map(|path| vec![path])
            .map_err(to_string);
    }

    let Some(paths) = dialog.blocking_pick_files() else {
        return Ok(Vec::new());
    };
    paths
        .into_iter()
        .map(file_path_to_string)
        .collect::<Result<Vec<_>>>()
        .map_err(to_string)
}

#[tauri::command]
pub fn pick_trzsz_save_directory(app: AppHandle) -> Result<Option<String>, String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(file_path_to_string)
        .transpose()
        .map_err(to_string)
}

#[tauri::command]
pub fn read_local_text(path: String) -> Result<String, String> {
    let path = normalize_local_path(Some(&path)).map_err(to_string)?;
    validate_regular_file(&path).map_err(to_string)?;
    fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))
        .map_err(to_string)
}

#[tauri::command]
pub fn read_local_file_base64(path: String) -> Result<String, String> {
    let path = normalize_local_path(Some(&path)).map_err(to_string)?;
    validate_regular_file(&path).map_err(to_string)?;
    let meta = fs::metadata(&path)
        .with_context(|| format!("failed to stat {}", path.display()))
        .map_err(to_string)?;
    validate_ipc_file_size(meta.len(), &path.to_string_lossy()).map_err(to_string)?;
    fs::read(&path)
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))
        .with_context(|| format!("failed to read {}", path.display()))
        .map_err(to_string)
}

#[tauri::command]
pub fn read_local_file_chunk_base64(
    req: ReadLocalFileChunkBase64Request,
) -> Result<FileChunkBase64, String> {
    validate_chunk_length(req.length).map_err(to_string)?;
    let path = normalize_local_path(Some(&req.path)).map_err(to_string)?;
    validate_regular_file(&path).map_err(to_string)?;
    let meta = fs::metadata(&path)
        .with_context(|| format!("failed to stat {}", path.display()))
        .map_err(to_string)?;
    let mut file = fs::File::open(&path)
        .with_context(|| format!("failed to open {}", path.display()))
        .map_err(to_string)?;
    file.seek(SeekFrom::Start(req.offset))
        .with_context(|| format!("failed to seek {}", path.display()))
        .map_err(to_string)?;
    let mut buf = vec![0_u8; req.length as usize];
    let n = file
        .read(&mut buf)
        .with_context(|| format!("failed to read {}", path.display()))
        .map_err(to_string)?;
    buf.truncate(n);
    Ok(FileChunkBase64 {
        content_base64: base64::engine::general_purpose::STANDARD.encode(buf),
        bytes_read: n as u64,
        total_size: meta.len(),
        done: req.offset.saturating_add(n as u64) >= meta.len(),
    })
}

#[tauri::command]
pub fn write_local_text(req: WriteTextRequest) -> Result<(), String> {
    let path = normalize_local_path(Some(&req.path)).map_err(to_string)?;
    validate_local_file_write_target(&path).map_err(to_string)?;
    fs::write(&path, req.content)
        .with_context(|| format!("failed to write {}", path.display()))
        .map_err(to_string)
}

#[tauri::command]
pub fn write_local_file_base64(
    req: WriteLocalFileBase64Request,
) -> Result<LocalDirListing, String> {
    validate_entry_name(&req.name).map_err(to_string)?;
    let parent = normalize_local_path(Some(&req.parent)).map_err(to_string)?;
    if !parent.is_dir() {
        return Err(format!("{} is not a directory", parent.display()));
    }
    let path = parent.join(&req.name);
    validate_local_create_target_absent(&path).map_err(to_string)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.content_base64.as_bytes())
        .context("invalid base64 file content")
        .map_err(to_string)?;
    validate_ipc_file_size(bytes.len() as u64, &path.to_string_lossy()).map_err(to_string)?;
    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .with_context(|| format!("failed to create {}", path.display()))
        .map_err(to_string)?;
    file.write_all(&bytes)
        .with_context(|| format!("failed to write {}", path.display()))
        .map_err(to_string)?;
    list_local_dir_inner(&parent).map_err(to_string)
}

#[tauri::command]
pub fn write_local_file_chunk_base64(req: WriteLocalFileChunkBase64Request) -> Result<(), String> {
    let path = normalize_local_path(Some(&req.path)).map_err(to_string)?;
    validate_local_file_write_target(&path).map_err(to_string)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.content_base64.as_bytes())
        .context("invalid base64 file content")
        .map_err(to_string)?;
    validate_chunk_length(bytes.len() as u64).map_err(to_string)?;
    let mut options = fs::OpenOptions::new();
    options.create(true).write(true);
    if req.truncate.unwrap_or(false) {
        options.truncate(true);
    }
    let mut file = options
        .open(&path)
        .with_context(|| format!("failed to open {}", path.display()))
        .map_err(to_string)?;
    file.seek(SeekFrom::Start(req.offset))
        .with_context(|| format!("failed to seek {}", path.display()))
        .map_err(to_string)?;
    file.write_all(&bytes)
        .with_context(|| format!("failed to write {}", path.display()))
        .map_err(to_string)
}

#[tauri::command]
pub fn truncate_local_file(req: TruncateLocalFileRequest) -> Result<(), String> {
    let path = normalize_local_path(Some(&req.path)).map_err(to_string)?;
    validate_local_file_write_target(&path).map_err(to_string)?;
    let file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(&path)
        .with_context(|| format!("failed to open {}", path.display()))
        .map_err(to_string)?;
    file.set_len(req.size)
        .with_context(|| format!("failed to truncate {}", path.display()))
        .map_err(to_string)
}

#[tauri::command]
pub fn create_local_dir(req: CreateDirRequest) -> Result<LocalDirListing, String> {
    validate_entry_name(&req.name).map_err(to_string)?;
    let parent = normalize_local_path(Some(&req.parent)).map_err(to_string)?;
    fs::create_dir(parent.join(req.name))
        .with_context(|| format!("failed to create directory in {}", parent.display()))
        .map_err(to_string)?;
    list_local_dir_inner(&parent).map_err(to_string)
}

#[tauri::command]
pub fn create_local_file(req: CreateFileRequest) -> Result<LocalDirListing, String> {
    validate_entry_name(&req.name).map_err(to_string)?;
    let parent = normalize_local_path(Some(&req.parent)).map_err(to_string)?;
    if !parent.is_dir() {
        return Err(format!("{} is not a directory", parent.display()));
    }
    let path = parent.join(&req.name);
    validate_local_create_target_absent(&path).map_err(to_string)?;
    let file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .with_context(|| format!("failed to create {}", path.display()))
        .map_err(to_string)?;
    file.set_len(req.size)
        .with_context(|| format!("failed to size {}", path.display()))
        .map_err(to_string)?;
    list_local_dir_inner(&parent).map_err(to_string)
}

#[tauri::command]
pub async fn list_remote_sftp_dir(req: RemoteSftpListRequest) -> Result<RemoteDirListing, String> {
    validate_remote_sftp_auth(&remote_list_auth(&req)).map_err(to_string)?;
    list_remote_sftp_dir_inner(req).await.map_err(to_string)
}

#[tauri::command]
pub async fn read_remote_sftp_text(req: RemoteSftpReadTextRequest) -> Result<String, String> {
    validate_remote_sftp_auth(&remote_read_auth(&req)).map_err(to_string)?;
    read_remote_sftp_text_inner(req).await.map_err(to_string)
}

#[tauri::command]
pub async fn write_remote_sftp_text(
    req: RemoteSftpWriteTextRequest,
) -> Result<RemoteDirListing, String> {
    validate_remote_sftp_auth(&remote_write_auth(&req)).map_err(to_string)?;
    write_remote_sftp_text_inner(req).await.map_err(to_string)
}

#[tauri::command]
pub async fn read_remote_sftp_file_base64(
    req: RemoteSftpReadFileBase64Request,
) -> Result<String, String> {
    validate_remote_sftp_auth(&remote_read_file_auth(&req)).map_err(to_string)?;
    read_remote_sftp_file_base64_inner(req)
        .await
        .map_err(to_string)
}

#[tauri::command]
pub async fn read_remote_sftp_file_chunk_base64(
    req: RemoteSftpReadFileChunkBase64Request,
) -> Result<FileChunkBase64, String> {
    validate_remote_sftp_auth(&remote_read_file_chunk_auth(&req)).map_err(to_string)?;
    read_remote_sftp_file_chunk_base64_inner(req)
        .await
        .map_err(to_string)
}

#[tauri::command]
pub async fn write_remote_sftp_file_base64(
    req: RemoteSftpWriteFileBase64Request,
) -> Result<RemoteDirListing, String> {
    validate_remote_sftp_auth(&remote_write_file_auth(&req)).map_err(to_string)?;
    write_remote_sftp_file_base64_inner(req)
        .await
        .map_err(to_string)
}

#[tauri::command]
pub async fn write_remote_sftp_file_chunk_base64(
    req: RemoteSftpWriteFileChunkBase64Request,
) -> Result<(), String> {
    validate_remote_sftp_auth(&remote_write_file_chunk_auth(&req)).map_err(to_string)?;
    write_remote_sftp_file_chunk_base64_inner(req)
        .await
        .map_err(to_string)
}

#[tauri::command]
pub async fn create_remote_sftp_dir(
    req: RemoteSftpCreateDirRequest,
) -> Result<RemoteDirListing, String> {
    validate_entry_name(&req.name).map_err(to_string)?;
    validate_remote_sftp_auth(&remote_create_dir_auth(&req)).map_err(to_string)?;
    create_remote_sftp_dir_inner(req).await.map_err(to_string)
}

fn list_local_dir_inner(path: &Path) -> Result<LocalDirListing> {
    if !path.is_dir() {
        bail!("{} is not a directory", path.display());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(path).with_context(|| format!("failed to list {}", path.display()))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() {
            continue;
        }
        entries.push(local_entry_from_path(&entry.path())?);
    }
    entries.sort_by(|a, b| {
        let rank_a = if a.kind == "dir" { 0 } else { 1 };
        let rank_b = if b.kind == "dir" { 0 } else { 1 };
        rank_a
            .cmp(&rank_b)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(LocalDirListing {
        path: path.to_string_lossy().to_string(),
        parent: path.parent().map(|p| p.to_string_lossy().to_string()),
        entries,
    })
}

fn local_entry_from_path(path: &Path) -> Result<LocalEntry> {
    let meta =
        fs::symlink_metadata(path).with_context(|| format!("failed to stat {}", path.display()))?;
    let file_type = meta.file_type();
    let kind = if file_type.is_dir() {
        "dir"
    } else if file_type.is_file() {
        "file"
    } else if file_type.is_symlink() {
        "symlink"
    } else {
        "other"
    }
    .to_string();
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_string();
    if name.is_empty() {
        bail!("path has no file name: {}", path.display());
    }

    Ok(LocalEntry {
        editable: file_type.is_file() && is_editable_path(path),
        name,
        path: path.to_string_lossy().to_string(),
        kind,
        size: if file_type.is_file() { meta.len() } else { 0 },
        mtime: format_mtime(meta.modified().ok()),
    })
}

fn file_path_to_string(path: FilePath) -> Result<String> {
    let path = path
        .into_path()
        .map_err(|_| anyhow::anyhow!("selected path is not a local filesystem path"))?;
    Ok(path.to_string_lossy().to_string())
}

async fn list_remote_sftp_dir_inner(req: RemoteSftpListRequest) -> Result<RemoteDirListing> {
    let path = normalize_remote_path(req.path.as_deref());
    let (_session, sftp) = open_remote_sftp_session(remote_list_auth(&req)).await?;
    let mut entries: Vec<_> = sftp
        .read_dir(path.clone())
        .await
        .with_context(|| format!("failed to read remote directory {path}"))?
        .map(remote_entry_from_dir_entry)
        .collect();
    entries.sort_by(|a, b| {
        let rank_a = if a.kind == "dir" { 0 } else { 1 };
        let rank_b = if b.kind == "dir" { 0 } else { 1 };
        rank_a
            .cmp(&rank_b)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(RemoteDirListing {
        parent: parent_remote_path(&path),
        path,
        entries,
    })
}

async fn read_remote_sftp_text_inner(req: RemoteSftpReadTextRequest) -> Result<String> {
    let path = normalize_remote_path(Some(&req.path));
    let (_session, sftp) = open_remote_sftp_session(remote_read_auth(&req)).await?;
    let metadata = sftp
        .metadata(path.clone())
        .await
        .with_context(|| format!("failed to stat remote file {path}"))?;
    validate_remote_regular_file_attributes(&path, &metadata, "read")?;
    if metadata.len() > MAX_REMOTE_TEXT_BYTES {
        bail!(
            "{path} is larger than {} bytes; open it with download instead",
            MAX_REMOTE_TEXT_BYTES
        );
    }
    let bytes = sftp
        .read(path.clone())
        .await
        .with_context(|| format!("failed to read remote file {path}"))?;
    String::from_utf8(bytes).with_context(|| format!("{path} is not valid UTF-8 text"))
}

async fn read_remote_sftp_file_base64_inner(
    req: RemoteSftpReadFileBase64Request,
) -> Result<String> {
    let path = normalize_remote_path(Some(&req.path));
    let (_session, sftp) = open_remote_sftp_session(remote_read_file_auth(&req)).await?;
    let metadata = sftp
        .metadata(path.clone())
        .await
        .with_context(|| format!("failed to stat remote file {path}"))?;
    validate_remote_regular_file_attributes(&path, &metadata, "read")?;
    validate_ipc_file_size(metadata.len(), &path)?;
    let bytes = sftp
        .read(path.clone())
        .await
        .with_context(|| format!("failed to read remote file {path}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

async fn read_remote_sftp_file_chunk_base64_inner(
    req: RemoteSftpReadFileChunkBase64Request,
) -> Result<FileChunkBase64> {
    validate_chunk_length(req.length)?;
    let path = normalize_remote_path(Some(&req.path));
    let (_session, sftp) = open_remote_sftp_session(remote_read_file_chunk_auth(&req)).await?;
    let metadata = sftp
        .metadata(path.clone())
        .await
        .with_context(|| format!("failed to stat remote file {path}"))?;
    validate_remote_regular_file_attributes(&path, &metadata, "read")?;
    let mut file = sftp
        .open(path.clone())
        .await
        .with_context(|| format!("failed to open remote file {path}"))?;
    file.seek(SeekFrom::Start(req.offset))
        .await
        .with_context(|| format!("failed to seek remote file {path}"))?;
    let mut buf = vec![0_u8; req.length as usize];
    let n = file
        .read(&mut buf)
        .await
        .with_context(|| format!("failed to read remote file {path}"))?;
    buf.truncate(n);
    Ok(FileChunkBase64 {
        content_base64: base64::engine::general_purpose::STANDARD.encode(buf),
        bytes_read: n as u64,
        total_size: metadata.len(),
        done: req.offset.saturating_add(n as u64) >= metadata.len(),
    })
}

async fn write_remote_sftp_text_inner(req: RemoteSftpWriteTextRequest) -> Result<RemoteDirListing> {
    let path = normalize_remote_path(Some(&req.path));
    let parent = parent_remote_path(&path).unwrap_or_else(|| ".".to_string());
    let (_session, sftp) = open_remote_sftp_session(remote_write_auth(&req)).await?;
    validate_remote_file_write_target(&sftp, &path).await?;
    let mut file = sftp
        .create(path.clone())
        .await
        .with_context(|| format!("failed to open remote file {path} for writing"))?;
    file.write_all(req.content.as_bytes())
        .await
        .with_context(|| format!("failed to write remote file {path}"))?;
    file.flush()
        .await
        .with_context(|| format!("failed to flush remote file {path}"))?;
    file.shutdown()
        .await
        .with_context(|| format!("failed to close remote file {path}"))?;
    list_remote_sftp_dir_inner(RemoteSftpListRequest {
        host: req.host,
        port: req.port,
        user: req.user,
        password: req.password,
        private_key_path: req.private_key_path,
        private_key_passphrase: req.private_key_passphrase,
        totp_code: req.totp_code,
        proxy: req.proxy,
        jump_hosts: req.jump_hosts,
        path: Some(parent),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    })
    .await
}

async fn write_remote_sftp_file_base64_inner(
    req: RemoteSftpWriteFileBase64Request,
) -> Result<RemoteDirListing> {
    let path = normalize_remote_path(Some(&req.path));
    let parent = parent_remote_path(&path).unwrap_or_else(|| ".".to_string());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.content_base64.as_bytes())
        .context("invalid base64 file content")?;
    validate_ipc_file_size(bytes.len() as u64, &path)?;
    let (_session, sftp) = open_remote_sftp_session(remote_write_file_auth(&req)).await?;
    validate_remote_file_write_target(&sftp, &path).await?;
    let mut file = sftp
        .create(path.clone())
        .await
        .with_context(|| format!("failed to open remote file {path} for writing"))?;
    file.write_all(&bytes)
        .await
        .with_context(|| format!("failed to write remote file {path}"))?;
    file.flush()
        .await
        .with_context(|| format!("failed to flush remote file {path}"))?;
    file.shutdown()
        .await
        .with_context(|| format!("failed to close remote file {path}"))?;
    list_remote_sftp_dir_inner(RemoteSftpListRequest {
        host: req.host,
        port: req.port,
        user: req.user,
        password: req.password,
        private_key_path: req.private_key_path,
        private_key_passphrase: req.private_key_passphrase,
        totp_code: req.totp_code,
        proxy: req.proxy,
        jump_hosts: req.jump_hosts,
        path: Some(parent),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    })
    .await
}

async fn write_remote_sftp_file_chunk_base64_inner(
    req: RemoteSftpWriteFileChunkBase64Request,
) -> Result<()> {
    let path = normalize_remote_path(Some(&req.path));
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.content_base64.as_bytes())
        .context("invalid base64 file content")?;
    validate_chunk_length(bytes.len() as u64)?;
    let (_session, sftp) = open_remote_sftp_session(remote_write_file_chunk_auth(&req)).await?;
    validate_remote_file_write_target(&sftp, &path).await?;
    let flags = if req.truncate.unwrap_or(false) {
        OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE
    } else {
        OpenFlags::CREATE | OpenFlags::WRITE
    };
    let mut file = sftp
        .open_with_flags(path.clone(), flags)
        .await
        .with_context(|| format!("failed to open remote file {path} for writing"))?;
    file.seek(SeekFrom::Start(req.offset))
        .await
        .with_context(|| format!("failed to seek remote file {path}"))?;
    file.write_all(&bytes)
        .await
        .with_context(|| format!("failed to write remote file {path}"))?;
    file.flush()
        .await
        .with_context(|| format!("failed to flush remote file {path}"))?;
    file.shutdown()
        .await
        .with_context(|| format!("failed to close remote file {path}"))
}

async fn create_remote_sftp_dir_inner(req: RemoteSftpCreateDirRequest) -> Result<RemoteDirListing> {
    let parent = normalize_remote_path(Some(&req.parent));
    let path = join_remote_path(&parent, &req.name);
    let (_session, sftp) = open_remote_sftp_session(remote_create_dir_auth(&req)).await?;
    sftp.create_dir(path.clone())
        .await
        .with_context(|| format!("failed to create remote directory {path}"))?;
    list_remote_sftp_dir_inner(RemoteSftpListRequest {
        host: req.host,
        port: req.port,
        user: req.user,
        password: req.password,
        private_key_path: req.private_key_path,
        private_key_passphrase: req.private_key_passphrase,
        totp_code: req.totp_code,
        proxy: req.proxy,
        jump_hosts: req.jump_hosts,
        path: Some(parent),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    })
    .await
}

async fn open_remote_sftp_session(
    auth: RemoteSftpAuth<'_>,
) -> Result<(client::Handle<SftpClient>, SftpSession)> {
    let port = auth.port.unwrap_or(22);
    let config = client_config(auth.server_alive_interval_ms, auth.server_alive_count_max);
    let handler = SftpClient {
        host: auth.host.to_string(),
        port,
        strict_host_key: auth.strict_host_key.unwrap_or(true),
        trust_unknown_host_key: auth.trust_unknown_host_key.unwrap_or(false),
    };
    let stream = open_ssh_transport(
        auth.host,
        port,
        auth.proxy,
        auth.jump_hosts,
        auth.connect_timeout_ms.unwrap_or(30_000),
    )
    .await
    .with_context(|| format!("failed to connect to {}:{port}", auth.host))?;
    let mut session = client::connect_stream(config, stream, handler)
        .await
        .with_context(|| format!("failed to connect to {}:{port}", auth.host))?;
    authenticate_remote_sftp(&mut session, &auth).await?;

    let channel = session
        .channel_open_session()
        .await
        .context("failed to open SFTP SSH channel")?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .context("failed to request SFTP subsystem")?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .context("failed to initialize SFTP subsystem")?;

    Ok((session, sftp))
}

async fn authenticate_remote_sftp(
    session: &mut client::Handle<SftpClient>,
    req: &RemoteSftpAuth<'_>,
) -> Result<()> {
    authenticate_with_fallbacks(
        session,
        SshAuth {
            user: req.user,
            password: req.password,
            private_key_path: req.private_key_path,
            private_key_passphrase: req.private_key_passphrase,
            totp_code: req.totp_code,
            rejected_message: "SFTP authentication rejected by server",
        },
    )
    .await
}

fn validate_remote_sftp_auth(req: &RemoteSftpAuth<'_>) -> Result<()> {
    if req.host.trim().is_empty() {
        bail!("host is required");
    }
    if req.user.trim().is_empty() {
        bail!("user is required");
    }
    if req.password.unwrap_or("").is_empty() && req.private_key_path.unwrap_or("").is_empty() {
        bail!("password or privateKeyPath is required");
    }
    if let Some(proxy) = req.proxy {
        validate_proxy_request(proxy)?;
    }
    if let Some(jump_hosts) = req.jump_hosts {
        validate_jump_hosts(jump_hosts)?;
    }
    Ok(())
}

fn remote_list_auth(req: &RemoteSftpListRequest) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_read_auth(req: &RemoteSftpReadTextRequest) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_write_auth(req: &RemoteSftpWriteTextRequest) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_read_file_auth(req: &RemoteSftpReadFileBase64Request) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_write_file_auth(req: &RemoteSftpWriteFileBase64Request) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_read_file_chunk_auth(req: &RemoteSftpReadFileChunkBase64Request) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_write_file_chunk_auth(req: &RemoteSftpWriteFileChunkBase64Request) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_create_dir_auth(req: &RemoteSftpCreateDirRequest) -> RemoteSftpAuth<'_> {
    RemoteSftpAuth {
        host: &req.host,
        port: req.port,
        user: &req.user,
        password: req.password.as_deref(),
        private_key_path: req.private_key_path.as_deref(),
        private_key_passphrase: req.private_key_passphrase.as_deref(),
        totp_code: req.totp_code.as_deref(),
        proxy: req.proxy.as_ref(),
        jump_hosts: req.jump_hosts.as_deref(),
        strict_host_key: req.strict_host_key,
        trust_unknown_host_key: req.trust_unknown_host_key,
        connect_timeout_ms: req.connect_timeout_ms,
        server_alive_interval_ms: req.server_alive_interval_ms,
        server_alive_count_max: req.server_alive_count_max,
    }
}

fn remote_entry_from_dir_entry(entry: russh_sftp::client::fs::DirEntry) -> RemoteEntry {
    let name = entry.file_name();
    remote_entry_from_parts(name, entry.path(), entry.metadata())
}

fn remote_entry_from_parts(name: String, path: String, metadata: FileAttributes) -> RemoteEntry {
    let file_type = metadata.file_type();
    let kind = if file_type.is_dir() {
        "dir"
    } else if file_type.is_symlink() {
        "symlink"
    } else {
        "file"
    };

    RemoteEntry {
        editable: kind == "file" && is_editable_path(Path::new(&name)),
        name,
        path,
        kind: kind.to_string(),
        size: if kind == "file" { metadata.len() } else { 0 },
        mtime: metadata
            .mtime
            .map(|mtime| mtime.to_string())
            .unwrap_or_else(|| "0".to_string()),
    }
}

fn normalize_remote_path(path: Option<&str>) -> String {
    path.map(str::trim)
        .filter(|path| !path.is_empty())
        .unwrap_or(".")
        .to_string()
}

fn parent_remote_path(path: &str) -> Option<String> {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "." || trimmed == "/" {
        return None;
    }
    let idx = trimmed.rfind('/')?;
    if idx == 0 {
        Some("/".to_string())
    } else {
        Some(trimmed[..idx].to_string())
    }
}

fn join_remote_path(parent: &str, name: &str) -> String {
    let base = parent.trim();
    if base.is_empty() || base == "." {
        name.to_string()
    } else if base.ends_with('/') {
        format!("{base}{name}")
    } else {
        format!("{base}/{name}")
    }
}

fn normalize_local_path(path: Option<&str>) -> Result<PathBuf> {
    let raw = path.filter(|p| !p.trim().is_empty()).unwrap_or("~");
    let expanded = if raw == "~" {
        home_dir()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        home_dir().join(rest)
    } else {
        PathBuf::from(raw)
    };
    Ok(expanded)
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn validate_regular_file(path: &Path) -> Result<()> {
    let meta = fs::metadata(path).with_context(|| format!("failed to stat {}", path.display()))?;
    if !meta.is_file() {
        bail!("{} is not a file", path.display());
    }
    Ok(())
}

fn validate_local_file_write_target(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.is_dir() {
            bail!("{} is not a directory", parent.display());
        }
    }

    let Ok(meta) = fs::symlink_metadata(path) else {
        return Ok(());
    };
    if meta.file_type().is_symlink() {
        bail!(
            "{} is a symlink; refusing to write through it",
            path.display()
        );
    }
    if !meta.is_file() {
        bail!("{} is not a file", path.display());
    }
    Ok(())
}

fn validate_local_create_target_absent(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(_) => bail!("{} already exists", path.display()),
        Err(err) if err.kind() == ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err).with_context(|| format!("failed to stat {}", path.display())),
    }
}

async fn validate_remote_file_write_target(sftp: &SftpSession, path: &str) -> Result<()> {
    if let Ok(metadata) = sftp.metadata(path.to_string()).await {
        validate_remote_regular_file_attributes(path, &metadata, "write")?;
    }
    Ok(())
}

fn validate_remote_regular_file_attributes(
    path: &str,
    metadata: &FileAttributes,
    action: &str,
) -> Result<()> {
    if metadata.permissions.is_none() {
        return Ok(());
    }

    let file_type = metadata.file_type();
    if file_type.is_dir() {
        bail!("{path} is a directory");
    }
    if file_type.is_symlink() {
        bail!("{path} is a symlink; refusing to {action} through it");
    }
    if !file_type.is_file() {
        bail!("{path} is not a regular file");
    }
    Ok(())
}

fn validate_ipc_file_size(size: u64, label: &str) -> Result<()> {
    if size > MAX_IPC_FILE_BYTES {
        bail!("{label} is larger than {MAX_IPC_FILE_BYTES} bytes; streaming transfer is required")
    }
    Ok(())
}

fn validate_chunk_length(length: u64) -> Result<()> {
    if length == 0 {
        bail!("chunk length is required");
    }
    if length > MAX_TRANSFER_CHUNK_BYTES {
        bail!("chunk length is larger than {MAX_TRANSFER_CHUNK_BYTES} bytes");
    }
    Ok(())
}

fn validate_entry_name(name: &str) -> Result<()> {
    let trimmed = name.trim();
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        bail!("directory name must be a single path segment");
    }
    Ok(())
}

fn is_editable_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
        return false;
    };
    let lower_name = name.to_ascii_lowercase();
    if matches!(
        lower_name.as_str(),
        ".bash_profile"
            | ".bashrc"
            | ".env"
            | ".gitconfig"
            | ".npmrc"
            | ".profile"
            | ".yarnrc"
            | ".zshrc"
    ) || lower_name.starts_with(".env.")
    {
        return true;
    }

    path.extension()
        .and_then(|s| s.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "conf"
                    | "env"
                    | "md"
                    | "txt"
                    | "log"
                    | "sh"
                    | "css"
                    | "js"
                    | "json"
                    | "yaml"
                    | "yml"
                    | "html"
            )
        })
        .unwrap_or(false)
}

fn format_mtime(time: Option<SystemTime>) -> String {
    let secs = time
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

fn to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("relay-sftp-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        root
    }

    #[test]
    fn lists_local_directory_with_dirs_first_and_editable_flags() {
        let root = temp_root("list");
        fs::create_dir(root.join("z-dir")).expect("create dir");
        fs::write(root.join(".env.local"), "DEBUG=1").expect("write env");
        fs::write(root.join("README.MD"), "hello").expect("write md");
        fs::write(root.join("app.log"), "hello").expect("write log");
        fs::write(root.join("archive.bin"), [1_u8, 2, 3]).expect("write bin");

        let listing = list_local_dir_inner(&root).expect("list dir");
        let names: Vec<_> = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(
            names,
            vec!["z-dir", ".env.local", "app.log", "archive.bin", "README.MD"]
        );
        assert_eq!(listing.entries[2].size, 5);
        assert!(listing.entries[1].editable);
        assert!(listing.entries[2].editable);
        assert!(!listing.entries[3].editable);
        assert!(listing.entries[4].editable);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn lists_local_symlinks_without_following_targets() {
        use std::os::unix::fs::symlink;

        let root = temp_root("list-symlink");
        let real_file = root.join("real-file.txt");
        let real_dir = root.join("real-dir");
        let file_link = root.join("file-link.txt");
        let dir_link = root.join("dir-link");
        fs::write(&real_file, "hello").expect("write real file");
        fs::create_dir(&real_dir).expect("create real dir");
        symlink(&real_file, &file_link).expect("create file symlink");
        symlink(&real_dir, &dir_link).expect("create dir symlink");

        let listing = list_local_dir_inner(&root).expect("list dir");
        let file_link_entry = listing
            .entries
            .iter()
            .find(|entry| entry.name == "file-link.txt")
            .expect("file link listed");
        let dir_link_entry = listing
            .entries
            .iter()
            .find(|entry| entry.name == "dir-link")
            .expect("dir link listed");

        assert_eq!(file_link_entry.kind, "symlink");
        assert_eq!(file_link_entry.size, 0);
        assert!(!file_link_entry.editable);
        assert_eq!(dir_link_entry.kind, "symlink");
        assert_eq!(dir_link_entry.size, 0);
        assert!(!dir_link_entry.editable);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn maps_remote_entries_with_file_type_and_editable_flags() {
        let file = remote_entry_from_parts(
            "app.log".to_string(),
            "/var/log/app.log".to_string(),
            FileAttributes {
                size: Some(42),
                permissions: Some(0o100644),
                mtime: Some(123),
                ..FileAttributes::empty()
            },
        );
        let dir = remote_entry_from_parts(
            "logs".to_string(),
            "/var/log/logs".to_string(),
            FileAttributes {
                permissions: Some(0o040755),
                ..FileAttributes::empty()
            },
        );

        assert_eq!(file.kind, "file");
        assert_eq!(file.size, 42);
        assert_eq!(file.mtime, "123");
        assert!(file.editable);
        assert_eq!(dir.kind, "dir");
        assert_eq!(dir.size, 0);
        assert!(!dir.editable);
    }

    #[test]
    fn normalizes_remote_paths_and_parents() {
        assert_eq!(normalize_remote_path(None), ".");
        assert_eq!(normalize_remote_path(Some(" /var/www ")), "/var/www");
        assert_eq!(parent_remote_path("."), None);
        assert_eq!(parent_remote_path("/"), None);
        assert_eq!(parent_remote_path("/var"), Some("/".to_string()));
        assert_eq!(parent_remote_path("/var/www"), Some("/var".to_string()));
        assert_eq!(join_remote_path(".", "logs"), "logs");
        assert_eq!(join_remote_path("/var", "logs"), "/var/logs");
        assert_eq!(join_remote_path("/var/", "logs"), "/var/logs");
        assert_eq!(
            parent_remote_path("relative/path"),
            Some("relative".to_string())
        );
    }

    #[test]
    fn validates_remote_regular_file_attributes_before_read_or_write() {
        let file = FileAttributes {
            permissions: Some(0o100644),
            ..FileAttributes::empty()
        };
        assert!(validate_remote_regular_file_attributes("/tmp/file", &file, "write").is_ok());

        let unknown = FileAttributes {
            permissions: None,
            ..FileAttributes::empty()
        };
        assert!(
            validate_remote_regular_file_attributes("/tmp/file", &unknown, "write").is_ok(),
            "servers that omit permissions should fall through to open/create"
        );

        let dir = FileAttributes {
            permissions: Some(0o040755),
            ..FileAttributes::empty()
        };
        assert!(
            validate_remote_regular_file_attributes("/tmp/dir", &dir, "write")
                .expect_err("dir rejected")
                .to_string()
                .contains("is a directory")
        );

        let symlink = FileAttributes {
            permissions: Some(0o120777),
            ..FileAttributes::empty()
        };
        assert!(
            validate_remote_regular_file_attributes("/tmp/link", &symlink, "write")
                .expect_err("symlink rejected")
                .to_string()
                .contains("refusing to write through it")
        );

        let socket = FileAttributes {
            permissions: Some(0o140777),
            ..FileAttributes::empty()
        };
        assert!(
            validate_remote_regular_file_attributes("/tmp/socket", &socket, "read")
                .expect_err("other file type rejected")
                .to_string()
                .contains("not a regular file")
        );
    }

    #[test]
    fn validates_remote_sftp_credentials() {
        let mut req = RemoteSftpListRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: None,
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            path: Some(".".to_string()),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };

        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_err());
        req.password = Some("secret".to_string());
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_ok());
        req.host.clear();
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_err());
    }

    #[test]
    fn validates_remote_sftp_proxy_settings() {
        let mut req = RemoteSftpListRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: Some(ProxyRequest {
                kind: "socks5".to_string(),
                host: Some("127.0.0.1".to_string()),
                port: Some(1080),
                username: None,
                password: None,
                cmd: None,
            }),
            jump_hosts: None,
            path: Some(".".to_string()),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };

        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_ok());
        req.proxy = Some(ProxyRequest {
            kind: "http".to_string(),
            host: None,
            port: Some(8080),
            username: None,
            password: None,
            cmd: None,
        });
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_err());
        req.proxy = Some(ProxyRequest {
            kind: "cmd".to_string(),
            host: None,
            port: None,
            username: None,
            password: None,
            cmd: Some("connect %h %p".to_string()),
        });
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_ok());
    }

    #[test]
    fn validates_remote_sftp_jump_hosts() {
        let mut req = RemoteSftpListRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: Some(vec![JumpHostRequest {
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
            }]),
            path: Some(".".to_string()),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_ok());

        req.jump_hosts.as_mut().unwrap()[0].password = None;
        assert!(validate_remote_sftp_auth(&remote_list_auth(&req)).is_err());
    }

    #[test]
    fn validates_remote_sftp_text_requests_with_shared_auth_rules() {
        let read_req = RemoteSftpReadTextRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            path: "/etc/app.conf".to_string(),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };
        let mut write_req = RemoteSftpWriteTextRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: None,
            private_key_path: Some("~/.ssh/id_ed25519".to_string()),
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            path: "/tmp/relay.txt".to_string(),
            content: "hello".to_string(),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };

        assert!(validate_remote_sftp_auth(&remote_read_auth(&read_req)).is_ok());
        assert!(validate_remote_sftp_auth(&remote_write_auth(&write_req)).is_ok());
        write_req.private_key_path = None;
        assert!(validate_remote_sftp_auth(&remote_write_auth(&write_req)).is_err());
    }

    #[test]
    fn validates_remote_sftp_base64_file_requests_with_shared_auth_rules() {
        let read_req = RemoteSftpReadFileBase64Request {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            path: "/var/tmp/archive.bin".to_string(),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };
        let mut write_req = RemoteSftpWriteFileBase64Request {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: None,
            private_key_path: Some("~/.ssh/id_ed25519".to_string()),
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            path: "/var/tmp/archive.bin".to_string(),
            content_base64: "AQID".to_string(),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };

        assert!(validate_remote_sftp_auth(&remote_read_file_auth(&read_req)).is_ok());
        assert!(validate_remote_sftp_auth(&remote_write_file_auth(&write_req)).is_ok());
        write_req.private_key_path = None;
        assert!(validate_remote_sftp_auth(&remote_write_file_auth(&write_req)).is_err());
    }

    #[test]
    fn validates_remote_sftp_create_dir_requests_with_shared_auth_rules() {
        let mut req = RemoteSftpCreateDirRequest {
            host: "example.com".to_string(),
            port: Some(22),
            user: "deploy".to_string(),
            password: Some("secret".to_string()),
            private_key_path: None,
            private_key_passphrase: None,
            totp_code: None,
            proxy: None,
            jump_hosts: None,
            parent: "/var/tmp".to_string(),
            name: "release".to_string(),
            strict_host_key: Some(true),
            trust_unknown_host_key: Some(false),
            connect_timeout_ms: None,
            server_alive_interval_ms: None,
            server_alive_count_max: None,
        };

        assert!(validate_remote_sftp_auth(&remote_create_dir_auth(&req)).is_ok());
        assert!(validate_entry_name(&req.name).is_ok());
        req.password = None;
        assert!(validate_remote_sftp_auth(&remote_create_dir_auth(&req)).is_err());
        req.password = Some("secret".to_string());
        req.name = "../bad".to_string();
        assert!(validate_entry_name(&req.name).is_err());
    }

    #[test]
    fn writes_reads_and_creates_local_entries() {
        let root = temp_root("write");
        let file = root.join("notes.md");
        write_local_text(WriteTextRequest {
            path: file.to_string_lossy().to_string(),
            content: "hello".to_string(),
        })
        .expect("write text");
        assert_eq!(
            read_local_text(file.to_string_lossy().to_string()).expect("read text"),
            "hello"
        );

        let listing = create_local_dir(CreateDirRequest {
            parent: root.to_string_lossy().to_string(),
            name: "new-dir".to_string(),
        })
        .expect("create dir");
        assert!(listing
            .entries
            .iter()
            .any(|entry| entry.name == "new-dir" && entry.kind == "dir"));

        let listing = create_local_file(CreateFileRequest {
            parent: root.to_string_lossy().to_string(),
            name: "download.bin".to_string(),
            size: 4096,
        })
        .expect("create file");
        let entry = listing
            .entries
            .iter()
            .find(|entry| entry.name == "download.bin")
            .expect("download exists");
        assert_eq!(entry.kind, "file");
        assert_eq!(entry.size, 4096);
        assert!(root.join("download.bin").is_file());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn writes_and_reads_local_base64_files() {
        let root = temp_root("base64");
        let listing = write_local_file_base64(WriteLocalFileBase64Request {
            parent: root.to_string_lossy().to_string(),
            name: "payload.bin".to_string(),
            content_base64: "AAECA/8=".to_string(),
        })
        .expect("write base64 file");
        let entry = listing
            .entries
            .iter()
            .find(|entry| entry.name == "payload.bin")
            .expect("payload listed");
        assert_eq!(entry.size, 5);
        assert_eq!(
            fs::read(root.join("payload.bin")).expect("read payload"),
            vec![0, 1, 2, 3, 255]
        );
        assert_eq!(
            read_local_file_base64(root.join("payload.bin").to_string_lossy().to_string())
                .expect("read base64"),
            "AAECA/8="
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn writes_and_reads_local_file_chunks() {
        let root = temp_root("chunks");
        let path = root.join("payload.bin");

        write_local_file_chunk_base64(WriteLocalFileChunkBase64Request {
            path: path.to_string_lossy().to_string(),
            offset: 0,
            content_base64: "AAEC".to_string(),
            truncate: Some(true),
        })
        .expect("write first chunk");
        write_local_file_chunk_base64(WriteLocalFileChunkBase64Request {
            path: path.to_string_lossy().to_string(),
            offset: 3,
            content_base64: "AwT/".to_string(),
            truncate: Some(false),
        })
        .expect("write second chunk");

        let first = read_local_file_chunk_base64(ReadLocalFileChunkBase64Request {
            path: path.to_string_lossy().to_string(),
            offset: 0,
            length: 4,
        })
        .expect("read first chunk");
        assert_eq!(first.content_base64, "AAECAw==");
        assert_eq!(first.bytes_read, 4);
        assert_eq!(first.total_size, 6);
        assert!(!first.done);

        let second = read_local_file_chunk_base64(ReadLocalFileChunkBase64Request {
            path: path.to_string_lossy().to_string(),
            offset: 4,
            length: 4,
        })
        .expect("read second chunk");
        assert_eq!(second.content_base64, "BP8=");
        assert_eq!(second.bytes_read, 2);
        assert!(second.done);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn truncates_local_files_to_requested_size() {
        let root = temp_root("truncate");
        let path = root.join("payload.bin");
        fs::write(&path, [0, 1, 2, 3, 4, 5]).expect("write initial file");

        truncate_local_file(TruncateLocalFileRequest {
            path: path.to_string_lossy().to_string(),
            size: 3,
        })
        .expect("truncate existing file");

        assert_eq!(fs::read(&path).expect("read truncated"), vec![0, 1, 2]);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_local_chunk_and_truncate_writes_to_non_regular_targets() {
        let root = temp_root("write-target-kind");
        let dir_path = root.join("target-dir");
        fs::create_dir(&dir_path).expect("create target dir");

        let chunk_err = write_local_file_chunk_base64(WriteLocalFileChunkBase64Request {
            path: dir_path.to_string_lossy().to_string(),
            offset: 0,
            content_base64: "AAE=".to_string(),
            truncate: Some(true),
        })
        .expect_err("chunk write to dir rejected");
        assert!(chunk_err.contains("is not a file"));

        let truncate_err = truncate_local_file(TruncateLocalFileRequest {
            path: dir_path.to_string_lossy().to_string(),
            size: 0,
        })
        .expect_err("truncate dir rejected");
        assert!(truncate_err.contains("is not a file"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_local_chunk_and_truncate_writes_through_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_root("write-target-symlink");
        let real_path = root.join("real.bin");
        let link_path = root.join("link.bin");
        fs::write(&real_path, [1_u8, 2, 3]).expect("write real file");
        symlink(&real_path, &link_path).expect("create symlink");

        let chunk_err = write_local_file_chunk_base64(WriteLocalFileChunkBase64Request {
            path: link_path.to_string_lossy().to_string(),
            offset: 0,
            content_base64: "AAE=".to_string(),
            truncate: Some(true),
        })
        .expect_err("chunk write through symlink rejected");
        assert!(chunk_err.contains("is a symlink"));

        let truncate_err = truncate_local_file(TruncateLocalFileRequest {
            path: link_path.to_string_lossy().to_string(),
            size: 0,
        })
        .expect_err("truncate through symlink rejected");
        assert!(truncate_err.contains("is a symlink"));

        let text_err = write_local_text(WriteTextRequest {
            path: link_path.to_string_lossy().to_string(),
            content: "changed".to_string(),
        })
        .expect_err("text write through symlink rejected");
        assert!(text_err.contains("is a symlink"));
        assert_eq!(
            fs::read(&real_path).expect("real file unchanged"),
            vec![1, 2, 3]
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_local_create_and_base64_writes_over_broken_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_root("create-target-broken-symlink");
        let create_link = root.join("create-link.bin");
        let base64_link = root.join("base64-link.bin");
        symlink(root.join("missing-create-target.bin"), &create_link)
            .expect("create broken create symlink");
        symlink(root.join("missing-base64-target.bin"), &base64_link)
            .expect("create broken base64 symlink");

        let create_err = create_local_file(CreateFileRequest {
            parent: root.to_string_lossy().to_string(),
            name: "create-link.bin".to_string(),
            size: 8,
        })
        .expect_err("create over broken symlink rejected");
        assert!(create_err.contains("already exists"));

        let base64_err = write_local_file_base64(WriteLocalFileBase64Request {
            parent: root.to_string_lossy().to_string(),
            name: "base64-link.bin".to_string(),
            content_base64: "AAE=".to_string(),
        })
        .expect_err("base64 write over broken symlink rejected");
        assert!(base64_err.contains("already exists"));
        assert!(!root.join("missing-create-target.bin").exists());
        assert!(!root.join("missing-base64-target.bin").exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_nested_directory_names() {
        for name in ["../bad", "bad/name", "bad\\name", ".", "..", " "] {
            let err = validate_entry_name(name).expect_err("nested name rejected");
            assert!(err.to_string().contains("single path segment"));
        }
        assert!(validate_entry_name("release-2026.06").is_ok());
    }

    #[test]
    fn rejects_local_create_names_that_escape_parent_directory() {
        let root = temp_root("local-escape");
        let outside = root
            .parent()
            .expect("temp root has parent")
            .join("relay-escape-dir");
        let _ = fs::remove_dir_all(&outside);

        let err = create_local_dir(CreateDirRequest {
            parent: root.to_string_lossy().to_string(),
            name: "..".to_string(),
        })
        .expect_err("parent traversal rejected");
        assert!(err.contains("single path segment"));
        assert!(!outside.exists());

        let err = create_local_file(CreateFileRequest {
            parent: root.to_string_lossy().to_string(),
            name: "../relay-escape-dir".to_string(),
            size: 1,
        })
        .expect_err("file traversal rejected");
        assert!(err.contains("single path segment"));
        assert!(!outside.exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn refuses_to_overwrite_local_downloads() {
        let root = temp_root("overwrite");
        fs::write(root.join("existing.txt"), "old").expect("write existing");

        let err = create_local_file(CreateFileRequest {
            parent: root.to_string_lossy().to_string(),
            name: "existing.txt".to_string(),
            size: 1,
        })
        .expect_err("existing file rejected");
        assert!(err.contains("already exists"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_oversized_ipc_files() {
        let err = validate_ipc_file_size(MAX_IPC_FILE_BYTES + 1, "huge.bin")
            .expect_err("oversized file rejected");
        assert!(err.to_string().contains("streaming transfer"));

        let err = validate_chunk_length(MAX_TRANSFER_CHUNK_BYTES + 1)
            .expect_err("oversized chunk rejected");
        assert!(err.to_string().contains("chunk length"));
    }
}
