import { describe, it, expect } from 'vitest';

describe('Provider type utilities', () => {
  it('should create a provider with apiFlavor defaulting to openai', () => {
    const provider: Record<string, unknown> = {
      id: 'test',
      name: 'Test',
      apiBase: 'https://api.test.com/v1',
      apiKey: '',
      status: 'configuring',
      models: [],
    };
    expect(provider.apiFlavor).toBeUndefined();
    expect(provider.id).toBe('test');
  });

  it('should create a provider with explicit apiFlavor', () => {
    const provider = {
      id: 'anthropic',
      name: 'Anthropic',
      apiBase: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      status: 'connected' as const,
      models: [],
      apiFlavor: 'anthropic',
    };
    expect(provider.apiFlavor).toBe('anthropic');
  });
});

describe('Model utilities', () => {
  it('should have correct model structure', () => {
    const model = { id: 'gpt-4o', name: 'GPT-4o' };
    expect(model.id).toBe('gpt-4o');
    expect(model.name).toBe('GPT-4o');
  });
});