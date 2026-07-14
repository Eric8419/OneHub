// ═══════════════════════════════════════════════════════════════
// Melody Hub — Proxy application state
// ═══════════════════════════════════════════════════════════════
// Splits the former `ProxyConfig` god-object into focused
// sub-states, each behind its own RwLock so hot paths (e.g.
// recording a request) don't take a write lock on unrelated
// routing/auth data.
// ═══════════════════════════════════════════════════════════════

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::proxy::metrics::{MetricsStore, SharedMetrics};
use crate::proxy::routing::{RoutingState, SharedRouting};

/// Upstream HTTP proxy configuration for outbound provider calls.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpstreamProxySettings {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub username: String,
    pub password: String,
}

/// Authentication + CORS configuration. Mutated only when the
/// user saves security settings.
pub struct AuthConfig {
    pub auth_token: String,
    pub cors_enabled: bool,
    pub ip_whitelist: String,
}

impl AuthConfig {
    pub fn new() -> Self {
        Self {
            auth_token: String::new(),
            cors_enabled: false,
            ip_whitelist: String::new(),
        }
    }
}

/// Runtime limits: rate limit, timeouts, concurrency. Mutated
/// when the user saves runtime settings.
pub struct RuntimeLimits {
    pub rate_limit_per_minute: u32,
    pub api_timeout_secs: u64,
    pub max_body_size: u64,
    pub max_concurrency: u32,
    pub max_retries: u32,
    pub concurrency_semaphore: Option<Arc<tokio::sync::Semaphore>>,
    /// Sliding-window timestamps for the per-minute rate limiter.
    pub request_timestamps: Vec<std::time::Instant>,
}

impl RuntimeLimits {
    pub fn new() -> Self {
        Self {
            rate_limit_per_minute: 0,
            api_timeout_secs: 60,
            max_body_size: 10 * 1024 * 1024,
            max_concurrency: 20,
            max_retries: 0,
            concurrency_semaphore: Some(Arc::new(tokio::sync::Semaphore::new(20))),
            request_timestamps: Vec::new(),
        }
    }

    /// Rebuild the concurrency semaphore after `max_concurrency` changes.
    /// A value of 0 means "effectively unlimited"; we cap at tokio's
    /// `MAX_PERMITS` so the semaphore can actually be constructed.
    pub fn rebuild_semaphore(&mut self) {
        const MAX_PERMITS: usize = 1_000_000;
        let permits = if self.max_concurrency == 0 {
            MAX_PERMITS
        } else {
            self.max_concurrency as usize
        };
        self.concurrency_semaphore = Some(Arc::new(tokio::sync::Semaphore::new(permits)));
    }
}

/// Composite application state shared across handlers.
/// Each concern has its own lock to minimize contention.
pub struct AppState {
    pub routing: SharedRouting,
    pub auth: RwLock<AuthConfig>,
    pub runtime: RwLock<RuntimeLimits>,
    pub metrics: SharedMetrics,
    /// Pooled reqwest client (created lazily / rebuilt when the
    /// upstream proxy settings change). Reusing one client across
    /// requests enables connection pooling.
    pub http_client: RwLock<Option<reqwest::Client>>,
    /// Tauri AppHandle for emitting events to the frontend.
    /// Set once during bootstrap; read by `finalize_record` to
    /// push `request-completed` events (replaces polling).
    pub app_handle: RwLock<Option<tauri::AppHandle>>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            routing: Arc::new(RwLock::new(RoutingState::new())),
            auth: RwLock::new(AuthConfig::new()),
            runtime: RwLock::new(RuntimeLimits::new()),
            metrics: Arc::new(MetricsStore::new()),
            http_client: RwLock::new(None),
            app_handle: RwLock::new(None),
        })
    }

    /// Inject the Tauri AppHandle so the proxy layer can emit
    /// events. Called once during bootstrap, before the proxy starts.
    pub async fn set_app_handle(&self, handle: tauri::AppHandle) {
        let mut guard = self.app_handle.write().await;
        *guard = Some(handle);
    }

    /// Build (or rebuild) the shared reqwest client. Called once
    /// during bootstrap and again whenever upstream-proxy settings
    /// change. A plain client (no system proxy) is used by default.
    pub async fn rebuild_http_client(&self, proxy: &UpstreamProxySettings) -> Result<(), String> {
        let client = build_http_client(proxy)?;
        let mut guard = self.http_client.write().await;
        *guard = Some(client);
        Ok(())
    }
}

pub type SharedAppState = Arc<AppState>;

/// Construct a reqwest client with sensible defaults. Kept as a
/// free fn so it can be unit-tested without an AppState.
fn build_http_client(proxy: &UpstreamProxySettings) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .tcp_keepalive(std::time::Duration::from_secs(30));

    if proxy.enabled {
        let host = proxy.host.trim();
        if host.is_empty() {
            return Err("Proxy host is required when upstream proxy is enabled".into());
        }
        let protocol = match proxy.protocol.as_str() {
            "http" | "https" | "socks5" | "socks5h" => proxy.protocol.as_str(),
            other => return Err(format!("Unsupported upstream proxy protocol: {}", other)),
        };
        let proxy_url = format!("{}://{}:{}", protocol, host, proxy.port);
        let mut upstream_proxy = reqwest::Proxy::all(&proxy_url)
            .map_err(|e| format!("Invalid upstream proxy URL '{}': {}", proxy_url, e))?;
        if !proxy.username.is_empty() {
            upstream_proxy = upstream_proxy.basic_auth(&proxy.username, &proxy.password);
        }
        builder = builder.proxy(upstream_proxy);
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_limits_rebuild_semaphores_unlimited() {
        let mut limits = RuntimeLimits::new();
        limits.max_concurrency = 0;
        limits.rebuild_semaphore();
        assert!(limits.concurrency_semaphore.is_some());
    }

    #[test]
    fn runtime_limits_rebuild_semaphores_fixed() {
        let mut limits = RuntimeLimits::new();
        limits.max_concurrency = 5;
        limits.rebuild_semaphore();
        let sem = limits.concurrency_semaphore.as_ref().unwrap();
        // Acquire and HOLD 5 permits (keep them alive so the
        // semaphore is actually drained).
        let permits: Vec<_> = (0..5).map(|_| sem.try_acquire().unwrap()).collect();
        assert_eq!(permits.len(), 5);
        // 6th must fail — no permits left.
        assert!(sem.try_acquire().is_err());
        drop(permits);
        // After release, acquiring is possible again.
        assert!(sem.try_acquire().is_ok());
    }

    #[test]
    fn build_http_client_succeeds() {
        assert!(build_http_client(&UpstreamProxySettings::default()).is_ok());
    }

    #[test]
    fn build_http_client_rejects_enabled_proxy_without_host() {
        let proxy = UpstreamProxySettings {
            enabled: true,
            protocol: "http".into(),
            port: 7890,
            ..Default::default()
        };
        assert!(build_http_client(&proxy).is_err());
    }
}
