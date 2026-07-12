// ═══════════════════════════════════════════════════════════════
// Melody Hub — Settings command (single source of truth)
// ═══════════════════════════════════════════════════════════════
// AppSettings is the persisted mirror of all configuration. On
// save it is projected into the proxy AppState sub-states
// (auth + runtime limits) so the frontend no longer has to issue
// separate `update_proxy_auth` / `update_proxy_runtime_config`
// calls. The same projection helper is reused by the bootstrap
// in lib.rs so there is exactly one code path applying settings
// to the running proxy.
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::net::IpAddr;

use crate::paths;
use crate::proxy::state::UpstreamProxySettings;
use crate::proxy::{self, SharedAppState};
use crate::storage;

/// Application settings. All fields are camelCase for direct
/// serde compatibility with the frontend `AppSettings` interface.
/// Unknown fields from older versions are silently ignored.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    // ── 通用 ──
    pub port: u16,
    pub host: String,
    pub auto_start: bool,
    pub max_concurrency: u32,
    // ── 界面 ──
    pub language: String,
    pub theme: String,
    pub page_size: u32,
    pub time_format: String,
    // ── 网络代理 ──
    pub proxy_enabled: bool,
    pub proxy_host: String,
    pub proxy_port: u16,
    pub proxy_protocol: String,
    pub proxy_username: String,
    pub proxy_password: String,
    // ── 日志与监控 ──
    pub log_retention_days: u32,
    pub log_auto_clean: bool,
    // ── 安全与认证 ──
    pub encrypt_api_keys: bool,
    pub auth_token: String,
    pub ip_whitelist: String,
    pub cors_enabled: bool,
    pub rate_limit: String,
    // ── 高级选项 ──
    pub api_timeout: u32,
    pub max_retries: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            port: 8080,
            host: "127.0.0.1".into(),
            auto_start: true,
            max_concurrency: 20,
            language: "zh-CN".into(),
            theme: "light".into(),
            page_size: 10,
            time_format: "24h".into(),
            proxy_enabled: false,
            proxy_host: String::new(),
            proxy_port: 7890,
            proxy_protocol: "http".into(),
            proxy_username: String::new(),
            proxy_password: String::new(),
            log_retention_days: 30,
            log_auto_clean: true,
            encrypt_api_keys: true,
            auth_token: String::new(),
            ip_whitelist: String::new(),
            cors_enabled: true,
            rate_limit: "0".into(),
            api_timeout: 60,
            max_retries: "0".into(),
        }
    }
}

const SETTINGS_FILE: &str = "settings.json";

fn read_settings(app_handle: &tauri::AppHandle) -> Result<Option<AppSettings>, String> {
    let path = paths::config_file(app_handle, SETTINGS_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let data: AppSettings = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(data))
}

fn write_settings(app_handle: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = paths::config_file(app_handle, SETTINGS_FILE);
    storage::write_json_atomic(&path, settings)?;
    println!("[settings] Saved to {:?}", path);
    Ok(())
}

/// Project persisted settings into the proxy AppState. This is
/// the single code path that keeps settings and the running proxy
/// in sync — used by both `save_settings` and the startup bootstrap.
pub async fn apply_settings_to_state(
    state: &SharedAppState,
    settings: &AppSettings,
) -> Result<(), String> {
    // Auth + CORS + IP whitelist.
    proxy::update_security_config(
        state,
        settings.auth_token.clone(),
        settings.cors_enabled,
        settings.ip_whitelist.clone(),
    )
    .await;

    // Runtime limits. `rate_limit` is stored as a string in
    // settings (option-style UI) and parsed here.
    let rate_limit = settings.rate_limit.parse::<u32>().unwrap_or(0);
    let max_retries = settings.max_retries.parse::<u32>().unwrap_or(0);
    proxy::update_runtime_config(
        state,
        rate_limit,
        settings.api_timeout as u64,
        10 * 1024 * 1024,
        settings.max_concurrency,
        max_retries,
    )
    .await;

    let upstream_proxy = UpstreamProxySettings {
        enabled: settings.proxy_enabled,
        host: settings.proxy_host.clone(),
        port: settings.proxy_port,
        protocol: settings.proxy_protocol.clone(),
        username: settings.proxy_username.clone(),
        password: settings.proxy_password.clone(),
    };
    state.rebuild_http_client(&upstream_proxy).await?;

    if settings.log_auto_clean {
        let removed = state.metrics.prune_old(settings.log_retention_days).await?;
        if removed > 0 {
            println!("[settings] Pruned {} old log files", removed);
        }
    }

    Ok(())
}

/// Load settings from disk, or return defaults if none exist yet.
/// On first launch (no auth token), a token is generated and
/// persisted so it stays stable across restarts.
pub fn load_or_init(app_handle: &tauri::AppHandle) -> Result<AppSettings, String> {
    if let Some(mut s) = read_settings(app_handle)? {
        // Heal missing auth token: generate + persist a stable one.
        if s.auth_token.is_empty() {
            s.auth_token = uuid::Uuid::new_v4().to_string();
            write_settings(app_handle, &s)?;
        }
        Ok(s)
    } else {
        let s = AppSettings {
            auth_token: uuid::Uuid::new_v4().to_string(),
            ..Default::default()
        };
        write_settings(app_handle, &s)?;
        Ok(s)
    }
}

#[tauri::command]
pub async fn save_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    write_settings(&app_handle, &settings)?;
    apply_settings_to_state(state.inner(), &settings).await?;
    restart_running_proxy_if_needed(state.inner().clone(), &settings).await?;
    Ok(())
}

/// Apply the currently-persisted settings (or defaults) to the
/// proxy AppState. Called by the bootstrap and after `save_settings`.
#[tauri::command]
pub async fn apply_settings(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let settings = load_or_init(&app_handle)?;
    apply_settings_to_state(state.inner(), &settings).await?;
    restart_running_proxy_if_needed(state.inner().clone(), &settings).await?;
    Ok(())
}

#[tauri::command]
pub fn load_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    load_or_init(&app_handle)
}

// ── Backwards-compatible granular mutators ─────────────────
//
// Retained so older frontends keep working, but `save_settings` +
// `apply_settings` is now the preferred path.

#[tauri::command]
pub async fn get_proxy_auth(
    state: tauri::State<'_, SharedAppState>,
) -> Result<serde_json::Value, String> {
    let auth = state.auth.read().await;
    Ok(serde_json::json!({
        "authToken": auth.auth_token,
        "corsEnabled": auth.cors_enabled,
    }))
}

#[tauri::command]
pub async fn update_proxy_auth(
    auth_token: String,
    cors_enabled: bool,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    proxy::update_security_config(state.inner(), auth_token, cors_enabled, String::new()).await;
    Ok(())
}

#[tauri::command]
pub async fn get_proxy_runtime_config(
    state: tauri::State<'_, SharedAppState>,
) -> Result<serde_json::Value, String> {
    let limits = state.runtime.read().await;
    Ok(serde_json::json!({
        "rateLimitPerMinute": limits.rate_limit_per_minute,
        "apiTimeoutSecs": limits.api_timeout_secs,
        "maxBodySize": limits.max_body_size,
    }))
}

#[tauri::command]
pub async fn update_proxy_runtime_config(
    rate_limit_per_minute: u32,
    api_timeout_secs: u64,
    max_body_size: u64,
    max_concurrency: u32,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    proxy::update_runtime_config(
        state.inner(),
        rate_limit_per_minute,
        api_timeout_secs,
        max_body_size,
        max_concurrency,
        0,
    )
    .await;
    Ok(())
}

async fn restart_running_proxy_if_needed(
    state: SharedAppState,
    settings: &AppSettings,
) -> Result<(), String> {
    let status = proxy::status();
    if !status.running {
        return Ok(());
    }

    validate_bind_host(&settings.host)?;
    proxy::stop().await?;
    proxy::start(state, settings.host.clone(), settings.port).await
}

fn validate_bind_host(host: &str) -> Result<(), String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err("Proxy host cannot be empty".into());
    }
    if trimmed.eq_ignore_ascii_case("localhost") {
        return Ok(());
    }
    trimmed
        .parse::<IpAddr>()
        .map(|_| ())
        .map_err(|e| format!("Invalid proxy host '{}': {}", trimmed, e))
}
