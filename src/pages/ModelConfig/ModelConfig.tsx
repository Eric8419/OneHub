import { useEffect } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { AnimatedContent } from '../../components/ui';
import { ModelInventory } from './ModelInventory';
// 聚合规则 UI 暂时隐藏，待功能完善后再启用
// import { AggregationTable } from './AggregationTable';
// import { QuickAddPanel } from './QuickAddPanel';

export const ModelConfig: React.FC = () => {
  const loadProviders = useProviderStore(s => s.loadProviders);
  const loadedProviders = useProviderStore(s => s.loaded);
  const loadAggregations = useAggregationStore(s => s.loadAggregations);
  const loadedAggregations = useAggregationStore(s => s.loaded);

  // Load persisted data on mount
  useEffect(() => {
    if (!loadedProviders) loadProviders();
    if (!loadedAggregations) loadAggregations();
  }, [loadedProviders, loadedAggregations, loadProviders, loadAggregations]);

  return (
    <div>
      {/* Action Bar */}
      <div
        className="mc-action-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        <p
          className="mc-action-bar__subtitle"
          style={{
            fontSize: 'var(--body-base-font-size)',
            lineHeight: 'var(--body-base-line-height)',
            color: 'var(--text-tertiary)',
            margin: 0,
          }}
        >
          管理对外暴露的模型映射
        </p>
      </div>

      {/* Exposed Models Overview */}
      <AnimatedContent delay={80}>
        <ModelInventory />
      </AnimatedContent>

      {/* 聚合规则 UI 暂时隐藏，待功能完善后再启用
      <AnimatedContent delay={160}>
        <AggregationTable />
      </AnimatedContent>

      <AnimatedContent delay={220}>
        <QuickAddPanel />
      </AnimatedContent>
      */}
    </div>
  );
};