import type { CSSProperties } from 'react';
import {
  Activity,
  BatteryCharging,
  Blend,
  BrainCircuit,
  CircleDollarSign,
  Clock3,
  Gauge,
  GitBranch,
  History,
  Layers3,
  ListOrdered,
  Network,
  Percent,
  Repeat2,
  Shuffle,
  Sparkles,
  TimerReset,
  Workflow,
  Zap,
} from 'lucide-react';
import { Dropdown } from '../../components/ui';
import { STRATEGY_OPTIONS, type RoutingStrategy } from '../../types/aggregation';
import { useT } from '../../i18n';

const icons = {
  priority: ListOrdered,
  weighted: Percent,
  'round-robin': Repeat2,
  'context-relay': GitBranch,
  'fill-first': BatteryCharging,
  p2c: Network,
  random: Shuffle,
  'least-used': Activity,
  'cost-optimized': CircleDollarSign,
  'reset-aware': TimerReset,
  'reset-window': Clock3,
  headroom: Gauge,
  'strict-random': Zap,
  auto: Sparkles,
  lkgp: History,
  'context-optimized': BrainCircuit,
  'cache-optimized': Layers3,
  fusion: Blend,
  pipeline: Workflow,
} as const;

interface RoutingStrategySelectProps {
  value: RoutingStrategy;
  onChange: (value: RoutingStrategy) => void;
  size?: 'sm' | 'md';
  style?: CSSProperties;
  showDescription?: boolean;
}

export const RoutingStrategySelect: React.FC<RoutingStrategySelectProps> = ({
  value,
  onChange,
  size = 'md',
  style,
  showDescription = true,
}) => {
  const t = useT();
  const options = STRATEGY_OPTIONS.map((option) => ({
    value: option.value,
    label: t(`routing.strategy.${option.labelKey}`),
    group: t(`routing.strategy.group.${option.groupKey}`),
  }));
  const selected = STRATEGY_OPTIONS.find((option) => option.value === value) ?? STRATEGY_OPTIONS[0];
  const Icon = icons[value] ?? Sparkles;

  return (
    <div style={{ minWidth: 0, ...style }}>
      <Dropdown
        options={options}
        value={value}
        onChange={(next) => onChange(next as RoutingStrategy)}
        searchable
        searchPlaceholder={t('routing.strategy.search')}
        maxItems={9}
        size={size}
        renderTriggerLeading={() => <Icon size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />}
        renderOption={(option) => {
          const OptionIcon = icons[option.value as RoutingStrategy] ?? Sparkles;
          return <OptionIcon size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />;
        }}
      />
      {showDescription && (
        <div
          style={{
            marginTop: 'var(--spacer-6)',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 1.45,
          }}
        >
          {t(`routing.strategy.${selected.descriptionKey}`)}
        </div>
      )}
    </div>
  );
};
