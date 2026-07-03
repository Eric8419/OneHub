export interface AppSettings {
  // ── 通用 ──
  port: number;
  host: string;
  autoStart: boolean;
  maxConcurrency: number;

  // ── Token ──
  tokenLimit: number;
  tokenWarningThreshold: string;
  tokenStatPeriod: string;

  // ── 界面 ──
  language: string;
  theme: string;
  pageSize: number;
  timeFormat: string;

  // ── 通知 ──
  apiErrorNotify: boolean;
  quotaNotify: boolean;
  modelStatusNotify: boolean;

  // ── 网络代理 ──
  proxyEnabled: boolean;
  proxyHost: string;
  proxyPort: number;
  proxyProtocol: string;
  proxyUsername: string;
  proxyPassword: string;

  // ── 日志与监控 ──
  logLevel: string;
  logRetentionDays: number;
  logRequestContent: boolean;
  logAutoClean: boolean;

  // ── 安全与认证 ──
  encryptApiKeys: boolean;
  authToken: string;
  ipWhitelist: string;
  corsEnabled: boolean;
  rateLimit: string;
  auditLog: boolean;

  // ── 高级选项 ──
  debugMode: boolean;
  apiTimeout: number;
  maxRetries: string;
  cacheStrategy: string;
  dataPath: string;
  experimentalFeatures: boolean;
}

export type SettingsCategory = 'general' | 'proxy' | 'logging' | 'security' | 'advanced';