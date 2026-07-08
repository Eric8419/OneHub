// ═══════════════════════════════════════════════════════════════
// Melody Hub — Provider & aggregation commands
// ═══════════════════════════════════════════════════════════════
// Thin Tauri command wrappers around the storage + proxy layers.
// Persistence (with API-key encryption) lives in `storage.rs`;
// runtime config updates live in `proxy::update_routing_config`.
// ═══════════════════════════════════════════════════════════════

use crate::proxy::{self, SharedAppState};
use crate::storage;
use crate::types::{Aggregation, Provider};

// ── Provider profiles + connection test ─────────────────────

use crate::proxy::adapter::{self, ConnectionTestResult, ProfileEntry};

/// List curated provider profiles for the "add provider" dropdown.
/// Lets users pick a known provider instead of typing a base URL.
#[tauri::command]
pub fn list_provider_profiles() -> Vec<ProfileEntry> {
    adapter::profile_entries()
}

/// Test a provider connection by sending a real lightweight request.
/// Replaces the frontend's simulated test. Returns a classified
/// result (success / model count / structured error).
#[tauri::command]
pub async fn test_provider_connection(
    flavor: String,
    api_base: String,
    api_key: String,
    state: tauri::State<'_, SharedAppState>,
) -> Result<ConnectionTestResult, String> {
    // Use the configured API timeout, clamped to a sensible test
    // window so a slow connection test doesn't hang the UI.
    let configured = state.runtime.read().await.api_timeout_secs;
    let timeout_secs = configured.clamp(5, 15);
    Ok(adapter::test_connection(&flavor, &api_base, &api_key, timeout_secs).await)
}

/// Fetch available models from providers that expose a model-list
/// endpoint. Returns a friendly message and an empty list for
/// protocols that require manual model entry.
#[tauri::command]
pub async fn fetch_provider_models(
    flavor: String,
    api_base: String,
    api_key: String,
    state: tauri::State<'_, SharedAppState>,
) -> Result<adapter::FetchModelsResult, String> {
    let configured = state.runtime.read().await.api_timeout_secs;
    let timeout_secs = configured.clamp(5, 20);
    Ok(adapter::fetch_models(&flavor, &api_base, &api_key, timeout_secs).await)
}

// ── Provider commands ───────────────────────────────────────

/// Save providers (persist encrypted + update routing state).
#[tauri::command]
pub async fn save_providers(
    app_handle: tauri::AppHandle,
    providers: Vec<Provider>,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let agg_list = state.routing.read().await.aggregations.clone();
    storage::save_providers(&app_handle, &providers)?;
    proxy::update_routing_config(state.inner(), providers, agg_list).await;
    Ok(())
}

/// Load providers (decrypt + update routing state).
#[tauri::command]
pub async fn load_providers(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<Vec<Provider>, String> {
    let providers = storage::load_providers(&app_handle)?;
    let agg_list = state.routing.read().await.aggregations.clone();
    proxy::update_routing_config(state.inner(), providers.clone(), agg_list).await;
    Ok(providers)
}

// ── Aggregation commands ────────────────────────────────────

/// Save aggregations (persist + update routing state).
#[tauri::command]
pub async fn save_aggregations(
    app_handle: tauri::AppHandle,
    aggregations: Vec<Aggregation>,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    let prov_list = state.routing.read().await.providers.clone();
    storage::save_aggregations(&app_handle, &aggregations)?;
    proxy::update_routing_config(state.inner(), prov_list, aggregations).await;
    Ok(())
}

/// Load aggregations (persist + update routing state).
#[tauri::command]
pub async fn load_aggregations(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, SharedAppState>,
) -> Result<Vec<Aggregation>, String> {
    let aggregations = storage::load_aggregations(&app_handle)?;
    let prov_list = state.routing.read().await.providers.clone();
    proxy::update_routing_config(state.inner(), prov_list, aggregations.clone()).await;
    Ok(aggregations)
}

// ── Proxy lifecycle commands ────────────────────────────────

#[tauri::command]
pub async fn start_proxy(
    host: Option<String>,
    port: u16,
    state: tauri::State<'_, SharedAppState>,
) -> Result<(), String> {
    proxy::start(
        state.inner().clone(),
        host.unwrap_or_else(|| "127.0.0.1".into()),
        port,
    )
    .await
}

#[tauri::command]
pub async fn stop_proxy(state: tauri::State<'_, SharedAppState>) -> Result<(), String> {
    proxy::flush_metrics(state.inner()).await;
    proxy::stop().await
}

#[tauri::command]
pub fn get_proxy_status() -> crate::types::ProxyStatus {
    proxy::status()
}

/// Exit the application.
#[tauri::command]
pub async fn exit_app(state: tauri::State<'_, SharedAppState>) -> Result<(), String> {
    proxy::flush_metrics(state.inner()).await;
    let _ = proxy::stop().await;
    std::process::exit(0);
}
