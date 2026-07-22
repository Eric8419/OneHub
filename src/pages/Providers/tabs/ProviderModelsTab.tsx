import React, { useState, useCallback, useMemo } from 'react';
import { Switch } from '../../../components/ui/Switch';
import { Button } from '../../../components/ui/Button';
import { Dropdown } from '../../../components/ui/Dropdown';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { toast } from '../../../components/ui/Toast';
import { desktopApi } from '../../../lib/desktopApi';
import { Plus, Trash2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import type { Model } from '../../../types/provider';

const inputBaseStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  borderRadius: 6,
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  color: 'var(--text-default)',
  font: 'inherit',
  fontSize: 'var(--body-sm-font-size)',
  outline: 'none',
  boxSizing: 'border-box',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 'var(--body-sm-font-size)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

interface ProviderModelsTabProps {
  models: Model[];
  apiBase: string;
  apiKey: string;
  apiFlavor: string;
  onModelsChange: (models: Model[]) => void;
}

type BulkCapKey = 'supportsVision' | 'supportsReasoning' | 'supportsReasoningEffort' | 'supportsToolCalls' | 'supportsJsonMode';

const BULK_CAPS: { key: BulkCapKey; label: string }[] = [
  { key: 'supportsVision', label: '视觉' },
  { key: 'supportsReasoning', label: '思考' },
  { key: 'supportsReasoningEffort', label: '思考强度' },
  { key: 'supportsToolCalls', label: '工具调用' },
  { key: 'supportsJsonMode', label: 'JSON模式' },
];

const REASONING_EFFORT_OPTS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

function formatTokens(n?: number): string {
  if (!n) return '';
  if (n >= 128000) return `${Math.round(n / 1024)}k`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function modelIdFromName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
    `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const ProviderModelsTab: React.FC<ProviderModelsTabProps> = ({
  models,
  apiBase,
  apiKey,
  apiFlavor,
  onModelsChange,
}) => {
  const [newModelName, setNewModelName] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [bulkPopoverOpen, setBulkPopoverOpen] = useState(false);
  const [bulkValues, setBulkValues] = useState<Record<BulkCapKey, boolean | null>>({
    supportsVision: null, supportsReasoning: null, supportsReasoningEffort: null, supportsToolCalls: null, supportsJsonMode: null,
  });
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'row' | 'bulk'; ids: string[] } | null>(null);

  const updateModel = useCallback((id: string, patch: Partial<Model>) => {
    onModelsChange(models.map(m => {
      if (m.id !== id) return m;
      const next = { ...m, ...patch };
      if (patch.supportsReasoning === false) {
        next.supportsReasoningEffort = false;
        next.defaultReasoningEffort = undefined;
      }
      if (patch.supportsReasoningEffort === false) {
        next.defaultReasoningEffort = undefined;
      }
      return next;
    }));
  }, [models, onModelsChange]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === models.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(models.map(m => m.id)));
  };

  const addModel = () => {
    const name = newModelName.trim();
    if (!name) return;
    if (models.some(m => m.name.toLowerCase() === name.toLowerCase())) {
      toast(`模型「${name}」已在列表中`, 'info');
      return;
    }
    const newModel: Model = {
      id: modelIdFromName(name),
      name,
      supportsVision: false,
      supportsReasoning: false,
      supportsReasoningEffort: false,
    };
    onModelsChange([...models, newModel]);
    setNewModelName('');
  };

  const handleDelete = (ids: string[]) => {
    onModelsChange(models.filter(m => !ids.includes(m.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    setConfirmDelete(null);
  };

  const fetchRemoteModels = async () => {
    setFetchingRemote(true);
    try {
      const result = await desktopApi.fetchProviderModels(apiFlavor || 'openai-compatible', apiBase, apiKey);
      if (result.success) {
        setRemoteModels(result.models.map(m => m.name));
      } else {
        toast(`拉取模型失败: ${result.message}`, 'error');
      }
    } catch (e) {
      toast(`拉取模型失败: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setFetchingRemote(false);
    }
  };

  const addRemoteModel = (name: string) => {
    if (models.some(m => m.name.toLowerCase() === name.toLowerCase())) return;
    const newModel: Model = {
      id: modelIdFromName(name),
      name,
      supportsVision: false,
      supportsReasoning: false,
      supportsReasoningEffort: false,
    };
    onModelsChange([...models, newModel]);
  };

  const addAllRemote = () => {
    const toAdd = remoteModels.filter(n => !models.some(m => m.name.toLowerCase() === n.toLowerCase()));
    if (!toAdd.length) return;
    const newModels = toAdd.map((name) => ({
      id: modelIdFromName(name),
      name,
      supportsVision: false,
      supportsReasoning: false,
      supportsReasoningEffort: false,
    }));
    onModelsChange([...models, ...newModels]);
  };

  const applyBulkCaps = () => {
    const patch: Partial<Model> = {};
    (Object.entries(bulkValues) as [BulkCapKey, boolean | null][]).forEach(([k, v]) => {
      if (v !== null) (patch as Record<string, unknown>)[k] = v;
    });
    if (Object.keys(patch).length === 0) { setBulkPopoverOpen(false); return; }
    if (patch.supportsReasoning === false) {
      patch.supportsReasoningEffort = false;
      patch.defaultReasoningEffort = undefined;
    }
    onModelsChange(models.map(m => selectedIds.has(m.id) ? { ...m, ...patch } : m));
    setBulkValues({ supportsVision: null, supportsReasoning: null, supportsReasoningEffort: null, supportsToolCalls: null, supportsJsonMode: null });
    setBulkPopoverOpen(false);
  };

  const allSelected = models.length > 0 && selectedIds.size === models.length;
  const addedRemoteSet = useMemo(() => new Set(models.map(m => m.name.toLowerCase())), [models]);
  const filteredRemote = remoteModels.filter(n => !addedRemoteSet.has(n.toLowerCase()));

  return (
    <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: 'var(--bg-overlay-l1)',
        border: '1px solid var(--border-neutral-l1)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', flex: 1 }}>
          {apiFlavor === 'anthropic'
            ? 'Anthropic 接口不支持模型列表端点，请手动添加模型'
            : apiFlavor === 'openai-compatible' || !apiFlavor
              ? 'OpenAI 兼容接口会请求 /models 端点获取可用模型列表'
              : 'Responses API 会请求 /models 端点获取可用模型列表'}
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={RefreshCw}
          loading={fetchingRemote}
          onClick={fetchRemoteModels}
          disabled={apiFlavor === 'anthropic'}
        >
          拉取模型
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addModel(); }}
          placeholder="手动添加模型名称，如 gpt-4o"
          style={{ ...inputBaseStyle, flex: 1, height: 34 }}
        />
        <Button variant="primary" size="sm" icon={Plus} onClick={addModel}>添加</Button>
      </div>

      {filteredRemote.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filteredRemote.map(name => (
              <button
                key={name}
                type="button"
                onClick={() => addRemoteModel(name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px dashed var(--border-neutral-l1)',
                  background: 'var(--bg-overlay-l1)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--body-sm-font-size)',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
              >
                <Plus size={12} />
                <span style={{ fontFamily: 'var(--font-family-mono)' }}>{name}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={addAllRemote} style={{ alignSelf: 'flex-start' }}>
            全部加入
          </Button>
        </div>
      )}

      <div style={{
        borderRadius: 10,
        border: '1px solid var(--border-neutral-l1)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          background: 'var(--bg-overlay-l1)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          gap: 8,
        }}>
          <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 500 }}>
            已添加模型
          </span>
          <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>({models.length})</span>
          {selectedIds.size > 0 && (
            <>
              <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--bg-brand)', marginLeft: 4 }}>
                已选 {selectedIds.size}
              </span>
              <div style={{ position: 'relative', marginLeft: 'auto' }}>
                <Button variant="secondary" size="sm" onClick={() => setBulkPopoverOpen(!bulkPopoverOpen)}>
                  批量设置能力 ▾
                </Button>
                {bulkPopoverOpen && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-neutral-l1)',
                    borderRadius: 10, padding: 12, minWidth: 200, boxShadow: 'var(--shadow-floating)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {BULK_CAPS.map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: 'var(--body-sm-font-size)' }}>{label}</span>
                          <Switch
                            checked={bulkValues[key] === true}
                            indeterminate={bulkValues[key] === null}
                            onChange={(v: boolean) => setBulkValues(prev => ({ ...prev, [key]: v ? true : false }))}
                          />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Button size="sm" variant="secondary" onClick={() => setBulkPopoverOpen(false)} style={{ flex: 1 }}>取消</Button>
                      <Button size="sm" variant="primary" onClick={applyBulkCaps} style={{ flex: 1 }}>应用</Button>
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={Trash2}
                onClick={() => setConfirmDelete({ type: 'bulk', ids: Array.from(selectedIds) })}
              >
                删除
              </Button>
            </>
          )}
        </div>

        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 80px 80px 40px 40px 40px 40px 40px 36px',
            alignItems: 'center',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-neutral-l1)',
            background: 'var(--bg-overlay-l2)',
            fontSize: 'var(--body-xs-font-size)',
            color: 'var(--text-tertiary)',
            fontWeight: 500,
          }}>
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ margin: 0 }} />
            <span style={{ ...cellStyle, justifyContent: 'flex-start', padding: '0 8px' }}>模型名称</span>
            <span style={cellStyle}>上下文</span>
            <span style={cellStyle}>输出</span>
            <span style={cellStyle}>视觉</span>
            <span style={cellStyle}>思考</span>
            <span style={cellStyle}>强度</span>
            <span style={cellStyle}>工具</span>
            <span style={cellStyle}>JSON</span>
            <span></span>
          </div>

          {models.map(m => {
            const isExpanded = expandedIds.has(m.id);
            const isSelected = selectedIds.has(m.id);
            return (
              <React.Fragment key={m.id}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 80px 80px 40px 40px 40px 40px 40px 36px',
                  alignItems: 'center',
                  padding: '4px 12px',
                  borderBottom: '1px solid var(--border-neutral-l1)',
                  background: isSelected ? 'var(--bg-overlay-l1)' : 'transparent',
                }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(m.id)} style={{ margin: 0 }} />
                  <div style={{ ...cellStyle, justifyContent: 'flex-start', gap: 4, overflow: 'hidden' }}>
                    <button type="button" onClick={() => toggleExpand(m.id)} style={{
                      width: 20, height: 20, display: 'grid', placeItems: 'center',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', flexShrink: 0,
                    }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateModel(m.id, { name: e.target.value })}
                      style={{ ...inputBaseStyle, fontFamily: 'var(--font-family-mono)', border: 'none', background: 'transparent', padding: '0 2px', minWidth: 0, flex: 1 }}
                    />
                  </div>
                  <div style={cellStyle}>
                    <input
                      type="number"
                      value={m.contextWindow ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateModel(m.id, { contextWindow: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="-"
                      style={{ ...inputBaseStyle, width: '100%' }}
                    />
                  </div>
                  <div style={cellStyle}>
                    <input
                      type="number"
                      value={m.maxOutputTokens ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateModel(m.id, { maxOutputTokens: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="-"
                      style={{ ...inputBaseStyle, width: '100%' }}
                    />
                  </div>
                  <div style={cellStyle}><Switch checked={!!m.supportsVision} onChange={(v: boolean) => updateModel(m.id, { supportsVision: v })} /></div>
                  <div style={cellStyle}><Switch checked={!!m.supportsReasoning} onChange={(v: boolean) => updateModel(m.id, { supportsReasoning: v })} /></div>
                  <div style={cellStyle}><Switch checked={!!m.supportsReasoningEffort} onChange={(v: boolean) => updateModel(m.id, { supportsReasoningEffort: v })} disabled={!m.supportsReasoning} /></div>
                  <div style={cellStyle}><Switch checked={!!m.supportsToolCalls} onChange={(v: boolean) => updateModel(m.id, { supportsToolCalls: v })} /></div>
                  <div style={cellStyle}><Switch checked={!!m.supportsJsonMode} onChange={(v: boolean) => updateModel(m.id, { supportsJsonMode: v })} /></div>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ type: 'row', ids: [m.id] })}
                    style={{
                      width: 28, height: 28, display: 'grid', placeItems: 'center',
                      background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {isExpanded && (
                  <div style={{
                    padding: '10px 12px 10px 48px',
                    background: 'var(--bg-overlay-l1)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>别名:</label>
                      <input
                        type="text"
                        value={m.alias ?? ''}
                        onChange={(e) => updateModel(m.id, { alias: e.target.value || undefined })}
                        placeholder="留空使用原名"
                        style={{ ...inputBaseStyle, width: 160 }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>默认思考强度:</label>
                      <Dropdown
                        options={REASONING_EFFORT_OPTS}
                        value={m.defaultReasoningEffort ?? ''}
                        onChange={(v: string) => updateModel(m.id, { defaultReasoningEffort: (v || undefined) as 'low' | 'medium' | 'high' | undefined })}
                        placeholder="未设置"
                        size="sm"
                      />
                    </div>
                    {m.contextWindow && (
                      <span style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)' }}>
                        上下文 {formatTokens(m.contextWindow)} · 输出 {formatTokens(m.maxOutputTokens)}
                      </span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {models.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-sm-font-size)' }}>
              暂无模型，请从接口拉取或手动添加
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          open={!!confirmDelete}
          title={confirmDelete.type === 'bulk' ? `删除 ${confirmDelete.ids.length} 个模型?` : '删除模型?'}
          message="删除后将从该供应商中移除这些模型配置，此操作不可撤销。"
          confirmLabel="删除"
          variant="danger"
          onConfirm={() => handleDelete(confirmDelete.ids)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
