import React, { useEffect, useRef, useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import type { UsageStats } from '../../types/stats';
import { Counter, FlexBetween, FlexRow, ShinyText, SpotlightCard, Skeleton } from '../../components/ui';
import { Coins, Activity, Box, Clock, RefreshCw } from 'lucide-react';

interface KpiCardConfig {
  key: string;
  label: string;
  icon: typeof Coins;
  formatter: (value: number) => string;
  getValue: (stats: UsageStats) => number;
  getChange: (stats: UsageStats) => number | null;
  changeLabel: string;
}

const cards: KpiCardConfig[] = [
  {
    key: 'tokens',
    label: 'Token 总用量',
    icon: Coins,
    formatter: (v: number) => v.toLocaleString(),
    getValue: (s: any) => s.totalTokens,
    getChange: (s: any) => s.tokenChange,
    changeLabel: '较上一周期',
  },
  {
    key: 'requests',
    label: '请求总数',
    icon: Activity,
    formatter: (v: number) => v.toLocaleString(),
    getValue: (s: any) => s.totalRequests,
    getChange: (s: any) => s.requestChange,
    changeLabel: '较上一周期',
  },
  {
    key: 'models',
    label: '活跃模型',
    icon: Box,
    formatter: (v: number) => v.toString(),
    getValue: (s: any) => s.activeModels,
    getChange: () => null,
    changeLabel: '全部模型运行正常',
  },
  {
    key: 'response',
    label: '平均响应时间',
    icon: Clock,
    formatter: (v: number) => `${v}s`,
    getValue: (s: any) => s.avgResponseTime,
    getChange: (s: any) => s.responseTimeChange,
    changeLabel: '较上一周期',
  },
];

export const KPICards: React.FC = () => {
  const stats = useStatsStore(s => s.stats);
  const error = useStatsStore(s => s.statsError);
  const fetchStats = useStatsStore(s => s.fetchStats);
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const prevValues = useRef<Record<string, number>>({});
  const [showSkeleton, setShowSkeleton] = useState(true);

  // Hide skeleton after mount — skeleton is only needed before the very
  // first fetchStats() completes. After that, cards always render (even
  // with zero values) to keep the DOM / scroll position stable.
  useEffect(() => {
    setShowSkeleton(false);
  }, []);

  // Track value changes for highlight
  useEffect(() => {
    if (showSkeleton) return;
    const newChanged = new Set<string>();
    for (const card of cards) {
      const val = card.getValue(stats);
      const prev = prevValues.current[card.key];
      if (prev !== undefined && prev !== val) {
        newChanged.add(card.key);
      }
      prevValues.current[card.key] = val;
    }
    if (newChanged.size > 0) {
      setChangedKeys(newChanged);
      const timer = setTimeout(() => setChangedKeys(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [stats, showSkeleton]);

  if (error) {
    return (
      <div
        className="dashboard-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--spacer-16)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        {cards.map((card, idx) => (
          <SpotlightCard key={card.key} delay={idx * 70} variant="danger">
            <div style={{ textAlign: 'center', padding: 'var(--spacer-12) 0' }}>
              <card.icon size={20} style={{ color: 'var(--status-error-default)', marginBottom: 'var(--spacer-8)' }} />
              <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>加载失败</div>
              <button
                onClick={fetchStats}
                style={{
                  marginTop: 'var(--spacer-8)', cursor: 'pointer', border: 'none', background: 'transparent',
                  color: 'var(--text-brand)', fontSize: 'var(--body-xs-font-size)', fontFamily: 'inherit',
                }}
              >
                <RefreshCw size={12} style={{ marginRight: 4, display: 'inline' }} />
                重试
              </button>
            </div>
          </SpotlightCard>
        ))}
      </div>
    );
  }

  if (showSkeleton) {
    return (
      <div
        className="dashboard-kpi-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--spacer-16)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        {cards.map((card, idx) => (
          <SpotlightCard key={card.key} delay={idx * 70}>
            <FlexBetween style={{ marginBottom: 'var(--spacer-12)' }}>
              <Skeleton width={80} height={14} />
              <Skeleton width={16} height={16} borderRadius="var(--radius-full)" />
            </FlexBetween>
            <Skeleton width={120} height={32} style={{ marginBottom: 'var(--spacer-8)' }} />
            <Skeleton width={60} height={12} />
          </SpotlightCard>
        ))}
      </div>
    );
  }

  return (
    <div
      className="dashboard-kpi-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 'var(--spacer-16)',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      {cards.map((card, idx) => {
        const Icon = card.icon;
        const value = card.getValue(stats);
        const change = card.getChange(stats);
        const isUp = card.key === 'response'
          ? (change != null && change <= 0)
          : (change != null && change >= 0);
        const trendDir = isUp ? 'up' : 'down';
        const trendColor = trendDir === 'up' ? 'var(--status-success-default)' : 'var(--status-error-default)';
        const isChanged = changedKeys.has(card.key);

        return (
          <SpotlightCard
            key={card.key}
            delay={idx * 70}
            className={isChanged ? 'rb-highlight-change' : ''}
            style={{ cursor: 'default' }}
          >
            <FlexBetween style={{ marginBottom: 'var(--spacer-12)' }}>
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
            </FlexBetween>

            <div
              style={{
                fontFamily: 'var(--font-family-metric)',
                fontSize: 28,
                fontWeight: 'var(--font-weight-strong)',
                color: 'var(--text-default)',
                lineHeight: '36px',
                marginBottom: 'var(--spacer-8)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {value != null ? (
                <>
                  <Counter
                    value={value}
                    fontSize={28}
                    gap={1}
                    horizontalPadding={0}
                    gradientHeight={0}
                    gradientFrom="transparent"
                    gradientTo="transparent"
                    textColor="var(--text-default)"
                    fontWeight="var(--font-weight-strong)"
                    containerStyle={{ verticalAlign: 'middle' }}
                  />
                  {card.key === 'response' && 's'}
                </>
              ) : (
                card.formatter(0)
              )}
            </div>

            {card.key === 'models' ? (
              <FlexRow gap="var(--spacer-6)">
                <span
                  className="rb-pulse-dot"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--status-success-default)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                  <ShinyText active={false}>{card.changeLabel}</ShinyText>
                </span>
              </FlexRow>
            ) : change != null ? (
              <FlexRow gap="var(--spacer-4)">
                <span style={{ fontSize: 12, color: trendColor }}>
                  {trendDir === 'up' ? '▲' : '▼'}
                </span>
                <span
                  style={{
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: trendColor,
                  }}
                >
                  {change >= 0 ? '+' : ''}{change}{card.key === 'response' ? 's' : '%'}
                </span>
                <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                  {card.changeLabel}
                </span>
              </FlexRow>
            ) : null}
          </SpotlightCard>
        );
      })}
    </div>
  );
};
