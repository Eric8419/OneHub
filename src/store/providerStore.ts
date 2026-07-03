import { create } from 'zustand';
import type { Provider } from '../types/provider';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_MOCK_PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    apiBase: 'https://api.openai.com/v1',
    apiKey: 'sk-...xxxx',
    status: 'connected',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'o3-mini', name: 'o3-mini' },
      { id: 'o3', name: 'o3' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    apiBase: 'https://api.anthropic.com',
    apiKey: 'sk-ant-...xxxx',
    status: 'connected',
    models: [
      { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku' },
      { id: 'claude-4', name: 'Claude 4' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    apiBase: 'https://api.deepseek.com',
    apiKey: '',
    status: 'configuring',
    models: [
      { id: 'deepseek-v3', name: 'DeepSeek V3' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    ],
  },
];

interface ProviderStore {
  providers: Provider[];
  loaded: boolean;
  error: string | null;
  addProvider: (p: Provider) => Promise<void>;
  updateProvider: (id: string, partial: Partial<Provider>) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  loadProviders: () => Promise<void>;
  clearError: () => void;
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: DEFAULT_MOCK_PROVIDERS,
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  loadProviders: async () => {
    try {
      const data = await invoke<Provider[]>('load_providers');
      if (data && data.length > 0) {
        set({ providers: data, loaded: true, error: null });
      } else {
        // Use mock data as defaults if nothing persisted
        set({ loaded: true, error: null });
      }
    } catch (e: any) {
      console.warn('[providerStore] load_providers failed, using defaults:', e);
      set({ loaded: true, error: e?.toString() || null });
    }
  },

  addProvider: async (p) => {
    const prev = get().providers;
    try {
      const updated = [...prev, p];
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: any) {
      // Rollback on failure
      set({ providers: prev, error: e?.toString() || '保存失败' });
      throw e;
    }
  },

  updateProvider: async (id, partial) => {
    const prev = get().providers;
    try {
      const updated = prev.map(p => p.id === id ? { ...p, ...partial } : p);
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: any) {
      set({ providers: prev, error: e?.toString() || '保存失败' });
      throw e;
    }
  },

  removeProvider: async (id) => {
    const prev = get().providers;
    try {
      const updated = prev.filter(p => p.id !== id);
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: any) {
      set({ providers: prev, error: e?.toString() || '删除失败' });
      throw e;
    }
  },
}));