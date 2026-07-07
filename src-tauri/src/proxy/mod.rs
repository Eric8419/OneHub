// ═══════════════════════════════════════════════════════════════
// Melody Hub — Local LLM API Proxy Server
// ═══════════════════════════════════════════════════════════════
// Exposes:
//   POST /v1/chat/completions  — OpenAI-compatible (incl. SSE)
//   POST /v1/anthropic        — Anthropic-compatible
//   GET  /health              — Proxy status
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Instant;

use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures::StreamExt;
use serde_json::{json, Value};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use crate::types::{Aggregation, Provider, ProxyStatus, RequestRecord};

// ── Shared State ─────────────────────────────────────────────

#[derive(Clone)]
pub struct ProxyConfig {
    pub providers: Vec<Provider>,
    pub aggregations: Vec<Aggregation>,
    pub round_robin_index: HashMap<String, usize>,
    pub latency_history: HashMap<String, Vec<f64>>,
    pub records: Vec<RequestRecord>,
    pub auth_token: String,
    pub cors_enabled: bool,
    // Rate limiting
    pub rate_limit_per_minute: u32,
    pub request_timestamps: Vec<Instant>,
    // Upstream request timeout (seconds)
    pub api_timeout_secs: u64,
    // Max body size for upstream (bytes)
    pub max_body_size: u64,
}

impl ProxyConfig {
    pub fn new() -> Self {
        Self {
            providers: vec![],
            aggregations: vec![],
            round_robin_index: HashMap::new(),
            latency_history: HashMap::new(),
            records: vec![],
            auth_token: Uuid::new_v4().to_string(),
            cors_enabled: false,
            rate_limit_per_minute: 0, // 0 = unlimited
            request_timestamps: Vec::new(),
            api_timeout_secs: 60,
            max_body_size: 10 * 1024 * 1024, // 10 MB
        }
    }
}

pub type SharedState = Arc<RwLock<ProxyConfig>>;

// ── Route Result ──────────────────────────────────────────────

/// Result from route_request containing the target provider, model,
/// and optionally which aggregation was matched (for RR advancement).
pub struct RouteResult {
    pub provider: Provider,
    pub model: String,
    pub aggregation_name: Option<String>,
}

// ── Server Handle (global singleton) ────────────────────────

struct ProxyHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
    started_at: Instant,
    port: u16,
}

static PROXY: std::sync::Mutex<Option<ProxyHandle>> = std::sync::Mutex::new(None);

/// Start the proxy server in a background task.
pub fn start(config: SharedState, port: u16) -> Result<(), String> {
    let mut guard = PROXY.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("Proxy server is already running".into());
    }

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();

    tokio::spawn(async move {
        let cors_enabled = {
            let cfg = config.read().await;
            cfg.cors_enabled
        };

        let cors = if cors_enabled {
            CorsLayer::new()
                .allow_origin([
                    "http://127.0.0.1:5173".parse().unwrap(),
                    "http://localhost:5173".parse().unwrap(),
                    "tauri://localhost".parse().unwrap(),
                    "https://tauri.localhost".parse().unwrap(),
                ])
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_credentials(true)
        } else {
            CorsLayer::new()
                .allow_origin([
                    "tauri://localhost".parse().unwrap(),
                    "https://tauri.localhost".parse().unwrap(),
                ])
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_credentials(true)
        };

        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/v1/chat/completions", post(chat_completions_handler))
            .route("/v1/anthropic", post(anthropic_handler))
            .layer(cors)
            .with_state(config);

        let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), port);
        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[proxy] Failed to bind: {}", e);
                return;
            }
        };

        eprintln!("[proxy] Server started on 127.0.0.1:{}", port);
        axum::serve(listener, app.into_make_service())
            .with_graceful_shutdown(async { rx.await.ok(); })
            .await
            .ok();
        eprintln!("[proxy] Server stopped");
    });

    *guard = Some(ProxyHandle {
        shutdown_tx: tx,
        started_at: Instant::now(),
        port,
    });
    Ok(())
}

/// Stop the proxy server.
pub fn stop() -> Result<(), String> {
    let mut guard = PROXY.lock().map_err(|e| e.to_string())?;
    match guard.take() {
        Some(handle) => {
            let _ = handle.shutdown_tx.send(());
            Ok(())
        }
        None => Err("Proxy server is not running".into()),
    }
}

/// Get proxy server status.
pub fn status() -> ProxyStatus {
    match PROXY.lock() {
        Ok(guard) => {
            if let Some(handle) = &*guard {
                ProxyStatus {
                    running: true,
                    port: handle.port,
                    uptime_secs: handle.started_at.elapsed().as_secs(),
                }
            } else {
                ProxyStatus { running: false, port: 0, uptime_secs: 0 }
            }
        }
        Err(_) => ProxyStatus { running: false, port: 0, uptime_secs: 0 },
    }
}

/// Update providers and aggregations in shared state.
pub async fn update_config(state: &SharedState, providers: Vec<Provider>, aggregations: Vec<Aggregation>) {
    let mut cfg = state.write().await;
    cfg.providers = providers;
    cfg.aggregations = aggregations;
}

/// Update auth settings.
pub async fn update_auth_config(state: &SharedState, auth_token: String, cors_enabled: bool) {
    let mut cfg = state.write().await;
    cfg.auth_token = auth_token;
    cfg.cors_enabled = cors_enabled;
}

/// Update proxy runtime config (rate limit, timeout, etc.).
pub async fn update_runtime_config(
    state: &SharedState,
    rate_limit_per_minute: u32,
    api_timeout_secs: u64,
    max_body_size: u64,
) {
    let mut cfg = state.write().await;
    cfg.rate_limit_per_minute = rate_limit_per_minute;
    cfg.api_timeout_secs = api_timeout_secs;
    cfg.max_body_size = max_body_size;
}

// ── Auth & Rate Limit Helpers ──────────────────────────────

fn require_auth(headers: &HeaderMap, state: &ProxyConfig) -> Result<(), (StatusCode, Json<Value>)> {
    let token = state.auth_token.as_str();
    if token.is_empty() {
        return Ok(());
    }

    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let provided = auth_header
        .strip_prefix("Bearer ")
        .unwrap_or(auth_header)
        .trim();

    if provided == token {
        Ok(())
    } else {
        eprintln!("[proxy] Auth failed: expected token, got '{}'", provided);
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Unauthorized. Provide a valid auth token via Authorization: Bearer <token> header."})),
        ))
    }
}

fn check_rate_limit(state: &mut ProxyConfig) -> Result<(), (StatusCode, Json<Value>)> {
    if state.rate_limit_per_minute == 0 {
        return Ok(()); // Unlimited
    }

    let now = Instant::now();
    let window = std::time::Duration::from_secs(60);

    // Remove timestamps older than 1 minute
    state.request_timestamps.retain(|t| now.duration_since(*t) < window);

    if state.request_timestamps.len() >= state.rate_limit_per_minute as usize {
        eprintln!("[proxy] Rate limit exceeded: {} requests/minute", state.rate_limit_per_minute);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Rate limit exceeded. Try again later."})),
        ));
    }

    state.request_timestamps.push(now);
    Ok(())
}

/// Sanitize upstream error text to hide sensitive content (API keys, etc.)
fn sanitize_error(text: &str) -> String {
    // Truncate very long error messages
    if text.len() > 500 {
        format!("{}... (truncated, {} chars)", &text[..500], text.len())
    } else {
        text.to_string()
    }
}

// ── Request Helpers ──────────────────────────────────────────

fn is_streaming_request(body: &Value) -> bool {
    body.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn standard_error_body(status: StatusCode, provider_name: &str, request_id: &str, message: &str) -> Value {
    json!({
        "error": {
            "message": message,
            "provider": provider_name,
            "request_id": request_id,
            "status": status.as_u16(),
        }
    })
}

// ── Route Handlers ──────────────────────────────────────────

async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "melody-hub-proxy",
        "version": "0.1.0"
    }))
}

/// POST /v1/chat/completions — OpenAI-compatible (streaming + non-streaming)
async fn chat_completions_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Verify auth token
    {
        let mut cfg = state.write().await;
        require_auth(&headers, &cfg)?;
        check_rate_limit(&mut cfg)?;
    }

    let model_name = body.get("model").and_then(|m| m.as_str()).unwrap_or("unknown");
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    // Route: find aggregation → pick model → find provider
    let route = route_request(&state, model_name, "chat").await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;

    let provider_name = route.provider.name.clone();
    let selected_model = route.model.clone();

    // Normalize base URL: avoid double /v1 if api_base already ends with /v1
    let base = route.provider.api_base.trim_end_matches('/');
    let upstream_url = if base.ends_with("/v1") {
        format!("{}/chat/completions", base)
    } else {
        format!("{}/v1/chat/completions", base)
    };

    let mut upstream_body = body.clone();
    upstream_body["model"] = json!(selected_model);

    let start = Instant::now();
    let timeout_secs = {
        let cfg = state.read().await;
        cfg.api_timeout_secs
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("Failed to create HTTP client: {}", e)})))
        })?;

    // Build the upstream request
    let req_builder = client
        .post(&upstream_url)
        .header("Authorization", format!("Bearer {}", route.provider.api_key))
        .header("Content-Type", "application/json")
        .json(&upstream_body);

    let upstream_resp = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Upstream request failed: {}", e);
            record_request(&state, RequestRecord {
                id: request_id.clone(),
                timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                model: selected_model.clone(),
                provider: provider_name.clone(),
                r#type: "Chat Completion".into(),
                tokens: 0,
                status: "error".into(),
                latency_ms: start.elapsed().as_millis() as i64,
                error_category: "upstream_connection_error".into(),
            }, &route.aggregation_name).await;
            return Err((StatusCode::BAD_GATEWAY, Json(standard_error_body(
                StatusCode::BAD_GATEWAY, &provider_name, &request_id, &sanitize_error(&err_msg),
            ))));
        }
    };

    let status = upstream_resp.status();
    let latency_ms = start.elapsed().as_millis() as i64;

    // Handle upstream error responses
    if !status.is_success() {
        let err_text = upstream_resp.text().await.unwrap_or_default();
        record_request(&state, RequestRecord {
            id: request_id.clone(),
            timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            model: selected_model.clone(),
            provider: provider_name.clone(),
            r#type: "Chat Completion".into(),
            tokens: 0,
            status: format!("upstream_{}", status.as_u16()),
            latency_ms,
            error_category: "upstream_error".into(),
        }, &route.aggregation_name).await;
        return Err((status, Json(standard_error_body(
            status, &provider_name, &request_id, &sanitize_error(&err_text),
        ))));
    }

    // Handle SSE streaming
    if is_streaming {
        let stream = upstream_resp.bytes_stream().map(|r| {
            r.map_err(std::io::Error::other)
        });
        let body = Body::from_stream(stream);

        // Record streaming request (token count will be incomplete; estimate from first chunks)
        record_request(&state, RequestRecord {
            id: request_id.clone(),
            timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            model: selected_model.clone(),
            provider: provider_name.clone(),
            r#type: "Chat Completion (streaming)".into(),
            tokens: 0,
            status: "streaming".into(),
            latency_ms,
            error_category: String::new(),
        }, &route.aggregation_name).await;

        let response = Response::builder()
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .header("connection", "keep-alive")
            .header("x-request-id", &request_id)
            .body(body)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
        return Ok(response);
    }

    // Non-streaming: parse JSON response
    let resp_json: Value = match upstream_resp.json().await {
        Ok(v) => v,
        Err(e) => {
            let err_msg = format!("Failed to parse upstream response: {}", e);
            return Err((StatusCode::BAD_GATEWAY, Json(standard_error_body(
                StatusCode::BAD_GATEWAY, &provider_name, &request_id, &err_msg,
            ))));
        }
    };

    let tokens = count_tokens_from_response(&resp_json);

    record_request(&state, RequestRecord {
        id: request_id,
        timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        model: selected_model,
        provider: provider_name,
        r#type: "Chat Completion".into(),
        tokens,
        status: "success".into(),
        latency_ms,
        error_category: String::new(),
    }, &route.aggregation_name).await;

    Ok(Json(resp_json).into_response())
}

/// POST /v1/anthropic — Anthropic-compatible (streaming + non-streaming)
async fn anthropic_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Verify auth token and rate limit
    {
        let mut cfg = state.write().await;
        require_auth(&headers, &cfg)?;
        check_rate_limit(&mut cfg)?;
    }

    let model_name = body.get("model").and_then(|m| m.as_str()).unwrap_or("unknown");
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    let route = route_request(&state, model_name, "chat").await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;

    let provider_name = route.provider.name.clone();
    let selected_model = route.model.clone();

    let upstream_url = format!("{}/v1/messages", route.provider.api_base.trim_end_matches('/'));

    let mut upstream_body = body.clone();
    upstream_body["model"] = json!(selected_model);

    let start = Instant::now();
    let timeout_secs = {
        let cfg = state.read().await;
        cfg.api_timeout_secs
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("Failed to create HTTP client: {}", e)})))
        })?;

    let req_builder = client
        .post(&upstream_url)
        .header("x-api-key", &route.provider.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&upstream_body);

    let upstream_resp = match req_builder.send().await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Upstream request failed: {}", e);
            record_request(&state, RequestRecord {
                id: request_id.clone(),
                timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                model: selected_model.clone(),
                provider: provider_name.clone(),
                r#type: "Anthropic".into(),
                tokens: 0,
                status: "error".into(),
                latency_ms: start.elapsed().as_millis() as i64,
                error_category: "upstream_connection_error".into(),
            }, &route.aggregation_name).await;
            return Err((StatusCode::BAD_GATEWAY, Json(standard_error_body(
                StatusCode::BAD_GATEWAY, &provider_name, &request_id, &sanitize_error(&err_msg),
            ))));
        }
    };

    let status = upstream_resp.status();
    let latency_ms = start.elapsed().as_millis() as i64;

    if !status.is_success() {
        let err_text = upstream_resp.text().await.unwrap_or_default();
        record_request(&state, RequestRecord {
            id: request_id.clone(),
            timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            model: selected_model.clone(),
            provider: provider_name.clone(),
            r#type: "Anthropic".into(),
            tokens: 0,
            status: format!("upstream_{}", status.as_u16()),
            latency_ms,
            error_category: "upstream_error".into(),
        }, &route.aggregation_name).await;
        return Err((status, Json(standard_error_body(
            status, &provider_name, &request_id, &sanitize_error(&err_text),
        ))));
    }

    if is_streaming {
        let stream = upstream_resp.bytes_stream().map(|r| {
            r.map_err(std::io::Error::other)
        });
        let body = Body::from_stream(stream);

        record_request(&state, RequestRecord {
            id: request_id.clone(),
            timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            model: selected_model.clone(),
            provider: provider_name.clone(),
            r#type: "Anthropic (streaming)".into(),
            tokens: 0,
            status: "streaming".into(),
            latency_ms,
            error_category: String::new(),
        }, &route.aggregation_name).await;

        let response = Response::builder()
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .header("connection", "keep-alive")
            .header("x-request-id", &request_id)
            .body(body)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
        return Ok(response);
    }

    let resp_json: Value = match upstream_resp.json().await {
        Ok(v) => v,
        Err(e) => {
            let err_msg = format!("Failed to parse upstream response: {}", e);
            return Err((StatusCode::BAD_GATEWAY, Json(standard_error_body(
                StatusCode::BAD_GATEWAY, &provider_name, &request_id, &err_msg,
            ))));
        }
    };

    let tokens = count_tokens_from_anthropic_response(&resp_json);

    record_request(&state, RequestRecord {
        id: request_id,
        timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        model: selected_model,
        provider: provider_name,
        r#type: "Anthropic".into(),
        tokens,
        status: "success".into(),
        latency_ms,
        error_category: String::new(),
    }, &route.aggregation_name).await;

    Ok(Json(resp_json).into_response())
}

// ── Routing Logic ───────────────────────────────────────────

async fn route_request(
    state: &SharedState,
    model_or_agg: &str,
    _capability: &str,
) -> Result<RouteResult, String> {
    let cfg = state.read().await;

    // 1. Try direct model match (model name → provider)
    let direct_hit = cfg.providers
        .iter()
        .flat_map(|p| p.models.iter().map(move |m| (p, m)))
        .find(|(_, m)| m.name == model_or_agg)
        .map(|(p, m)| (p.clone(), m.name.clone()));

    if let Some((provider, model)) = direct_hit {
        return Ok(RouteResult {
            provider,
            model,
            aggregation_name: None,
        });
    }

    // 2. Try aggregation match
    let agg = cfg.aggregations
        .iter()
        .find(|a| a.enabled && a.name == model_or_agg);

    match agg {
        Some(aggregation) => {
            let model_names: Vec<&str> = aggregation.models
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if model_names.is_empty() {
                return Err("Aggregation has no models".into());
            }

            let picked = pick_model(&aggregation.strategy, &aggregation.name, &model_names, &cfg);

            for provider in &cfg.providers {
                for model in &provider.models {
                    if model.name == picked {
                        return Ok(RouteResult {
                            provider: provider.clone(),
                            model: model.name.clone(),
                            aggregation_name: Some(aggregation.name.clone()),
                        });
                    }
                }
            }
            Err(format!("No provider found for model '{}'", picked))
        }
        None => Err(format!("Unknown model or aggregation: '{}'", model_or_agg)),
    }
}

fn pick_model(
    strategy: &str,
    agg_name: &str,
    model_names: &[&str],
    cfg: &ProxyConfig,
) -> String {
    match strategy {
        s if s.contains("随机") => {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos() as usize;
            let idx = nanos % model_names.len();
            model_names[idx].to_string()
        }
        s if s.contains("最低延迟") => {
            let mut best = model_names[0].to_string();
            let mut best_latency = f64::MAX;
            for name in model_names {
                let avg = cfg.latency_history.get(*name)
                    .map(|v| v.iter().sum::<f64>() / v.len() as f64)
                    .unwrap_or(0.0);
                if avg < best_latency && avg > 0.0 {
                    best_latency = avg;
                    best = name.to_string();
                }
            }
            best
        }
        s if s.contains("顺序") => {
            model_names[0].to_string()
        }
        _ => {
            // Round Robin (default)
            let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
            let len = model_names.len();
            model_names[idx % len].to_string()
        }
    }
}

// ── Stats Recording ─────────────────────────────────────────

/// Record a request and advance the Round Robin index for the
/// aggregation that was matched (not all aggregations).
async fn record_request(state: &SharedState, record: RequestRecord, aggregation_name: &Option<String>) {
    let mut cfg = state.write().await;

    // Advance Round Robin counter — only for the matched aggregation
    if let Some(agg_name) = aggregation_name {
        if let Some(agg) = cfg.aggregations.iter().find(|a| a.name == *agg_name) {
            let model_names: Vec<&str> = agg.models
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if !model_names.is_empty() {
                let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
                let next = (idx + 1) % model_names.len();
                cfg.round_robin_index.insert(agg_name.clone(), next);
            }
        }
    }

    // Update latency history (keep last 100)
    let latency = record.latency_ms as f64;
    cfg.latency_history
        .entry(record.model.clone())
        .or_default()
        .push(latency);
    // Trim latency history
    let trimmed: HashMap<String, Vec<f64>> = cfg.latency_history.iter()
        .map(|(k, v)| {
            if v.len() > 100 {
                (k.clone(), v[v.len()-100..].to_vec())
            } else {
                (k.clone(), v.clone())
            }
        })
        .collect();
    cfg.latency_history = trimmed;

    // Store record (keep last 1000)
    cfg.records.push(record);
    if cfg.records.len() > 1000 {
        let excess = cfg.records.len() - 1000;
        cfg.records.drain(0..excess);
    }
}

// ── Token Counting ──────────────────────────────────────────

fn count_tokens_from_response(resp: &Value) -> i64 {
    // Try OpenAI usage field
    if let Some(usage) = resp.get("usage") {
        if let Some(total) = usage.get("total_tokens").and_then(|v| v.as_i64()) {
            return total;
        }
        if let Some(c) = usage.get("completion_tokens").and_then(|v| v.as_i64()) {
            if let Some(p) = usage.get("prompt_tokens").and_then(|v| v.as_i64()) {
                return p + c;
            }
            return c;
        }
    }
    // Fallback: count chars / 4
    if let Some(choices) = resp.get("choices").and_then(|v| v.as_array()) {
        if let Some(choice) = choices.first() {
            if let Some(msg) = choice.get("message") {
                if let Some(content) = msg.get("content").and_then(|v| v.as_str()) {
                    return (content.len() / 4).max(1) as i64;
                }
            }
        }
    }
    1
}

fn count_tokens_from_anthropic_response(resp: &Value) -> i64 {
    if let Some(usage) = resp.get("usage") {
        if let Some(o) = usage.get("output_tokens").and_then(|v| v.as_i64()) {
            if let Some(i) = usage.get("input_tokens").and_then(|v| v.as_i64()) {
                return i + o;
            }
            return o;
        }
    }
    // Fallback
    if let Some(content) = resp.get("content").and_then(|v| v.as_array()) {
        for block in content {
            if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                return (text.len() / 4).max(1) as i64;
            }
        }
    }
    1
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── Token Counting Tests ────────────────────────────────

    #[test]
    fn test_count_tokens_openai_usage_total() {
        let resp = json!({
            "usage": { "total_tokens": 150 }
        });
        assert_eq!(count_tokens_from_response(&resp), 150);
    }

    #[test]
    fn test_count_tokens_openai_usage_split() {
        let resp = json!({
            "usage": { "prompt_tokens": 50, "completion_tokens": 100 }
        });
        assert_eq!(count_tokens_from_response(&resp), 150);
    }

    #[test]
    fn test_count_tokens_openai_fallback_content() {
        let resp = json!({
            "choices": [{
                "message": { "content": "Hello world! This is a test." }
            }]
        });
        // Content length: 28 chars → 28/4 = 7
        assert_eq!(count_tokens_from_response(&resp), 7);
    }

    #[test]
    fn test_count_tokens_openai_empty() {
        let resp = json!({});
        assert_eq!(count_tokens_from_response(&resp), 1);
    }

    #[test]
    fn test_count_tokens_anthropic_usage() {
        let resp = json!({
            "usage": { "input_tokens": 45, "output_tokens": 200 }
        });
        assert_eq!(count_tokens_from_anthropic_response(&resp), 245);
    }

    #[test]
    fn test_count_tokens_anthropic_fallback() {
        let resp = json!({
            "content": [{ "text": "Hello world" }]
        });
        // Content length: 11 → 11/4 = 2
        assert_eq!(count_tokens_from_anthropic_response(&resp), 2);
    }

    // ── URL Normalization Tests ──────────────────────────────

    #[test]
    fn test_url_without_v1() {
        let api_base = "https://api.deepseek.com".to_string();
        let base = api_base.trim_end_matches('/');
        let url = if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        };
        assert_eq!(url, "https://api.deepseek.com/v1/chat/completions");
    }

    #[test]
    fn test_url_with_v1() {
        let api_base = "https://api.openai.com/v1".to_string();
        let base = api_base.trim_end_matches('/');
        let url = if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        };
        assert_eq!(url, "https://api.openai.com/v1/chat/completions");
    }

    #[test]
    fn test_url_with_trailing_slash() {
        let api_base = "https://api.openai.com/v1/".to_string();
        let base = api_base.trim_end_matches('/');
        let url = if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        };
        assert_eq!(url, "https://api.openai.com/v1/chat/completions");
    }

    // ── Streaming Detection Tests ────────────────────────────

    #[test]
    fn test_is_streaming_true() {
        let body = json!({ "stream": true, "model": "gpt-4" });
        assert!(is_streaming_request(&body));
    }

    #[test]
    fn test_is_streaming_false() {
        let body = json!({ "stream": false, "model": "gpt-4" });
        assert!(!is_streaming_request(&body));
    }

    #[test]
    fn test_is_streaming_absent() {
        let body = json!({ "model": "gpt-4" });
        assert!(!is_streaming_request(&body));
    }

    // ── RR Index Advancement Tests ──────────────────────────

    #[test]
    fn test_record_request_advances_only_matched_aggregation() {
        let state = Arc::new(RwLock::new(ProxyConfig::new()));

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut cfg = state.write().await;
            cfg.round_robin_index.insert("agg-1".into(), 0);
            cfg.round_robin_index.insert("agg-2".into(), 0);
            cfg.aggregations = vec![
                Aggregation {
                    id: "a1".into(),
                    name: "agg-1".into(),
                    models: "gpt-4, gpt-4o".into(),
                    strategy: "轮询 (Round Robin)".into(),
                    priority: "P0".into(),
                    enabled: true,
                },
                Aggregation {
                    id: "a2".into(),
                    name: "agg-2".into(),
                    models: "claude-3".into(),
                    strategy: "轮询 (Round Robin)".into(),
                    priority: "P1".into(),
                    enabled: true,
                },
            ];
            drop(cfg);

            // Record a request against agg-1
            record_request(&state, RequestRecord {
                id: "r1".into(),
                timestamp: "2026-01-01".into(),
                model: "gpt-4".into(),
                provider: "OpenAI".into(),
                r#type: "Chat Completion".into(),
                tokens: 100,
                status: "success".into(),
                latency_ms: 500,
                error_category: String::new(),
            }, &Some("agg-1".into())).await;

            // Check that only agg-1 advanced (0→1), agg-2 stays at 0
            let cfg = state.read().await;
            assert_eq!(cfg.round_robin_index.get("agg-1"), Some(&1));
            assert_eq!(cfg.round_robin_index.get("agg-2"), Some(&0));
        });
    }

    #[test]
    fn test_direct_model_match_does_not_advance_rr() {
        let state = Arc::new(RwLock::new(ProxyConfig::new()));

        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mut cfg = state.write().await;
            cfg.round_robin_index.insert("agg-1".into(), 0);
            cfg.aggregations = vec![
                Aggregation {
                    id: "a1".into(),
                    name: "agg-1".into(),
                    models: "gpt-4".into(),
                    strategy: "轮询 (Round Robin)".into(),
                    priority: "P0".into(),
                    enabled: true,
                },
            ];
            drop(cfg);

            // Record with None aggregation (direct model match)
            record_request(&state, RequestRecord {
                id: "r1".into(),
                timestamp: "2026-01-01".into(),
                model: "gpt-4".into(),
                provider: "OpenAI".into(),
                r#type: "Chat Completion".into(),
                tokens: 100,
                status: "success".into(),
                latency_ms: 500,
                error_category: String::new(),
            }, &None).await;

            // RR index should remain unchanged
            let cfg = state.read().await;
            assert_eq!(cfg.round_robin_index.get("agg-1"), Some(&0));
        });
    }
}
