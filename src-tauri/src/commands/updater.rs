//! Updater commands — expose the Tauri updater plugin to the frontend.
//!
//! The plugin itself is registered in `lib.rs`. Here we expose two
//! commands:
//!   - `check_for_updates`: probe the configured endpoints and return
//!     metadata about the pending update (if any).
//!   - `download_and_install_update`: download the previously checked
//!     update, streaming progress over a Tauri channel, then install
//!     and relaunch.
//!
//! A pending update is held in a `Mutex<Option<Update>>` so that the
//! two-step flow (check → confirm → install) works: the frontend
//! first calls `check_for_updates`, shows the user the version +
//! release notes, and only calls `download_and_install_update` when
//! the user confirms.

use std::fmt;
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Error type surfaced to the frontend as a string.
#[derive(Debug)]
pub enum UpdaterError {
    Updater(tauri_plugin_updater::Error),
    /// `check_for_updates` was not called first, or the user already
    /// installed the pending update.
    NoPendingUpdate,
}

impl fmt::Display for UpdaterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UpdaterError::Updater(e) => write!(f, "{}", e),
            UpdaterError::NoPendingUpdate => write!(f, "there is no pending update"),
        }
    }
}

impl From<tauri_plugin_updater::Error> for UpdaterError {
    fn from(e: tauri_plugin_updater::Error) -> Self {
        UpdaterError::Updater(e)
    }
}

impl Serialize for UpdaterError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_str())
    }
}

type Result<T> = std::result::Result<T, UpdaterError>;

/// Progress events streamed to the frontend over the channel passed
/// to `download_and_install_update`.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

/// Metadata returned by `check_for_updates` so the frontend can show
/// "v0.2.0 is available, do you want to install?" without already
/// holding the binary.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    pub version: String,
    pub current_version: String,
    pub date: Option<String>,
    pub body: String,
}

/// State holding the most recently checked update, if any.
pub struct PendingUpdate(pub Mutex<Option<Update>>);

impl Default for PendingUpdate {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Probe the configured updater endpoints for a newer release.
///
/// On success, the pending update is stored in `PendingUpdate` so
/// the subsequent `download_and_install_update` call can consume it.
/// Returns `Ok(None)` when the app is already up-to-date.
#[tauri::command]
pub async fn check_for_updates(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateMetadata>> {
    let update = app.updater()?.check().await?;
    let metadata = update.as_ref().map(|u| UpdateMetadata {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        date: u.date.map(|d| {
            format!(
                "{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                d.year(),
                d.month() as u8,
                d.day(),
                d.hour(),
                d.minute(),
                d.second()
            )
        }),
        body: u.body.clone().unwrap_or_default(),
    });
    *pending.0.lock().unwrap() = update;
    Ok(metadata)
}

/// Download and install the pending update (if any), streaming
/// progress events over `on_event`. After installation, relaunches
/// the application.
#[tauri::command]
pub async fn download_and_install_update(
    pending: State<'_, PendingUpdate>,
    on_event: Channel<DownloadEvent>,
) -> Result<()> {
    let update_opt = pending.0.lock().unwrap().take();
    let Some(update) = update_opt else {
        return Err(UpdaterError::NoPendingUpdate);
    };

    let started = std::sync::atomic::AtomicBool::new(false);
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started.load(std::sync::atomic::Ordering::SeqCst) {
                    started.store(true, std::sync::atomic::Ordering::SeqCst);
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await?;
    Ok(())
}
