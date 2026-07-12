import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { AnimatedContent, toast, Dropdown, Switch } from '../../components/ui';
import type { Model } from '../../types/provider';
import { desktopApi } from '../../lib/desktopApi';
import { Check, Loader2, Download, Plus, Trash2, Eye, Brain, SlidersHorizontal, ArrowLeft } from 'lucide-react';

interface RemoteModelEntry {
  id: string;
  name: string;
}

const API_FLAVOR_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
];

const REASONING_EFFORT_OPTIONS: Array<{ value: NonNullable<Model['defaultReasoningEffort']>; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

const modelIdFromName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  crypto.randomUUID?.() ||
  Date.now().toString(36);

const makeModel = (name: string, id?: string): Model => ({
  id: id?.trim() || modelIdFromName(name),
  name: name.trim(),
  supportsVision: false,
  supportsReasoning: false,
  supportsReasoningEffort: false,
});

export const EditProviderPage: React.FC = () => {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();
  const providers = useProviderStore((s) => s.providers);
  const updateProvider = useProviderStore((s) => s.updateProvider);

  const provider = providers.find((p) => p.id === providerId);

  // ── Editable state, lazy-initialised from provider ─────────
  const [name, setName] = useState(() => provider?.name ?? '');
  const [apiBase, setApiBase] = useState(() => provider?.apiBase ?? '');
  const [apiKey, setApiKey] = useState(() => provider?.apiKey ?? '');
  const [apiFlavor, setApiFlavor] = useState(() => provider?.apiFlavor || 'openai');
  const [models, setModels] = useState<Model[]>(() => (provider ? provider.models.map((m) => ({ ...m })) : []));

  // ── UI state ────────────────────────────────────────────────
  const [manualModelName, setManualModelName] = useState('');
  const [remoteModels, setRemoteModels] = useState<RemoteModelEntry[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchMessage, setModelFetchMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'fail'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Provider not found
  if (!provider) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--spacer-48) 0', color: 'var(--text-tertiary)' }}>
        <p>提供商未找到</p>
        <button
          onClick={() => navigate('/models')}
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
          <ArrowLeft size={16} />
          返回模型配置
        </button>
      </div>
    );
  }

  // ── Model helpers ──────────────────────────────────────────

  const addModel = (model: Model) => {
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
  };

  const addManualModel = () => {
    const cleanName = manualModelName.trim();
    if (!cleanName) return;
    addModel(makeModel(cleanName));
    setManualModelName('');
  };

  const updateModel = (index: number, patch: Partial<Model>) => {
    setModels((prev) =>
      prev.map((model, i) => {
        if (i !== index) return model;
        const next = { ...model, ...patch };
        if (patch.name !== undefined && !model.id) {
          next.id = modelIdFromName(patch.name);
        }
        if (patch.supportsReasoning === false) {
          next.supportsReasoningEffort = false;
          next.defaultReasoningEffort = undefined;
        }
        if (patch.supportsReasoningEffort === false) {
          next.defaultReasoningEffort = undefined;
        }
        return next;
      }),
    );
  };

  const removeModel = (index: number) => {
    setModels((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Fetch models ───────────────────────────────────────────

  const handleFetchModels = async () => {
    if (!apiBase.trim() || !apiKey.trim()) {
      toast('请先填写 API Base URL 和 API Key', 'error');
      return;
    }
    setFetchingModels(true);
    setModelFetchMessage('');
    try {
      const result = await desktopApi.fetchProviderModels(apiFlavor, apiBase, apiKey);
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

  // ── Test connection ────────────────────────────────────────

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMessage('');
    try {
      const result = await desktopApi.testProviderConnection(apiFlavor, apiBase, apiKey);
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

  // ── Save ───────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    const configuredModels = models
      .map((model) => ({ ...model, name: model.name.trim(), id: model.id || modelIdFromName(model.name) }))
      .filter((model) => model.name);

    try {
      await updateProvider(provider.id, {
        name: name.trim(),
        apiBase: apiBase.trim(),
        apiKey: apiKey.trim(),
        apiFlavor,
        status: testResult === 'success' ? 'connected' : provider.status,
        models: configuredModels,
      });
      toast(`提供商「${name}」已更新`, 'success');
      navigate('/models');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  const inputBaseStyle = {
    height: 36,
    padding: '0 var(--spacer-12)',
    borderRadius: 'var(--radius-8)',
    border: '1px solid var(--border-neutral-l1)',
    background: 'var(--bg-base-default)',
    color: 'var(--text-default)',
    fontSize: 'var(--body-base-font-size)',
    outline: 'none' as const,
    width: '100%' as const,
    boxSizing: 'border-box' as const,
    transition: 'border-color var(--transition-fast, 0.12s) ease',
  };

  const fieldStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--spacer-6)',
  };

  const labelStyle = {
    color: 'var(--text-default)',
    fontSize: 'var(--body-base-font-size)',
    fontWeight: 'var(--font-weight-medium)' as const,
  };

  const sectionTitleStyle = {
    fontSize: 'var(--body-sm-font-size)',
    fontWeight: 'var(--font-weight-strong)' as const,
    color: 'var(--text-secondary)',
    paddingBottom: 'var(--spacer-8)',
    borderBottom: '1px solid var(--border-neutral-l1)',
    marginBottom: 'var(--spacer-12)',
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <AnimatedContent duration={250} distance={8}>
        {/* ── Back button ─────────────────────────────────── */}
        <button
          onClick={() => navigate('/models')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            height: 32,
            padding: '0 var(--spacer-12)',
            borderRadius: 'var(--radius-8)',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 'var(--body-sm-font-size)',
            fontFamily: 'inherit',
            marginBottom: 'var(--spacer-16)',
            transition: 'color var(--transition-fast, 0.12s) ease, background var(--transition-fast, 0.12s) ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'var(--bg-overlay-l1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-tertiary)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <ArrowLeft size={16} />
          返回模型配置
        </button>

        {/* ── Provider name ───────────────────────────────── */}
        <div style={fieldStyle}>
          <label style={labelStyle}>提供商名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如: OpenAI, DeepSeek"
            style={inputBaseStyle}
          />
        </div>

        <div style={{ height: 'var(--spacer-20)' }} />

        {/* ── Credentials ─────────────────────────────────── */}
        <div>
          <div style={sectionTitleStyle}>凭据</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>API Base URL</label>
              <input
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://api.openai.com/v1"
                style={inputBaseStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                style={inputBaseStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>API 协议类型</label>
              <Dropdown options={API_FLAVOR_OPTIONS} value={apiFlavor} onChange={setApiFlavor} size="sm" />
            </div>
          </div>
        </div>

        <div style={{ height: 'var(--spacer-20)' }} />

        {/* ── Models ──────────────────────────────────────── */}
        <div>
          <div style={sectionTitleStyle}>模型列表</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            {/* Manual add + fetch */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 'var(--spacer-8)',
                alignItems: 'end',
              }}
            >
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
                onClick={addManualModel}
                disabled={!manualModelName.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-6)',
                  height: 36,
                  padding: '0 var(--spacer-16)',
                  borderRadius: 'var(--radius-8)',
                  cursor: manualModelName.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 'var(--body-base-font-size)',
                  fontWeight: 'var(--font-weight-medium)',
                  fontFamily: 'inherit',
                  border: 'none',
                  background: manualModelName.trim() ? 'var(--bg-brand)' : 'var(--bg-brand-disabled)',
                  color: 'var(--text-onbrand)',
                  opacity: manualModelName.trim() ? 1 : 0.65,
                  transition: 'background var(--transition-fast, 0.12s) ease',
                }}
              >
                <Plus size={14} />
                添加
              </button>
            </div>

            {/* Fetch button */}
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
                <span
                  style={{
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--text-default)',
                  }}
                >
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
                  padding: '0 var(--spacer-12)',
                  borderRadius: 'var(--radius-8)',
                  fontSize: 'var(--body-sm-font-size)',
                  fontWeight: 'var(--font-weight-medium)',
                  cursor: fetchingModels ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  border: '1px solid var(--border-neutral-l1)',
                  background: 'var(--bg-base-default)',
                  color: 'var(--text-secondary)',
                  opacity: fetchingModels ? 0.7 : 1,
                  transition: 'background var(--transition-fast, 0.12s) ease',
                }}
              >
                {fetchingModels ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} /> 拉取中
                  </>
                ) : (
                  <>
                    <Download size={14} /> 拉取模型
                  </>
                )}
              </button>
            </div>

            {/* Fetch message */}
            {modelFetchMessage && (
              <div
                style={{
                  padding: 'var(--spacer-8) var(--spacer-12)',
                  borderRadius: 'var(--radius-6)',
                  background:
                    remoteModels.length > 0 ? 'var(--status-success-surface-l1)' : 'var(--status-alert-surface-l1)',
                  color: remoteModels.length > 0 ? 'var(--status-success-default)' : 'var(--status-alert-default)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              >
                {modelFetchMessage}
              </div>
            )}

            {/* Remote models chips */}
            {remoteModels.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                    接口返回的模型
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      remoteModels.forEach((remote) => addModel(makeModel(remote.name || remote.id, remote.id)))
                    }
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-brand)',
                      cursor: 'pointer',
                      fontSize: 'var(--body-sm-font-size)',
                      fontFamily: 'inherit',
                    }}
                  >
                    全部加入
                  </button>
                </div>
                <div
                  className="ds-scroll"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--spacer-6)',
                    maxHeight: 92,
                    overflowY: 'auto',
                    paddingRight: 'var(--spacer-4)',
                  }}
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

            {/* Model list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={labelStyle}>已配置模型</span>
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
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacer-8)',
                    maxHeight: 400,
                    overflowY: 'auto',
                    paddingRight: 'var(--spacer-4)',
                  }}
                >
                  {models.map((model, index) => (
                    <div
                      key={`${model.id}-${index}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(260px, 1fr) 100px 100px auto',
                        gap: 'var(--spacer-8)',
                        alignItems: 'center',
                        padding: 'var(--spacer-10)',
                        border: '1px solid var(--border-neutral-l1)',
                        borderRadius: 'var(--radius-8)',
                        background: 'var(--bg-base-default)',
                      }}
                    >
                      {/* Row 1: name, context, max output, delete */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
                        <input
                          value={model.name}
                          onChange={(e) => updateModel(index, { name: e.target.value })}
                          placeholder="供应商模型名"
                          style={{
                            ...inputBaseStyle,
                            height: 32,
                            fontFamily: 'var(--font-family-mono)',
                            fontSize: 'var(--body-sm-font-size)',
                            flex: 1,
                            minWidth: 0,
                          }}
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={model.contextWindow ?? ''}
                        onChange={(e) =>
                          updateModel(index, { contextWindow: e.target.value ? Number(e.target.value) : undefined })
                        }
                        placeholder="上下文"
                        title="上下文长度"
                        style={{ ...inputBaseStyle, height: 32, fontSize: 'var(--body-sm-font-size)' }}
                      />
                      <input
                        type="number"
                        min={0}
                        value={model.maxOutputTokens ?? ''}
                        onChange={(e) =>
                          updateModel(index, { maxOutputTokens: e.target.value ? Number(e.target.value) : undefined })
                        }
                        placeholder="输出"
                        title="最大输出长度"
                        style={{ ...inputBaseStyle, height: 32, fontSize: 'var(--body-sm-font-size)' }}
                      />
                      <button
                        type="button"
                        aria-label="删除模型"
                        title="删除模型"
                        onClick={() => removeModel(index)}
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

                      {/* Row 2: capability switches */}
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                          gap: 'var(--spacer-8)',
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-6)',
                            fontSize: 'var(--body-sm-font-size)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Eye size={14} style={{ color: 'var(--icon-tertiary)' }} />
                          <span>视觉</span>
                          <Switch
                            checked={Boolean(model.supportsVision)}
                            onChange={(checked) => updateModel(index, { supportsVision: checked })}
                          />
                        </label>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-6)',
                            fontSize: 'var(--body-sm-font-size)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <Brain size={14} style={{ color: 'var(--icon-tertiary)' }} />
                          <span>思考</span>
                          <Switch
                            checked={Boolean(model.supportsReasoning)}
                            onChange={(checked) => updateModel(index, { supportsReasoning: checked })}
                          />
                        </label>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-6)',
                            fontSize: 'var(--body-sm-font-size)',
                            color: model.supportsReasoning ? 'var(--text-secondary)' : 'var(--text-disabled)',
                          }}
                        >
                          <SlidersHorizontal
                            size={14}
                            style={{ color: model.supportsReasoning ? 'var(--icon-tertiary)' : 'var(--icon-disabled)' }}
                          />
                          <span>强度</span>
                          <Switch
                            checked={Boolean(model.supportsReasoningEffort)}
                            disabled={!model.supportsReasoning}
                            onChange={(checked) =>
                              updateModel(index, {
                                supportsReasoningEffort: checked,
                                defaultReasoningEffort: checked ? 'medium' : undefined,
                              })
                            }
                          />
                        </label>
                        <Dropdown
                          options={REASONING_EFFORT_OPTIONS}
                          value={model.defaultReasoningEffort ?? 'medium'}
                          onChange={(v) =>
                            updateModel(index, { defaultReasoningEffort: v as Model['defaultReasoningEffort'] })
                          }
                          disabled={!model.supportsReasoningEffort}
                          size="sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                别名用于给模型起一个不同的名字供客户端调用；留空则直接使用模型名称。
              </span>
            </div>
          </div>
        </div>

        <div style={{ height: 'var(--spacer-20)' }} />

        {/* ── Test Connection ──────────────────────────────── */}
        <div>
          <div style={sectionTitleStyle}>测试连接</div>
          <div
            style={{
              padding: 'var(--spacer-16)',
              borderRadius: 'var(--radius-8)',
              background: 'var(--bg-base-secondary)',
              border: '1px solid var(--border-neutral-l1)',
            }}
          >
            <button
              onClick={handleTestConnection}
              disabled={testing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-6)',
                height: 36,
                padding: '0 var(--spacer-20)',
                borderRadius: 'var(--radius-8)',
                cursor: testing ? 'not-allowed' : 'pointer',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: 'var(--font-weight-medium)',
                fontFamily: 'inherit',
                border: 'none',
                background: testResult === 'success' ? 'var(--status-success-default)' : 'var(--bg-brand)',
                color: 'var(--text-onbrand)',
                width: '100%',
                opacity: testing ? 0.7 : 1,
                transition: 'background var(--transition-fast, 0.12s) ease',
              }}
              onMouseEnter={(e) => {
                if (!testing && testResult !== 'success') e.currentTarget.style.background = 'var(--bg-brand-hover)';
              }}
              onMouseLeave={(e) => {
                if (!testing)
                  e.currentTarget.style.background =
                    testResult === 'success' ? 'var(--status-success-default)' : 'var(--bg-brand)';
              }}
            >
              {testing ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> 测试中...
                </>
              ) : testResult === 'success' ? (
                <>
                  <Check size={16} /> 连接有效
                </>
              ) : testResult === 'fail' ? (
                <>
                  <Loader2 size={16} /> 重新测试
                </>
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
                {testMessage || '连接失败，请检查 API Base URL 和 API Key'}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 'var(--spacer-24)' }} />

        {/* ── Action buttons ───────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacer-8)',
            paddingTop: 'var(--spacer-16)',
            borderTop: '1px solid var(--border-neutral-l1)',
          }}
        >
          <button
            onClick={() => navigate('/models')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 36,
              padding: '0 var(--spacer-16)',
              borderRadius: 'var(--radius-8)',
              cursor: 'pointer',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: 'var(--font-weight-medium)',
              fontFamily: 'inherit',
              border: '1px solid var(--border-neutral-l1)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              transition: 'background var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              height: 36,
              padding: '0 var(--spacer-20)',
              borderRadius: 'var(--radius-8)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: 'var(--font-weight-medium)',
              fontFamily: 'inherit',
              border: 'none',
              background: 'var(--bg-brand)',
              color: 'var(--text-onbrand)',
              opacity: saving ? 0.6 : 1,
              transition: 'background var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = 'var(--bg-brand-hover)';
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = 'var(--bg-brand)';
            }}
          >
            {saving ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} /> 保存中...
              </>
            ) : (
              <>
                <Check size={16} /> 保存
              </>
            )}
          </button>
        </div>
      </AnimatedContent>
    </div>
  );
};
