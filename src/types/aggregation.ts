// Routing strategy is stored as a stable kebab-case key
// (e.g. "round-robin"), NOT a localized label. The backend
// matches on these keys via the RoutingStrategy enum. UI labels
// are derived here so the wire format is language-independent.

export type RoutingStrategy = 'round-robin' | 'lowest-latency' | 'random' | 'sequential';

export interface Aggregation {
  id: string;
  name: string;
  /** Comma-separated model names. */
  models: string;
  /** RoutingStrategy key (kebab-case). */
  strategy: string;
  priority: string;
  enabled: boolean;
}

export const STRATEGY_OPTIONS: { value: RoutingStrategy; label: string }[] = [
  { value: 'round-robin', label: '轮询 (Round Robin)' },
  { value: 'lowest-latency', label: '最低延迟' },
  { value: 'random', label: '随机' },
  { value: 'sequential', label: '顺序' },
];

/** Map a stored strategy key to its localized label. Falls back
 * to the key itself (and tolerates legacy localized strings via
 * `normalizeStrategyKey`). */
export function strategyLabel(strategy: string): string {
  const found = STRATEGY_OPTIONS.find(o => o.value === strategy);
  if (found) return found.label;
  // Legacy localized values (pre-refactor data): map them back.
  return normalizeStrategyKey(strategy) === strategy
    ? strategy
    : STRATEGY_OPTIONS.find(o => o.value === normalizeStrategyKey(strategy))?.label ?? strategy;
}

/** Convert a legacy localized strategy string to its stable key.
 * Mirrors the backend `RoutingStrategy::from_stored` fallback so
 * old persisted aggregations keep working after upgrade. */
export function normalizeStrategyKey(strategy: string): string {
  const known: RoutingStrategy[] = ['round-robin', 'lowest-latency', 'random', 'sequential'];
  if (known.includes(strategy as RoutingStrategy)) return strategy;
  if (strategy.includes('随机')) return 'random';
  if (strategy.includes('最低延迟')) return 'lowest-latency';
  if (strategy.includes('顺序')) return 'sequential';
  // "轮询 (Round Robin)" and anything else → default.
  return 'round-robin';
}
