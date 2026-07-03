import { useState } from 'react';
import { useAggregationStore } from '../../store/aggregationStore';
import { Tag } from '../../components/ui';
import { Pencil, Trash2 } from 'lucide-react';

const priorityTag: Record<string, 'brand' | 'blue' | 'neutral'> = {
  'P0': 'brand', 'P1': 'blue', 'P2': 'neutral',
};

const statusLabel: Record<string, string> = { 'true': '启用', 'false': '停用' };

export const AggregationTable: React.FC = () => {
  const { aggregations, updateAggregation, removeAggregation } = useAggregationStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStrategy, setEditStrategy] = useState('');

  const startEdit = (id: string) => {
    const agg = aggregations.find(a => a.id === id);
    if (agg) {
      setEditingId(id);
      setEditName(agg.name);
      setEditStrategy(agg.strategy);
    }
  };

  const saveEdit = async () => {
    if (editingId) {
      try {
        await updateAggregation(editingId, { name: editName, strategy: editStrategy });
        setEditingId(null);
      } catch (e) {
        console.error('Failed to save aggregation:', e);
      }
    }
  };

  return (
    <div className="mc-section" style={{ marginBottom: 'var(--spacer-32)' }}>
      <h3 className="mc-section__title" style={{
        fontFamily: 'var(--heading-sm-font-family)', fontSize: 'var(--heading-sm-font-size)',
        fontWeight: 'var(--heading-sm-font-weight)', lineHeight: 'var(--heading-sm-line-height)',
        color: 'var(--text-default)', margin: '0 0 var(--spacer-16) 0',
      }}>
        模型聚合规则
      </h3>

      <div className="mc-table-wrapper" style={{
        background: 'var(--bg-base-secondary)', border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)', overflow: 'hidden',
      }}>
        <table className="mc-table" style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 'var(--body-base-font-size)', lineHeight: 'var(--body-base-line-height)',
        }}>
          <thead>
            <tr style={{ background: 'var(--bg-overlay-l1)' }}>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>聚合名称</th>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>包含模型</th>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>路由策略</th>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>优先级</th>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>状态</th>
              <th style={{ padding: 'var(--spacer-10) var(--spacer-16)', textAlign: 'left', fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--body-sm-strong-font-weight)', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-neutral-l1)', whiteSpace: 'nowrap' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {aggregations.map(a => (
              <tr key={a.id}>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', color: 'var(--text-default)', fontWeight: 'var(--body-base-strong-font-weight)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  {editingId === a.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      style={{
                        height: 28, padding: '0 var(--spacer-8)',
                        borderRadius: 'var(--radius-6)', border: '1px solid var(--border-brand)',
                        background: 'var(--bg-white)', color: 'var(--text-default)',
                        fontSize: 'var(--body-sm-font-size)', outline: 'none', width: 120,
                      }}
                    />
                  ) : a.name}
                </td>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-neutral-l1)' }}>{a.models}</td>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  {editingId === a.id ? (
                    <select
                      value={editStrategy}
                      onChange={e => setEditStrategy(e.target.value)}
                      style={{
                        height: 28, padding: '0 var(--spacer-8)',
                        borderRadius: 'var(--radius-6)', border: '1px solid var(--border-neutral-l1)',
                        background: 'var(--bg-white)', color: 'var(--text-default)',
                        fontSize: 'var(--body-sm-font-size)', outline: 'none',
                      }}
                    >
                      <option value="轮询 (Round Robin)">轮询 (Round Robin)</option>
                      <option value="最低延迟">最低延迟</option>
                      <option value="随机">随机</option>
                      <option value="顺序">顺序</option>
                    </select>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>{a.strategy}</span>
                  )}
                </td>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  <Tag variant={priorityTag[a.priority] || 'neutral'} style={{ border: 'none' }}>{a.priority}</Tag>
                </td>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  <Tag variant={a.enabled ? 'success' : 'neutral'} style={{ border: 'none' }}>{statusLabel[String(a.enabled)]}</Tag>
                </td>
                <td style={{ padding: 'var(--spacer-12) var(--spacer-16)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-4)' }}>
                    {editingId === a.id ? (
                      <>
                        <button onClick={saveEdit} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          height: 28, padding: '0 var(--spacer-10)',
                          borderRadius: 'var(--radius-6)', border: 'none',
                          background: 'var(--bg-brand)', color: 'var(--text-onbrand)',
                          cursor: 'pointer', fontSize: 'var(--body-xs-font-size)',
                        }}>保存</button>
                        <button onClick={() => setEditingId(null)} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          height: 28, padding: '0 var(--spacer-10)',
                          borderRadius: 'var(--radius-6)', border: '1px solid var(--border-neutral-l1)',
                          background: 'transparent', color: 'var(--text-secondary)',
                          cursor: 'pointer', fontSize: 'var(--body-xs-font-size)',
                        }}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="mc-icon-btn" title="编辑" onClick={() => startEdit(a.id)} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: 'var(--radius-6)',
                          border: 'none', background: 'transparent', color: 'var(--icon-tertiary)', cursor: 'pointer',
                        }}>
                          <Pencil size={14} />
                        </button>
                        <button className="mc-icon-btn mc-icon-btn--danger" title="删除" onClick={async () => {
                          try { await removeAggregation(a.id); } catch (e) { console.error('Failed to remove aggregation:', e); }
                        }} style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: 'var(--radius-6)',
                          border: 'none', background: 'transparent', color: 'var(--icon-tertiary)', cursor: 'pointer',
                        }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};