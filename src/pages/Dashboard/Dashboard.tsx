import { useEffect, useRef } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { KPICards } from './KPICards';
import { TimeRangeTabs } from './TimeRangeTabs';
import { TokenTrendChart } from './TokenTrendChart';
import { ModelDonutChart } from './ModelDonutChart';
import { UsageHeatmap } from './UsageHeatmap';
import { RecentRequests } from './RecentRequests';

export const Dashboard: React.FC = () => {
  const fetchStats = useStatsStore(s => s.fetchStats);
  const fetchRequests = useStatsStore(s => s.fetchRequests);
  const fetchDailyUsage = useStatsStore(s => s.fetchDailyUsage);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchDailyUsage();

    intervalRef.current = setInterval(() => { fetchStats(); fetchRequests(); }, 10000);

    // Pause polling when tab is hidden
    const onVisibility = () => {
      if (document.hidden && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && !intervalRef.current) {
        intervalRef.current = setInterval(() => { fetchStats(); fetchRequests(); }, 10000);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchStats, fetchRequests, fetchDailyUsage]);

  return (
    <div>
      <KPICards />
      <TimeRangeTabs />
      <div
        className="dashboard-chart-grid"
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
