// ═══════════════════════════════════════════════════════════════
// Melody Hub — Provider adapter layer
// ═══════════════════════════════════════════════════════════════
// Modeled after opencode's provider/protocol split:
//
//   - Auth:        how a credential is attached to a request
//                  (Bearer token vs x-api-key header). opencode
//                  calls this `AuthOptions` / `Auth.bearer()`.
//   - Protocol:    the wire format — request body shape, endpoint
//                  path, response token-count extraction. opencode
//                  calls this `protocols/openai-chat.ts` etc.
//   - ProviderProfile: a named (provider, baseURL) pair for common
//                  OpenAI-compatible services, so users pick from
//                  a list instead of typing a URL. opencode calls
//                  these `profiles` in openai-compatible-profile.ts.
//   - ProxyError:  structured upstream-error parsing (context
//                  overflow vs retryable api error), mirroring
//                  opencode's `parseAPICallError`.
// ═══════════════════════════════════════════════════════════════

use serde_json::Value;

// ── Flavor identifiers ──────────────────────────────────────

pub const FLAVOR_OPENAI: &str = "openai";
pub const FLAVOR_ANTHROPIC: &str = "anthropic";
pub const FLAVOR_OPENAI_COMPAT: &str = "openai-compatible";
pub const FLAVOR_RESPONSES: &str = "responses";

/// Determine if an inbound protocol (the endpoint the client
/// called) is compatible with a provider's outbound protocol
/// (the upstream API format). In native-passthrough mode, the
/// inbound and outbound protocols must match - no format
/// conversion is performed.
///
/// This is the extension point for future cross-protocol
/// conversion (e.g. Anthropic Messages -> OpenAI Chat). For now,
/// only same-protocol routing is allowed.
pub fn is_protocol_compatible(inbound_flavor: &str, provider_flavor: &str) -> bool {
    match (inbound_flavor, provider_flavor) {
        // OpenAI Chat Completions is compatible with both "openai"
        // and "openai-compatible" providers (same wire format).
        (FLAVOR_OPENAI | FLAVOR_OPENAI_COMPAT, FLAVOR_OPENAI | FLAVOR_OPENAI_COMPAT) => true,
        // Anthropic Messages only works with Anthropic-native providers.
        (FLAVOR_ANTHROPIC, FLAVOR_ANTHROPIC) => true,
        // Responses API works with OpenAI native (Responses endpoint)
        // and "openai" flavor providers.
        (FLAVOR_RESPONSES, FLAVOR_RESPONSES | FLAVOR_OPENAI) => true,
        _ => false,
    }
}

// ── Auth ────────────────────────────────────────────────────
//
// Mirrors opencode's `Auth.header(name)` / `Auth.bearer()`. Each
// protocol declares how its credential is attached; the adapter
// applies it uniformly.

/// How a provider's API key is attached to an upstream request.
#[derive(Debug, Clone, Copy)]
pub enum Auth {
    /// `Authorization: Bearer <key>` (OpenAI family).
    Bearer,
    /// Custom header, e.g. `x-api-key: <key>` (Anthropic).
    Header(&'static str),
}

impl Auth {
    /// Return the (header_name, header_value) pair for this key.
    pub fn apply(&self, api_key: &str) -> (String, String) {
        match self {
            Auth::Bearer => ("Authorization".into(), format!("Bearer {}", api_key)),
            Auth::Header(name) => ((*name).into(), api_key.into()),
        }
    }
}

// ── Protocol ────────────────────────────────────────────────
//
// Mirrors opencode's `protocols/*` modules: each protocol knows
// its endpoint path, request type label, extra headers, and how
// to count tokens from a response. The adapter is now a thin
// resolver that pairs a Protocol with an Auth strategy.

/// A wire protocol for talking to an LLM provider.
pub trait Protocol: Send + Sync {
    /// Human-readable label (e.g. "Chat Completion", "Anthropic").
    fn request_type(&self) -> &str;

    /// Append the endpoint path to the user-supplied base URL.
    /// The base URL is used verbatim (no auto-/v1) — only a
    /// trailing slash is stripped.
    fn build_url(&self, api_base: &str) -> String;

    /// How the API key is attached to the request.
    fn auth(&self) -> Auth;

    /// Optional extra headers (e.g. anthropic-version).
    fn extra_headers(&self) -> Vec<(String, String)> {
        vec![]
    }

    /// Count tokens from a successful non-streaming response.
    fn count_tokens(&self, resp: &Value) -> i64;

    /// Count tokens from an accumulated SSE streaming buffer. The
    /// buffer contains all raw bytes received from the upstream
    /// (including `data:` prefixes and `\n\n` separators). Default
    /// returns 0; protocols override to parse their SSE format.
    fn count_stream_tokens(&self, _buffer: &[u8]) -> i64 {
        0
    }
}

// ── OpenAI Chat Completions protocol ────────────────────────

pub struct OpenAiChatProtocol;

impl Protocol for OpenAiChatProtocol {
    fn request_type(&self) -> &str {
        "Chat Completion"
    }

    fn build_url(&self, api_base: &str) -> String {
        let base = api_base.trim_end_matches('/');
        format!("{}/chat/completions", base)
    }

    fn auth(&self) -> Auth {
        Auth::Bearer
    }

    fn count_tokens(&self, resp: &Value) -> i64 {
        if let Some(usage) = resp.get("usage") {
            if let Some(total) = usage.get("total_tokens").and_then(|v| v.as_i64()) {
                return total;
            }
            if let (Some(p), Some(c)) = (
                usage.get("prompt_tokens").and_then(|v| v.as_i64()),
                usage.get("completion_tokens").and_then(|v| v.as_i64()),
            ) {
                return p + c;
            }
            if let Some(c) = usage.get("completion_tokens").and_then(|v| v.as_i64()) {
                return c;
            }
        }
        // Fallback: rough char/4 estimate.
        if let Some(choices) = resp.get("choices").and_then(|v| v.as_array()) {
            if let Some(choice) = choices.first() {
                if let Some(content) = choice
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|v| v.as_str())
                {
                    return (content.len() / 4).max(1) as i64;
                }
            }
        }
        1
    }

    fn count_stream_tokens(&self, buffer: &[u8]) -> i64 {
        let text = match std::str::from_utf8(buffer) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        // OpenAI SSE: each event is `data: {json}\n\n`. When
        // `stream_options.include_usage` is set (or the server
        // emits usage by default), the final chunk before [DONE]
        // carries a top-level `usage` object.
        let mut last_total: Option<i64> = None;
        let mut last_prompt: i64 = 0;
        let mut last_completion: i64 = 0;
        for line in text.lines() {
            let line = line.trim();
            let data = line
                .strip_prefix("data: ")
                .or_else(|| line.strip_prefix("data:"))
                .map(str::trim);
            if let Some(data) = data {
                if data == "[DONE]" || data.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if let Some(usage) = json.get("usage").filter(|v| v.is_object()) {
                        if let Some(total) =
                            usage.get("total_tokens").and_then(|v| v.as_i64())
                        {
                            last_total = Some(total);
                        }
                        if let Some(p) =
                            usage.get("prompt_tokens").and_then(|v| v.as_i64())
                        {
                            last_prompt = p;
                        }
                        if let Some(c) =
                            usage.get("completion_tokens").and_then(|v| v.as_i64())
                        {
                            last_completion = c;
                        }
                    }
                }
            }
        }
        if let Some(total) = last_total {
            return total;
        }
        let sum = last_prompt + last_completion;
        if sum > 0 {
            return sum;
        }
        0
    }
}

// ── Anthropic Messages protocol ─────────────────────────────

pub struct AnthropicMessagesProtocol;

impl Protocol for AnthropicMessagesProtocol {
    fn request_type(&self) -> &str {
        "Anthropic"
    }

    fn build_url(&self, api_base: &str) -> String {
        let base = api_base.trim_end_matches('/');
        format!("{}/messages", base)
    }

    fn auth(&self) -> Auth {
        Auth::Header("x-api-key")
    }

    fn extra_headers(&self) -> Vec<(String, String)> {
        vec![("anthropic-version".into(), "2023-06-01".into())]
    }

    fn count_tokens(&self, resp: &Value) -> i64 {
        if let Some(usage) = resp.get("usage") {
            if let (Some(i), Some(o)) = (
                usage.get("input_tokens").and_then(|v| v.as_i64()),
                usage.get("output_tokens").and_then(|v| v.as_i64()),
            ) {
                return i + o;
            }
            if let Some(o) = usage.get("output_tokens").and_then(|v| v.as_i64()) {
                return o;
            }
        }
        if let Some(content) = resp.get("content").and_then(|v| v.as_array()) {
            for block in content {
                if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                    return (text.len() / 4).max(1) as i64;
                }
            }
        }
        1
    }

    fn count_stream_tokens(&self, buffer: &[u8]) -> i64 {
        let text = match std::str::from_utf8(buffer) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        // Anthropic SSE: `event: <type>\ndata: {json}\n\n`.
        // input_tokens arrives in `message_start` (under
        // `message.usage.input_tokens`); output_tokens arrives in
        // `message_delta` (under `usage.output_tokens`).
        let mut input_tokens: i64 = 0;
        let mut output_tokens: i64 = 0;
        let mut current_event = String::new();
        for line in text.lines() {
            let line = line.trim();
            if let Some(ev) = line.strip_prefix("event: ") {
                current_event = ev.trim().to_string();
                continue;
            }
            let data = line
                .strip_prefix("data: ")
                .or_else(|| line.strip_prefix("data:"))
                .map(str::trim);
            if let Some(data) = data {
                if data == "[DONE]" || data.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if current_event == "message_start" {
                        if let Some(i) = json
                            .pointer("/message/usage/input_tokens")
                            .and_then(|v| v.as_i64())
                        {
                            input_tokens = i;
                        }
                    }
                    if current_event == "message_delta" {
                        if let Some(o) = json
                            .pointer("/usage/output_tokens")
                            .and_then(|v| v.as_i64())
                        {
                            output_tokens = o;
                        }
                    }
                }
            }
        }
        let sum = input_tokens + output_tokens;
        if sum > 0 {
            return sum;
        }
        0
    }
}

// ── OpenAI Responses API protocol ───────────────────────────
//
// OpenAI's Responses API (https://platform.openai.com/docs/api-reference/responses)
// is the newer unified endpoint that supersedes Chat Completions.
// Endpoint: POST {base}/responses
// Auth: Bearer token (same as Chat Completions)
// Usage shape: { usage: { input_tokens, output_tokens, total_tokens } }

pub struct ResponsesApiProtocol;

impl Protocol for ResponsesApiProtocol {
    fn request_type(&self) -> &str {
        "Responses"
    }

    fn build_url(&self, api_base: &str) -> String {
        let base = api_base.trim_end_matches('/');
        format!("{}/responses", base)
    }

    fn auth(&self) -> Auth {
        Auth::Bearer
    }

    fn count_tokens(&self, resp: &Value) -> i64 {
        if let Some(usage) = resp.get("usage") {
            if let Some(total) = usage.get("total_tokens").and_then(|v| v.as_i64()) {
                return total;
            }
            if let (Some(i), Some(o)) = (
                usage.get("input_tokens").and_then(|v| v.as_i64()),
                usage.get("output_tokens").and_then(|v| v.as_i64()),
            ) {
                return i + o;
            }
            if let Some(o) = usage.get("output_tokens").and_then(|v| v.as_i64()) {
                return o;
            }
        }
        // Fallback: rough char/4 estimate from output text.
        if let Some(output) = resp.get("output").and_then(|v| v.as_array()) {
            for item in output {
                if let Some(content) = item.get("content").and_then(|v| v.as_array()) {
                    for block in content {
                        if let Some(text) = block.get("text").and_then(|v| v.as_str()) {
                            return (text.len() / 4).max(1) as i64;
                        }
                    }
                }
            }
        }
        1
    }

    fn count_stream_tokens(&self, buffer: &[u8]) -> i64 {
        let text = match std::str::from_utf8(buffer) {
            Ok(s) => s,
            Err(_) => return 0,
        };
        // Responses API SSE: `event: <type>\ndata: {json}\n\n`.
        // `response.completed` event carries the final `response.usage`
        // with input_tokens / output_tokens / total_tokens.
        let mut last_total: Option<i64> = None;
        let mut last_input: i64 = 0;
        let mut last_output: i64 = 0;
        for line in text.lines() {
            let line = line.trim();
            let data = line
                .strip_prefix("data: ")
                .or_else(|| line.strip_prefix("data:"))
                .map(str::trim);
            if let Some(data) = data {
                if data == "[DONE]" || data.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<Value>(data) {
                    if let Some(usage) = json.get("usage").filter(|v| v.is_object()) {
                        if let Some(total) =
                            usage.get("total_tokens").and_then(|v| v.as_i64())
                        {
                            last_total = Some(total);
                        }
                        if let Some(i) =
                            usage.get("input_tokens").and_then(|v| v.as_i64())
                        {
                            last_input = i;
                        }
                        if let Some(o) =
                            usage.get("output_tokens").and_then(|v| v.as_i64())
                        {
                            last_output = o;
                        }
                    }
                    // The completed response object also nests usage
                    // under `response.usage` for `response.completed` events.
                    if let Some(usage) =
                        json.pointer("/response/usage").filter(|v| v.is_object())
                    {
                        if let Some(total) =
                            usage.get("total_tokens").and_then(|v| v.as_i64())
                        {
                            last_total = Some(total);
                        }
                        if let Some(i) =
                            usage.get("input_tokens").and_then(|v| v.as_i64())
                        {
                            last_input = i;
                        }
                        if let Some(o) =
                            usage.get("output_tokens").and_then(|v| v.as_i64())
                        {
                            last_output = o;
                        }
                    }
                }
            }
        }
        if let Some(total) = last_total {
            return total;
        }
        let sum = last_input + last_output;
        if sum > 0 {
            return sum;
        }
        0
    }
}

// ── Compatibility: the old ProviderAdapter trait ────────────
//
// Kept as a thin shim so server.rs can keep using `adapter::*`
// while we route through the new Protocol + Auth abstractions.

pub trait ProviderAdapter: Send + Sync {
    fn request_type(&self) -> &str;
    fn build_url(&self, api_base: &str, _model: &str) -> String;
    fn auth_header(&self, api_key: &str) -> (String, String);
    fn extra_headers(&self) -> Vec<(String, String)> {
        vec![]
    }
    fn count_tokens(&self, resp: &Value) -> i64;
    fn count_stream_tokens(&self, buffer: &[u8]) -> i64;
}

/// Adapter wrapping a Protocol + its Auth strategy.
struct ProtocolAdapter<P: Protocol> {
    protocol: P,
}

impl<P: Protocol> ProviderAdapter for ProtocolAdapter<P> {
    fn request_type(&self) -> &str {
        self.protocol.request_type()
    }
    fn build_url(&self, api_base: &str, _model: &str) -> String {
        self.protocol.build_url(api_base)
    }
    fn auth_header(&self, api_key: &str) -> (String, String) {
        self.protocol.auth().apply(api_key)
    }
    fn extra_headers(&self) -> Vec<(String, String)> {
        self.protocol.extra_headers()
    }
    fn count_tokens(&self, resp: &Value) -> i64 {
        self.protocol.count_tokens(resp)
    }
    fn count_stream_tokens(&self, buffer: &[u8]) -> i64 {
        self.protocol.count_stream_tokens(buffer)
    }
}

/// Resolve an adapter by flavor string. Falls back to OpenAI Chat.
pub fn resolve(flavor: &str) -> Box<dyn ProviderAdapter> {
    match flavor {
        FLAVOR_ANTHROPIC => Box::new(ProtocolAdapter {
            protocol: AnthropicMessagesProtocol,
        }),
        FLAVOR_OPENAI => Box::new(ProtocolAdapter {
            protocol: OpenAiChatProtocol,
        }),
        FLAVOR_OPENAI_COMPAT => Box::new(ProtocolAdapter {
            protocol: OpenAiChatProtocol,
        }),
        FLAVOR_RESPONSES => Box::new(ProtocolAdapter {
            protocol: ResponsesApiProtocol,
        }),
        _ => {
            if flavor.contains("anthropic") || flavor.contains("claude") {
                Box::new(ProtocolAdapter {
                    protocol: AnthropicMessagesProtocol,
                })
            } else if flavor.contains("responses") {
                Box::new(ProtocolAdapter {
                    protocol: ResponsesApiProtocol,
                })
            } else {
                Box::new(ProtocolAdapter {
                    protocol: OpenAiChatProtocol,
                })
            }
        }
    }
}

// ── Provider profiles (opencode-style registry) ─────────────
//
// Like opencode's `openai-compatible-profile.ts`, this gives
// users a curated list of known OpenAI-compatible services so
// they pick a name instead of typing a URL. Each profile carries
// a suggested baseURL (which the user can still override).

/// A known provider profile: id, display label, default base URL,
/// and the protocol flavor to use.
#[derive(Debug, Clone)]
pub struct ProviderProfile {
    pub id: &'static str,
    pub label: &'static str,
    pub base_url: &'static str,
    pub flavor: &'static str,
}

/// Curated profiles for the "add provider" dropdown. Users can
/// still choose "Custom" and type any URL.
///
/// Coverage is aligned with opencode's documented provider list
/// (https://opencode.ai/docs/providers/) — all 40 documented
/// providers are represented. For providers whose base URL is
/// account-specific (Azure resource name, AWS region, GCP project),
/// we use a placeholder the user edits after selecting the profile.
pub const PROFILES: &[ProviderProfile] = &[
    // ── Native (own protocol) ──
    ProviderProfile {
        id: "openai",
        label: "OpenAI",
        base_url: "https://api.openai.com/v1",
        flavor: FLAVOR_RESPONSES,
    },
    ProviderProfile {
        id: "anthropic",
        label: "Anthropic",
        base_url: "https://api.anthropic.com/v1",
        flavor: FLAVOR_ANTHROPIC,
    },
    // ── opencode OpenAI-compatible profiles ──
    ProviderProfile {
        id: "deepseek",
        label: "DeepSeek",
        base_url: "https://api.deepseek.com",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "openrouter",
        label: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "groq",
        label: "Groq",
        base_url: "https://api.groq.com/openai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "xai",
        label: "xAI (Grok)",
        base_url: "https://api.x.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "togetherai",
        label: "Together AI",
        base_url: "https://api.together.xyz/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "fireworks",
        label: "Fireworks AI",
        base_url: "https://api.fireworks.ai/inference/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "cerebras",
        label: "Cerebras",
        base_url: "https://api.cerebras.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "deepinfra",
        label: "Deep Infra",
        base_url: "https://api.deepinfra.com/v1/openai",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "baseten",
        label: "Baseten",
        base_url: "https://inference.baseten.co/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    // ── Other cloud OpenAI-compatible services ──
    ProviderProfile {
        id: "mistral",
        label: "Mistral AI",
        base_url: "https://api.mistral.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "cohere",
        label: "Cohere",
        base_url: "https://api.cohere.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "perplexity",
        label: "Perplexity",
        base_url: "https://api.perplexity.ai",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "nvidia",
        label: "NVIDIA NIM",
        base_url: "https://integrate.api.nvidia.com/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "alibaba",
        label: "Alibaba (DashScope)",
        base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "venice",
        label: "Venice AI",
        base_url: "https://api.venice.ai/api/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    // ── opencode-documented OpenAI-compatible gateways/services ──
    ProviderProfile {
        id: "302ai",
        label: "302.AI",
        base_url: "https://api.302.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "moonshot",
        label: "Moonshot AI (Kimi)",
        base_url: "https://api.moonshot.cn/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "minimax",
        label: "MiniMax",
        base_url: "https://api.minimax.chat/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "huggingface",
        label: "Hugging Face",
        base_url: "https://api-inference.huggingface.co/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "zai",
        label: "Z.AI",
        base_url: "https://api.z.ai/api/paas/v4",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "ionet",
        label: "IO.NET",
        base_url: "https://api.intelligence.io.solutions/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "nebius",
        label: "Nebius Token Factory",
        base_url: "https://api.studio.nebius.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "cortecs",
        label: "Cortecs",
        base_url: "https://api.cortecs.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "stackit",
        label: "STACKIT",
        base_url: "https://api.openai.stackit.tech/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "ovhcloud",
        label: "OVHcloud AI Endpoints",
        base_url: "https://endpoints.ai.eu.ovhcloud.com/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "scaleway",
        label: "Scaleway",
        base_url: "https://api.scaleway.ai/ai-apis/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "helicone",
        label: "Helicone",
        base_url: "https://ai-gateway.helicone.ai",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "frogbot",
        label: "FrogBot",
        base_url: "https://api.frogbot.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    // ── Local runtimes (OpenAI-compatible) ──
    ProviderProfile {
        id: "ollama",
        label: "Ollama (local)",
        base_url: "http://127.0.0.1:11434/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "ollama-cloud",
        label: "Ollama Cloud",
        base_url: "https://api.olama.cloud/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "lmstudio",
        label: "LM Studio (local)",
        base_url: "http://127.0.0.1:1234/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "llamacpp",
        label: "llama.cpp (local)",
        base_url: "http://127.0.0.1:8080/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "vllm",
        label: "vLLM (local)",
        base_url: "http://127.0.0.1:8000/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "atomic-chat",
        label: "Atomic Chat (local)",
        base_url: "http://127.0.0.1:1337/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    // ── Cloud platforms with API-key access (opencode-documented) ──
    // For account-specific endpoints the base URL is a placeholder
    // the user edits (e.g. replace RESOURCE_NAME for Azure).
    ProviderProfile {
        id: "amazon-bedrock",
        label: "Amazon Bedrock",
        base_url: "https://bedrock-runtime.us-east-1.amazonaws.com",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "azure-openai",
        label: "Azure OpenAI",
        // Replace RESOURCE_NAME with your Azure resource name.
        base_url: "https://RESOURCE_NAME.openai.azure.com",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "azure-cognitive-services",
        label: "Azure Cognitive Services",
        // Replace RESOURCE_NAME with your Azure resource name.
        base_url: "https://RESOURCE_NAME.cognitiveservices.azure.com",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "google-vertex",
        label: "Google Vertex AI",
        base_url: "https://us-central1-aiplatform.googleapis.com/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "github-copilot",
        label: "GitHub Copilot",
        base_url: "https://api.githubcopilot.com",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "gitlab-duo",
        label: "GitLab Duo",
        base_url: "https://cloud.gitlab.com/ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "sap-ai-core",
        label: "SAP AI Core",
        // Replace with your SAP AI Core deployment URL.
        base_url: "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "cloudflare-ai-gateway",
        label: "Cloudflare AI Gateway",
        // Replace ACCOUNT_ID and GATEWAY_ID.
        base_url: "https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "vercel-ai-gateway",
        label: "Vercel AI Gateway",
        base_url: "https://ai-gateway.vercel.sh/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "zenmux",
        label: "ZenMux",
        base_url: "https://api.zenmux.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
    ProviderProfile {
        id: "opencode-zen",
        label: "OpenCode Zen",
        base_url: "https://zen.opencode.ai/v1",
        flavor: FLAVOR_OPENAI_COMPAT,
    },
];

/// Look up a profile by id. Returns None for "custom".
#[allow(dead_code)]
pub fn profile_by_id(id: &str) -> Option<&'static ProviderProfile> {
    PROFILES.iter().find(|p| p.id == id)
}

// ── Structured upstream-error parsing ───────────────────────
//
// Mirrors opencode's `parseAPICallError` / `parseStreamError`:
// classify an upstream failure so the UI can show a precise,
// actionable message and decide whether to retry.

/// Classified upstream error. Serializable so the frontend can
/// branch on `kind`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ProxyError {
    /// Auth failed (401/403) — key invalid or missing.
    Auth { message: String, status: u16 },
    /// Request exceeded the model's context window (413 or
    /// context_length_exceeded).
    ContextOverflow { message: String },
    /// Provider rate-limited the request (429).
    RateLimited { message: String },
    /// A model the provider doesn't have (404). opencode treats
    /// some 404s as retryable because models appear transiently.
    ModelNotFound { message: String, model: String },
    /// Connection failure (DNS, TLS, timeout, refused).
    Connection { message: String },
    /// Generic upstream error; `retryable` hints whether a retry
    /// might help (5xx → true, most 4xx → false).
    Api {
        message: String,
        status: u16,
        retryable: bool,
    },
}

impl ProxyError {
    /// Whether a retry could plausibly help.
    #[allow(dead_code)]
    pub fn retryable(&self) -> bool {
        match self {
            ProxyError::Auth { .. }
            | ProxyError::ContextOverflow { .. }
            | ProxyError::ModelNotFound { .. } => false,
            ProxyError::RateLimited { .. } | ProxyError::Connection { .. } => true,
            ProxyError::Api { retryable, .. } => *retryable,
        }
    }

    /// Classify an upstream HTTP status + body into a ProxyError.
    pub fn from_upstream(status: u16, body: &str, model: &str) -> Self {
        let msg = extract_error_message(body)
            .unwrap_or_else(|| status_label(status).to_string());
        match status {
            401 | 403 => ProxyError::Auth {
                message: msg,
                status,
            },
            413 => ProxyError::ContextOverflow { message: msg },
            429 => ProxyError::RateLimited { message: msg },
            404 => ProxyError::ModelNotFound {
                message: msg,
                model: model.to_string(),
            },
            s if (500..600).contains(&s) => ProxyError::Api {
                message: msg,
                status: s,
                retryable: true,
            },
            _ => ProxyError::Api {
                message: msg,
                status,
                retryable: false,
            },
        }
    }
}

/// Best-effort extraction of a human-readable message from an
/// upstream error body. Handles OpenAI/Anthropic/common JSON
/// shapes and falls back gracefully for HTML gateway pages.
fn extract_error_message(body: &str) -> Option<String> {
    let parsed: Value = serde_json::from_str(body).ok()?;
    let err_obj = parsed.get("error");

    // Code-based classification first (opencode-style), so a
    // `context_length_exceeded` code yields a friendly message
    // even when a generic `message` field is also present.
    if let Some(code) = err_obj.and_then(|e| e.get("code")).and_then(|c| c.as_str()) {
        match code {
            "context_length_exceeded" => {
                return Some("Input exceeds the model's context window".into())
            }
            "insufficient_quota" => {
                return Some("Quota exceeded. Check your plan and billing.".into())
            }
            _ => {}
        }
    }

    // OpenAI / Anthropic: { "error": { "message": "..." } }
    if let Some(msg) = err_obj
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
    {
        return Some(msg.to_string());
    }
    // Top-level message field.
    if let Some(msg) = parsed.get("message").and_then(|m| m.as_str()) {
        return Some(msg.to_string());
    }
    // { "error": "string" }
    if let Some(msg) = err_obj.and_then(|e| e.as_str()) {
        return Some(msg.to_string());
    }
    None
}

/// HTTP status → short label (mirrors node's http.STATUS_CODES).
fn status_label(status: u16) -> &'static str {
    match status {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        408 => "Request Timeout",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Upstream Error",
    }
}

// ── Connection test ─────────────────────────────────────────
//
// Replaces the frontend's simulated test. Sends a real, minimal
// request to verify the provider is reachable and the key works.
// Strategy (per protocol):
//   - OpenAI family: GET {base}/models  (cheap, list endpoint)
//   - Anthropic:     POST {base}/messages with a 1-token ping
// Returns Ok with the detected model count (when available), or
// a classified ProxyError.

/// Result of a connection test.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ProxyError>,
    /// Human-readable summary for a toast.
    pub message: String,
}

/// Lightweight model entry returned by provider model-list endpoints.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModelEntry {
    pub id: String,
    pub name: String,
}

/// Result of fetching provider models for UI-assisted model setup.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchModelsResult {
    pub success: bool,
    pub models: Vec<RemoteModelEntry>,
    pub message: String,
}

/// Test a provider connection. Uses the given flavor to pick a
/// protocol and sends a lightweight verification request.
pub async fn test_connection(
    flavor: &str,
    api_base: &str,
    api_key: &str,
    timeout_secs: u64,
) -> ConnectionTestResult {
    let protocol = resolve_protocol(flavor);
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ConnectionTestResult {
                success: false,
                model_count: None,
                error: Some(ProxyError::Connection {
                    message: format!("Failed to build HTTP client: {}", e),
                }),
                message: "无法创建 HTTP 客户端".into(),
            }
        }
    };

    // OpenAI family: try the /models list endpoint first (cheap).
    if matches!(protocol.flavor, ProtocolFlavor::OpenAi) {
        return test_openai_models(&client, api_base, api_key, protocol.auth).await;
    }

    // Anthropic: send a 1-token ping message.
    test_anthropic_ping(&client, api_base, api_key, &protocol).await
}

/// Fetch available models for providers that expose a standard
/// list endpoint. OpenAI-compatible APIs usually support
/// `GET /models`; Anthropic's public API does not provide an
/// equivalent model-list endpoint, so callers should fall back to
/// manual entry.
pub async fn fetch_models(
    flavor: &str,
    api_base: &str,
    api_key: &str,
    timeout_secs: u64,
) -> FetchModelsResult {
    let protocol = resolve_protocol(flavor);
    if !matches!(protocol.flavor, ProtocolFlavor::OpenAi) {
        return FetchModelsResult {
            success: false,
            models: vec![],
            message: "当前协议不支持自动拉取模型，请手动添加模型".into(),
        };
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return FetchModelsResult {
                success: false,
                models: vec![],
                message: format!("无法创建 HTTP 客户端: {}", e),
            }
        }
    };

    fetch_openai_models(&client, api_base, api_key, protocol.auth).await
}

/// Which protocol family a flavor maps to.
enum ProtocolFlavor {
    OpenAi,
    Anthropic,
}

struct ResolvedProtocol {
    flavor: ProtocolFlavor,
    auth: Auth,
    extra_headers: Vec<(String, String)>,
}

fn resolve_protocol(flavor: &str) -> ResolvedProtocol {
    match flavor {
        FLAVOR_ANTHROPIC => ResolvedProtocol {
            flavor: ProtocolFlavor::Anthropic,
            auth: AnthropicMessagesProtocol.auth(),
            extra_headers: AnthropicMessagesProtocol.extra_headers(),
        },
        _ => ResolvedProtocol {
            flavor: ProtocolFlavor::OpenAi,
            auth: OpenAiChatProtocol.auth(),
            extra_headers: vec![],
        },
    }
}

/// OpenAI-family test: GET {base}/models.
async fn test_openai_models(
    client: &reqwest::Client,
    api_base: &str,
    api_key: &str,
    auth: Auth,
) -> ConnectionTestResult {
    let base = api_base.trim_end_matches('/');
    let url = format!("{}/models", base);
    let (hname, hval) = auth.apply(api_key);

    let resp = match client.get(&url).header(&hname, &hval).send().await {
        Ok(r) => r,
        Err(e) => {
            return connection_failure(&e);
        }
    };
    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        let err = ProxyError::from_upstream(status, &body, "");
        return ConnectionTestResult {
            success: false,
            model_count: None,
            error: Some(err.clone()),
            message: err_message(&err),
        };
    }
    // Count models if the body is the expected { data: [...] } shape.
    let body = resp.text().await.unwrap_or_default();
    let model_count = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v.get("data").and_then(|d| d.as_array().map(|a| a.len())))
        .or(Some(0));

    ConnectionTestResult {
        success: true,
        model_count,
        error: None,
        message: match model_count {
            Some(n) if n > 0 => format!("连接成功，检测到 {} 个可用模型", n),
            _ => "连接成功".into(),
        },
    }
}

/// OpenAI-family model fetch: GET {base}/models and parse
/// `{ data: [{ id: "..." }] }`. Extra fields differ by provider,
/// so capability metadata stays user-editable in the frontend.
async fn fetch_openai_models(
    client: &reqwest::Client,
    api_base: &str,
    api_key: &str,
    auth: Auth,
) -> FetchModelsResult {
    let base = api_base.trim_end_matches('/');
    let url = format!("{}/models", base);
    let (hname, hval) = auth.apply(api_key);

    let resp = match client.get(&url).header(&hname, &hval).send().await {
        Ok(r) => r,
        Err(e) => {
            let result = connection_failure(&e);
            return FetchModelsResult {
                success: false,
                models: vec![],
                message: result.message,
            };
        }
    };

    let status = resp.status().as_u16();
    let body = resp.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        let err = ProxyError::from_upstream(status, &body, "");
        return FetchModelsResult {
            success: false,
            models: vec![],
            message: err_message(&err),
        };
    }

    let mut models = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.get("data").and_then(|d| {
                d.as_array().map(|items| {
                    items
                        .iter()
                        .filter_map(|item| {
                            let id = item.get("id").and_then(|v| v.as_str())?;
                            Some(RemoteModelEntry {
                                id: id.to_string(),
                                name: id.to_string(),
                            })
                        })
                        .collect::<Vec<_>>()
                })
            })
        })
        .unwrap_or_default();

    models.sort_by(|a, b| a.name.cmp(&b.name));
    models.dedup_by(|a, b| a.id == b.id);

    FetchModelsResult {
        success: true,
        message: if models.is_empty() {
            "接口已响应，但没有返回可识别的模型".into()
        } else {
            format!("已拉取 {} 个模型", models.len())
        },
        models,
    }
}

/// Anthropic test: POST {base}/messages with max_tokens:1.
async fn test_anthropic_ping(
    client: &reqwest::Client,
    api_base: &str,
    api_key: &str,
    protocol: &ResolvedProtocol,
) -> ConnectionTestResult {
    let base = api_base.trim_end_matches('/');
    let url = format!("{}/messages", base);
    let (hname, hval) = protocol.auth.apply(api_key);

    let body = serde_json::json!({
        "model": "claude-3-5-haiku-20241022",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "ping"}],
    });

    let mut req = client
        .post(&url)
        .header(&hname, &hval)
        .header("Content-Type", "application/json")
        .json(&body);
    for (name, value) in &protocol.extra_headers {
        req = req.header(name, value);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            return connection_failure(&e);
        }
    };
    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        let err = ProxyError::from_upstream(status, &body, "claude-3-5-haiku-20241022");
        return ConnectionTestResult {
            success: false,
            model_count: None,
            error: Some(err.clone()),
            message: err_message(&err),
        };
    }

    ConnectionTestResult {
        success: true,
        model_count: None,
        error: None,
        message: "连接成功".into(),
    }
}

/// Map a reqwest error to a Connection ProxyError + friendly message.
fn connection_failure(e: &reqwest::Error) -> ConnectionTestResult {
    let msg = if e.is_timeout() {
        "请求超时，请检查网络或增大超时设置".to_string()
    } else if e.is_connect() {
        "无法连接到服务器，请检查 API Base URL".to_string()
    } else {
        format!("连接失败: {}", e)
    };
    ConnectionTestResult {
        success: false,
        model_count: None,
        error: Some(ProxyError::Connection {
            message: format!("{}", e),
        }),
        message: msg,
    }
}

/// Human-readable Chinese summary for a ProxyError (toast text).
fn err_message(err: &ProxyError) -> String {
    match err {
        ProxyError::Auth { .. } => "认证失败，请检查 API Key".into(),
        ProxyError::ContextOverflow { .. } => "超出模型上下文窗口".into(),
        ProxyError::RateLimited { .. } => "请求过于频繁，已被限流".into(),
        ProxyError::ModelNotFound { model, .. } => {
            format!("模型不存在: {}", model)
        }
        ProxyError::Connection { .. } => "连接失败，请检查网络和 API Base".into(),
        ProxyError::Api { message, .. } => format!("上游错误: {}", message),
    }
}

// ── Profile listing (for the frontend dropdown) ─────────────

/// Serializable profile entry for IPC.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub flavor: String,
}

/// Return all profiles as IPC-friendly entries.
pub fn profile_entries() -> Vec<ProfileEntry> {
    PROFILES
        .iter()
        .map(|p| ProfileEntry {
            id: p.id.into(),
            label: p.label.into(),
            base_url: p.base_url.into(),
            flavor: p.flavor.into(),
        })
        .collect()
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── URL Building (no auto-/v1) ──────────────────────────

    #[test]
    fn test_openai_url_with_v1() {
        assert_eq!(
            OpenAiChatProtocol.build_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_openai_url_without_v1_not_auto_added() {
        assert_eq!(
            OpenAiChatProtocol.build_url("https://api.deepseek.com"),
            "https://api.deepseek.com/chat/completions"
        );
    }

    #[test]
    fn test_openai_url_strips_trailing_slash() {
        assert_eq!(
            OpenAiChatProtocol.build_url("https://api.openai.com/v1/"),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_anthropic_url_with_v1() {
        assert_eq!(
            AnthropicMessagesProtocol.build_url("https://api.anthropic.com/v1"),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn test_anthropic_url_without_v1_not_auto_added() {
        assert_eq!(
            AnthropicMessagesProtocol.build_url("https://api.anthropic.com"),
            "https://api.anthropic.com/messages"
        );
    }

    // ── Auth ────────────────────────────────────────────────

    #[test]
    fn test_bearer_auth() {
        let (n, v) = Auth::Bearer.apply("sk-test");
        assert_eq!(n, "Authorization");
        assert_eq!(v, "Bearer sk-test");
    }

    #[test]
    fn test_header_auth() {
        let (n, v) = Auth::Header("x-api-key").apply("sk-ant");
        assert_eq!(n, "x-api-key");
        assert_eq!(v, "sk-ant");
    }

    #[test]
    fn test_openai_protocol_auth_is_bearer() {
        assert!(matches!(OpenAiChatProtocol.auth(), Auth::Bearer));
    }

    #[test]
    fn test_anthropic_protocol_auth_is_header() {
        assert!(matches!(
            AnthropicMessagesProtocol.auth(),
            Auth::Header("x-api-key")
        ));
    }

    #[test]
    fn test_anthropic_extra_headers() {
        let h = AnthropicMessagesProtocol.extra_headers();
        assert!(h.contains(&("anthropic-version".into(), "2023-06-01".into())));
    }

    // ── Token Counting ─────────────────────────────────────

    #[test]
    fn test_openai_token_count_total() {
        assert_eq!(
            OpenAiChatProtocol.count_tokens(&json!({"usage": {"total_tokens": 150}})),
            150
        );
    }

    #[test]
    fn test_openai_token_count_split() {
        assert_eq!(
            OpenAiChatProtocol.count_tokens(&json!({
                "usage": {"prompt_tokens": 50, "completion_tokens": 100}
            })),
            150
        );
    }

    #[test]
    fn test_anthropic_token_count() {
        assert_eq!(
            AnthropicMessagesProtocol.count_tokens(&json!({
                "usage": {"input_tokens": 45, "output_tokens": 200}
            })),
            245
        );
    }

    // ── Resolve factory ────────────────────────────────────

    #[test]
    fn test_resolve_openai() {
        assert_eq!(resolve("openai").request_type(), "Chat Completion");
    }

    #[test]
    fn test_resolve_anthropic() {
        assert_eq!(resolve("anthropic").request_type(), "Anthropic");
    }

    #[test]
    fn test_resolve_openai_compat() {
        assert_eq!(
            resolve("openai-compatible").request_type(),
            "Chat Completion"
        );
    }

    #[test]
    fn test_resolve_responses() {
        assert_eq!(resolve("responses").request_type(), "Responses");
    }

    #[test]
    fn test_resolve_fallback_to_openai() {
        assert_eq!(resolve("unknown-custom").request_type(), "Chat Completion");
    }

    // ── Profiles ───────────────────────────────────────────

    #[test]
    fn test_profiles_include_common_providers() {
        let ids: Vec<_> = PROFILES.iter().map(|p| p.id).collect();
        // Every opencode-documented provider must have a profile.
        // (https://opencode.ai/docs/providers/) — all 40, including
        // cloud platforms that use account-specific base URLs.
        for required in [
            // Native
            "openai",
            "anthropic",
            // OpenAI-compatible (opencode profiles + common)
            "deepseek",
            "openrouter",
            "groq",
            "xai",
            "togetherai",
            "fireworks",
            "cerebras",
            "deepinfra",
            "baseten",
            "302ai",
            "moonshot",
            "minimax",
            "huggingface",
            "zai",
            "ionet",
            "nebius",
            "cortecs",
            "stackit",
            "ovhcloud",
            "scaleway",
            "helicone",
            "frogbot",
            "venice",
            // Local runtimes
            "ollama",
            "ollama-cloud",
            "lmstudio",
            "llamacpp",
            "vllm",
            "atomic-chat",
            // Cloud platforms (account-specific base URL)
            "amazon-bedrock",
            "azure-openai",
            "azure-cognitive-services",
            "google-vertex",
            "github-copilot",
            "gitlab-duo",
            "sap-ai-core",
            "cloudflare-ai-gateway",
            "vercel-ai-gateway",
            "zenmux",
            "opencode-zen",
        ] {
            assert!(ids.contains(&required), "missing profile: {}", required);
        }
    }

    #[test]
    fn test_profiles_count_matches_opencode_coverage() {
        // opencode documents 40 providers (excluding the "凭据"/"配置"
        // section headers). We cover all of them.
        assert!(
            PROFILES.len() >= 40,
            "expected >=40 profiles for full opencode coverage, got {}",
            PROFILES.len()
        );
    }

    #[test]
    fn test_profile_by_id() {
        assert_eq!(profile_by_id("deepseek").unwrap().label, "DeepSeek");
        assert!(profile_by_id("nonexistent").is_none());
    }

    #[test]
    fn test_profile_entries_serializable() {
        let entries = profile_entries();
        assert!(!entries.is_empty());
        assert!(entries.iter().all(|e| !e.id.is_empty()));
    }

    // ── Error classification ───────────────────────────────

    #[test]
    fn test_error_auth_401() {
        let err = ProxyError::from_upstream(401, "", "");
        assert!(matches!(err, ProxyError::Auth { .. }));
        assert!(!err.retryable());
    }

    #[test]
    fn test_error_rate_limited_429() {
        let err = ProxyError::from_upstream(429, "", "");
        assert!(matches!(err, ProxyError::RateLimited { .. }));
        assert!(err.retryable());
    }

    #[test]
    fn test_error_model_not_found_404() {
        let err = ProxyError::from_upstream(404, "", "gpt-99");
        assert!(matches!(err, ProxyError::ModelNotFound { .. }));
        assert!(!err.retryable());
    }

    #[test]
    fn test_error_server_5xx_retryable() {
        let err = ProxyError::from_upstream(503, "", "");
        assert!(matches!(
            err,
            ProxyError::Api {
                retryable: true,
                ..
            }
        ));
        assert!(err.retryable());
    }

    #[test]
    fn test_error_context_overflow_413() {
        let err = ProxyError::from_upstream(413, "", "");
        assert!(matches!(err, ProxyError::ContextOverflow { .. }));
        assert!(!err.retryable());
    }

    #[test]
    fn test_error_extracts_openai_message() {
        let body = r#"{"error":{"message":"Incorrect API key","type":"invalid_request_error"}}"#;
        let err = ProxyError::from_upstream(401, body, "");
        match err {
            ProxyError::Auth { message, .. } => assert_eq!(message, "Incorrect API key"),
            _ => panic!("expected Auth"),
        }
    }

    #[test]
    fn test_error_extracts_context_length_code() {
        let body =
            r#"{"error":{"code":"context_length_exceeded","message":"too long"}}"#;
        let err = ProxyError::from_upstream(400, body, "");
        // 400 falls into the generic Api branch, but message extraction
        // should still surface the friendly code message.
        match err {
            ProxyError::Api { message, .. } => {
                assert!(message.contains("context window"));
            }
            _ => panic!("expected Api"),
        }
    }

    #[test]
    fn test_error_falls_back_to_status_label() {
        let err = ProxyError::from_upstream(418, "not json", "");
        match err {
            ProxyError::Api {
                message, status, ..
            } => {
                assert_eq!(status, 418);
                assert_eq!(message, "Upstream Error");
            }
            _ => panic!("expected Api"),
        }
    }
}
