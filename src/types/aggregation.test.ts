import { describe, expect, it } from 'vitest';
import {
  buildLegacyAggregationTargets,
  normalizeStrategyKey,
  ROUTING_STRATEGY_VALUES,
  STRATEGY_OPTIONS,
} from './aggregation';
import type { Aggregation } from './aggregation';
import type { Provider } from './provider';

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

  it('materializes legacy aggregation targets for the model-level editor', () => {
    const aggregation: Aggregation = {
      id: 'agg-1',
      name: 'public-model',
      models: 'gpt-4o, claude-4',
      strategy: 'priority',
      priority: 'P0',
      enabled: true,
    };
    const providers: Provider[] = [
      {
        id: 'openai',
        name: 'OpenAI',
        apiBase: 'https://example.com',
        apiKey: 'key',
        status: 'connected',
        apiFlavor: 'openai-chat',
        models: [{ id: 'gpt', name: 'gpt-4o' }],
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        apiBase: 'https://example.com',
        apiKey: 'key',
        status: 'connected',
        apiFlavor: 'anthropic-messages',
        models: [{ id: 'claude', name: 'claude-4', alias: 'claude-latest' }],
      },
    ];

    expect(buildLegacyAggregationTargets(aggregation, providers)).toEqual([
      {
        id: 'legacy-agg-1-openai-0',
        providerId: 'openai',
        model: 'gpt-4o',
        protocol: 'openai-chat',
        priority: 2,
        weight: 1,
        enabled: true,
      },
      {
        id: 'legacy-agg-1-anthropic-1',
        providerId: 'anthropic',
        model: 'claude-4',
        protocol: 'anthropic-messages',
        priority: 1,
        weight: 1,
        enabled: true,
      },
    ]);
    expect(
      buildLegacyAggregationTargets(
        {
          ...aggregation,
          targets: [{ id: 'existing', providerId: 'openai', model: 'gpt-4o', priority: 1, weight: 1, enabled: true }],
        },
        providers,
      ),
    ).toEqual([]);
  });
});
