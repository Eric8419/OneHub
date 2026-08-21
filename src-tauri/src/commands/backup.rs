// ═══════════════════════════════════════════════════════════════
// Melody Hub — Config export / import / WebDAV backup
// ═══════════════════════════════════════════════════════════════
// A single versioned bundle carries settings + providers +
// aggregations so users can move their whole configuration between
// machines or push it to a WebDAV server. Provider API keys are
// exported in plaintext (the UI warns about this) so the bundle is
// portable; on import they are re-encrypted by `storage`.
// ═══════════════════════════════════════════════════════════════

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::commands::settings::{self, AppSettings};
use crate::proxy::{self, SharedAppState};
use crate::storage;
use crate::types::{Aggregation, Provider};

/// Current bundle schema version. Bump when the shape changes in a
/// backwards-incompatible way.
const BUNDLE_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigBundle {
    pub version: u32,
    /// App identifier so an unrelated JSON file is rejected early.
    #[serde(default)]
    pub app: String,
    #[serde(default)]
    pub exported_at: String,
    pub settings: AppSettings,
    #[serde(default)]
    pub providers: Vec<Provider>,
    #[serde(default)]
    pub aggregations: Vec<Aggregation>,
}

const APP_TAG: &str = "onehub";

/// Build the in-memory bundle from the current on-disk config.
fn build_bundle(app_handle: &tauri::AppHandle) -> Result<ConfigBundle, String> {
    let settings = settings::load_or_init(app_handle)?;
    let providers = storage::load_providers(app_handle)?;
    let aggregations = storage::load_aggregations(app_handle)?;
    Ok(ConfigBundle {
        version: BUNDLE_VERSION,
        app: APP_TAG.to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        settings,
        providers,
        aggregations,
    })
}

fn serialize_bundle(bundle: &ConfigBundle) -> Result<String, String> {
    serde_json::to_string_pretty(bundle).map_err(|e| e.to_string())
}

/// Export the full configuration bundle to a JSON string. The
/// frontend saves it via a download/file input so no filesystem
/// dialog plugin is required.
#[tauri::command]
pub fn export_config(app_handle: tauri::AppHandle) -> Result<String, String> {
    let bundle = build_bundle(&app_handle)?;
    serialize_bundle(&bundle)
}

/// Export the configuration bundle to a JSON file in the user's
/// Downloads folder. Returns the written path.
#[tauri::command]
pub fn export_config_to_file(app_handle: tauri::AppHandle) -> Result<String, String> {
    let bundle = build_bundle(&app_handle)?;
    let json = serialize_bundle(&bundle)?;

    let downloads = dirs::download_dir().unwrap_or_else(|| {
        app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    });
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("onehub-config-{}.json", timestamp);
    let export_path = downloads.join(&filename);
    std::fs::write(&export_path, json).map_err(|e| e.to_string())?;
    println!("[backup] Exported config to {:?}", export_path);
    Ok(export_path.to_string_lossy().to_string())
}

fn parse_bundle(contents: &str) -> Result<ConfigBundle, String> {
    let bundle: ConfigBundle = serde_json::from_str(contents)
        .map_err(|e| format!("配置文件解析失败：{}", e))?;
    if !bundle.app.is_empty() && bundle.app != APP_TAG && bundle.app != "melody-hub" {
        return Err("这不是 OneHub 的配置文件".to_string());
    }
    if bundle.version > BUNDLE_VERSION {
        return Err(format!(
            "配置文件版本 {} 高于当前支持的版本 {}，请升级应用后再导入",
            bundle.version, BUNDLE_VERSION
        ));
    }
    Ok(bundle)
}

/// Import a configuration bundle (from a JSON string), persist all
/// three config files, and apply the result to the running proxy.
#[tauri::command]
pub async fn import_config(
    app_handle: tauri::AppHandle,
    contents: String,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let bundle = parse_bundle(&contents)?;

    // Persist all config files first (providers re-encrypt keys).
    storage::save_providers(&app_handle, &bundle.providers)?;
    storage::save_aggregations(&app_handle, &bundle.aggregations)?;
    settings::persist_settings(&app_handle, &bundle.settings)?;

    // Refresh routing state and re-apply settings to the proxy.
    proxy::update_routing_config(
        state.inner(),
        bundle.providers.clone(),
        bundle.aggregations.clone(),
    )
    .await;
    settings::apply_settings_to_state(state.inner(), &bundle.settings).await?;

    println!(
        "[backup] Imported config: {} providers, {} aggregations",
        bundle.providers.len(),
        bundle.aggregations.len()
    );
    Ok(())
}

/// Push the current configuration bundle to a WebDAV server via an
/// authenticated PUT. Returns the full remote URL on success.
#[tauri::command]
pub async fn backup_config_to_webdav(
    app_handle: tauri::AppHandle,
    url: String,
    username: String,
    password: String,
) -> Result<String, String> {
    let base = url.trim();
    if base.is_empty() {
        return Err("请先填写 WebDAV 地址".to_string());
    }
    if !base.starts_with("http://") && !base.starts_with("https://") {
        return Err("WebDAV 地址必须以 http:// 或 https:// 开头".to_string());
    }

    let bundle = build_bundle(&app_handle)?;
    let json = serialize_bundle(&bundle)?;

    // Treat a trailing slash as a directory and append a timestamped
    // filename; otherwise PUT to the exact path the user provided.
    let target = if base.ends_with('/') {
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        format!("{}onehub-config-{}.json", base, timestamp)
    } else {
        base.to_string()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败：{}", e))?;

    let mut request = client
        .put(&target)
        .header("Content-Type", "application/json")
        .body(json);
    if !username.is_empty() {
        request = request.basic_auth(username, Some(password));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("上传到 WebDAV 失败：{}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "WebDAV 返回错误状态：{} {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("")
        ));
    }

    println!("[backup] Backed up config to WebDAV: {}", target);
    Ok(target)
}
