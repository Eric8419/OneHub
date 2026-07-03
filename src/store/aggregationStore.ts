import { create } from 'zustand';
import type { Aggregation } from '../types/aggregation';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_MOCK_AGGREGATIONS: Aggregation[] = [
  { id: 'smart-routing', name: '智能路由', models: 'GPT-4o, Claude 3.5 Sonnet', strategy: '轮询 (Round Robin)', priority: 'P0', enabled: true },
  { id: 'code-assist', name: '代码助手', models: 'DeepSeek Coder, o3-mini', strategy: '最低延迟', priority: 'P1', enabled: true },
  { id: 'general-chat', name: '通用对话', models: 'GPT-4o-mini, Claude 3.5 Haiku, Qwen 2.5', strategy: '随机', priority: 'P2', enabled: false },
  { id: 'deep-reasoning', name: '深度推理', models: 'o3, Claude 4', strategy: '顺序', priority: 'P0', enabled: true },
];

interface AggregationStore {
  aggregations: Aggregation[];
  loaded: boolean;
  error: string | null;
  addAggregation: (a: Aggregation) => Promise<void>;
  updateAggregation: (id: string, partial: Partial<Aggregation>) => Promise<void>;
  removeAggregation: (id: string) => Promise<void>;
  loadAggregations: () => Promise<void>;
  clearError: () => void;
}

export const useAggregationStore = create<AggregationStore>((set, get) => ({
  aggregations: DEFAULT_MOCK_AGGREGATIONS,
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  loadAggregations: async () => {
    try {
      const data = await invoke<Aggregation[]>('load_aggregations');
      if (data && data.length > 0) {
        set({ aggregations: data, loaded: true, error: null });
      } else {
        set({ loaded: true, error: null });
      }
    } catch (e: any) {
      console.warn('[aggregationStore] load_aggregations failed, using defaults:', e);
      set({ loaded: true, error: e?.toString() || null });
    }
  },

  addAggregation: async (a) => {
    const prev = get().aggregations;
    try {
      const updated = [...prev, a];
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: any) {
      set({ aggregations: prev, error: e?.toString() || '保存失败' });
      throw e;
    }
  },

  updateAggregation: async (id, partial) => {
    const prev = get().aggregations;
    try {
      const updated = prev.map(a => a.id === id ? { ...a, ...partial } : a);
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: any) {
      set({ aggregations: prev, error: e?.toString() || '保存失败' });
      throw e;
    }
  },

  removeAggregation: async (id) => {
    const prev = get().aggregations;
    try {
      const updated = prev.filter(a => a.id !== id);
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: any) {
      set({ aggregations: prev, error: e?.toString() || '删除失败' });
      throw e;
    }
  },
}));