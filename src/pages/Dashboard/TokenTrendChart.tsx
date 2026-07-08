import { Card } from '../../components/ui';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
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

export const TokenTrendChart: React.FC = () => {
  const dailyUsage = useStatsStore(s => s.dailyUsage);
  const timeRange = useStatsStore(s => s.timeRange);
  const days = rangeToDays(timeRange);
  const trendData = computeTrend(dailyUsage, days);

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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--viz-series-brand)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--viz-series-brand)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-neutral-l1)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-family-metric)' }}
                axisLine={{ stroke: 'var(--border-neutral-l1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-family-metric)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-tooltip)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  fontSize: 'var(--body-sm-font-size)',
                }}
              />
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="var(--viz-series-brand)"
                strokeWidth={2.5}
                fill="url(#tokenGradient)"
                dot={{ r: 3, fill: 'var(--viz-series-brand)', stroke: 'var(--bg-base-secondary)', strokeWidth: 2 }}
                isAnimationActive={false}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};
