import { useMemo, useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { strategyLabel } from '../../types/aggregation';
import type { Aggregation } from '../../types/aggregation';
import type { Model, Provider } from '../../types/provider';
import { Card, AnimatedContent } from '../../components/ui';
import { toast } from '../../components/ui/Toast';
import { ModelBulkEditPanel, type BulkEditValues } from './ModelBulkEditPanel';
import { ModelSourcesTable, type SourceRow, type PendingEdits, type ModelPatch } from './ModelSourcesTable';
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

export const ModelDetailPage: React.FC = () => {
  const { modelName } = useParams<{ modelName: string }>();
  const navigate = useNavigate();
  const { providers, updateProvider } = useProviderStore();
  const aggregations = useAggregationStore(s => s.aggregations);

  const decodedName = decodeURIComponent(modelName || '');

  const [pendingEdits, setPendingEdits] = useState<PendingEdits>(new Map());
  const [saving, setSaving] = useState(false);

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

  const paramSources = sources.filter(
    (s): s is DirectMapping => s.kind === 'direct' || s.kind === 'alias',
  );

  const getEffectiveModel = useCallback((source: DirectMapping): Model => {
    const patch = pendingEdits.get(source.providerId);
    return patch ? { ...source.model, ...patch } : source.model;
  }, [pendingEdits]);

  const allVision = paramSources.length > 0 && paramSources.every(s => getEffectiveModel(s).supportsVision);
  const allReasoning = paramSources.length > 0 && paramSources.every(s => getEffectiveModel(s).supportsReasoning);
  const anyEffort = paramSources.some(s => getEffectiveModel(s).supportsReasoningEffort);
  const allToolCalls = paramSources.length > 0 && paramSources.every(s => getEffectiveModel(s).supportsToolCalls);
  const allJsonMode = paramSources.length > 0 && paramSources.every(s => getEffectiveModel(s).supportsJsonMode);
  const maxCtx = Math.max(0, ...paramSources.map(s => getEffectiveModel(s).contextWindow || 0));
  const maxOutput = Math.max(0, ...paramSources.map(s => getEffectiveModel(s).maxOutputTokens || 0));
  const hasDirect = sources.some(s => s.kind === 'direct');
  const hasAlias = sources.some(s => s.kind === 'alias');
  const hasAgg = sources.some(s => s.kind === 'aggregation');

  const directSources: SourceRow[] = useMemo(() => {
    const rows: SourceRow[] = [];
    const seenProviderIds = new Set<string>();
    for (const p of providers) {
      for (const m of p.models) {
        if (m.name === decodedName || m.alias === decodedName) {
          if (!seenProviderIds.has(p.id)) {
            rows.push({ providerId: p.id, provider: p, model: m, isAggregation: false });
            seenProviderIds.add(p.id);
          }
          break;
        }
      }
    }
    return rows;
  }, [providers, decodedName]);

  const aggSources: SourceRow[] = useMemo(() => {
    const rows: SourceRow[] = [];
    for (const agg of aggregations) {
      if (!agg.enabled) continue;
      if (agg.name !== decodedName) continue;
      const fakeProvider: Provider = {
        id: `agg_${agg.id}`,
        name: agg.name,
        apiBase: '',
        apiKey: '',
        status: 'disabled' as const,
        models: [],
      };
      rows.push({
        providerId: fakeProvider.id,
        provider: fakeProvider,
        model: { id: agg.id, name: decodedName } as Model,
        isAggregation: true,
      });
    }
    return rows;
  }, [aggregations, decodedName]);

  const allRows = useMemo(() => [...directSources, ...aggSources], [directSources, aggSources]);

  const bulkInitialValues: BulkEditValues = useMemo(() => {
    const ms = directSources.map(r => r.model);
    const allSame = <K extends keyof Model>(key: K): boolean => ms.length > 0 && ms.every(m => m[key] === ms[0][key]);
    const allSameBool = (key: 'supportsVision'|'supportsReasoning'|'supportsReasoningEffort'|'supportsToolCalls'|'supportsJsonMode'): boolean | null => {
      if (ms.length === 0) return null;
      if (allSame(key)) return ms[0][key] as boolean | null ?? null;
      return null;
    };
    const allSameNum = (key: 'contextWindow'|'maxOutputTokens'): number | null => {
      if (ms.length === 0) return null;
      if (allSame(key)) return ms[0][key] as number | null ?? null;
      return null;
    };
    const allSameEffort = (): 'low'|'medium'|'high'|null => {
      if (ms.length === 0) return null;
      if (allSame('defaultReasoningEffort')) return ms[0].defaultReasoningEffort ?? null;
      return null;
    };
    return {
      supportsVision: allSameBool('supportsVision'),
      supportsReasoning: allSameBool('supportsReasoning'),
      supportsReasoningEffort: allSameBool('supportsReasoningEffort'),
      supportsToolCalls: allSameBool('supportsToolCalls'),
      supportsJsonMode: allSameBool('supportsJsonMode'),
      contextWindow: allSameNum('contextWindow'),
      maxOutputTokens: allSameNum('maxOutputTokens'),
      defaultReasoningEffort: allSameEffort(),
    };
  }, [directSources]);

  const handleBulkApply = useCallback((values: BulkEditValues) => {
    setPendingEdits(prev => {
      const next = new Map(prev);
      directSources.forEach(row => {
        const existing = next.get(row.providerId) ?? {};
        const patch: ModelPatch = { ...existing };
        if (values.supportsVision !== null) patch.supportsVision = values.supportsVision;
        if (values.supportsReasoning !== null) patch.supportsReasoning = values.supportsReasoning;
        if (values.supportsReasoningEffort !== null) patch.supportsReasoningEffort = values.supportsReasoningEffort;
        if (values.supportsToolCalls !== null) patch.supportsToolCalls = values.supportsToolCalls;
        if (values.supportsJsonMode !== null) patch.supportsJsonMode = values.supportsJsonMode;
        if (values.contextWindow !== null) patch.contextWindow = values.contextWindow;
        if (values.maxOutputTokens !== null) patch.maxOutputTokens = values.maxOutputTokens;
        if (values.defaultReasoningEffort !== null) patch.defaultReasoningEffort = values.defaultReasoningEffort;
        if (values.supportsReasoning === false) {
          patch.supportsReasoningEffort = false;
          patch.defaultReasoningEffort = undefined;
        }
        next.set(row.providerId, patch);
      });
      return next;
    });
    toast('已应用批量设置，请点击保存确认', 'info');
  }, [directSources]);

  const handleSourceChange = useCallback((providerId: string, patch: ModelPatch) => {
    setPendingEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(providerId) ?? {};
      const merged = { ...existing, ...patch };
      if (patch.supportsReasoning === false) {
        merged.supportsReasoningEffort = false;
        merged.defaultReasoningEffort = undefined;
      }
      next.set(providerId, merged);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setPendingEdits(new Map());
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      for (const [pid, patch] of pendingEdits) {
        const provider = providers.find(p => p.id === pid);
        if (!provider) continue;
        const updatedModels = provider.models.map(m => {
          if (m.name !== decodedName && m.alias !== decodedName) return m;
          const merged: Model = { ...m };
          if (patch.alias !== undefined) merged.alias = patch.alias;
          if (patch.supportsVision !== undefined) merged.supportsVision = patch.supportsVision;
          if (patch.supportsReasoning !== undefined) merged.supportsReasoning = patch.supportsReasoning;
          if (patch.supportsReasoningEffort !== undefined) merged.supportsReasoningEffort = patch.supportsReasoningEffort;
          if (patch.supportsToolCalls !== undefined) merged.supportsToolCalls = patch.supportsToolCalls;
          if (patch.supportsJsonMode !== undefined) merged.supportsJsonMode = patch.supportsJsonMode;
          if (patch.contextWindow !== undefined) merged.contextWindow = patch.contextWindow;
          if (patch.maxOutputTokens !== undefined) merged.maxOutputTokens = patch.maxOutputTokens;
          if (patch.defaultReasoningEffort !== undefined) merged.defaultReasoningEffort = patch.defaultReasoningEffort;
          if (merged.supportsReasoning === false) {
            merged.supportsReasoningEffort = false;
            merged.defaultReasoningEffort = undefined;
          }
          return merged;
        });
        await updateProvider(pid, { models: updatedModels });
      }
      setPendingEdits(new Map());
      toast('模型参数已更新', 'success');
    } catch (e) {
      toast(`保存失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [pendingEdits, providers, decodedName, updateProvider]);

  const handleRemoveModel = useCallback(async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;
    const updatedModels = provider.models.filter(m => m.name !== decodedName && m.alias !== decodedName);
    await updateProvider(providerId, { models: updatedModels });
    setPendingEdits(prev => { const n = new Map(prev); n.delete(providerId); return n; });
    toast('已从该供应商移除模型', 'success');
  }, [providers, decodedName, updateProvider]);

  useEffect(() => {
    setPendingEdits(new Map());
  }, [decodedName]);

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

      {directSources.length > 0 && (
        <>
          <div style={{ marginBottom: 'var(--spacer-16)' }}>
            <ModelBulkEditPanel
              initialValues={bulkInitialValues}
              onApply={handleBulkApply}
            />
          </div>

          <AnimatedContent delay={90}>
            <div style={{ marginBottom: 'var(--spacer-24)' }}>
              <ModelSourcesTable
                rows={allRows}
                pendingEdits={pendingEdits}
                onChange={handleSourceChange}
                onReset={handleReset}
                onSave={handleSave}
                onRemoveModel={handleRemoveModel}
                saving={saving}
                hasEdits={pendingEdits.size > 0}
              />
            </div>
          </AnimatedContent>
        </>
      )}

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
            来源映射详情
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-12)' }}>
            {sources.map((source, idx) => {
              if (source.kind === 'aggregation') {
                return <AggregationDetailRow key={`agg-${idx}`} source={source} />;
              }
              return <DirectDetailRow key={`dir-${idx}`} source={source} pendingPatch={pendingEdits.get(source.providerId)} />;
            })}
          </div>
        </Card>
      </AnimatedContent>
    </div>
  );
};

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
      padding: 'var(--spacer-16) var(--spacer-24)',
      borderRadius: 'var(--radius-10)',
      background: enabled ? 'var(--brand-50)' : 'var(--bg-overlay-l1)',
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

const DirectDetailRow: React.FC<{ source: DirectMapping; pendingPatch?: ModelPatch }> = ({ source, pendingPatch }) => {
  const effectiveModel = pendingPatch ? { ...source.model, ...pendingPatch } : source.model;
  const tags: string[] = [];
  if (effectiveModel.supportsVision) tags.push('视觉');
  if (effectiveModel.supportsReasoning) tags.push('思考');
  if (effectiveModel.supportsReasoningEffort) tags.push('强度');
  if (effectiveModel.supportsToolCalls) tags.push('工具');
  if (effectiveModel.supportsJsonMode) tags.push('JSON');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacer-10)',
        padding: 'var(--spacer-16)',
        borderRadius: 'var(--radius-10)',
        border: '1px solid var(--border-neutral-l1)',
        background: pendingPatch ? 'rgba(245,158,11,0.06)' : 'var(--bg-base-default)',
      }}
    >
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
        {pendingPatch && (
          <span style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--bg-brand)', marginLeft: 4 }} />
        )}
      </div>

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
          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{effectiveModel.alias}</span>
          <ArrowRight size={12} />
          <span style={{ fontFamily: 'var(--font-family-mono)' }}>{source.modelName}</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--spacer-8)',
          paddingLeft: 36,
        }}
      >
        {effectiveModel.contextWindow ? (
          <Spec label="上下文窗口" value={effectiveModel.contextWindow.toLocaleString()} />
        ) : null}
        {effectiveModel.maxOutputTokens ? (
          <Spec label="最大输出" value={effectiveModel.maxOutputTokens.toLocaleString()} />
        ) : null}
        {effectiveModel.defaultReasoningEffort && (
          <Spec label="默认思考强度" value={effectiveModel.defaultReasoningEffort} />
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--spacer-8)', alignItems: 'center', flexWrap: 'wrap' }}>
            {tags.map(t => (
              <span
                key={t}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 28,
                  padding: '0 var(--spacer-16)',
                  borderRadius: 'var(--radius-6)',
                  background: 'var(--bg-overlay-l2)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--body-xs-font-size)',
                  fontWeight: 'var(--font-weight-medium)',
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
