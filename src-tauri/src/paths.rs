// ═══════════════════════════════════════════════════════════════
// Melody Hub — Centralized application paths
// ═══════════════════════════════════════════════════════════════
// Single source of truth for on-disk locations. Eliminates the
// duplicate `data_dir()` helpers that previously existed in
// providers.rs / settings.rs / logs.rs.
// ═══════════════════════════════════════════════════════════════

use std::path::PathBuf;
use tauri::Manager;

/// Subdirectory under the platform app-data dir that holds all
/// Melody Hub persistent state.
const APP_SUBDIR: &str = "melody-hub";

/// Encryption key filename (stored beside the config files).
const KEY_FILE: &str = ".encryption_key";

/// Resolve the app data directory, creating it if necessary.
/// Falls back to a local `melody-hub_data` directory when the
/// platform path cannot be resolved (e.g. headless test env).
pub fn app_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| {
        let mut fallback =
            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        fallback.push("melody-hub_data");
        fallback
    });
    path.push(APP_SUBDIR);
    std::fs::create_dir_all(&path).ok();
    path
}

/// Path to a named JSON config file inside the app data dir.
pub fn config_file(app_handle: &tauri::AppHandle, filename: &str) -> PathBuf {
    app_data_dir(app_handle).join(filename)
}

/// Path to the API-key encryption key file.
pub fn key_file(app_handle: &tauri::AppHandle) -> PathBuf {
    app_data_dir(app_handle).join(KEY_FILE)
}

/// Path to the logs directory, creating it if necessary.
pub fn logs_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_data_dir(app_handle).join("logs");
    std::fs::create_dir_all(&dir).ok();
    dir
}
