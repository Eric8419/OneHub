import React from 'react';
import { useStatsStore } from '../../store/statsStore';
import type { TimeRange } from '../../types/stats';

const rangeOptions: { key: TimeRange; label: string }[] = [
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
];

export const TimeRangeTabs: React.FC = () => {
  const activeRange = useStatsStore(s => s.timeRange);
  const setTimeRange = useStatsStore(s => s.setTimeRange);
  const fetchStats = useStatsStore(s => s.fetchStats);

  return (
    <div
      className="ds-tabs"
      style={{
        display: 'flex',
        gap: 'var(--spacer-8)',
        marginBottom: 'var(--spacer-24)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        paddingBottom: 0,
      }}
    >
      {rangeOptions.map(opt => {
        const isActive = opt.key === activeRange;
        return (
          <button
            key={opt.key}
            className={`ds-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              setTimeRange(opt.key);
              void fetchStats();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 'var(--spacer-10) var(--spacer-20)',
              borderRadius: 'var(--radius-8) var(--radius-8) 0 0',
              border: 'none',
              borderBottom: isActive
                ? '2px solid var(--bg-brand)'
                : '2px solid transparent',
              textDecoration: 'none',
              color: isActive ? 'var(--bg-brand)' : 'var(--text-secondary)',
              fontSize: 'var(--body-base-font-size)',
              fontWeight: isActive
                ? 'var(--font-weight-strong)'
                : 'var(--body-base-font-weight)',
              lineHeight: 'var(--body-base-line-height)',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'inherit',
              transition:
                'color 0.18s cubic-bezier(0.22,1,0.36,1), border-color 0.18s cubic-bezier(0.22,1,0.36,1)',
              marginBottom: '-1px',
            }}
            onMouseEnter={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-default)';
            }}
            onMouseLeave={e => {
              if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
