import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import type { Aggregation } from '../../types/aggregation';
import type { Model } from '../../types/provider';
import { SpotlightCard } from '../../components/ui';
import { Bot, ChevronRight, Eye, Brain, SlidersHorizontal, Wrench, Braces } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────

interface DirectMapping {
  kind: 'direct' | 'alias';
  providerName: string;
  providerId: string;
  /** Actual model name sent upstream (alias is resolved back to this). */
  modelName: string;
  model: Model;
  matchedBy: 'name' | 'alias';
}

interface AggMapping {
  kind: 'aggregation';
  aggregation: Aggregation;
  resolvedModels: Array<{
    modelName: string;
    providerName: string;
    providerId: string;
  }>;
}

type MappingSource = DirectMapping | AggMapping;

interface ExposedEntry {
  name: string;
  sources: MappingSource[];
}

// ── Helpers ────────────────────────────────────────────────

const kindLabel = (sources: MappingSource[]): string => {
  const hasDirect = sources.some((s) => s.kind === 'direct');
  const hasAlias = sources.some((s) => s.kind === 'alias');
  const hasAgg = sources.some((s) => s.kind === 'aggregation');
  const parts: string[] = [];
  if (hasDirect) parts.push('直接');
  if (hasAlias) parts.push('别名');
  if (hasAgg) parts.push('聚合');
  return parts.join(' / ');
};

// ── Component ──────────────────────────────────────────────

export const ModelInventory: React.FC = () => {
  const navigate = useNavigate();
  const providers = useProviderStore((s) => s.providers);
  const aggregations = useAggregationStore((s) => s.aggregations);
  const [showAll, setShowAll] = useState(false);

  // Build the full list of externally-exposed names by merging:
  //   1. Every model's `name` (direct exposure)
  //   2. Every model's `alias` (alias exposure, if set and != name)
  //   3. Every enabled aggregation's `name` (aggregation exposure)
  const entries = useMemo(() => {
    const map = new Map<string, ExposedEntry>();

    const ensure = (name: string): ExposedEntry => {
      let e = map.get(name);
      if (!e) {
        e = { name, sources: [] };
        map.set(name, e);
      }
      return e;
    };

    for (const provider of providers) {
      for (const model of provider.models) {
        // Direct exposure via model.name
        if (model.name) {
          ensure(model.name).sources.push({
            kind: 'direct',
            providerName: provider.name,
            providerId: provider.id,
            modelName: model.name,
            model: { ...model },
            matchedBy: 'name',
          });
        }
        // Alias exposure
        const alias = model.alias?.trim();
        if (alias && alias !== model.name) {
          ensure(alias).sources.push({
            kind: 'alias',
            providerName: provider.name,
            providerId: provider.id,
            modelName: model.name,
            model: { ...model },
            matchedBy: 'alias',
          });
        }
      }
    }

    // Aggregation exposure
    for (const agg of aggregations) {
      if (!agg.enabled) continue;
      const modelNames = agg.models
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const resolvedModels: AggMapping['resolvedModels'] = [];
      for (const mn of modelNames) {
        for (const provider of providers) {
          for (const model of provider.models) {
            if (model.name === mn || model.alias?.trim() === mn) {
              resolvedModels.push({
                modelName: model.name,
                providerName: provider.name,
                providerId: provider.id,
              });
            }
          }
        }
      }
      ensure(agg.name).sources.push({
        kind: 'aggregation',
        aggregation: { ...agg },
        resolvedModels,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, aggregations]);

  const MAX_VISIBLE = 12;
  const visible = showAll ? entries : entries.slice(0, MAX_VISIBLE);
  const hasMore = entries.length > MAX_VISIBLE;

  if (entries.length === 0) return null;

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
            对外暴露的模型
          </h3>
          <p
            style={{
              fontSize: 'var(--body-sm-font-size)',
              color: 'var(--text-tertiary)',
              margin: 'var(--spacer-4) 0 0',
            }}
          >
            客户端可调用的所有模型入口 — 按名称分组，显示来源映射 · 共 {entries.length} 个
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--spacer-16)',
        }}
      >
        {visible.map((entry) => {
          // Only direct/alias sources have model params
          const paramSources = entry.sources.filter(
            (s): s is DirectMapping => s.kind === 'direct' || s.kind === 'alias',
          );
          const allVision = paramSources.length > 0 && paramSources.every((s) => s.model.supportsVision);
          const allReasoning = paramSources.length > 0 && paramSources.every((s) => s.model.supportsReasoning);
          const anyEffort = paramSources.some((s) => s.model.supportsReasoningEffort);
          const allToolCalls = paramSources.length > 0 && paramSources.every((s) => s.model.supportsToolCalls);
          const allJsonMode = paramSources.length > 0 && paramSources.every((s) => s.model.supportsJsonMode);
          const maxCtx = Math.max(0, ...paramSources.map((s) => s.model.contextWindow || 0));
          const maxOut = Math.max(0, ...paramSources.map((s) => s.model.maxOutputTokens || 0));

          const chips: { icon: React.ReactNode; label: string }[] = [];
          if (allVision) chips.push({ icon: <Eye size={12} />, label: '视觉' });
          if (allReasoning) chips.push({ icon: <Brain size={12} />, label: '思考' });
          if (anyEffort) chips.push({ icon: <SlidersHorizontal size={12} />, label: '强度' });
          if (allToolCalls) chips.push({ icon: <Wrench size={12} />, label: '工具' });
          if (allJsonMode) chips.push({ icon: <Braces size={12} />, label: 'JSON' });
          if (maxCtx > 0) chips.push({ icon: null, label: `${maxCtx.toLocaleString()} ctx` });
          if (maxOut > 0) chips.push({ icon: null, label: `${maxOut.toLocaleString()} out` });

          return (
            <SpotlightCard key={entry.name} padding="0" variant="neutral" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/models/${encodeURIComponent(entry.name)}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* ── Title row ── */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--spacer-10)',
                    padding: 'var(--spacer-16) var(--spacer-16)',
                  }}
                >
                  <Bot size={16} style={{ color: 'var(--icon-tertiary)', flexShrink: 0, marginTop: 2 }} />
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
                      {entry.name}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-8)',
                        marginTop: 'var(--spacer-6)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          padding: '0 var(--spacer-6)',
                          borderRadius: 'var(--radius-4)',
                          background: 'var(--bg-overlay-l1)',
                          color: 'var(--text-secondary)',
                          fontSize: 'var(--body-xs-font-size)',
                        }}
                      >
                        {kindLabel(entry.sources)}
                      </span>
                      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                        {entry.sources.length} 个来源
                      </span>
                      {maxCtx > 0 && (
                        <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                          {maxCtx.toLocaleString()} ctx
                        </span>
                      )}
                    </div>
                    {/* ── Capability chips ── */}
                    {chips.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          gap: 'var(--spacer-6)',
                          marginTop: 'var(--spacer-10)',
                          flexWrap: 'wrap',
                        }}
                      >
                        {chips.map((chip) => (
                          <span
                            key={chip.label}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--spacer-4)',
                              height: 22,
                              padding: '0 var(--spacer-8)',
                              borderRadius: 'var(--radius-6)',
                              background: 'var(--bg-overlay-l1)',
                              color: 'var(--text-tertiary)',
                              fontSize: 'var(--body-xs-font-size)',
                            }}
                          >
                            {chip.icon} {chip.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      color: 'var(--icon-tertiary)',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <ChevronRight size={16} />
                  </span>
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
              transition: 'background var(--transition-fast, 0.12s ease)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-overlay-l1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {showAll ? `收起，仅显示 ${MAX_VISIBLE} 个` : `展开全部（共 ${entries.length} 个）`}
          </button>
        </div>
      )}
    </div>
  );
};
