import zh from './zh-CN';
import en from './en';
import { useSettingsStore } from '../store/settingsStore';

type Locale = Record<string, string>;

const locales: Record<string, Locale> = { 'zh-CN': zh, en };

export function useT() {
  const lang = useSettingsStore(s => s.settings.language);
  const locale = locales[lang] || zh;

  return (key: string, params?: Record<string, string | number>): string => {
    let text = locale[key];
    if (!text) {
      // Fallback: try zh, then show key
      text = zh[key] || key;
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

// 用于非 Hook 场景（比如 toast 调用）。语言现在由 settingsStore
// 同步写入 localStorage，所以这里能读到正确值；若读取失败则回退到
// zh-CN（与默认设置保持一致）。
export function t(key: string, params?: Record<string, string | number>): string {
  const storedLang = (() => {
    try { return localStorage.getItem('language') || 'zh-CN'; } catch { return 'zh-CN'; }
  })();
  const locale = locales[storedLang] || zh;
  let text = locale[key] || zh[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}