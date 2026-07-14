import { create } from 'zustand';
import { desktopApi } from '../lib/desktopApi';
import type { RequestRecord, ModelBreakdown, TimeRange, UsageStats, DailyUsage } from '../types/stats';

const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : e ? String(e) : fallback);

interface StatsStore {
  stats: UsageStats;
  modelBreakdown: ModelBreakdown[];
  recentRequests: RequestRecord[];
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

const VENDOR_PATTERNS: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /gpt|o1|o3|openai/i, color: 'var(--chart-gpt)' },
  { pattern: /claude|anthropic/i, color: 'var(--chart-claude)' },
  { pattern: /deepseek/i, color: 'var(--chart-deepseek)' },
  { pattern: /qwen|tongyi|alibaba/i, color: 'var(--chart-qwen)' },
  { pattern: /gemini|google/i, color: 'var(--viz-series-teal)' },
  { pattern: /glm|zhipu|chatglm/i, color: 'var(--viz-series-violet)' },
  { pattern: /doubao|volcengine|bytedance/i, color: 'var(--viz-series-coral)' },
  { pattern: /moonshot|kimi/i, color: 'var(--viz-series-sky)' },
  { pattern: /yi|zero-one|01ai/i, color: 'var(--viz-series-magenta)' },
  { pattern: /llama|meta/i, color: 'var(--viz-series-indigo)' },
  { pattern: /mistral/i, color: 'var(--viz-series-amber)' },
  { pattern: /senseTime|商汤|sensenova/i, color: 'var(--viz-series-mint)' },
];

const FALLBACK_PALETTE = [
  'var(--viz-series-lime)',
  'var(--viz-series-slate)',
  'var(--viz-series-brand-soft)',
  'var(--viz-series-violet)',
  'var(--viz-series-teal)',
];

function resolveModelColor(modelName: string, usedColors: Set<string>): string {
  for (const { pattern, color } of VENDOR_PATTERNS) {
    if (pattern.test(modelName)) return color;
  }
  for (const color of FALLBACK_PALETTE) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }
  return 'var(--chart-other)';
}

/** Compute model breakdown percentages from request records. */
function computeModelBreakdown(requests: RequestRecord[]): ModelBreakdown[] {
  if (requests.length === 0) return [];
  const counts: Record<string, number> = {};
  for (const r of requests) counts[r.model] = (counts[r.model] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = requests.length;
  const breakdown: ModelBreakdown[] = [];
  const usedColors = new Set<string>();
  const otherColor = 'var(--chart-other)';
  const topModels = sorted.slice(0, 5);
  const otherCount = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
  for (const [name, count] of topModels) {
    breakdown.push({
      name,
      percentage: Math.round((count / total) * 100),
      color: resolveModelColor(name, usedColors),
    });
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
      set({ dailyUsage: data, dailyUsageLoading: false });
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
        page: 0,
      });
    } catch (e: unknown) {
      console.warn('[statsStore] reset_stats failed:', e);
    }
  },
}));
