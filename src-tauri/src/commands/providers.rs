use crate::crypto;
use crate::proxy;
use crate::types::{Aggregation, Provider};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

// ── Persistence Helpers ───────────────────────────────────────

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

fn save_to_file<T: serde::Serialize>(
    app_handle: &tauri::AppHandle,
    filename: &str,
    data: &T,
) -> Result<(), String> {
    let path = data_dir(app_handle).join(filename);
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    println!("[persist] Saved {} to {:?}", filename, path);
    Ok(())
}

fn load_from_file<T: serde::de::DeserializeOwned>(
    app_handle: &tauri::AppHandle,
    filename: &str,
) -> Result<Option<T>, String> {
    let path = data_dir(app_handle).join(filename);
    if path.exists() {
        let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let data: T = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        println!("[persist] Loaded {} from {:?}", filename, path);
        Ok(Some(data))
    } else {
        Ok(None)
    }
}

// ── Commands ──────────────────────────────────────────────────

/// Save providers list (persists to disk and updates proxy shared state)
#[tauri::command]
pub async fn save_providers(
    app_handle: tauri::AppHandle,
    providers: Vec<Provider>,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<(), String> {
    let agg_list = {
        let cfg = proxy_state.read().await;
        cfg.aggregations.clone()
    };
    proxy::update_config(&proxy_state, providers.clone(), agg_list).await;

    // Encrypt API keys before persisting to disk
    let encrypted_providers: Vec<Provider> = providers
        .into_iter()
        .map(|mut p| {
            if !p.api_key.is_empty() {
                p.api_key = crypto::encrypt(&p.api_key, &app_handle).unwrap_or_default();
            }
            p
        })
        .collect();

    save_to_file(&app_handle, "providers.json", &encrypted_providers)?;
    Ok(())
}

/// Load providers list (from disk, falls back to proxy state)
#[tauri::command]
pub async fn load_providers(
    app_handle: tauri::AppHandle,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<Vec<Provider>, String> {
    // Try loading from disk first
    if let Some(providers) = load_from_file::<Vec<Provider>>(&app_handle, "providers.json")? {
        // Decrypt API keys
        let decrypted_providers: Vec<Provider> = providers
            .into_iter()
            .map(|mut p| {
                if !p.api_key.is_empty() {
                    p.api_key = crypto::decrypt(&p.api_key, &app_handle).unwrap_or(p.api_key);
                }
                p
            })
            .collect();

        // Update in-memory state with decrypted keys
        let agg_list = {
            let cfg = proxy_state.read().await;
            cfg.aggregations.clone()
        };
        proxy::update_config(&proxy_state, decrypted_providers.clone(), agg_list).await;
        return Ok(decrypted_providers);
    }
    // Fallback to proxy state
    let cfg = proxy_state.read().await;
    Ok(cfg.providers.clone())
}

/// Save aggregations (persists to disk and updates proxy shared state)
#[tauri::command]
pub async fn save_aggregations(
    app_handle: tauri::AppHandle,
    aggregations: Vec<Aggregation>,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<(), String> {
    let prov_list = {
        let cfg = proxy_state.read().await;
        cfg.providers.clone()
    };
    proxy::update_config(&proxy_state, prov_list, aggregations.clone()).await;
    save_to_file(&app_handle, "aggregations.json", &aggregations)?;
    Ok(())
}

/// Load aggregations (from disk, falls back to proxy state)
#[tauri::command]
pub async fn load_aggregations(
    app_handle: tauri::AppHandle,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<Vec<Aggregation>, String> {
    // Try loading from disk first
    if let Some(aggregations) =
        load_from_file::<Vec<Aggregation>>(&app_handle, "aggregations.json")?
    {
        // Update in-memory state
        let prov_list = {
            let cfg = proxy_state.read().await;
            cfg.providers.clone()
        };
        proxy::update_config(&proxy_state, prov_list, aggregations.clone()).await;
        return Ok(aggregations);
    }
    // Fallback to proxy state
    let cfg = proxy_state.read().await;
    Ok(cfg.aggregations.clone())
}

/// Start the proxy server
#[tauri::command]
pub async fn start_proxy(
    port: u16,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<(), String> {
    proxy::start(proxy_state.inner().clone(), port)
}

/// Stop the proxy server
#[tauri::command]
pub fn stop_proxy() -> Result<(), String> {
    proxy::stop()
}

/// Get proxy server status
#[tauri::command]
pub fn get_proxy_status() -> crate::types::ProxyStatus {
    proxy::status()
}

/// Get the current auth token from proxy config
#[tauri::command]
pub async fn get_proxy_auth(
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<serde_json::Value, String> {
    let cfg = proxy_state.read().await;
    Ok(serde_json::json!({
        "authToken": cfg.auth_token,
        "corsEnabled": cfg.cors_enabled,
    }))
}

/// Update the proxy's auth settings
#[tauri::command]
pub async fn update_proxy_auth(
    auth_token: String,
    cors_enabled: bool,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<(), String> {
    proxy::update_auth_config(&proxy_state, auth_token, cors_enabled).await;
    Ok(())
}

/// Get proxy runtime config (rate limit, timeout, etc.)
#[tauri::command]
pub async fn get_proxy_runtime_config(
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<serde_json::Value, String> {
    let cfg = proxy_state.read().await;
    Ok(serde_json::json!({
        "rateLimitPerMinute": cfg.rate_limit_per_minute,
        "apiTimeoutSecs": cfg.api_timeout_secs,
        "maxBodySize": cfg.max_body_size,
    }))
}

/// Update proxy runtime config (rate limit, timeout, etc.)
#[tauri::command]
pub async fn update_proxy_runtime_config(
    rate_limit_per_minute: u32,
    api_timeout_secs: u64,
    max_body_size: u64,
    proxy_state: tauri::State<'_, Arc<RwLock<proxy::ProxyConfig>>>,
) -> Result<(), String> {
    proxy::update_runtime_config(
        &proxy_state,
        rate_limit_per_minute,
        api_timeout_secs,
        max_body_size,
    )
    .await;
    Ok(())
}

/// Exit the application
#[tauri::command]
pub fn exit_app() {
    std::process::exit(0);
}
