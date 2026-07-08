// Wire-format types returned by the Tauri `get_stats` /
// `get_recent_requests` / `get_daily_usage` commands. The Rust
// structs now serialize with camelCase, so these mirror the
// payload exactly — no manual field renaming in the stores.

export interface UsageStats {
  totalTokens: number;
  totalRequests: number;
  activeModels: number;
  avgResponseTime: number;
  // Trend deltas (currently 0 server-side; reserved for future
  // period-over-period comparison). Kept so the dashboard can
  // render change indicators without a contract change.
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

/** Raw request record as delivered over IPC (camelCase). */
export interface RequestRecord {
  id: string;
  timestamp: string;
  model: string;
  /** Serialized as `type` on the wire (Rust `r#type`). */
  type: string;
  tokens: number;
  status: string;
  latencyMs: number;
  errorCategory: string;
}

export interface DailyUsage {
  date: string;
  count: number;
  tokens: number;
}

export type TimeRange = '7d' | '30d' | '90d';
