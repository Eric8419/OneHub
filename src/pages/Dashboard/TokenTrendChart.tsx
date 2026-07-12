import { useMemo } from 'react';
import { Card, EChart, getCssVar, useThemeVersion } from '../../components/ui';
import type { EChartsOption } from '../../components/ui';
import { useStatsStore } from '../../store/statsStore';

interface TrendPoint {
  day: string;
  tokens: number;
}

/** Compute the last N days of trend from daily usage data. */
function computeTrend(dailyUsage: { date: string; tokens: number }[], days: number): TrendPoint[] {
  const byDate = new Map(dailyUsage.map(d => [d.date, d.tokens]));
  const result: TrendPoint[] = [];
  const today = new Date();
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const label = days <= 7
      ? dayLabels[date.getDay() === 0 ? 6 : date.getDay() - 1]
      : `${date.getMonth() + 1}/${date.getDate()}`;
    result.push({ day: label, tokens: byDate.get(key) ?? 0 });
  }

  return result;
}

function rangeToDays(range: string): number {
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return 7;
}

function formatTokens(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(0)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
  return v.toString();
}

export const TokenTrendChart: React.FC = () => {
  const dailyUsage = useStatsStore(s => s.dailyUsage);
  const timeRange = useStatsStore(s => s.timeRange);
  const days = rangeToDays(timeRange);
  const trendData = computeTrend(dailyUsage, days);
  const themeVersion = useThemeVersion();

  const option = useMemo<EChartsOption>(() => {
    const brandColor = getCssVar('--viz-series-brand') || '#4B3FE3';
    const tertiaryText = getCssVar('--text-tertiary') || '#737373';
    const gridColor = getCssVar('--border-neutral-l1') || 'rgba(115,115,115,0.12)';
    const tooltipBg = getCssVar('--bg-tooltip') || '#FFFFFF';
    const tooltipText = getCssVar('--text-default') || '#171717';
    const metricFont = getCssVar('--font-family-metric') || 'Inter, sans-serif';

    return {
      grid: { top: 10, right: 8, bottom: 5, left: 0, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: gridColor,
        borderWidth: 1,
        textStyle: { color: tooltipText, fontSize: 12 },
        axisPointer: {
          type: 'line',
          lineStyle: { color: brandColor, type: 'dashed', width: 1 },
        },
        formatter: (params: unknown) => {
          const p = (Array.isArray(params) ? params[0] : params) as { name: string; value: number };
          return `${p.name}<br/>${formatTokens(p.value)} tokens`;
        },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trendData.map(d => d.day),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridColor } },
        axisLabel: {
          color: tertiaryText,
          fontSize: 10,
          fontFamily: metricFont,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: { color: gridColor, type: 'dashed' },
        },
        axisLabel: {
          color: tertiaryText,
          fontSize: 10,
          fontFamily: metricFont,
          formatter: (v: number) => formatTokens(v),
        },
      },
      series: [
        {
          type: 'line',
          data: trendData.map(d => d.tokens),
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: false,
          lineStyle: { color: brandColor, width: 2.5 },
          itemStyle: {
            color: brandColor,
            borderColor: getCssVar('--bg-base-secondary') || '#F5F5F5',
            borderWidth: 2,
          },
          emphasis: { focus: 'series', scale: 1.4 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: brandColor },
                { offset: 0.05, color: hexWithAlpha(brandColor, 0.2) },
                { offset: 1, color: hexWithAlpha(brandColor, 0.02) },
              ],
            },
          },
          animationDuration: 500,
          animationEasing: 'cubicOut',
        },
      ],
    };
  }, [trendData, themeVersion]);

  return (
    <Card>
      <div
        style={{
          fontSize: 'var(--heading-xs-font-size)',
          fontWeight: 'var(--heading-xs-font-weight)',
          color: 'var(--text-default)',
          lineHeight: 'var(--heading-xs-line-height)',
          marginBottom: 'var(--spacer-20)',
        }}
      >
        Token 用量趋势
        <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', marginLeft: 'var(--spacer-8)', fontWeight: 400 }}>
          (近{days}日)
        </span>
      </div>
      <div style={{ height: 220, position: 'relative' }}>
        {dailyUsage.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
            暂无数据 — 启动代理并发送请求后将显示趋势
          </div>
        ) : (
          <EChart option={option} />
        )}
      </div>
    </Card>
  );
};

/** Convert a `#RRGGBB` hex color to an `rgba(…)` string with the given alpha.
 * Falls back to the original color if it isn't a 6-digit hex. */
function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
