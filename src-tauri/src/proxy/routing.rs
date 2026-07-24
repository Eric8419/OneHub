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
use std::time::Instant;

use tokio::sync::RwLock;

use crate::types::{Aggregation, Model, Provider, RoutingStrategy};

/// Capabilities a request needs from a model. Used by the router
/// to skip providers whose models don't support the required
/// features (e.g. tool calls, vision, JSON mode).
#[derive(Debug, Clone, Default)]
pub struct RequestCapabilities {
    pub needs_tools: bool,
    pub needs_vision: bool,
    pub needs_json_mode: bool,
    pub needs_reasoning: bool,
}

impl RequestCapabilities {
    /// Check if a model satisfies all required capabilities.
    /// A capability marked as `false` in the request is always
    /// satisfied (no requirement).
    pub fn is_satisfied_by(&self, model: &Model) -> bool {
        if self.needs_tools && !model.supports_tool_calls {
            return false;
        }
        if self.needs_vision && !model.supports_vision {
            return false;
        }
        if self.needs_json_mode && !model.supports_json_mode {
            return false;
        }
        if self.needs_reasoning && !model.supports_reasoning {
            return false;
        }
        true
    }
}

/// Result of routing a request: the target provider, the concrete
/// model name, and (if matched via aggregation) the aggregation
/// name so the caller can advance its round-robin cursor.
pub struct RouteResult {
    pub provider: Provider,
    /// The original model name requested by the client (used for
    /// metrics/display).
    pub model: String,
    /// The model name to send to the upstream provider after
    /// applying the provider's `model_mapping`. May differ from
    /// `model` when a mapping rule matched.
    pub upstream_model: String,
    pub aggregation_name: Option<String>,
    /// Wire protocol expected by the selected target.
    pub outbound_flavor: String,
    /// Explicit target id, or `None` for legacy/direct routing.
    pub target_id: Option<String>,
    pub timeout_secs: Option<u64>,
    pub max_retries: Option<u32>,
}

/// Runtime health state for a single provider. Used for circuit
/// breaking and rate-limit cooldowns. Stored in memory only;
/// resets on restart.
#[derive(Debug, Clone, Default)]
pub struct ProviderHealth {
    /// When set, the provider is temporarily unschedulable until
    /// this instant. Set on consecutive failures or auth errors.
    pub temp_unschedulable_until: Option<Instant>,
    /// When set, the provider is rate-limited until this instant.
    /// Set when upstream returns 429.
    pub rate_limit_reset_at: Option<Instant>,
    /// Consecutive failure count (reset on success). After 3,
    /// `temp_unschedulable_until` is set.
    pub consecutive_failures: u32,
    /// Current in-flight request count for this provider.
    pub in_flight: u32,
}

/// Error types that affect provider health.
#[derive(Debug, Clone, Copy)]
pub enum HealthErrorKind {
    /// 429 Too Many Requests.
    RateLimit,
    /// 5xx server error or connection/timeout failure.
    ServerError,
    /// 401/403 authentication failure.
    AuthError,
}

impl ProviderHealth {
    /// Check if this provider is currently available for scheduling.
    /// A provider is unavailable if it's temp-unschedulable or
    /// rate-limited (and the cooldown hasn't expired yet).
    pub fn is_available(&self) -> bool {
        let now = Instant::now();
        if let Some(until) = self.temp_unschedulable_until {
            if now < until {
                return false;
            }
        }
        if let Some(until) = self.rate_limit_reset_at {
            if now < until {
                return false;
            }
        }
        true
    }

    /// Mark this provider as having experienced an error.
    /// Updates cooldown timers based on error type.
    pub fn mark_unhealthy(&mut self, kind: HealthErrorKind) {
        let now = Instant::now();
        match kind {
            HealthErrorKind::RateLimit => {
                // Cool down for 60 seconds on rate limit.
                self.rate_limit_reset_at =
                    Some(now + std::time::Duration::from_secs(60));
            }
            HealthErrorKind::ServerError => {
                self.consecutive_failures += 1;
                // After 3 consecutive failures, circuit-break for 30s.
                if self.consecutive_failures >= 3 {
                    self.temp_unschedulable_until =
                        Some(now + std::time::Duration::from_secs(30));
                }
            }
            HealthErrorKind::AuthError => {
                // Auth errors need user intervention; cool down 5 min.
                self.temp_unschedulable_until =
                    Some(now + std::time::Duration::from_secs(300));
            }
        }
    }

    /// Mark this provider as healthy (reset failure count).
    pub fn mark_healthy(&mut self) {
        self.consecutive_failures = 0;
    }

    /// Increment in-flight count.
    pub fn acquire_slot(&mut self) {
        self.in_flight += 1;
    }

    /// Decrement in-flight count.
    pub fn release_slot(&mut self) {
        if self.in_flight > 0 {
            self.in_flight -= 1;
        }
    }
}

/// Mutable routing state: configured providers + aggregations,
/// per-aggregation round-robin cursors, and per-model latency
/// history used by the lowest-latency strategy.
pub struct RoutingState {
    pub providers: Vec<Provider>,
    pub aggregations: Vec<Aggregation>,
    pub round_robin_index: HashMap<String, usize>,
    pub latency_history: HashMap<String, Vec<f64>>,
    /// Per-provider health state, keyed by provider id.
    pub provider_health: HashMap<String, ProviderHealth>,
}

impl RoutingState {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            aggregations: Vec::new(),
            round_robin_index: HashMap::new(),
            latency_history: HashMap::new(),
            provider_health: HashMap::new(),
        }
    }
}

pub type SharedRouting = Arc<RwLock<RoutingState>>;

/// Check if a provider is currently available for scheduling
/// (not excluded, not in cooldown).
pub fn is_provider_available(
    state: &RoutingState,
    provider_id: &str,
    excluded: &std::collections::HashSet<String>,
) -> bool {
    if excluded.contains(provider_id) {
        return false;
    }
    state
        .provider_health
        .get(provider_id)
        .map(|h| h.is_available())
        .unwrap_or(true) // No health record = healthy
}

/// Mark a provider as unhealthy after an error. Creates the health
/// entry if it doesn't exist yet.
pub async fn mark_provider_unhealthy(
    state: &SharedRouting,
    provider_id: &str,
    kind: HealthErrorKind,
) {
    let mut cfg = state.write().await;
    let health = cfg
        .provider_health
        .entry(provider_id.to_string())
        .or_default();
    health.mark_unhealthy(kind);
}

/// Mark a provider as healthy after a successful request.
pub async fn mark_provider_healthy(state: &SharedRouting, provider_id: &str) {
    let mut cfg = state.write().await;
    let health = cfg
        .provider_health
        .entry(provider_id.to_string())
        .or_default();
    health.mark_healthy();
}

/// Increment the in-flight request count for a provider.
pub async fn acquire_provider_slot(state: &SharedRouting, provider_id: &str) {
    let mut cfg = state.write().await;
    let health = cfg
        .provider_health
        .entry(provider_id.to_string())
        .or_default();
    health.acquire_slot();
}

/// Decrement the in-flight request count for a provider.
pub async fn release_provider_slot(state: &SharedRouting, provider_id: &str) {
    let mut cfg = state.write().await;
    if let Some(health) = cfg.provider_health.get_mut(provider_id) {
        health.release_slot();
    }
}

/// Split an aggregation's comma-separated model list into trimmed names.
pub fn parse_agg_models(models: &str) -> Vec<String> {
    models
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Resolve a requested model name through a provider's `model_mapping`.
///
/// Matching priority:
/// 1. Exact key match in the mapping table.
/// 2. Longest wildcard prefix match (keys ending with `*`).
/// 3. No match → passthrough (return the original name).
///
/// Mirrors sub2api's `resolveRequestedModelInMapping` +
/// `matchWildcardMappingResult` logic.
pub fn resolve_model_mapping(provider: &Provider, requested: &str) -> String {
    let Some(mapping) = provider.model_mapping.as_ref() else {
        return requested.to_string();
    };
    if mapping.is_empty() {
        return requested.to_string();
    }

    // 1. Exact match.
    if let Some(target) = mapping.get(requested) {
        return target.clone();
    }

    // 2. Wildcard match — collect all matching patterns, pick the
    //    longest pattern (most specific), tie-break alphabetically.
    let mut best: Option<(&str, &str)> = None;
    for (pattern, target) in mapping.iter() {
        if let Some(prefix) = pattern.strip_suffix('*') {
            if requested.starts_with(prefix) {
                match best {
                    None => best = Some((pattern, target)),
                    Some((bp, _)) => {
                        // Longer pattern wins; tie-break alphabetically.
                        if pattern.len() > bp.len()
                            || (pattern.len() == bp.len() && pattern.as_str() < bp)
                        {
                            best = Some((pattern, target));
                        }
                    }
                }
            }
        }
    }
    if let Some((_, target)) = best {
        return target.to_string();
    }

    // 3. Passthrough.
    requested.to_string()
}

/// Route a `model_or_agg` request to a concrete provider + model.
/// Providers in `excluded_providers` and those in health cooldown
/// are skipped. Models that don't satisfy `capabilities` are also
/// skipped. Providers whose `api_flavor` is not compatible with
/// `inbound_flavor` are skipped (native passthrough only).
/// Returns an error if no available provider is found.
pub async fn route_request(
    state: &SharedRouting,
    model_or_agg: &str,
    excluded_providers: &std::collections::HashSet<String>,
    capabilities: &RequestCapabilities,
    inbound_flavor: &str,
) -> Result<RouteResult, String> {
    let cfg = state.read().await;

    // 1. Direct match by model name OR alias - round-robin
    //    across all providers that offer the same model.
    //    Filter out excluded, unhealthy, protocol-incompatible,
    //    and capability-mismatched.
    let direct_hits: Vec<_> = cfg
        .providers
        .iter()
        .flat_map(|p| p.models.iter().map(move |m| (p, m)))
        .filter(|(_, m)| {
            m.name == model_or_agg || m.alias.as_deref() == Some(model_or_agg)
        })
        .filter(|(p, _)| is_provider_available(&cfg, &p.id, excluded_providers))
        .filter(|(p, _)| {
            crate::proxy::adapter::is_protocol_compatible(inbound_flavor, &p.api_flavor)
        })
        .filter(|(_, m)| capabilities.is_satisfied_by(m))
        .map(|(p, m)| (p.clone(), m.name.clone()))
        .collect();

    if !direct_hits.is_empty() {
        let rr_key = format!("direct:{}", model_or_agg);
        let idx = cfg.round_robin_index.get(&rr_key).copied().unwrap_or(0);
        let (provider, model) = direct_hits[idx % direct_hits.len()].clone();
        let upstream_model = resolve_model_mapping(&provider, &model);
        return Ok(RouteResult {
            outbound_flavor: provider.api_flavor.clone(),
            provider,
            model,
            upstream_model,
            aggregation_name: None,
            target_id: None,
            timeout_secs: None,
            max_retries: None,
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
            if !aggregation.targets.is_empty() {
                let mut candidates = Vec::new();
                for target in aggregation
                    .targets
                    .iter()
                    .filter(|target| target.enabled && target.weight > 0)
                {
                    let Some(provider) = cfg
                        .providers
                        .iter()
                        .find(|provider| provider.id == target.provider_id)
                    else {
                        continue;
                    };
                    if !is_provider_available(&cfg, &provider.id, excluded_providers) {
                        continue;
                    }
                    let Some(model) = provider.models.iter().find(|model| {
                        model.name == target.model
                            || model.alias.as_deref() == Some(target.model.as_str())
                    }) else {
                        continue;
                    };
                    if !capabilities.is_satisfied_by(model) {
                        continue;
                    }
                    let outbound_flavor = target
                        .protocol
                        .clone()
                        .unwrap_or_else(|| provider.api_flavor.clone());
                    if !crate::proxy::adapter::is_protocol_compatible(
                        inbound_flavor,
                        &outbound_flavor,
                    ) {
                        continue;
                    }
                    candidates.push((
                        target.clone(),
                        provider.clone(),
                        model.clone(),
                        outbound_flavor,
                    ));
                }

                let Some(highest_priority) = candidates
                    .iter()
                    .map(|(target, _, _, _)| target.priority)
                    .max()
                else {
                    return Err(format!(
                        "No available target for aggregation '{}'",
                        aggregation.name
                    ));
                };
                candidates
                    .retain(|(target, _, _, _)| target.priority == highest_priority);

                let weighted_indices: Vec<usize> = candidates
                    .iter()
                    .enumerate()
                    .flat_map(|(index, (target, _, _, _))| {
                        std::iter::repeat_n(index, target.weight as usize)
                    })
                    .collect();
                let picked_index = match aggregation.strategy_enum() {
                    RoutingStrategy::Random => {
                        let nanos = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .subsec_nanos() as usize;
                        weighted_indices[nanos % weighted_indices.len()]
                    }
                    RoutingStrategy::LowestLatency => candidates
                        .iter()
                        .enumerate()
                        .min_by(|(_, (_, _, left, _)), (_, (_, _, right, _))| {
                            average_latency(&cfg, &left.name)
                                .total_cmp(&average_latency(&cfg, &right.name))
                        })
                        .map(|(index, _)| index)
                        .unwrap_or(0),
                    RoutingStrategy::Sequential => 0,
                    RoutingStrategy::RoundRobin => {
                        let cursor = cfg
                            .round_robin_index
                            .get(&aggregation.name)
                            .copied()
                            .unwrap_or(0);
                        weighted_indices[cursor % weighted_indices.len()]
                    }
                };
                let (target, provider, model, outbound_flavor) =
                    candidates.swap_remove(picked_index);
                let upstream_model = target
                    .upstream_model
                    .clone()
                    .unwrap_or_else(|| resolve_model_mapping(&provider, &model.name));
                return Ok(RouteResult {
                    provider,
                    model: model.name,
                    upstream_model,
                    aggregation_name: Some(aggregation.name),
                    outbound_flavor,
                    target_id: Some(target.id),
                    timeout_secs: target.timeout_secs,
                    max_retries: target.max_retries,
                });
            }

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
                // Skip excluded and unhealthy providers.
                if !is_provider_available(&cfg, &provider.id, excluded_providers) {
                    continue;
                }
                // Skip providers with incompatible protocol.
                if !crate::proxy::adapter::is_protocol_compatible(
                    inbound_flavor,
                    &provider.api_flavor,
                ) {
                    continue;
                }
                for model in &provider.models {
                    // Match by name or alias so aggregation entries
                    // can reference either the real name or an alias.
                    if model.name == picked || model.alias.as_deref() == Some(&picked) {
                        // Skip models that don't satisfy capability requirements.
                        if !capabilities.is_satisfied_by(model) {
                            continue;
                        }
                        let upstream_model =
                            resolve_model_mapping(provider, &model.name);
                        return Ok(RouteResult {
                            outbound_flavor: provider.api_flavor.clone(),
                            provider: provider.clone(),
                            model: model.name.clone(),
                            upstream_model,
                            aggregation_name: Some(aggregation.name.clone()),
                            target_id: None,
                            timeout_secs: None,
                            max_retries: None,
                        });
                    }
                }
            }
            Err(format!(
                "No available provider for model '{}' (all excluded or unhealthy)",
                picked
            ))
        }
        None => Err(format!("Unknown model or aggregation: '{}'", model_or_agg)),
    }
}

fn average_latency(cfg: &RoutingState, model: &str) -> f64 {
    cfg.latency_history
        .get(model)
        .filter(|samples| !samples.is_empty())
        .map(|samples| samples.iter().sum::<f64>() / samples.len() as f64)
        .unwrap_or(f64::MAX)
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
            let slot_count = if agg.targets.is_empty() {
                parse_agg_models(&agg.models).len()
            } else {
                let Some(highest_priority) = agg
                    .targets
                    .iter()
                    .filter(|target| target.enabled && target.weight > 0)
                    .map(|target| target.priority)
                    .max()
                else {
                    return;
                };
                agg.targets
                    .iter()
                    .filter(|target| {
                        target.enabled
                            && target.weight > 0
                            && target.priority == highest_priority
                    })
                    .map(|target| target.weight as usize)
                    .sum()
            };
            if slot_count > 0 {
                let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
                let next = (idx + 1) % slot_count;
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
                targets: vec![],
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
                    models: vec![crate::types::Model {
                        id: format!("{}-m1", id),
                        name: "gpt-4".into(),
                        alias: None,
                        context_window: None,
                        max_output_tokens: None,
                        supports_vision: false,
                        supports_reasoning: false,
                        supports_reasoning_effort: false,
                        default_reasoning_effort: None,
                        supports_tool_calls: false,
                        supports_json_mode: false,
                    }],
                    api_flavor: "openai".into(),
                    api_key_encrypted: false,
                    model_mapping: None,
                    proxy_config: None,
                });
            }
        }

        // First request → provider 0.
        let excluded = std::collections::HashSet::new();
        let caps = RequestCapabilities::default();
        let r1 = route_request(&state, "gpt-4", &excluded, &caps, "openai")
            .await
            .unwrap();
        // After completion, cursor advances to 1.
        record_routing_side_effects(&state, &None, "gpt-4", 100).await;

        // Second request → provider 1.
        let r2 = route_request(&state, "gpt-4", &excluded, &caps, "openai")
            .await
            .unwrap();
        // After completion, cursor wraps to 0.
        record_routing_side_effects(&state, &None, "gpt-4", 100).await;

        // Third request → provider 0 again.
        let r3 = route_request(&state, "gpt-4", &excluded, &caps, "openai")
            .await
            .unwrap();

        assert_ne!(r1.provider.id, r2.provider.id);
        assert_eq!(r1.provider.id, r3.provider.id);
    }

    #[tokio::test]
    async fn explicit_target_preserves_protocol_and_policy_overrides() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.providers.push(Provider {
                id: "openai-upstream".into(),
                name: "OpenAI upstream".into(),
                api_base: "https://example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "model-1".into(),
                    name: "vendor-model".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: true,
                    supports_reasoning: true,
                    supports_reasoning_effort: true,
                    default_reasoning_effort: None,
                    supports_tool_calls: true,
                    supports_json_mode: true,
                }],
                api_flavor: "openai-chat".into(),
                api_key_encrypted: false,
                model_mapping: None,
                proxy_config: None,
            });
            cfg.aggregations.push(Aggregation {
                id: "unified-id".into(),
                name: "unified-model".into(),
                models: String::new(),
                targets: vec![crate::types::RouteTarget {
                    id: "target-1".into(),
                    provider_id: "openai-upstream".into(),
                    model: "vendor-model".into(),
                    upstream_model: Some("vendor-model-2026".into()),
                    protocol: Some("openai-responses".into()),
                    priority: 100,
                    weight: 3,
                    enabled: true,
                    timeout_secs: Some(90),
                    max_retries: Some(1),
                }],
                strategy: "round-robin".into(),
                priority: "P0".into(),
                enabled: true,
            });
        }

        let route = route_request(
            &state,
            "unified-model",
            &std::collections::HashSet::new(),
            &RequestCapabilities {
                needs_tools: true,
                needs_vision: true,
                needs_json_mode: true,
                needs_reasoning: true,
            },
            "anthropic-messages",
        )
        .await
        .expect("explicit target should support cross-protocol routing");

        assert_eq!(route.provider.id, "openai-upstream");
        assert_eq!(route.upstream_model, "vendor-model-2026");
        assert_eq!(route.outbound_flavor, "openai-responses");
        assert_eq!(route.target_id.as_deref(), Some("target-1"));
        assert_eq!(route.timeout_secs, Some(90));
        assert_eq!(route.max_retries, Some(1));
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
                targets: vec![],
                strategy: "round-robin".into(),
                priority: "P0".into(),
                enabled: true,
            });
            cfg.aggregations.push(Aggregation {
                id: "a2".into(),
                name: "agg-2".into(),
                models: "claude-3".into(),
                targets: vec![],
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

    // ── Model Mapping ──────────────────────────────────────

    use std::collections::HashMap;

    fn make_provider_with_mapping(mapping: Option<HashMap<String, String>>) -> Provider {
        Provider {
            id: "p1".into(),
            name: "Test".into(),
            api_base: "https://example.com".into(),
            api_key: "key".into(),
            status: "active".into(),
            models: vec![],
            api_flavor: "openai".into(),
            api_key_encrypted: false,
            model_mapping: mapping,
            proxy_config: None,
        }
    }

    #[test]
    fn model_mapping_none_passthrough() {
        let provider = make_provider_with_mapping(None);
        assert_eq!(resolve_model_mapping(&provider, "gpt-4"), "gpt-4");
    }

    #[test]
    fn model_mapping_empty_passthrough() {
        let provider = make_provider_with_mapping(Some(HashMap::new()));
        assert_eq!(resolve_model_mapping(&provider, "gpt-4"), "gpt-4");
    }

    #[test]
    fn model_mapping_exact_match() {
        let mut map = HashMap::new();
        map.insert("gpt-4".into(), "gpt-4-turbo-2024".into());
        let provider = make_provider_with_mapping(Some(map));
        assert_eq!(
            resolve_model_mapping(&provider, "gpt-4"),
            "gpt-4-turbo-2024"
        );
    }

    #[test]
    fn model_mapping_no_match_passthrough() {
        let mut map = HashMap::new();
        map.insert("claude-3".into(), "claude-3-opus".into());
        let provider = make_provider_with_mapping(Some(map));
        assert_eq!(resolve_model_mapping(&provider, "gpt-4"), "gpt-4");
    }

    #[test]
    fn model_mapping_wildcard_match() {
        let mut map = HashMap::new();
        map.insert("claude-*".into(), "claude-3-5-sonnet".into());
        let provider = make_provider_with_mapping(Some(map));
        assert_eq!(
            resolve_model_mapping(&provider, "claude-sonnet-4"),
            "claude-3-5-sonnet"
        );
    }

    #[test]
    fn model_mapping_longest_wildcard_wins() {
        let mut map = HashMap::new();
        map.insert("claude-*".into(), "claude-default".into());
        map.insert("claude-sonnet-*".into(), "claude-3-5-sonnet".into());
        let provider = make_provider_with_mapping(Some(map));
        // "claude-sonnet-*" is longer and more specific, should win.
        assert_eq!(
            resolve_model_mapping(&provider, "claude-sonnet-4"),
            "claude-3-5-sonnet"
        );
        // "claude-*" matches claude-opus-4.
        assert_eq!(
            resolve_model_mapping(&provider, "claude-opus-4"),
            "claude-default"
        );
    }

    #[test]
    fn model_mapping_exact_overrides_wildcard() {
        let mut map = HashMap::new();
        map.insert("claude-*".into(), "claude-default".into());
        map.insert("claude-opus-4".into(), "claude-opus-4-20250514".into());
        let provider = make_provider_with_mapping(Some(map));
        // Exact match takes priority over wildcard.
        assert_eq!(
            resolve_model_mapping(&provider, "claude-opus-4"),
            "claude-opus-4-20250514"
        );
    }

    // ── Capability Matching ────────────────────────────────

    #[tokio::test]
    async fn capability_filter_skips_models_without_tools() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            // Provider 1: model supports tools.
            cfg.providers.push(Provider {
                id: "p1".into(),
                name: "WithTools".into(),
                api_base: "https://example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "m1".into(),
                    name: "gpt-4".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                    supports_tool_calls: true,
                    supports_json_mode: false,
                }],
                api_flavor: "openai".into(),
                api_key_encrypted: false,
                model_mapping: None,
                proxy_config: None,
            });
            // Provider 2: model does NOT support tools.
            cfg.providers.push(Provider {
                id: "p2".into(),
                name: "NoTools".into(),
                api_base: "https://example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "m2".into(),
                    name: "gpt-4".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                    supports_tool_calls: false,
                    supports_json_mode: false,
                }],
                api_flavor: "openai".into(),
                api_key_encrypted: false,
                model_mapping: None,
                proxy_config: None,
            });
        }

        let excluded = std::collections::HashSet::new();
        let caps = RequestCapabilities {
            needs_tools: true,
            ..Default::default()
        };

        // Should route to p1 (supports tools), not p2.
        let route = route_request(&state, "gpt-4", &excluded, &caps, "openai")
            .await
            .unwrap();
        assert_eq!(route.provider.id, "p1");
    }

    #[tokio::test]
    async fn capability_filter_no_requirement_matches_all() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.providers.push(Provider {
                id: "p1".into(),
                name: "Basic".into(),
                api_base: "https://example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "m1".into(),
                    name: "gpt-4".into(),
                    alias: None,
                    context_window: None,
                    max_output_tokens: None,
                    supports_vision: false,
                    supports_reasoning: false,
                    supports_reasoning_effort: false,
                    default_reasoning_effort: None,
                    supports_tool_calls: false,
                    supports_json_mode: false,
                }],
                api_flavor: "openai".into(),
                api_key_encrypted: false,
                model_mapping: None,
                proxy_config: None,
            });
        }

        let excluded = std::collections::HashSet::new();
        let caps = RequestCapabilities::default();

        // No requirements -> any model matches.
        let route = route_request(&state, "gpt-4", &excluded, &caps, "openai")
            .await
            .unwrap();
        assert_eq!(route.provider.id, "p1");
    }
}
