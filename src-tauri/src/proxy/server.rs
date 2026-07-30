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
    body::{to_bytes, Body},
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get, post},
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
use crate::proxy::routing::{
    aggregation_route_plan, route_request, RouteResult, SharedRouting,
};
use crate::types::{RequestRecord, RoutingStrategy};

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
pub async fn start(
    state: SharedAppState,
    host: String,
    port: u16,
) -> Result<(), String> {
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

    // A manual stop/start is an explicit recovery action. Runtime health
    // state belongs to the old server session and otherwise leaves every
    // matching provider filtered out even after a successful restart.
    crate::proxy::routing::reset_provider_health(&state.routing).await;
    eprintln!("[proxy] Provider health state reset for new server session");

    let (tx, rx) = tokio::sync::oneshot::channel::<()>();

    let task_host = host.clone();
    let task = tokio::spawn(async move {
        let cors_enabled = state.auth.read().await.cors_enabled;

        let cors = build_cors_layer(cors_enabled);

        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/v1/models", get(models_handler))
            .route("/v1/capabilities", get(capabilities_handler))
            .route("/v1/chat/completions", post(chat_completions_handler))
            .route("/v1/messages", post(messages_handler))
            .route("/v1/responses", post(responses_handler))
            .route("/v1/messages/count_tokens", post(count_tokens_handler))
            .route("/v1/responses/input_tokens", post(count_tokens_handler))
            .route("/v1/images/{*rest}", any(extension_passthrough_handler))
            .route("/v1/audio/{*rest}", any(extension_passthrough_handler))
            .route("/v1/files", any(extension_passthrough_handler))
            .route("/v1/files/{*rest}", any(extension_passthrough_handler))
            .route("/v1/batches", any(extension_passthrough_handler))
            .route("/v1/batches/{*rest}", any(extension_passthrough_handler))
            // Backward-compatible alias for the old endpoint name.
            .route("/v1/anthropic", post(messages_handler))
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
            match tokio::time::timeout(std::time::Duration::from_secs(2), handle.task)
                .await
            {
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

fn require_auth(
    headers: &HeaderMap,
    auth: &AuthConfig,
) -> Result<(), (StatusCode, Json<Value>)> {
    let token = auth.auth_token.as_str();
    if token.is_empty() {
        return Ok(());
    }

    // 1) Authorization: Bearer <token>  (OpenAI 风格)
    let bearer = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let bearer = bearer.strip_prefix("Bearer ").unwrap_or(bearer).trim();

    // 2) x-api-key: <token>  (Anthropic 风格，Cherry Studio 等客户端使用)
    let api_key = headers
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .trim();

    if bearer == token || api_key == token {
        Ok(())
    } else {
        eprintln!("[proxy] Auth failed: invalid token");
        Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "Unauthorized. Provide a valid auth token via Authorization: Bearer <token> or x-api-key header."
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
fn check_rate_limit(
    limits: &mut RuntimeLimits,
) -> Result<(), (StatusCode, Json<Value>)> {
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

fn check_body_size(
    body: &Value,
    max_body_size: u64,
) -> Result<(), (StatusCode, Json<Value>)> {
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

fn conversion_error_body(
    status: StatusCode,
    provider_name: &str,
    request_id: &str,
    error: &crate::proxy::protocols::ConversionError,
) -> Value {
    json!({
        "error": {
            "type": "capability_conversion_error",
            "code": error.feature,
            "message": error.message,
            "path": error.path,
            "provider": provider_name,
            "request_id": request_id,
            "status": status.as_u16(),
        }
    })
}

// ── Generic upstream proxy ──────────────────────────────────

/// Determine if an HTTP status code is retryable on a different
/// provider. Connection-level errors are always retryable.
fn is_retryable_status(status: u16) -> bool {
    matches!(status, 401 | 403 | 429 | 500 | 502 | 503 | 504 | 529)
}

/// Parse the capabilities a request needs from its body. Used by
/// the router to skip models that don't support required features.
fn parse_request_capabilities(
    body: &Value,
) -> crate::proxy::routing::RequestCapabilities {
    use crate::proxy::routing::RequestCapabilities;
    use std::hash::{Hash, Hasher};

    fn contains_type(value: &Value, expected: &[&str]) -> bool {
        match value {
            Value::Array(values) => {
                values.iter().any(|value| contains_type(value, expected))
            }
            Value::Object(map) => {
                map.get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|kind| expected.contains(&kind))
                    || map.values().any(|value| contains_type(value, expected))
            }
            _ => false,
        }
    }

    let needs_tools = body
        .get("tools")
        .and_then(Value::as_array)
        .is_some_and(|tools| !tools.is_empty())
        || contains_type(body, &["tool_use", "function_call"]);
    let needs_vision = contains_type(body, &["image", "image_url", "input_image"]);
    let needs_json_mode = body
        .pointer("/response_format/type")
        .or_else(|| body.pointer("/text/format/type"))
        .or_else(|| body.pointer("/output_config/format/type"))
        .and_then(Value::as_str)
        .is_some_and(|kind| kind == "json_object" || kind == "json_schema");
    let needs_reasoning = body.get("reasoning_effort").is_some()
        || body.get("reasoning").is_some()
        || body.get("thinking").is_some();
    let context_value = body
        .get("messages")
        .or_else(|| body.get("input"))
        .or_else(|| body.get("contents"))
        .unwrap_or(body);
    let serialized_context = serde_json::to_string(context_value).unwrap_or_default();
    let estimated_context_tokens = (serialized_context.len() as u64).div_ceil(4);
    let affinity_prefix = serialized_context
        .get(..serialized_context.len().min(4096))
        .unwrap_or(&serialized_context);
    let mut affinity_hasher = std::collections::hash_map::DefaultHasher::new();
    affinity_prefix.hash(&mut affinity_hasher);
    let affinity_key = affinity_hasher.finish();

    RequestCapabilities {
        needs_tools,
        needs_vision,
        needs_json_mode,
        needs_reasoning,
        estimated_context_tokens,
        affinity_key,
    }
}

/// Map an HTTP status code to a health error kind for provider
/// health tracking. Non-retryable statuses are mapped to
/// `ServerError` as a fallback (they won't trigger health
/// degradation because the failover loop won't call this for
/// non-retryable statuses).
fn status_to_health_kind(status: u16) -> crate::proxy::routing::HealthErrorKind {
    use crate::proxy::routing::HealthErrorKind;
    match status {
        429 => HealthErrorKind::RateLimit,
        401 | 403 => HealthErrorKind::AuthError,
        _ => HealthErrorKind::ServerError,
    }
}

struct OrchestrationRequestContext<'a> {
    is_streaming: bool,
    request_id: String,
    inbound_flavor: &'a str,
    attempt: u32,
    original_provider: String,
}

async fn execute_orchestration_route(
    state: &SharedAppState,
    route: RouteResult,
    body: Value,
    context: OrchestrationRequestContext<'_>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let provider_id = route.provider.id.clone();
    let adapter = crate::proxy::adapter::resolve(&route.outbound_flavor);
    let result = proxy_request(
        state,
        route,
        body,
        context.is_streaming,
        adapter.as_ref(),
        ProxyRequestContext {
            request_id: &context.request_id,
            inbound_flavor: context.inbound_flavor,
            failover_count: context.attempt,
            original_provider: &context.original_provider,
        },
    )
    .await;
    crate::proxy::routing::release_provider_slot(&state.routing, &provider_id).await;
    match &result {
        Ok(_) => {
            crate::proxy::routing::mark_provider_healthy(&state.routing, &provider_id)
                .await;
        }
        Err((status, _)) if is_retryable_status(status.as_u16()) => {
            crate::proxy::routing::mark_provider_unhealthy(
                &state.routing,
                &provider_id,
                status_to_health_kind(status.as_u16()),
            )
            .await;
        }
        _ => {}
    }
    result
}

fn extract_orchestration_text(value: &Value) -> Option<String> {
    if let Some(text) = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
    {
        return Some(text.to_string());
    }
    if let Some(text) = value.pointer("/choices/0/text").and_then(Value::as_str) {
        return Some(text.to_string());
    }
    for path in ["/content", "/output/0/content"] {
        if let Some(blocks) = value.pointer(path).and_then(Value::as_array) {
            let text = blocks
                .iter()
                .filter_map(|block| block.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("");
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }
    value
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(Value::as_str)
        .map(str::to_string)
}

async fn response_text(response: Response) -> Option<String> {
    let (_, body) = response.into_parts();
    let bytes = to_bytes(body, 16 * 1024 * 1024).await.ok()?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    extract_orchestration_text(&json)
}

fn append_orchestration_turn(body: &mut Value, text: String) {
    let message = json!({ "role": "user", "content": text });
    if let Some(messages) = body.get_mut("messages").and_then(Value::as_array_mut) {
        messages.push(message);
    } else if let Some(input) = body.get_mut("input").and_then(Value::as_array_mut) {
        input.push(message);
    } else if let Some(contents) = body.get_mut("contents").and_then(Value::as_array_mut)
    {
        contents.push(json!({ "role": "user", "parts": [{ "text": text }] }));
    } else {
        body["messages"] = json!([message]);
    }
}

async fn orchestrate_routes(
    state: &SharedAppState,
    strategy: RoutingStrategy,
    routes: Vec<RouteResult>,
    body: Value,
    is_streaming: bool,
    request_id: &str,
    inbound_flavor: &str,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let original_provider = routes[0].provider.name.clone();
    if strategy == RoutingStrategy::Pipeline {
        let mut threaded_body = body.clone();
        let route_count = routes.len();
        for (index, route) in routes.into_iter().enumerate() {
            let is_last = index + 1 == route_count;
            threaded_body["stream"] = json!(is_last && is_streaming);
            let response = execute_orchestration_route(
                state,
                route,
                threaded_body.clone(),
                OrchestrationRequestContext {
                    is_streaming: is_last && is_streaming,
                    request_id: format!("{request_id}:pipeline:{index}"),
                    inbound_flavor,
                    attempt: index as u32,
                    original_provider: original_provider.clone(),
                },
            )
            .await?;
            if is_last {
                return Ok(response);
            }
            let Some(text) = response_text(response).await else {
                return Err((
                    StatusCode::BAD_GATEWAY,
                    Json(json!({"error":"Pipeline stage returned no text content"})),
                ));
            };
            append_orchestration_turn(
                &mut threaded_body,
                format!(
                    "Continue the original task using this previous pipeline stage result:\n\n{text}"
                ),
            );
        }
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Pipeline has no executable targets"})),
        ));
    }

    // Fusion follows OmniRoute's panel + judge shape. The highest-priority
    // target is the judge; panel calls are non-streaming and run in parallel.
    let judge = routes[0].clone();
    let mut panel_body = body.clone();
    panel_body["stream"] = json!(false);
    let panel_calls = routes
        .into_iter()
        .take(8)
        .enumerate()
        .map(|(index, route)| {
            execute_orchestration_route(
                state,
                route,
                panel_body.clone(),
                OrchestrationRequestContext {
                    is_streaming: false,
                    request_id: format!("{request_id}:fusion:{index}"),
                    inbound_flavor,
                    attempt: index as u32,
                    original_provider: original_provider.clone(),
                },
            )
        });
    let panel_results = futures::future::join_all(panel_calls).await;
    let mut answers = Vec::new();
    for response in panel_results.into_iter().flatten() {
        if let Some(text) = response_text(response).await {
            if !text.trim().is_empty() {
                answers.push(text);
            }
        }
    }
    if answers.is_empty() {
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({"error":"Fusion panel returned no usable answers"})),
        ));
    }
    let sources = answers
        .iter()
        .enumerate()
        .map(|(index, answer)| format!("[Source {}]\n{}", index + 1, answer))
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut judge_body = body;
    append_orchestration_turn(
        &mut judge_body,
        format!(
            "You are the judge in a model-fusion panel. Synthesize one authoritative answer to the user's original request. Resolve contradictions with your own judgment, include unique useful insights, do not mention the panel or sources, and return only the final answer.\n\n{sources}"
        ),
    );
    execute_orchestration_route(
        state,
        judge,
        judge_body,
        OrchestrationRequestContext {
            is_streaming,
            request_id: format!("{request_id}:fusion:judge"),
            inbound_flavor,
            attempt: answers.len() as u32,
            original_provider,
        },
    )
    .await
}

/// Handle an upstream proxy request with automatic failover across
/// providers. On retryable errors (429, 5xx, 401/403, connection
/// failures), the failed provider is marked unhealthy and the next
/// available provider is tried. Up to 5 attempts are made.
///
/// Streaming safety: failover only happens BEFORE the response body
/// starts streaming. Once SSE data is sent to the client, the stream
/// is committed and cannot be switched.
async fn proxy_request_with_failover(
    state: &SharedAppState,
    model_name: &str,
    body: Value,
    is_streaming: bool,
    request_id: &str,
    inbound_flavor: &str,
) -> Result<Response, (StatusCode, Json<Value>)> {
    use std::collections::HashSet;

    let capabilities = parse_request_capabilities(&body);
    if let Some((strategy, routes)) =
        aggregation_route_plan(&state.routing, model_name, &capabilities, inbound_flavor)
            .await
    {
        let should_orchestrate = routes.len() > 1
            && !(strategy == RoutingStrategy::Fusion && capabilities.needs_tools);
        if should_orchestrate {
            return orchestrate_routes(
                state,
                strategy,
                routes,
                body,
                is_streaming,
                request_id,
                inbound_flavor,
            )
            .await;
        }
    }
    let max_attempts = 5;
    let mut excluded: HashSet<String> = HashSet::new();
    let mut last_error: Option<(StatusCode, Json<Value>)> = None;
    let mut original_provider = String::new();

    for attempt in 0..max_attempts {
        // Route to an available provider (skips excluded + unhealthy
        // + capability-mismatched + protocol-incompatible).
        let route = match route_request(
            &state.routing,
            model_name,
            &excluded,
            &capabilities,
            inbound_flavor,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                // No more providers available. If we had a previous
                // error from an actual upstream attempt, return that
                // (more informative than the routing error).
                if let Some(err) = last_error {
                    return Err(err);
                }
                return Err((StatusCode::BAD_REQUEST, Json(json!({"error": e}))));
            }
        };

        let provider_id = route.provider.id.clone();
        if original_provider.is_empty() {
            original_provider = route.provider.name.clone();
        }
        let adapter = crate::proxy::adapter::resolve(&route.outbound_flavor);

        // Try this provider. proxy_request records metrics for each
        // attempt, giving visibility into intermediate failures.
        match proxy_request(
            state,
            route,
            body.clone(),
            is_streaming,
            adapter.as_ref(),
            ProxyRequestContext {
                request_id,
                inbound_flavor,
                failover_count: attempt,
                original_provider: &original_provider,
            },
        )
        .await
        {
            Ok(response) => {
                // Success - mark provider healthy and release slot.
                crate::proxy::routing::mark_provider_healthy(
                    &state.routing,
                    &provider_id,
                )
                .await;
                crate::proxy::routing::release_provider_slot(
                    &state.routing,
                    &provider_id,
                )
                .await;
                return Ok(response);
            }
            Err((status, json_val)) => {
                let status_u16 = status.as_u16();
                // Release the in-flight slot regardless of outcome.
                crate::proxy::routing::release_provider_slot(
                    &state.routing,
                    &provider_id,
                )
                .await;
                if is_retryable_status(status_u16) {
                    // Retryable: mark provider unhealthy and try next.
                    let kind = status_to_health_kind(status_u16);
                    crate::proxy::routing::mark_provider_unhealthy(
                        &state.routing,
                        &provider_id,
                        kind,
                    )
                    .await;
                    excluded.insert(provider_id);
                    last_error = Some((status, json_val));
                    continue;
                }
                // Non-retryable: return immediately.
                return Err((status, json_val));
            }
        }
    }

    // Exhausted all attempts.
    Err(last_error.unwrap_or((
        StatusCode::SERVICE_UNAVAILABLE,
        Json(json!({"error": "All providers exhausted or unavailable"})),
    )))
}

struct ProxyRequestContext<'a> {
    request_id: &'a str,
    inbound_flavor: &'a str,
    failover_count: u32,
    original_provider: &'a str,
}

/// Handle an upstream proxy request using the given adapter.
async fn proxy_request(
    state: &SharedAppState,
    route: RouteResult,
    body: Value,
    is_streaming: bool,
    adapter: &dyn ProviderAdapter,
    context: ProxyRequestContext<'_>,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let ProxyRequestContext {
        request_id,
        inbound_flavor,
        failover_count,
        original_provider,
    } = context;
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
    let upstream_model = route.upstream_model.clone();
    let target_id = route.target_id.clone();
    let outbound_flavor = route.outbound_flavor.clone();

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
                failover_count,
                original_provider: original_provider.to_string(),
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

    let upstream_url = adapter.build_url(&route.provider.api_base, &upstream_model);

    let inbound_protocol =
        crate::proxy::protocols::ProtocolKind::from_flavor(inbound_flavor);
    let outbound_protocol =
        crate::proxy::protocols::ProtocolKind::from_flavor(&route.outbound_flavor);
    debug_assert!(crate::proxy::protocols::stream::supports_stream_conversion(
        outbound_protocol,
        inbound_protocol,
    ));
    let mut source_body = body.clone();
    source_body["model"] = json!(upstream_model);

    // Some providers reject the `system` role in OpenAI Chat format.
    // When the outbound target doesn't support it, convert system content
    // into a user message instead.
    let system_to_user = outbound_protocol
        == crate::proxy::protocols::ProtocolKind::OpenAiChat
        && !route.provider.supports_system_role;
    let upstream_body = if system_to_user {
        crate::proxy::protocols::convert_request_with_system_to_user(
            &source_body,
            inbound_protocol,
            outbound_protocol,
        )
    } else {
        crate::proxy::protocols::convert_request(
            &source_body,
            inbound_protocol,
            outbound_protocol,
        )
    }
    .map_err(|error| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(conversion_error_body(
                StatusCode::UNPROCESSABLE_ENTITY,
                &provider_name,
                request_id,
                &error,
            )),
        )
    })?;

    let start = Instant::now();
    let runtime = state.runtime.read().await;
    let timeout_secs = route.timeout_secs.unwrap_or(runtime.api_timeout_secs);
    let max_retries = route.max_retries.unwrap_or(runtime.max_retries);
    drop(runtime);
    // Use per-provider client (if provider has custom proxy) or
    // fall back to the shared global client.
    let client = match state.get_provider_client(&route.provider).await {
        Ok(c) => c,
        Err(e) => {
            return Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e}))))
        }
    };

    // Track in-flight count for this provider.
    crate::proxy::routing::acquire_provider_slot(&state.routing, &route.provider.id)
        .await;

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

    // Log the upstream request for debugging stream truncation issues.
    // Mask the messages content to avoid leaking sensitive data.
    if is_streaming {
        let mut debug_body = upstream_body.clone();
        if let Some(messages) = debug_body
            .get_mut("messages")
            .and_then(|m| m.as_array_mut())
        {
            for msg in messages.iter_mut() {
                if let Some(content) = msg.get_mut("content") {
                    if content.is_string() {
                        let s = content.as_str().unwrap_or("");
                        *content = json!(format!("<{} chars>", s.len()));
                    } else if content.is_array() {
                        *content = json!(format!(
                            "<{} content blocks>",
                            content.as_array().unwrap().len()
                        ));
                    }
                }
                if let Some(input) = msg.get_mut("input") {
                    *input = json!("<input omitted>");
                }
            }
        }
        if let Some(input) = debug_body.get_mut("input") {
            if input.is_string() {
                let s = input.as_str().unwrap_or("");
                *input = json!(format!("<{} chars>", s.len()));
            } else if input.is_array() {
                *input =
                    json!(format!("<{} input items>", input.as_array().unwrap().len()));
            }
        }
        let has_max_tokens = debug_body
            .get("max_tokens")
            .or_else(|| debug_body.get("max_output_tokens"))
            .is_some();
        let has_stop = debug_body.get("stop").is_some();
        let tools_count = debug_body
            .get("tools")
            .and_then(|t| t.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        eprintln!(
            "[proxy] upstream request: model={} stream={} tools={} max_tokens_set={} stop_set={} body={}",
            upstream_model,
            debug_body.get("stream").and_then(|s| s.as_bool()).unwrap_or(false),
            tools_count,
            has_max_tokens,
            has_stop,
            serde_json::to_string(&debug_body).unwrap_or_default()
        );
    }

    let request_type = adapter.request_type().to_string();
    let request_type_streaming = format!("{} (streaming)", request_type);

    let upstream_resp = match send_with_retries(req_builder, max_retries).await {
        Ok(r) => r,
        Err(e) => {
            let err_msg = format!("Upstream request failed: {}", e);
            eprintln!(
                "[proxy] {} request to provider '{}' failed before response: {}",
                request_id,
                provider_name,
                sanitize_error(&err_msg)
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
                    r#type: request_type.clone(),
                    tokens: 0,
                    status: "error".into(),
                    latency_ms: start.elapsed().as_millis() as i64,
                    error_category: "upstream_connection_error".into(),
                    failover_count,
                    original_provider: original_provider.to_string(),
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
                failover_count,
                original_provider: original_provider.to_string(),
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
        let original_provider_clone = original_provider.to_string();
        // We can't move the borrowed `adapter` across spawn, so we
        // re-resolve it inside the task from the provider's flavor.
        let flavor_clone = route.outbound_flavor.clone();
        let start_clone = start;
        let stream_source = outbound_protocol;
        let stream_target = inbound_protocol;

        tokio::spawn(async move {
            let mut buffer: Vec<u8> = Vec::new();
            let mut stream = upstream_resp.bytes_stream();
            let mut had_error = false;
            let mut total_upstream_bytes: usize = 0;
            let mut total_sent_bytes: usize = 0;
            let mut chunk_count: usize = 0;
            let has_converter = stream_source != stream_target;
            eprintln!(
                "[proxy] streaming task started: source={:?} target={:?} has_converter={}",
                stream_source, stream_target, has_converter
            );
            let mut converter = if has_converter {
                Some(crate::proxy::protocols::stream::StreamConverter::new(
                    stream_source,
                    stream_target,
                ))
            } else {
                None
            };

            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => {
                        chunk_count += 1;
                        total_upstream_bytes += bytes.len();
                        buffer.extend_from_slice(&bytes);
                        let outgoing = if let Some(converter) = converter.as_mut() {
                            match converter.push(&bytes) {
                                Ok(converted) => {
                                    let b = axum::body::Bytes::from(converted);
                                    total_sent_bytes += b.len();
                                    b
                                }
                                Err(error) => {
                                    eprintln!("[proxy] converter.push error: {}", error);
                                    let _ = tx
                                        .send(Err(std::io::Error::other(
                                            error.to_string(),
                                        )))
                                        .await;
                                    had_error = true;
                                    break;
                                }
                            }
                        } else {
                            total_sent_bytes += bytes.len();
                            bytes
                        };
                        if outgoing.is_empty() {
                            continue;
                        }
                        if tx.send(Ok(outgoing)).await.is_err() {
                            eprintln!("[proxy] client disconnected, stopping read");
                            // Client disconnected — stop reading.
                            break;
                        }
                    }
                    Err(e) => {
                        eprintln!("[proxy] upstream chunk error: {}", e);
                        let io_err = std::io::Error::other(e);
                        let _ = tx.send(Err(io_err)).await;
                        had_error = true;
                        break;
                    }
                }
            }
            eprintln!(
                "[proxy] upstream stream ended: had_error={} total_upstream_bytes={} total_sent_bytes={} chunk_count={}",
                had_error, total_upstream_bytes, total_sent_bytes, chunk_count
            );
            if !had_error {
                if let Some(converter) = converter.as_mut() {
                    match converter.finish() {
                        Ok(remaining) if !remaining.is_empty() => {
                            eprintln!(
                                "[proxy] converter.finish() produced {} bytes",
                                remaining.len()
                            );
                            if tx
                                .send(Ok(axum::body::Bytes::from(remaining)))
                                .await
                                .is_err()
                            {
                                eprintln!(
                                    "[proxy] client disconnected during finish() send"
                                );
                                had_error = true;
                            }
                        }
                        Ok(_) => {}
                        Err(error) => {
                            eprintln!("[proxy] converter.finish() error: {}", error);
                            let _ = tx
                                .send(Err(std::io::Error::other(error.to_string())))
                                .await;
                            had_error = true;
                        }
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
                    failover_count,
                    original_provider: original_provider_clone,
                },
                &aggregation_name_clone,
            )
            .await;
        });

        // Bridge the mpsc Receiver into a Stream for the response
        // body. We use `futures::stream::unfold` instead of pulling
        // in the `tokio-stream` crate just for `ReceiverStream`.
        let receiver_stream = futures::stream::unfold(rx, |mut rx| async move {
            rx.recv().await.map(|item| (item, rx))
        });
        let body = Body::from_stream(receiver_stream);

        let mut response_builder = Response::builder()
            .header("content-type", "text/event-stream")
            .header("cache-control", "no-cache")
            .header("connection", "keep-alive")
            .header("x-request-id", request_id)
            .header("x-melody-upstream-protocol", &outbound_flavor);
        if let Some(target_id) = target_id.as_deref() {
            response_builder = response_builder.header("x-melody-target-id", target_id);
        }
        let response = response_builder.body(body).map_err(|e| {
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
    let client_json = crate::proxy::protocols::convert_response(
        &resp_json,
        outbound_protocol,
        inbound_protocol,
    )
    .map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            Json(conversion_error_body(
                StatusCode::BAD_GATEWAY,
                &provider_name,
                request_id,
                &error,
            )),
        )
    })?;

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
            failover_count,
            original_provider: original_provider.to_string(),
        },
        &route.aggregation_name,
    )
    .await;

    let mut response = Json(client_json).into_response();
    if let Ok(value) = axum::http::HeaderValue::from_str(&outbound_flavor) {
        response
            .headers_mut()
            .insert("x-melody-upstream-protocol", value);
    }
    if let Some(target_id) = target_id {
        if let Ok(value) = axum::http::HeaderValue::from_str(&target_id) {
            response.headers_mut().insert("x-melody-target-id", value);
        }
    }
    Ok(response)
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
            Err(err)
                if attempts < max_retries && (err.is_connect() || err.is_timeout()) =>
            {
                attempts += 1;
                tokio::time::sleep(std::time::Duration::from_millis(
                    150 * attempts as u64,
                ))
                .await;
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
    crate::proxy::routing::record_routing_side_effects(
        routing,
        aggregation_name,
        &model,
        latency,
    )
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

async fn capabilities_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    {
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&headers, &auth)?;
    }
    let routing = state.routing.read().await;
    let providers = routing
        .providers
        .iter()
        .map(|provider| {
            let health = routing.provider_health.get(&provider.id);
            json!({
                "id": provider.id,
                "name": provider.name,
                "protocol": provider.api_flavor,
                "available": health.map(|health| health.is_available()).unwrap_or(true),
                "in_flight": health.map(|health| health.in_flight).unwrap_or(0),
                "models": provider.models.iter().map(|model| json!({
                    "name": model.name,
                    "vision": model.supports_vision,
                    "reasoning": model.supports_reasoning,
                    "reasoning_effort": model.supports_reasoning_effort,
                    "tools": model.supports_tool_calls,
                    "structured_output": model.supports_json_mode,
                })).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    let aggregations = routing
        .aggregations
        .iter()
        .filter(|aggregation| aggregation.enabled)
        .map(|aggregation| {
            json!({
                "name": aggregation.name,
                "strategy": aggregation.strategy_enum().as_key(),
                "targets": aggregation.targets.iter().map(|target| json!({
                    "id": target.id,
                    "provider_id": target.provider_id,
                    "model": target.model,
                    "protocol": target.protocol,
                    "priority": target.priority,
                    "weight": target.weight,
                    "enabled": target.enabled,
                })).collect::<Vec<_>>(),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({
        "protocols": ["openai-chat", "anthropic-messages", "openai-responses"],
        "conversion": {
            "non_streaming": "full-matrix",
            "streaming": "full-matrix",
            "strict_features": ["tools", "structured_output"],
        },
        "providers": providers,
        "aggregations": aggregations,
    })))
}

async fn count_tokens_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    {
        let mut limits = state.runtime.write().await;
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&headers, &auth)?;
        check_body_size(&body, limits.max_body_size)?;
        check_rate_limit(&mut limits)?;
    }
    let serialized = serde_json::to_string(&body).unwrap_or_default();
    let estimated = serialized.chars().count().div_ceil(4).max(1);
    Ok(Json(json!({
        "input_tokens": estimated,
        "estimated": true,
    })))
}

/// Pass through auxiliary OpenAI-compatible resources (images, audio,
/// files and batches). A model in a JSON request selects its provider;
/// otherwise callers can set `x-melody-provider-id`. When exactly one
/// provider exists it is selected automatically.
async fn extension_passthrough_handler(
    State(state): State<SharedAppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
) -> Result<Response, (StatusCode, Json<Value>)> {
    let (parts, body) = request.into_parts();
    let max_body_size = {
        let mut limits = state.runtime.write().await;
        let auth = state.auth.read().await;
        require_ip(addr.ip(), &auth)?;
        require_auth(&parts.headers, &auth)?;
        check_rate_limit(&mut limits)?;
        limits.max_body_size
    };
    let body_limit = usize::try_from(max_body_size).unwrap_or(usize::MAX);
    let bytes = to_bytes(body, body_limit).await.map_err(|error| {
        (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error":{"type":"request_too_large","message":error.to_string()}})),
        )
    })?;
    let body_json = serde_json::from_slice::<Value>(&bytes).ok();
    let requested_provider = parts
        .headers
        .get("x-melody-provider-id")
        .and_then(|value| value.to_str().ok());
    let requested_model = body_json
        .as_ref()
        .and_then(|body| body.get("model"))
        .and_then(Value::as_str);

    let provider = if let Some(provider_id) = requested_provider {
        state
            .routing
            .read()
            .await
            .providers
            .iter()
            .find(|provider| provider.id == provider_id)
            .cloned()
    } else if let Some(model) = requested_model {
        route_request(
            &state.routing,
            model,
            &std::collections::HashSet::new(),
            &crate::proxy::routing::RequestCapabilities::default(),
            "openai-compatible",
        )
        .await
        .ok()
        .map(|route| route.provider)
    } else {
        let routing = state.routing.read().await;
        if routing.providers.len() == 1 {
            routing.providers.first().cloned()
        } else {
            None
        }
    }
    .ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error":{
                    "type":"provider_selection_error",
                    "message":"Set a JSON model or x-melody-provider-id for this endpoint"
                }
            })),
        )
    })?;

    if provider.api_key.trim().is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":{"type":"missing_api_key","provider":provider.name}})),
        ));
    }
    let client = state.get_provider_client(&provider).await.map_err(|error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":{"type":"client_configuration_error","message":error}})),
        )
    })?;
    let url =
        extension_upstream_url(&provider.api_base, parts.uri.path(), parts.uri.query());
    let method = reqwest::Method::from_bytes(parts.method.as_str().as_bytes()).map_err(
        |error| {
            (
                StatusCode::METHOD_NOT_ALLOWED,
                Json(json!({"error":{"message":error.to_string()}})),
            )
        },
    )?;
    let adapter = crate::proxy::adapter::resolve(&provider.api_flavor);
    let (auth_name, auth_value) = adapter.auth_header(&provider.api_key);
    let mut upstream = client
        .request(method, url)
        .header(auth_name, auth_value)
        .body(bytes);
    for (name, value) in adapter.extra_headers() {
        upstream = upstream.header(name, value);
    }
    for header in ["content-type", "accept", "openai-beta", "anthropic-beta"] {
        if let Some(value) = parts.headers.get(header) {
            upstream = upstream.header(header, value);
        }
    }
    let upstream = upstream.send().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error":{"type":"upstream_connection_error","message":sanitize_error(&error.to_string())}})),
        )
    })?;
    let status = upstream.status();
    let content_type = upstream.headers().get("content-type").cloned();
    let response_bytes = upstream.bytes().await.map_err(|error| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({"error":{"type":"upstream_body_error","message":error.to_string()}})),
        )
    })?;
    let mut response = Response::builder().status(status);
    if let Some(content_type) = content_type {
        response = response.header("content-type", content_type);
    }
    response
        .header("x-melody-provider-id", provider.id)
        .body(Body::from(response_bytes))
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error":{"message":error.to_string()}})),
            )
        })
}

fn extension_upstream_url(base: &str, path: &str, query: Option<&str>) -> String {
    let base = base.trim_end_matches('/');
    let suffix = path.strip_prefix("/v1").unwrap_or(path);
    let mut url = if base.ends_with("/v1") {
        format!("{base}{suffix}")
    } else {
        format!("{base}/v1{suffix}")
    };
    if let Some(query) = query {
        url.push('?');
        url.push_str(query);
    }
    url
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
        .unwrap_or("unknown")
        .to_string();
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    proxy_request_with_failover(
        &state,
        &model_name,
        body,
        is_streaming,
        &request_id,
        crate::proxy::adapter::FLAVOR_OPENAI,
    )
    .await
}

/// `POST /v1/messages` - Anthropic Messages API compatible endpoint.
/// Also served at `/v1/anthropic` for backward compatibility.
async fn messages_handler(
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
        .unwrap_or("unknown")
        .to_string();
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    proxy_request_with_failover(
        &state,
        &model_name,
        body,
        is_streaming,
        &request_id,
        crate::proxy::adapter::FLAVOR_ANTHROPIC,
    )
    .await
}

/// `POST /v1/responses` - OpenAI Responses API compatible endpoint.
async fn responses_handler(
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
        .unwrap_or("unknown")
        .to_string();
    let request_id = Uuid::new_v4().to_string();
    let is_streaming = is_streaming_request(&body);

    proxy_request_with_failover(
        &state,
        &model_name,
        body,
        is_streaming,
        &request_id,
        crate::proxy::adapter::FLAVOR_RESPONSES,
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
    fn extension_url_avoids_duplicate_v1_and_preserves_query() {
        assert_eq!(
            extension_upstream_url(
                "https://api.example.com/v1/",
                "/v1/files/file_1",
                Some("purpose=batch")
            ),
            "https://api.example.com/v1/files/file_1?purpose=batch"
        );
        assert_eq!(
            extension_upstream_url("https://api.example.com", "/v1/audio/speech", None),
            "https://api.example.com/v1/audio/speech"
        );
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

    #[test]
    fn require_auth_accepts_bearer_and_x_api_key() {
        let auth = AuthConfig {
            auth_token: "s3cret".into(),
            cors_enabled: false,
            ip_whitelist: String::new(),
        };

        // Authorization: Bearer <token>
        let mut h1 = HeaderMap::new();
        h1.insert("Authorization", "Bearer s3cret".parse().unwrap());
        assert!(require_auth(&h1, &auth).is_ok());

        // x-api-key: <token>  (Anthropic 风格)
        let mut h2 = HeaderMap::new();
        h2.insert("x-api-key", "s3cret".parse().unwrap());
        assert!(require_auth(&h2, &auth).is_ok());

        // 错误的 token 应被拒绝
        let mut h3 = HeaderMap::new();
        h3.insert("x-api-key", "wrong".parse().unwrap());
        assert!(require_auth(&h3, &auth).is_err());

        // 无任何鉴权头应被拒绝
        assert!(require_auth(&HeaderMap::new(), &auth).is_err());
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
            model_mapping: None,
            proxy_config: None,
            supports_system_role: true,
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
                    supports_tool_calls: false,
                    supports_json_mode: false,
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
                    supports_tool_calls: false,
                    supports_json_mode: false,
                },
            ],
        };
        let state = build_test_state(vec![provider], vec![]).await;
        let resp =
            models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
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
            targets: vec![],
            strategy: "round-robin".into(),
            priority: "normal".into(),
            enabled: true,
        };
        let agg_disabled = crate::types::Aggregation {
            id: "a2".into(),
            name: "disabled-agg".into(),
            models: "gpt-4".into(),
            targets: vec![],
            strategy: "round-robin".into(),
            priority: "normal".into(),
            enabled: false,
        };
        let state = build_test_state(vec![], vec![agg_enabled, agg_disabled]).await;
        let resp =
            models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
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
            model_mapping: None,
            proxy_config: None,
            supports_system_role: true,
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
                    supports_tool_calls: false,
                    supports_json_mode: false,
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
                    supports_tool_calls: false,
                    supports_json_mode: false,
                },
            ],
        };
        let state = build_test_state(vec![provider], vec![]).await;
        let resp =
            models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
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
            models_handler(State(state), ConnectInfo(dummy_addr()), HeaderMap::new())
                .await;
        assert!(result.is_err());
        let (status, _) = result.unwrap_err();
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn orchestration_text_supports_chat_anthropic_and_responses() {
        assert_eq!(
            extract_orchestration_text(
                &json!({"choices":[{"message":{"content":"chat answer"}}]})
            )
            .as_deref(),
            Some("chat answer")
        );
        assert_eq!(
            extract_orchestration_text(
                &json!({"content":[{"type":"text","text":"anthropic answer"}]})
            )
            .as_deref(),
            Some("anthropic answer")
        );
        assert_eq!(
            extract_orchestration_text(
                &json!({"output":[{"content":[{"type":"output_text","text":"responses answer"}]}]})
            )
            .as_deref(),
            Some("responses answer")
        );
    }

    #[test]
    fn orchestration_turn_preserves_existing_conversation() {
        let mut body = json!({"messages":[{"role":"user","content":"original"}]});
        append_orchestration_turn(&mut body, "stage output".into());
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["content"], "original");
        assert_eq!(messages[1]["content"], "stage output");
    }
}
