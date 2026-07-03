import React from 'react';
import { useStatsStore } from '../../store/statsStore';
import type { TimeRange } from '../../types/stats';

const rangeOptions: { key: TimeRange; label: string }[] = [
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
  { key: 'custom', label: '自定义' },
];

export const TimeRangeTabs: React.FC = () => {
  const activeRange = useStatsStore(s => s.timeRange);
  const setTimeRange = useStatsStore(s => s.setTimeRange);

  return (
    <div
      className="ds-tabs"
      style={{
        display: 'flex',
        gap: 'var(--spacer-8)',
        marginBottom: 'var(--spacer-24)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {rangeOptions.map(opt => {
        const isActive = opt.key === activeRange;
        return (
          <button
            key={opt.key}
            className={`ds-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => setTimeRange(opt.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 'var(--spacer-8) var(--spacer-16)',
              background: isActive ? 'var(--bg-brand)' : 'transparent',
              color: isActive ? 'var(--text-onbrand)' : 'var(--text-tertiary)',
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 'var(--body-base-font-size)',
              lineHeight: 'var(--body-base-line-height)',
              fontWeight: 'var(--font-weight-medium)',
              borderRadius: isActive ? 'var(--radius-8) var(--radius-8) 0 0' : 0,
              position: 'relative',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
