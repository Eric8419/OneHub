export interface AppSettings {
  // ── 通用 ──
  port: number;
  host: string;
  autoStart: boolean;
  maxConcurrency: number;

  // ── 界面 ──
  language: string;
  theme: string;
  accentColor: string;
  pageSize: number;

  // ── 应用 ──
  launchAtLogin: boolean;
  startMinimized: boolean;

  // ── 通知 ──
  notificationsEnabled: boolean;
  desktopNotifications: boolean;

  // ── 网络代理 ──
  proxyEnabled: boolean;
  proxyHost: string;
  proxyPort: number;
  proxyProtocol: string;
  proxyUsername: string;
  proxyPassword: string;

  // ── 安全与认证 ──
  authToken: string;
  ipWhitelist: string;
  corsEnabled: boolean;
  rateLimit: string;

  // ── 高级选项（含日志） ──
  apiTimeout: number;
  maxRetries: string;
  logRetentionDays: number;
  logAutoClean: boolean;

  // ── 关于 ──
  checkUpdatesOnStart: boolean;
  updateChannel: string;
}

export type SettingsCategory = 'general' | 'security' | 'proxy' | 'advanced' | 'about';
