import { create } from 'zustand';
import type { AppSettings, SettingsCategory } from '../types/settings';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_SETTINGS: AppSettings = {
  // 通用
  port: 8080, host: '127.0.0.1', autoStart: true, maxConcurrency: 20,
  // Token
  tokenLimit: 1000000, tokenWarningThreshold: '80%', tokenStatPeriod: 'daily',
  // 界面
  language: 'zh-CN', theme: 'light', pageSize: 10, timeFormat: '24h',
  // 通知
  apiErrorNotify: true, quotaNotify: true, modelStatusNotify: false,
  // 网络代理
  proxyEnabled: false, proxyHost: '', proxyPort: 7890, proxyProtocol: 'http', proxyUsername: '', proxyPassword: '',
  // 日志与监控
  logLevel: 'info', logRetentionDays: 30, logRequestContent: true, logAutoClean: true,
  // 安全与认证
  encryptApiKeys: true, authToken: '', ipWhitelist: '', corsEnabled: true, rateLimit: '0', auditLog: false,
  // 高级选项
  debugMode: false, apiTimeout: 60, maxRetries: '0', cacheStrategy: 'none', dataPath: '~/.melody-hub/data', experimentalFeatures: false,
};

interface SettingsStore {
  settings: AppSettings;
  activeCategory: SettingsCategory;
  loaded: boolean;
  error: string | null;
  setActiveCategory: (cat: SettingsCategory) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  clearError: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  activeCategory: 'general',
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  setActiveCategory: (activeCategory) => set({ activeCategory }),

  updateSettings: (partial) => set(s => ({ settings: { ...s.settings, ...partial } })),

  resetSettings: () => set({ settings: { ...DEFAULT_SETTINGS } }),

  loadSettings: async () => {
    try {
      const data = await invoke<AppSettings>('load_settings');
      set({ settings: data, loaded: true, error: null });
    } catch (e: any) {
      console.warn('[settingsStore] load_settings failed, using defaults:', e);
      set({ loaded: true, error: e?.toString() || null });
    }
  },

  saveSettings: async () => {
    try {
      const { settings } = get();
      await invoke('save_settings', { settings });
      set({ error: null });
    } catch (e: any) {
      set({ error: e?.toString() || '保存设置失败' });
      throw e;
    }
  },
}));