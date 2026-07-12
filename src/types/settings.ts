export interface AppSettings {
  // ── 通用 ──
  port: number;
  host: string;
  autoStart: boolean;
  maxConcurrency: number;

  // ── 界面 ──
  language: string;
  theme: string;
  pageSize: number;
  timeFormat: string;

  // ── 网络代理 ──
  proxyEnabled: boolean;
  proxyHost: string;
  proxyPort: number;
  proxyProtocol: string;
  proxyUsername: string;
  proxyPassword: string;

  // ── 日志与监控 ──
  logRetentionDays: number;
  logAutoClean: boolean;

  // ── 安全与认证 ──
  encryptApiKeys: boolean;
  authToken: string;
  ipWhitelist: string;
  corsEnabled: boolean;
  rateLimit: string;

  // ── 高级选项 ──
  apiTimeout: number;
  maxRetries: string;
}

export type SettingsCategory = 'general' | 'proxy' | 'logging' | 'security' | 'advanced';
