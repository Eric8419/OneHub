import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../types/settings';
import type { Provider } from '../types/provider';
import type { Aggregation } from '../types/aggregation';
import type { UsageStats, RequestRecord, DailyUsage } from '../types/stats';

export interface DesktopApi {
  loadSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  loadProviders(): Promise<Provider[]>;
  saveProviders(providers: Provider[]): Promise<void>;
  loadAggregations(): Promise<Aggregation[]>;
  saveAggregations(aggregations: Aggregation[]): Promise<void>;
  startProxy(host: string, port: number): Promise<void>;
  stopProxy(): Promise<void>;
  getProxyStatus(): Promise<{ running: boolean; host: string; port: number; uptimeSecs: number }>;
  getStats(timeRange: string): Promise<UsageStats>;
  getRecentRequests(limit: number): Promise<RequestRecord[]>;
  getDailyUsage(): Promise<DailyUsage[]>;
  resetStats(): Promise<void>;
  exitApp(): Promise<void>;
  initLogDir(): Promise<void>;
  openLogDir(): Promise<void>;
  exportLogs(): Promise<string>;
  fetchProviderModels(
    flavor: string,
    apiBase: string,
    apiKey: string,
  ): Promise<{ success: boolean; models: Array<{ id: string; name: string }>; message: string }>;
  testProviderConnection(
    flavor: string,
    apiBase: string,
    apiKey: string,
  ): Promise<{ success: boolean; modelCount?: number; error?: { kind: string; message: string }; message: string }>;
}

export const desktopApi: DesktopApi = {
  loadSettings: () => invoke<AppSettings>('load_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),
  loadProviders: () => invoke<Provider[]>('load_providers'),
  saveProviders: (providers) => invoke('save_providers', { providers }),
  loadAggregations: () => invoke<Aggregation[]>('load_aggregations'),
  saveAggregations: (aggregations) => invoke('save_aggregations', { aggregations }),
  startProxy: (host, port) => invoke('start_proxy', { host, port }),
  stopProxy: () => invoke('stop_proxy'),
  getProxyStatus: () =>
    invoke<{ running: boolean; host: string; port: number; uptimeSecs: number }>('get_proxy_status'),
  getStats: (timeRange) => invoke<UsageStats>('get_stats', { timeRange }),
  getRecentRequests: (limit) => invoke<RequestRecord[]>('get_recent_requests', { limit }),
  getDailyUsage: () => invoke<DailyUsage[]>('get_daily_usage'),
  resetStats: () => invoke('reset_stats'),
  exitApp: () => invoke('exit_app'),
  initLogDir: () => invoke('init_log_dir'),
  openLogDir: () => invoke('open_log_dir'),
  exportLogs: () => invoke<string>('export_logs'),
  fetchProviderModels: (flavor, apiBase, apiKey) => invoke('fetch_provider_models', { flavor, apiBase, apiKey }),
  testProviderConnection: (flavor, apiBase, apiKey) => invoke('test_provider_connection', { flavor, apiBase, apiKey }),
};
