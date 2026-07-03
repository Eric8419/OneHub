import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export const TokenTrendChart: React.FC = () => {
  const data = [
    { day: 'Mon', tokens: 320000 },
    { day: 'Tue', tokens: 450000 },
    { day: 'Wed', tokens: 380000 },
    { day: 'Thu', tokens: 520000 },
    { day: 'Fri', tokens: 410000 },
    { day: 'Sat', tokens: 220000 },
    { day: 'Sun', tokens: 158320 },
  ];

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
        Token 用量趋势
      </div>
      <div style={{ height: 220, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
            <Area type="monotone" dataKey="tokens" stroke="var(--viz-series-brand)" strokeWidth={2.5} fill="url(#tokenGradient)" dot={{ r: 3, fill: 'var(--viz-series-brand)', stroke: 'var(--bg-base-secondary)', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
