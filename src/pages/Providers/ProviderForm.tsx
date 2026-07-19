import { useState } from 'react';
import { Dropdown, Switch, toast } from '../../components/ui';
import type { Model, Provider } from '../../types/provider';
import { Plus, Trash2, Eye, Brain, SlidersHorizontal, Check, Loader2 } from 'lucide-react';

const API_FLAVOR_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'responses', label: 'Responses' },
];

const REASONING_EFFORT_OPTIONS: Array<{ value: NonNullable<Model['defaultReasoningEffort']>; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

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

export type ProviderDraft = Pick<Provider, 'name' | 'apiBase' | 'apiKey' | 'apiFlavor' | 'models'>;

interface ProviderFormProps {
  values: ProviderDraft;
  onChange: (values: ProviderDraft) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  loading?: boolean;
  showCredentials?: boolean;
  showActions?: boolean;
}

export const ProviderForm: React.FC<ProviderFormProps> = ({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = '保存',
  loading = false,
  showCredentials = false,
  showActions = true,
}) => {
  const [urlError, setUrlError] = useState('');
  const [manualModelName, setManualModelName] = useState('');

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError('');
      return false;
    }
    const isValid = url.startsWith('http://') || url.startsWith('https://');
    setUrlError(isValid ? '' : '请输入有效的 HTTP/HTTPS URL');
    return isValid;
  };

  const addModel = (model: Model) => {
    const cleanName = model.name.trim();
    if (!cleanName) return;
    const exists = values.models.some((m) => m.name.toLowerCase() === cleanName.toLowerCase() || m.id === model.id);
    if (exists) {
      toast(`模型「${cleanName}」已在列表中`, 'info');
      return;
    }
    onChange({ ...values, models: [...values.models, { ...model, name: cleanName }] });
  };

  const addManualModel = () => {
    const cleanName = manualModelName.trim();
    if (!cleanName) return;
    addModel(makeModel(cleanName));
    setManualModelName('');
  };

  const updateModel = (index: number, patch: Partial<Model>) => {
    onChange({
      ...values,
      models: values.models.map((model, i) => {
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
    });
  };

  const removeModel = (index: number) => {
    onChange({ ...values, models: values.models.filter((_, i) => i !== index) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showCredentials && values.apiBase && !validateUrl(values.apiBase)) return;
    onSubmit?.();
  };

  // ── Styles ────────────────────────────────────────────

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
    transition: 'border-color var(--transition-fast, 0.12s ease)',
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

  const btnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacer-6)',
    height: 36,
    padding: '0 var(--spacer-20)',
    borderRadius: 'var(--radius-8)',
    cursor: 'pointer',
    fontSize: 'var(--body-base-font-size)',
    fontWeight: 'var(--font-weight-medium)' as const,
    fontFamily: 'inherit' as const,
    border: 'none',
    transition: 'background var(--transition-fast, 0.12s ease), opacity var(--transition-fast, 0.12s ease)',
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Credential fields ─────────────────────────────── */}
      {showCredentials && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-16)' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>提供商名称</label>
            <input
              type="text"
              value={values.name}
              onChange={(e) => onChange({ ...values, name: e.target.value })}
              placeholder="例如: OpenAI, Anthropic, DeepSeek"
              style={inputBaseStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>API Base URL</label>
            <input
              type="text"
              value={values.apiBase}
              onChange={(e) => {
                onChange({ ...values, apiBase: e.target.value });
                if (urlError) validateUrl(e.target.value);
              }}
              onBlur={() => validateUrl(values.apiBase)}
              placeholder="https://api.openai.com/v1"
              style={{
                ...inputBaseStyle,
                borderColor: urlError ? 'var(--status-error-default)' : 'var(--border-neutral-l1)',
              }}
            />
            {urlError && (
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--status-error-default)' }}>
                {urlError}
              </span>
            )}
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={values.apiKey}
              onChange={(e) => onChange({ ...values, apiKey: e.target.value })}
              placeholder="sk-..."
              style={inputBaseStyle}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>API 协议类型</label>
            <Dropdown
              options={API_FLAVOR_OPTIONS}
              value={values.apiFlavor || 'openai-compatible'}
              onChange={(v) => onChange({ ...values, apiFlavor: v })}
              size="sm"
            />
          </div>
        </div>
      )}

      {/* ── Model editor ──────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacer-12)',
          marginTop: showCredentials ? 'var(--spacer-20)' : 0,
        }}
      >
        {/* Manual add row */}
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
            type="button"
            onClick={addManualModel}
            disabled={!manualModelName.trim()}
            style={{
              ...btnStyle,
              background: manualModelName.trim() ? 'var(--bg-brand)' : 'var(--bg-brand-disabled)',
              color: 'var(--text-onbrand)',
              cursor: manualModelName.trim() ? 'pointer' : 'not-allowed',
              opacity: manualModelName.trim() ? 1 : 0.65,
              height: 36,
              padding: '0 var(--spacer-16)',
            }}
          >
            <Plus size={14} />
            添加
          </button>
        </div>

        {/* Model list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>已添加模型</span>
            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
              {values.models.length > 0 ? `${values.models.length} 个模型` : '暂无模型'}
            </span>
          </div>

          {values.models.length === 0 ? (
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
              {values.models.map((model, index) => (
                <div
                  key={`${model.id}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(160px, 1.2fr) 88px 88px auto',
                    gap: 'var(--spacer-8)',
                    alignItems: 'center',
                    padding: 'var(--spacer-10)',
                    border: '1px solid var(--border-neutral-l1)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-base-default)',
                  }}
                >
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
                  <input
                    type="number"
                    min={0}
                    value={model.contextWindow ?? ''}
                    onChange={(e) =>
                      updateModel(index, {
                        contextWindow: e.target.value ? Number(e.target.value) : undefined,
                      })
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
                      updateModel(index, {
                        maxOutputTokens: e.target.value ? Number(e.target.value) : undefined,
                      })
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

                  {/* Capability switches */}
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
                        style={{
                          color: model.supportsReasoning ? 'var(--icon-tertiary)' : 'var(--icon-disabled)',
                        }}
                      />
                      <span>思考强度</span>
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
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────── */}
      {showActions && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacer-8)',
            marginTop: 'var(--spacer-20)',
          }}
        >
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                ...btnStyle,
                border: '1px solid var(--border-neutral-l1)',
                background: 'transparent',
                color: 'var(--text-secondary)',
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
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              ...btnStyle,
              background: 'var(--bg-brand)',
              color: 'var(--text-onbrand)',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--bg-brand-hover)';
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = 'var(--bg-brand)';
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} />
                {submitLabel}
              </>
            ) : (
              <>
                <Check size={16} />
                {submitLabel}
              </>
            )}
          </button>
        </div>
      )}
    </form>
  );
};
