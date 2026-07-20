import { describe, it, expect, vi, beforeEach } from 'vitest';
import { desktopApi } from './desktopApi';
import type { AppSettings } from '../types/settings';
import type { Provider } from '../types/provider';
import type { Aggregation } from '../types/aggregation';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const { invoke } = await import('@tauri-apps/api/core');

const settingsFixture: AppSettings = {
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
  logRetentionDays: 30,
  logAutoClean: true,
  authToken: '',
  ipWhitelist: '',
  corsEnabled: true,
  rateLimit: '0',
  apiTimeout: 60,
  maxRetries: '0',
  checkUpdatesOnStart: true,
  updateChannel: 'stable',
};

const providerFixture: Provider = {
  id: 'test-provider',
  name: 'Test Provider',
  apiBase: 'https://api.example.com',
  apiKey: 'sk-test',
  status: 'connected',
  models: [],
};

const aggregationFixture: Aggregation = {
  id: 'test-agg',
  name: 'Test Aggregation',
  models: 'gpt-4o,claude-4',
  strategy: 'round-robin',
  priority: '1',
  enabled: true,
};

describe('desktopApi command contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the canonical command and payload for loadSettings', async () => {
    vi.mocked(invoke).mockResolvedValue(settingsFixture);
    const result = await desktopApi.loadSettings();
    expect(invoke).toHaveBeenCalledWith('load_settings');
    expect(result).toEqual(settingsFixture);
  });

  it('uses the canonical command and payload for saveSettings', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveSettings(settingsFixture);
    expect(invoke).toHaveBeenCalledWith('save_settings', { settings: settingsFixture });
  });

  it('uses the canonical command and payload for loadProviders', async () => {
    vi.mocked(invoke).mockResolvedValue([providerFixture]);
    const result = await desktopApi.loadProviders();
    expect(invoke).toHaveBeenCalledWith('load_providers');
    expect(result).toEqual([providerFixture]);
  });

  it('uses the canonical command and payload for saveProviders', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveProviders([providerFixture]);
    expect(invoke).toHaveBeenCalledWith('save_providers', { providers: [providerFixture] });
  });

  it('uses the canonical command and payload for loadAggregations', async () => {
    vi.mocked(invoke).mockResolvedValue([aggregationFixture]);
    const result = await desktopApi.loadAggregations();
    expect(invoke).toHaveBeenCalledWith('load_aggregations');
    expect(result).toEqual([aggregationFixture]);
  });

  it('uses the canonical command and payload for saveAggregations', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.saveAggregations([aggregationFixture]);
    expect(invoke).toHaveBeenCalledWith('save_aggregations', { aggregations: [aggregationFixture] });
  });

  it('uses the canonical command and payload for startProxy', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.startProxy('127.0.0.1', 8080);
    expect(invoke).toHaveBeenCalledWith('start_proxy', { host: '127.0.0.1', port: 8080 });
  });

  it('uses the canonical command and payload for stopProxy', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await desktopApi.stopProxy();
    expect(invoke).toHaveBeenCalledWith('stop_proxy');
  });

  it('uses the canonical command for getProxyStatus', async () => {
    vi.mocked(invoke).mockResolvedValue({ running: true, host: '127.0.0.1', port: 8080, uptimeSecs: 120 });
    const result = await desktopApi.getProxyStatus();
    expect(invoke).toHaveBeenCalledWith('get_proxy_status');
    expect(result).toEqual({ running: true, host: '127.0.0.1', port: 8080, uptimeSecs: 120 });
  });

  it('propagates errors from the mocked transport', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('IPC error'));
    await expect(desktopApi.loadSettings()).rejects.toThrow('IPC error');
  });
});
