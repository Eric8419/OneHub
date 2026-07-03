import React from 'react';
import { useStatsStore } from '../../store/statsStore';
import { Coins, Activity, Box, Clock } from 'lucide-react';

const cards = [
  {
    key: 'tokens',
    label: 'Token 总用量',
    icon: Coins,
    formatter: (v: number) => v.toLocaleString(),
    getValue: (s: any) => s.totalTokens,
    getChange: (s: any) => s.tokenChange,
    trend: 'up',
    changeLabel: 'vs last week',
  },
  {
    key: 'requests',
    label: '请求总数',
    icon: Activity,
    formatter: (v: number) => v.toLocaleString(),
    getValue: (s: any) => s.totalRequests,
    getChange: (s: any) => s.requestChange,
    trend: 'up',
    changeLabel: 'vs last week',
  },
  {
    key: 'models',
    label: '活跃模型',
    icon: Box,
    formatter: (v: number) => v.toString(),
    getValue: (s: any) => s.activeModels,
    getChange: () => null,
    trend: 'up' as const,
    changeLabel: '全部模型运行正常',
  },
  {
    key: 'response',
    label: '平均响应时间',
    icon: Clock,
    formatter: (v: number) => `${v}s`,
    getValue: (s: any) => s.avgResponseTime,
    getChange: (s: any) => s.responseTimeChange,
    trend: 'down' as const,
    changeLabel: 'vs last week',
  },
];

export const KPICards: React.FC = () => {
  const stats = useStatsStore(s => s.stats);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--spacer-16)',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      {cards.map(card => {
        const Icon = card.icon;
        const value = card.getValue(stats);
        const change = card.getChange(stats);

        return (
          <div
            key={card.key}
            className="ds-card"
            style={{
              padding: 'var(--spacer-20)',
              background: 'var(--bg-base-secondary)',
              border: '1px solid var(--border-neutral-l1)',
              borderRadius: 'var(--radius-12)',
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
              <span
                style={{
                  fontSize: 'var(--body-md-font-size)',
                  fontWeight: 'var(--font-weight-medium)',
                  color: 'var(--text-tertiary)',
                  lineHeight: 'var(--body-md-line-height)',
                }}
              >
                {card.label}
              </span>
              <Icon size={16} style={{ color: 'var(--icon-tertiary)' }} />
            </div>

            <div
              style={{
                fontFamily: 'var(--font-family-metric)',
                fontSize: 28,
                fontWeight: 'var(--font-weight-strong)',
                color: 'var(--text-default)',
                lineHeight: '36px',
                marginBottom: 'var(--spacer-8)',
              }}
            >
              {card.formatter(value)}
            </div>

            {card.key === 'models' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--status-success-default)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                  {card.changeLabel}
                </span>
              </div>
            ) : change != null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
                <span
                  style={{
                    fontSize: 12,
                    color: card.trend === 'up' ? 'var(--status-success-default)' : 'var(--status-success-default)',
                  }}
                >
                  {card.trend === 'up' ? '▲' : '▼'}
                </span>
                <span
                  style={{
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--status-success-default)',
                  }}
                >
                  {card.trend === 'up' ? '+' : '-'}{change}{card.key === 'response' ? 's' : '%'}
                </span>
                <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                  {card.changeLabel}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
