import { useT } from '../../i18n';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import type { Model } from '../../types/provider';
import type { ProviderHealthSnapshot } from '../../lib/desktopApi';
import { ConfirmDialog, SpotlightCard, Tag, toast, ProviderLogo } from '../../components/ui';
import { ChevronRight, Pencil, Trash2, Bot, Copy, Power, PowerOff, Loader2 } from 'lucide-react';

const describeModelCapabilities = (model: Model, t: ReturnType<typeof useT>) => {
  const tags: string[] = [];
  if (model.contextWindow) tags.push(`${model.contextWindow.toLocaleString()} ctx`);
  if (model.maxOutputTokens) tags.push(`${model.maxOutputTokens.toLocaleString()} out`);
  if (model.supportsVision) tags.push(t('capability.vision'));
  if (model.supportsReasoning) tags.push(t('capability.reasoning'));
  if (model.supportsReasoningEffort) tags.push(t('capability.effort'));
  if (model.supportsToolCalls) tags.push(t('capability.tools'));
  if (model.supportsJsonMode) tags.push(t('capability.json'));
  return tags;
};

const getStatusConfig = (
  t: ReturnType<typeof useT>,
): Record<
  string,
  { tagVariant: 'green' | 'orange' | 'danger' | 'neutral'; label: string; cardStatus: string }
> => ({
  connected: { tagVariant: 'green', label: t('providers.status.connected'), cardStatus: 'normal' },
  configuring: { tagVariant: 'orange', label: t('providers.status.configuring'), cardStatus: 'unconfigured' },
  error: { tagVariant: 'danger', label: t('providers.status.error'), cardStatus: 'failed' },
  disabled: { tagVariant: 'neutral', label: t('providers.status.disabled'), cardStatus: 'disabled' },
  testing: { tagVariant: 'orange', label: t('providers.status.testing'), cardStatus: 'testing' },
  // Health-driven states (override provider.status Tag when not healthy)
  rate_limited: { tagVariant: 'orange', label: t('providers.status.rateLimited'), cardStatus: 'testing' },
  unhealthy: { tagVariant: 'danger', label: t('providers.status.circuitOpen'), cardStatus: 'failed' },
  auth_error: { tagVariant: 'danger', label: t('providers.status.authFailed'), cardStatus: 'failed' },
});

export const ProviderCard: React.FC<{ providerId: string; health?: ProviderHealthSnapshot }> = ({
  providerId,
  health,
}) => {
  const navigate = useNavigate();
  const t = useT();
  const provider = useProviderStore((s) => s.providers.find((p) => p.id === providerId));
  const updateProvider = useProviderStore((s) => s.updateProvider);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!provider) return null;

  const statusCfg = getStatusConfig(t)[provider.status] || getStatusConfig(t).configuring;
  // Health status takes priority over provider.status for the Tag display
  const healthCfg = health && health.status !== 'healthy' ? getStatusConfig(t)[health.status] : null;
  const tagVariant = healthCfg?.tagVariant ?? statusCfg.tagVariant;
  const tagLabel = healthCfg?.label ?? statusCfg.label;

  const handleCopyKey = () => {
    if (provider.apiKey) {
      navigator.clipboard
        .writeText(provider.apiKey)
        .then(() => {
          toast(t('providers.apiKeyCopied'), 'success');
        })
        .catch(() => {
          toast(t('providers.copyFailed'), 'error');
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
        transition: 'opacity var(--transition-normal, 0.2s ease), filter var(--transition-normal, 0.2s ease)',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={() => navigate(`/providers/${provider.id}`)}
        style={{ height: '100%' }}
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
              transition: 'color var(--transition-normal, 0.2s ease)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--heading-xs-font-family)',
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              lineHeight: 'var(--heading-xs-line-height)',
              color: isDisabled ? 'var(--text-disabled)' : 'var(--text-default)',
              transition: 'color var(--transition-normal, 0.2s ease)',
            }}
          >
            {provider.name}
          </span>
          {provider.status === 'testing' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--spacer-4)',
                padding: '0 var(--spacer-8)',
                borderRadius: 'var(--radius-4)',
                fontSize: 'var(--body-xs-font-size)',
                background: 'var(--status-primary-surface-l1)',
                color: 'var(--status-primary-default)',
              }}
            >
              <Loader2 size={10} style={{ animation: 'spin 0.6s linear infinite' }} />
              {t('providers.status.testing')}
            </span>
          ) : (
            <Tag variant={tagVariant} style={{ border: 'none' }}>
              {tagLabel}
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacer-4)' }}>
          <button
            className="mc-icon-btn"
            aria-label={isDisabled ? '启用提供商' : '禁用提供商'}
            title={isDisabled ? '启用' : '禁用'}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleEnabled();
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
              color: isDisabled ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
              cursor: 'pointer',
              transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
              e.currentTarget.style.color = isDisabled ? 'var(--status-success-hover)' : 'var(--status-error-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = isDisabled ? 'var(--status-success-default)' : 'var(--icon-tertiary)';
            }}
          >
            {isDisabled ? <PowerOff size={14} /> : <Power size={14} />}
          </button>
          <button
            className="mc-icon-btn"
            aria-label={t('models.edit')}
            title={t('models.edit')}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/providers/${provider.id}/edit`);
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
              transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
              e.currentTarget.style.color = 'var(--icon-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--icon-tertiary)';
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            className="mc-icon-btn"
            aria-label={t('models.delete')}
            title={t('models.delete')}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
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
              transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--status-error-surface-l1)';
              e.currentTarget.style.color = 'var(--status-error-default)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--icon-tertiary)';
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
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            API Base
          </span>
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
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            API Key
          </span>
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
                title={t('providers.apiKeyCopied')}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyKey();
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--icon-tertiary)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-4)',
                  padding: 0,
                  transition: 'color var(--transition-fast, 0.12s ease)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--icon-brand)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--icon-tertiary)';
                }}
              >
                <Copy size={12} />
              </button>
            </div>
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/providers/${provider.id}/edit`);
              }}
              style={{
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-brand)',
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textUnderlineOffset: 2,
              }}
            >
              {t('models.clickToConfig')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            模型数量
          </span>
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)' }}>
            {provider.models.length}
          </span>
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
            <span>{t('providers.connectError')}</span>
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
            <span>{t('providers.noApiKey')}</span>
          </div>
        )}
      </div>

      {/* Divider + Toggle model list */}
      <div style={{ height: 1, background: 'var(--border-neutral-l1)', margin: '0 var(--spacer-16)' }} />
      <div
        className="mc-provider-card__toggle"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-4)',
          padding: 'var(--spacer-8) var(--spacer-16)',
          cursor: 'pointer',
          color: 'var(--text-tertiary)',
          fontSize: 'var(--body-xs-font-size)',
          lineHeight: 'var(--body-xs-line-height)',
          transition: 'color var(--transition-fast, 0.12s ease), background var(--transition-fast, 0.12s ease)',
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
        <span
          className="mc-provider-card__chevron"
          style={{
            display: 'inline-flex',
            transition: 'transform var(--transition-normal, 0.2s ease)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronRight size={12} />
        </span>
        <span>{expanded ? t('providers.collapseModels') : t('providers.expandModels')}</span>
      </div>

      {/* Model list */}
      <div
        className="mc-provider-card__models"
        style={{
          maxHeight: expanded ? 500 : 0,
          overflow: 'hidden',
          transition: 'max-height var(--transition-normal, 0.2s ease), opacity var(--transition-fast, 0.12s ease)',
          opacity: expanded ? 1 : 0,
          padding: expanded ? 'var(--spacer-8) var(--spacer-16) var(--spacer-12)' : '0 var(--spacer-16)',
          borderTop: expanded ? '1px solid var(--border-neutral-l1)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: expanded ? 'var(--spacer-6)' : 0,
          background: 'var(--bg-white)',
        }}
      >
        {provider.models.map((model) => {
          const capabilityTags = describeModelCapabilities(model, t);
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
              {capabilityTags.map((tag) => (
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
        title={t('providers.deleteTitle')}
        message={`确定删除提供商「${provider.name}」？此操作不可撤销。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      </div>
    </SpotlightCard>
  );
};
