import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { Stepper, Step, Dropdown, toast, ProviderLogo, Switch } from '../../components/ui';
import type { DropdownOption } from '../../components/ui';
import type { Model } from '../../types/provider';
import { buildModelFromName } from '../../lib/modelPresets';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, Check, Loader2, RefreshCw, Download, Plus, Trash2, Eye, Brain, SlidersHorizontal, Wrench, Braces, ChevronDown, ChevronRight } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface RemoteModelEntry {
  id: string;
  name: string;
}

interface FetchModelsResult {
  success: boolean;
  models: RemoteModelEntry[];
  message: string;
}

// ── Constants ──────────────────────────────────────────────

const API_FLAVOR_OPTIONS: DropdownOption[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'responses', label: 'Responses' },
];

const REASONING_EFFORT_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const modelIdFromName = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9._:/-]+/g, '-').replace(/^-+|-+$/g, '') ||
  crypto.randomUUID?.() || Date.now().toString(36);

const makeModel = (name: string, id?: string): Model => buildModelFromName(name, id);

// ── Shared input styles ────────────────────────────────────

const inputBaseStyle: React.CSSProperties = {
  height: 36,
  padding: '0 var(--spacer-12)',
  borderRadius: 'var(--radius-8)',
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-base-default)',
  color: 'var(--text-default)',
  fontSize: 'var(--body-base-font-size)',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color var(--transition-fast, 0.12s) ease',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacer-6)',
};

const labelStyle: React.CSSProperties = {
  color: 'var(--text-default)',
  fontSize: 'var(--body-base-font-size)',
  fontWeight: 'var(--font-weight-medium)',
};

// ── Page Component ──────────────────────────────────────────

export const EditProviderPage: React.FC = () => {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const providers = useProviderStore((s) => s.providers);
  const updateProvider = useProviderStore((s) => s.updateProvider);

  const provider = providers.find((p) => p.id === providerId);

  // Form state - lazy-initialised from provider if available.
  const [name, setName] = useState(() => provider?.name ?? '');
  const [apiBase, setApiBase] = useState(() => provider?.apiBase ?? '');
  const [apiKey, setApiKey] = useState(() => provider?.apiKey ?? '');
  const [apiFlavor, setApiFlavor] = useState(() => provider?.apiFlavor || 'openai-compatible');
  const [models, setModels] = useState<Model[]>(() => (provider ? provider.models.map((m) => ({ ...m })) : []));
  const [modelMappingEntries, setModelMappingEntries] = useState<Array<{ key: string; value: string }>>(() => {
    const mapping = provider?.modelMapping;
    if (!mapping) return [];
    return Object.entries(mapping).map(([key, value]) => ({ key, value }));
  });
  const [modelMappingExpanded, setModelMappingExpanded] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(() => provider?.proxyConfig?.enabled ?? false);
  const [proxyUrl, setProxyUrl] = useState(() => provider?.proxyConfig?.url ?? '');

  const [remoteModels, setRemoteModels] = useState<RemoteModelEntry[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const [manualModelName, setManualModelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [stepperKey, setStepperKey] = useState(0);
  const [retryStep, setRetryStep] = useState(1);
  const [finishError, setFinishError] = useState('');

  // Provider not found — render nothing until the store loads,
  // then show a not-found message if it's truly absent.
  if (providers.length > 0 && !provider) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center', padding: 'var(--spacer-48) 0', color: 'var(--text-tertiary)' }}>
        <p>提供商未找到</p>
        <button
          onClick={() => navigate('/providers')}
          style={{
            marginTop: 'var(--spacer-12)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            height: 36,
            padding: '0 var(--spacer-16)',
            borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--body-base-font-size)',
            fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={16} /> 返回模型配置
        </button>
      </div>
    );
  }

  // While the provider store is still loading, render a minimal placeholder.
  if (!provider) {
    return <div style={{ padding: 'var(--spacer-48) 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>加载中…</div>;
  }

  // ── Model management ─────────────────────────────────────

  const addModel = useCallback((model: Model) => {
    const cleanName = model.name.trim();
    if (!cleanName) return;
    setModels((prev) => {
      const exists = prev.some((m) => m.name.toLowerCase() === cleanName.toLowerCase() || m.id === model.id);
      if (exists) {
        toast(`模型「${cleanName}」已在列表中`, 'info');
        return prev;
      }
      return [...prev, { ...model, name: cleanName }];
    });
  }, []);

  const updateModel = (index: number, patch: Partial<Model>) => {
    setModels((prev) => prev.map((model, i) => {
      if (i !== index) return model;
      const next = { ...model, ...patch };
      if (patch.supportsReasoning === false) {
        next.supportsReasoningEffort = false;
        next.defaultReasoningEffort = undefined;
      }
      if (patch.supportsReasoningEffort === false) {
        next.defaultReasoningEffort = undefined;
      }
      return next;
    }));
  };

  const removeModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Model mapping management ────────────────────────────

  const addModelMappingEntry = () => {
    setModelMappingEntries((prev) => [...prev, { key: '', value: '' }]);
  };

  const updateModelMappingEntry = (index: number, patch: Partial<{ key: string; value: string }>) => {
    setModelMappingEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeModelMappingEntry = (index: number) => {
    setModelMappingEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const addManualModel = () => {
    const cleanName = manualModelName.trim();
    if (!cleanName) return;
    addModel(makeModel(cleanName));
    setManualModelName('');
  };

  const handleFetchModels = async () => {
    if (!apiBase.trim() || !apiKey.trim()) {
      toast('请先填写 API Base URL 和 API Key', 'error');
      return;
    }
    setFetchingModels(true);
    setModelFetchMessage('');
    try {
      const result = await invoke<FetchModelsResult>('fetch_provider_models', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      setRemoteModels(result.models ?? []);
      setModelFetchMessage(result.message);
      toast(result.message, result.success ? 'success' : 'info');
    } catch (e: unknown) {
      const message = errorMessage(e, '拉取模型失败');
      setModelFetchMessage(message);
      toast(message, 'error');
    } finally {
      setFetchingModels(false);
    }
  };

  // ── Test connection ──────────────────────────────────────

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMessage('');
    try {
      const result = await invoke<{ success: boolean; modelCount?: number; error?: { kind: string; message: string }; message: string }>('test_provider_connection', {
        flavor: apiFlavor,
        apiBase,
        apiKey,
      });
      if (result.success) {
        setTestResult('success');
        setTestMessage(result.message);
        toast(result.message, 'success');
      } else {
        setTestResult('fail');
        setTestMessage(result.message);
        toast(result.message, 'error');
      }
    } catch (e: unknown) {
      setTestResult('fail');
      setTestMessage(errorMessage(e, '连接测试失败'));
      toast(errorMessage(e, '连接测试失败'), 'error');
    } finally {
      setTesting(false);
    }
  };

  // ── Final submit ─────────────────────────────────────────

  const handleFinish = async () => {
    setSaving(true);
    setFinishError('');
    const configuredModels = models
      .map((model) => ({
        ...model,
        name: model.name.trim(),
        alias: model.alias?.trim() || undefined,
        id: model.id || modelIdFromName(model.name),
      }))
      .filter((model) => model.name);

    const modelMapping: Record<string, string> = {};
    for (const entry of modelMappingEntries) {
      const key = entry.key.trim();
      const value = entry.value.trim();
      if (key && value) {
        modelMapping[key] = value;
      }
    }

    try {
      await updateProvider(provider.id, {
        name: name.trim(),
        apiBase: apiBase.trim(),
        apiKey: apiKey.trim(),
        apiFlavor,
        status: testResult === 'success' ? 'connected' : provider.status,
        models: configuredModels,
        modelMapping: Object.keys(modelMapping).length > 0 ? modelMapping : undefined,
        proxyConfig: { enabled: proxyEnabled, url: proxyUrl.trim() },
      });
      toast('提供商已更新', 'success');
      navigate('/providers');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存失败';
      toast(msg, 'error');
      setFinishError(msg);
      setSaving(false);
      setRetryStep(4);
      setCurrentStep(4);
      setStepperKey((k) => k + 1);
    }
  };

  // ── Validation per step (1-indexed; 4 steps total) ───────

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 1: return apiBase.trim().length > 0 && apiKey.trim().length > 0;
      case 2: return true;
      case 3: return testResult === 'success';
      default: return true;
    }
  }, [currentStep, apiBase, apiKey, testResult]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header with back button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-12)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        <button
          onClick={() => navigate('/providers')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-8)',
            border: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-base-default)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'background var(--transition-fast, 0.12s) ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-base-default)'; }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)' }}>
          <ProviderLogo
            providerId={provider.id}
            name={provider.name}
            size={32}
            style={{ color: 'var(--text-secondary)' }}
          />
          <div>
            <h2
              style={{
                fontFamily: 'var(--heading-lg-font-family)',
                fontSize: 'var(--heading-lg-font-size)',
                fontWeight: 'var(--heading-lg-font-weight)',
                lineHeight: 'var(--heading-lg-line-height)',
                color: 'var(--text-default)',
                margin: 0,
              }}
            >
              编辑提供商
            </h2>
            <p style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-tertiary)', margin: 'var(--spacer-4) 0 0 0' }}>
              修改「{provider.name}」的配置
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div
        style={{
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)',
          padding: 'var(--spacer-12) var(--spacer-24) var(--spacer-24)',
        }}
      >
        <Stepper
          key={stepperKey}
          initialStep={retryStep}
          onStepChange={(step) => setCurrentStep(step)}
          onFinalStepCompleted={handleFinish}
          backButtonText="返回"
          nextButtonText="下一步"
          completeButtonText={saving ? '保存中...' : finishError ? '重试保存' : '完成保存'}
          disableStepIndicators
          nextButtonProps={{ disabled: !canProceed || saving }}
          backButtonProps={currentStep === 1 ? { style: { display: 'none' } } : undefined}
        >
          {/* ── Step 1: Credentials ──────────────────────── */}
          <Step>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)', padding: 'var(--spacer-8) 0' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>提供商名称</label>
                <input
                  type="text"
                  placeholder="例如: OpenAI, Anthropic, DeepSeek"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputBaseStyle}
                />
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  API Base URL <span style={{ color: 'var(--status-error-default)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="完整地址，含 /v1，如 https://api.openai.com/v1"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  style={inputBaseStyle}
                />
                <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                  填写完整 Base URL（含版本路径，如 /v1）。系统不会自动补全 /v1。
                </span>
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>
                  API Key <span style={{ color: 'var(--status-error-default)' }}>*</span>
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={inputBaseStyle}
                />
                {provider.apiKey && !apiKey && (
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-alert-default)' }}>
                    原有 Key 已清空，请重新输入
                  </span>
                )}
              </div>

              <div style={fieldStyle}>
                <label style={labelStyle}>API 协议类型</label>
                <Dropdown options={API_FLAVOR_OPTIONS} value={apiFlavor} onChange={setApiFlavor} size="sm" />
                <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                  选择适配协议，Anthropic API 需选 Anthropic
                </span>
              </div>

              {/* Proxy config */}
              <div style={fieldStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacer-12)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                    <label style={labelStyle}>使用独立代理</label>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                      为该提供商单独配置 HTTP/SOCKS 代理
                    </span>
                  </div>
                  <Switch checked={proxyEnabled} onChange={setProxyEnabled} />
                </div>
                {proxyEnabled && (
                  <input
                    type="text"
                    placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    style={inputBaseStyle}
                  />
                )}
              </div>
            </div>
          </Step>

          {/* ── Step 2: Models (with alias mapping) ─────── */}
          <Step>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)', padding: 'var(--spacer-8) 0' }}>
              {/* Fetch models bar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--spacer-8)',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--spacer-12)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                  <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-default)' }}>
                    从接口拉取模型
                  </span>
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    OpenAI 兼容接口会请求 /models；不支持列表接口时仍可手动添加
                  </span>
                </div>
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacer-6)',
                    height: 32,
                    padding: '0 var(--spacer-16)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-base-default)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-neutral-l1)',
                    cursor: 'pointer',
                    fontSize: 'var(--body-sm-font-size)',
                    fontFamily: 'inherit',
                    opacity: fetchingModels ? 0.7 : 1,
                  }}
                >
                  {fetchingModels ? (
                    <><Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> 拉取中</>
                  ) : (
                    <><Download size={14} /> 拉取模型</>
                  )}
                </button>
              </div>

              {modelFetchMessage && (
                <div
                  style={{
                    padding: 'var(--spacer-8) var(--spacer-12)',
                    borderRadius: 'var(--radius-6)',
                    background: remoteModels.length > 0 ? 'var(--status-success-surface-l1)' : 'var(--status-alert-surface-l1)',
                    color: remoteModels.length > 0 ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                    fontSize: 'var(--body-sm-font-size)',
                  }}
                >
                  {modelFetchMessage}
                </div>
              )}

              {/* Remote model chips */}
              {remoteModels.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                      接口返回的模型
                    </span>
                    <button
                      type="button"
                      onClick={() => remoteModels.forEach((remote) => addModel(makeModel(remote.name || remote.id, remote.id)))}
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-brand)', cursor: 'pointer', fontSize: 'var(--body-sm-font-size)', fontFamily: 'inherit' }}
                    >
                      全部加入
                    </button>
                  </div>
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacer-6)', maxHeight: 92, overflowY: 'auto', paddingRight: 'var(--spacer-4)' }}
                  >
                    {remoteModels.map((remote) => {
                      const displayName = remote.name || remote.id;
                      const added = models.some((model) => model.id === remote.id || model.name === displayName);
                      return (
                        <button
                          key={remote.id}
                          type="button"
                          onClick={() => addModel(makeModel(displayName, remote.id))}
                          disabled={added}
                          title={added ? '已加入' : '加入模型列表'}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-4)',
                            minHeight: 28,
                            padding: '0 var(--spacer-10)',
                            borderRadius: 'var(--radius-8)',
                            border: added ? '1px solid var(--border-neutral-l1)' : '1px solid var(--border-brand)',
                            background: added ? 'var(--bg-overlay-l1)' : 'var(--bg-base-default)',
                            color: added ? 'var(--text-tertiary)' : 'var(--text-brand)',
                            cursor: added ? 'default' : 'pointer',
                            fontSize: 'var(--body-sm-font-size)',
                            fontFamily: 'var(--font-family-mono)',
                          }}
                        >
                          {added ? <Check size={12} /> : <Plus size={12} />}
                          {displayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual add row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--spacer-8)', alignItems: 'end' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>手动添加模型</label>
                  <input
                    type="text"
                    placeholder="例如: gpt-4o, claude-3-5-sonnet-20241022"
                    value={manualModelName}
                    onChange={(e) => setManualModelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualModel();
                      }
                    }}
                    style={inputBaseStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={addManualModel}
                  disabled={!manualModelName.trim()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacer-6)',
                    height: 36,
                    padding: '0 var(--spacer-16)',
                    borderRadius: 'var(--radius-8)',
                    background: manualModelName.trim() ? 'var(--bg-brand)' : 'var(--bg-brand-disabled)',
                    color: 'var(--text-onbrand)',
                    cursor: manualModelName.trim() ? 'pointer' : 'not-allowed',
                    opacity: manualModelName.trim() ? 1 : 0.65,
                    border: 'none',
                    fontSize: 'var(--body-base-font-size)',
                    fontFamily: 'inherit',
                  }}
                >
                  <Plus size={14} /> 添加
                </button>
              </div>

              {/* Model list with alias mapping */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={labelStyle}>已添加模型</span>
                  <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                    {models.length > 0 ? `${models.length} 个模型` : '暂无模型'}
                  </span>
                </div>

                {models.length === 0 ? (
                  <div
                    style={{
                      minHeight: 72,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed var(--border-neutral-l2)',
                      borderRadius: 'var(--radius-8)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-sm-font-size)',
                    }}
                  >
                    还没有模型。可以先拉取接口返回，或手动逐项添加。
                  </div>
                ) : (
                  <div
                    className="ds-scroll"
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)', maxHeight: 400, overflowY: 'auto', paddingRight: 'var(--spacer-4)' }}
                  >
                    {models.map((model, index) => (
                      <div
                        key={`${model.id}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 1fr) auto',
                          gap: 'var(--spacer-8)',
                          alignItems: 'center',
                          padding: 'var(--spacer-10)',
                          border: '1px solid var(--border-neutral-l1)',
                          borderRadius: 'var(--radius-8)',
                          background: 'var(--bg-base-default)',
                        }}
                      >
                        {/* Model name */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>模型名称</span>
                          <input
                            value={model.name}
                            onChange={(e) => updateModel(index, { name: e.target.value })}
                            placeholder="模型名称"
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                        </div>

                        {/* Alias */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                            别名（客户端可用此名称调用）
                          </span>
                          <input
                            value={model.alias ?? ''}
                            onChange={(e) => updateModel(index, { alias: e.target.value || undefined })}
                            placeholder="留空则使用模型名称"
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                        </div>

                        {/* Delete */}
                        <button
                          type="button"
                          aria-label="删除模型"
                          title="删除模型"
                          onClick={() => removeModel(index)}
                          style={{
                            width: 32,
                            height: 32,
                            marginTop: 'var(--spacer-18)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 'var(--radius-8)',
                            border: '1px solid var(--border-neutral-l1)',
                            background: 'transparent',
                            color: 'var(--icon-tertiary)',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>

                        {/* Capability switches */}
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                            gap: 'var(--spacer-8)',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                            <Eye size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>视觉</span>
                            <input
                              type="checkbox"
                              checked={Boolean(model.supportsVision)}
                              onChange={(e) => updateModel(index, { supportsVision: e.target.checked })}
                              style={{ accentColor: 'var(--bg-brand)', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                            <Brain size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>思考</span>
                            <input
                              type="checkbox"
                              checked={Boolean(model.supportsReasoning)}
                              onChange={(e) => updateModel(index, { supportsReasoning: e.target.checked })}
                              style={{ accentColor: 'var(--bg-brand)', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)', fontSize: 'var(--body-sm-font-size)', color: model.supportsReasoning ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>
                            <SlidersHorizontal size={14} style={{ color: model.supportsReasoning ? 'var(--icon-tertiary)' : 'var(--icon-disabled)' }} />
                            <span>思考强度</span>
                            <input
                              type="checkbox"
                              checked={Boolean(model.supportsReasoningEffort)}
                              disabled={!model.supportsReasoning}
                              onChange={(e) => updateModel(index, { supportsReasoningEffort: e.target.checked, defaultReasoningEffort: e.target.checked ? 'medium' : undefined })}
                              style={{ accentColor: 'var(--bg-brand)', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </label>
                          <Dropdown
                            options={REASONING_EFFORT_OPTIONS}
                            value={model.defaultReasoningEffort ?? 'medium'}
                            onChange={(v) => updateModel(index, { defaultReasoningEffort: v as Model['defaultReasoningEffort'] })}
                            disabled={!model.supportsReasoningEffort}
                            size="sm"
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                            <Wrench size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>工具调用</span>
                            <input
                              type="checkbox"
                              checked={Boolean(model.supportsToolCalls)}
                              onChange={(e) => updateModel(index, { supportsToolCalls: e.target.checked })}
                              style={{ accentColor: 'var(--bg-brand)', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)', fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
                            <Braces size={14} style={{ color: 'var(--icon-tertiary)' }} />
                            <span>JSON 模式</span>
                            <input
                              type="checkbox"
                              checked={Boolean(model.supportsJsonMode)}
                              onChange={(e) => updateModel(index, { supportsJsonMode: e.target.checked })}
                              style={{ accentColor: 'var(--bg-brand)', width: 16, height: 16, cursor: 'pointer' }}
                            />
                          </label>
                        </div>

                        {/* Context window & max output tokens */}
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: 'var(--spacer-8)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              上下文长度（tokens）
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={model.contextWindow ?? ''}
                              onChange={(e) => updateModel(index, { contextWindow: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="如 128000"
                              style={{
                                ...inputBaseStyle,
                                height: 32,
                                fontFamily: 'var(--font-family-mono)',
                                fontSize: 'var(--body-sm-font-size)',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)' }}>
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              最大输出长度（tokens）
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={model.maxOutputTokens ?? ''}
                              onChange={(e) => updateModel(index, { maxOutputTokens: e.target.value ? Number(e.target.value) : undefined })}
                              placeholder="如 8192"
                              style={{
                                ...inputBaseStyle,
                                height: 32,
                                fontFamily: 'var(--font-family-mono)',
                                fontSize: 'var(--body-sm-font-size)',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Model mapping (collapsible) */}
              <div
                style={{
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setModelMappingExpanded((v) => !v)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--spacer-12)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-default)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-2)', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 'var(--font-weight-medium)' }}>模型映射</span>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                      将客户端请求的模型名映射到上游实际模型名（支持通配符 *）
                    </span>
                  </div>
                  {modelMappingExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {modelMappingExpanded && (
                  <div
                    style={{
                      padding: 'var(--spacer-12)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacer-8)',
                      borderTop: '1px solid var(--border-neutral-l1)',
                    }}
                  >
                    {modelMappingEntries.length === 0 ? (
                      <div
                        style={{
                          minHeight: 48,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-tertiary)',
                          fontSize: 'var(--body-sm-font-size)',
                        }}
                      >
                        暂无映射规则
                      </div>
                    ) : (
                      modelMappingEntries.map((entry, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto',
                            gap: 'var(--spacer-8)',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="text"
                            placeholder="逻辑模型名，如 gpt-4 或 claude-*"
                            value={entry.key}
                            onChange={(e) => updateModelMappingEntry(index, { key: e.target.value })}
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>-&gt;</span>
                          <input
                            type="text"
                            placeholder="上游模型名，如 gpt-4o-2024-08-06"
                            value={entry.value}
                            onChange={(e) => updateModelMappingEntry(index, { value: e.target.value })}
                            style={{
                              ...inputBaseStyle,
                              height: 32,
                              fontFamily: 'var(--font-family-mono)',
                              fontSize: 'var(--body-sm-font-size)',
                            }}
                          />
                          <button
                            type="button"
                            aria-label="删除映射"
                            title="删除映射"
                            onClick={() => removeModelMappingEntry(index)}
                            style={{
                              width: 32,
                              height: 32,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 'var(--radius-8)',
                              border: '1px solid var(--border-neutral-l1)',
                              background: 'transparent',
                              color: 'var(--icon-tertiary)',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={addModelMappingEntry}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-6)',
                        height: 32,
                        padding: '0 var(--spacer-12)',
                        borderRadius: 'var(--radius-8)',
                        background: 'transparent',
                        color: 'var(--text-brand)',
                        border: '1px dashed var(--border-brand)',
                        cursor: 'pointer',
                        fontSize: 'var(--body-sm-font-size)',
                        fontFamily: 'inherit',
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Plus size={14} /> 添加映射规则
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Step>

          {/* ── Step 3: Test Connection ──────────────────── */}
          <Step>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)', padding: 'var(--spacer-8) 0' }}>
              <div
                style={{
                  padding: 'var(--spacer-16)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-4)', marginBottom: 'var(--spacer-12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                    <span style={{ color: 'var(--text-default)' }}>{name}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>{apiBase}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--body-sm-font-size)' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>协议</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{API_FLAVOR_OPTIONS.find((o) => o.value === apiFlavor)?.label}</span>
                  </div>
                </div>

                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--spacer-6)',
                    height: 36,
                    width: '100%',
                    padding: '0 var(--spacer-16)',
                    borderRadius: 'var(--radius-8)',
                    background: testResult === 'success' ? 'var(--status-success-default)' : 'var(--bg-brand)',
                    color: 'var(--text-onbrand)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--body-base-font-size)',
                    fontFamily: 'inherit',
                    opacity: testing ? 0.7 : 1,
                  }}
                >
                  {testing ? (
                    <><Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> 测试中...</>
                  ) : testResult === 'success' ? (
                    <><Check size={16} /> 连接成功</>
                  ) : testResult === 'fail' ? (
                    <><RefreshCw size={16} /> 重新测试</>
                  ) : (
                    <>测试连接</>
                  )}
                </button>

                {testResult === 'success' && (
                  <div
                    style={{
                      marginTop: 'var(--spacer-8)',
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      borderRadius: 'var(--radius-6)',
                      background: 'var(--status-success-surface-l1)',
                      color: 'var(--status-success-default)',
                      fontSize: 'var(--body-sm-font-size)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-6)',
                    }}
                  >
                    <Check size={14} />
                    {testMessage || '配置有效，可以正常使用'}
                  </div>
                )}

                {testResult === 'fail' && (
                  <div
                    style={{
                      marginTop: 'var(--spacer-8)',
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      borderRadius: 'var(--radius-6)',
                      background: 'var(--status-error-surface-l1)',
                      color: 'var(--status-error-default)',
                      fontSize: 'var(--body-sm-font-size)',
                    }}
                  >
                    {testMessage || '连接失败，请检查 API Base URL 和 API Key 是否正确'}
                  </div>
                )}
              </div>

              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                测试连接将通过选定的 API Base 发送一个轻量请求以验证配置
              </span>
            </div>
          </Step>

          {/* ── Step 4: Complete ─────────────────────────── */}
          <Step>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)', alignItems: 'center', padding: 'var(--spacer-16) 0' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--radius-full)',
                  background: finishError ? 'var(--status-error-surface-l1)' : 'var(--status-success-surface-l1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {finishError ? (
                  <RefreshCw size={24} style={{ color: 'var(--status-error-default)' }} />
                ) : (
                  <Check size={28} strokeWidth={3} style={{ color: 'var(--status-success-default)' }} />
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--heading-sm-font-size)', fontWeight: 'var(--font-weight-strong)', marginBottom: 'var(--spacer-4)' }}>
                  {finishError ? '保存失败' : '配置已验证'}
                </div>
                <div style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-tertiary)' }}>
                  {finishError
                    ? '请检查配置后重试'
                    : `提供商「${name}」已通过连接测试，点击下方按钮完成保存`}
                </div>
              </div>

              {finishError && (
                <div
                  style={{
                    width: '100%',
                    padding: 'var(--spacer-8) var(--spacer-12)',
                    borderRadius: 'var(--radius-6)',
                    background: 'var(--status-error-surface-l1)',
                    color: 'var(--status-error-default)',
                    fontSize: 'var(--body-sm-font-size)',
                    textAlign: 'center',
                  }}
                >
                  {finishError}
                </div>
              )}

              <div
                style={{
                  width: '100%',
                  padding: 'var(--spacer-12)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-base-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--spacer-4)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>提供商</span>
                  <span style={{ color: 'var(--text-default)' }}>{name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>API Base</span>
                  <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--body-xs-font-size)' }}>{apiBase}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>模型数量</span>
                  <span style={{ color: 'var(--text-default)' }}>{models.length || '未配置'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>连接状态</span>
                  <span style={{ color: testResult === 'success' ? 'var(--status-success-default)' : 'var(--status-alert-default)' }}>
                    {testResult === 'success' ? '已连接' : '未测试'}
                  </span>
                </div>
              </div>
            </div>
          </Step>
        </Stepper>
      </div>
    </div>
  );
};
