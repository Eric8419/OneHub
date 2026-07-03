import { useStatsStore } from '../../store/statsStore';
import { Tag } from '../../components/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const modelTagStyle: Record<string, { variant: 'brand' | 'green' | 'danger'; customColor?: string }> = {
  'GPT-4o': { variant: 'brand' },
  'Claude 3.5': { variant: 'green', customColor: 'var(--viz-series-coral)' },
  'DeepSeek V3': { variant: 'green', customColor: 'var(--accent-teal)' },
  'Qwen 2.5': { variant: 'green', customColor: 'var(--accent-amber)' },
};

export const RecentRequests: React.FC = () => {
  const recentRequests = useStatsStore(s => s.recentRequests);
  const page = useStatsStore(s => s.page);
  const pageSize = useStatsStore(s => s.pageSize);
  const setPage = useStatsStore(s => s.setPage);

  const totalPages = Math.max(1, Math.ceil(recentRequests.length / pageSize));
  const paged = recentRequests.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="ds-card" style={{
      background: 'var(--bg-base-secondary)', border: '1px solid var(--border-neutral-l1)',
      borderRadius: 'var(--radius-12)', padding: 'var(--spacer-16) var(--spacer-20)',
    }}>
      <div style={{
        fontSize: 'var(--heading-xs-font-size)', fontWeight: 'var(--heading-xs-font-weight)',
        color: 'var(--text-default)', lineHeight: 'var(--heading-xs-line-height)',
        marginBottom: 'var(--spacer-16)',
      }}>
        近期调用记录
        {recentRequests.length > 0 && (
          <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', marginLeft: 'var(--spacer-8)', fontWeight: 400 }}>
            ({recentRequests.length} 条)
          </span>
        )}
      </div>

      {recentRequests.length === 0 ? (
        <div style={{ padding: 'var(--spacer-32) 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-base-font-size)' }}>
          暂无调用记录。启动代理并发送请求后将在此显示。
        </div>
      ) : (
        <>
          <div className="ds-table-card" style={{ overflowX: 'auto' }}>
            <table className="ds-table" style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'left', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>时间</th>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'left', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>模型</th>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'left', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>请求类型</th>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>Token用量</th>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'left', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>状态</th>
                  <th style={{ padding: 'var(--spacer-16) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: 'var(--body-md-letter-spacing)' }}>延迟</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(req => {
                  const ts = modelTagStyle[req.model];
                  return (
                    <tr key={req.id}>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', fontFamily: 'var(--code-terminal-font-family)', fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>{req.timestamp}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        <Tag variant={ts?.variant ?? 'brand'} style={ts?.customColor ? { background: 'var(--bg-overlay-l1)', color: ts.customColor, border: 'none' } : { border: 'none' }}>{req.model}</Tag>
                      </td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', color: 'var(--text-secondary)' }}>{req.type}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)', color: 'var(--text-default)' }}>{req.tokens.toLocaleString()}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        <Tag variant={req.status === 'success' ? 'success' : 'danger'} style={{ border: 'none' }}>{req.status === 'success' ? '成功' : '失败'}</Tag>
                      </td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)' }}>{req.latency}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="ds-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacer-4)', marginTop: 'var(--spacer-16)' }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                style={{
                  minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', color: page === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                  font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: page === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  style={{
                    minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: i === page ? 'var(--bg-overlay-l3)' : 'transparent',
                    color: i === page ? 'var(--text-default)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                    font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: 'pointer',
                  }}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                style={{
                  minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', color: page >= totalPages - 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                  font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};