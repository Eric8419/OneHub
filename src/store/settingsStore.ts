import { create } from 'zustand';
import type { AppSettings, SettingsCategory } from '../types/settings';
import { desktopApi } from '../lib/desktopApi';

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const DEFAULT_SETTINGS: AppSettings = {
  // 通用
  port: 8080,
  host: '127.0.0.1',
  autoStart: true,
  maxConcurrency: 20,
  // 界面
  language: 'zh-CN',
  theme: 'light',
  pageSize: 10,
  // 通知
  notificationsEnabled: true,
  desktopNotifications: false,
  // 网络代理
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: 7890,
  proxyProtocol: 'http',
  proxyUsername: '',
  proxyPassword: '',
  // 安全与认证
  authToken: '',
  ipWhitelist: '',
  corsEnabled: true,
  rateLimit: '0',
  // 高级选项（含日志）
  apiTimeout: 60,
  maxRetries: '0',
  logRetentionDays: 30,
  logAutoClean: true,
  // 关于
  checkUpdatesOnStart: true,
  updateChannel: 'stable',
};

interface SettingsStore {
  settings: AppSettings;
  /** Snapshot of settings at last save (for dirty detection) */
  savedSettings: AppSettings;
  activeCategory: SettingsCategory;
  loaded: boolean;
  error: string | null;
  /** Is there unsaved changes? */
  isDirty: boolean;
  setActiveCategory: (cat: SettingsCategory) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  resetSettings: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  clearError: () => void;
}

function deepEqual(a: AppSettings, b: AppSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  savedSettings: { ...DEFAULT_SETTINGS },
  activeCategory: 'general',
  loaded: false,
  error: null,
  isDirty: false,

  clearError: () => set({ error: null }),

  setActiveCategory: (activeCategory) => set({ activeCategory }),

  updateSettings: (partial) =>
    set((s) => {
      const newSettings = { ...s.settings, ...partial };
      // Keep localStorage in sync with the active language so the
      // non-hook `t()` helper (used by toasts) reads the right locale.
      if (partial.language && partial.language !== s.settings.language) {
        try {
          localStorage.setItem('language', partial.language);
        } catch {
          /* ignore */
        }
      }
      return {
        settings: newSettings,
        isDirty: !deepEqual(newSettings, s.savedSettings),
      };
    }),

  resetSettings: () =>
    set((s) => {
      const newSettings = { ...DEFAULT_SETTINGS };
      return {
        settings: newSettings,
        isDirty: !deepEqual(newSettings, s.savedSettings),
      };
    }),

  loadSettings: async () => {
    try {
      const data = normalizeSettings(await desktopApi.loadSettings());
      // Sync localStorage with the persisted language.
      try {
        localStorage.setItem('language', data.language);
      } catch {
        /* ignore */
      }
      set({ settings: { ...data }, savedSettings: { ...data }, loaded: true, error: null, isDirty: false });
    } catch (e: unknown) {
      console.warn('[settingsStore] load_settings failed, using defaults:', e);
      set({ loaded: true, error: errorMessage(e, '') || null, isDirty: false });
    }
  },

  saveSettings: async () => {
    try {
      const { settings } = get();
      const normalized = normalizeSettings(settings);
      await desktopApi.saveSettings(normalized);
      set({ settings: { ...normalized }, savedSettings: { ...normalized }, error: null, isDirty: false });
    } catch (e: unknown) {
      set({ error: errorMessage(e, '保存设置失败') });
      throw e;
    }
  },
}));
