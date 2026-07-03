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

// 用于非 Hook 场景（比如 toast 调用）
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = locales[localStorage.getItem('language') || 'zh-CN'] || zh;
  let text = locale[key] || zh[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}