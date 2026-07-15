import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { strategyLabel } from '../../types/aggregation';
import type { Aggregation } from '../../types/aggregation';
import type { Model } from '../../types/provider';
import { Card, AnimatedContent } from '../../components/ui';
import {
  ArrowLeft,
  Bot,
  Eye,
  Brain,
  SlidersHorizontal,
  Layers,
  ArrowRight,
  Server,
  Cpu,
  FileText,
  Wrench,
  Braces,
} from 'lucide-react';

// ── Types (mirrors ModelInventory) ─────────────────────────

interface DirectMapping {
  kind: 'direct' | 'alias';
  providerName: string;
  providerId: string;
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

// ── Component ──────────────────────────────────────────────

export const ModelDetailPage: React.FC = () => {
  const { modelName } = useParams<{ modelName: string }>();
  const navigate = useNavigate();
  const providers = useProviderStore(s => s.providers);
  const aggregations = useAggregationStore(s => s.aggregations);

  // Decode URL-encoded model name
  const decodedName = decodeURIComponent(modelName || '');

  // Build sources for this specific model
  const sources = useMemo<MappingSource[]>(() => {
    const result: MappingSource[] = [];

    for (const provider of providers) {
      for (const model of provider.models) {
        if (model.name === decodedName) {
          result.push({
            kind: 'direct',
            providerName: provider.name,
            providerId: provider.id,
            modelName: model.name,
            model: { ...model },
            matchedBy: 'name',
          });
        }
        const alias = model.alias?.trim();
        if (alias && alias === decodedName && alias !== model.name) {
          result.push({
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

    for (const agg of aggregations) {
      if (!agg.enabled) continue;
      if (agg.name !== decodedName) continue;
      const modelNames = agg.models.split(',').map(s => s.trim()).filter(Boolean);
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
      result.push({
        kind: 'aggregation',
        aggregation: { ...agg },
        resolvedModels,
      });
    }

    return result;
  }, [decodedName, providers, aggregations]);

  // Aggregate capability info from direct/alias sources
  const paramSources = sources.filter(
    (s): s is DirectMapping => s.kind === 'direct' || s.kind === 'alias',
  );
  const allVision = paramSources.length > 0 && paramSources.every(s => s.model.supportsVision);
  const allReasoning = paramSources.length > 0 && paramSources.every(s => s.model.supportsReasoning);
  const anyEffort = paramSources.some(s => s.model.supportsReasoningEffort);
  const allToolCalls = paramSources.length > 0 && paramSources.every(s => s.model.supportsToolCalls);
  const allJsonMode = paramSources.length > 0 && paramSources.every(s => s.model.supportsJsonMode);
  const maxCtx = Math.max(0, ...paramSources.map(s => s.model.contextWindow || 0));
  const maxOutput = Math.max(0, ...paramSources.map(s => s.model.maxOutputTokens || 0));
  const hasDirect = sources.some(s => s.kind === 'direct');
  const hasAlias = sources.some(s => s.kind === 'alias');
  const hasAgg = sources.some(s => s.kind === 'aggregation');

  if (sources.length === 0) {
    return (
      <div style={{ padding: 'var(--spacer-48)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-16)' }}>
          未找到模型「{decodedName}」
        </p>
        <button
          onClick={() => navigate('/models')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid var(--border-neutral-l1)',
            borderRadius: 'var(--radius-8)',
            padding: 'var(--spacer-8) var(--spacer-16)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          <ArrowLeft size={14} /> 返回模型配置
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Back button ── */}
      <button
        onClick={() => navigate('/models')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacer-6)',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-tertiary)',
          fontFamily: 'inherit',
          fontSize: 'var(--body-sm-font-size)',
          padding: 0,
          marginBottom: 'var(--spacer-20)',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-default)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
      >
        <ArrowLeft size={16} /> 模型配置
      </button>

      {/* ── Header ── */}
      <AnimatedContent>
        <div style={{ marginBottom: 'var(--spacer-32)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)', marginBottom: 'var(--spacer-8)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-10)',
                background: 'var(--brand-100)',
                color: 'var(--icon-brand)',
                flexShrink: 0,
              }}
            >
              <Bot size={20} />
            </div>
            <h1
              style={{
                fontSize: 'var(--heading-lg-font-size)',
                fontWeight: 'var(--heading-lg-font-weight)',
                lineHeight: 'var(--heading-lg-line-height)',
                color: 'var(--text-default)',
                fontFamily: 'var(--font-family-mono)',
                margin: 0,
              }}
            >
              {decodedName}
            </h1>
          </div>
          <p style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-tertiary)', margin: 0 }}>
            {sources.length} 个来源映射
            {hasDirect && ' · 直接'}
            {hasAlias && ' · 别名'}
            {hasAgg && ' · 聚合'}
          </p>
        </div>
      </AnimatedContent>

      {/* ── Capability summary ── */}
      <AnimatedContent delay={60}>
        <Card style={{ marginBottom: 'var(--spacer-24)' }}>
          <h2
            style={{
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              color: 'var(--text-default)',
              margin: '0 0 var(--spacer-16) 0',
              paddingBottom: 'var(--spacer-12)',
              borderBottom: '1px solid var(--border-neutral-l1)',
            }}
          >
            能力概览
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 'var(--spacer-16)',
            }}
          >
            <CapabilityItem
              icon={<Eye size={18} />}
              label="视觉理解"
              enabled={allVision}
            />
            <CapabilityItem
              icon={<Brain size={18} />}
              label="深度思考"
              enabled={allReasoning}
            />
            <CapabilityItem
              icon={<SlidersHorizontal size={18} />}
              label="思考强度"
              enabled={anyEffort}
            />
            <CapabilityItem
              icon={<Wrench size={18} />}
              label="工具调用"
              enabled={allToolCalls}
            />
            <CapabilityItem
              icon={<Braces size={18} />}
              label="JSON 模式"
              enabled={allJsonMode}
            />
            {maxCtx > 0 && (
              <SpecItem icon={<FileText size={18} />} label="上下文窗口" value={maxCtx.toLocaleString()} />
            )}
            {maxOutput > 0 && (
              <SpecItem icon={<Cpu size={18} />} label="最大输出" value={maxOutput.toLocaleString()} />
            )}
          </div>
        </Card>
      </AnimatedContent>

      {/* ── Source mappings ── */}
      <AnimatedContent delay={120}>
        <Card>
          <h2
            style={{
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              color: 'var(--text-default)',
              margin: '0 0 var(--spacer-16) 0',
              paddingBottom: 'var(--spacer-12)',
              borderBottom: '1px solid var(--border-neutral-l1)',
            }}
          >
            来源映射
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            {sources.map((source, idx) => {
              if (source.kind === 'aggregation') {
                return <AggregationDetailRow key={`agg-${idx}`} source={source} />;
              }
              return <DirectDetailRow key={`dir-${idx}`} source={source} />;
            })}
          </div>
        </Card>
      </AnimatedContent>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────

const CapabilityItem: React.FC<{ icon: React.ReactNode; label: string; enabled: boolean }> = ({
  icon,
  label,
  enabled,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacer-10)',
      padding: 'var(--spacer-12) var(--spacer-14)',
      borderRadius: 'var(--radius-8)',
      background: enabled ? 'var(--brand-100)' : 'var(--bg-overlay-l1)',
      opacity: enabled ? 1 : 0.5,
    }}
  >
    <span style={{ color: enabled ? 'var(--icon-brand)' : 'var(--icon-tertiary)', display: 'flex' }}>
      {icon}
    </span>
    <span
      style={{
        fontSize: 'var(--body-sm-font-size)',
        fontWeight: 'var(--font-weight-medium)',
        color: enabled ? 'var(--text-default)' : 'var(--text-tertiary)',
      }}
    >
      {label}
    </span>
  </div>
);

const SpecItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacer-10)',
      padding: 'var(--spacer-12) var(--spacer-14)',
      borderRadius: 'var(--radius-8)',
      background: 'var(--bg-overlay-l1)',
    }}
  >
    <span style={{ color: 'var(--icon-tertiary)', display: 'flex' }}>{icon}</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>{label}</span>
      <span
        style={{
          fontSize: 'var(--body-sm-font-size)',
          fontWeight: 'var(--font-weight-strong)',
          color: 'var(--text-default)',
          fontFamily: 'var(--font-family-mono)',
        }}
      >
        {value}
      </span>
    </div>
  </div>
);

const DirectDetailRow: React.FC<{ source: DirectMapping }> = ({ source }) => {
  const tags: string[] = [];
  if (source.model.supportsVision) tags.push('视觉');
  if (source.model.supportsReasoning) tags.push('思考');
  if (source.model.supportsReasoningEffort) tags.push('强度');
  if (source.model.supportsToolCalls) tags.push('工具');
  if (source.model.supportsJsonMode) tags.push('JSON');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacer-10)',
        padding: 'var(--spacer-16)',
        borderRadius: 'var(--radius-10)',
        border: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-default)',
      }}
    >
      {/* Provider header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-6)',
            background: 'var(--brand-100)',
            color: 'var(--icon-brand)',
            flexShrink: 0,
          }}
        >
          <Server size={14} />
        </div>
        <span
          style={{
            fontSize: 'var(--body-base-font-size)',
            fontWeight: 'var(--font-weight-strong)',
            color: 'var(--text-default)',
          }}
        >
          {source.providerName}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 22,
            padding: '0 var(--spacer-8)',
            borderRadius: 'var(--radius-4)',
            background: 'var(--bg-overlay-l2)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {source.matchedBy === 'alias' ? '别名映射' : '直接映射'}
        </span>
      </div>

      {/* Alias arrow */}
      {source.matchedBy === 'alias' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            fontSize: 'var(--body-sm-font-size)',
            color: 'var(--text-tertiary)',
            paddingLeft: 36,
          }}
        >
          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{source.model.alias}</span>
          <ArrowRight size={12} />
          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{source.modelName}</span>
        </div>
      )}

      {/* Specs grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--spacer-8)',
          paddingLeft: 36,
        }}
      >
        {source.model.contextWindow ? (
          <Spec label="上下文窗口" value={source.model.contextWindow.toLocaleString()} />
        ) : null}
        {source.model.maxOutputTokens ? (
          <Spec label="最大输出" value={source.model.maxOutputTokens.toLocaleString()} />
        ) : null}
        {source.model.defaultReasoningEffort && (
          <Spec label="默认思考强度" value={source.model.defaultReasoningEffort} />
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--spacer-4)', alignItems: 'center' }}>
            {tags.map(t => (
              <span
                key={t}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 22,
                  padding: '0 var(--spacer-8)',
                  borderRadius: 'var(--radius-4)',
                  background: 'var(--bg-overlay-l2)',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--body-xs-font-size)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const AggregationDetailRow: React.FC<{ source: AggMapping }> = ({ source }) => {
  const { aggregation, resolvedModels } = source;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacer-10)',
        padding: 'var(--spacer-16)',
        borderRadius: 'var(--radius-10)',
        border: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-default)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-6)',
            background: 'var(--brand-100)',
            color: 'var(--icon-brand)',
            flexShrink: 0,
          }}
        >
          <Layers size={14} />
        </div>
        <span
          style={{
            fontSize: 'var(--body-base-font-size)',
            fontWeight: 'var(--font-weight-strong)',
            color: 'var(--text-default)',
          }}
        >
          聚合路由
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 22,
            padding: '0 var(--spacer-8)',
            borderRadius: 'var(--radius-4)',
            background: 'var(--bg-overlay-l2)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
          }}
        >
          {strategyLabel(aggregation.strategy)}
        </span>
        <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
          {resolvedModels.length} 个模型
        </span>
      </div>

      {/* Resolved models list */}
      {resolvedModels.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacer-6)',
            paddingLeft: 36,
          }}
        >
          {resolvedModels.map((rm, i) => (
            <div
              key={`${rm.providerId}-${rm.modelName}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                padding: 'var(--spacer-8) var(--spacer-12)',
                borderRadius: 'var(--radius-6)',
                background: 'var(--bg-overlay-l1)',
                fontSize: 'var(--body-sm-font-size)',
              }}
            >
              <Server size={12} style={{ color: 'var(--icon-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--font-weight-medium)' }}>
                {rm.providerName}
              </span>
              <ArrowRight size={10} style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-tertiary)' }}>
                {rm.modelName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Spec: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>
      {label}
    </div>
    <div
      style={{
        fontSize: 'var(--body-sm-font-size)',
        fontWeight: 'var(--font-weight-strong)',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-family-mono)',
      }}
    >
      {value}
    </div>
  </div>
);
