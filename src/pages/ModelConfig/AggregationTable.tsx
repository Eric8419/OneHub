import { Fragment, useState } from 'react';
import { useAggregationStore } from '../../store/aggregationStore';
import { Card, SectionTitle, Tag, Switch, ConfirmDialog, FlexRow } from '../../components/ui';
import { Pencil, Trash2, List, Shuffle, Pin } from 'lucide-react';
import { normalizeStrategyKey } from '../../types/aggregation';
import type { RouteTarget } from '../../types/aggregation';
import { useT } from '../../i18n';

const priorityTag: Record<string, 'brand' | 'blue' | 'neutral'> = {
  P0: 'brand',
  P1: 'blue',
  P2: 'neutral',
};

export const AggregationTable: React.FC = () => {
  const t = useT();
  const { aggregations, updateAggregation, removeAggregation } = useAggregationStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRoundRobin, setEditRoundRobin] = useState(true);
  const [editTargets, setEditTargets] = useState<RouteTarget[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startEdit = (id: string) => {
    const agg = aggregations.find((a) => a.id === id);
    if (agg) {
      setEditingId(id);
      setEditName(agg.name);
      // ON = round-robin, OFF = sequential (failover).
      setEditRoundRobin(normalizeStrategyKey(agg.strategy) !== 'sequential');
      setEditTargets(agg.targets?.map((target) => ({ ...target })) ?? []);
    }
  };

  const saveEdit = async () => {
    if (editingId) {
      try {
        await updateAggregation(editingId, {
          name: editName,
          strategy: editRoundRobin ? 'round-robin' : 'sequential',
          targets: editTargets,
        });
        setEditingId(null);
      } catch (e) {
        console.error('Failed to save aggregation:', e);
      }
    }
  };

  const patchTarget = (id: string, patch: Partial<RouteTarget>) => {
    setEditTargets((targets) => targets.map((target) => (target.id === id ? { ...target, ...patch } : target)));
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await updateAggregation(id, { enabled: !enabled });
    } catch (e) {
      console.error('Failed to toggle aggregation:', e);
    }
  };

  const handleDelete = async () => {
    if (confirmDelete) {
      try {
        await removeAggregation(confirmDelete);
        setConfirmDelete(null);
      } catch (e) {
        console.error('Failed to remove aggregation:', e);
      }
    }
  };

  return (
    <div className="mc-section" style={{ marginBottom: 'var(--spacer-32)' }}>
      <SectionTitle>模型聚合规则</SectionTitle>

      {aggregations.length === 0 ? (
        <Card padding="var(--spacer-32) var(--spacer-24)">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacer-12)',
              color: 'var(--text-tertiary)',
            }}
          >
            <List size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-secondary)' }}>暂无聚合规则</span>
            <span style={{ fontSize: 'var(--body-sm-font-size)' }}>
              添加提供商和模型后，可在快速添加面板创建聚合规则
            </span>
          </div>
        </Card>
      ) : (
        <Card padding="0" style={{ overflow: 'hidden' }}>
          <table
            className="mc-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--body-base-font-size)',
              lineHeight: 'var(--body-base-line-height)',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--bg-overlay-l1)' }}>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  聚合名称
                </th>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  上游目标
                </th>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('routing.mode.label')}
                </th>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  优先级
                </th>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  状态
                </th>
                <th
                  style={{
                    padding: 'var(--spacer-10) var(--spacer-16)',
                    textAlign: 'left',
                    fontSize: 'var(--body-sm-font-size)',
                    fontWeight: 'var(--body-sm-strong-font-weight)',
                    color: 'var(--text-tertiary)',
                    borderBottom: '1px solid var(--border-neutral-l1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {aggregations.map((a, idx) => (
                <Fragment key={a.id}>
                  <tr
                    className="mc-aggregation-row"
                    style={{
                      background: idx % 2 === 0 ? 'transparent' : 'var(--bg-overlay-l1)',
                      transition: 'background var(--transition-fast, 0.12s ease)',
                      animation: `slideInUp 0.2s ease-out both`,
                      animationDelay: `${idx * 30}ms`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-overlay-l2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--bg-overlay-l1)';
                    }}
                  >
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        color: 'var(--text-default)',
                        fontWeight: 'var(--body-base-strong-font-weight)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      {editingId === a.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{
                            height: 28,
                            padding: '0 var(--spacer-8)',
                            borderRadius: 'var(--radius-6)',
                            border: '1px solid var(--border-brand)',
                            background: 'var(--bg-white)',
                            color: 'var(--text-default)',
                            fontSize: 'var(--body-sm-font-size)',
                            outline: 'none',
                            width: 120,
                          }}
                        />
                      ) : (
                        a.name
                      )}
                    </td>
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        color: 'var(--text-secondary)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      {a.targets?.length ? (
                        <div style={{ display: 'flex', gap: 'var(--spacer-4)', flexWrap: 'wrap' }}>
                          {a.targets.map((target) => (
                            <Tag key={target.id} variant="neutral">
                              {target.model} · {target.protocol ?? '继承供应商'}
                            </Tag>
                          ))}
                        </div>
                      ) : (
                        a.models
                      )}
                    </td>
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      {editingId === a.id ? (
                        <FlexRow gap="var(--spacer-10)">
                          <Switch
                            checked={editRoundRobin}
                            onChange={setEditRoundRobin}
                          />
                          <span
                            style={{
                              fontSize: 'var(--body-sm-font-size)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {editRoundRobin ? t('routing.mode.roundRobin') : t('routing.mode.failover')}
                          </span>
                        </FlexRow>
                      ) : (
                        <FlexRow gap="var(--spacer-8)">
                          {normalizeStrategyKey(a.strategy) !== 'sequential' ? (
                            <>
                              <Shuffle size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--body-sm-font-size)' }}>
                                {t('routing.mode.roundRobin')}
                              </span>
                            </>
                          ) : (
                            <>
                              <Pin size={14} style={{ color: 'var(--icon-tertiary)', flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--body-sm-font-size)' }}>
                                {t('routing.mode.failover')}
                              </span>
                            </>
                          )}
                        </FlexRow>
                      )}
                    </td>
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      <Tag variant={priorityTag[a.priority] || 'neutral'} style={{ border: 'none' }}>
                        {a.priority}
                      </Tag>
                    </td>
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      <Switch checked={a.enabled} onChange={() => handleToggle(a.id, a.enabled)} />
                    </td>
                    <td
                      style={{
                        padding: 'var(--spacer-12) var(--spacer-16)',
                        borderBottom: '1px solid var(--border-neutral-l1)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
                        {editingId === a.id ? (
                          <>
                            <button
                              onClick={saveEdit}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: 28,
                                padding: '0 var(--spacer-10)',
                                borderRadius: 'var(--radius-6)',
                                border: 'none',
                                background: 'var(--bg-brand)',
                                color: 'var(--text-onbrand)',
                                cursor: 'pointer',
                                fontSize: 'var(--body-xs-font-size)',
                                fontFamily: 'inherit',
                                transition: 'background var(--transition-fast, 0.12s ease)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-brand-hover)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--bg-brand)';
                              }}
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                height: 28,
                                padding: '0 var(--spacer-10)',
                                borderRadius: 'var(--radius-6)',
                                border: '1px solid var(--border-neutral-l1)',
                                background: 'transparent',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                fontSize: 'var(--body-xs-font-size)',
                                fontFamily: 'inherit',
                                transition: 'background var(--transition-fast, 0.12s ease)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              取消
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="mc-icon-btn"
                              title="编辑"
                              onClick={() => startEdit(a.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 'var(--radius-6)',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--icon-tertiary)',
                                cursor: 'pointer',
                                transition:
                                  'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                                e.currentTarget.style.color = 'var(--icon-default)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--icon-tertiary)';
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="mc-icon-btn mc-icon-btn--danger"
                              title="删除"
                              onClick={() => setConfirmDelete(a.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 28,
                                height: 28,
                                borderRadius: 'var(--radius-6)',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--icon-tertiary)',
                                cursor: 'pointer',
                                transition:
                                  'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--status-error-surface-l1)';
                                e.currentTarget.style.color = 'var(--status-error-default)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--icon-tertiary)';
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === a.id && editTargets.length > 0 && (
                    <tr className="mc-target-policy-row">
                      <td colSpan={6}>
                        <div className="mc-target-policy">
                          <div className="mc-target-policy__header">
                            <span>目标</span>
                            <span>协议</span>
                            <span>优先级</span>
                            <span>权重</span>
                            <span>超时（秒）</span>
                            <span>重试</span>
                            <span>启用</span>
                          </div>
                          {editTargets.map((target) => (
                            <div className="mc-target-policy__item" key={target.id}>
                              <span title={target.providerId}>{target.model}</span>
                              <select
                                className="mc-input"
                                value={target.protocol ?? 'openai-chat'}
                                onChange={(event) =>
                                  patchTarget(target.id, {
                                    protocol: event.target.value as RouteTarget['protocol'],
                                  })
                                }
                              >
                                <option value="openai-chat">OpenAI Chat</option>
                                <option value="anthropic-messages">Anthropic</option>
                                <option value="openai-responses">Responses</option>
                              </select>
                              <input
                                className="mc-input"
                                type="number"
                                value={target.priority}
                                onChange={(event) => patchTarget(target.id, { priority: Number(event.target.value) })}
                              />
                              <input
                                className="mc-input"
                                type="number"
                                min={1}
                                value={target.weight}
                                onChange={(event) =>
                                  patchTarget(target.id, { weight: Math.max(1, Number(event.target.value)) })
                                }
                              />
                              <input
                                className="mc-input"
                                type="number"
                                min={1}
                                value={target.timeoutSecs ?? ''}
                                placeholder="全局"
                                onChange={(event) =>
                                  patchTarget(target.id, {
                                    timeoutSecs: event.target.value ? Number(event.target.value) : undefined,
                                  })
                                }
                              />
                              <input
                                className="mc-input"
                                type="number"
                                min={0}
                                value={target.maxRetries ?? ''}
                                placeholder="全局"
                                onChange={(event) =>
                                  patchTarget(target.id, {
                                    maxRetries: event.target.value ? Number(event.target.value) : undefined,
                                  })
                                }
                              />
                              <Switch
                                checked={target.enabled}
                                onChange={(enabled) => patchTarget(target.id, { enabled })}
                              />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="删除聚合规则"
        message={confirmDelete ? `确定删除该聚合规则？此操作不可撤销。` : ''}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
