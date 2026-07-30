import { describe, expect, it } from 'vitest';
import {
  normalizeStrategyKey,
  ROUTING_STRATEGY_VALUES,
  STRATEGY_OPTIONS,
} from './aggregation';

describe('routing strategies', () => {
  it('exposes the same 19 public strategies as OmniRoute', () => {
    expect(ROUTING_STRATEGY_VALUES).toHaveLength(19);
    expect(STRATEGY_OPTIONS.map((option) => option.value)).toEqual([
      'priority',
      'fill-first',
      'round-robin',
      'weighted',
      'p2c',
      'least-used',
      'random',
      'strict-random',
      'cost-optimized',
      'reset-aware',
      'reset-window',
      'headroom',
      'auto',
      'lkgp',
      'context-optimized',
      'cache-optimized',
      'context-relay',
      'fusion',
      'pipeline',
    ]);
  });

  it('keeps new keys stable and migrates old MelodyHub values', () => {
    for (const strategy of ROUTING_STRATEGY_VALUES) {
      expect(normalizeStrategyKey(strategy)).toBe(strategy);
    }
    expect(normalizeStrategyKey('lowest-latency')).toBe('auto');
    expect(normalizeStrategyKey('sequential')).toBe('priority');
    expect(normalizeStrategyKey('最低延迟')).toBe('auto');
    expect(normalizeStrategyKey('顺序')).toBe('priority');
  });
});
