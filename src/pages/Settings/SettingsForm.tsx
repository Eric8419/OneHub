import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import {
  Button,
  FormField,
  FormGrid,
  SectionTitle,
  Input,
  Dropdown,
  Switch,
  Card,
  toast,
  AnimatedContent,
} from '../../components/ui';
import { desktopApi } from '../../lib/desktopApi';
import { useT } from '../../i18n';
import { Save, RotateCcw, TriangleAlert } from 'lucide-react';

const sel = (opts: { value: string; label: string }[]) => opts;
const concurrencyOptions = sel([
  { value: '1', label: '1' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
]);
const languageOptions = sel([
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
]);
const themeOptions = sel([
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]);
const pageSizeOptions = sel([
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
]);
const timeFormatOptions = sel([
  { value: '24h', label: '24小时' },
  { value: '12h', label: '12小时' },
]);
const proxyProtocolOptions = sel([
  { value: 'http', label: 'HTTP' },
  { value: 'socks5', label: 'SOCKS5' },
]);
const rateLimitOptions = sel([
  { value: '0', label: '不限' },
  { value: '60', label: '60/分钟' },
  { value: '30', label: '30/分钟' },
  { value: '10', label: '10/分钟' },
]);
const retryOptions = sel([
  { value: '0', label: '不重试' },
  { value: '1', label: '1次' },
  { value: '3', label: '3次' },
  { value: '5', label: '5次' },
]);

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

export const SettingsForm: React.FC = () => {
  const t = useT();
  const { settings, activeCategory, loaded, isDirty, loadSettings, saveSettings, updateSettings, resetSettings } =
    useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openingDir, setOpeningDir] = useState(false);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

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
  const handleSaveSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await saveSettings();
      toast(t('settings.saved'), 'success');
    } catch (e: unknown) {
      toast(errorMessage(e, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const planned = () => (
    <span
      style={{
        display: 'inline-block',
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
        background: 'var(--bg-overlay-l1)',
        padding: '0 var(--spacer-6)',
        borderRadius: 'var(--radius-4)',
        lineHeight: '18px',
        marginLeft: 'var(--spacer-6)',
      }}
    >
      v0.2.0
    </span>
  );

  const handleResetWithConfirm = () => {
    if (window.confirm('确定恢复所有默认值？未保存的修改将丢失。')) {
      resetSettings();
      toast('已恢复默认值', 'info');
    }
  };

  return (
    <div
      style={{
        paddingBottom: isDirty ? 72 : undefined,
        transition: 'padding-bottom var(--transition-normal, 0.2s) ease',
      }}
    >
      <form onSubmit={handleSaveSettings}>
        {/* ═══════════════════════════════════════════════════ 通用设置 */}
        {activeCategory === 'general' && (
          <AnimatedContent>
            <Card style={{ marginBottom: 'var(--spacer-24)' }}>
              <SectionTitle>{t('settings.basic')}</SectionTitle>
              <FormGrid>
                <FormField label="服务地址">
                  <Input type="text" value={settings.host} onChange={(e) => updateSettings({ host: e.target.value })} />
                </FormField>
                <FormField label="代理端口">
                  <Input
                    type="number"
                    value={settings.port.toString()}
                    onChange={(e) => updateSettings({ port: parseInt(e.target.value) || 8080 })}
                  />
                </FormField>
                <FormField label="自动启动">
                  <Switch checked={settings.autoStart} onChange={(v) => updateSettings({ autoStart: v })} />
                </FormField>
                <FormField label="最大并发">
                  <Dropdown
                    options={concurrencyOptions}
                    value={settings.maxConcurrency.toString()}
                    onChange={(v) => updateSettings({ maxConcurrency: parseInt(v) })}
                    size="sm"
                  />
                </FormField>
              </FormGrid>
            </Card>

            <Card>
              <SectionTitle>{t('settings.appearance')}</SectionTitle>
              <FormGrid>
                <FormField label="语言">
                  <Dropdown
                    options={languageOptions}
                    value={settings.language}
                    onChange={(v) => updateSettings({ language: v })}
                    size="sm"
                  />
                </FormField>
                <FormField label="主题">
                  <Dropdown
                    options={themeOptions}
                    value={settings.theme}
                    onChange={(v) => updateSettings({ theme: v })}
                    size="sm"
                  />
                </FormField>
                <FormField label="每页条数">
                  <Dropdown
                    options={pageSizeOptions}
                    value={settings.pageSize.toString()}
                    onChange={(v) => updateSettings({ pageSize: parseInt(v) })}
                    size="sm"
                  />
                  {planned()}
                </FormField>
                <FormField label="时间格式">
                  <Dropdown
                    options={timeFormatOptions}
                    value={settings.timeFormat}
                    onChange={(v) => updateSettings({ timeFormat: v })}
                    size="sm"
                  />
                  {planned()}
                </FormField>
              </FormGrid>
            </Card>
          </AnimatedContent>
        )}

        {/* ═══════════════════════════════════════════════════ 网络代理 */}
        {activeCategory === 'proxy' && (
          <AnimatedContent>
            <Card>
              <SectionTitle>{t('settings.proxyConfig')}</SectionTitle>
              <FormGrid>
                <FormField label="启用代理">
                  <Switch checked={settings.proxyEnabled} onChange={(v) => updateSettings({ proxyEnabled: v })} />
                </FormField>
                <FormField label="代理主机">
                  <Input
                    type="text"
                    value={settings.proxyHost}
                    onChange={(e) => updateSettings({ proxyHost: e.target.value })}
                    placeholder="127.0.0.1"
                  />
                </FormField>
                <FormField label="代理端口">
                  <Input
                    type="number"
                    value={settings.proxyPort.toString()}
                    onChange={(e) => updateSettings({ proxyPort: parseInt(e.target.value) || 7890 })}
                  />
                </FormField>
                <FormField label="代理协议">
                  <Dropdown
                    options={proxyProtocolOptions}
                    value={settings.proxyProtocol}
                    onChange={(v) => updateSettings({ proxyProtocol: v })}
                    size="sm"
                  />
                </FormField>
                <FormField label="用户名">
                  <Input
                    type="text"
                    value={settings.proxyUsername}
                    onChange={(e) => updateSettings({ proxyUsername: e.target.value })}
                    placeholder="可选"
                  />
                </FormField>
                <FormField label="密码">
                  <Input
                    type="password"
                    value={settings.proxyPassword}
                    onChange={(e) => updateSettings({ proxyPassword: e.target.value })}
                    placeholder="可选"
                  />
                </FormField>
              </FormGrid>
            </Card>
          </AnimatedContent>
        )}

        {/* ═══════════════════════════════════════════════════ 日志与监控 */}
        {activeCategory === 'logging' && (
          <AnimatedContent>
            <Card>
              <SectionTitle>{t('settings.logging.title')}</SectionTitle>
              <FormGrid>
                <FormField label="日志保留天数">
                  <Input
                    type="number"
                    value={settings.logRetentionDays.toString()}
                    onChange={(e) => updateSettings({ logRetentionDays: parseInt(e.target.value) || 30 })}
                  />
                </FormField>
                <FormField label="自动清理日志">
                  <Switch checked={settings.logAutoClean} onChange={(v) => updateSettings({ logAutoClean: v })} />
                </FormField>
                <FormField label="">
                  <Button disabled={exporting} onClick={handleExportLogs}>
                    {exporting ? '导出中...' : '导出日志'}
                  </Button>
                </FormField>
                <FormField label="">
                  <Button disabled={openingDir} onClick={handleOpenLogDir}>
                    {openingDir ? '打开中...' : '打开日志目录'}
                  </Button>
                </FormField>
              </FormGrid>
            </Card>
          </AnimatedContent>
        )}

        {/* ═══════════════════════════════════════════════════ 安全与认证 */}
        {activeCategory === 'security' && (
          <AnimatedContent>
            <Card>
              <SectionTitle>{t('settings.security.title')}</SectionTitle>
              <FormGrid>
                <FormField label="API 密钥加密存储">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
                    <Switch checked disabled />
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-success-default)' }}>
                      始终启用
                    </span>
                  </div>
                </FormField>
                <FormField label="本地认证令牌">
                  <Input
                    type="text"
                    value={settings.authToken}
                    onChange={(e) => updateSettings({ authToken: e.target.value })}
                    placeholder="输入令牌..."
                  />
                </FormField>
                <FormField label="IP 白名单">
                  <Input
                    type="text"
                    value={settings.ipWhitelist}
                    onChange={(e) => updateSettings({ ipWhitelist: e.target.value })}
                    placeholder="127.0.0.1, 192.168.1.*"
                  />
                </FormField>
                <FormField label="启用 CORS">
                  <Switch checked={settings.corsEnabled} onChange={(v) => updateSettings({ corsEnabled: v })} />
                </FormField>
                <FormField label="请求速率限制">
                  <Dropdown
                    options={rateLimitOptions}
                    value={settings.rateLimit}
                    onChange={(v) => updateSettings({ rateLimit: v })}
                    size="sm"
                  />
                </FormField>
              </FormGrid>
            </Card>
          </AnimatedContent>
        )}

        {/* ═══════════════════════════════════════════════════ 高级选项 */}
        {activeCategory === 'advanced' && (
          <AnimatedContent>
            <Card>
              <SectionTitle>{t('settings.advanced.title')}</SectionTitle>
              <FormGrid>
                <FormField label="API 超时(秒)">
                  <Input
                    type="number"
                    value={settings.apiTimeout.toString()}
                    onChange={(e) => updateSettings({ apiTimeout: parseInt(e.target.value) || 60 })}
                  />
                </FormField>
                <FormField label="最大重试次数">
                  <Dropdown
                    options={retryOptions}
                    value={settings.maxRetries}
                    onChange={(v) => updateSettings({ maxRetries: v })}
                    size="sm"
                  />
                </FormField>
              </FormGrid>
            </Card>
          </AnimatedContent>
        )}
      </form>

      {/* ═══════════════════════════════════════════════════ Sticky Save Bar */}
      {isDirty && (
        <AnimatedContent duration={220} distance={4}>
          <div
            className="settings-sticky-save"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 220,
              right: 0,
              zIndex: 30,
              padding: 'var(--spacer-10) var(--spacer-24)',
              background: 'var(--bg-base-default)',
              borderTop: '1px solid var(--border-neutral-l1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 -4px 24px color-mix(in srgb, var(--text-default) 6%, transparent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <TriangleAlert size={14} style={{ color: 'var(--status-alert-default)' }} />
              <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                有未保存的修改
              </span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacer-8)', alignItems: 'center' }}>
              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleResetWithConfirm}>
                撤销
              </Button>
              <Button variant="brand" size="sm" icon={Save} disabled={saving} onClick={handleSaveSettings}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </AnimatedContent>
      )}
    </div>
  );
};
