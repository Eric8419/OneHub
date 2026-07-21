import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useSettingsStore } from '../../store/settingsStore';
import {
  Button,
  Input,
  Switch,
  Card,
  toast,
  AnimatedContent,
  SegmentedControl,
} from '../../components/ui';
import type { SegmentOption } from '../../components/ui/SegmentedControl';
import { desktopApi, onUpdateAvailable, type UpdateMetadata } from '../../lib/desktopApi';
import { isValidHex, normalizeHex } from '../../lib/colorUtils';
import {
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Check,
  Download,
  HelpCircle,
  Rss,
  Globe,
  MessageSquare,
} from 'lucide-react';

// Inline GitHub mark — lucide-react deliberately omits brand icons
// (trademark policy), so we ship a simple 20px monochrome mark that
// inherits currentColor, matching the surrounding icon style.
const GithubMark: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18.92-.26 1.9-.38 2.88-.39.98.01 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.84 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.67.8.56C20.22 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
  </svg>
);

function generateAuthToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const languageOptions: SegmentOption[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

const themeOptions: SegmentOption[] = [
  { value: 'light', label: '浅色', icon: <Sun size={15} /> },
  { value: 'dark', label: '深色', icon: <Moon size={15} /> },
  { value: 'system', label: '系统', icon: <Monitor size={15} /> },
];

const concurrencyOptions: SegmentOption[] = [
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
];

const pageSizeOptions: SegmentOption[] = [
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
];

const proxyProtocolOptions: SegmentOption[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'socks5', label: 'SOCKS5' },
];

const rateLimitOptions: SegmentOption[] = [
  { value: '0', label: '不限' },
  { value: '60', label: '60/分' },
  { value: '30', label: '30/分' },
  { value: '10', label: '10/分' },
];

const retryOptions: SegmentOption[] = [
  { value: '0', label: '不重试' },
  { value: '1', label: '1次' },
  { value: '3', label: '3次' },
  { value: '5', label: '5次' },
];

const COLOR_PRESETS = [
  '#00B95C',
  '#2F74FF',
  '#7C3AED',
  '#E8463A',
  '#F2A90C',
  '#E91E8C',
  '#00B6F5',
  '#171717',
];

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : e ? String(e) : fallback;

interface SettingsGroupProps {
  title?: string;
  isNew?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const SettingsGroup: React.FC<SettingsGroupProps> = ({ title, isNew, children, style }) => (
  <Card
    padding="0"
    style={{
      marginBottom: 16,
      overflow: 'hidden',
      background: 'var(--bg-base-default)',
      ...style,
    }}
  >
    {title && (
      <div
        style={{
          padding: '16px 20px',
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.4,
          color: 'var(--text-default)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {title}
        {isNew && (
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--bg-brand)' }}>New</span>
        )}
      </div>
    )}
    {children}
  </Card>
);

interface SettingsRowProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
  isLast?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ label, children, hint, isLast }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '13px 20px',
      minHeight: 48,
      boxSizing: 'border-box',
      borderBottom: isLast ? 'none' : '1px solid var(--border-neutral-l1)',
      gap: 16,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
      <span style={{ fontSize: 15, color: 'var(--text-default)' }}>{label}</span>
      {hint && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{hint}</span>}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>{children}</div>
  </div>
);

// Link-row for the "关于" links card: icon + label on the left,
// ghost "查看"/"反馈" button on the right. Mirrors the Cherry Studio
// pattern — flat, no border around the whole card, just a bottom
// divider between rows.
interface AboutLinkRowProps {
  icon: React.ReactNode;
  label: string;
  actionLabel: string;
  onClick: () => void;
  isLast?: boolean;
}

const AboutLinkRow: React.FC<AboutLinkRowProps> = ({ icon, label, actionLabel, onClick, isLast }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacer-12)',
      padding: '13px 20px',
      minHeight: 48,
      boxSizing: 'border-box',
      borderBottom: isLast ? 'none' : '1px solid var(--border-neutral-l1)',
    }}
  >
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-secondary)',
      }}
    >
      {icon}
    </span>
    <span style={{ fontSize: 15, color: 'var(--text-default)', flex: 1 }}>{label}</span>
    <Button variant="secondary" size="sm" onClick={onClick}>
      {actionLabel}
    </Button>
  </div>
);

const NumberInput: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  placeholder?: string;
  width?: number;
}> = ({ value, onChange, min, placeholder, width = 80 }) => (
  <Input
    type="number"
    value={value.toString()}
    onChange={(e) => {
      const parsed = parseInt(e.target.value);
      onChange(isNaN(parsed) ? (min ?? 0) : parsed);
    }}
    placeholder={placeholder}
    wrapperStyle={{ width }}
    style={{ textAlign: 'right' }}
  />
);

const TextInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  width?: number;
}> = ({ value, onChange, placeholder, type = 'text', width }) => (
  <Input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    wrapperStyle={width ? { width } : { width: 240 }}
  />
);

export const SettingsForm: React.FC = () => {
  const { settings, activeCategory, loaded, loadSettings, updateSettings, error, clearError } =
    useSettingsStore();
  const [exporting, setExporting] = useState(false);
  const [openingDir, setOpeningDir] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Updater state ──
  // `checking` = in-flight check; `pendingUpdate` = update metadata
  // shown in the confirm dialog; `installing` = download+install in
  // progress; `installProgress` = 0..1 download ratio.
  const [checking, setChecking] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateMetadata | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [appVersion, setAppVersion] = useState('0.0.0');
  const installContentLengthRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loaded) loadSettings();
    getVersion().then(setAppVersion).catch(() => {});
  }, [loaded, loadSettings]);

  useEffect(() => {
    if (error) {
      toast(error, 'error');
      clearError();
    }
  }, [error, clearError]);

  useEffect(() => {
    try {
      desktopApi.initLogDir();
    } catch {
      /* Tauri command may not be available in browser */
    }
  }, []);

  // Startup auto-check listener: when the backend's startup probe
  // finds an update, surface a toast and pre-fill the confirm dialog
  // state so a click on "查看" can open the About page with the
  // metadata ready to install.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onUpdateAvailable((meta) => {
      setPendingUpdate(meta);
      toast(`发现新版本 v${meta.version}，请到「关于」页面查看`, 'info');
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* listener registration can fail when running outside Tauri */
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleCheckUpdates = async () => {
    setChecking(true);
    try {
      const meta = await desktopApi.checkForUpdates();
      if (!meta) {
        toast('当前已是最新版本', 'success');
        setPendingUpdate(null);
      } else {
        setPendingUpdate(meta);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = async () => {
    setInstalling(true);
    setInstallProgress(0);
    installContentLengthRef.current = null;
    try {
      await desktopApi.downloadAndInstallUpdate((event) => {
        if (event.event === 'started') {
          installContentLengthRef.current = event.data.contentLength ?? null;
        } else if (event.event === 'progress') {
          const total = installContentLengthRef.current;
          if (total && total > 0) {
            // Progress events only carry chunkLength, so we accumulate
            // by tracking total in a ref. We can't read state here
            // (stale closure), so recompute from the event stream.
            setInstallProgress((prev) => {
              const next = prev + event.data.chunkLength / total;
              return Math.min(next, 1);
            });
          }
        } else if (event.event === 'finished') {
          setInstallProgress(1);
        }
      });
      toast('更新已安装，应用即将重启', 'success');
      // Give the toast a moment to render before the process restarts.
      setTimeout(() => {
        desktopApi.exitApp();
      }, 800);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setInstalling(false);
      setInstallProgress(0);
    }
  };

  const handleDismissUpdate = () => {
    if (installing) return;
    setPendingUpdate(null);
    setInstallProgress(0);
  };

  const handleExportLogs = async () => {
    setExporting(true);
    try {
      const path = await desktopApi.exportLogs();
      toast(`日志已导出到: ${path}`, 'success');
    } catch (e: unknown) {
      toast(errorMessage(e, '导出失败'), 'error');
    } finally {
      setExporting(false);
    }
  };
  const handleOpenLogDir = async () => {
    setOpeningDir(true);
    try {
      await desktopApi.openLogDir();
      toast('已打开日志目录', 'info');
    } catch (e: unknown) {
      toast(errorMessage(e, '打开失败'), 'error');
    } finally {
      setOpeningDir(false);
    }
  };

  const handleRefreshToken = () => {
    const msg = settings.authToken
      ? '刷新令牌后旧令牌将失效，所有使用旧令牌的请求需要更新，确定继续？'
      : '将生成一个新的随机认证令牌，确定继续？';
    if (window.confirm(msg)) {
      updateSettings({ authToken: generateAuthToken() });
      toast('令牌已刷新', 'success');
    }
  };

  const handleCopyToken = async () => {
    if (!settings.authToken) return;
    try {
      await navigator.clipboard.writeText(settings.authToken);
      setCopied(true);
      toast('令牌已复制到剪贴板', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('复制失败', 'error');
    }
  };

  return (
    <div>
      {/* ═══════════════════════════════════════════════════ 通用设置 */}
      {activeCategory === 'general' && (
        <AnimatedContent>
          <SettingsGroup title="显示设置">
            <SettingsRow label="语言">
              <SegmentedControl
                options={languageOptions}
                value={settings.language}
                onChange={(v) => updateSettings({ language: v })}
              />
            </SettingsRow>
            <SettingsRow label="主题">
              <SegmentedControl
                options={themeOptions}
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
              />
            </SettingsRow>
            <SettingsRow label="主题色">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {COLOR_PRESETS.map((color) => {
                    const isSelected = normalizeHex(settings.accentColor) === normalizeHex(color);
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => updateSettings({ accentColor: normalizeHex(color) })}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: color,
                          border: isSelected ? `2px solid ${color}` : '2px solid transparent',
                          boxShadow: isSelected
                            ? `0 0 0 2px var(--bg-base-default), 0 0 0 4px ${color}`
                            : '0 0 0 1px var(--border-neutral-l2)',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'box-shadow 0.15s ease',
                        }}
                        aria-label={`选择主题色 ${color}`}
                      />
                    );
                  })}
                </div>
                <Input
                  type="text"
                  value={settings.accentColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isValidHex(v) || v === '#' || v.length < 7) {
                      updateSettings({ accentColor: v.toUpperCase() });
                    }
                  }}
                  onBlur={(e) => {
                    if (isValidHex(e.target.value)) {
                      updateSettings({ accentColor: normalizeHex(e.target.value) });
                    } else {
                      updateSettings({ accentColor: '#00B95C' });
                    }
                  }}
                  wrapperStyle={{ width: 96 }}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, textAlign: 'center' }}
                  maxLength={7}
                />
              </div>
            </SettingsRow>
            <SettingsRow label="每页条数" isLast>
              <SegmentedControl
                options={pageSizeOptions}
                value={settings.pageSize.toString()}
                onChange={(v) => updateSettings({ pageSize: parseInt(v) })}
                size="sm"
              />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="基础配置">
            <SettingsRow label="服务地址">
              <TextInput value={settings.host} onChange={(v) => updateSettings({ host: v })} />
            </SettingsRow>
            <SettingsRow label="代理端口">
              <NumberInput value={settings.port} onChange={(v) => updateSettings({ port: v })} min={1} />
            </SettingsRow>
            <SettingsRow label="自动启动" hint="应用启动时自动运行代理服务">
              <Switch checked={settings.autoStart} onChange={(v) => updateSettings({ autoStart: v })} />
            </SettingsRow>
            <SettingsRow label="最大并发" isLast>
              <SegmentedControl
                options={concurrencyOptions}
                value={settings.maxConcurrency.toString()}
                onChange={(v) => updateSettings({ maxConcurrency: parseInt(v) })}
                size="sm"
              />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="应用设置" isNew>
            <SettingsRow label="开机启动" hint="系统启动时自动运行 Melody Hub">
              <Switch
                checked={settings.launchAtLogin}
                onChange={(v) => updateSettings({ launchAtLogin: v })}
              />
            </SettingsRow>
            <SettingsRow label="启动时最小化到托盘" hint="下次启动生效" isLast>
              <Switch
                checked={settings.startMinimized}
                onChange={(v) => updateSettings({ startMinimized: v })}
              />
            </SettingsRow>
          </SettingsGroup>
        </AnimatedContent>
      )}

      {/* ═══════════════════════════════════════════════════ 安全与认证 */}
      {activeCategory === 'security' && (
        <AnimatedContent>
          <SettingsGroup title="安全与认证">
            <SettingsRow label="本地认证令牌">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={settings.authToken}
                  onChange={(e) => updateSettings({ authToken: e.target.value })}
                  placeholder="点击右侧按钮生成随机令牌"
                  wrapperStyle={{ width: 280, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
                />
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={() => setShowToken(v => !v)}
                  aria-label={showToken ? '隐藏令牌' : '显示令牌'}
                  title={showToken ? '隐藏令牌' : '显示令牌'}
                >
                  {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={handleCopyToken}
                  disabled={!settings.authToken}
                  aria-label="复制令牌"
                  title="复制令牌"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
                <button
                  type="button"
                  className="icon-action-btn"
                  onClick={handleRefreshToken}
                  aria-label="刷新令牌"
                  title="生成新令牌"
                >
                  <RefreshCw size={18} />
                </button>
              </div>
            </SettingsRow>
            <SettingsRow label="IP 白名单">
              <TextInput
                value={settings.ipWhitelist}
                onChange={(v) => updateSettings({ ipWhitelist: v })}
                placeholder="127.0.0.1, 192.168.1.*"
              />
            </SettingsRow>
            <SettingsRow label="启用 CORS">
              <Switch checked={settings.corsEnabled} onChange={(v) => updateSettings({ corsEnabled: v })} />
            </SettingsRow>
            <SettingsRow label="请求速率限制" isLast>
              <SegmentedControl
                options={rateLimitOptions}
                value={settings.rateLimit}
                onChange={(v) => updateSettings({ rateLimit: v })}
                size="sm"
              />
            </SettingsRow>
          </SettingsGroup>
        </AnimatedContent>
      )}

      {/* ═══════════════════════════════════════════════════ 网络代理 */}
      {activeCategory === 'proxy' && (
        <AnimatedContent>
          <SettingsGroup title="网络代理配置">
            <SettingsRow label="启用代理">
              <Switch checked={settings.proxyEnabled} onChange={(v) => updateSettings({ proxyEnabled: v })} />
            </SettingsRow>
            <SettingsRow label="代理主机">
              <TextInput
                value={settings.proxyHost}
                onChange={(v) => updateSettings({ proxyHost: v })}
                placeholder="127.0.0.1"
              />
            </SettingsRow>
            <SettingsRow label="代理端口">
              <NumberInput
                value={settings.proxyPort}
                onChange={(v) => updateSettings({ proxyPort: v })}
                min={1}
              />
            </SettingsRow>
            <SettingsRow label="代理协议">
              <SegmentedControl
                options={proxyProtocolOptions}
                value={settings.proxyProtocol}
                onChange={(v) => updateSettings({ proxyProtocol: v })}
                size="sm"
              />
            </SettingsRow>
            <SettingsRow label="用户名">
              <TextInput
                value={settings.proxyUsername}
                onChange={(v) => updateSettings({ proxyUsername: v })}
                placeholder="可选"
              />
            </SettingsRow>
            <SettingsRow label="密码" isLast>
              <TextInput
                value={settings.proxyPassword}
                onChange={(v) => updateSettings({ proxyPassword: v })}
                placeholder="可选"
                type="password"
              />
            </SettingsRow>
          </SettingsGroup>
        </AnimatedContent>
      )}

      {/* ═══════════════════════════════════════════════════ 高级选项 */}
      {activeCategory === 'advanced' && (
        <AnimatedContent>
          <SettingsGroup title="高级选项">
            <SettingsRow label="API 超时(秒)">
              <NumberInput
                value={settings.apiTimeout}
                onChange={(v) => updateSettings({ apiTimeout: v })}
                min={1}
              />
            </SettingsRow>
            <SettingsRow label="最大重试次数" isLast>
              <SegmentedControl
                options={retryOptions}
                value={settings.maxRetries}
                onChange={(v) => updateSettings({ maxRetries: v })}
                size="sm"
              />
            </SettingsRow>
          </SettingsGroup>

          <SettingsGroup title="日志与监控">
            <SettingsRow label="日志保留天数">
              <NumberInput
                value={settings.logRetentionDays}
                onChange={(v) => updateSettings({ logRetentionDays: v })}
                min={1}
              />
            </SettingsRow>
            <SettingsRow label="自动清理日志">
              <Switch checked={settings.logAutoClean} onChange={(v) => updateSettings({ logAutoClean: v })} />
            </SettingsRow>
            <SettingsRow label="" isLast>
              <Button disabled={exporting} onClick={handleExportLogs}>
                {exporting ? '导出中...' : '导出日志'}
              </Button>
              <Button disabled={openingDir} variant="secondary" onClick={handleOpenLogDir}>
                {openingDir ? '打开中...' : '打开日志目录'}
              </Button>
            </SettingsRow>
          </SettingsGroup>
        </AnimatedContent>
      )}

      {/* ═══════════════════════════════════════════════════ 关于 */}
      {activeCategory === 'about' && (
        <AnimatedContent>
          {/* ── About / Update card ────────────────────────── */}
          <SettingsGroup>
            {/* Header row: title + GitHub link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  color: 'var(--text-default)',
                }}
              >
                关于我们
              </span>
              <button
                type="button"
                onClick={() => openUrl('https://github.com/Lhy723/MelodyHub').catch(() => {})}
                title="在浏览器中打开 GitHub 仓库"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  padding: 0,
                  border: 'none',
                  borderRadius: 'var(--radius-8)',
                  background: 'transparent',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                  e.currentTarget.style.color = 'var(--text-default)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-tertiary)';
                }}
              >
                <GithubMark size={20} />
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border-neutral-l1)' }} />

            {/* Hero row: logo + name/slogan/version + check-update button */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-16)',
                padding: 'var(--spacer-24) var(--spacer-20)',
              }}
            >
              <img
                src="/brand/app-icon-1024.png"
                alt="Melody Hub"
                width={72}
                height={72}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 16,
                  flexShrink: 0,
                  userSelect: 'none',
                }}
                draggable={false}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'var(--heading-md-font-size)',
                    fontWeight: 'var(--heading-md-font-weight)',
                    lineHeight: 'var(--heading-md-line-height)',
                    color: 'var(--text-default)',
                  }}
                >
                  Melody Hub
                </div>
                <div
                  style={{
                    fontSize: 'var(--body-base-font-size)',
                    color: 'var(--text-tertiary)',
                    marginTop: 2,
                  }}
                >
                  一款面向开发者的本地 LLM 代理服务
                </div>
                <div style={{ marginTop: 8, display: 'inline-flex' }}>
                  <span
                    style={{
                      fontSize: 'var(--body-sm-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--bg-brand)',
                      padding: '2px 10px',
                      border: '1px solid color-mix(in srgb, var(--bg-brand) 40%, transparent)',
                      borderRadius: 'var(--radius-6)',
                      background: 'color-mix(in srgb, var(--bg-brand) 10%, transparent)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    v{pendingUpdate?.currentVersion ?? appVersion}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                icon={RefreshCw}
                loading={checking}
                onClick={handleCheckUpdates}
                disabled={installing}
                size="md"
              >
                {checking ? '检查中...' : '检查更新'}
              </Button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border-neutral-l1)' }} />

            {/* Auto-update row */}
            <SettingsRow label="自动更新" isLast>
              <Switch
                checked={settings.checkUpdatesOnStart}
                onChange={(v) => updateSettings({ checkUpdatesOnStart: v })}
              />
            </SettingsRow>
          </SettingsGroup>

          {/* ── Links card ─────────────────────────────────── */}
          <SettingsGroup>
            <AboutLinkRow
              icon={<HelpCircle size={20} />}
              label="帮助文档"
              actionLabel="查看"
              onClick={() => openUrl('https://github.com/Lhy723/MelodyHub#readme').catch(() => {})}
            />
            <AboutLinkRow
              icon={<Rss size={20} />}
              label="更新日志"
              actionLabel="查看"
              onClick={() => openUrl('https://github.com/Lhy723/MelodyHub/releases').catch(() => {})}
            />
            <AboutLinkRow
              icon={<Globe size={20} />}
              label="官方网站"
              actionLabel="查看"
              onClick={() => openUrl('https://github.com/Lhy723/MelodyHub').catch(() => {})}
            />
            <AboutLinkRow
              icon={<MessageSquare size={20} />}
              label="意见反馈"
              actionLabel="反馈"
              onClick={() => openUrl('https://github.com/Lhy723/MelodyHub/issues').catch(() => {})}
              isLast
            />
          </SettingsGroup>

          {/* ── Data management (kept but de-emphasized) ─── */}
          <SettingsGroup title="数据管理">
            <SettingsRow label="" isLast>
              <Button onClick={() => toast('配置导出功能开发中', 'info')}>导出配置</Button>
              <Button variant="secondary" onClick={() => toast('配置导入功能开发中', 'info')}>
                导入配置
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm('确定重置所有数据？此操作不可撤销。')) {
                    toast('重置功能开发中', 'info');
                  }
                }}
              >
                重置所有数据
              </Button>
            </SettingsRow>
          </SettingsGroup>
        </AnimatedContent>
      )}

      {/* ── Update confirm / install dialog ──
          Rendered as a portal-like overlay whenever `pendingUpdate`
          is set. During install, shows a progress bar and disables
          dismiss actions. */}
      <AnimatePresence>
        {pendingUpdate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleDismissUpdate();
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                background: 'var(--bg-overlay-l2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-12)',
                padding: 'var(--spacer-24)',
                width: 420,
                maxWidth: '90vw',
                boxShadow: 'var(--shadow-floating)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-12)',
                  marginBottom: 'var(--spacer-16)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-10)',
                    background: 'var(--bg-brand)',
                    color: 'var(--text-onbrand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Download size={18} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 'var(--heading-xs-font-size)',
                      fontWeight: 'var(--font-weight-strong)',
                      color: 'var(--text-default)',
                    }}
                  >
                    发现新版本
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--body-xs-font-size)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    v{pendingUpdate.currentVersion} → v{pendingUpdate.version}
                  </div>
                </div>
              </div>

              {pendingUpdate.body && (
                <div
                  style={{
                    marginBottom: 'var(--spacer-16)',
                    padding: 'var(--spacer-12)',
                    background: 'var(--bg-overlay-l1)',
                    borderRadius: 'var(--radius-8)',
                    maxHeight: 160,
                    overflowY: 'auto',
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                  }}
                >
                  {pendingUpdate.body}
                </div>
              )}

              {installing && (
                <div style={{ marginBottom: 'var(--spacer-16)' }}>
                  <div
                    style={{
                      height: 8,
                      background: 'var(--bg-overlay-l1)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <motion.div
                      animate={{ width: `${Math.round(installProgress * 100)}%` }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--bg-brand), var(--bg-brand-hover))',
                        borderRadius: 'var(--radius-full)',
                        position: 'relative',
                        overflow: 'hidden',
                        // Celebration pulse when the download completes:
                        // the bar briefly radiates a brand-colored ring
                        // before the installer takes over.
                        animation:
                          installProgress >= 1
                            ? 'progressDonePulse 0.9s ease-out'
                            : 'none',
                      }}
                    >
                      {/* Shimmer overlay — a soft highlight that sweeps
                          across the filled portion while the download
                          is still in progress. Paused at 100% so the
                          done-pulse animation owns the spotlight. */}
                      {installProgress < 1 && (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                              'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%)',
                            transform: 'translateX(-120%)',
                            animation: 'progressShimmer 1.4s ease-in-out infinite',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </motion.div>
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--spacer-10)',
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'center',
                      gap: 'var(--spacer-4)',
                    }}
                  >
                    <motion.span
                      key={Math.round(installProgress * 100)}
                      initial={{ opacity: 0.4, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        fontSize: 18,
                        fontWeight: 'var(--font-weight-strong)',
                        color: installProgress >= 1 ? 'var(--bg-brand)' : 'var(--text-default)',
                        fontVariantNumeric: 'tabular-nums',
                        fontFeatureSettings: '"tnum"',
                      }}
                    >
                      {Math.round(installProgress * 100)}
                    </motion.span>
                    <span
                      style={{
                        fontSize: 'var(--body-xs-font-size)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {installProgress >= 1 ? '% · 正在安装...' : '%'}
                    </span>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacer-8)',
                  justifyContent: 'flex-end',
                }}
              >
                <Button
                  variant="secondary"
                  onClick={handleDismissUpdate}
                  disabled={installing}
                >
                  稍后
                </Button>
                <Button
                  variant="brand"
                  icon={Download}
                  loading={installing}
                  onClick={handleInstallUpdate}
                  disabled={checking}
                >
                  {installing ? '安装中...' : '下载并安装'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
