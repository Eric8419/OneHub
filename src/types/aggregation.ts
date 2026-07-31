// Routing strategy is stored as a stable kebab-case key
// (e.g. "round-robin"), NOT a localized label. The backend
// matches on these keys via the RoutingStrategy enum. UI labels
// are derived here so the wire format is language-independent.

import type { Provider } from './provider';

export const ROUTING_STRATEGY_VALUES = [
  'priority',
  'weighted',
  'round-robin',
  'context-relay',
  'fill-first',
  'p2c',
  'random',
  'least-used',
  'cost-optimized',
  'reset-aware',
  'reset-window',
  'headroom',
  'strict-random',
  'auto',
  'lkgp',
  'context-optimized',
  'cache-optimized',
  'fusion',
  'pipeline',
] as const;

export type RoutingStrategy = (typeof ROUTING_STRATEGY_VALUES)[number];

export interface RouteTarget {
  id: string;
  providerId: string;
  model: string;
  upstreamModel?: string;
  protocol?: 'openai-chat' | 'anthropic-messages' | 'openai-responses';
  priority: number;
  weight: number;
  enabled: boolean;
  timeoutSecs?: number;
  maxRetries?: number;
  /** Optional price hint used by cost-aware and auto routing. */
  costPerMillionTokens?: number;
  /** Optional live/manual quota hints (0..1 and Unix milliseconds). */
  quotaRemaining?: number;
  quotaResetAt?: number;
}

export interface Aggregation {
  id: string;
  name: string;
  /** Comma-separated model names. */
  models: string;
  /** Explicit upstream destinations; absent/empty means legacy models routing. */
  targets?: RouteTarget[];
  /** RoutingStrategy key (kebab-case). */
  strategy: string;
  priority: string;
  enabled: boolean;
}

const protocolForFlavor = (flavor?: string): NonNullable<RouteTarget['protocol']> => {
  if (flavor === 'anthropic' || flavor === 'anthropic-messages') return 'anthropic-messages';
  if (flavor === 'responses' || flavor === 'openai-responses') return 'openai-responses';
  return 'openai-chat';
};

/** Materialize a legacy aggregation into editable concrete targets. */
export const buildLegacyAggregationTargets = (
  aggregation: Aggregation | undefined,
  providers: Provider[],
): RouteTarget[] => {
  if (!aggregation || aggregation.targets?.length) return [];
  const modelNames = aggregation.models
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const targets: RouteTarget[] = [];
  modelNames.forEach((requestedModel, modelIndex) => {
    for (const provider of providers) {
      const model = provider.models.find(
        (candidate) => candidate.name === requestedModel || candidate.alias?.trim() === requestedModel,
      );
      if (!model) continue;
      targets.push({
        id: `legacy-${aggregation.id}-${provider.id}-${modelIndex}`,
        providerId: provider.id,
        model: model.name,
        protocol: protocolForFlavor(provider.apiFlavor),
        priority: modelNames.length - modelIndex,
        weight: 1,
        enabled: true,
      });
    }
  });
  return targets;
};

export interface RoutingStrategyOption {
  value: RoutingStrategy;
  labelKey: string;
  descriptionKey: string;
  groupKey: string;
}

export const STRATEGY_OPTIONS: RoutingStrategyOption[] = [
  { value: 'priority', labelKey: 'priority', descriptionKey: 'priorityDesc', groupKey: 'deterministic' },
  { value: 'fill-first', labelKey: 'fillFirst', descriptionKey: 'fillFirstDesc', groupKey: 'deterministic' },
  { value: 'round-robin', labelKey: 'roundRobin', descriptionKey: 'roundRobinDesc', groupKey: 'balanced' },
  { value: 'weighted', labelKey: 'weighted', descriptionKey: 'weightedDesc', groupKey: 'balanced' },
  { value: 'p2c', labelKey: 'p2c', descriptionKey: 'p2cDesc', groupKey: 'balanced' },
  { value: 'least-used', labelKey: 'leastUsed', descriptionKey: 'leastUsedDesc', groupKey: 'balanced' },
  { value: 'random', labelKey: 'random', descriptionKey: 'randomDesc', groupKey: 'randomized' },
  { value: 'strict-random', labelKey: 'strictRandom', descriptionKey: 'strictRandomDesc', groupKey: 'randomized' },
  { value: 'cost-optimized', labelKey: 'costOptimized', descriptionKey: 'costOptimizedDesc', groupKey: 'adaptive' },
  { value: 'reset-aware', labelKey: 'resetAware', descriptionKey: 'resetAwareDesc', groupKey: 'adaptive' },
  { value: 'reset-window', labelKey: 'resetWindow', descriptionKey: 'resetWindowDesc', groupKey: 'adaptive' },
  { value: 'headroom', labelKey: 'headroom', descriptionKey: 'headroomDesc', groupKey: 'adaptive' },
  { value: 'auto', labelKey: 'auto', descriptionKey: 'autoDesc', groupKey: 'intelligent' },
  { value: 'lkgp', labelKey: 'lkgp', descriptionKey: 'lkgpDesc', groupKey: 'intelligent' },
  { value: 'context-optimized', labelKey: 'contextOptimized', descriptionKey: 'contextOptimizedDesc', groupKey: 'intelligent' },
  { value: 'cache-optimized', labelKey: 'cacheOptimized', descriptionKey: 'cacheOptimizedDesc', groupKey: 'intelligent' },
  { value: 'context-relay', labelKey: 'contextRelay', descriptionKey: 'contextRelayDesc', groupKey: 'orchestration' },
  { value: 'fusion', labelKey: 'fusion', descriptionKey: 'fusionDesc', groupKey: 'orchestration' },
  { value: 'pipeline', labelKey: 'pipeline', descriptionKey: 'pipelineDesc', groupKey: 'orchestration' },
];

/** Map a stored strategy key to its localized label. Falls back
 * to the key itself (and tolerates legacy localized strings via
 * `normalizeStrategyKey`). */
export function strategyLabel(
  strategy: string,
  translate?: (key: string) => string,
): string {
  const normalized = normalizeStrategyKey(strategy);
  const option = STRATEGY_OPTIONS.find((item) => item.value === normalized);
  return option && translate
    ? translate(`routing.strategy.${option.labelKey}`)
    : normalized;
}

/** Convert a legacy localized strategy string to its stable key.
 * Mirrors the backend `RoutingStrategy::from_stored` fallback so
 * old persisted aggregations keep working after upgrade. */
export function normalizeStrategyKey(strategy: string): string {
  if ((ROUTING_STRATEGY_VALUES as readonly string[]).includes(strategy)) return strategy;
  // MelodyHub pre-19-strategy keys.
  if (strategy === 'lowest-latency') return 'auto';
  if (strategy === 'sequential') return 'priority';
  if (strategy.includes('随机')) return 'random';
  if (strategy.includes('最低延迟')) return 'auto';
  if (strategy.includes('顺序')) return 'priority';
  // "轮询 (Round Robin)" and anything else → default.
  return 'round-robin';
}
