// ═══════════════════════════════════════════════════════════════
// Melody Hub — Request routing
// ═══════════════════════════════════════════════════════════════
// Resolves an incoming `model` field to a concrete (provider,
// model) pair, applying aggregation strategies. Strategies are
// matched via the stable [`RoutingStrategy`] enum — never via
// localized substring matching.
// ═══════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::RwLock;

use crate::types::{Aggregation, Model, Provider, RoutingStrategy};

/// Result of routing a request: the target provider, the concrete
/// model name, and (if matched via aggregation) the aggregation
/// name so the caller can advance its round-robin cursor.
pub struct RouteResult {
    pub provider: Provider,
    pub model: String,
    pub aggregation_name: Option<String>,
}

/// Mutable routing state: configured providers + aggregations,
/// per-aggregation round-robin cursors, and per-model latency
/// history used by the lowest-latency strategy.
pub struct RoutingState {
    pub providers: Vec<Provider>,
    pub aggregations: Vec<Aggregation>,
    pub round_robin_index: HashMap<String, usize>,
    pub latency_history: HashMap<String, Vec<f64>>,
}

impl RoutingState {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            aggregations: Vec::new(),
            round_robin_index: HashMap::new(),
            latency_history: HashMap::new(),
        }
    }
}

pub type SharedRouting = Arc<RwLock<RoutingState>>;

/// Split an aggregation's comma-separated model list into trimmed names.
pub fn parse_agg_models(models: &str) -> Vec<String> {
    models
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Route a `model_or_agg` request to a concrete provider + model.
pub async fn route_request(
    state: &SharedRouting,
    model_or_agg: &str,
) -> Result<RouteResult, String> {
    let cfg = state.read().await;

    // 1. Direct match by model name OR alias — round-robin
    //    across all providers that offer the same model.
    let direct_hits: Vec<_> = cfg
        .providers
        .iter()
        .flat_map(|p| p.models.iter().map(move |m| (p, m)))
        .filter(|(_, m)| m.name == model_or_agg || m.alias.as_deref() == Some(model_or_agg))
        .map(|(p, m)| (p.clone(), m.name.clone()))
        .collect();

    if !direct_hits.is_empty() {
        let rr_key = format!("direct:{}", model_or_agg);
        let idx = cfg.round_robin_index.get(&rr_key).copied().unwrap_or(0);
        let (provider, model) = direct_hits[idx % direct_hits.len()].clone();
        return Ok(RouteResult {
            provider,
            model,
            aggregation_name: None,
        });
    }

    // 2. Aggregation match.
    let agg = cfg
        .aggregations
        .iter()
        .find(|a| a.enabled && a.name == model_or_agg)
        .cloned();

    match agg {
        Some(aggregation) => {
            let model_names = parse_agg_models(&aggregation.models);
            if model_names.is_empty() {
                return Err("Aggregation has no models".into());
            }

            let picked = pick_model(
                aggregation.strategy_enum(),
                &aggregation.name,
                &model_names,
                &cfg,
            );

            for provider in &cfg.providers {
                for model in &provider.models {
                    // Match by name or alias so aggregation entries
                    // can reference either the real name or an alias.
                    if model.name == picked || model.alias.as_deref() == Some(&picked) {
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

/// Pick a model from `model_names` according to `strategy`.
fn pick_model(
    strategy: RoutingStrategy,
    agg_name: &str,
    model_names: &[String],
    cfg: &RoutingState,
) -> String {
    match strategy {
        RoutingStrategy::Random => {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos() as usize;
            let idx = nanos % model_names.len();
            model_names[idx].clone()
        }
        RoutingStrategy::LowestLatency => {
            let mut best = model_names[0].clone();
            let mut best_latency = f64::MAX;
            for name in model_names {
                let avg = cfg
                    .latency_history
                    .get(name)
                    .map(|v| v.iter().sum::<f64>() / v.len() as f64)
                    .unwrap_or(0.0);
                if avg < best_latency && avg > 0.0 {
                    best_latency = avg;
                    best = name.clone();
                }
            }
            best
        }
        RoutingStrategy::Sequential => model_names[0].clone(),
        RoutingStrategy::RoundRobin => {
            let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
            let len = model_names.len();
            model_names[idx % len].clone()
        }
    }
}

/// After a request completes, advance the matched aggregation's
/// round-robin cursor and update the model's latency history.
pub async fn record_routing_side_effects(
    state: &SharedRouting,
    aggregation_name: &Option<String>,
    model: &str,
    latency_ms: i64,
) {
    let mut cfg = state.write().await;

    // Advance round-robin cursor.
    if let Some(agg_name) = aggregation_name {
        // Aggregation: advance its dedicated cursor.
        if let Some(agg) = cfg.aggregations.iter().find(|a| a.name == *agg_name) {
            let model_names = parse_agg_models(&agg.models);
            if !model_names.is_empty() {
                let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
                let next = (idx + 1) % model_names.len();
                cfg.round_robin_index.insert(agg_name.clone(), next);
            }
        }
    } else {
        // Direct mapping: advance the per-model cursor so that
        // multiple providers offering the same model take turns.
        let rr_key = format!("direct:{}", model);
        // Count how many providers offer this model (by name or alias).
        let count = cfg
            .providers
            .iter()
            .flat_map(|p| p.models.iter())
            .filter(|m| m.name == model || m.alias.as_deref() == Some(model))
            .count();
        if count > 1 {
            let idx = cfg.round_robin_index.get(&rr_key).copied().unwrap_or(0);
            let next = (idx + 1) % count;
            cfg.round_robin_index.insert(rr_key, next);
        }
    }

    // Update latency history (keep last 100 per model).
    let history = cfg.latency_history.entry(model.to_string()).or_default();
    history.push(latency_ms as f64);
    if history.len() > 100 {
        let drain = history.len() - 100;
        history.drain(0..drain);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_state() -> SharedRouting {
        Arc::new(RwLock::new(RoutingState::new()))
    }

    #[tokio::test]
    async fn direct_model_match_advances_direct_rr() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.round_robin_index.insert("agg-1".into(), 0);
            cfg.aggregations.push(Aggregation {
                id: "a1".into(),
                name: "agg-1".into(),
                models: "gpt-4".into(),
                strategy: "round-robin".into(),
                priority: "P0".into(),
                enabled: true,
            });
        }

        // Direct mapping with a single provider should NOT advance.
        record_routing_side_effects(&state, &None, "gpt-4", 500).await;

        let cfg = state.read().await;
        assert_eq!(cfg.round_robin_index.get("agg-1"), Some(&0));
        // No direct RR key created because only 0 providers match in this empty state.
        assert_eq!(cfg.round_robin_index.get("direct:gpt-4"), None);
    }

    #[tokio::test]
    async fn direct_rr_rotates_across_providers() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            // Two providers offering the same model name.
            for id in ["p1", "p2"] {
                cfg.providers.push(Provider {
                    id: id.into(),
                    name: format!("Provider {}", id),
                    api_base: "https://example.com".into(),
                    api_key: "key".into(),
                    status: "connected".into(),
                    models: vec![Model {
                        id: format!("{}-m1", id),
                        name: "gpt-4".into(),
                        alias: None,
                        context_window: None,
                        max_output_tokens: None,
                        supports_vision: false,
                        supports_reasoning: false,
                        supports_reasoning_effort: false,
                        default_reasoning_effort: None,
                    }],
                    api_flavor: "openai".into(),
                    api_key_encrypted: false,
                });
            }
        }

        // First request → provider 0.
        let r1 = route_request(&state, "gpt-4").await.unwrap();
        // After completion, cursor advances to 1.
        record_routing_side_effects(&state, &None, "gpt-4", 100).await;

        // Second request → provider 1.
        let r2 = route_request(&state, "gpt-4").await.unwrap();
        // After completion, cursor wraps to 0.
        record_routing_side_effects(&state, &None, "gpt-4", 100).await;

        // Third request → provider 0 again.
        let r3 = route_request(&state, "gpt-4").await.unwrap();

        assert_ne!(r1.provider.id, r2.provider.id);
        assert_eq!(r1.provider.id, r3.provider.id);
    }

    #[tokio::test]
    async fn rr_advances_only_matched_aggregation() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.round_robin_index.insert("agg-1".into(), 0);
            cfg.round_robin_index.insert("agg-2".into(), 0);
            cfg.aggregations.push(Aggregation {
                id: "a1".into(),
                name: "agg-1".into(),
                models: "gpt-4, gpt-4o".into(),
                strategy: "round-robin".into(),
                priority: "P0".into(),
                enabled: true,
            });
            cfg.aggregations.push(Aggregation {
                id: "a2".into(),
                name: "agg-2".into(),
                models: "claude-3".into(),
                strategy: "round-robin".into(),
                priority: "P1".into(),
                enabled: true,
            });
        }

        record_routing_side_effects(&state, &Some("agg-1".into()), "gpt-4", 500).await;

        let cfg = state.read().await;
        assert_eq!(cfg.round_robin_index.get("agg-1"), Some(&1));
        assert_eq!(cfg.round_robin_index.get("agg-2"), Some(&0));
    }

    #[test]
    fn strategy_from_stored_handles_legacy_labels() {
        assert_eq!(
            RoutingStrategy::from_stored("round-robin"),
            RoutingStrategy::RoundRobin
        );
        assert_eq!(
            RoutingStrategy::from_stored("轮询 (Round Robin)"),
            RoutingStrategy::RoundRobin
        );
        assert_eq!(
            RoutingStrategy::from_stored("随机"),
            RoutingStrategy::Random
        );
        assert_eq!(
            RoutingStrategy::from_stored("最低延迟"),
            RoutingStrategy::LowestLatency
        );
        assert_eq!(
            RoutingStrategy::from_stored("顺序"),
            RoutingStrategy::Sequential
        );
    }

    #[test]
    fn strategy_as_key_round_trips() {
        for s in [
            RoutingStrategy::RoundRobin,
            RoutingStrategy::LowestLatency,
            RoutingStrategy::Random,
            RoutingStrategy::Sequential,
        ] {
            assert_eq!(RoutingStrategy::from_stored(s.as_key()), s);
        }
    }
}
