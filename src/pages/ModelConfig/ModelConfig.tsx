import { useState, useEffect } from 'react';
import { useProviderStore } from '../../store/providerStore';
import { useAggregationStore } from '../../store/aggregationStore';
import { ProviderCard } from './ProviderCard';
import { AggregationTable } from './AggregationTable';
import { QuickAddPanel } from './QuickAddPanel';
import { AddProviderDialog } from './AddProviderDialog';
import { Plus, Cpu } from 'lucide-react';

export const ModelConfig: React.FC = () => {
  const providers = useProviderStore(s => s.providers);
  const loadProviders = useProviderStore(s => s.loadProviders);
  const loadedProviders = useProviderStore(s => s.loaded);
  const loadAggregations = useAggregationStore(s => s.loadAggregations);
  const loadedAggregations = useAggregationStore(s => s.loaded);
  const [dialogOpen, setDialogOpen] = useState(false);

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
        <div>
          <h2
            className="mc-action-bar__title"
            style={{
              fontFamily: 'var(--heading-lg-font-family)',
              fontSize: 'var(--heading-lg-font-size)',
              fontWeight: 'var(--heading-lg-font-weight)',
              lineHeight: 'var(--heading-lg-line-height)',
              color: 'var(--text-default)',
              margin: '0 0 var(--spacer-4) 0',
            }}
          >
            模型配置
          </h2>
          <p
            className="mc-action-bar__subtitle"
            style={{
              fontSize: 'var(--body-base-font-size)',
              lineHeight: 'var(--body-base-line-height)',
              color: 'var(--text-tertiary)',
              margin: 0,
            }}
          >
            管理 API 提供商和模型聚合配置
          </p>
        </div>
        <button
          className="mc-btn mc-btn--primary"
          onClick={() => setDialogOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacer-6)',
            height: 36,
            padding: '0 var(--spacer-16)',
            borderRadius: 'var(--radius-8)',
            fontSize: 'var(--body-base-font-size)',
            fontWeight: 'var(--body-base-strong-font-weight)',
            lineHeight: 'var(--body-base-line-height)',
            cursor: 'pointer',
            border: 'none',
            background: 'var(--bg-brand)',
            color: 'var(--text-onbrand)',
          }}
        >
          <Plus size={16} />
          添加提供商
        </button>
      </div>

      {/* Provider Cards */}
      {providers.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 'var(--spacer-48) var(--spacer-24)', color: 'var(--text-tertiary)', gap: 'var(--spacer-12)',
          background: 'var(--bg-base-secondary)', border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-12)', marginBottom: 'var(--spacer-32)',
        }}>
          <Cpu size={40} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-secondary)' }}>暂无 API 提供商</span>
          <span style={{ fontSize: 'var(--body-sm-font-size)' }}>点击右上角「添加提供商」开始配置</span>
        </div>
      ) : (
        <div
          className="mc-provider-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--spacer-16)',
            marginBottom: 'var(--spacer-32)',
          }}
        >
          {providers.map(p => (
            <ProviderCard key={p.id} providerId={p.id} />
          ))}
        </div>
      )}

      {/* Aggregation Table */}
      <AggregationTable />

      {/* Quick Add */}
      <QuickAddPanel />

      {/* Add Provider Dialog */}
      <AddProviderDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
};
