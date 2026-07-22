import React, { useState, useMemo } from 'react';
import { Switch } from '../../components/ui/Switch';
import { Dropdown } from '../../components/ui/Dropdown';
import { Button } from '../../components/ui/Button';
import { ProviderLogo } from '../../components/ui/ProviderLogo';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Trash2, RotateCcw } from 'lucide-react';
import type { Model, Provider } from '../../types/provider';

const cellInputStyle: React.CSSProperties = {
  height: 28,
  padding: '0 6px',
  borderRadius: 6,
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-default)',
  font: 'inherit',
  fontSize: 'var(--body-sm-font-size)',
  outline: 'none',
  boxSizing: 'border-box',
  width: '100%',
};

const REASONING_OPTS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

export interface SourceRow {
  providerId: string;
  provider: Provider;
  model: Model;
  isAggregation?: boolean;
}

export interface ModelPatch {
  alias?: string;
  supportsVision?: boolean;
  supportsReasoning?: boolean;
  supportsReasoningEffort?: boolean;
  supportsToolCalls?: boolean;
  supportsJsonMode?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  defaultReasoningEffort?: 'low' | 'medium' | 'high';
}

export type PendingEdits = Map<string, ModelPatch>;

interface ModelSourcesTableProps {
  rows: SourceRow[];
  pendingEdits: PendingEdits;
  onChange: (providerId: string, patch: ModelPatch) => void;
  onReset: () => void;
  onSave: () => void;
  onRemoveModel: (providerId: string) => void;
  saving: boolean;
  hasEdits: boolean;
}

function applyPatch(model: Model, patch: ModelPatch | undefined): Model {
  return patch ? { ...model, ...patch } : model;
}

export const ModelSourcesTable: React.FC<ModelSourcesTableProps> = ({
  rows, pendingEdits, onChange, onReset, onSave, onRemoveModel, saving, hasEdits,
}) => {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const directRows = useMemo(() => rows.filter(r => !r.isAggregation), [rows]);
  const aggRows = useMemo(() => rows.filter(r => r.isAggregation), [rows]);

  const handleChange = (providerId: string, patch: ModelPatch) => {
    const existing = pendingEdits.get(providerId) ?? {};
    const merged = { ...existing, ...patch };
    if (patch.supportsReasoning === false) {
      merged.supportsReasoningEffort = false;
      merged.defaultReasoningEffort = undefined;
    }
    onChange(providerId, merged);
  };

  const renderCellSwitch = (row: SourceRow, key: keyof ModelPatch & ('supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode')) => {
    if (row.isAggregation) return <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>—</span>;
    const m = applyPatch(row.model, pendingEdits.get(row.providerId));
    const val = m[key] as boolean | undefined;
    const disabled = key === 'supportsReasoningEffort' && !m.supportsReasoning;
    return (
      <Switch
        checked={!!val}
        onChange={(v) => handleChange(row.providerId, { [key]: v })}
        disabled={disabled}
      />
    );
  };

  return (
    <div style={{
      borderRadius: 12,
      border: '1px solid var(--border-neutral-l1)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'var(--bg-overlay-l1)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}>
        <span style={{ fontSize: 'var(--body-base-font-size)', fontWeight: 500 }}>各来源参数</span>
        <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginLeft: 8 }}>
          ({directRows.length} 个可编辑来源{aggRows.length > 0 ? `, ${aggRows.length} 个聚合路由` : ''})
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onReset} disabled={!hasEdits || saving}>
            重置修改
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} loading={saving} disabled={!hasEdits}>
            保存修改
          </Button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 800 }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 50px 50px 52px 80px 50px 50px 80px 80px 100px 40px',
            alignItems: 'center',
            padding: '6px 14px',
            background: 'var(--bg-overlay-l2)',
            borderBottom: '1px solid var(--border-neutral-l1)',
            fontSize: 'var(--body-xs-font-size)',
            color: 'var(--text-tertiary)',
            fontWeight: 500,
          }}>
            <span>供应商</span>
            <span>视觉</span>
            <span>思考</span>
            <span>强度</span>
            <span>默认强度</span>
            <span>工具</span>
            <span>JSON</span>
            <span>上下文</span>
            <span>输出</span>
            <span>别名</span>
            <span></span>
          </div>

          {directRows.map(row => {
            const m = applyPatch(row.model, pendingEdits.get(row.providerId));
            const hasPatch = pendingEdits.has(row.providerId);
            return (
              <div key={row.providerId} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 50px 50px 52px 80px 50px 50px 80px 80px 100px 40px',
                alignItems: 'center',
                padding: '6px 14px',
                borderBottom: '1px solid var(--border-neutral-l1)',
                background: hasPatch ? 'rgba(245,158,11,0.06)' : 'transparent',
                transition: 'background .2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProviderLogo providerId={row.provider.id} name={row.provider.name} size={20} />
                  <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 500 }}>{row.provider.name}</span>
                  {hasPatch && <span style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--bg-brand)', marginLeft: 4 }} />}
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsVision')}</div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsReasoning')}</div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsReasoningEffort')}</div>
                <div>
                  <Dropdown
                    options={REASONING_OPTS}
                    value={m.defaultReasoningEffort ?? ''}
                    onChange={(v) => handleChange(row.providerId, { defaultReasoningEffort: (v || undefined) as 'low'|'medium'|'high' })}
                    placeholder="—"
                    disabled={!m.supportsReasoning || !m.supportsReasoningEffort}
                    size="sm"
                  />
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsToolCalls')}</div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsJsonMode')}</div>
                <div>
                  <input
                    type="number"
                    value={m.contextWindow ?? ''}
                    onChange={(e) => handleChange(row.providerId, { contextWindow: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="—"
                    style={cellInputStyle}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={m.maxOutputTokens ?? ''}
                    onChange={(e) => handleChange(row.providerId, { maxOutputTokens: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="—"
                    style={cellInputStyle}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={m.alias ?? ''}
                    onChange={(e) => handleChange(row.providerId, { alias: e.target.value || undefined })}
                    placeholder="留空"
                    style={cellInputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(row.providerId)}
                  style={{
                    width: 28, height: 28, display: 'grid', placeItems: 'center',
                    background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
                    color: 'var(--text-tertiary)', justifySelf: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}

          {aggRows.length > 0 && (
            <>
              <div style={{
                padding: '4px 14px',
                background: 'var(--bg-overlay-l2)',
                fontSize: 'var(--body-xs-font-size)',
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                聚合路由（不可编辑）
              </div>
              {aggRows.map(row => (
                <div key={row.providerId} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 50px 52px 80px 50px 50px 80px 80px 100px 40px',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  opacity: 0.6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ProviderLogo providerId={row.provider.id} name={row.provider.name} size={20} />
                    <span style={{ fontSize: 'var(--body-sm-font-size)' }}>{row.provider.name}</span>
                    <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>(聚合)</span>
                  </div>
                  {Array(9).fill(0).map((_, i) => (
                    <div key={i} style={{ display: 'grid', placeItems: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>—</div>
                  ))}
                  <div></div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          open={!!confirmRemove}
          title="从此供应商移除模型?"
          message="该模型将从该供应商配置中移除，聚合路由可能受影响。"
          confirmLabel="移除"
          variant="danger"
          onConfirm={() => { onRemoveModel(confirmRemove); setConfirmRemove(null); }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
};
