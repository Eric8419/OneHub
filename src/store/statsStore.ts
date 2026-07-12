import { create } from 'zustand';
import { desktopApi } from '../lib/desktopApi';
import type { RequestRecord, ModelBreakdown, TimeRange, UsageStats, DailyUsage } from '../types/stats';

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

interface StatsStore {
  stats: UsageStats;
  modelBreakdown: ModelBreakdown[];
  recentRequests: RequestRecord[];
  heatmapData: number[][];
  dailyUsage: DailyUsage[];
  timeRange: TimeRange;
  loading: boolean;
  /** Per-area loading states */
  statsLoading: boolean;
  requestsLoading: boolean;
  dailyUsageLoading: boolean;
  /** Per-area error states */
  statsError: string | null;
  requestsError: string | null;
  dailyUsageError: string | null;
  page: number;
  pageSize: number;
  setTimeRange: (range: TimeRange) => void;
  setPage: (page: number) => void;
  fetchStats: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchDailyUsage: () => Promise<void>;
  resetStats: () => Promise<void>;
}

const EMPTY_STATS: UsageStats = {
  totalTokens: 0,
  totalRequests: 0,
  activeModels: 0,
  avgResponseTime: 0,
  tokenChange: 0,
  requestChange: 0,
  responseTimeChange: 0,
  responseTimeTrend: 'up',
};

/** Build a 52-week × 7-day heatmap grid from daily usage data. */
function buildHeatmapFromDailyUsage(dailyData: DailyUsage[]): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(52).fill(0));
  if (dailyData.length === 0) return grid;
  const maxCount = Math.max(...dailyData.map((d) => d.count), 1);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const day of dailyData) {
    const date = new Date(day.date);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / dayMs);
    if (diffDays < 0 || diffDays >= 364) continue;
    const weekCol = 51 - Math.floor(diffDays / 7);
    let dayRow = date.getDay() - 1;
    if (dayRow < 0) dayRow = 6;
    if (weekCol >= 0 && weekCol < 52 && dayRow >= 0 && dayRow < 7) {
      const intensity = Math.min(5, Math.round((day.count / maxCount) * 5));
      grid[dayRow][weekCol] = intensity;
    }
  }
  return grid;
}

/** Compute model breakdown percentages from request records. */
function computeModelBreakdown(requests: RequestRecord[]): ModelBreakdown[] {
  if (requests.length === 0) return [];
  const counts: Record<string, number> = {};
  for (const r of requests) counts[r.model] = (counts[r.model] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const colorMap: Record<string, string> = {
    'GPT-4o': 'var(--chart-gpt)',
    'GPT-4o-mini': 'var(--chart-gpt)',
    'GPT-4.1': 'var(--chart-gpt)',
    'o3-mini': 'var(--chart-gpt)',
    o3: 'var(--chart-gpt)',
    'Claude 3.5 Sonnet': 'var(--chart-claude)',
    'Claude 3.5 Haiku': 'var(--chart-claude)',
    'Claude 4': 'var(--chart-claude)',
    'DeepSeek V3': 'var(--chart-deepseek)',
    'DeepSeek Coder': 'var(--chart-deepseek)',
    'Qwen 2.5': 'var(--chart-qwen)',
  };
  const total = requests.length;
  const breakdown: ModelBreakdown[] = [];
  const otherColor = 'var(--chart-other)';
  const topModels = sorted.slice(0, 4);
  const otherCount = sorted.slice(4).reduce((sum, [, count]) => sum + count, 0);
  for (const [name, count] of topModels) {
    breakdown.push({ name, percentage: Math.round((count / total) * 100), color: colorMap[name] || otherColor });
  }
  if (otherCount > 0) {
    breakdown.push({ name: '其他', percentage: Math.round((otherCount / total) * 100), color: otherColor });
  }
  return breakdown;
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: EMPTY_STATS,
  modelBreakdown: [],
  recentRequests: [],
  heatmapData: [],
  dailyUsage: [],
  timeRange: '7d',
  loading: false,
  statsLoading: false,
  requestsLoading: false,
  dailyUsageLoading: false,
  statsError: null,
  requestsError: null,
  dailyUsageError: null,
  page: 0,
  pageSize: 10,

  setTimeRange: (timeRange) => set({ timeRange, page: 0 }),
  setPage: (page) => set({ page }),

  fetchStats: async () => {
    set({ statsLoading: true, statsError: null });
    try {
      const timeRange = get().timeRange;
      const s = await desktopApi.getStats(timeRange);
      set({
        stats: {
          totalTokens: s.totalTokens ?? 0,
          totalRequests: s.totalRequests ?? 0,
          activeModels: s.activeModels ?? 0,
          avgResponseTime: s.avgResponseTime ?? 0,
          tokenChange: s.tokenChange ?? 0,
          requestChange: s.requestChange ?? 0,
          responseTimeChange: s.responseTimeChange ?? 0,
          responseTimeTrend: s.responseTimeTrend ?? 'up',
        },
        statsLoading: false,
      });
    } catch (e: unknown) {
      set({ statsLoading: false, statsError: errorMessage(e, '获取统计失败') });
    }
  },

  fetchRequests: async () => {
    set({ requestsLoading: true, requestsError: null });
    try {
      // Wire format is already camelCase; no manual remapping.
      const reqs = await desktopApi.getRecentRequests(100);
      set({
        recentRequests: reqs,
        modelBreakdown: computeModelBreakdown(reqs),
        requestsLoading: false,
      });
    } catch (e: unknown) {
      set({ requestsLoading: false, requestsError: errorMessage(e, '获取请求记录失败') });
    }
  },

  fetchDailyUsage: async () => {
    set({ dailyUsageLoading: true, dailyUsageError: null });
    try {
      const data = await desktopApi.getDailyUsage();
      const heatmap = buildHeatmapFromDailyUsage(data);
      set({ dailyUsage: data, heatmapData: heatmap, dailyUsageLoading: false });
    } catch (e: unknown) {
      set({ dailyUsageLoading: false, dailyUsageError: errorMessage(e, '获取用量数据失败') });
    }
  },

  resetStats: async () => {
    try {
      await desktopApi.resetStats();
      set({
        stats: EMPTY_STATS,
        modelBreakdown: [],
        recentRequests: [],
        dailyUsage: [],
        heatmapData: buildHeatmapFromDailyUsage([]),
        page: 0,
      });
    } catch (e: unknown) {
      console.warn('[statsStore] reset_stats failed:', e);
    }
  },
}));
