import { create } from 'zustand';
import type { AppSettings, SettingsCategory } from '../types/settings';
import { desktopApi } from '../lib/desktopApi';

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const DEFAULT_SETTINGS: AppSettings = {
  port: 8080,
  host: '127.0.0.1',
  autoStart: true,
  maxConcurrency: 20,
  language: 'zh-CN',
  theme: 'light',
  accentColor: '#00B95C',
  pageSize: 10,
  launchAtLogin: false,
  startMinimized: false,
  proxyEnabled: false,
  proxyHost: '',
  proxyPort: 7890,
  proxyProtocol: 'http',
  proxyUsername: '',
  proxyPassword: '',
  authToken: '',
  ipWhitelist: '',
  corsEnabled: true,
  rateLimit: '0',
  apiTimeout: 60,
  maxRetries: '0',
  logRetentionDays: 30,
  logAutoClean: true,
  checkUpdatesOnStart: true,
  updateChannel: 'stable',
};

const AUTO_SAVE_DEBOUNCE_MS = 400;

interface SettingsStore {
  settings: AppSettings;
  activeCategory: SettingsCategory;
  loaded: boolean;
  error: string | null;
  setActiveCategory: (cat: SettingsCategory) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  loadSettings: () => Promise<void>;
  clearError: () => void;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return { ...DEFAULT_SETTINGS, ...settings };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;

function scheduleAutoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void doAutoSave();
  }, AUTO_SAVE_DEBOUNCE_MS);
}

async function doAutoSave() {
  if (pendingSave) return;
  pendingSave = true;
  try {
    const state = useSettingsStore.getState();
    const normalized = normalizeSettings(state.settings);
    await desktopApi.saveSettings(normalized);
    useSettingsStore.setState({ error: null });
  } catch (e: unknown) {
    useSettingsStore.setState({ error: errorMessage(e, '保存失败') });
  } finally {
    pendingSave = false;
  }
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: { ...DEFAULT_SETTINGS },
  activeCategory: 'general',
  loaded: false,
  error: null,

  clearError: () => set({ error: null }),

  setActiveCategory: (activeCategory) => set({ activeCategory }),

  updateSettings: (partial) => {
    set((s) => {
      const newSettings = { ...s.settings, ...partial };
      if (partial.language && partial.language !== s.settings.language) {
        try {
          localStorage.setItem('language', partial.language);
        } catch {
          /* ignore */
        }
      }
      return { settings: newSettings };
    });
    scheduleAutoSave();
  },

  loadSettings: async () => {
    try {
      const data = normalizeSettings(await desktopApi.loadSettings());
      try {
        localStorage.setItem('language', data.language);
      } catch {
        /* ignore */
      }
      set({ settings: { ...data }, loaded: true, error: null });
    } catch (e: unknown) {
      console.warn('[settingsStore] load_settings failed, using defaults:', e);
      set({ loaded: true, error: errorMessage(e, '') || null });
    }
  },
}));
