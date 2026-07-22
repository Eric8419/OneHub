import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { ProviderLogo } from '../../components/ui/ProviderLogo';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/Toast';
import { desktopApi } from '../../lib/desktopApi';
import { ArrowLeft, RefreshCw, Save, Trash2 } from 'lucide-react';
import { ProviderBasicTab } from './tabs/ProviderBasicTab';
import { ProviderModelsTab } from './tabs/ProviderModelsTab';
import { ProviderMappingsTab } from './tabs/ProviderMappingsTab';
import { ProviderProxyTab } from './tabs/ProviderProxyTab';
import type { Model, Provider, ProviderProxyConfig } from '../../types/provider';

type TabKey = 'basic' | 'models' | 'mappings' | 'proxy';

const TAB_TABS = [
  { key: 'basic', label: '基本信息' },
  { key: 'models', label: '模型管理' },
  { key: 'mappings', label: '模型映射' },
  { key: 'proxy', label: '代理设置' },
];

const headerInputStyle: React.CSSProperties = {
  fontSize: 'var(--title-md-font-size)',
  fontWeight: 600,
  lineHeight: 'var(--title-md-line-height)',
  color: 'var(--text-default)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 6,
  padding: '2px 6px',
  margin: '-2px -6px',
  outline: 'none',
  font: 'inherit',
};

type SaveState = 'saved' | 'saving' | 'error';

export const EditProviderPage: React.FC = () => {
  const navigate = useNavigate();
  const { providerId } = useParams<{ providerId: string }>();
  const { providers, updateProvider, removeProvider } = useProviderStore();

  const provider = providers.find(p => p.id === providerId);

  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [form, setForm] = useState<Provider | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | undefined>();
  const [testTime, setTestTime] = useState<string | undefined>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formInitialized = useRef(false);

  useEffect(() => {
    if (!provider) return;
    if (formInitialized.current) return;
    setForm({ ...provider, proxyConfig: provider.proxyConfig ? { ...provider.proxyConfig } : undefined });
    formInitialized.current = true;
  }, [provider]);

  const doAutoSave = useCallback(async () => {
    if (!form || !providerId) return;
    setSaveState('saving');
    try {
      const patch: Partial<Provider> = {
        name: form.name,
        apiBase: form.apiBase,
        apiFlavor: form.apiFlavor,
        models: form.models,
        modelMapping: form.modelMapping,
        proxyConfig: form.proxyConfig,
      };
      if (form.apiKey !== provider?.apiKey) {
        patch.apiKey = form.apiKey;
      }
      await updateProvider(providerId, patch);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [form, providerId, provider?.apiKey, updateProvider]);

  const scheduleAutoSave = useCallback(() => {
    setSaveState('saving');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 400);
  }, [doAutoSave]);

  const flushSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = undefined;
      doAutoSave();
    }
  }, [doAutoSave]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const handler = () => flushSave();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushSave]);

  const updateField = useCallback(<K extends keyof Provider>(key: K, value: Provider[K]) => {
    setForm(prev => prev ? { ...prev, [key]: value } : prev);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleTestConnection = useCallback(async () => {
    if (!form) return;
    setTesting(true);
    setTestMessage(undefined);
    try {
      const result = await desktopApi.testProviderConnection(
        form.apiFlavor || 'openai-compatible',
        form.apiBase,
        form.apiKey
      );
      if (result.success) {
        setTestMessage(undefined);
        setTestTime(new Date().toLocaleTimeString());
        updateField('status', 'connected');
        toast(result.message || '连接成功', 'success');
      } else {
        const msg = result.error?.message || result.message || '连接失败';
        setTestMessage(msg);
        setTestTime(new Date().toLocaleTimeString());
        updateField('status', 'error');
        toast(`连接失败: ${msg}`, 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestMessage(msg);
      setTestTime(new Date().toLocaleTimeString());
      updateField('status', 'error');
      toast(`连接失败: ${msg}`, 'error');
    } finally {
      setTesting(false);
    }
  }, [form, updateField]);

  const handleDelete = async () => {
    if (!providerId) return;
    try {
      await removeProvider(providerId);
      toast('供应商已删除', 'success');
      navigate('/providers');
    } catch (e) {
      toast(`删除失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  if (!provider || !form) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
        {provider === undefined ? '供应商不存在' : '加载中...'}
      </div>
    );
  }

  const statusDotColor = {
    connected: '#10b981',
    error: '#ef4444',
    testing: '#f59e0b',
    configuring: '#9ca3af',
    disabled: '#9ca3af',
  }[form.status] || '#9ca3af';

  const saveStateText = {
    saved: '所有更改已保存',
    saving: '保存中...',
    error: '保存失败，点击重试',
  }[saveState];

  const saveStateColor = {
    saved: 'var(--text-tertiary)',
    saving: 'var(--text-secondary)',
    error: 'var(--status-error-default, #ef4444)',
  }[saveState];

  const tabCounts: Record<string, number | undefined> = {
    models: form.models.length,
    mappings: Object.keys(form.modelMapping ?? {}).length || undefined,
  };

  const proxyConfig: ProviderProxyConfig = form.proxyConfig ?? { enabled: false, url: '' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '16px 24px 0',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-primary)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => { flushSave(); navigate('/providers'); }}
            style={{
              width: 32, height: 32, display: 'grid', placeItems: 'center',
              borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <ProviderLogo providerId={form.id} name={form.name} size={28} />
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            style={headerInputStyle}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: statusDotColor, flexShrink: 0,
            }} />
            <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
              {{ connected: '已连接', error: '连接失败', testing: '测试中', configuring: '未测试', disabled: '已禁用' }[form.status]}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: saveStateColor, cursor: saveState === 'error' ? 'pointer' : 'default' }}
            onClick={saveState === 'error' ? doAutoSave : undefined}>
            {saveStateText}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={testing} onClick={handleTestConnection}>
            测试连接
          </Button>
          <Button variant="secondary" size="sm" icon={Save} onClick={doAutoSave}>保存</Button>
          <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setShowDeleteConfirm(true)}>
            删除
          </Button>
        </div>
        <Tabs
          tabs={TAB_TABS.map(t => ({ ...t, count: tabCounts[t.key] }))}
          activeKey={activeTab}
          onChange={(k) => { flushSave(); setActiveTab(k as TabKey); }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
        {activeTab === 'basic' && (
          <ProviderBasicTab
            apiBase={form.apiBase}
            apiKey={form.apiKey}
            apiKeyConfigured={!!provider.apiKey}
            apiFlavor={form.apiFlavor || 'openai-compatible'}
            testStatus={form.status === 'connected' ? 'connected' : form.status === 'error' ? 'error' : testing ? 'testing' : 'idle'}
            testMessage={testMessage}
            testTime={testTime}
            testing={testing}
            onApiBaseChange={(v) => updateField('apiBase', v)}
            onApiKeyChange={(v) => updateField('apiKey', v)}
            onApiFlavorChange={(v) => updateField('apiFlavor', v)}
            onTestConnection={handleTestConnection}
          />
        )}
        {activeTab === 'models' && (
          <ProviderModelsTab
            models={form.models}
            apiBase={form.apiBase}
            apiKey={form.apiKey}
            apiFlavor={form.apiFlavor || 'openai-compatible'}
            onModelsChange={(v: Model[]) => updateField('models', v)}
          />
        )}
        {activeTab === 'mappings' && (
          <ProviderMappingsTab
            mappings={form.modelMapping ?? {}}
            onChange={(v) => updateField('modelMapping', Object.keys(v).length ? v : undefined)}
          />
        )}
        {activeTab === 'proxy' && (
          <ProviderProxyTab
            proxyEnabled={proxyConfig.enabled}
            proxyUrl={proxyConfig.url}
            onProxyEnabledChange={(v) => updateField('proxyConfig', { ...proxyConfig, enabled: v })}
            onProxyUrlChange={(v) => updateField('proxyConfig', { ...proxyConfig, url: v })}
          />
        )}
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          open={showDeleteConfirm}
          title="删除供应商?"
          message={`确定要删除供应商「${form.name}」吗？此操作不可撤销。`}
          confirmLabel="删除"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
};
