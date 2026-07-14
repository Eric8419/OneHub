// ═══════════════════════════════════════════════════════════════
// Melody Hub — HTTP server
// ═══════════════════════════════════════════════════════════════
// Axum router + request handlers. Auth, rate-limiting and
// concurrency are enforced here; the actual upstream call is
// delegated to the adapter + a shared reqwest client.
// ═══════════════════════════════════════════════════════════════

use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

use axum::{
    body::Body,
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures::StreamExt;
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use uuid::Uuid;

use tauri::Emitter;

use crate::proxy::adapter::ProviderAdapter;
use crate::proxy::metrics::SharedMetrics;
use crate::proxy::routing::{route_request, RouteResult, SharedRouting};
use crate::types::RequestRecord;

use super::state::{AuthConfig, RuntimeLimits, SharedAppState};

// ── Server handle (global singleton) ────────────────────────

struct ProxyHandle {
    shutdown_tx: tokio::sync::oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
    started_at: Instant,
    host: String,
    port: u16,
}

static PROXY: std::sync::Mutex<Option<ProxyHandle>> = std::sync::Mutex::new(None);

/// Start the proxy server in a background task.
pub async fn start(state: SharedAppState, host: String, port: u16) -> Result<(), String> {
    {
        let guard = PROXY.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Proxy server is already running".into());
        }
    }

    let host = normalize_bind_host(&host)?;
    let addr: SocketAddr = format!("{}:{}", host, port)
        .parse()
        .map_err(|e| format!("Invalid proxy bind address '{}:{}': {}", host, port, e))?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("Failed to bind proxy on {}:{}: {}", host, port, e))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();

    let task_host = host.clone();
    let task = tokio::spawn(async move {
        let cors_enabled = state.auth.read().await.cors_enabled;

        let cors = build_cors_layer(cors_enabled);

        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/v1/models", get(models_handler))
            .route("/v1/chat/completions", post(chat_completions_handler))
            .route("/v1/anthropic", post(anthropic_handler))
            .layer(cors)
            .with_state(state);

        eprintln!("[proxy] Server started on {}:{}", task_host, port);
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            rx.await.ok();
        })
        .await
        .ok();
        eprintln!("[proxy] Server stopped");
    });

    let mut guard = PROXY.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        let _ = tx.send(());
        return Err("Proxy server is already running".into());
    }
    *guard = Some(ProxyHandle {
        shutdown_tx: tx,
        task,
        started_at: Instant::now(),
        host,
        port,
    });
    Ok(())
}

/// Stop the proxy server.
pub async fn stop() -> Result<(), String> {
    let handle = {
        let mut guard = PROXY.lock().map_err(|e| e.to_string())?;
        guard.take()
    };

    match handle {
        Some(handle) => {
            let _ = handle.shutdown_tx.send(());
            match tokio::time::timeout(std::time::Duration::from_secs(2), handle.task).await {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(format!("Proxy task failed while stopping: {}", e)),
                Err(_) => Err("Timed out while stopping proxy server".into()),
            }
        }
        None => Err("Proxy server is not running".into()),
    }
}

/// Get proxy server status.
pub fn status() -> crate::types::ProxyStatus {
    use crate::types::ProxyStatus;
    match PROXY.lock() {
        Ok(guard) => {
            if let Some(handle) = &*guard {
                ProxyStatus {
                    running: true,
                    host: handle.host.clone(),
                    port: handle.port,
                    uptime_secs: handle.started_at.elapsed().as_secs(),
                }
            } else {
                ProxyStatus {
                    running: false,
                    host: String::new(),
                    port: 0,
                    uptime_secs: 0,
                }
            }
        }
        Err(_) => ProxyStatus {
            running: false,
            host: String::new(),
            port: 0,
            uptime_secs: 0,
        },
    }
}

fn normalize_bind_host(host: &str) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err("Proxy host cannot be empty".into());
    }
    if trimmed.eq_ignore_ascii_case("localhost") {
        return Ok("127.0.0.1".into());
    }
    trimmed
        .parse::<IpAddr>()
        .map_err(|e| format!("Invalid proxy host '{}': {}", trimmed, e))?;
    Ok(trimmed.to_string())
}

fn build_cors_layer(cors_enabled: bool) -> CorsLayer {
    use axum::http::{header, Method};

    // CORS spec forbids wildcard (`*`) for allow-headers and
    // allow-methods when credentials are enabled, so list them
    // explicitly to avoid a runtime panic in tower-http.
    let headers = vec![
        header::CONTENT_TYPE,
        header::AUTHORIZATION,
        header::ACCEPT,
        header::ORIGIN,
    ];
    let methods = vec![Method::GET, Method::POST, Method::OPTIONS];

    let origins: Vec<_> = if cors_enabled {
        vec![
            "http://127.0.0.1:5420".parse().unwrap(),
            "http://localhost:5420".parse().unwrap(),
            "tauri://localhost".parse().unwrap(),
            "https://tauri.localhost".parse().unwrap(),
        ]
    } else {
        vec![
            "tauri://localhost".parse().unwrap(),
            "https://tauri.localhost".parse().unwrap(),
        ]
    };

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(methods)
        .allow_headers(headers)
        .allow_credentials(true)
}

// ── Auth & Rate Limit ───────────────────────────────────────

fn require_auth(headers: &HeaderMap, auth: &AuthConfig) -> Result<(), (StatusCode, Json<Value>)> {
    let token = auth.auth_token.as_str();
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
        eprintln!("[proxy] Auth failed: invalid bearer token");
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Unauthorized. Provide a valid auth token via Authorization: Bearer <token> header."
            })),
        ))
    }
}

fn require_ip(ip: IpAddr, auth: &AuthConfig) -> Result<(), (StatusCode, Json<Value>)> {
    let whitelist = auth.ip_whitelist.trim();
    if whitelist.is_empty() {
        return Ok(());
    }

    let allowed = whitelist.split(',').map(str::trim).any(|entry| {
        if entry.is_empty() {
            return false;
        }
        if entry == "*" {
            return true;
        }
        if let Some(prefix) = entry.strip_suffix(".*") {
            return ip.to_string().starts_with(&format!("{}.", prefix));
        }
        entry == ip.to_string()
    });

    if allowed {
        Ok(())
    } else {
        Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Forbidden. Client IP is not in the whitelist."})),
        ))
    }
}

/// Enforce a per-minute request cap. Mutates `limits` to record
/// the timestamp. A `rate_limit_per_minute` of 0 means unlimited.
fn check_rate_limit(limits: &mut RuntimeLimits) -> Result<(), (StatusCode, Json<Value>)> {
    if limits.rate_limit_per_minute == 0 {
        return Ok(());
    }

    let now = Instant::now();
    let window = std::time::Duration::from_secs(60);
    limits
        .request_timestamps
        .retain(|t| now.duration_since(*t) < window);

    if limits.request_timestamps.len() >= limits.rate_limit_per_minute as usize {
        eprintln!(
            "[proxy] Rate limit exceeded: {} requests/minute",
            limits.rate_limit_per_minute
        );
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "Rate limit exceeded. Try again later."})),
        ));
    }

    limits.request_timestamps.push(now);
    Ok(())
}

fn check_body_size(body: &Value, max_body_size: u64) -> Result<(), (StatusCode, Json<Value>)> {
    if max_body_size == 0 {
        return Ok(());
    }
    let size = serde_json::to_vec(body)
        .map(|v| v.len() as u64)
        .unwrap_or(0);
    if size > max_body_size {
        Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "Request body is too large"})),
        ))
    } else {
        Ok(())
    }
}

// ── Helpers ─────────────────────────────────────────────────

fn is_streaming_request(body: &Value) -> bool {
    body.get("stream")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn sanitize_error(text: &str) -> String {
    let char_count = text.chars().count();
    if char_count > 500 {
        let truncated: String = text.chars().take(500).collect();
        format!("{}... (truncated, {} chars)", truncated, char_count)
    } else {
        text.to_string()
    }
}

fn standard_error_body(
    status: StatusCode,
    provider_name: &str,
    request_id: &str,
    message: &str,
) -> Value {
    json!({
        "error": {
            "message": message,
            "provider": provider_name,
            "request_id": request_id,
            "status": status.as_u16(),
        }
    })
}

// ── Generic upstream proxy ──────────────────────────────────

/// Handle an upstream proxy request using the given adapter.
async fn proxy_request(
    state: &SharedAppState,
    route: RouteResult,
    body: Value,
    is_streaming: bool,
    request_id: &str,
    adapter: &dyn ProviderAdapter,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Concurrency permit (wait if at max concurrency).
    let _concurrency_guard = {
        let limits = state.runtime.read().await;
        limits.concurrency_semaphore.clone()
    };
    let _concurrency_guard = match _concurrency_guard {
        Some(sem) => match sem.acquire_owned().await {
            Ok(guard) => Some(guard),
            Err(_) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({"error": "Server is busy, try again later"})),
                ))
            }
        },
        None => None,
    };

    // Clone the AppHandle (if set) so we can emit a
    // `request-completed` event from `finalize_record`.
    let app_handle = state.app_handle.read().await.clone();

    let provider_name = route.provider.name.clone();
    let selected_model = route.model.clone();

    // Reject requests with an empty API key early. This happens when
    // the OS keyring encryption key was regenerated (system reinstall,
    // keychain cleanup, new computer) and the stored ciphertext can't
    // be decrypted — `storage::load_providers` sets the key to empty
    // in that case. Returning a clear local error is far more useful
    // than sending an empty credential upstream and getting an opaque 401.
    if route.provider.api_key.trim().is_empty() {
        let err_msg = format!(
            "Provider '{}' has no API key. The encrypted key could not be decrypted \
             (common after system reinstall or keychain reset). \
             Please re-enter the API key in Settings.",
            provider_name
        );
        finalize_record(
            &state.metrics,
            &state.routing,
            app_handle.as_ref(),
            RequestRecord {
                id: request_id.to_string(),
                timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                model: selected_model.clone(),
                provider: provider_name.clone(),
                r#type: adapter.request_type().to_string(),
                tokens: 0,
                status: "error".into(),
                latency_ms: 0,
                error_category: "missing_api_key".into(),
            },
            &route.aggregation_name,
        )
        .await;
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(standard_error_body(
                StatusCode::UNAUTHORIZED,
                &provider_name,
                request_id,
                &err_msg,
            )),
        ));
    }

    let upstream_url = adapter.build_url(&route.provider.api_base, &selected_model);

    let mut upstream_body = body.clone();
    upstream_body["model"] = json!(selected_model);

    let start = Instant::now();
    let timeout_secs = state.runtime.read().await.api_timeout_secs;
    let max_retries = state.runtime.read().await.max_retries;
    // Reuse the shared pooled client; per-request timeout applied on the builder.
    let client = {
        let req_builder = state.http_client.read().await.clone();
        match req_builder {
            Some(c) => c,
            None => {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "HTTP client not initialized"})),
                ))
            }
        }
    };

    let mut req_builder = client
        .post(&upstream_url)
        .header("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(timeout_secs));

    let (auth_name, auth_value) = adapter.auth_header(&route.provider.api_key);
    req_builder = req_builder.header(&auth_name, &auth_value);
    for (name, value) in adapter.extra_headers() {
        req_builder = req_builder.header(&name, &value);
    }
    req_builder = req_builder.json(&upstream_body);

    let request_type = adapter.request_type().to_string();
    let request_type_streaming = format!("{} (streaming)", request_type);

    let upstream_resp = match send_with_retries(req_builder, max_retries).await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Upstream request failed: {}", e);
            finalize_record(
                &state.metrics,
                &state.routing,
                app_handle.as_ref(),
                RequestRecord {
                    id: request_id.to_string(),
                    timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    model: selected_model.clone(),
                    provider: provider_name.clone(),
                    r#type: request_type.clone(),
                    tokens: 0,
                    status: "error".into(),
                    latency_ms: start.elapsed().as_millis() as i64,
                    error_category: "upstream_connection_error".into(),
                },
                &route.aggregation_name,
            )
            .await;
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(standard_error_body(
                    StatusCode::BAD_GATEWAY,
                    &provider_name,
                    request_id,
                    &sanitize_error(&err_msg),
                )),
            ));
        }
    };

    let status = upstream_resp.status();
    let latency_ms = start.elapsed().as_millis() as i64;

    if !status.is_success() {
        let err_text = upstream_resp.text().await.unwrap_or_default();
        finalize_record(
            &state.metrics,
            &state.routing,
            app_handle.as_ref(),
            RequestRecord {
                id: request_id.to_string(),
                timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                model: selected_model.clone(),
                provider: provider_name.clone(),
                r#type: request_type.clone(),
                tokens: 0,
                status: format!("upstream_{}", status.as_u16()),
                latency_ms,
                error_category: "upstream_error".into(),
            },
            &route.aggregation_name,
        )
        .await;
        return Err((
            status,
            Json(standard_error_body(
                status,
                &provider_name,
                request_id,
                &sanitize_error(&err_text),
            )),
        ));
    }

    if is_streaming {
        // Spawn a background task that:
        //   1. Reads SSE chunks from the upstream and forwards them
        //      to the client via an mpsc channel.
        //   2. Accumulates all chunks into a buffer.
        //   3. When the stream ends (or the client disconnects),
        //      parses the buffer for `usage` and calls
        //      `finalize_record` with the real token count.
        let (tx, rx) = tokio::sync::mpsc::channel(32);

        let metrics = state.metrics.clone();
        let routing = state.routing.clone();
        let app_handle_clone = app_handle.clone();
        let model_clone = selected_model.clone();
        let provider_clone = provider_name.clone();
        let req_type_clone = request_type_streaming.clone();
        let aggregation_name_clone = route.aggregation_name.clone();
        let request_id_owned = request_id.to_string();
        // We can't move the borrowed `adapter` across spawn, so we
        // re-resolve it inside the task from the provider's flavor.
        let flavor_clone = route.provider.api_flavor.clone();
        let start_clone = start;

        tokio::spawn(async move {
            let mut buffer: Vec<u8> = Vec::new();
            let mut stream = upstream_resp.bytes_stream();
            let mut had_error = false;

            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => {
                        buffer.extend_from_slice(&bytes);
                        if tx.send(Ok(bytes)).await.is_err() {
                            // Client disconnected — stop reading.
                            break;
                        }
                    }
                    Err(e) => {
                        let io_err = std::io::Error::other(e);
                        let _ = tx.send(Err(io_err)).await;
                        had_error = true;
                        break;
                    }
                }
            }
            drop(tx);

            let tokens = if had_error {
                0
            } else {
                let adapter = crate::proxy::adapter::resolve(&flavor_clone);
                adapter.count_stream_tokens(&buffer)
            };

            finalize_record(
                &metrics,
                &routing,
                app_handle_clone.as_ref(),
                RequestRecord {
                    id: request_id_owned,
                    timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                    model: model_clone,
                    provider: provider_clone,
                    r#type: req_type_clone,
                    tokens,
                    status: if had_error {
                        "stream_error".into()
                    } else {
                        "success".into()
                    },
                    latency_ms: start_clone.elapsed().as_millis() as i64,
                    error_category: if had_error {
                        "stream_io_error".into()
                    } else {
                        String::new()
                    },
                },
                &aggregation_name_clone,
            )
            .await;
        });

        // Bridge the mpsc Receiver into a Stream for the response
        // body. We use `futures::stream::unfold` instead of pulling
        // in the `tokio-stream` crate just for `ReceiverStream`.
        let receiver_stream =
            futures::stream::unfold(rx, |mut rx| async move {
                rx.recv().await.map(|item| (item, rx))
            });
        let body = Body::from_stream(receiver_stream);

        let response = Response::builder()
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .header("connection", "keep-alive")
            .header("x-request-id", request_id)
            .body(body)
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
            })?;
        return Ok(response);
    }

    let resp_json: Value = match upstream_resp.json().await {
        Ok(v) => v,
        Err(e) => {
            let err_msg = format!("Failed to parse upstream response: {}", e);
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(standard_error_body(
                    StatusCode::BAD_GATEWAY,
                    &provider_name,
                    request_id,
                    &err_msg,
                )),
            ));
        }
    };

    let tokens = adapter.count_tokens(&resp_json);

    finalize_record(
        &state.metrics,
        &state.routing,
        app_handle.as_ref(),
        RequestRecord {
            id: request_id.to_string(),
            timestamp: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            model: selected_model,
            provider: provider_name,
            r#type: request_type,
            tokens,
            status: "success".into(),
            latency_ms,
            error_category: String::new(),
        },
        &route.aggregation_name,
    )
    .await;

    Ok(Json(resp_json).into_response())
}

async fn send_with_retries(
    req_builder: reqwest::RequestBuilder,
    max_retries: u32,
) -> Result<reqwest::Response, reqwest::Error> {
    if max_retries == 0 {
        return req_builder.send().await;
    }

    let Some(_) = req_builder.try_clone() else {
        return req_builder.send().await;
    };

    let mut attempts = 0;
    loop {
        let builder = req_builder
            .try_clone()
            .expect("request builder was already verified cloneable");
        match builder.send().await {
            Ok(resp) => return Ok(resp),
            Err(err) if attempts < max_retries && (err.is_connect() || err.is_timeout()) => {
                attempts += 1;
                tokio::time::sleep(std::time::Duration::from_millis(150 * attempts as u64)).await;
            }
            Err(err) => return Err(err),
        }
    }
}

/// Record a request to metrics, update routing side effects
/// (round-robin advancement + latency history), and emit a
/// `request-completed` event to the frontend so the dashboard
/// can refresh without polling.
async fn finalize_record(
    metrics: &SharedMetrics,
    routing: &SharedRouting,
    app_handle: Option<&tauri::AppHandle>,
    record: RequestRecord,
    aggregation_name: &Option<String>,
) {
    let model = record.model.clone();
    let latency = record.latency_ms;
    // Update routing cursors/latency first, then persist the record.
    crate::proxy::routing::record_routing_side_effects(routing, aggregation_name, &model, latency)
        .await;
    // Notify the frontend before `record` is moved into metrics.
    if let Some(handle) = app_handle {
        let _ = handle.emit("request-completed", &record);
    }
    metrics.record(record).await;
}

// ── Route Handlers ──────────────────────────────────────────

async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "melody-hub-proxy",
        "version": "0.1.0"
    }))
}

/// `GET /v1/models` — list all callable models exposed by the proxy.
///
/// Aggregates:
///   1. Every model name (and alias) from configured providers.
///   2. Every enabled aggregation name.
///
/// Each entry follows the OpenAI `GET /v1/models` shape so standard
/// clients can populate their model picker by pointing at the proxy.
async fn models_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Same auth gates as chat_completions_handler.
    {
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&headers, &auth)?;
    }

    let cfg = state.routing.read().await;
    let mut seen: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    let mut data: Vec<Value> = Vec::new();

    // Provider models — emit both real names and aliases.
    for provider in &cfg.providers {
        for model in &provider.models {
            for name in model.alias.iter().chain(std::iter::once(&model.name)) {
                if !name.is_empty() && seen.insert(name.clone()) {
                    data.push(json!({
                        "id": name,
                        "object": "model",
                        "created": 0,
                        "owned_by": provider.name,
                    }));
                }
            }
        }
    }

    // Enabled aggregations — callable by their aggregation name.
    for agg in cfg.aggregations.iter().filter(|a| a.enabled) {
        if !agg.name.is_empty() && seen.insert(agg.name.clone()) {
            data.push(json!({
                "id": agg.name,
                "object": "model",
                "created": 0,
                "owned_by": "melody-hub",
            }));
        }
    }

    Ok(Json(json!({ "object": "list", "data": data })))
}

async fn chat_completions_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    // Auth + rate limit (single short write lock).
    {
        let mut limits = state.runtime.write().await;
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&headers, &auth)?;
        check_body_size(&body, limits.max_body_size)?;
        check_rate_limit(&mut limits)?;
    }

    let model_name = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("unknown");
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    let route = route_request(&state.routing, model_name)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;

    let adapter = crate::proxy::adapter::resolve(&route.provider.api_flavor);

    proxy_request(
        &state,
        route,
        body,
        is_streaming,
        &request_id,
        adapter.as_ref(),
    )
    .await
}

async fn anthropic_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    {
        let mut limits = state.runtime.write().await;
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&headers, &auth)?;
        check_body_size(&body, limits.max_body_size)?;
        check_rate_limit(&mut limits)?;
    }

    let model_name = body
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("unknown");
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    let route = route_request(&state.routing, model_name)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(json!({"error": e}))))?;

    let adapter = crate::proxy::adapter::resolve(crate::proxy::adapter::FLAVOR_ANTHROPIC);

    proxy_request(
        &state,
        route,
        body,
        is_streaming,
        &request_id,
        adapter.as_ref(),
    )
    .await
}

// ── Tests (server-level helpers) ────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_is_streaming_true() {
        assert!(is_streaming_request(
            &json!({ "stream": true, "model": "gpt-4" })
        ));
    }
    #[test]
    fn test_is_streaming_false() {
        assert!(!is_streaming_request(
            &json!({ "stream": false, "model": "gpt-4" })
        ));
    }
    #[test]
    fn test_is_streaming_absent() {
        assert!(!is_streaming_request(&json!({ "model": "gpt-4" })));
    }

    #[test]
    fn test_sanitize_error_truncates() {
        let long = "x".repeat(600);
        let s = sanitize_error(&long);
        assert!(s.contains("truncated"));
    }

    #[test]
    fn test_sanitize_error_keeps_short() {
        assert_eq!(sanitize_error("short"), "short");
    }

    #[test]
    fn ip_whitelist_accepts_exact_and_wildcard() {
        let auth = AuthConfig {
            auth_token: String::new(),
            cors_enabled: false,
            ip_whitelist: "127.0.0.1, 192.168.1.*".into(),
        };
        assert!(require_ip("127.0.0.1".parse().unwrap(), &auth).is_ok());
        assert!(require_ip("192.168.1.42".parse().unwrap(), &auth).is_ok());
        assert!(require_ip("10.0.0.2".parse().unwrap(), &auth).is_err());
    }

    #[test]
    fn bind_host_loopback_is_ok() {
        assert_eq!(normalize_bind_host("127.0.0.1").unwrap(), "127.0.0.1");
        assert_eq!(normalize_bind_host("localhost").unwrap(), "127.0.0.1");
    }

    #[test]
    fn non_loopback_binding_requires_auth_and_whitelist() {
        // Non-loopback bind must have both a non-empty auth token
        // and a non-empty IP whitelist to be considered safe.
        // The server currently does not enforce this at bind time;
        // these tests verify that if these are empty, the proxy is
        // effectively exposed with no access control.
        let empty_auth = AuthConfig {
            auth_token: String::new(),
            cors_enabled: true,
            ip_whitelist: String::new(),
        };
        // Without a token, require_auth passes for any client.
        assert!(require_auth(&HeaderMap::new(), &empty_auth).is_ok());
        // Without a whitelist, require_ip accepts any IP.
        assert!(require_ip([10, 0, 0, 1].into(), &empty_auth).is_ok());

        // With both set, non-whitelisted IPs are rejected.
        let safe_auth = AuthConfig {
            auth_token: "s3cret".into(),
            cors_enabled: true,
            ip_whitelist: "127.0.0.1".into(),
        };
        assert!(require_ip([10, 0, 0, 1].into(), &safe_auth).is_err());
        assert!(require_ip([127, 0, 0, 1].into(), &safe_auth).is_ok());
    }

    #[tokio::test]
    async fn health_route_does_not_require_auth() {
        // /health handler does not call require_auth or require_ip
        // — it returns ok unconditionally. Verify that the health
        // payload is correct.
        let resp = health_handler().await;
        assert_eq!(resp.0.get("status").and_then(|v| v.as_str()), Some("ok"));
    }

    async fn build_test_state(
        providers: Vec<crate::types::Provider>,
        aggregations: Vec<crate::types::Aggregation>,
    ) -> SharedAppState {
        let state = crate::proxy::state::AppState::new();
        {
            let mut routing = state.routing.write().await;
            routing.providers = providers;
            routing.aggregations = aggregations;
        }
        state
    }

    fn dummy_addr() -> SocketAddr {
        "127.0.0.1:0".parse().unwrap()
    }

    #[tokio::test]
    async fn models_lists_provider_model_names_and_aliases() {
        let provider = crate::types::Provider {
            id: "p1".into(),
            name: "Acme".into(),
            api_base: "https://example.com/v1".into(),
            api_key: "sk-test".into(),
            status: "active".into(),
            api_key_encrypted: false,
            api_flavor: "openai-compatible".into(),
            models: vec![
                crate::types::Model {
                    id: "gpt-4".into(),
                    name: "gpt-4".into(),
                    alias: Some("fast".into()),
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                },
                crate::types::Model {
                    id: "gpt-3.5".into(),
                    name: "gpt-3.5".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                },
            ],
        };
        let state = build_test_state(vec![provider], vec![]).await;
        let resp = models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
            .await
            .expect("models handler should succeed");
        let ids: Vec<String> = resp
            .0
            .get("data")
            .and_then(|d| d.as_array())
            .unwrap()
            .iter()
            .map(|m| m.get("id").and_then(|v| v.as_str()).unwrap().to_string())
            .collect();
        // Both real names + alias should be listed, deduplicated.
        assert!(ids.contains(&"gpt-4".to_string()));
        assert!(ids.contains(&"fast".to_string()));
        assert!(ids.contains(&"gpt-3.5".to_string()));
    }

    #[tokio::test]
    async fn models_lists_enabled_aggregations() {
        let agg_enabled = crate::types::Aggregation {
            id: "a1".into(),
            name: "smart-pick".into(),
            models: "gpt-4".into(),
            strategy: "round-robin".into(),
            priority: "normal".into(),
            enabled: true,
        };
        let agg_disabled = crate::types::Aggregation {
            id: "a2".into(),
            name: "disabled-agg".into(),
            models: "gpt-4".into(),
            strategy: "round-robin".into(),
            priority: "normal".into(),
            enabled: false,
        };
        let state = build_test_state(vec![], vec![agg_enabled, agg_disabled]).await;
        let resp = models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
            .await
            .unwrap();
        let ids: Vec<String> = resp
            .0
            .get("data")
            .and_then(|d| d.as_array())
            .unwrap()
            .iter()
            .map(|m| m.get("id").and_then(|v| v.as_str()).unwrap().to_string())
            .collect();
        assert!(ids.contains(&"smart-pick".to_string()));
        assert!(!ids.contains(&"disabled-agg".to_string()));
    }

    #[tokio::test]
    async fn models_deduplicates_when_alias_matches_name() {
        // If a model's alias equals another model's name, only one
        // entry should appear.
        let provider = crate::types::Provider {
            id: "p1".into(),
            name: "Acme".into(),
            api_base: "https://example.com/v1".into(),
            api_key: "sk-test".into(),
            status: "active".into(),
            api_key_encrypted: false,
            api_flavor: "openai-compatible".into(),
            models: vec![
                crate::types::Model {
                    id: "m1".into(),
                    name: "m1".into(),
                    alias: Some("shared".into()),
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                },
                crate::types::Model {
                    id: "shared".into(),
                    name: "shared".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                },
            ],
        };
        let state = build_test_state(vec![provider], vec![]).await;
        let resp = models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
            .await
            .unwrap();
        let count = resp
            .0
            .get("data")
            .and_then(|d| d.as_array())
            .unwrap()
            .iter()
            .filter(|m| m.get("id").and_then(|v| v.as_str()) == Some("shared"))
            .count();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn models_requires_auth_when_token_set() {
        let state = crate::proxy::state::AppState::new();
        {
            let mut auth = state.auth.write().await;
            auth.auth_token = "secret".into();
        }
        let result =
            models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new()).await;
        assert!(result.is_err());
        let (status, _) = result.unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }
}
