import { useState, useEffect, useRef } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { useStatsStore } from '../../store/statsStore';
import { Button, FormField, FormGrid, SectionTitle, Input, Dropdown, Switch, toast, AnimatedContent } from '../../components/ui';
import { invoke } from '@tauri-apps/api/core';
import { useT } from '../../i18n';
import { Save, RotateCcw, TriangleAlert } from 'lucide-react';

const sel = (opts: { value: string; label: string }[]) => opts;
const concurrencyOptions = sel([{ value: '1', label: '1' }, { value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }]);
const periodOptions = sel([{ value: 'daily', label: '每日' }, { value: 'weekly', label: '每周' }, { value: 'monthly', label: '每月' }]);
const languageOptions = sel([{ value: 'zh-CN', label: '简体中文' }, { value: 'en', label: 'English' }]);
const themeOptions = sel([{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]);
const pageSizeOptions = sel([{ value: '10', label: '10' }, { value: '20', label: '20' }, { value: '50', label: '50' }, { value: '100', label: '100' }]);
const timeFormatOptions = sel([{ value: '24h', label: '24小时' }, { value: '12h', label: '12小时' }]);
const logLevelOptions = sel([{ value: 'debug', label: 'Debug' }, { value: 'info', label: 'Info' }, { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' }]);
const proxyProtocolOptions = sel([{ value: 'http', label: 'HTTP' }, { value: 'socks5', label: 'SOCKS5' }]);
const rateLimitOptions = sel([{ value: '0', label: '不限' }, { value: '60', label: '60/分钟' }, { value: '30', label: '30/分钟' }, { value: '10', label: '10/分钟' }]);
const retryOptions = sel([{ value: '0', label: '不重试' }, { value: '1', label: '1次' }, { value: '3', label: '3次' }, { value: '5', label: '5次' }]);
const cacheOptions = sel([{ value: 'none', label: '不缓存' }, { value: 'memory', label: '内存缓存' }, { value: 'disk', label: '磁盘缓存' }]);

interface ProxyStatusPayload {
  running?: boolean;
  host?: string;
  port?: number;
  uptimeSecs?: number;
}

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : e ? String(e) : fallback;

export const SettingsForm: React.FC = () => {
  const t = useT();
  const { settings, activeCategory, loaded, isDirty, loadSettings, saveSettings, updateSettings, resetSettings } = useSettingsStore();
  const resetStats = useStatsStore(s => s.resetStats);
  const [proxyRunning, setProxyRunning] = useState(false);
  const [proxyHost, setProxyHost] = useState(settings.host);
  const [proxyPort, setProxyPort] = useState(8080);
  const [proxyUptime, setProxyUptime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [openingDir, setOpeningDir] = useState(false);
  const proxyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  // Initialize log directory on mount
  useEffect(() => {
    try { invoke('init_log_dir'); } catch {/* Tauri command may not be available in browser */ }
  }, []);

  // Proxy status polling — only when general category is active
  useEffect(() => {
    const check = () => {
      try {
        invoke<ProxyStatusPayload>('get_proxy_status')
          .then(s => {
            setProxyRunning(s?.running ?? false);
            setProxyHost(s?.host || settings.host);
            setProxyPort(s?.port ?? settings.port);
            setProxyUptime(s?.uptimeSecs ?? 0);
          })
          .catch(() => {/* proxy may not be running */});
      } catch {/* Tauri not available */ }
    };

    if (activeCategory === 'general') {
      check();
      proxyIntervalRef.current = setInterval(check, 3000);
    }

    return () => {
      if (proxyIntervalRef.current) {
        clearInterval(proxyIntervalRef.current);
        proxyIntervalRef.current = null;
      }
    };
  }, [activeCategory, settings.host, settings.port]);

  const handleStartProxy = async () => {
    try {
      await invoke('start_proxy', { host: settings.host, port: settings.port });
      setProxyRunning(true);
      setProxyHost(settings.host);
      setProxyPort(settings.port);
      setProxyUptime(0);
      toast(t('settings.started'), 'success');
    } catch (e: unknown) { toast(errorMessage(e, '启动失败'), 'error'); }
  };
  const handleStopProxy = async () => {
    try {
      await invoke('stop_proxy');
      setProxyRunning(false);
      setProxyUptime(0);
      toast(t('settings.stopped'), 'info');
    } catch (e: unknown) { toast(errorMessage(e, '停止失败'), 'error'); }
  };
  const handleExportLogs = async () => {
    setExporting(true);
    try {
      const path = await invoke<string>('export_logs');
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
      await invoke('open_log_dir');
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
      // The store's saveSettings() now persists settings AND asks
      // the backend to project them into the proxy runtime via a
      // single `apply_settings` call — so we no longer issue
      // separate update_proxy_auth / update_proxy_runtime_config
      // invocations from the form.
      await saveSettings();
      toast(t('settings.saved'), 'success');
    } catch (e: unknown) {
      toast(errorMessage(e, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (secs: number) => `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;

  // "计划中" badge
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

  const plannedDivider = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)', margin: 'var(--spacer-8) 0 var(--spacer-16) 0', gridColumn: '1 / -1' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border-neutral-l1)' }} />
      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>计划中 (v0.2.0)</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-neutral-l1)' }} />
    </div>
  );

  const handleResetWithConfirm = () => {
    if (window.confirm('确定恢复所有默认值？未保存的修改将丢失。')) {
      resetSettings();
      toast('已恢复默认值', 'info');
    }
  };

  const handleResetStatsWithConfirm = async () => {
    if (window.confirm('确定清空当前仪表盘统计窗口？历史日志文件会保留。')) {
      await resetStats();
      toast('统计已重置', 'info');
    }
  };

  return (
    <div
      className="settings-form-area"
      style={{
        flex: '1 1 auto',
        padding: 'var(--spacer-4) 0 var(--spacer-16) var(--spacer-32)',
        maxWidth: 640,
        animation: 'fadeIn var(--transition-normal, 0.2s) ease',
        paddingBottom: isDirty ? 72 : undefined,
        transition: 'padding-bottom var(--transition-normal, 0.2s) ease',
      }}
      key={activeCategory}
    >
      <form onSubmit={handleSaveSettings}>
        {/* ═══════════════════════════════════════════════════ 通用设置 */}
        {activeCategory === 'general' && <>
          <section style={{ marginBottom: 'var(--spacer-32)' }}>
            <SectionTitle>{t('settings.proxyService')}</SectionTitle>
            <FormGrid>
              <FormField label={t('settings.proxyStatus')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: proxyRunning ? 'var(--status-success-default)' : 'var(--icon-disabled)', display: 'inline-block', transition: 'background var(--transition-normal, 0.2s) ease' }} />
                  <span style={{ color: proxyRunning ? 'var(--status-success-default)' : 'var(--text-tertiary)' }}>{proxyRunning ? `${proxyHost}:${proxyPort}` : t('settings.proxyStopped')}</span>
                </div>
              </FormField>
              <FormField label={t('settings.proxyUptime')}>
                <span style={{ color: 'var(--text-secondary)' }}>{proxyRunning ? fmt(proxyUptime) : '-'}</span>
              </FormField>
              <FormField label="">
                {!proxyRunning
                  ? <Button variant="brand" onClick={handleStartProxy}>{t('settings.proxyStart')}</Button>
                  : <Button variant="danger" onClick={handleStopProxy}>{t('settings.proxyStop')}</Button>}
              </FormField>
              <FormField label={t('settings.proxyPort')}>
                <Input type="number" value={settings.port.toString()} onChange={e => updateSettings({ port: parseInt(e.target.value) || 8080 })} disabled={proxyRunning} wrapperStyle={proxyRunning ? { background: 'var(--bg-base-secondary)' } : {}} />
              </FormField>
            </FormGrid>
          </section>
          <section style={{ marginBottom: 'var(--spacer-32)' }}>
            <SectionTitle>{t('settings.basic')}</SectionTitle>
            <FormGrid>
              <FormField label="服务地址">
                <Input type="text" value={settings.host} onChange={e => updateSettings({ host: e.target.value })} />
              </FormField>
              <FormField label="自动启动">
                <Switch checked={settings.autoStart} onChange={v => updateSettings({ autoStart: v })} />
              </FormField>
              <FormField label="最大并发">
                <Dropdown options={concurrencyOptions} value={settings.maxConcurrency.toString()} onChange={v => updateSettings({ maxConcurrency: parseInt(v) })} size="sm" />
              </FormField>
            </FormGrid>
          </section>
          <section style={{ marginBottom: 'var(--spacer-32)' }}>
            <SectionTitle>{t('settings.appearance')}</SectionTitle>
            <FormGrid>
              <FormField label="语言">
                <Dropdown options={languageOptions} value={settings.language} onChange={v => updateSettings({ language: v })} size="sm" />
              </FormField>
              <FormField label="主题">
                <Dropdown options={themeOptions} value={settings.theme} onChange={v => updateSettings({ theme: v })} size="sm" />
              </FormField>
              <FormField label="每页条数">
                <Dropdown options={pageSizeOptions} value={settings.pageSize.toString()} onChange={v => updateSettings({ pageSize: parseInt(v) })} size="sm" />
                {planned()}
              </FormField>
              <FormField label="时间格式">
                <Dropdown options={timeFormatOptions} value={settings.timeFormat} onChange={v => updateSettings({ timeFormat: v })} size="sm" />
                {planned()}
              </FormField>
            </FormGrid>
          </section>
          <section style={{ marginBottom: 'var(--spacer-32)' }}>
            <SectionTitle>{t('settings.token')}</SectionTitle>
            <FormGrid>
              <FormField label="用量上限">
                <Input type="number" value={settings.tokenLimit.toString()} onChange={e => updateSettings({ tokenLimit: parseInt(e.target.value) || 0 })} />
              </FormField>
              {plannedDivider()}
              <FormField label="提醒阈值">
                <Input type="text" value={settings.tokenWarningThreshold} onChange={e => updateSettings({ tokenWarningThreshold: e.target.value })} />
                {planned()}
              </FormField>
              <FormField label="统计周期">
                <Dropdown options={periodOptions} value={settings.tokenStatPeriod} onChange={v => updateSettings({ tokenStatPeriod: v })} size="sm" />
                {planned()}
              </FormField>
              <FormField label="">
                <Button variant="secondary" onClick={handleResetStatsWithConfirm}>{t('settings.tokenReset')}</Button>
              </FormField>
            </FormGrid>
          </section>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 24, borderTop: '1px solid var(--border-neutral-l1)' }}>
            <Button type="button" onClick={handleResetWithConfirm}>{t('settings.reset')}</Button>
            <Button type="submit" variant="brand" disabled={saving}>{saving ? '保存中...' : t('settings.save')}</Button>
          </div>
        </>}

        {/* ═══════════════════════════════════════════════════ 网络代理 */}
        {activeCategory === 'proxy' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.proxyConfig')}</SectionTitle>
          <FormGrid>
            <FormField label="启用代理">
              <Switch checked={settings.proxyEnabled} onChange={v => updateSettings({ proxyEnabled: v })} />
            </FormField>
            <FormField label="代理主机">
              <Input type="text" value={settings.proxyHost} onChange={e => updateSettings({ proxyHost: e.target.value })} placeholder="127.0.0.1" />
            </FormField>
            <FormField label="代理端口">
              <Input type="number" value={settings.proxyPort.toString()} onChange={e => updateSettings({ proxyPort: parseInt(e.target.value) || 7890 })} />
            </FormField>
            <FormField label="代理协议">
              <Dropdown options={proxyProtocolOptions} value={settings.proxyProtocol} onChange={v => updateSettings({ proxyProtocol: v })} size="sm" />
            </FormField>
            <FormField label="用户名">
              <Input type="text" value={settings.proxyUsername} onChange={e => updateSettings({ proxyUsername: e.target.value })} placeholder="可选" />
            </FormField>
            <FormField label="密码">
              <Input type="password" value={settings.proxyPassword} onChange={e => updateSettings({ proxyPassword: e.target.value })} placeholder="可选" />
            </FormField>
          </FormGrid>
        </section>}

        {/* ═══════════════════════════════════════════════════ 日志与监控 */}
        {activeCategory === 'logging' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.logging.title')}</SectionTitle>
          <FormGrid>
            <FormField label="日志级别">
              <Dropdown options={logLevelOptions} value={settings.logLevel} onChange={v => updateSettings({ logLevel: v })} size="sm" disabled />
              {planned()}
            </FormField>
            <FormField label="日志保留天数">
              <Input type="number" value={settings.logRetentionDays.toString()} onChange={e => updateSettings({ logRetentionDays: parseInt(e.target.value) || 30 })} />
            </FormField>
            <FormField label="记录请求内容">
              <Switch checked={settings.logRequestContent} onChange={v => updateSettings({ logRequestContent: v })} disabled />
              {planned()}
            </FormField>
            <FormField label="自动清理日志">
              <Switch checked={settings.logAutoClean} onChange={v => updateSettings({ logAutoClean: v })} />
            </FormField>
            <FormField label="">
              <Button disabled={exporting} onClick={handleExportLogs}>{exporting ? '导出中...' : '导出日志'}</Button>
            </FormField>
            <FormField label="">
              <Button disabled={openingDir} onClick={handleOpenLogDir}>{openingDir ? '打开中...' : '打开日志目录'}</Button>
            </FormField>
          </FormGrid>
        </section>}

        {/* ═══════════════════════════════════════════════════ 安全与认证 */}
        {activeCategory === 'security' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.security.title')}</SectionTitle>
          <FormGrid>
            <FormField label="API 密钥加密存储">
              <Switch checked disabled />
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-success-default)', marginLeft: 'var(--spacer-6)' }}>始终启用</span>
            </FormField>
            <FormField label="本地认证令牌">
              <Input type="text" value={settings.authToken} onChange={e => updateSettings({ authToken: e.target.value })} placeholder="输入令牌..." />
            </FormField>
            <FormField label="IP 白名单">
              <Input type="text" value={settings.ipWhitelist} onChange={e => updateSettings({ ipWhitelist: e.target.value })} placeholder="127.0.0.1, 192.168.1.*" />
            </FormField>
            <FormField label="启用 CORS">
              <Switch checked={settings.corsEnabled} onChange={v => updateSettings({ corsEnabled: v })} />
            </FormField>
            <FormField label="请求速率限制">
              <Dropdown options={rateLimitOptions} value={settings.rateLimit} onChange={v => updateSettings({ rateLimit: v })} size="sm" />
            </FormField>
            <FormField label="日志安全审计">
              <Switch checked={settings.auditLog} onChange={v => updateSettings({ auditLog: v })} disabled />
              {planned()}
            </FormField>
          </FormGrid>
        </section>}

        {/* ═══════════════════════════════════════════════════ 高级选项 */}
        {activeCategory === 'advanced' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.advanced.title')}</SectionTitle>
          <FormGrid>
            <FormField label="API 超时(秒)">
              <Input type="number" value={settings.apiTimeout.toString()} onChange={e => updateSettings({ apiTimeout: parseInt(e.target.value) || 60 })} />
            </FormField>
            <FormField label="最大重试次数">
              <Dropdown options={retryOptions} value={settings.maxRetries} onChange={v => updateSettings({ maxRetries: v })} size="sm" />
            </FormField>
            {plannedDivider()}
            <FormField label="调试模式">
              <Switch checked={settings.debugMode} onChange={v => updateSettings({ debugMode: v })} disabled />
              {planned()}
            </FormField>
            <FormField label="缓存策略">
              <Dropdown options={cacheOptions} value={settings.cacheStrategy} onChange={v => updateSettings({ cacheStrategy: v })} size="sm" disabled />
              {planned()}
            </FormField>
            <FormField label="数据存储路径">
              <Input type="text" value={settings.dataPath} onChange={e => updateSettings({ dataPath: e.target.value })} disabled />
              {planned()}
            </FormField>
            <FormField label="实验性功能">
              <Switch checked={settings.experimentalFeatures} onChange={v => updateSettings({ experimentalFeatures: v })} disabled />
              {planned()}
            </FormField>
          </FormGrid>
        </section>}
      </form>

      {/* ═══════════════════════════════════════════════════ Sticky Save Bar */}
      {isDirty && (
        <AnimatedContent duration={220} distance={4}>
          <div
            className="settings-sticky-save"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 220, // sidebar width
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
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                onClick={handleResetWithConfirm}
              >
                撤销
              </Button>
              <Button
                variant="brand"
                size="sm"
                icon={Save}
                disabled={saving}
                onClick={handleSaveSettings}
              >
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </AnimatedContent>
      )}
    </div>
  );
};
