export type RoutingStrategy = 'round-robin' | 'lowest-latency' | 'random' | 'sequential';

export interface Aggregation {
  id: string;
  name: string;
  models: string;
  strategy: string;
  priority: string;
  enabled: boolean;
}

export const STRATEGY_LABELS: Record<RoutingStrategy, string> = {
  'round-robin': '轮询 (Round Robin)',
  'lowest-latency': '最低延迟',
  'random': '随机',
  'sequential': '顺序',
};
