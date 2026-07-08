import { useEffect, useRef } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Card, Tag, FlexBetween, Skeleton } from '../../components/ui';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

const modelTagStyle: Record<string, { variant: 'brand' | 'green' | 'danger'; customColor?: string }> = {
  'GPT-4o': { variant: 'brand' },
  'Claude 3.5': { variant: 'green', customColor: 'var(--viz-series-coral)' },
  'DeepSeek V3': { variant: 'green', customColor: 'var(--accent-teal)' },
  'Qwen 2.5': { variant: 'green', customColor: 'var(--accent-amber)' },
};

export const RecentRequests: React.FC = () => {
  const recentRequests = useStatsStore(s => s.recentRequests);
  const loading = useStatsStore(s => s.requestsLoading);
  const error = useStatsStore(s => s.requestsError);
  const fetchRequests = useStatsStore(s => s.fetchRequests);
  const page = useStatsStore(s => s.page);
  const pageSize = useSettingsStore(s => s.settings.pageSize);
  const timeFormat = useSettingsStore(s => s.settings.timeFormat);
  const setPage = useStatsStore(s => s.setPage);
  const prevLength = useRef(recentRequests.length);

  // Track new rows for animation
  const newRowIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (recentRequests.length > prevLength.current) {
      // New rows added — mark them
      const newIds = recentRequests.slice(0, recentRequests.length - prevLength.current).map(r => r.id);
      newIds.forEach(id => newRowIds.current.add(id));
      const timer = setTimeout(() => newRowIds.current.clear(), 600);
      prevLength.current = recentRequests.length;
      return () => clearTimeout(timer);
    }
    prevLength.current = recentRequests.length;
  }, [recentRequests.length]);

  const totalPages = Math.max(1, Math.ceil(recentRequests.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = recentRequests.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const formatTimestamp = (timestamp: string) => {
    if (timeFormat === '24h') return timestamp;
    const parsed = new Date(timestamp.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) return timestamp;
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  // Loading skeleton
  if (loading && recentRequests.length === 0) {
    return (
      <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
        <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
          <Skeleton width={120} height={18} />
        </FlexBetween>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--spacer-12)', padding: 'var(--spacer-8) 0' }}>
              <Skeleton width={80} height={14} />
              <Skeleton width={100} height={14} />
              <Skeleton width={60} height={14} />
              <div style={{ flex: 1 }} />
              <Skeleton width={40} height={14} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // Error state
  if (error && recentRequests.length === 0) {
    return (
      <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
        <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
          <span style={{ fontSize: 'var(--heading-xs-font-size)', fontWeight: 'var(--heading-xs-font-weight)', color: 'var(--text-default)' }}>
            近期调用记录
          </span>
        </FlexBetween>
        <div style={{ padding: 'var(--spacer-32) 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <span style={{ color: 'var(--status-error-default)', fontSize: 'var(--body-base-font-size)' }}>
            加载失败
          </span>
          <div style={{ marginTop: 'var(--spacer-8)' }}>
            <button
              onClick={fetchRequests}
              style={{
                cursor: 'pointer', border: 'none', background: 'transparent',
                color: 'var(--text-brand)', fontSize: 'var(--body-sm-font-size)', fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 4, display: 'inline' }} />
              重试
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
        <div style={{
          fontSize: 'var(--heading-xs-font-size)', fontWeight: 'var(--heading-xs-font-weight)',
          color: 'var(--text-default)', lineHeight: 'var(--heading-xs-line-height)',
        }}>
          近期调用记录
          {recentRequests.length > 0 && (
            <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', marginLeft: 'var(--spacer-8)', fontWeight: 400 }}>
              ({recentRequests.length} 条)
            </span>
          )}
        </div>
      </FlexBetween>

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
                {paged.map((req, idx) => {
                  const ts = modelTagStyle[req.model];
                  const isNewRow = newRowIds.current.has(req.id);
                  return (
                    <tr
                      key={req.id}
                      style={{
                        transition: 'background var(--transition-fast, 0.12s) ease, opacity 0.3s ease',
                        animation: isNewRow ? 'slideInUp 0.25s ease-out both' : 'none',
                        animationDelay: isNewRow ? `${idx * 30}ms` : '0ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', fontFamily: 'var(--code-terminal-font-family)', fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>{formatTimestamp(req.timestamp)}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        <Tag variant={ts?.variant ?? 'brand'} style={ts?.customColor ? { background: 'var(--bg-overlay-l1)', color: ts.customColor, border: 'none' } : { border: 'none' }}>{req.model}</Tag>
                      </td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', color: 'var(--text-secondary)' }}>{req.type}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)', color: 'var(--text-default)' }}>{req.tokens.toLocaleString()}</td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        <Tag variant={req.status === 'success' || req.status === 'streaming' ? 'success' : 'danger'} style={{ border: 'none' }}>{req.status === 'success' || req.status === 'streaming' ? '成功' : '失败'}</Tag>
                      </td>
                      <td style={{ padding: 'var(--spacer-12) var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)' }}>{(req.latencyMs / 1000).toFixed(2)}s</td>
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
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                style={{
                  minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', color: safePage === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                  font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease',
                }}
                onMouseEnter={e => { if (safePage !== 0) e.currentTarget.style.background = 'var(--bg-overlay-l2)'; }}
                onMouseLeave={e => { if (safePage !== 0) e.currentTarget.style.background = 'transparent'; }}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  style={{
                    minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: i === safePage ? 'var(--bg-overlay-l3)' : 'transparent',
                    color: i === safePage ? 'var(--text-default)' : 'var(--text-secondary)',
                    border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                    font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: 'pointer',
                    transition: 'background var(--transition-fast, 0.12s) ease',
                  }}
                  onMouseEnter={e => { if (i !== safePage) e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
                  onMouseLeave={e => { if (i !== safePage) e.currentTarget.style.background = 'transparent'; }}
                >
                  {i + 1}
                </button>
              ))}
              <button
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(safePage + 1)}
                style={{
                  minWidth: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', color: safePage >= totalPages - 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)', borderRadius: 'var(--radius-8)',
                  font: 'inherit', fontSize: 'var(--body-base-font-size)', cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease',
                }}
                onMouseEnter={e => { if (safePage < totalPages - 1) e.currentTarget.style.background = 'var(--bg-overlay-l2)'; }}
                onMouseLeave={e => { if (safePage < totalPages - 1) e.currentTarget.style.background = 'transparent'; }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};
