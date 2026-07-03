use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// Application settings matching the frontend AppSettings interface.
/// All fields are camelCase for direct serde compatibility with the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    // ── 通用 ──
    pub port: u16,
    pub host: String,
    pub auto_start: bool,
    pub max_concurrency: u32,
    // ── Token ──
    pub token_limit: u64,
    pub token_warning_threshold: String,
    pub token_stat_period: String,
    // ── 界面 ──
    pub language: String,
    pub theme: String,
    pub page_size: u32,
    pub time_format: String,
    // ── 通知 ──
    pub api_error_notify: bool,
    pub quota_notify: bool,
    pub model_status_notify: bool,
    // ── 网络代理 ──
    pub proxy_enabled: bool,
    pub proxy_host: String,
    pub proxy_port: u16,
    pub proxy_protocol: String,
    pub proxy_username: String,
    pub proxy_password: String,
    // ── 日志与监控 ──
    pub log_level: String,
    pub log_retention_days: u32,
    pub log_request_content: bool,
    pub log_auto_clean: bool,
    // ── 安全与认证 ──
    pub encrypt_api_keys: bool,
    pub auth_token: String,
    pub ip_whitelist: String,
    pub cors_enabled: bool,
    pub rate_limit: String,
    pub audit_log: bool,
    // ── 高级选项 ──
    pub debug_mode: bool,
    pub api_timeout: u32,
    pub max_retries: String,
    pub cache_strategy: String,
    pub data_path: String,
    pub experimental_features: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            port: 8080,
            host: "127.0.0.1".into(),
            auto_start: true,
            max_concurrency: 20,
            token_limit: 1_000_000,
            token_warning_threshold: "80%".into(),
            token_stat_period: "daily".into(),
            language: "zh-CN".into(),
            theme: "light".into(),
            page_size: 10,
            time_format: "24h".into(),
            api_error_notify: true,
            quota_notify: true,
            model_status_notify: false,
            proxy_enabled: false,
            proxy_host: String::new(),
            proxy_port: 7890,
            proxy_protocol: "http".into(),
            proxy_username: String::new(),
            proxy_password: String::new(),
            log_level: "info".into(),
            log_retention_days: 30,
            log_request_content: true,
            log_auto_clean: true,
            encrypt_api_keys: true,
            auth_token: String::new(),
            ip_whitelist: String::new(),
            cors_enabled: true,
            rate_limit: "0".into(),
            audit_log: false,
            debug_mode: false,
            api_timeout: 60,
            max_retries: "0".into(),
            cache_strategy: "none".into(),
            data_path: "~/.melody-hub/data".into(),
            experimental_features: false,
        }
    }
}

fn data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle.path().app_data_dir().unwrap_or_else(|_| {
        let mut fallback = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        fallback.push("melody-hub_data");
        fallback
    });
    path.push("melody-hub");
    std::fs::create_dir_all(&path).ok();
    path
}

#[tauri::command]
pub fn save_settings(
    app_handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    let path = data_dir(&app_handle).join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    println!("[persist] Settings saved to {:?}", path);
    Ok(())
}

#[tauri::command]
pub fn load_settings(
    app_handle: tauri::AppHandle,
) -> Result<AppSettings, String> {
    let path = data_dir(&app_handle).join("settings.json");
    if path.exists() {
        let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&json).map_err(|e| e.to_string())
    } else {
        Ok(AppSettings::default())
    }
}