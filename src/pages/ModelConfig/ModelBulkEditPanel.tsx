import React, { useState, useEffect } from 'react';
import { Switch } from '../../components/ui/Switch';
import { Dropdown } from '../../components/ui/Dropdown';
import { Button } from '../../components/ui/Button';
import { Check } from 'lucide-react';

const inputBaseStyle: React.CSSProperties = {
  height: 32,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-default)',
  font: 'inherit',
  fontSize: 'var(--body-sm-font-size)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

export interface BulkEditValues {
  supportsVision: boolean | null;
  supportsReasoning: boolean | null;
  supportsReasoningEffort: boolean | null;
  supportsToolCalls: boolean | null;
  supportsJsonMode: boolean | null;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  defaultReasoningEffort: 'low' | 'medium' | 'high' | null;
}

interface ModelBulkEditPanelProps {
  initialValues: BulkEditValues;
  onApply: (values: BulkEditValues) => void;
  disabled?: boolean;
}

const REASONING_OPTS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

function cycleTriState(current: boolean | null): boolean | null {
  if (current === null) return true;
  if (current === true) return false;
  return null;
}

export const ModelBulkEditPanel: React.FC<ModelBulkEditPanelProps> = ({ initialValues, onApply, disabled }) => {
  const [values, setValues] = useState<BulkEditValues>(initialValues);

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const toggle = (key: 'supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode') => {
    setValues(prev => {
      const next = { ...prev };
      const cycled = cycleTriState(prev[key]);
      next[key] = cycled;
      if (key === 'supportsReasoning' && cycled === false) {
        next.supportsReasoningEffort = false;
        next.defaultReasoningEffort = null;
      }
      return next;
    });
  };

  const swRow = (key: 'supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode', label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <Switch
        checked={values[key] === true}
        indeterminate={values[key] === null}
        onChange={() => toggle(key)}
        disabled={disabled || (key === 'supportsReasoningEffort' && values.supportsReasoning === false)}
      />
      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      border: '1px solid var(--border-neutral-l1)',
      background: 'var(--bg-overlay-l1)',
    }}>
      <div style={{ fontSize: 'var(--body-base-font-size)', fontWeight: 500, marginBottom: 4 }}>批量参数设置</div>
      <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', marginBottom: 16 }}>
        设置要统一修改的参数，横线/留空的参数保持各来源原值
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {swRow('supportsVision', '视觉')}
        {swRow('supportsReasoning', '思考')}
        {swRow('supportsReasoningEffort', '强度')}
        {swRow('supportsToolCalls', '工具')}
        {swRow('supportsJsonMode', 'JSON')}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
          <label style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>上下文长度</label>
          <input
            type="number"
            value={values.contextWindow ?? ''}
            onChange={(e) => setValues(prev => ({ ...prev, contextWindow: e.target.value ? Number(e.target.value) : null }))}
            placeholder="不修改"
            style={inputBaseStyle}
            disabled={disabled}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
          <label style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>最大输出</label>
          <input
            type="number"
            value={values.maxOutputTokens ?? ''}
            onChange={(e) => setValues(prev => ({ ...prev, maxOutputTokens: e.target.value ? Number(e.target.value) : null }))}
            placeholder="不修改"
            style={inputBaseStyle}
            disabled={disabled}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100 }}>
          <label style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-secondary)' }}>默认思考强度</label>
          <Dropdown
            options={[{ value: '', label: '不修改' }, ...REASONING_OPTS]}
            value={values.defaultReasoningEffort ?? ''}
            onChange={(v) => setValues(prev => ({ ...prev, defaultReasoningEffort: v ? v as 'low'|'medium'|'high' : null }))}
            disabled={disabled || values.supportsReasoning === false}
            size="sm"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={Check}
          onClick={() => onApply(values)}
          disabled={disabled}
          style={{ marginLeft: 'auto' }}
        >
          应用到所有来源
        </Button>
      </div>
      <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginTop: 10 }}>
        仅应用于直接/别名来源，不影响聚合路由
      </div>
    </div>
  );
};
