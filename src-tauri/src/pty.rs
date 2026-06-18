use crate::ipc::FrameAggregator;
use crate::AppState;
use anyhow::{anyhow, Context};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, State};
use uuid::Uuid;

#[derive(Default)]
pub struct PtyRegistry {
    sessions: parking_lot::Mutex<HashMap<String, PtySession>>,
}

impl PtyRegistry {
    fn remove_session(&self, session_id: &str) -> bool {
        self.sessions.lock().remove(session_id).is_some()
    }
}

struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    _master: Box<dyn MasterPty + Send>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOpenRequest {
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shell: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyResizeRequest {
    session_id: String,
    cols: u16,
    rows: u16,
}

#[tauri::command]
pub async fn pty_open(
    state: State<'_, AppState>,
    req: PtyOpenRequest,
    channel: Channel<Vec<u8>>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: req.rows,
            cols: req.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(to_string)?;

    let shell = req.shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(shell);
    if let Some(cwd) = req.cwd {
        cmd.cwd(cwd);
    }

    let mut child = pair.slave.spawn_command(cmd).map_err(to_string)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(to_string)?;
    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(to_string)?));
    state.pty.sessions.lock().insert(
        session_id.clone(),
        PtySession {
            writer,
            _master: pair.master,
        },
    );

    let registry = state.pty.clone();
    let task_session_id = session_id.clone();
    tokio::task::spawn_blocking(move || {
        let mut buf = [0_u8; 8192];
        let mut frames = FrameAggregator::new();
        let mut last_flush = std::time::Instant::now();

        loop {
            let Ok(n) = reader.read(&mut buf) else { break };
            if n == 0 {
                break;
            }

            if let Some(frame) = frames.push(&buf[..n]) {
                let _ = channel.send(frame);
                last_flush = std::time::Instant::now();
                continue;
            }
            if last_flush.elapsed() >= std::time::Duration::from_millis(crate::ipc::FRAME_MS) {
                if let Some(frame) = frames.flush() {
                    let _ = channel.send(frame);
                }
                last_flush = std::time::Instant::now();
            }
        }

        if let Some(frame) = frames.flush() {
            let _ = channel.send(frame);
        }

        let _ = child.wait();
        registry.remove_session(&task_session_id);
    });

    Ok(session_id)
}

#[tauri::command]
pub fn pty_write(
    state: State<'_, AppState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let sessions = state.pty.sessions.lock();
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "unknown pty session".to_string())?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "pty writer poisoned".to_string())?;
    writer.write_all(&data).map_err(to_string)?;
    writer.flush().map_err(to_string)
}

#[tauri::command]
pub fn pty_resize(state: State<'_, AppState>, req: PtyResizeRequest) -> Result<(), String> {
    let sessions = state.pty.sessions.lock();
    let session = sessions
        .get(&req.session_id)
        .ok_or_else(|| "unknown pty session".to_string())?;
    session
        ._master
        .resize(PtySize {
            rows: req.rows,
            cols: req.cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(to_string)
}

#[tauri::command]
pub fn pty_close(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state
        .pty
        .remove_session(&session_id)
        .then_some(())
        .ok_or_else(|| "unknown pty session".to_string())
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "/bin/sh".to_string()
        }
    })
}

fn to_string<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

#[allow(dead_code)]
fn _context_example() -> anyhow::Result<()> {
    Err(anyhow!("pty error")).context("pty setup failed")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeMasterPty;

    impl MasterPty for FakeMasterPty {
        fn resize(&self, _size: PtySize) -> Result<(), anyhow::Error> {
            Ok(())
        }

        fn get_size(&self) -> Result<PtySize, anyhow::Error> {
            Ok(PtySize::default())
        }

        fn try_clone_reader(&self) -> Result<Box<dyn Read + Send>, anyhow::Error> {
            unimplemented!("test fake does not read")
        }

        fn take_writer(&self) -> Result<Box<dyn Write + Send>, anyhow::Error> {
            unimplemented!("test fake does not write")
        }

        #[cfg(unix)]
        fn process_group_leader(&self) -> Option<std::os::raw::c_int> {
            None
        }

        #[cfg(unix)]
        fn as_raw_fd(&self) -> Option<std::os::fd::RawFd> {
            None
        }

        #[cfg(unix)]
        fn tty_name(&self) -> Option<std::path::PathBuf> {
            None
        }
    }

    #[test]
    fn removes_pty_sessions_once() {
        let registry = PtyRegistry::default();
        registry.sessions.lock().insert(
            "session-1".to_string(),
            PtySession {
                writer: Arc::new(Mutex::new(Box::new(Vec::<u8>::new()))),
                _master: Box::new(FakeMasterPty),
            },
        );

        expect_session_count(&registry, 1);
        assert!(registry.remove_session("session-1"));
        expect_session_count(&registry, 0);
        assert!(!registry.remove_session("session-1"));
    }

    fn expect_session_count(registry: &PtyRegistry, count: usize) {
        assert_eq!(registry.sessions.lock().len(), count);
    }
}
