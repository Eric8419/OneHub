import { useEffect, useRef, useState } from 'react';
import { useStatsStore } from '../../store/statsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Card, Tag, FlexBetween, Skeleton, Button } from '../../components/ui';
import { ChevronLeft, ChevronRight, RefreshCw, X, CircleAlert, Copy } from 'lucide-react';
import type { RequestRecord } from '../../types/stats';
import { useT } from '../../i18n';

const modelTagStyle: Record<string, { variant: 'brand' | 'green' | 'danger'; customColor?: string }> = {
  'GPT-4o': { variant: 'brand' },
  'Claude 3.5': { variant: 'green', customColor: 'var(--viz-series-coral)' },
  'DeepSeek V3': { variant: 'green', customColor: 'var(--accent-teal)' },
  'Qwen 2.5': { variant: 'green', customColor: 'var(--accent-amber)' },
};

// 生成窗口化的页码序列（含省略号），避免页数很多时横向撑爆页面。
// 例如共 100 页、当前第 50 页时返回 [0, '…', 48, 49, 50, 51, 52, '…', 99]。
function pageWindow(current: number, total: number, radius = 2): Array<number | '…'> {
  if (total <= 1) return [0];
  const pages = new Set<number>([0, total - 1]);
  for (let i = current - radius; i <= current + radius; i++) {
    if (i >= 0 && i < total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let prev = -1;
  for (const p of sorted) {
    if (prev >= 0 && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

export const RecentRequests: React.FC = () => {
  const t = useT();
  const recentRequests = useStatsStore((s) => s.recentRequests);
  const loading = useStatsStore((s) => s.requestsLoading);
  const error = useStatsStore((s) => s.requestsError);
  const fetchRequests = useStatsStore((s) => s.fetchRequests);
  const page = useStatsStore((s) => s.page);
  const pageSize = useSettingsStore((s) => s.settings.pageSize);
  const setPage = useStatsStore((s) => s.setPage);
  const prevLength = useRef(recentRequests.length);
  const [detailError, setDetailError] = useState<RequestRecord | null>(null);

  // Track new rows for animation
  const newRowIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (recentRequests.length > prevLength.current) {
      // New rows added — mark them
      const newIds = recentRequests.slice(0, recentRequests.length - prevLength.current).map((r) => r.id);
      newIds.forEach((id) => newRowIds.current.add(id));
      const timer = setTimeout(() => newRowIds.current.clear(), 600);
      prevLength.current = recentRequests.length;
      return () => clearTimeout(timer);
    }
    prevLength.current = recentRequests.length;
  }, [recentRequests.length]);

  const totalPages = Math.max(1, Math.ceil(recentRequests.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = recentRequests.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // 后端记录的是 UTC 时间（"YYYY-MM-DD HH:mm:ss"），这里补上时区标记
  // 后转成本地时区显示，避免仪表盘时间比实际慢 8 小时之类的问题。
  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    const iso = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return timestamp;
    const pad = (n: number) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
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
          <span
            style={{
              fontSize: 'var(--heading-xs-font-size)',
              fontWeight: 'var(--heading-xs-font-weight)',
              color: 'var(--text-default)',
            }}
          >
            {t('dashboard.table.title')}
          </span>
        </FlexBetween>
        <div style={{ padding: 'var(--spacer-32) 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <span style={{ color: 'var(--status-error-default)', fontSize: 'var(--body-base-font-size)' }}>{t('dashboard.loadFailed')}</span>
          <div style={{ marginTop: 'var(--spacer-8)' }}>
            <button
              onClick={fetchRequests}
              style={{
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-brand)',
                fontSize: 'var(--body-sm-font-size)',
                fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={12} style={{ marginRight: 4, display: 'inline' }} />
                {t('dashboard.retry')}
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="var(--spacer-16) var(--spacer-20)" style={{ marginBottom: 'var(--spacer-24)' }}>
      <FlexBetween style={{ marginBottom: 'var(--spacer-16)' }}>
        <div
          style={{
            fontSize: 'var(--heading-xs-font-size)',
            fontWeight: 'var(--heading-xs-font-weight)',
            color: 'var(--text-default)',
            lineHeight: 'var(--heading-xs-line-height)',
          }}
        >
          {t('dashboard.table.title')}
          {recentRequests.length > 0 && (
            <span
              style={{
                fontSize: 'var(--body-sm-font-size)',
                color: 'var(--text-tertiary)',
                marginLeft: 'var(--spacer-8)',
                fontWeight: 400,
              }}
            >
              ({recentRequests.length} {t('dashboard.table.count')})
            </span>
          )}
        </div>
      </FlexBetween>

      {recentRequests.length === 0 ? (
        <div
          style={{
            padding: 'var(--spacer-32) 0',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--body-base-font-size)',
          }}
        >
          {t('dashboard.table.noData')}
        </div>
      ) : (
        <>
          <div className="ds-table-card" style={{ overflowX: 'auto' }}>
            <table className="ds-table" style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.time')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.model')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.provider')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.type')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.tokens')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'left',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.status')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                 >
                   {t('dashboard.table.latency')}
                 </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.firstToken')}
                  </th>
                  <th
                    style={{
                      padding: 'var(--spacer-16) var(--spacer-8)',
                      borderBottom: '1px solid var(--border-neutral-l1)',
                      textAlign: 'right',
                      fontSize: 'var(--body-md-font-size)',
                      color: 'var(--text-tertiary)',
                      fontWeight: 'var(--font-weight-medium)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--body-md-letter-spacing)',
                    }}
                  >
                    {t('dashboard.table.speed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.map((req, idx) => {
                  const ts = modelTagStyle[req.model];
                  const isNewRow = newRowIds.current.has(req.id);
                  return (
                    <tr
                      key={req.id}
                      className={isNewRow ? 'rb-recent-request-new' : undefined}
                      style={{
                        transition: 'background var(--transition-fast, 0.12s ease), opacity 0.3s ease',
                        animation: isNewRow ? 'slideInUp 0.25s ease-out both' : 'none',
                        animationDelay: isNewRow ? `${idx * 30}ms` : '0ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          fontFamily: 'var(--code-terminal-font-family)',
                          fontSize: 'var(--body-md-font-size)',
                          color: 'var(--text-default)',
                        }}
                      >
                        {formatTimestamp(req.timestamp)}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                        }}
                      >
                        <Tag
                          variant={ts?.variant ?? 'brand'}
                          style={
                            ts?.customColor
                              ? { background: 'var(--bg-overlay-l1)', color: ts.customColor, border: 'none' }
                              : { border: 'none' }
                          }
                        >
                          {req.model}
                        </Tag>
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <span>{req.provider}</span>
                        {req.failoverCount && req.failoverCount > 0 && (
                          <Tag
                            variant="orange"
                            style={{
                              marginLeft: 'var(--spacer-4)',
                              border: 'none',
                              fontSize: 'var(--body-xs-font-size)',
                            }}
                          >
                            切换×{req.failoverCount}
                          </Tag>
                        )}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {req.type}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                          color: 'var(--text-default)',
                        }}
                      >
                        {req.tokens.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                        }}
                      >
                        {req.status === 'success' || req.status === 'streaming' ? (
                          <Tag
                            variant="success"
                            style={{ border: 'none', cursor: 'default' }}
                          >
                            {t('dashboard.table.success')}
                          </Tag>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDetailError(req)}
                            title="点击查看失败原因"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              border: 'none',
                              background: 'var(--status-error-surface-l1)',
                              color: 'var(--status-error-default)',
                              borderRadius: 'var(--radius-4)',
                              padding: '2px 8px',
                              font: 'inherit',
                              fontSize: 'var(--body-sm-font-size)',
                              cursor: 'pointer',
                            }}
                          >
                            <CircleAlert size={12} />
                            {t('dashboard.table.failed')}
                          </button>
                        )}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                        }}
                     >
                       {(req.latencyMs / 1000).toFixed(2)}s
                     </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                        }}
                      >
                        {req.firstTokenMs != null ? (req.firstTokenMs / 1000).toFixed(2) + 's' : '—'}
                      </td>
                      <td
                        style={{
                          padding: 'var(--spacer-12) var(--spacer-8)',
                          borderBottom: '1px solid var(--border-neutral-l1)',
                          textAlign: 'right',
                          fontFamily: 'var(--font-family-metric)',
                        }}
                      >
                        {req.latencyMs > 0 ? Math.round(req.tokens / (req.latencyMs / 1000)).toLocaleString() + ' tok/s' : '—'}
                      </td>
                   </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              className="ds-pagination"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-4)',
                marginTop: 'var(--spacer-16)',
                flexWrap: 'wrap',
              }}
            >
              <button
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
                style={{
                  minWidth: 32,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  color: safePage === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  font: 'inherit',
                  fontSize: 'var(--body-base-font-size)',
                  cursor: safePage === 0 ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
                }}
                onMouseEnter={(e) => {
                  if (safePage !== 0) e.currentTarget.style.background = 'var(--bg-overlay-l2)';
                }}
                onMouseLeave={(e) => {
                  if (safePage !== 0) e.currentTarget.style.background = 'transparent';
                }}
              >
                <ChevronLeft size={16} />
              </button>
              {pageWindow(safePage, totalPages).map((item, idx) =>
                item === '…' ? (
                  <span
                    key={'ellipsis-' + idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 28,
                      height: 32,
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--body-base-font-size)',
                    }}
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    style={{
                      minWidth: 32,
                      height: 32,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: item === safePage ? 'var(--bg-overlay-l3)' : 'transparent',
                      color: item === safePage ? 'var(--text-default)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-neutral-l1)',
                      borderRadius: 'var(--radius-8)',
                      font: 'inherit',
                      fontSize: 'var(--body-base-font-size)',
                      cursor: 'pointer',
                      transition: 'background var(--transition-fast, 0.12s ease)',
                    }}
                    onMouseEnter={(e) => {
                      if (item !== safePage) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                    }}
                    onMouseLeave={(e) => {
                      if (item !== safePage) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {item + 1}
                  </button>
                ),
              )}
              <button
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(safePage + 1)}
                style={{
                  minWidth: 32,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  color: safePage >= totalPages - 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-neutral-l1)',
                  borderRadius: 'var(--radius-8)',
                  font: 'inherit',
                  fontSize: 'var(--body-base-font-size)',
                  cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                  transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease)',
                }}
                onMouseEnter={(e) => {
                  if (safePage < totalPages - 1) e.currentTarget.style.background = 'var(--bg-overlay-l2)';
                }}
                onMouseLeave={(e) => {
                  if (safePage < totalPages - 1) e.currentTarget.style.background = 'transparent';
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {detailError && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
          }}
          onClick={() => setDetailError(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560,
              maxWidth: 'calc(100vw - 40px)',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-neutral-l1)',
              borderRadius: 'var(--radius-14, 14px)',
              boxShadow: 'var(--shadow-floating)',
              overflow: 'hidden',
              animation: 'slideInUp 0.22s ease-out both',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-neutral-l1)',
                background: 'var(--status-error-surface-l1)',
              }}
            >
              <CircleAlert size={18} style={{ color: 'var(--status-error-default)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--heading-sm-font-size)', fontWeight: 'var(--heading-sm-font-weight)', color: 'var(--text-default)' }}>
                  请求失败详情
                </div>
                <div style={{ fontSize: 'var(--body-xs-font-size)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {detailError.model} · {detailError.provider}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailError(null)}
                title="关闭 (Esc)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  border: 'none',
                  background: 'transparent',
                  borderRadius: 8,
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  transition: 'background var(--transition-fast, 0.12s ease)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-overlay-l1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Info grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '10px 16px',
                }}
              >
                <InfoCell label='时间' value={formatTimestamp(detailError.timestamp)} />
                <InfoCell label='请求类型' value={detailError.type} />
                <InfoCell label='错误分类' value={detailError.errorCategory || '未知'} />
                <InfoCell label='失败次数' value={detailError.failoverCount ? String(detailError.failoverCount) : '0'} />
              </div>

              {/* Error message */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 'var(--body-sm-font-size)', fontWeight: 'var(--font-weight-medium)', color: 'var(--text-secondary)' }}>
                    失败原因
                  </span>
                  {detailError.errorMessage && (
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(detailError.errorMessage ?? '')?.catch(() => {}); }}
                      title="复制错误信息"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-tertiary)',
                        fontSize: 'var(--body-xs-font-size)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Copy size={12} /> 复制
                    </button>
                  )}
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-10)',
                    background: 'var(--bg-overlay-l1)',
                    border: '1px solid var(--status-error-surface-l1)',
                    borderLeft: '3px solid var(--status-error-default)',
                    color: 'var(--text-default)',
                    fontSize: 'var(--body-sm-font-size)',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    userSelect: 'text',
                  }}
                >
                  {detailError.errorMessage ||
                    '无详细错误信息（仅错误分类：' + (detailError.errorCategory || '未知') + '）'}
                </div>
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
                <Button size="sm" variant="secondary" onClick={() => setDetailError(null)}>
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}    </Card>
 );
};

const InfoCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '8px 10px',
      borderRadius: 'var(--radius-8)',
      background: 'var(--bg-overlay-l1)',
      minWidth: 0,
    }}
  >
    <span
      style={{
        fontSize: 'var(--body-xs-font-size)',
        color: 'var(--text-tertiary)',
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: 'var(--body-sm-font-size)',
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-family-mono)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'text',
      }}
      title={value}
    >
      {value || '—'}
    </span>
  </div>
);
