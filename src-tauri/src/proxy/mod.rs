// ═══════════════════════════════════════════════════════════════
// Melody Hub — Local LLM API Proxy (module root)
// ═══════════════════════════════════════════════════════════════
// The proxy is split into focused submodules:
//   - adapter:  per-provider API translation
//   - routing:  model/aggregation resolution + strategies
//   - metrics:  request-record accumulation + JSONL persistence
//   - server:   Axum router + handlers
//   - state:    AppState (routing / auth / runtime / metrics)
//
// This module wires them together and exposes the small set of
// helpers the commands layer needs (start/stop/status + config
// mutators that were previously free functions on ProxyConfig).
// ═══════════════════════════════════════════════════════════════

pub mod adapter;
pub mod metrics;
pub mod routing;
pub mod server;
pub mod state;

use std::path::PathBuf;

use crate::types::{Aggregation, Provider};

pub use state::{AppState, SharedAppState};

// ── Server lifecycle (thin re-exports) ──────────────────────

pub async fn start(state: SharedAppState, host: String, port: u16) -> Result<(), String> {
    server::start(state, host, port).await
}

pub async fn stop() -> Result<(), String> {
    server::stop().await
}

pub fn status() -> crate::types::ProxyStatus {
    server::status()
}

// ── Config mutators ─────────────────────────────────────────
//
// These update the runtime sub-states in place. They replace the
// old `update_config` / `update_auth_config` / `update_runtime_config`
// free functions that operated on the god-object ProxyConfig.

/// Replace providers + aggregations in routing state.
pub async fn update_routing_config(
    state: &SharedAppState,
    providers: Vec<Provider>,
    aggregations: Vec<Aggregation>,
) {
    let mut cfg = state.routing.write().await;
    cfg.providers = providers;
    cfg.aggregations = aggregations;
}

/// Update auth token, CORS flag and IP whitelist.
pub async fn update_security_config(
    state: &SharedAppState,
    auth_token: String,
    cors_enabled: bool,
    ip_whitelist: String,
) {
    let mut auth = state.auth.write().await;
    auth.auth_token = auth_token;
    auth.cors_enabled = cors_enabled;
    auth.ip_whitelist = ip_whitelist;
}

/// Update runtime limits and rebuild the concurrency semaphore.
pub async fn update_runtime_config(
    state: &SharedAppState,
    rate_limit_per_minute: u32,
    api_timeout_secs: u64,
    max_body_size: u64,
    max_concurrency: u32,
    max_retries: u32,
) {
    let mut limits = state.runtime.write().await;
    limits.rate_limit_per_minute = rate_limit_per_minute;
    limits.api_timeout_secs = api_timeout_secs;
    limits.max_body_size = max_body_size;
    limits.max_concurrency = max_concurrency;
    limits.max_retries = max_retries;
    limits.rebuild_semaphore();
}

/// Initialize the metrics log directory and load recent history.
pub async fn init_metrics(state: &SharedAppState, log_dir: PathBuf) -> Result<(), String> {
    state.metrics.initialize(log_dir).await
}

/// Flush pending metrics records to disk.
pub async fn flush_metrics(state: &SharedAppState) -> u32 {
    state.metrics.flush().await
}
