import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { buildLegacyAggregationTargets, normalizeStrategyKey } from '../../types/aggregation';
import type { RouteTarget, RoutingStrategy } from '../../types/aggregation';
import type { Model } from '../../types/provider';
import { Card, AnimatedContent, Button } from '../../components/ui';
import { toast } from '../../components/ui/Toast';
import { ModelBulkEditPanel, type BulkEditValues } from './ModelBulkEditPanel';
import { ModelSourcesTable, type SourceRow, type PendingEdits, type ModelPatch } from './ModelSourcesTable';
import { RoutingStrategySelect } from './RoutingStrategySelect';
import { useT } from '../../i18n';
import {
  ArrowLeft,
  Bot,
  Eye,
  Brain,
  SlidersHorizontal,
  ArrowRight,
  Server,
  Cpu,
  FileText,
  Wrench,
  Braces,
  Route,
  Save,
} from 'lucide-react';

interface DirectMapping {
  kind: 'direct' | 'alias';
  providerName: string;
  providerId: string;
  modelName: string;
  model: Model;
  matchedBy: 'name' | 'alias';
}

const protocolForFlavor = (flavor?: string): NonNullable<RouteTarget['protocol']> => {
  if (flavor === 'anthropic' || flavor === 'anthropic-messages') return 'anthropic-messages';
  if (flavor === 'responses' || flavor === 'openai-responses') return 'openai-responses';
  return 'openai-chat';
};

const createId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;

const toDateTimeLocal = (timestamp?: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
};

const fromDateTimeLocal = (value: string): number | undefined => {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

export const ModelDetailPage: React.FC = () => {
  const t = useT();
  const { modelName } = useParams<{ modelName: string }>();
  const navigate = useNavigate();
  const { providers, updateProvider } = useProviderStore();
  const { aggregations, addAggregation, updateAggregation } = useAggregationStore();

  const decodedName = decodeURIComponent(modelName || '');

  const [pendingEdits, setPendingEdits] = useState<PendingEdits>(new Map());
  const [saving, setSaving] = useState(false);
  const currentRouting = useMemo(
    () => aggregations.find((aggregation) => aggregation.name === decodedName),
    [aggregations, decodedName],
  );
  const legacyAggregationTargets = useMemo(
    () => buildLegacyAggregationTargets(currentRouting, providers),
    [currentRouting, providers],
  );
  const [routingStrategy, setRoutingStrategy] = useState<RoutingStrategy>(
    normalizeStrategyKey(currentRouting?.strategy ?? 'round-robin') as RoutingStrategy,
  );
  const [routingSaving, setRoutingSaving] = useState(false);
  const routingSourceKeyRef = useRef<string | undefined>(undefined);

  // 可编辑的上游目标列表。优先使用已持久化的 targets；否则按当前直接来源生成。
  // priority/weight 等字段会随用户在 UI 上的编辑实时更新，保存时一并提交。
  const [routingTargets, setRoutingTargets] = useState<RouteTarget[]>(() => {
    if (currentRouting?.targets && currentRouting.targets.length > 0) {
      return currentRouting.targets.map((target) => ({ ...target }));
    }
    return [];
  });

  // 当 currentRouting 变化（如首次加载、外部更新）时，同步 routingTargets。
  // Legacy aggregation 会在这里展开成 concrete targets，让所有策略的
  // 元数据都能在同一个编辑器中配置。
  useEffect(() => {
    const targetSignature = currentRouting?.targets?.length
      ? currentRouting.targets.map((target) => target.id).join(',')
      : legacyAggregationTargets.map((target) => target.id).join(',');
    const sourceKey = currentRouting
      ? `aggregation:${currentRouting.id}:${targetSignature}`
      : `direct:${decodedName}`;
    if (currentRouting?.targets && currentRouting.targets.length > 0) {
      setRoutingTargets(currentRouting.targets.map((target) => ({ ...target })));
      routingSourceKeyRef.current = sourceKey;
    } else if (routingSourceKeyRef.current !== sourceKey) {
      setRoutingTargets(legacyAggregationTargets.map((target) => ({ ...target })));
      routingSourceKeyRef.current = sourceKey;
    }
  }, [currentRouting, decodedName, legacyAggregationTargets]);

  const patchRoutingTarget = useCallback((id: string, patch: Partial<RouteTarget>) => {
    setRoutingTargets((targets) => targets.map((target) => (target.id === id ? { ...target, ...patch } : target)));
  }, []);

  const sourceMappings = useMemo<DirectMapping[]>(() => {
    const result: DirectMapping[] = [];

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

    return result;
  }, [decodedName, providers]);

  const paramSources = sourceMappings;

  const getEffectiveModel = useCallback(
    (source: DirectMapping): Model => {
      const patch = pendingEdits.get(source.providerId);
      return patch ? { ...source.model, ...patch } : source.model;
    },
    [pendingEdits],
  );

  const allVision = paramSources.length > 0 && paramSources.every((s) => getEffectiveModel(s).supportsVision);
  const allReasoning = paramSources.length > 0 && paramSources.every((s) => getEffectiveModel(s).supportsReasoning);
  const anyEffort = paramSources.some((s) => getEffectiveModel(s).supportsReasoningEffort);
  const allToolCalls = paramSources.length > 0 && paramSources.every((s) => getEffectiveModel(s).supportsToolCalls);
  const allJsonMode = paramSources.length > 0 && paramSources.every((s) => getEffectiveModel(s).supportsJsonMode);
  const maxCtx = Math.max(0, ...paramSources.map((s) => getEffectiveModel(s).contextWindow || 0));
  const maxOutput = Math.max(0, ...paramSources.map((s) => getEffectiveModel(s).maxOutputTokens || 0));
  const hasDirect = sourceMappings.some((s) => s.kind === 'direct');
  const hasAlias = sourceMappings.some((s) => s.kind === 'alias');

  const directSources: SourceRow[] = useMemo(() => {
    const rows: SourceRow[] = [];
    const seenProviderIds = new Set<string>();
    for (const p of providers) {
      for (const m of p.models) {
        if (m.name === decodedName || m.alias === decodedName) {
          if (!seenProviderIds.has(p.id)) {
            rows.push({ providerId: p.id, provider: p, model: m });
            seenProviderIds.add(p.id);
          }
          break;
        }
      }
    }
    return rows;
  }, [providers, decodedName]);

  const routingTargetCount =
    routingTargets.filter((target) => target.enabled).length ||
    currentRouting?.models
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean).length ||
    directSources.length;

  // 为 target 编辑器准备展示信息：按 providerId 查找提供商名称，便于用户识别每个上游。
  const targetDisplayMap = useMemo(() => {
    const map = new Map<string, { providerName: string; providerId: string }>();
    for (const provider of providers) {
      map.set(provider.id, { providerName: provider.name, providerId: provider.id });
    }
    return map;
  }, [providers]);

  // 当直接来源变化（如新增/删除 provider 中的同名模型）时，补齐缺失的 target，
  // 已存在的 target 保留用户编辑过的字段。
  useEffect(() => {
    // Existing aggregations are initialized by the legacy/explicit target
    // effect above; only direct models need automatic source discovery here.
    if (currentRouting || directSources.length === 0) return;
    setRoutingTargets((prev) => {
      const existing = new Map(prev.map((t) => [t.providerId, t]));
      const next: RouteTarget[] = directSources.map((row, index) => {
        const old = existing.get(row.providerId);
        if (old) {
          return {
            ...old,
            model: row.model.name,
            protocol: old.protocol ?? protocolForFlavor(row.provider.apiFlavor),
          };
        }
        return {
          id: createId(`model-route-target-${index}`),
          providerId: row.providerId,
          model: row.model.name,
          protocol: protocolForFlavor(row.provider.apiFlavor),
          priority: 0,
          weight: 1,
          enabled: true,
        };
      });
      // 仅在集合变化时返回新数组，避免无限渲染
      if (next.length !== prev.length) return next;
      const sameIds = next.every((t, i) => t.id === prev[i]?.id && t.providerId === prev[i]?.providerId);
      return sameIds ? prev : next;
    });
  }, [currentRouting, directSources]);

  const bulkInitialValues: BulkEditValues = useMemo(() => {
    const ms = directSources.map((r) => r.model);
    const allSame = <K extends keyof Model>(key: K): boolean => ms.length > 0 && ms.every((m) => m[key] === ms[0][key]);
    const allSameBool = (
      key:
        'supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode',
    ): boolean | null => {
      if (ms.length === 0) return null;
      if (allSame(key)) return (ms[0][key] as boolean | null) ?? null;
      return null;
    };
    const allSameNum = (key: 'contextWindow' | 'maxOutputTokens'): number | null => {
      if (ms.length === 0) return null;
      if (allSame(key)) return (ms[0][key] as number | null) ?? null;
      return null;
    };
    const allSameEffort = (): 'low' | 'medium' | 'high' | null => {
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

  const handleBulkApply = useCallback(
    (values: BulkEditValues) => {
      setPendingEdits((prev) => {
        const next = new Map(prev);
        directSources.forEach((row) => {
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
    },
    [directSources],
  );

  const handleSourceChange = useCallback((providerId: string, patch: ModelPatch) => {
    setPendingEdits((prev) => {
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
        const provider = providers.find((p) => p.id === pid);
        if (!provider) continue;
        const updatedModels = provider.models.map((m) => {
          if (m.name !== decodedName && m.alias !== decodedName) return m;
          const merged: Model = { ...m };
          if (patch.alias !== undefined) merged.alias = patch.alias;
          if (patch.supportsVision !== undefined) merged.supportsVision = patch.supportsVision;
          if (patch.supportsReasoning !== undefined) merged.supportsReasoning = patch.supportsReasoning;
          if (patch.supportsReasoningEffort !== undefined)
            merged.supportsReasoningEffort = patch.supportsReasoningEffort;
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

  const handleSaveRouting = useCallback(async () => {
    if (!currentRouting && routingTargets.length === 0) {
      toast(t('models.routing.noSources'), 'error');
      return;
    }

    setRoutingSaving(true);
    try {
      if (currentRouting) {
        await updateAggregation(currentRouting.id, {
          strategy: routingStrategy,
          targets: routingTargets,
          enabled: true,
        });
      } else {
        await addAggregation({
          id: createId('model-route'),
          name: decodedName,
          models: routingTargets.map((target) => target.model).join(', '),
          targets: routingTargets,
          strategy: routingStrategy,
          priority: 'P0',
          enabled: true,
        });
      }
      toast(t('models.routing.saved'), 'success');
    } catch (error) {
      toast(
        `${t('models.routing.saveFailed')}: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setRoutingSaving(false);
    }
  }, [
    addAggregation,
    currentRouting,
    decodedName,
    routingTargets,
    routingStrategy,
    t,
    updateAggregation,
  ]);

  const handleRemoveModel = useCallback(
    async (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      const updatedModels = provider.models.filter((m) => m.name !== decodedName && m.alias !== decodedName);
      await updateProvider(providerId, { models: updatedModels });
      setPendingEdits((prev) => {
        const n = new Map(prev);
        n.delete(providerId);
        return n;
      });
      toast('已从该供应商移除模型', 'success');
    },
    [providers, decodedName, updateProvider],
  );

  useEffect(() => {
    setPendingEdits(new Map());
  }, [decodedName]);

  useEffect(() => {
    setRoutingStrategy(
      normalizeStrategyKey(currentRouting?.strategy ?? 'round-robin') as RoutingStrategy,
    );
  }, [currentRouting?.id, currentRouting?.strategy, decodedName]);

  if (sourceMappings.length === 0 && !currentRouting) {
    return (
      <div style={{ padding: 'var(--spacer-48)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-16)' }}>未找到模型「{decodedName}」</p>
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
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-default)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        <ArrowLeft size={16} /> 模型配置
      </button>

      <AnimatedContent>
        <div style={{ marginBottom: 'var(--spacer-32)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)', marginBottom: 'var(--spacer-8)' }}
          >
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
            {sourceMappings.length} 个供应商来源映射
            {hasDirect && ' · 直接'}
            {hasAlias && ' · 别名'}
          </p>
        </div>
      </AnimatedContent>

      <AnimatedContent delay={60}>
        <Card style={{ marginBottom: 'var(--spacer-24)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--spacer-24)',
              paddingBottom: 'var(--spacer-16)',
              marginBottom: 'var(--spacer-16)',
              borderBottom: '1px solid var(--border-neutral-l1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacer-10)' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--brand-100)',
                  color: 'var(--icon-brand)',
                }}
              >
                <Route size={17} />
              </span>
              <div>
                <h2
                  style={{
                    fontSize: 'var(--heading-xs-font-size)',
                    fontWeight: 'var(--heading-xs-font-weight)',
                    color: 'var(--text-default)',
                    margin: 0,
                  }}
                >
                  {t('models.routing.title')}
                </h2>
                <p
                  style={{
                    fontSize: 'var(--body-sm-font-size)',
                    lineHeight: 1.5,
                    color: 'var(--text-tertiary)',
                    margin: 'var(--spacer-4) 0 0',
                  }}
                >
                  {t('models.routing.desc').replace('{model}', decodedName)}
                </p>
              </div>
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
                minHeight: 24,
                padding: '0 var(--spacer-8)',
                borderRadius: 'var(--radius-6)',
                background: 'var(--bg-overlay-l1)',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--body-xs-font-size)',
              }}
            >
              {t('models.routing.upstreams').replace('{n}', String(routingTargetCount))}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 420px) minmax(0, 1fr)',
              gap: 'var(--spacer-24)',
              alignItems: 'end',
            }}
          >
            <div>
              <div
                style={{
                  marginBottom: 'var(--spacer-8)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--body-sm-font-size)',
                  fontWeight: 'var(--font-weight-medium)',
                }}
              >
                {t('routing.strategy.label')}
              </div>
              <RoutingStrategySelect value={routingStrategy} onChange={setRoutingStrategy} />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 'var(--spacer-12)',
                minWidth: 0,
              }}
            >
              {routingTargetCount < 2 && (
                <span
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--body-xs-font-size)',
                    lineHeight: 1.45,
                    textAlign: 'right',
                  }}
                >
                  {t('models.routing.singleSourceHint')}
                </span>
              )}
              <Button
                variant="brand"
                size="lg"
                icon={Save}
                loading={routingSaving}
                disabled={!currentRouting && routingTargets.length === 0}
                onClick={handleSaveRouting}
              >
                {t('models.routing.save')}
              </Button>
            </div>
          </div>

          {/* Target metadata is edited here so every strategy has a real,
              persistent input instead of a label-only implementation. */}
          {(() => {
            const isPriorityField = [
              'priority',
              'fill-first',
              'cost-optimized',
              'reset-aware',
              'reset-window',
              'headroom',
              'lkgp',
              'fusion',
              'pipeline',
            ].includes(routingStrategy);
            const isWeightField = routingStrategy === 'weighted';
            const isCostField = routingStrategy === 'cost-optimized' || routingStrategy === 'auto';
            const isQuotaField = ['fill-first', 'reset-aware', 'headroom', 'auto'].includes(routingStrategy);
            const isResetField = ['reset-aware', 'reset-window', 'auto'].includes(routingStrategy);
            const showPanel =
              isPriorityField || isWeightField || isCostField || isQuotaField || isResetField;
            if (!showPanel || routingTargets.length === 0) return null;

            const hintKeys = [
              isPriorityField && 'models.routing.priorityHint',
              isWeightField && 'models.routing.weightedHint',
              isCostField && 'models.routing.costHint',
              isQuotaField && 'models.routing.quotaHint',
              isResetField && 'models.routing.resetHint',
            ].filter(Boolean) as string[];
            const columns = [
              isPriorityField || isWeightField ? (isWeightField ? 'weight' : 'priority') : null,
              isCostField ? 'cost' : null,
              isQuotaField ? 'quota' : null,
              isResetField ? 'reset' : null,
            ].filter(Boolean) as string[];
            const columnWidth: Record<string, string> = {
              priority: '96px',
              weight: '96px',
              cost: '132px',
              quota: '112px',
              reset: '188px',
            };
            const gridTemplateColumns = `minmax(190px, 1fr) ${columns
              .map((column) => columnWidth[column])
              .join(' ')} 82px`;
            const inputStyle = {
              height: 28,
              padding: '0 var(--spacer-8)',
              borderRadius: 'var(--radius-6)',
              border: '1px solid var(--border-neutral-l1)',
              background: 'var(--bg-white)',
              color: 'var(--text-default)',
              fontSize: 'var(--body-sm-font-size)',
              outline: 'none',
              width: '100%',
            } as const;

            return (
              <div style={{ marginTop: 'var(--spacer-16)' }}>
                <div
                  style={{
                    marginBottom: 'var(--spacer-8)',
                    padding: 'var(--spacer-10) var(--spacer-12)',
                    borderRadius: 'var(--radius-8)',
                    background: 'var(--bg-overlay-l1)',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--body-sm-font-size)',
                    lineHeight: 1.5,
                  }}
                >
                  {hintKeys.map((key) => t(key)).join(' ')}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 'var(--spacer-8)',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--body-sm-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                    }}
                  >
                    {t('models.routing.targetList')}
                  </span>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-xs-font-size)' }}>
                    {columns.map((column) => t(`models.routing.col${column[0].toUpperCase()}${column.slice(1)}`)).join(' · ')}
                  </span>
                </div>
                <div
                  style={{
                    border: '1px solid var(--border-neutral-l1)',
                    borderRadius: 'var(--radius-8)',
                    overflowX: 'auto',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns,
                      gap: 'var(--spacer-12)',
                      minWidth: 620,
                      padding: 'var(--spacer-8) var(--spacer-12)',
                      background: 'var(--bg-overlay-l1)',
                      fontSize: 'var(--body-xs-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                    }}
                  >
                    <span>{t('models.routing.colUpstream')}</span>
                    {columns.map((column) => (
                      <span key={column}>{t(`models.routing.col${column[0].toUpperCase()}${column.slice(1)}`)}</span>
                    ))}
                    <span>{t('models.routing.colEnabled')}</span>
                  </div>
                  {routingTargets.map((target) => {
                    const display = targetDisplayMap.get(target.providerId);
                    return (
                      <div
                        key={target.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns,
                          gap: 'var(--spacer-12)',
                          minWidth: 620,
                          padding: 'var(--spacer-8) var(--spacer-12)',
                          borderTop: '1px solid var(--border-neutral-l1)',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-default)',
                              fontFamily: 'var(--font-family-mono)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {target.model}
                          </div>
                          <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                            {display?.providerName ?? target.providerId}
                          </div>
                        </div>
                        {isPriorityField && (
                          <input
                            className="mc-input"
                            type="number"
                            value={target.priority}
                            onChange={(event) =>
                              patchRoutingTarget(target.id, { priority: Number(event.target.value) || 0 })
                            }
                            style={inputStyle}
                          />
                        )}
                        {isWeightField && (
                          <input
                            className="mc-input"
                            type="number"
                            min={1}
                            value={target.weight}
                            onChange={(event) =>
                              patchRoutingTarget(target.id, { weight: Math.max(1, Number(event.target.value) || 1) })
                            }
                            style={inputStyle}
                          />
                        )}
                        {isCostField && (
                          <input
                            className="mc-input"
                            type="number"
                            min={0}
                            step="0.0001"
                            placeholder={t('models.routing.costPlaceholder')}
                            value={target.costPerMillionTokens ?? ''}
                            onChange={(event) =>
                              (() => {
                                const value = Number(event.target.value);
                                patchRoutingTarget(target.id, {
                                  costPerMillionTokens:
                                    event.target.value === '' || !Number.isFinite(value)
                                      ? undefined
                                      : Math.max(0, value),
                                });
                              })()
                            }
                            style={inputStyle}
                          />
                        )}
                        {isQuotaField && (
                          <input
                            className="mc-input"
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            placeholder={t('models.routing.quotaPlaceholder')}
                            value={target.quotaRemaining === undefined ? '' : target.quotaRemaining * 100}
                            onChange={(event) =>
                              (() => {
                                const value = Number(event.target.value);
                                patchRoutingTarget(target.id, {
                                  quotaRemaining:
                                    event.target.value === '' || !Number.isFinite(value)
                                      ? undefined
                                      : Math.min(100, Math.max(0, value)) / 100,
                                });
                              })()
                            }
                            style={inputStyle}
                          />
                        )}
                        {isResetField && (
                          <input
                            className="mc-input"
                            type="datetime-local"
                            title={t('models.routing.colReset')}
                            value={toDateTimeLocal(target.quotaResetAt)}
                            onChange={(event) =>
                              patchRoutingTarget(target.id, { quotaResetAt: fromDateTimeLocal(event.target.value) })
                            }
                            style={inputStyle}
                          />
                        )}
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--spacer-6)',
                            fontSize: 'var(--body-xs-font-size)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={target.enabled}
                            onChange={(event) => patchRoutingTarget(target.id, { enabled: event.target.checked })}
                            style={{ cursor: 'pointer' }}
                          />
                          {target.enabled ? t('models.routing.enabledOn') : t('models.routing.enabledOff')}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </Card>
      </AnimatedContent>

      <AnimatedContent delay={90}>
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
            <CapabilityItem icon={<Eye size={18} />} label="视觉理解" enabled={allVision} />
            <CapabilityItem icon={<Brain size={18} />} label="深度思考" enabled={allReasoning} />
            <CapabilityItem icon={<SlidersHorizontal size={18} />} label="思考强度" enabled={anyEffort} />
            <CapabilityItem icon={<Wrench size={18} />} label="工具调用" enabled={allToolCalls} />
            <CapabilityItem icon={<Braces size={18} />} label="JSON 模式" enabled={allJsonMode} />
            {maxCtx > 0 && (
              <SpecItem icon={<FileText size={18} />} label="上下文窗口" value={maxCtx.toLocaleString()} />
            )}
            {maxOutput > 0 && <SpecItem icon={<Cpu size={18} />} label="最大输出" value={maxOutput.toLocaleString()} />}
          </div>
        </Card>
      </AnimatedContent>

      {directSources.length > 0 && (
        <>
          <div style={{ marginBottom: 'var(--spacer-16)' }}>
            <ModelBulkEditPanel initialValues={bulkInitialValues} onApply={handleBulkApply} />
          </div>

          <AnimatedContent delay={120}>
            <div style={{ marginBottom: 'var(--spacer-24)' }}>
              <ModelSourcesTable
                rows={directSources}
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

      {sourceMappings.length > 0 && (
        <AnimatedContent delay={150}>
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
              {sourceMappings.map((source, idx) => (
                <DirectDetailRow
                  key={`dir-${idx}`}
                  source={source}
                  pendingPatch={pendingEdits.get(source.providerId)}
                />
              ))}
            </div>
          </Card>
        </AnimatedContent>
      )}
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
    <span style={{ color: enabled ? 'var(--icon-brand)' : 'var(--icon-tertiary)', display: 'flex' }}>{icon}</span>
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

const SpecItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
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
  const t = useT();
  const effectiveModel = pendingPatch ? { ...source.model, ...pendingPatch } : source.model;
  const tags: string[] = [];
  if (effectiveModel.supportsVision) tags.push(t('capability.vision'));
  if (effectiveModel.supportsReasoning) tags.push(t('capability.reasoning'));
  if (effectiveModel.supportsReasoningEffort) tags.push(t('capability.effort'));
  if (effectiveModel.supportsToolCalls) tags.push(t('capability.tools'));
  if (effectiveModel.supportsJsonMode) tags.push(t('capability.json'));

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
            {tags.map((t) => (
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

const Spec: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginBottom: 2 }}>{label}</div>
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
