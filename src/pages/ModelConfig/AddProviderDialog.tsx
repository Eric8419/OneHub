import { useState } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { X } from 'lucide-react';

interface AddProviderDialogProps {
  open: boolean;
  onClose: () => void;
}

export const AddProviderDialog: React.FC<AddProviderDialogProps> = ({ open, onClose }) => {
  const addProvider = useProviderStore(s => s.addProvider);
  const [name, setName] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelsText, setModelsText] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    setSaving(true);
    const modelNames = modelsText
      .split(/[,，\n]/)
      .map(s => s.trim())
      .filter(Boolean);

    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    addProvider({
      id,
      name: name.trim(),
      apiBase: apiBase.trim() || `https://api.${id}.com/v1`,
      apiKey: apiKey.trim(),
      status: apiKey.trim() ? 'connected' : 'configuring',
      models: modelNames.map(m => ({ id: m.toLowerCase().replace(/\s+/g, '-'), name: m })),
    });
    setSaving(false);
    onClose();
    // Reset form
    setName('');
    setApiBase('');
    setApiKey('');
    setModelsText('');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-overlay-l4)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="ds-dialog"
        style={{
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)',
          width: '100%',
          maxWidth: 520,
          overflow: 'hidden',
          color: 'var(--text-default)',
          boxShadow: '0 24px 64px color-mix(in srgb, var(--text-default) 14%, transparent), 0 4px 16px color-mix(in srgb, var(--text-default) 8%, transparent)',
        }}
      >
        {/* Header */}
        <div
          className="ds-dialog__head"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--spacer-16) var(--spacer-20)',
          }}
        >
          <span
            className="ds-dialog__title"
            style={{
              fontSize: 'var(--heading-sm-font-size)',
              lineHeight: 'var(--heading-sm-line-height)',
              fontWeight: 'var(--heading-sm-font-weight)',
              color: 'var(--text-default)',
            }}
          >
            添加提供商
          </span>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none',
              color: 'var(--icon-secondary)', cursor: 'pointer',
              borderRadius: 'var(--radius-8)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div
          className="ds-dialog__body"
          style={{
            padding: 'var(--spacer-16) var(--spacer-20)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--body-base-font-size)',
            lineHeight: 'var(--body-base-line-height)',
          }}
        >
          <div className="dialog-form" style={{ display: 'grid', gap: 'var(--spacer-16)' }}>
            {/* Provider Name */}
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
              <label style={{ color: 'var(--text-default)', fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
                提供商名称 <span style={{ color: 'var(--status-error-default)' }}>*</span>
              </label>
              <input
                type="text"
                placeholder="例如: OpenAI, Anthropic, DeepSeek"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{
                  height: 36, padding: '0 var(--spacer-12)',
                  borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                  background: 'var(--bg-base-default)', color: 'var(--text-default)',
                  fontSize: 'var(--body-base-font-size)', outline: 'none',
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* API Base URL */}
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
              <label style={{ color: 'var(--text-default)', fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
                API Base URL
              </label>
              <input
                type="text"
                placeholder="https://api.openai.com/v1"
                value={apiBase}
                onChange={e => setApiBase(e.target.value)}
                style={{
                  height: 36, padding: '0 var(--spacer-12)',
                  borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                  background: 'var(--bg-base-default)', color: 'var(--text-default)',
                  fontSize: 'var(--body-base-font-size)', outline: 'none',
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* API Key */}
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
              <label style={{ color: 'var(--text-default)', fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
                API Key
              </label>
              <input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{
                  height: 36, padding: '0 var(--spacer-12)',
                  borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                  background: 'var(--bg-base-default)', color: 'var(--text-default)',
                  fontSize: 'var(--body-base-font-size)', outline: 'none',
                  width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Models */}
            <div className="dialog-field" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-6)' }}>
              <label style={{ color: 'var(--text-default)', fontSize: 'var(--body-base-font-size)', fontWeight: 'var(--font-weight-medium)' }}>
                模型列表
              </label>
              <textarea
                placeholder="每行或逗号分隔，例如:&#10;GPT-4o, GPT-4o-mini, GPT-4.1"
                value={modelsText}
                onChange={e => setModelsText(e.target.value)}
                style={{
                  minHeight: 72, padding: 'var(--spacer-8) var(--spacer-12)',
                  borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                  background: 'var(--bg-base-default)', color: 'var(--text-default)',
                  fontSize: 'var(--body-base-font-size)', outline: 'none', resize: 'none',
                  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                模型将自动与聚合规则中的模型名匹配
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="ds-dialog__foot"
          style={{
            padding: 'var(--spacer-12) var(--spacer-20)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacer-8)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)',
              height: 28, padding: '0 var(--spacer-12)',
              borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
              cursor: 'pointer', background: 'var(--bg-overlay-l1)', color: 'var(--text-default)',
              fontSize: 'var(--body-base-strong-font-size)',
              fontWeight: 'var(--body-base-strong-font-weight)',
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-6)',
              height: 28, padding: '0 var(--spacer-12)',
              borderRadius: 'var(--radius-8)', border: 'none',
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              background: name.trim() ? 'var(--bg-brand)' : 'var(--bg-brand-disabled)',
              color: 'var(--text-onbrand)',
              fontSize: 'var(--body-base-strong-font-size)',
              fontWeight: 'var(--body-base-strong-font-weight)',
              opacity: name.trim() ? 1 : 0.6,
            }}
          >
            {saving ? '添加中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
};