import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import type { Model } from '../../types/provider';
import { ConfirmDialog, SpotlightCard, Tag, toast, ProviderLogo } from '../../components/ui';
import { ChevronRight, Pencil, Trash2, Bot, Copy, Power, PowerOff, Loader2 } from 'lucide-react';

const describeModelCapabilities = (model: Model) => {
  const tags: string[] = [];
  if (model.contextWindow) tags.push(`${model.contextWindow.toLocaleString()} ctx`);
  if (model.maxOutputTokens) tags.push(`${model.maxOutputTokens.toLocaleString()} out`);
  if (model.supportsVision) tags.push('视觉');
  if (model.supportsReasoning) tags.push('思考');
  if (model.supportsReasoningEffort) tags.push('强度');
  if (model.supportsToolCalls) tags.push('工具');
  if (model.supportsJsonMode) tags.push('JSON');
  return tags;
};

const STATUS_CONFIG: Record<string, { tagVariant: 'green' | 'orange' | 'danger' | 'neutral'; label: string; cardStatus: string }> = {
  connected:    { tagVariant: 'green',   label: '已连接',     cardStatus: 'normal' },
  configuring: { tagVariant: 'orange',  label: '配置中',     cardStatus: 'unconfigured' },
  error:       { tagVariant: 'danger',  label: '连接失败',   cardStatus: 'failed' },
  disabled:    { tagVariant: 'neutral', label: '已禁用',     cardStatus: 'disabled' },
  testing:     { tagVariant: 'orange',  label: '测试中',     cardStatus: 'testing' },
};

export const ProviderCard: React.FC<{ providerId: string }> = ({ providerId }) => {
  const navigate = useNavigate();
  const provider = useProviderStore(s => s.providers.find(p => p.id === providerId));
  const updateProvider = useProviderStore(s => s.updateProvider);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!provider) return null;

  const statusCfg = STATUS_CONFIG[provider.status] || STATUS_CONFIG.configuring;

  const handleCopyKey = () => {
    if (provider.apiKey) {
      navigator.clipboard.writeText(provider.apiKey).then(() => {
        toast('API Key 已复制', 'success');
      }).catch(() => {
        toast('复制失败', 'error');
      });
    }
  };

  const handleDelete = async () => {
    try {
      await useProviderStore.getState().removeProvider(provider.id);
      toast(`已删除提供商「${provider.name}」`, 'info');
      setConfirmDelete(false);
    } catch (e) {
      console.error('Failed to remove provider:', e);
    }
  };

  const handleToggleEnabled = async () => {
    const newStatus = provider.status === 'disabled' ? 'connected' : 'disabled';
    try {
      await updateProvider(provider.id, { status: newStatus });
      toast(newStatus === 'disabled' ? `已禁用「${provider.name}」` : `已启用「${provider.name}」`, 'success');
    } catch (e) {
      console.error('Failed to toggle provider:', e);
    }
  };

  const isDisabled = provider.status === 'disabled';

  return (
    <SpotlightCard
      padding="0"
      variant={statusCfg.cardStatus === 'failed' ? 'danger' : 'neutral'}
      className={statusCfg.cardStatus !== 'normal' ? `rb-card-status--${statusCfg.cardStatus}` : ''}
      style={{
        overflow: 'hidden',
        opacity: isDisabled ? 0.7 : 1,
        filter: isDisabled ? 'saturate(0.7)' : 'none',
        transition: 'opacity var(--transition-normal, 0.2s) ease, filter var(--transition-normal, 0.2s) ease',
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
          <ProviderLogo
            providerId={provider.id}
            name={provider.name}
            size={20}
            style={{
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
              transition: 'color var(--transition-normal, 0.2s) ease',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--heading-xs-font-family)',
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              lineHeight: 'var(--heading-xs-line-height)',
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-default)',
              transition: 'color var(--transition-normal, 0.2s) ease',
            }}
          >
            {provider.name}
          </span>
          {provider.status === 'testing' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacer-4)', padding: '0 var(--spacer-8)', borderRadius: 'var(--radius-4)', fontSize: 'var(--body-xs-font-size)', background: 'var(--status-primary-surface-l1)', color: 'var(--status-primary-default)' }}>
              <Loader2 size={10} style={{ animation: 'spin 0.6s linear infinite' }} />
              测试中
            </span>
          ) : (
            <Tag variant={statusCfg.tagVariant} style={{ border: 'none' }}>
              {statusCfg.label}
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacer-4)' }}>
          <button
            className="mc-icon-btn"
            aria-label={isDisabled ? '启用提供商' : '禁用提供商'}
            title={isDisabled ? '启用' : '禁用'}
            onClick={handleToggleEnabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28, height: 28,
              borderRadius: 'var(--radius-6)', border: 'none',
              background: 'transparent',
              color: isDisabled ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; e.currentTarget.style.color = isDisabled ? 'var(--status-success-hover)' : 'var(--status-error-default)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isDisabled ? 'var(--status-success-default)' : 'var(--icon-tertiary)'; }}
          >
            {isDisabled ? <PowerOff size={14} /> : <Power size={14} />}
          </button>
          <button
            className="mc-icon-btn"
            aria-label="编辑提供商"
            title="编辑"
            onClick={() => navigate(`/providers/${provider.id}/edit`)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28, height: 28,
              borderRadius: 'var(--radius-6)', border: 'none',
              background: 'transparent',
              color: 'var(--icon-tertiary)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; e.currentTarget.style.color = 'var(--icon-default)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--icon-tertiary)'; }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="mc-icon-btn"
            aria-label="删除提供商"
            title="删除"
            onClick={() => setConfirmDelete(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28, height: 28,
              borderRadius: 'var(--radius-6)', border: 'none',
              background: 'transparent',
              color: 'var(--icon-tertiary)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--status-error-surface-l1)'; e.currentTarget.style.color = 'var(--status-error-default)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--icon-tertiary)'; }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
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
              <button
                title="复制 API Key"
                onClick={handleCopyKey}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, border: 'none', background: 'transparent',
                  color: 'var(--icon-tertiary)', cursor: 'pointer', borderRadius: 'var(--radius-4)',
                  padding: 0,
                  transition: 'color var(--transition-fast, 0.12s) ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--icon-brand)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--icon-tertiary)'; }}
              >
                <Copy size={12} />
              </button>
            </div>
          ) : (
            <span
              onClick={() => navigate(`/providers/${provider.id}/edit`)}
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

        {/* Error summary for failed status */}
        {provider.status === 'error' && (
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-12)',
              borderRadius: 'var(--radius-6)',
              background: 'var(--status-error-surface-l1)',
              color: 'var(--status-error-default)',
              fontSize: 'var(--body-xs-font-size)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              marginTop: 'var(--spacer-4)',
            }}
          >
            <span>连接异常，请检查 API Key 和 Base URL 是否正确</span>
          </div>
        )}

        {/* Unconfigured hint */}
        {provider.status === 'configuring' && (
          <div
            style={{
              padding: 'var(--spacer-8) var(--spacer-12)',
              borderRadius: 'var(--radius-6)',
              background: 'var(--status-alert-surface-l1)',
              color: 'var(--status-alert-default)',
              fontSize: 'var(--body-xs-font-size)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              marginTop: 'var(--spacer-4)',
            }}
          >
            <span>尚未配置 API Key，点击编辑完成配置</span>
          </div>
        )}
      </div>

      {/* Divider + Toggle model list */}
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
          transition: 'color var(--transition-fast, 0.12s) ease, background var(--transition-fast, 0.12s) ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent'; }}
      >
        <span
          style={{
            display: 'inline-flex',
            transition: 'transform var(--transition-normal, 0.2s) ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronRight size={12} />
        </span>
        <span>{expanded ? '收起模型列表' : '展开模型列表'}</span>
      </div>

      {/* Model list */}
      <div
        className="mc-provider-card__models"
        style={{
          maxHeight: expanded ? 500 : 0,
          overflow: 'hidden',
          transition: 'max-height var(--transition-normal, 0.2s) ease, opacity var(--transition-fast, 0.12s) ease',
          opacity: expanded ? 1 : 0,
          padding: expanded ? 'var(--spacer-8) var(--spacer-16) var(--spacer-12)' : '0 var(--spacer-16)',
          borderTop: expanded ? '1px solid var(--border-neutral-l1)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: expanded ? 'var(--spacer-6)' : 0,
          background: 'var(--bg-white)',
        }}
      >
        {provider.models.map(model => {
          const capabilityTags = describeModelCapabilities(model);
          return (
          <div
            key={model.id}
            className="mc-model-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-8)',
              flexWrap: 'wrap',
              fontSize: 'var(--body-sm-font-size)',
              lineHeight: 'var(--body-sm-line-height)',
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
            }}
          >
            <Bot size={14} style={{ color: isDisabled ? 'var(--icon-disabled)' : 'var(--icon-tertiary)' }} />
            <span>{model.name}</span>
            {capabilityTags.map(tag => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  padding: '0 var(--spacer-6)',
                  borderRadius: 'var(--radius-6)',
                  background: 'var(--bg-overlay-l1)',
                  color: isDisabled ? 'var(--text-disabled)' : 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          );
        })}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={confirmDelete}
        title="删除提供商"
        message={`确定删除提供商「${provider.name}」？此操作不可撤销。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </SpotlightCard>
  );
};
