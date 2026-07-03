import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useStatsStore } from '../../store/statsStore';

export const ModelDonutChart: React.FC = () => {
  const modelBreakdown = useStatsStore(s => s.modelBreakdown);
  const totalRequests = useStatsStore(s => s.stats.totalRequests);

  return (
    <div
      className="ds-card"
      style={{
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)',
        padding: 'var(--spacer-20)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--heading-xs-font-size)',
          fontWeight: 'var(--heading-xs-font-weight)',
          color: 'var(--text-default)',
          lineHeight: 'var(--heading-xs-line-height)',
          marginBottom: 'var(--spacer-20)',
        }}
      >
        模型调用分布
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={modelBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                dataKey="percentage"
                stroke="none"
              >
                {modelBreakdown.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-family-metric)',
                fontSize: 22,
                fontWeight: 'var(--font-weight-strong)',
                color: 'var(--text-default)',
                lineHeight: '28px',
              }}
            >
              {totalRequests.toLocaleString()}
            </div>
            <div
              style={{
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-tertiary)',
                lineHeight: 'var(--body-xs-line-height)',
              }}
            >
              总请求
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--spacer-8) var(--spacer-16)',
            marginTop: 'var(--spacer-20)',
            width: '100%',
          }}
        >
          {modelBreakdown.map(item => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 'var(--radius-full)',
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-family-metric)',
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-tertiary)',
                  marginLeft: 'auto',
                }}
              >
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
