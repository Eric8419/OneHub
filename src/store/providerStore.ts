import { create } from 'zustand';
import type { Provider } from '../types/provider';
import { invoke } from '@tauri-apps/api/core';

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : e ? String(e) : fallback;

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
  // Empty initial state — the UI renders an empty-state prompt.
  // Mock defaults were removed so users never see fake providers
  // (or accidentally route requests through placeholder keys).
  providers: [],
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  loadProviders: async () => {
    try {
      const data = await invoke<Provider[]>('load_providers');
      // Apply loaded data (may be empty on first run).
      set({ providers: data ?? [], loaded: true, error: null });
    } catch (e: unknown) {
      console.warn('[providerStore] load_providers failed:', e);
      set({ loaded: true, error: errorMessage(e, '') || null });
    }
  },

  addProvider: async (p) => {
    const prev = get().providers;
    if (prev.some(existing => existing.id === p.id || existing.name === p.name)) {
      const message = '提供商名称已存在';
      set({ error: message });
      throw new Error(message);
    }
    try {
      const updated = [...prev, p];
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: unknown) {
      // Rollback on failure
      set({ providers: prev, error: errorMessage(e, '保存失败') });
      throw e;
    }
  },

  updateProvider: async (id, partial) => {
    const prev = get().providers;
    try {
      const updated = prev.map(p => p.id === id ? { ...p, ...partial } : p);
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: unknown) {
      set({ providers: prev, error: errorMessage(e, '保存失败') });
      throw e;
    }
  },

  removeProvider: async (id) => {
    const prev = get().providers;
    try {
      const updated = prev.filter(p => p.id !== id);
      set({ providers: updated, error: null });
      await invoke('save_providers', { providers: updated });
    } catch (e: unknown) {
      set({ providers: prev, error: errorMessage(e, '删除失败') });
      throw e;
    }
  },
}));
