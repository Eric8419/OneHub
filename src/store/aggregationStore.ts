import { create } from 'zustand';
import type { Aggregation } from '../types/aggregation';
import { normalizeStrategyKey } from '../types/aggregation';
import { invoke } from '@tauri-apps/api/core';

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : e ? String(e) : fallback;

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
  // Empty initial state — UI renders an empty-state prompt.
  aggregations: [],
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  loadAggregations: async () => {
    try {
      const data = await invoke<Aggregation[]>('load_aggregations');
      // Normalize any legacy localized strategy strings to stable
      // enum keys so the UI dropdowns and backend routing agree.
      const normalized = (data ?? []).map(a => ({
        ...a,
        strategy: normalizeStrategyKey(a.strategy),
      }));
      set({ aggregations: normalized, loaded: true, error: null });
    } catch (e: unknown) {
      console.warn('[aggregationStore] load_aggregations failed:', e);
      set({ loaded: true, error: errorMessage(e, '') || null });
    }
  },

  addAggregation: async (a) => {
    const prev = get().aggregations;
    try {
      const updated = [...prev, a];
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: unknown) {
      set({ aggregations: prev, error: errorMessage(e, '保存失败') });
      throw e;
    }
  },

  updateAggregation: async (id, partial) => {
    const prev = get().aggregations;
    try {
      const updated = prev.map(a => a.id === id ? { ...a, ...partial } : a);
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: unknown) {
      set({ aggregations: prev, error: errorMessage(e, '保存失败') });
      throw e;
    }
  },

  removeAggregation: async (id) => {
    const prev = get().aggregations;
    try {
      const updated = prev.filter(a => a.id !== id);
      set({ aggregations: updated, error: null });
      await invoke('save_aggregations', { aggregations: updated });
    } catch (e: unknown) {
      set({ aggregations: prev, error: errorMessage(e, '删除失败') });
      throw e;
    }
  },
}));
