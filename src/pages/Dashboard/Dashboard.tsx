import { useEffect } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { KPICards } from './KPICards';
import { TimeRangeTabs } from './TimeRangeTabs';
import { TokenTrendChart } from './TokenTrendChart';
import { ModelDonutChart } from './ModelDonutChart';
import { UsageHeatmap } from './UsageHeatmap';
import { RecentRequests } from './RecentRequests';

export const Dashboard: React.FC = () => {
  const { fetchStats, fetchRequests, fetchDailyUsage } = useStatsStore();

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchDailyUsage();
    const interval = setInterval(() => { fetchStats(); fetchRequests(); }, 10000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchRequests, fetchDailyUsage]);

  return (
    <div>
      <KPICards />
      <TimeRangeTabs />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          gap: 'var(--spacer-16)',
          marginBottom: 'var(--spacer-24)',
        }}
      >
        <TokenTrendChart />
        <ModelDonutChart />
      </div>
      <UsageHeatmap />
      <RecentRequests />
    </div>
  );
};
