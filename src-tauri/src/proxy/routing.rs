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

use crate::types::{Aggregation, Model, Provider, RouteTarget, RoutingStrategy};

/// Capabilities a request needs from a model. Used by the router
/// to skip providers whose models don't support the required
/// features (e.g. tool calls, vision, JSON mode).
#[derive(Debug, Clone, Default)]
pub struct RequestCapabilities {
    pub needs_tools: bool,
    pub needs_vision: bool,
    pub needs_json_mode: bool,
    pub needs_reasoning: bool,
    /// Fast request-size estimate used by context-aware strategies.
    pub estimated_context_tokens: u64,
    /// Stable hash of the leading conversation content for sticky/cache routing.
    pub affinity_key: u64,
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
#[derive(Clone)]
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
    /// Successful request counts, keyed by concrete model name.
    pub usage_counts: HashMap<String, u64>,
    /// Last successful model for each aggregation.
    pub last_good_model: HashMap<String, String>,
}

impl RoutingState {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            aggregations: Vec::new(),
            round_robin_index: HashMap::new(),
            latency_history: HashMap::new(),
            provider_health: HashMap::new(),
            usage_counts: HashMap::new(),
            last_good_model: HashMap::new(),
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
    eprintln!(
        "[proxy] Provider {} health degraded: kind={:?} consecutive_failures={} available={}",
        provider_id,
        kind,
        health.consecutive_failures,
        health.is_available()
    );
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

/// Clear all transient provider health state.
///
/// Provider health is intentionally kept only in memory. A manual proxy
/// restart is an explicit recovery action, so stale cooldowns, failure
/// counters, and in-flight counts must not survive it.
pub async fn reset_provider_health(state: &SharedRouting) {
    state.write().await.provider_health.clear();
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
    let has_model_routing_policy = cfg
        .aggregations
        .iter()
        .any(|aggregation| aggregation.enabled && aggregation.name == model_or_agg);

    // 1. Direct match by model name OR alias - round-robin, unless an enabled
    //    model-level routing policy with the same public name shadows it.
    //    across all providers that offer the same model.
    //    Filter out excluded, unhealthy, protocol-incompatible,
    //    and capability-mismatched.
    let mut model_exists = false;
    let mut excluded_by_health = false;
    let mut excluded_by_protocol = false;
    let mut excluded_by_capability = false;

    let direct_matches: Vec<_> = cfg
        .providers
        .iter()
        .flat_map(|p| p.models.iter().map(move |m| (p, m)))
        .filter(|(_, m)| {
            let hit = m.name == model_or_agg || m.alias.as_deref() == Some(model_or_agg);
            if hit {
                model_exists = true;
            }
            hit
        })
        .collect();

    let mut direct_hits = Vec::new();
    let mut health_fallback_hits = Vec::new();
    for (provider, model) in direct_matches {
        if !crate::proxy::adapter::is_protocol_compatible(
            inbound_flavor,
            &provider.api_flavor,
        ) {
            excluded_by_protocol = true;
            continue;
        }
        if !capabilities.is_satisfied_by(model) {
            excluded_by_capability = true;
            continue;
        }
        // An explicit per-request exclusion means this provider already
        // failed during the current failover loop and must not be retried.
        if excluded_providers.contains(&provider.id) {
            excluded_by_health = true;
            continue;
        }
        let hit = (provider.clone(), model.name.clone());
        if cfg
            .provider_health
            .get(&provider.id)
            .map(|health| health.is_available())
            .unwrap_or(true)
        {
            direct_hits.push(hit);
        } else {
            excluded_by_health = true;
            health_fallback_hits.push(hit);
        }
    }

    // Fail open when health cooldown is the only thing preventing a direct
    // model route. Circuit breaking should prefer another healthy provider,
    // but it must not turn a recoverable upstream failure into a permanent
    // local "filtered out" error when every matching provider is cooling down.
    if direct_hits.is_empty() && !health_fallback_hits.is_empty() {
        eprintln!(
            "[proxy] All providers for model '{}' are in cooldown; attempting a health fallback",
            model_or_agg
        );
        direct_hits = health_fallback_hits;
    }

    if !direct_hits.is_empty() && !has_model_routing_policy {
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

    // 2. Model-level routing policy / aggregation match.
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

                if candidates.is_empty() {
                    return Err(format!(
                        "No available target for aggregation '{}'",
                        aggregation.name
                    ));
                }

                let weighted_indices: Vec<usize> = candidates
                    .iter()
                    .enumerate()
                    .flat_map(|(index, (target, _, _, _))| {
                        std::iter::repeat_n(index, target.weight as usize)
                    })
                    .collect();
                let strategy = aggregation.strategy_enum();
                let time_seed = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .subsec_nanos() as usize;
                let cursor = cfg
                    .round_robin_index
                    .get(&aggregation.name)
                    .copied()
                    .unwrap_or(0);
                let highest_priority = candidates
                    .iter()
                    .map(|(target, _, _, _)| target.priority)
                    .max()
                    .unwrap_or_default();
                let priority_first = || {
                    candidates
                        .iter()
                        .position(|(target, _, _, _)| {
                            target.priority == highest_priority
                        })
                        .unwrap_or(0)
                };
                let picked_index = match strategy {
                    RoutingStrategy::Priority
                    | RoutingStrategy::FillFirst
                    | RoutingStrategy::Fusion
                    | RoutingStrategy::Pipeline => priority_first(),
                    RoutingStrategy::Weighted => {
                        weighted_indices[time_seed % weighted_indices.len()]
                    }
                    RoutingStrategy::Random => time_seed % candidates.len(),
                    RoutingStrategy::RoundRobin => {
                        weighted_indices[cursor % weighted_indices.len()]
                    }
                    RoutingStrategy::StrictRandom => {
                        let cycle = cursor / candidates.len();
                        let mut deck: Vec<usize> = (0..candidates.len()).collect();
                        deck.sort_by_key(|index| {
                            stable_route_hash(
                                &aggregation.name,
                                &candidates[*index].0.id,
                                cycle,
                            )
                        });
                        deck[cursor % deck.len()]
                    }
                    RoutingStrategy::P2c => {
                        let left = time_seed % candidates.len();
                        let right = (time_seed.rotate_left(11).wrapping_add(1))
                            % candidates.len();
                        let load = |index: usize| {
                            cfg.provider_health
                                .get(&candidates[index].1.id)
                                .map(|health| health.in_flight)
                                .unwrap_or(0)
                        };
                        if load(left) <= load(right) {
                            left
                        } else {
                            right
                        }
                    }
                    RoutingStrategy::LeastUsed => candidates
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, (_, _, model, _))| {
                            cfg.usage_counts.get(&model.name).copied().unwrap_or(0)
                        })
                        .map(|(index, _)| index)
                        .unwrap_or(0),
                    RoutingStrategy::CostOptimized => candidates
                        .iter()
                        .enumerate()
                        .min_by(|(_, (left, _, _, _)), (_, (right, _, _, _))| {
                            left.cost_per_million_tokens.unwrap_or(f64::MAX).total_cmp(
                                &right.cost_per_million_tokens.unwrap_or(f64::MAX),
                            )
                        })
                        .map(|(index, _)| index)
                        .unwrap_or_else(priority_first),
                    RoutingStrategy::ResetWindow => candidates
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, (target, _, _, _))| {
                            target.quota_reset_at.unwrap_or(i64::MAX)
                        })
                        .map(|(index, _)| index)
                        .unwrap_or_else(priority_first),
                    RoutingStrategy::Headroom => candidates
                        .iter()
                        .enumerate()
                        .max_by(|(_, (left, _, _, _)), (_, (right, _, _, _))| {
                            left.quota_remaining
                                .unwrap_or(-1.0)
                                .total_cmp(&right.quota_remaining.unwrap_or(-1.0))
                        })
                        .map(|(index, _)| index)
                        .unwrap_or_else(priority_first),
                    RoutingStrategy::ResetAware => candidates
                        .iter()
                        .enumerate()
                        .max_by(|(_, (left, _, _, _)), (_, (right, _, _, _))| {
                            reset_aware_score(left).total_cmp(&reset_aware_score(right))
                        })
                        .map(|(index, _)| index)
                        .unwrap_or_else(priority_first),
                    RoutingStrategy::Lkgp => cfg
                        .last_good_model
                        .get(&aggregation.name)
                        .and_then(|last| {
                            candidates
                                .iter()
                                .position(|(_, _, model, _)| model.name == *last)
                        })
                        .unwrap_or_else(priority_first),
                    RoutingStrategy::ContextRelay | RoutingStrategy::CacheOptimized => {
                        (capabilities.affinity_key as usize) % candidates.len()
                    }
                    RoutingStrategy::ContextOptimized => candidates
                        .iter()
                        .enumerate()
                        .filter(|(_, (_, _, model, _))| {
                            model.context_window.unwrap_or(u32::MAX) as u64
                                >= capabilities.estimated_context_tokens
                        })
                        .min_by_key(|(_, (_, _, model, _))| {
                            model.context_window.unwrap_or(u32::MAX)
                        })
                        .map(|(index, _)| index)
                        .unwrap_or_else(|| {
                            candidates
                                .iter()
                                .enumerate()
                                .max_by_key(|(_, (_, _, model, _))| {
                                    model.context_window.unwrap_or_default()
                                })
                                .map(|(index, _)| index)
                                .unwrap_or(0)
                        }),
                    RoutingStrategy::Auto => {
                        candidates
                            .iter()
                            .enumerate()
                            .max_by(|(_, left), (_, right)| {
                                auto_score(&cfg, left, capabilities)
                                    .total_cmp(&auto_score(&cfg, right, capabilities))
                            })
                            .map(|(index, _)| index)
                            .unwrap_or(0)
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
        None => {
            if model_exists {
                let mut reasons: Vec<&str> = Vec::new();
                if excluded_by_health {
                    reasons.push("provider unhealthy or excluded");
                }
                if excluded_by_protocol {
                    reasons.push("protocol incompatible");
                }
                if excluded_by_capability {
                    reasons.push("model capability mismatch");
                }
                Err(format!(
                    "Model '{}' was found but all matching providers were filtered out: {}",
                    model_or_agg,
                    reasons.join(", ")
                ))
            } else {
                Err(format!("Unknown model or aggregation: '{}'", model_or_agg))
            }
        }
    }
}

/// Resolve every currently eligible explicit target for an aggregation.
///
/// Fusion and pipeline consume this ordered plan instead of selecting a
/// single target. Normal routing continues to use [`route_request`].
pub async fn aggregation_route_plan(
    state: &SharedRouting,
    aggregation_name: &str,
    capabilities: &RequestCapabilities,
    inbound_flavor: &str,
) -> Option<(RoutingStrategy, Vec<RouteResult>)> {
    let cfg = state.read().await;
    let aggregation = cfg
        .aggregations
        .iter()
        .find(|item| item.enabled && item.name == aggregation_name)?;
    let strategy = aggregation.strategy_enum();
    if !matches!(
        strategy,
        RoutingStrategy::Fusion | RoutingStrategy::Pipeline
    ) || aggregation.targets.is_empty()
    {
        return None;
    }

    let mut targets = aggregation.targets.clone();
    targets.sort_by(|left, right| right.priority.cmp(&left.priority));
    let mut routes = Vec::new();
    for target in targets
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
        if !cfg
            .provider_health
            .get(&provider.id)
            .map(|health| health.is_available())
            .unwrap_or(true)
        {
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
        routes.push(RouteResult {
            provider: provider.clone(),
            model: model.name.clone(),
            upstream_model: target
                .upstream_model
                .clone()
                .unwrap_or_else(|| resolve_model_mapping(provider, &model.name)),
            aggregation_name: Some(aggregation.name.clone()),
            outbound_flavor,
            target_id: Some(target.id.clone()),
            timeout_secs: target.timeout_secs,
            max_retries: target.max_retries,
        });
    }
    Some((strategy, routes))
}

fn average_latency(cfg: &RoutingState, model: &str) -> f64 {
    cfg.latency_history
        .get(model)
        .filter(|samples| !samples.is_empty())
        .map(|samples| samples.iter().sum::<f64>() / samples.len() as f64)
        .unwrap_or(f64::MAX)
}

fn stable_route_hash(aggregation: &str, target: &str, cycle: usize) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    aggregation.hash(&mut hasher);
    target.hash(&mut hasher);
    cycle.hash(&mut hasher);
    hasher.finish()
}

fn reset_aware_score(target: &RouteTarget) -> f64 {
    let headroom = target.quota_remaining.unwrap_or(0.5).clamp(0.0, 1.0);
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let hours_to_reset = target
        .quota_reset_at
        .map(|reset| ((reset - now_ms).max(0) as f64 / 3_600_000.0).max(0.25))
        .unwrap_or(168.0);
    // Spend fuller buckets that will reset soon, mirroring OmniRoute's
    // reset-aware ordering while remaining useful when telemetry is partial.
    headroom / hours_to_reset.sqrt()
}

fn auto_score(
    cfg: &RoutingState,
    candidate: &(RouteTarget, Provider, Model, String),
    capabilities: &RequestCapabilities,
) -> f64 {
    let (target, provider, model, _) = candidate;
    let health = cfg.provider_health.get(&provider.id);
    let health_score = health
        .map(|value| {
            if value.is_available() {
                1.0 / (1.0 + value.consecutive_failures as f64)
            } else {
                0.0
            }
        })
        .unwrap_or(1.0);
    let quota_score = target.quota_remaining.unwrap_or(0.5).clamp(0.0, 1.0);
    let cost_score = target
        .cost_per_million_tokens
        .map(|cost| 1.0 / (1.0 + cost.max(0.0)))
        .unwrap_or(0.5);
    let latency = average_latency(cfg, &model.name);
    let latency_score = if latency.is_finite() {
        1.0 / (1.0 + latency / 1000.0)
    } else {
        0.5
    };
    let load_score = 1.0
        / (1.0
            + health
                .map(|value| value.in_flight as f64)
                .unwrap_or_default());
    let context_score = model
        .context_window
        .map(|window| {
            if window as u64 >= capabilities.estimated_context_tokens {
                1.0
            } else {
                window as f64 / capabilities.estimated_context_tokens.max(1) as f64
            }
        })
        .unwrap_or(0.5);

    health_score * 0.28
        + quota_score * 0.18
        + cost_score * 0.16
        + latency_score * 0.16
        + load_score * 0.12
        + context_score * 0.10
}

/// Pick a model from `model_names` according to `strategy`.
fn pick_model(
    strategy: RoutingStrategy,
    agg_name: &str,
    model_names: &[String],
    cfg: &RoutingState,
) -> String {
    match strategy {
        RoutingStrategy::Random | RoutingStrategy::Weighted | RoutingStrategy::P2c => {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .subsec_nanos() as usize;
            let idx = nanos % model_names.len();
            model_names[idx].clone()
        }
        RoutingStrategy::Auto | RoutingStrategy::CostOptimized => {
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
        RoutingStrategy::RoundRobin
        | RoutingStrategy::StrictRandom
        | RoutingStrategy::LeastUsed
        | RoutingStrategy::ContextRelay
        | RoutingStrategy::CacheOptimized => {
            let idx = cfg.round_robin_index.get(agg_name).copied().unwrap_or(0);
            let len = model_names.len();
            model_names[idx % len].clone()
        }
        RoutingStrategy::Lkgp => cfg
            .last_good_model
            .get(agg_name)
            .filter(|model| model_names.contains(model))
            .cloned()
            .unwrap_or_else(|| model_names[0].clone()),
        RoutingStrategy::ContextOptimized => model_names
            .iter()
            .max_by_key(|name| {
                cfg.providers
                    .iter()
                    .flat_map(|provider| provider.models.iter())
                    .find(|model| model.name == **name)
                    .and_then(|model| model.context_window)
                    .unwrap_or_default()
            })
            .cloned()
            .unwrap_or_else(|| model_names[0].clone()),
        RoutingStrategy::Priority
        | RoutingStrategy::FillFirst
        | RoutingStrategy::ResetAware
        | RoutingStrategy::ResetWindow
        | RoutingStrategy::Headroom
        | RoutingStrategy::Fusion
        | RoutingStrategy::Pipeline => model_names[0].clone(),
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
                let enabled = agg
                    .targets
                    .iter()
                    .filter(|target| target.enabled && target.weight > 0);
                if matches!(
                    agg.strategy_enum(),
                    RoutingStrategy::RoundRobin | RoutingStrategy::Weighted
                ) {
                    enabled.map(|target| target.weight as usize).sum()
                } else {
                    enabled.count()
                }
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
    *cfg.usage_counts.entry(model.to_string()).or_default() += 1;
    if let Some(agg_name) = aggregation_name {
        cfg.last_good_model
            .insert(agg_name.clone(), model.to_string());
    }
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
    async fn reset_provider_health_clears_cooldowns_and_in_flight_counts() {
        let state = make_state();
        mark_provider_unhealthy(&state, "p1", HealthErrorKind::AuthError).await;
        acquire_provider_slot(&state, "p1").await;

        {
            let cfg = state.read().await;
            let health = cfg.provider_health.get("p1").unwrap();
            assert!(!health.is_available());
            assert_eq!(health.in_flight, 1);
        }

        reset_provider_health(&state).await;

        let cfg = state.read().await;
        assert!(cfg.provider_health.is_empty());
        assert!(is_provider_available(
            &cfg,
            "p1",
            &std::collections::HashSet::new()
        ));
    }

    #[tokio::test]
    async fn direct_route_fails_open_when_cooldown_is_the_only_filter() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.providers.push(Provider {
                id: "p1".into(),
                name: "Cooling Down".into(),
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
                supports_system_role: true,
            });
        }
        mark_provider_unhealthy(&state, "p1", HealthErrorKind::AuthError).await;

        let route = route_request(
            &state,
            "gpt-4",
            &std::collections::HashSet::new(),
            &RequestCapabilities {
                needs_tools: true,
                ..Default::default()
            },
            "openai",
        )
        .await
        .expect("health cooldown alone should not block the only route");
        assert_eq!(route.provider.id, "p1");

        let excluded = std::collections::HashSet::from(["p1".to_string()]);
        let error = match route_request(
            &state,
            "gpt-4",
            &excluded,
            &RequestCapabilities::default(),
            "openai",
        )
        .await
        {
            Ok(_) => panic!("explicitly excluded provider must not be retried"),
            Err(error) => error,
        };
        assert!(error.contains("provider unhealthy or excluded"));
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
                    supports_system_role: true,
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
                supports_system_role: true,
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
                    cost_per_million_tokens: Some(1.25),
                    quota_remaining: Some(0.8),
                    quota_reset_at: None,
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
                estimated_context_tokens: 1_024,
                affinity_key: 42,
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
            RoutingStrategy::Auto
        );
        assert_eq!(
            RoutingStrategy::from_stored("顺序"),
            RoutingStrategy::Priority
        );
    }

    #[test]
    fn strategy_as_key_round_trips() {
        for s in [
            RoutingStrategy::Priority,
            RoutingStrategy::Weighted,
            RoutingStrategy::RoundRobin,
            RoutingStrategy::ContextRelay,
            RoutingStrategy::FillFirst,
            RoutingStrategy::P2c,
            RoutingStrategy::Random,
            RoutingStrategy::LeastUsed,
            RoutingStrategy::CostOptimized,
            RoutingStrategy::ResetAware,
            RoutingStrategy::ResetWindow,
            RoutingStrategy::Headroom,
            RoutingStrategy::StrictRandom,
            RoutingStrategy::Auto,
            RoutingStrategy::Lkgp,
            RoutingStrategy::ContextOptimized,
            RoutingStrategy::CacheOptimized,
            RoutingStrategy::Fusion,
            RoutingStrategy::Pipeline,
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
            supports_system_role: true,
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
                supports_system_role: true,
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
                supports_system_role: true,
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
                supports_system_role: true,
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

    #[tokio::test]
    async fn model_level_routing_policy_shadows_same_named_direct_model() {
        let state = make_state();
        {
            let mut cfg = state.write().await;
            cfg.providers.push(Provider {
                id: "direct-provider".into(),
                name: "Direct".into(),
                api_base: "https://direct.example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "direct-model".into(),
                    name: "public-model".into(),
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
                supports_system_role: true,
            });
            cfg.providers.push(Provider {
                id: "policy-provider".into(),
                name: "Policy target".into(),
                api_base: "https://policy.example.com".into(),
                api_key: "key".into(),
                status: "active".into(),
                models: vec![Model {
                    id: "policy-model".into(),
                    name: "upstream-model".into(),
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
                supports_system_role: true,
            });
            cfg.aggregations.push(Aggregation {
                id: "model-policy".into(),
                name: "public-model".into(),
                models: "upstream-model".into(),
                targets: vec![crate::types::RouteTarget {
                    id: "policy-target".into(),
                    provider_id: "policy-provider".into(),
                    model: "upstream-model".into(),
                    upstream_model: None,
                    protocol: Some("openai-chat".into()),
                    priority: 0,
                    weight: 1,
                    enabled: true,
                    timeout_secs: None,
                    max_retries: None,
                    cost_per_million_tokens: None,
                    quota_remaining: None,
                    quota_reset_at: None,
                }],
                strategy: "priority".into(),
                priority: "P0".into(),
                enabled: true,
            });
        }

        let route = route_request(
            &state,
            "public-model",
            &std::collections::HashSet::new(),
            &RequestCapabilities::default(),
            "openai",
        )
        .await
        .expect("model-level policy should be selected");

        assert_eq!(route.provider.id, "policy-provider");
        assert_eq!(route.aggregation_name.as_deref(), Some("public-model"));
        assert_eq!(route.target_id.as_deref(), Some("policy-target"));
    }
}
