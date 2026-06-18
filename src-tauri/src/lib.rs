mod forward;
mod host_probe;
mod ipc;
mod monitor;
mod pty;
mod sftp;
mod ssh;
mod ssh_config;
mod vault;

use serde::Serialize;
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    pty: Arc<pty::PtyRegistry>,
    ssh: Arc<ssh::session::SshRegistry>,
    forwards: Arc<forward::ForwardRegistry>,
}

#[derive(Serialize)]
struct Health {
    app: &'static str,
    version: &'static str,
    channel_streaming: bool,
    frame_aggregation_ms: u64,
}

#[tauri::command]
fn health() -> Health {
    Health {
        app: "RELAY",
        version: env!("CARGO_PKG_VERSION"),
        channel_streaming: true,
        frame_aggregation_ms: ipc::FRAME_MS,
    }
}

pub fn run() {
    let state = AppState {
        pty: Arc::new(pty::PtyRegistry::default()),
        ssh: Arc::new(ssh::session::SshRegistry::default()),
        forwards: Arc::new(forward::ForwardRegistry::default()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            health,
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            ssh::agent::ssh_agent_status,
            ssh::jump::test_jump_chain,
            ssh::proxy::validate_proxy,
            ssh::session::ssh_open,
            ssh::session::ssh_sample_monitor,
            ssh::session::ssh_write,
            ssh::session::ssh_resize,
            ssh::session::ssh_close,
            host_probe::probe_hosts,
            ssh_config::read_default_ssh_config,
            forward::list_forwards,
            forward::start_forward,
            forward::stop_forward,
            monitor::sample_monitor,
            monitor::sample_remote_monitor,
            sftp::list_local_dir,
            sftp::get_local_path_info,
            sftp::pick_trzsz_upload_paths,
            sftp::pick_trzsz_save_directory,
            sftp::read_local_text,
            sftp::read_local_file_base64,
            sftp::read_local_file_chunk_base64,
            sftp::write_local_text,
            sftp::write_local_file_base64,
            sftp::write_local_file_chunk_base64,
            sftp::truncate_local_file,
            sftp::create_local_dir,
            sftp::create_local_file,
            sftp::list_remote_sftp_dir,
            sftp::read_remote_sftp_text,
            sftp::write_remote_sftp_text,
            sftp::read_remote_sftp_file_base64,
            sftp::write_remote_sftp_file_base64,
            sftp::read_remote_sftp_file_chunk_base64,
            sftp::write_remote_sftp_file_chunk_base64,
            sftp::create_remote_sftp_dir,
            vault::list_credentials,
            vault::repair_private_key_permissions,
            vault::get_keychain_secret,
            vault::save_keychain_secret,
            vault::delete_keychain_secret,
            vault::save_totp_secret,
            vault::get_totp_code,
            vault::delete_totp_secret,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RELAY");
}
