use serde::{Deserialize, Serialize};

// ── Provider ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub api_base: String,
    pub api_key: String,
    pub status: String,
    pub models: Vec<Model>,
}

// ── Aggregation ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aggregation {
    pub id: String,
    pub name: String,
    pub models: String,
    pub strategy: String,
    pub priority: String,
    pub enabled: bool,
}

// ── Request Record (stats) ─────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestRecord {
    pub id: String,
    pub timestamp: String,
    pub model: String,
    pub provider: String,
    pub r#type: String,
    pub tokens: i64,
    pub status: String,
    pub latency_ms: i64,
    #[serde(default)]
    pub error_category: String,
}

// ── Proxy Status ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub uptime_secs: u64,
}
