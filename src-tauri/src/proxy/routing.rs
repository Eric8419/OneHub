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

use crate::types::{Aggregation, Provider, RoutingStrategy};

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

    // 1. Direct model match (model name → provider).
    let direct_hit = cfg
        .providers
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

    // Advance round-robin only for the matched aggregation.
    if let Some(agg_name) = aggregation_name {
        if let Some(agg) = cfg.aggregations.iter().find(|a| a.name == *agg_name) {
            let model_names = parse_agg_models(&agg.models);
            if !model_names.is_empty() {
                let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
                let next = (idx + 1) % model_names.len();
                cfg.round_robin_index.insert(agg_name.clone(), next);
            }
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
    async fn direct_model_match_does_not_advance_rr() {
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

        record_routing_side_effects(&state, &None, "gpt-4", 500).await;

        let cfg = state.read().await;
        assert_eq!(cfg.round_robin_index.get("agg-1"), Some(&0));
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
