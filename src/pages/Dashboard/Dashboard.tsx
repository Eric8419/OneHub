import { useEffect, useRef, useMemo } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { KPICards } from './KPICards';
import { TimeRangeTabs } from './TimeRangeTabs';
import { TokenTrendChart } from './TokenTrendChart';
import { ModelDonutChart } from './ModelDonutChart';
import { UsageHeatmap } from './UsageHeatmap';
import { RecentRequests } from './RecentRequests';
import { ProxyControl } from './ProxyControl';
import { TriangleAlert, RefreshCw } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const fetchStats = useStatsStore((s) => s.fetchStats);
  const fetchRequests = useStatsStore((s) => s.fetchRequests);
  const fetchDailyUsage = useStatsStore((s) => s.fetchDailyUsage);
  const statsError = useStatsStore((s) => s.statsError);
  const requestsError = useStatsStore((s) => s.requestsError);
  const dailyUsageError = useStatsStore((s) => s.dailyUsageError);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unified load error: combine all widget errors into one.
  const loadError = useMemo(() => {
    return statsError || requestsError || dailyUsageError;
  }, [statsError, requestsError, dailyUsageError]);

  const handleRetry = () => {
    fetchStats();
    fetchRequests();
    fetchDailyUsage();
  };

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchDailyUsage();

    intervalRef.current = setInterval(() => {
      fetchStats();
      fetchRequests();
    }, 10000);

    // Pause polling when tab is hidden
    const onVisibility = () => {
      if (document.hidden && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && !intervalRef.current) {
        intervalRef.current = setInterval(() => {
          fetchStats();
          fetchRequests();
        }, 10000);
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
      {loadError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-8)',
            padding: 'var(--spacer-10) var(--spacer-14)',
            marginBottom: 'var(--spacer-16)',
            borderRadius: 'var(--radius-8)',
            background: 'var(--status-error-surface-l1)',
            border: '1px solid var(--status-error-default)',
            color: 'var(--status-error-default)',
            fontSize: 'var(--body-sm-font-size)',
          }}
        >
          <TriangleAlert size={16} />
          <span style={{ flex: 1 }}>数据加载失败：{loadError}</span>
          <button
            onClick={handleRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacer-4)',
              height: 28,
              padding: '0 var(--spacer-10)',
              borderRadius: 'var(--radius-6)',
              border: '1px solid var(--status-error-default)',
              background: 'transparent',
              color: 'var(--status-error-default)',
              cursor: 'pointer',
              fontSize: 'var(--body-xs-font-size)',
              fontFamily: 'inherit',
            }}
          >
            <RefreshCw size={12} />
            重试
          </button>
        </div>
      )}
      <ProxyControl />
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
