import { useEffect } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { AnimatedContent } from '../../components/ui';
import { ModelInventory } from './ModelInventory';
import { AggregationTable } from './AggregationTable';
import { QuickAddPanel } from './QuickAddPanel';
import { ProtocolMatrix } from './ProtocolMatrix';

export const ModelConfig: React.FC = () => {
  const loadProviders = useProviderStore((s) => s.loadProviders);
  const loadedProviders = useProviderStore((s) => s.loaded);
  const loadAggregations = useAggregationStore((s) => s.loadAggregations);
  const loadedAggregations = useAggregationStore((s) => s.loaded);

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

      <AnimatedContent delay={160}>
        <ProtocolMatrix />
      </AnimatedContent>

      <AnimatedContent delay={200}>
        <AggregationTable />
      </AnimatedContent>

      <AnimatedContent delay={240}>
        <QuickAddPanel />
      </AnimatedContent>
    </div>
  );
};
