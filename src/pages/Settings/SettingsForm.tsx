import { useState, useEffect } from 'react';
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
import { desktopApi } from '../../lib/desktopApi';
import { isValidHex, normalizeHex } from '../../lib/colorUtils';
import { Sun, Moon, Monitor, RefreshCw, Copy, Eye, EyeOff, Check } from 'lucide-react';

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

const updateChannelOptions: SegmentOption[] = [
  { value: 'stable', label: '稳定版' },
  { value: 'beta', label: '测试版' },
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
  title: string;
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

  useEffect(() => {
    if (!loaded) loadSettings();
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
          <SettingsGroup title="更新检查">
            <SettingsRow label="启动时检查更新">
              <Switch
                checked={settings.checkUpdatesOnStart}
                onChange={(v) => updateSettings({ checkUpdatesOnStart: v })}
              />
            </SettingsRow>
            <SettingsRow label="更新通道" isLast>
              <SegmentedControl
                options={updateChannelOptions}
                value={settings.updateChannel}
                onChange={(v) => updateSettings({ updateChannel: v })}
                size="sm"
              />
            </SettingsRow>
          </SettingsGroup>

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
    </div>
  );
};
