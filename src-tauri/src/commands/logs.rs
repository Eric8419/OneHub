// ═══════════════════════════════════════════════════════════════
// Melody Hub — Log commands
// ═══════════════════════════════════════════════════════════════
// Export + open-log-dir helpers. Paths now flow through the
// shared `paths` module; metrics flushing uses the new
// MetricsStore via `proxy::flush_metrics`.
// ═══════════════════════════════════════════════════════════════

use std::path::PathBuf;

use tauri::Manager;

use crate::paths;
use crate::proxy::{self, SharedAppState};

/// Export request records to a JSON file in the user's Downloads
/// folder. Flushes pending records to disk first so the export is
/// complete. Returns the exported file path.
#[tauri::command]
pub async fn export_logs(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<String, String> {
    proxy::flush_metrics(state.inner()).await;

    let records = state.metrics.snapshot().await;
    if records.is_empty() {
        return Err("No request records to export".into());
    }

    let downloads = dirs::download_dir().unwrap_or_else(|| {
        app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    });

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let filename = format!("melody-hub-logs-{}.json", timestamp);
    let export_path = downloads.join(&filename);

    let json = serde_json::to_string_pretty(&records).map_err(|e| e.to_string())?;
    std::fs::write(&export_path, json).map_err(|e| e.to_string())?;

    println!(
        "[export] Exported {} records to {:?}",
        records.len(),
        export_path
    );
    Ok(export_path.to_string_lossy().to_string())
}

/// Open the log directory in the system file manager.
#[tauri::command]
pub async fn open_log_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
    let log_dir = paths::logs_dir(&app_handle);
    open::that(&log_dir).map_err(|e| format!("Failed to open log directory: {}", e))?;
    println!("[export] Opened log directory: {:?}", log_dir);
    Ok(())
}

/// Initialize the log directory and load recent history into the
/// metrics store. Called once during bootstrap.
#[tauri::command]
pub async fn init_log_dir(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let log_dir = paths::logs_dir(&app_handle);
    proxy::init_metrics(state.inner(), log_dir).await
}
