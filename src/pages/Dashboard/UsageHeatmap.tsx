import React from 'react';
import { useStatsStore } from '../../store/statsStore';

const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const monthLabels = ['7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月', '4月', '5月', '6月'];
const monthWidths = [60, 60, 72, 60, 60, 72, 60, 72, 60, 72, 60, 60];
const HEAT_COLORS = ['var(--bg-base-tertiary)', 'var(--brand-100)', 'var(--brand-200)', 'var(--brand-300)', 'var(--brand-500)', 'var(--bg-brand)'];

export const UsageHeatmap: React.FC = () => {
  const heatmapData = useStatsStore(s => s.heatmapData);

  return (
    <div
      className="ds-card"
      style={{
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)',
        padding: 'var(--spacer-20)',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacer-12)',
        }}
      >
        <div
          style={{
            fontSize: 'var(--heading-xs-font-size)',
            fontWeight: 'var(--heading-xs-font-weight)',
            color: 'var(--text-default)',
            lineHeight: 'var(--heading-xs-line-height)',
          }}
        >
          调用热力图 — 近一年
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>少</span>
          {[0, 1, 2, 3, 4, 5].map(level => (
            <span
              key={level}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: HEAT_COLORS[level],
                display: 'inline-block',
              }}
            />
          ))}
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>多</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--spacer-8)', alignItems: 'flex-start', overflowX: 'auto' }}>
        {/* Day labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 20, flexShrink: 0, width: 24 }}>
          {dayLabels.map((label, i) => (
            <div
              key={i}
              style={{
                height: 10,
                lineHeight: '10px',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                textAlign: 'right',
                visibility: label ? 'visible' : 'hidden',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Month labels */}
          <div style={{ display: 'flex', marginBottom: 2, height: 16 }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ width: monthWidths[i], fontSize: 9, color: 'var(--text-tertiary)', lineHeight: '16px' }}>
                {label}
              </div>
            ))}
          </div>

          {/* 7 rows of data */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {heatmapData.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'flex', gap: 2 }}>
                {row.map((val, colIdx) => (
                  <span
                    key={colIdx}
                    title={`${val}`}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: HEAT_COLORS[val] || HEAT_COLORS[0],
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
