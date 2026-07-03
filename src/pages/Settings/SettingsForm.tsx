import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { Button, FormField, FormGrid, SectionTitle, Input, Select, Switch, toast } from '../../components/ui';
import { invoke } from '@tauri-apps/api/core';
import { useT } from '../../i18n';

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

export const SettingsForm: React.FC = () => {
  const t = useT();
  const { settings, activeCategory, loaded, loadSettings, saveSettings, updateSettings, resetSettings } = useSettingsStore();
  const [proxyRunning, setProxyRunning] = useState(false);
  const [proxyPort, setProxyPort] = useState(8080);
  const [proxyUptime, setProxyUptime] = useState(0);
  const [saving, setSaving] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  useEffect(() => {
    const check = () => {
      try { invoke('get_proxy_status').then((s: any) => { setProxyRunning(s?.running ?? false); setProxyPort(s?.port ?? 8080); setProxyUptime(s?.uptime_secs ?? 0); }).catch(() => {}); } catch {}
    };
    check(); const i = setInterval(check, 3000); return () => clearInterval(i);
  }, []);

  const handleStartProxy = async () => {
    try { await invoke('start_proxy', { port: settings.port }); toast(t('settings.started'), 'success'); } catch (e: any) { toast(e.toString(), 'error'); }
  };
  const handleStopProxy = async () => {
    try { await invoke('stop_proxy'); toast(t('settings.stopped'), 'info'); } catch (e: any) { toast(e.toString(), 'error'); }
  };
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveSettings();
      toast(t('settings.saved'), 'success');
    } catch (e: any) {
      toast(e?.toString() || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (secs: number) => `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;

  return (
    <div className="settings-form-area" style={{ flex: '1 1 auto', padding: 'var(--spacer-4) 0 var(--spacer-16) var(--spacer-32)', maxWidth: 640 }}>

      {/* ═══════════════════════════════════════════════════ 通用设置 */}
      {activeCategory === 'general' && <>
        <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.proxyService')}</SectionTitle>
          <FormGrid>
            <FormField label={t('settings.proxyStatus')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: proxyRunning ? 'var(--status-success-default)' : 'var(--icon-disabled)', display: 'inline-block' }} />
                <span style={{ color: proxyRunning ? 'var(--status-success-default)' : 'var(--text-tertiary)' }}>{proxyRunning ? t('settings.proxyRunning', { port: proxyPort }) : t('settings.proxyStopped')}</span>
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
              <Select options={concurrencyOptions} value={settings.maxConcurrency.toString()} onChange={e => updateSettings({ maxConcurrency: parseInt(e.target.value) })} />
            </FormField>
          </FormGrid>
        </section>
        <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.token')}</SectionTitle>
          <FormGrid>
            <FormField label="用量上限">
              <Input type="number" value={settings.tokenLimit.toString()} onChange={e => updateSettings({ tokenLimit: parseInt(e.target.value) || 0 })} />
            </FormField>
            <FormField label="提醒阈值">
              <Input type="text" value={settings.tokenWarningThreshold} onChange={e => updateSettings({ tokenWarningThreshold: e.target.value })} />
            </FormField>
            <FormField label="统计周期">
              <Select options={periodOptions} value={settings.tokenStatPeriod} onChange={e => updateSettings({ tokenStatPeriod: e.target.value })} />
            </FormField>
            <FormField label="">
              <Button variant="secondary" onClick={() => { if (window.confirm(t('settings.tokenResetConfirm'))) toast(t('settings.tokenResetted'), 'info'); }}>{t('settings.tokenReset')}</Button>
            </FormField>
          </FormGrid>
        </section>
        <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.appearance')}</SectionTitle>
          <FormGrid>
            <FormField label="语言">
              <Select options={languageOptions} value={settings.language} onChange={e => updateSettings({ language: e.target.value })} />
            </FormField>
            <FormField label="主题">
              <Select options={themeOptions} value={settings.theme} onChange={e => updateSettings({ theme: e.target.value })} />
            </FormField>
            <FormField label="每页条数">
              <Select options={pageSizeOptions} value={settings.pageSize.toString()} onChange={e => updateSettings({ pageSize: parseInt(e.target.value) })} />
            </FormField>
            <FormField label="时间格式">
              <Select options={timeFormatOptions} value={settings.timeFormat} onChange={e => updateSettings({ timeFormat: e.target.value })} />
            </FormField>
          </FormGrid>
        </section>
        <section style={{ marginBottom: 'var(--spacer-32)' }}>
          <SectionTitle>{t('settings.notification')}</SectionTitle>
          <FormGrid>
            <FormField label="API 错误通知">
              <Switch checked={settings.apiErrorNotify} onChange={v => updateSettings({ apiErrorNotify: v })} />
            </FormField>
            <FormField label="配额提醒通知">
              <Switch checked={settings.quotaNotify} onChange={v => updateSettings({ quotaNotify: v })} />
            </FormField>
            <FormField label="模型状态变更">
              <Switch checked={settings.modelStatusNotify} onChange={v => updateSettings({ modelStatusNotify: v })} />
            </FormField>
          </FormGrid>
        </section>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 24, borderTop: '1px solid var(--border-neutral-l1)' }}>
          <Button onClick={resetSettings}>{t('settings.reset')}</Button>
          <Button variant="brand" disabled={saving} onClick={handleSaveSettings}>{saving ? '保存中...' : t('settings.save')}</Button>
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
            <Select options={proxyProtocolOptions} value={settings.proxyProtocol} onChange={e => updateSettings({ proxyProtocol: e.target.value })} />
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
            <Select options={logLevelOptions} value={settings.logLevel} onChange={e => updateSettings({ logLevel: e.target.value })} />
          </FormField>
          <FormField label="日志保留天数">
            <Input type="number" value={settings.logRetentionDays.toString()} onChange={e => updateSettings({ logRetentionDays: parseInt(e.target.value) || 30 })} />
          </FormField>
          <FormField label="记录请求内容">
            <Switch checked={settings.logRequestContent} onChange={v => updateSettings({ logRequestContent: v })} />
          </FormField>
          <FormField label="自动清理日志">
            <Switch checked={settings.logAutoClean} onChange={v => updateSettings({ logAutoClean: v })} />
          </FormField>
          <FormField label="">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <Button disabled onClick={() => {}}>导出日志</Button>
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>v0.2.0 计划中</span>
            </div>
          </FormField>
          <FormField label="">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <Button disabled onClick={() => {}}>打开日志目录</Button>
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>v0.2.0 计划中</span>
            </div>
          </FormField>
        </FormGrid>
      </section>}

      {/* ═══════════════════════════════════════════════════ 安全与认证 */}
      {activeCategory === 'security' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
        <SectionTitle>{t('settings.security.title')}</SectionTitle>
        <FormGrid>
          <FormField label="API 密钥加密存储">
            <Switch checked={settings.encryptApiKeys} onChange={v => updateSettings({ encryptApiKeys: v })} />
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
            <Select options={rateLimitOptions} value={settings.rateLimit} onChange={e => updateSettings({ rateLimit: e.target.value })} />
          </FormField>
          <FormField label="日志安全审计">
            <Switch checked={settings.auditLog} onChange={v => updateSettings({ auditLog: v })} />
          </FormField>
        </FormGrid>
      </section>}

      {/* ═══════════════════════════════════════════════════ 高级选项 */}
      {activeCategory === 'advanced' && <section style={{ marginBottom: 'var(--spacer-32)' }}>
        <SectionTitle>{t('settings.advanced.title')}</SectionTitle>
        <FormGrid>
          <FormField label="调试模式">
            <Switch checked={settings.debugMode} onChange={v => updateSettings({ debugMode: v })} />
          </FormField>
          <FormField label="API 超时(秒)">
            <Input type="number" value={settings.apiTimeout.toString()} onChange={e => updateSettings({ apiTimeout: parseInt(e.target.value) || 60 })} />
          </FormField>
          <FormField label="最大重试次数">
            <Select options={retryOptions} value={settings.maxRetries} onChange={e => updateSettings({ maxRetries: e.target.value })} />
          </FormField>
          <FormField label="缓存策略">
            <Select options={cacheOptions} value={settings.cacheStrategy} onChange={e => updateSettings({ cacheStrategy: e.target.value })} />
          </FormField>
          <FormField label="数据存储路径">
            <Input type="text" value={settings.dataPath} onChange={e => updateSettings({ dataPath: e.target.value })} />
          </FormField>
          <FormField label="实验性功能">
            <Switch checked={settings.experimentalFeatures} onChange={v => updateSettings({ experimentalFeatures: v })} />
          </FormField>
        </FormGrid>
      </section>}
    </div>
  );
};