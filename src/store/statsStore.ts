import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { RequestRecord, ModelBreakdown, TimeRange } from '../types/stats';

interface DailyUsage {
  date: string;
  count: number;
  tokens: number;
}

interface StatsStore {
  stats: { totalTokens: number; totalRequests: number; activeModels: number; avgResponseTime: number; tokenChange: number; requestChange: number; responseTimeChange: number; responseTimeTrend: 'up' | 'down' };
  modelBreakdown: ModelBreakdown[];
  recentRequests: RequestRecord[];
  heatmapData: number[][];
  timeRange: TimeRange;
  loading: boolean;
  page: number;
  pageSize: number;
  setTimeRange: (range: TimeRange) => void;
  setPage: (page: number) => void;
  fetchStats: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchDailyUsage: () => Promise<void>;
}

const EMPTY_STATS = {
  totalTokens: 0, totalRequests: 0, activeModels: 0, avgResponseTime: 0,
  tokenChange: 0, requestChange: 0, responseTimeChange: 0, responseTimeTrend: 'up' as const,
};

/** Build a 52-week × 7-day heatmap grid from daily usage data.
 *  Returns a 7x52 array where each cell is 0-5 (intensity level). */
function buildHeatmapFromDailyUsage(dailyData: DailyUsage[]): number[][] {
  // Initialize empty 7x52 grid
  const grid: number[][] = Array.from({ length: 7 }, () => Array(52).fill(0));

  if (dailyData.length === 0) return grid;

  // Find max count for scaling
  const maxCount = Math.max(...dailyData.map(d => d.count), 1);

  // Map each day's count to a cell in the 52-week grid
  // Use the most recent 364 days (52 weeks)
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const day of dailyData) {
    const date = new Date(day.date);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / dayMs);
    if (diffDays < 0 || diffDays >= 364) continue;

    // Determine week column (0 = most recent week, 51 = oldest)
    const weekCol = 51 - Math.floor(diffDays / 7);
    // Determine day row (0 = Monday, 6 = Sunday)
    // JavaScript: 0=Sun, 1=Mon, ..., 6=Sat → adjust to Mon=0..Sun=6
    let dayRow = date.getDay() - 1;
    if (dayRow < 0) dayRow = 6; // Sunday → row 6

    if (weekCol >= 0 && weekCol < 52 && dayRow >= 0 && dayRow < 7) {
      // Scale to 0-5
      const intensity = Math.min(5, Math.round((day.count / maxCount) * 5));
      grid[dayRow][weekCol] = intensity;
    }
  }

  return grid;
}

export const useStatsStore = create<StatsStore>((set) => ({
  stats: EMPTY_STATS,
  modelBreakdown: [
    { name: 'GPT-4o', percentage: 0, color: 'var(--chart-gpt)' },
    { name: 'Claude 3.5', percentage: 0, color: 'var(--chart-claude)' },
    { name: 'DeepSeek V3', percentage: 0, color: 'var(--chart-deepseek)' },
    { name: 'Qwen 2.5', percentage: 0, color: 'var(--chart-qwen)' },
    { name: '其他', percentage: 0, color: 'var(--chart-other)' },
  ],
  recentRequests: [],
  heatmapData: [],
  timeRange: '7d',
  loading: false,
  page: 0,
  pageSize: 10,

  setTimeRange: (timeRange) => set({ timeRange }),
  setPage: (page) => set({ page }),

  fetchStats: async () => {
    try {
      const s: any = await invoke('get_stats');
      set({
        stats: {
          totalTokens: s?.total_tokens ?? 0,
          totalRequests: s?.total_requests ?? 0,
          activeModels: s?.active_models ?? 0,
          avgResponseTime: s?.avg_response_time ?? 0,
          tokenChange: 0, requestChange: 0, responseTimeChange: 0,
          responseTimeTrend: 'up' as const,
        },
      });
    } catch {
      // Proxy not running — data stays empty
    }
  },

  fetchRequests: async () => {
    try {
      const reqs: any[] = await invoke('get_recent_requests', { limit: 100 });
      set({
        recentRequests: reqs.map((r: any) => ({
          id: r.id, timestamp: r.timestamp, model: r.model,
          type: r.type || 'Chat Completion',
          tokens: r.tokens, status: r.status,
          latency: `${(r.latency_ms / 1000).toFixed(2)}s`,
        })),
      });
    } catch {
      // Keep empty
    }
  },

  fetchDailyUsage: async () => {
    try {
      const data: DailyUsage[] = await invoke('get_daily_usage');
      const heatmap = buildHeatmapFromDailyUsage(data);
      set({ heatmapData: heatmap });
    } catch {
      // Keep empty heatmap
    }
  },
}));