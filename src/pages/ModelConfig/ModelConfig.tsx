import { useEffect } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { AnimatedContent } from '../../components/ui';
import { AggregationTable } from './AggregationTable';
import { QuickAddPanel } from './QuickAddPanel';
import { ModelInventory } from './ModelInventory';

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
          管理模型聚合规则与路由策略
        </p>
      </div>

      {/* Exposed Models Overview */}
      <AnimatedContent delay={80}>
        <ModelInventory />
      </AnimatedContent>

      {/* Aggregation Table */}
      <AnimatedContent delay={160}>
        <AggregationTable />
      </AnimatedContent>

      {/* Quick Add */}
      <AnimatedContent delay={220}>
        <QuickAddPanel />
      </AnimatedContent>
    </div>
  );
};