import { useState, useMemo } from 'react';
import { useProviderStore } from '../../store/providerStore';
import type { Model } from '../../types/provider';
import { SpotlightCard } from '../../components/ui';
import { Bot, ChevronRight, Eye, Brain, SlidersHorizontal } from 'lucide-react';

interface ModelMapping {
  providerName: string;
  providerId: string;
  modelName: string;
  model: Model;
}

interface ModelGroup {
  name: string;
  mappings: ModelMapping[];
}

const capabilityTags = (m: Model) => {
  const tags: string[] = [];
  if (m.supportsVision) tags.push('视觉');
  if (m.supportsReasoning) tags.push('思考');
  if (m.supportsReasoningEffort) tags.push('强度');
  return tags;
};

export const ModelInventory: React.FC = () => {
  const providers = useProviderStore((s) => s.providers);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Group all models by their name
  const groups = useMemo(() => {
    const map = new Map<string, ModelGroup>();
    for (const provider of providers) {
      for (const model of provider.models) {
        const key = model.name;
        let group = map.get(key);
        if (!group) {
          group = { name: key, mappings: [] };
          map.set(key, group);
        }
        group.mappings.push({
          providerName: provider.name,
          providerId: provider.id,
          modelName: model.name,
          model: { ...model },
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [providers]);

  // Limit to first N when collapsed
  const MAX_VISIBLE = 12;
  const visible = showAll ? groups : groups.slice(0, MAX_VISIBLE);
  const hasMore = groups.length > MAX_VISIBLE;

  if (groups.length === 0) return null;

  const toggleExpand = (key: string) => {
    setExpandedName((prev) => (prev === key ? null : key));
  };

  return (
    <div className="mc-section" style={{ marginBottom: 'var(--spacer-32)' }}>
      {/* Section title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacer-16)',
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              color: 'var(--text-default)',
              margin: 0,
            }}
          >
            模型清单
          </h3>
          <p
            style={{
              fontSize: 'var(--body-sm-font-size)',
              color: 'var(--text-tertiary)',
              margin: 'var(--spacer-4) 0 0',
            }}
          >
            所有供应商模型的统一视图 — 按模型名分组，{groups.length} 个可调用入口
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--spacer-12)',
        }}
      >
        {visible.map((group) => {
          const isExpanded = expandedName === group.name;
          // Determine the "common" capability across mappings
          const allVision = group.mappings.every((m) => m.model.supportsVision);
          const allReasoning = group.mappings.every((m) => m.model.supportsReasoning);
          const anyEffort = group.mappings.some((m) => m.model.supportsReasoningEffort);
          const maxCtx = Math.max(...group.mappings.map((m) => m.model.contextWindow || 0));
          const maxOutput = Math.max(...group.mappings.map((m) => m.model.maxOutputTokens || 0));

          return (
            <SpotlightCard key={group.name} padding="0" variant="neutral" style={{ overflow: 'hidden' }}>
              {/* ── Card header ── */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-8)',
                  padding: 'var(--spacer-12) var(--spacer-14)',
                  cursor: 'pointer',
                }}
                onClick={() => toggleExpand(group.name)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Bot size={16} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--body-base-font-size)',
                      fontWeight: 'var(--font-weight-strong)',
                      color: 'var(--text-default)',
                      fontFamily: 'var(--font-family-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {group.name}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--body-xs-font-size)',
                      color: 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-4)',
                      marginTop: 'var(--spacer-2)',
                    }}
                  >
                    <span>{group.mappings.length} 个映射</span>
                    {maxCtx > 0 && (
                      <span>
                        · <span style={{ color: 'var(--text-secondary)' }}>{maxCtx.toLocaleString()} ctx</span>
                      </span>
                    )}
                    {maxOutput > 0 && (
                      <span>
                        · <span style={{ color: 'var(--text-secondary)' }}>{maxOutput.toLocaleString()} out</span>
                      </span>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    transition: 'transform var(--transition-normal, 0.2s) ease',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'var(--icon-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={14} />
                </span>
              </div>

              {/* ── Capability chips ── */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacer-4)',
                  padding: isExpanded ? '0 var(--spacer-14) var(--spacer-8)' : '0 var(--spacer-14) var(--spacer-12)',
                  flexWrap: 'wrap',
                }}
              >
                {allVision && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-2)',
                      height: 22,
                      padding: '0 var(--spacer-6)',
                      borderRadius: 'var(--radius-4)',
                      background: 'var(--bg-overlay-l1)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-xs-font-size)',
                    }}
                  >
                    <Eye size={11} /> 视觉
                  </span>
                )}
                {allReasoning && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-2)',
                      height: 22,
                      padding: '0 var(--spacer-6)',
                      borderRadius: 'var(--radius-4)',
                      background: 'var(--bg-overlay-l1)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-xs-font-size)',
                    }}
                  >
                    <Brain size={11} /> 思考
                  </span>
                )}
                {anyEffort && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-2)',
                      height: 22,
                      padding: '0 var(--spacer-6)',
                      borderRadius: 'var(--radius-4)',
                      background: 'var(--bg-overlay-l1)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-xs-font-size)',
                    }}
                  >
                    <SlidersHorizontal size={11} /> 强度
                  </span>
                )}
              </div>

              {/* ── Expanded mapping list ── */}
              <div
                style={{
                  maxHeight: isExpanded ? 400 : 0,
                  overflow: 'hidden',
                  transition:
                    'max-height var(--transition-normal, 0.25s) ease, opacity var(--transition-fast, 0.15s) ease',
                  opacity: isExpanded ? 1 : 0,
                }}
              >
                <div style={{ height: 1, background: 'var(--border-neutral-l1)', margin: '0 var(--spacer-14)' }} />
                <div
                  style={{
                    padding: 'var(--spacer-8) var(--spacer-14) var(--spacer-12)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacer-6)',
                  }}
                >
                  {group.mappings.map((m, idx) => {
                    const tags = capabilityTags(m.model);
                    return (
                      <div
                        key={`${m.providerId}-${m.modelName}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--spacer-2)',
                          padding: 'var(--spacer-6) var(--spacer-8)',
                          borderRadius: 'var(--radius-6)',
                          background: idx % 2 === 0 ? 'var(--bg-base-default)' : 'var(--bg-overlay-l1)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-6)',
                            fontSize: 'var(--body-sm-font-size)',
                          }}
                        >
                          <span style={{ color: 'var(--text-brand)', fontWeight: 'var(--font-weight-medium)' }}>
                            {m.providerName}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--spacer-4)', flexWrap: 'wrap' }}>
                          {m.model.contextWindow && (
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              ctx: {m.model.contextWindow.toLocaleString()}
                            </span>
                          )}
                          {m.model.maxOutputTokens && (
                            <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                              out: {m.model.maxOutputTokens.toLocaleString()}
                            </span>
                          )}
                          {tags.map((t) => (
                            <span
                              key={t}
                              style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SpotlightCard>
          );
        })}
      </div>

      {/* ── Show more / collapse ── */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: 'var(--spacer-16)' }}>
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-4)',
              height: 32,
              padding: '0 var(--spacer-16)',
              borderRadius: 'var(--radius-8)',
              border: '1px solid var(--border-neutral-l1)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--body-sm-font-size)',
              fontFamily: 'inherit',
              transition: 'background var(--transition-fast, 0.12s) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {showAll ? `收起，仅显示 ${MAX_VISIBLE} 个` : `展开全部（共 ${groups.length} 个）`}
          </button>
        </div>
      )}
    </div>
  );
};
