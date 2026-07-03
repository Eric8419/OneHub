export interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  activeModels: number;
  avgResponseTime: number;
  tokenChange: number;
  requestChange: number;
  responseTimeChange: number;
  responseTimeTrend: 'up' | 'down';
}

export interface ModelBreakdown {
  name: string;
  percentage: number;
  color: string;
}

export interface RequestRecord {
  id: string;
  timestamp: string;
  model: string;
  type: string;
  tokens: number;
  status: 'success' | 'error';
  latency: string;
}

export interface DailyUsage {
  day: string;
  tokens: number;
}

export type TimeRange = '7d' | '30d' | '90d' | 'custom';
