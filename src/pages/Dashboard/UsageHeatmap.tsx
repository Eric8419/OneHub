import React, { useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { Card, FlexBetween } from '../../components/ui';

const HEAT_COLORS = ['var(--bg-base-tertiary)', 'var(--brand-100)', 'var(--brand-200)', 'var(--brand-300)', 'var(--brand-500)', 'var(--bg-brand)'];

/** Compute month labels and widths from heatmap data columns */
function computeMonths(colCount: number): { labels: string[]; widths: number[] } {
  if (colCount === 0) return { labels: [], widths: [] };
  const labels: string[] = [];
  const widths: number[] = [];
  const now = new Date();
  let lastMonth = -1;

  for (let i = 0; i < colCount; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - colCount + 1 + i);
    const month = d.getMonth();
    if (month !== lastMonth) {
      labels.push(`${month + 1}月`);
      widths.push(0);
      lastMonth = month;
    }
    widths[widths.length - 1] += 12;
  }

  return { labels, widths };
}

export const UsageHeatmap: React.FC = () => {
  const heatmapData = useStatsStore(s => s.heatmapData);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; val: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const colCount = heatmapData.length > 0 ? heatmapData[0].length : 0;
  const { labels: monthLabels, widths: monthWidths } = computeMonths(colCount);

  return (
    <Card padding="var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      <FlexBetween style={{ marginBottom: 'var(--spacer-12)' }}>
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
        <FlexBetween style={{ gap: 'var(--spacer-4)' }}>
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
        </FlexBetween>
      </FlexBetween>

      <div style={{ display: 'flex', gap: 'var(--spacer-8)', alignItems: 'flex-start', overflowX: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 20, flexShrink: 0, width: 24 }}>
          {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((label, i) => (
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

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', marginBottom: 2, height: 16 }}>
            {monthLabels.map((label, i) => (
              <div key={i} style={{ width: monthWidths[i], fontSize: 9, color: 'var(--text-tertiary)', lineHeight: '16px', flexShrink: 0 }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {heatmapData.map((row, rowIdx) => (
              <div key={rowIdx} style={{ display: 'flex', gap: 2 }}>
                {row.map((val, colIdx) => (
                  <span
                    key={colIdx}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: HEAT_COLORS[val] || HEAT_COLORS[0],
                      flexShrink: 0,
                      display: 'inline-block',
                      transition: 'transform var(--transition-fast, 0.12s) ease, opacity var(--transition-fast, 0.12s) ease',
                      cursor: 'pointer',
                      transform: hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx ? 'scale(1.3)' : 'scale(1)',
                      zIndex: hoveredCell?.row === rowIdx && hoveredCell?.col === colIdx ? 1 : 0,
                      position: 'relative',
                    }}
                    title={`${val}`}
                    onMouseEnter={e => {
                      setHoveredCell({ row: rowIdx, col: colIdx, val });
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltipPos({ x: rect.left, y: rect.top - 28 });
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {hoveredCell && (
          <div
            style={{
              position: 'fixed',
              left: tooltipPos.x,
              top: tooltipPos.y,
              background: 'var(--bg-invert)',
              color: 'var(--bg-base-default)',
              fontSize: 'var(--body-xs-font-size)',
              padding: '2px 6px',
              borderRadius: 'var(--radius-4)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100,
              lineHeight: '16px',
            }}
          >
            {hoveredCell.val} 次请求
          </div>
        )}
      </div>
    </Card>
  );
};