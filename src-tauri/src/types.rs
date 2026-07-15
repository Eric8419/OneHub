// ═══════════════════════════════════════════════════════════════
// Melody Hub — Shared domain types
// ═══════════════════════════════════════════════════════════════
// All structs crossing the Tauri IPC boundary use camelCase serde
// so the frontend TypeScript types mirror the wire format exactly,
// eliminating the manual field-renaming that previously lived in
// the Zustand stores.
// ═══════════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};

// ── Routing Strategy (enum, not localized strings) ──────────

/// Machine-stable routing strategy. Stored on disk as the enum
/// key (e.g. "round-robin"); the UI layer maps to localized
/// labels. This replaces the fragile `s.contains("随机")` matching.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingStrategy {
    #[default]
    RoundRobin,
    LowestLatency,
    Random,
    Sequential,
}

impl RoutingStrategy {
    /// Parse a strategy from a stored value, accepting both the
    /// new kebab-case keys and the legacy localized labels so old
    /// persisted aggregations keep working after upgrade.
    pub fn from_stored(value: &str) -> Self {
        match value {
            "round-robin" => RoutingStrategy::RoundRobin,
            "lowest-latency" => RoutingStrategy::LowestLatency,
            "random" => RoutingStrategy::Random,
            "sequential" => RoutingStrategy::Sequential,
            // Legacy localized labels (pre-refactor data)
            s if s.contains("随机") => RoutingStrategy::Random,
            s if s.contains("最低延迟") => RoutingStrategy::LowestLatency,
            s if s.contains("顺序") => RoutingStrategy::Sequential,
            // Default fallback (covers "轮询 (Round Robin)" etc.)
            _ => RoutingStrategy::RoundRobin,
        }
    }

    /// Serialize back to the stable kebab-case key.
    #[allow(dead_code)]
    pub fn as_key(&self) -> &'static str {
        match self {
            RoutingStrategy::RoundRobin => "round-robin",
            RoutingStrategy::LowestLatency => "lowest-latency",
            RoutingStrategy::Random => "random",
            RoutingStrategy::Sequential => "sequential",
        }
    }
}

// ── Provider ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub name: String,
    /// Optional alias. When set, clients can call this alias
    /// instead of the real model name; the proxy resolves the
    /// alias back to `name` before forwarding upstream.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_output_tokens: Option<u32>,
    #[serde(default)]
    pub supports_vision: bool,
    #[serde(default)]
    pub supports_reasoning: bool,
    #[serde(default)]
    pub supports_reasoning_effort: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_reasoning_effort: Option<String>,
    /// Whether the model supports OpenAI-style function/tool calls.
    #[serde(default)]
    pub supports_tool_calls: bool,
    /// Whether the model supports `response_format: { type:
    /// "json_object" }` (JSON mode).
    #[serde(default)]
    pub supports_json_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub api_base: String,
    /// Plaintext in memory; encrypted form on disk. The
    /// `api_key_encrypted` flag marks whether the on-disk value
    /// is ciphertext (replaces the old `starts_with("sk-")`
    /// heuristic).
    pub api_key: String,
    pub status: String,
    pub models: Vec<Model>,
    #[serde(default = "default_flavor")]
    pub api_flavor: String,
    /// True when `api_key` holds ciphertext (disk form). Always
    /// false for in-memory/runtime values returned to the UI.
    #[serde(default)]
    pub api_key_encrypted: bool,
}

fn default_flavor() -> String {
    "openai-compatible".into()
}

impl Provider {
    /// Return a copy with the api_key marked as encrypted. Used
    /// before writing the disk form.
    pub fn with_encrypted_key(mut self, encrypted_key: String) -> Self {
        self.api_key = encrypted_key;
        self.api_key_encrypted = true;
        self
    }

    /// Return a copy with a plaintext api_key marked as not
    /// encrypted. Used after decrypting the disk form.
    pub fn with_plaintext_key(mut self, plaintext_key: String) -> Self {
        self.api_key = plaintext_key;
        self.api_key_encrypted = false;
        self
    }
}

// ── Aggregation ─────────────────────────────────────────────

/// On-disk aggregation. `strategy` is serialized as the enum key
/// (kebab-case). Legacy localized strings are tolerated on load
/// via [`RoutingStrategy::from_stored`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aggregation {
    pub id: String,
    pub name: String,
    /// Comma-separated model names.
    pub models: String,
    /// Serialized [`RoutingStrategy`] key. Kept as a String for
    /// forward-compat (unknown values fall back to RoundRobin).
    #[serde(default)]
    pub strategy: String,
    pub priority: String,
    pub enabled: bool,
}

impl Aggregation {
    pub fn strategy_enum(&self) -> RoutingStrategy {
        RoutingStrategy::from_stored(&self.strategy)
    }
}

// ── Request Record (stats) ─────────────────────────────────
//
// Now camelCase so the frontend `RequestRecord` type matches the
// wire format directly. `latency_ms` is numeric (the frontend
// previously declared `latency: string` and reformatted — that
// conversion now lives in a dedicated display helper).

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestRecord {
    pub id: String,
    pub timestamp: String,
    pub model: String,
    pub provider: String,
    /// "Chat Completion" / "Anthropic" / "<type> (streaming)".
    #[serde(rename = "type")]
    pub r#type: String,
    pub tokens: i64,
    pub status: String,
    pub latency_ms: i64,
    #[serde(default)]
    pub error_category: String,
}

// ── Proxy Status ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub uptime_secs: u64,
}

// ── Stats (aggregated) ──────────────────────────────────────
//
// Aggregated usage stats returned to the dashboard. camelCase so
// the frontend no longer needs `s.total_tokens` → `totalTokens`
// remapping.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub total_tokens: i64,
    pub total_requests: i64,
    pub active_models: i32,
    pub avg_response_time: f64,
    pub token_change: f64,
    pub request_change: f64,
    pub response_time_change: f64,
    pub response_time_trend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub count: i64,
    pub tokens: i64,
}
