import { useState } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { Tag } from '../../components/ui';
import { ChevronDown, ChevronRight, Pencil, Trash2, Bot } from 'lucide-react';

export const ProviderCard: React.FC<{ providerId: string }> = ({ providerId }) => {
  const provider = useProviderStore(s => s.providers.find(p => p.id === providerId));
  const updateProvider = useProviderStore(s => s.updateProvider);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState('');

  if (!provider) return null;

  const handleEdit = () => {
    setEditKey(provider.apiKey);
    setEditing(true);
  };

  const handleSaveKey = async () => {
    try {
      await updateProvider(provider.id, {
        apiKey: editKey,
        status: editKey ? 'connected' : 'configuring',
      });
      setEditing(false);
    } catch (e) {
      console.error('Failed to save API key:', e);
    }
  };

  if (!provider) return null;

  return (
    <div
      className="mc-provider-card"
      style={{
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="mc-provider-card__header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacer-16) var(--spacer-16) var(--spacer-12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
          <span
            style={{
              fontFamily: 'var(--heading-xs-font-family)',
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              lineHeight: 'var(--heading-xs-line-height)',
              color: 'var(--text-default)',
            }}
          >
            {provider.name}
          </span>
          <Tag variant={provider.status === 'connected' ? 'green' : 'orange'} style={{ border: 'none' }}>
            {provider.status === 'connected' ? '已连接' : '配置中'}
          </Tag>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacer-4)' }}>
          <button
            className="mc-icon-btn"
            title="编辑"
            onClick={handleEdit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-6)',
              border: 'none',
              background: 'transparent',
              color: 'var(--icon-tertiary)',
              cursor: 'pointer',
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="mc-icon-btn"
            title="删除"
            onClick={async () => {
              if (window.confirm(`确定删除提供商「${provider.name}」？`)) {
                try {
                  await useProviderStore.getState().removeProvider(provider.id);
                } catch (e) {
                  console.error('Failed to remove provider:', e);
                }
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-6)',
              border: 'none',
              background: 'transparent',
              color: 'var(--icon-tertiary)',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Details */}
      <div
        className="mc-provider-card__details"
        style={{
          padding: '0 var(--spacer-16) var(--spacer-12)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacer-8)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>API Base</span>
          <span
            style={{
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-secondary)',
              textAlign: 'right',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 200,
              fontFamily: 'var(--code-terminal-font-family)',
            }}
          >
            {provider.apiBase}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>API Key</span>
          {provider.apiKey ? (
            <span
              style={{
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-secondary)',
                textAlign: 'right',
                fontFamily: 'var(--code-terminal-font-family)',
              }}
            >
              {provider.apiKey ? `${provider.apiKey.slice(0, 8)}...` : ''}
            </span>
          ) : (
            <span
              onClick={handleEdit}
              style={{
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-brand)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textUnderlineOffset: 2,
              }}
            >
              点击配置
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>模型数量</span>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>{provider.models.length}</span>
        </div>
      </div>

      {/* Divider + Toggle */}
      {editing && (
        <div style={{ padding: 'var(--spacer-8) var(--spacer-16) var(--spacer-8)' }}>
          <div style={{ display: 'flex', gap: 'var(--spacer-8)', alignItems: 'center' }}>
            <input
              type="password"
              value={editKey}
              onChange={e => setEditKey(e.target.value)}
              placeholder="输入新的 API Key..."
              style={{
                flex: 1, height: 32, padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                background: 'var(--bg-white)', color: 'var(--text-default)',
                fontSize: 'var(--body-sm-font-size)', outline: 'none',
              }}
            />
            <button
              onClick={handleSaveKey}
              style={{
                height: 32, padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)', border: 'none',
                background: 'var(--bg-brand)', color: 'var(--text-onbrand)',
                cursor: 'pointer', fontSize: 'var(--body-sm-font-size)',
              }}
            >
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{
                height: 32, padding: '0 var(--spacer-12)',
                borderRadius: 'var(--radius-8)', border: '1px solid var(--border-neutral-l1)',
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 'var(--body-sm-font-size)',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
      <div style={{ height: 1, background: 'var(--border-neutral-l1)', margin: '0 var(--spacer-16)' }} />
      <div
        className="mc-provider-card__toggle"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-4)',
          padding: 'var(--spacer-8) var(--spacer-16)',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 'var(--body-xs-line-height)',
          transition: 'color 0.15s ease',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{expanded ? '收起模型列表' : '展开模型列表'}</span>
      </div>

      {/* Model list */}
      {expanded && (
        <div
          className="mc-provider-card__models"
          style={{
            padding: 'var(--spacer-8) var(--spacer-16) var(--spacer-12)',
            borderTop: '1px solid var(--border-neutral-l1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacer-6)',
            background: 'var(--bg-white)',
          }}
        >
          {provider.models.map(model => (
            <div
              key={model.id}
              className="mc-model-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                fontSize: 'var(--body-sm-font-size)',
                lineHeight: 'var(--body-sm-line-height)',
                color: 'var(--text-secondary)',
              }}
            >
              <Bot size={14} style={{ color: 'var(--icon-tertiary)' }} />
              <span>{model.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};