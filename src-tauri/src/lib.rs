mod commands;
mod crypto;
mod proxy;
mod types;

use std::sync::Arc;
use tokio::sync::RwLock;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create shared proxy state
    let proxy_state = Arc::new(RwLock::new(proxy::ProxyConfig::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(proxy_state.clone())
        .invoke_handler(tauri::generate_handler![
            // Provider / Aggregation
            commands::providers::save_providers,
            commands::providers::load_providers,
            commands::providers::save_aggregations,
            commands::providers::load_aggregations,
            // Proxy control
            commands::providers::start_proxy,
            commands::providers::stop_proxy,
            commands::providers::get_proxy_status,
            commands::providers::get_proxy_auth,
            commands::providers::update_proxy_auth,
            commands::providers::get_proxy_runtime_config,
            commands::providers::update_proxy_runtime_config,
            commands::providers::exit_app,
            // Stats
            commands::stats::get_stats,
            commands::stats::get_recent_requests,
            commands::stats::get_daily_usage,
            // Settings
            commands::settings::save_settings,
            commands::settings::load_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
