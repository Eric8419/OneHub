import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Switch } from '../../components/ui/Switch';
import { Dropdown } from '../../components/ui/Dropdown';
import { Button } from '../../components/ui/Button';
import { ProviderLogo } from '../../components/ui/ProviderLogo';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { desktopApi } from '../../lib/desktopApi';
import { Trash2, RotateCcw, PlugZap, CircleCheck, CircleX, Loader2, Play } from 'lucide-react';
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
  rows,
  pendingEdits,
  onChange,
  onReset,
  onSave,
  onRemoveModel,
  saving,
  hasEdits,
}) => {
  const navigate = useNavigate();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [testStates, setTestStates] = useState<
    Record<string, { testing: boolean; ok: boolean | null; message: string; latencyMs?: number }>
  >({});

  const handleTest = async (row: SourceRow) => {
    setTestStates((prev) => ({
      ...prev,
      [row.providerId]: { testing: true, ok: null, message: '' },
    }));
    try {
      const result = await desktopApi.testModelConnection(
        row.provider.apiFlavor || 'openai-compatible',
        row.provider.apiBase,
        row.provider.apiKey,
        row.model.name,
      );
      setTestStates((prev) => ({
        ...prev,
        [row.providerId]: {
          testing: false,
          ok: result.success,
          message: result.message,
          latencyMs: result.latencyMs,
        },
      }));
    } catch (e) {
      setTestStates((prev) => ({
        ...prev,
        [row.providerId]: {
          testing: false,
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const handleTestAll = async () => {
    const targets = rows.map((row) => ({ row }));
    setTestStates((prev) => {
      const next = { ...prev };
      targets.forEach(({ row }) => { next[row.providerId] = { testing: true, ok: null, message: '' }; });
      return next;
    });
    await Promise.all(
      targets.map(async ({ row }) => {
        try {
          const result = await desktopApi.testModelConnection(
            row.provider.apiFlavor || 'openai-compatible',
            row.provider.apiBase,
            row.provider.apiKey,
            row.model.name,
          );
          setTestStates((prev) => ({
            ...prev,
            [row.providerId]: { testing: false, ok: result.success, message: result.message, latencyMs: result.latencyMs },
          }));
        } catch (e) {
          setTestStates((prev) => ({
            ...prev,
            [row.providerId]: { testing: false, ok: false, message: e instanceof Error ? e.message : String(e) },
          }));
        }
      }),
    );
  };

  const handleChange = (providerId: string, patch: ModelPatch) => {
    const existing = pendingEdits.get(providerId) ?? {};
    const merged = { ...existing, ...patch };
    if (patch.supportsReasoning === false) {
      merged.supportsReasoningEffort = false;
      merged.defaultReasoningEffort = undefined;
    }
    onChange(providerId, merged);
  };

  const renderCellSwitch = (
    row: SourceRow,
    key: keyof ModelPatch &
      ('supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode'),
  ) => {
    const m = applyPatch(row.model, pendingEdits.get(row.providerId));
    const val = m[key] as boolean | undefined;
    const disabled = key === 'supportsReasoningEffort' && !m.supportsReasoning;
    return <Switch checked={!!val} onChange={(v) => handleChange(row.providerId, { [key]: v })} disabled={disabled} />;
  };

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--border-neutral-l1)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--bg-overlay-l1)',
          borderBottom: '1px solid var(--border-neutral-l1)',
        }}
      >
        <span style={{ fontSize: 'var(--body-base-font-size)', fontWeight: 500 }}>各来源参数</span>
        <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginLeft: 8 }}>
          ({rows.length} 个可编辑来源)
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="sm" icon={Play} onClick={handleTestAll} disabled={rows.length === 0}>
            一键测试所有
          </Button>
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 50px 50px 52px 80px 50px 50px 80px 80px 100px 40px',
              alignItems: 'center',
              padding: '6px 14px',
              background: 'var(--bg-overlay-l2)',
              borderBottom: '1px solid var(--border-neutral-l1)',
              fontSize: 'var(--body-xs-font-size)',
              color: 'var(--text-tertiary)',
              fontWeight: 500,
            }}
          >
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

          {rows.map((row) => {
            const m = applyPatch(row.model, pendingEdits.get(row.providerId));
            const hasPatch = pendingEdits.has(row.providerId);
            const test = testStates[row.providerId];
            return (
              <div
                key={row.providerId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px 50px 52px 80px 50px 50px 80px 80px 100px 40px',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  background: hasPatch ? 'rgba(245,158,11,0.06)' : 'transparent',
                  transition: 'background .2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProviderLogo providerId={row.provider.id} name={row.provider.name} size={20} />
                  <button
                    type="button"
                    onClick={() => navigate(`/providers/${row.provider.id}`)}
                    title="跳转到该供应商页面"
                    style={{
                      fontSize: 'var(--body-sm-font-size)',
                      fontWeight: 500,
                      color: 'var(--text-brand)',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textDecoration: 'underline',
                      textDecorationColor: 'var(--border-neutral-l1)',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--bg-brand)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-brand)'; }}
                  >
                    {row.provider.name}
                  </button>
                  <button
                    type="button"
                    title={test?.message ? test.message : '测试该供应商模型的连通性'}
                    onClick={() => handleTest(row)}
                    disabled={test?.testing}
                    style={{
                      width: 24,
                      height: 24,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'none',
                      border: 'none',
                      borderRadius: 6,
                      cursor: test?.testing ? 'wait' : 'pointer',
                      color:
                        test?.ok === true
                          ? 'var(--status-success-default)'
                          : test?.ok === false
                            ? 'var(--status-error-default)'
                            : 'var(--text-tertiary)',
                      fontSize: 'var(--body-xs-font-size)',
                      flexShrink: 0,
                    }}
                  >
                    {test?.testing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : test?.ok === true ? (
                      <CircleCheck size={13} />
                    ) : test?.ok === false ? (
                      <CircleX size={13} />
                    ) : (
                      <PlugZap size={13} />
                    )}
                  </button>
                  {test?.ok != null && !test.testing && (
                    <span
                      style={{
                        fontSize: 'var(--body-xs-font-size)',
                        color: test.ok ? 'var(--status-success-default)' : 'var(--status-error-default)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 140,
                      }}
                    >
                      {test.message}
                    </span>
                  )}
                  {hasPatch && (
                    <span
                      style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--bg-brand)', marginLeft: 4 }}
                    />
                  )}
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsVision')}</div>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  {renderCellSwitch(row, 'supportsReasoning')}
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  {renderCellSwitch(row, 'supportsReasoningEffort')}
                </div>
                <div>
                  <Dropdown
                    options={REASONING_OPTS}
                    value={m.defaultReasoningEffort ?? ''}
                    onChange={(v) =>
                      handleChange(row.providerId, {
                        defaultReasoningEffort: (v || undefined) as 'low' | 'medium' | 'high',
                      })
                    }
                    placeholder="—"
                    disabled={!m.supportsReasoning || !m.supportsReasoningEffort}
                    size="sm"
                  />
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>
                  {renderCellSwitch(row, 'supportsToolCalls')}
                </div>
                <div style={{ display: 'grid', placeItems: 'center' }}>{renderCellSwitch(row, 'supportsJsonMode')}</div>
                <div>
                  <input
                    type="number"
                    value={m.contextWindow ?? ''}
                    onChange={(e) =>
                      handleChange(row.providerId, {
                        contextWindow: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="—"
                    style={cellInputStyle}
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={m.maxOutputTokens ?? ''}
                    onChange={(e) =>
                      handleChange(row.providerId, {
                        maxOutputTokens: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
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
                    width: 28,
                    height: 28,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                    justifySelf: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}

        </div>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          open={!!confirmRemove}
          title="从此供应商移除模型?"
          message="该模型将从该供应商配置中移除，聚合路由可能受影响。"
          confirmLabel="移除"
          variant="danger"
          onConfirm={() => {
            onRemoveModel(confirmRemove);
            setConfirmRemove(null);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
};
