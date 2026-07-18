import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProviderStore } from '../../store/providerStore';
import { useStatsStore } from '../../store/statsStore';
import { desktopApi, type ProviderHealthSnapshot } from '../../lib/desktopApi';
import type { Model } from '../../types/provider';
import { Card, Tag, ConfirmDialog, ProviderLogo, toast } from '../../components/ui';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Copy,
  Bot,
  Server,
  Globe,
  Shield,
  Activity,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Network,
  GitBranch,
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────

const describeModelCapabilities = (model: Model) => {
  const tags: string[] = [];
  if (model.contextWindow) tags.push(`${model.contextWindow.toLocaleString()} ctx`);
  if (model.maxOutputTokens) tags.push(`${model.maxOutputTokens.toLocaleString()} out`);
  if (model.supportsVision) tags.push('视觉');
  if (model.supportsReasoning) tags.push('思考');
  if (model.supportsReasoningEffort) tags.push('强度');
  if (model.supportsToolCalls) tags.push('工具');
  if (model.supportsJsonMode) tags.push('JSON');
  return tags;
};

const FLAVOR_LABELS: Record<string, string> = {
  'openai': 'OpenAI',
  'openai-compatible': 'OpenAI 兼容',
  'anthropic': 'Anthropic',
  'responses': 'Responses API',
};

const HEALTH_STATUS_CONFIG: Record<string, { variant: 'green' | 'orange' | 'danger'; label: string; icon: React.ReactNode }> = {
  healthy: { variant: 'green', label: '健康', icon: <CheckCircle size={14} /> },
  rate_limited: { variant: 'orange', label: '限流中', icon: <Clock size={14} /> },
  unhealthy: { variant: 'danger', label: '熔断中', icon: <AlertTriangle size={14} /> },
  auth_error: { variant: 'danger', label: '认证失败', icon: <XCircle size={14} /> },
};

const STATUS_TAG_CONFIG: Record<string, { variant: 'green' | 'orange' | 'danger' | 'neutral'; label: string }> = {
  connected: { variant: 'green', label: '已连接' },
  configuring: { variant: 'orange', label: '配置中' },
  error: { variant: 'danger', label: '连接失败' },
  disabled: { variant: 'neutral', label: '已禁用' },
  testing: { variant: 'orange', label: '测试中' },
};

// ── Style constants ────────────────────────────────────────

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--heading-xs-font-size)',
  fontWeight: 'var(--heading-xs-font-weight)',
  color: 'var(--text-default)',
  lineHeight: 'var(--heading-xs-line-height)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacer-8)',
};

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--spacer-12) 0',
  borderBottom: '1px solid var(--border-neutral-l1)',
};

const infoLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacer-8)',
  fontSize: 'var(--body-base-font-size)',
  color: 'var(--text-tertiary)',
};

const infoValueStyle: React.CSSProperties = {
  fontSize: 'var(--body-base-font-size)',
  color: 'var(--text-default)',
  fontFamily: 'var(--code-terminal-font-family)',
  maxWidth: 300,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 'var(--radius-8)',
  border: '1px solid var(--border-neutral-l1)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'background var(--transition-fast, 0.12s) ease, color var(--transition-fast, 0.12s) ease, border-color var(--transition-fast, 0.12s) ease',
};

const statCardStyle: React.CSSProperties = {
  flex: 1,
  padding: 'var(--spacer-16)',
  borderRadius: 'var(--radius-12)',
  border: '1px solid var(--border-neutral-l1)',
  background: 'var(--bg-overlay-l1)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacer-4)',
};

const statValueStyle: React.CSSProperties = {
  fontSize: 'var(--heading-lg-font-size)',
  fontWeight: 'var(--heading-lg-font-weight)',
  color: 'var(--text-default)',
  fontFamily: 'var(--font-family-metric)',
  lineHeight: 1.2,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: 'var(--body-sm-font-size)',
  color: 'var(--text-tertiary)',
};

const modelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--spacer-12) 0',
  borderBottom: '1px solid var(--border-neutral-l1)',
};

const tagStyle: React.CSSProperties = {
  border: 'none',
  fontSize: 'var(--body-xs-font-size)',
};

// ── Component ──────────────────────────────────────────────

export const ProviderDetailPage: React.FC = () => {
  const { providerId } = useParams<{ providerId: string }>();
  const navigate = useNavigate();

  const provider = useProviderStore(s => s.providers.find(p => p.id === providerId));
  const updateProvider = useProviderStore(s => s.updateProvider);
  const removeProvider = useProviderStore(s => s.removeProvider);
  const recentRequests = useStatsStore(s => s.recentRequests);
  const fetchRequests = useStatsStore(s => s.fetchRequests);

  const [health, setHealth] = useState<ProviderHealthSnapshot | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch health periodically
  useEffect(() => {
    if (!providerId) return;
    let active = true;
    const fetchHealth = async () => {
      try {
        const map = await desktopApi.getProviderHealth();
        if (active) setHealth(map[providerId]);
      } catch { /* ignore */ }
    };
    fetchHealth();
    const timer = setInterval(fetchHealth, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [providerId]);

  // Fetch recent requests for stats
  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Filter requests for this provider
  const providerRequests = useMemo(() => {
    if (!provider) return [];
    return recentRequests.filter(r => r.provider === provider.name);
  }, [recentRequests, provider]);

  // Compute stats
  const stats = useMemo(() => {
    if (providerRequests.length === 0) {
      return { totalRequests: 0, totalTokens: 0, successCount: 0, avgLatency: 0, successRate: 0 };
    }
    const totalTokens = providerRequests.reduce((sum, r) => sum + r.tokens, 0);
    const successCount = providerRequests.filter(r => r.status === 'success' || r.status === 'streaming').length;
    const avgLatency = providerRequests.reduce((sum, r) => sum + r.latencyMs, 0) / providerRequests.length;
    return {
      totalRequests: providerRequests.length,
      totalTokens,
      successCount,
      avgLatency,
      successRate: (successCount / providerRequests.length) * 100,
    };
  }, [providerRequests]);

  if (!provider) {
    return (
      <div style={{ padding: 'var(--spacer-40)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
        <p>未找到该供应商。</p>
        <button onClick={() => navigate('/providers')} style={{ marginTop: 'var(--spacer-12)', cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-brand)' }}>
          返回供应商列表
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_TAG_CONFIG[provider.status] || STATUS_TAG_CONFIG.configuring;
  const healthCfg = health && health.status !== 'healthy' ? HEALTH_STATUS_CONFIG[health.status] : HEALTH_STATUS_CONFIG.healthy;
  const isDisabled = provider.status === 'disabled';

  const handleCopyKey = () => {
    if (provider.apiKey) {
      navigator.clipboard.writeText(provider.apiKey).then(() => {
        toast('API Key 已复制', 'success');
      }).catch(() => toast('复制失败', 'error'));
    }
  };

  const handleDelete = async () => {
    try {
      await removeProvider(provider.id);
      toast(`已删除供应商「${provider.name}」`, 'info');
      navigate('/providers');
    } catch (e) {
      console.error('Failed to remove provider:', e);
    }
  };

  const handleToggleEnabled = async () => {
    const newStatus = provider.status === 'disabled' ? 'connected' : 'disabled';
    try {
      await updateProvider(provider.id, { status: newStatus });
      toast(newStatus === 'disabled' ? `已禁用「${provider.name}」` : `已启用「${provider.name}」`, 'success');
    } catch (e) {
      console.error('Failed to toggle provider:', e);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await desktopApi.testProviderConnection(
        provider.apiFlavor || 'openai-compatible',
        provider.apiBase,
        provider.apiKey,
      );
      setTestResult({ success: result.success, message: result.message });
      toast(result.success ? '连接测试成功' : `测试失败: ${result.message}`, result.success ? 'success' : 'error');
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
      toast('测试失败', 'error');
    } finally {
      setTesting(false);
    }
  };

  const apiKeyMasked = provider.apiKey
    ? provider.apiKey.slice(0, 8) + '••••••••'
    : '未配置';

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacer-24)' }}>
      {/* ── Top Bar: Back + Title + Actions ─────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacer-16)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-12)' }}>
          <button
            onClick={() => navigate('/providers')}
            style={{ ...iconBtnStyle, flexShrink: 0 }}
            title="返回"
          >
            <ArrowLeft size={18} />
          </button>
          <ProviderLogo providerId={provider.id} name={provider.name} size={40} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-4)' }}>
            <h1 style={{ fontSize: 'var(--heading-lg-font-size)', fontWeight: 'var(--heading-lg-font-weight)', color: 'var(--text-default)', margin: 0 }}>
              {provider.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <Tag variant={isDisabled ? statusCfg.variant : healthCfg.variant} style={tagStyle}>
                {isDisabled ? statusCfg.label : healthCfg.label}
              </Tag>
              <span style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)' }}>
                {provider.models.length} 个模型
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 'var(--spacer-8)' }}>
          <button
            onClick={handleToggleEnabled}
            style={iconBtnStyle}
            title={isDisabled ? '启用' : '禁用'}
          >
            {isDisabled ? <Power size={16} /> : <PowerOff size={16} />}
          </button>
          <button
            onClick={handleTestConnection}
            style={iconBtnStyle}
            title="测试连接"
            disabled={testing}
          >
            {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          </button>
          <button
            onClick={() => navigate(`/providers/${provider.id}/edit`)}
            style={iconBtnStyle}
            title="编辑"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ ...iconBtnStyle, color: 'var(--status-error-default)' }}
            title="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Test result banner */}
      {testResult && (
        <div style={{
          padding: 'var(--spacer-12) var(--spacer-16)',
          borderRadius: 'var(--radius-8)',
          background: testResult.success ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
          color: testResult.success ? 'var(--status-success-default)' : 'var(--status-error-default)',
          fontSize: 'var(--body-base-font-size)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-8)',
        }}>
          {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {testResult.message}
        </div>
      )}

      {/* ── Health Monitor ───────────────────────────────── */}
      <Card padding="var(--spacer-24)">
        <div style={{ ...sectionTitleStyle, marginBottom: 'var(--spacer-20)' }}>
          <Shield size={18} />
          健康监控
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacer-12)', flexWrap: 'wrap' }}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>当前状态</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
              <Tag variant={healthCfg.variant} style={tagStyle}>{healthCfg.icon} {healthCfg.label}</Tag>
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>在途请求</div>
            <div style={statValueStyle}>{health?.inFlight ?? 0}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>连续失败</div>
            <div style={statValueStyle}>{health?.consecutiveFailures ?? 0}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>冷却倒计时</div>
            <div style={statValueStyle}>
              {health?.cooldownSecs ? `${health.cooldownSecs}s` : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Call Statistics ──────────────────────────────── */}
      <Card padding="var(--spacer-24)">
        <div style={{ ...sectionTitleStyle, marginBottom: 'var(--spacer-20)' }}>
          <Activity size={18} />
          调用统计
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacer-12)', flexWrap: 'wrap' }}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>总请求数</div>
            <div style={statValueStyle}>{stats.totalRequests}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Token 用量</div>
            <div style={statValueStyle}>{stats.totalTokens.toLocaleString()}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>成功率</div>
            <div style={statValueStyle}>{stats.successRate.toFixed(1)}%</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>平均延迟</div>
            <div style={statValueStyle}>{stats.avgLatency > 0 ? `${(stats.avgLatency / 1000).toFixed(2)}s` : '—'}</div>
          </div>
        </div>

        {/* Recent requests table */}
        {providerRequests.length > 0 && (
          <div style={{ marginTop: 'var(--spacer-20)' }}>
            <div style={{ fontSize: 'var(--body-sm-font-size)', color: 'var(--text-tertiary)', marginBottom: 'var(--spacer-8)' }}>
              近期请求（{providerRequests.length} 条）
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 500, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['时间', '模型', 'Token', '状态', '延迟'].map(h => (
                      <th key={h} style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: h === 'Token' || h === '延迟' ? 'right' : 'left', fontSize: 'var(--body-md-font-size)', color: 'var(--text-tertiary)', fontWeight: 'var(--font-weight-medium)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {providerRequests.slice(0, 10).map(req => (
                    <tr key={req.id}>
                      <td style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', fontFamily: 'var(--code-terminal-font-family)', fontSize: 'var(--body-md-font-size)', color: 'var(--text-secondary)' }}>{req.timestamp}</td>
                      <td style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', fontSize: 'var(--body-md-font-size)', color: 'var(--text-default)' }}>{req.model}</td>
                      <td style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)', fontSize: 'var(--body-md-font-size)' }}>{req.tokens.toLocaleString()}</td>
                      <td style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)' }}>
                        <Tag variant={req.status === 'success' || req.status === 'streaming' ? 'green' : 'danger'} style={tagStyle}>
                          {req.status === 'success' || req.status === 'streaming' ? '成功' : '失败'}
                        </Tag>
                      </td>
                      <td style={{ padding: 'var(--spacer-8)', borderBottom: '1px solid var(--border-neutral-l1)', textAlign: 'right', fontFamily: 'var(--font-family-metric)', fontSize: 'var(--body-md-font-size)' }}>{(req.latencyMs / 1000).toFixed(2)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {/* ── Configuration Overview ───────────────────────── */}
      <Card padding="var(--spacer-24)">
        <div style={{ ...sectionTitleStyle, marginBottom: 'var(--spacer-16)' }}>
          <Server size={18} />
          配置概览
        </div>

        <div style={infoRowStyle}>
          <span style={infoLabelStyle}><Globe size={14} /> API Base</span>
          <span style={infoValueStyle}>{provider.apiBase}</span>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}><Pencil size={14} /> API Key</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
            <span style={infoValueStyle}>{apiKeyMasked}</span>
            {provider.apiKey && (
              <button onClick={handleCopyKey} style={{ ...iconBtnStyle, width: 28, height: 28, border: 'none' }} title="复制">
                <Copy size={12} />
              </button>
            )}
          </div>
        </div>
        <div style={infoRowStyle}>
          <span style={infoLabelStyle}><Network size={14} /> 协议类型</span>
          <span style={{ ...infoValueStyle, fontFamily: 'inherit' }}>
            {FLAVOR_LABELS[provider.apiFlavor || 'openai-compatible'] || provider.apiFlavor}
          </span>
        </div>

        {/* Proxy config */}
        {provider.proxyConfig?.enabled && (
          <div style={infoRowStyle}>
            <span style={infoLabelStyle}><Globe size={14} /> 独立代理</span>
            <span style={infoValueStyle}>{provider.proxyConfig.url || '未配置'}</span>
          </div>
        )}

        {/* Model mapping */}
        {provider.modelMapping && Object.keys(provider.modelMapping).length > 0 && (
          <div style={{ padding: 'var(--spacer-12) 0' }}>
            <div style={{ ...infoLabelStyle, marginBottom: 'var(--spacer-8)' }}>
              <GitBranch size={14} /> 模型映射规则
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-4)' }}>
              {Object.entries(provider.modelMapping).map(([key, value]) => (
                <div key={key} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-8)',
                  padding: 'var(--spacer-8) var(--spacer-12)',
                  borderRadius: 'var(--radius-8)',
                  background: 'var(--bg-overlay-l1)',
                  fontSize: 'var(--body-sm-font-size)',
                  fontFamily: 'var(--code-terminal-font-family)',
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{key}</span>
                  <ArrowLeft size={12} style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }} />
                  <span style={{ color: 'var(--text-default)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Model List ───────────────────────────────────── */}
      <Card padding="var(--spacer-24)">
        <div style={{ ...sectionTitleStyle, marginBottom: 'var(--spacer-16)' }}>
          <Bot size={18} />
          模型列表 ({provider.models.length})
        </div>

        {provider.models.length === 0 ? (
          <div style={{ padding: 'var(--spacer-32) 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--body-base-font-size)' }}>
            该供应商暂无配置的模型
          </div>
        ) : (
          provider.models.map(model => {
            const caps = describeModelCapabilities(model);
            return (
              <div key={model.id} style={modelRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)' }}>
                  <Bot size={16} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ fontSize: 'var(--body-base-font-size)', color: 'var(--text-default)' }}>{model.name}</span>
                  {model.alias && (
                    <Tag variant="neutral" style={tagStyle}>别名: {model.alias}</Tag>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacer-4)', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 400 }}>
                  {caps.map(tag => (
                    <Tag key={tag} variant="neutral" style={tagStyle}>{tag}</Tag>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        title="删除供应商"
        message={`确定要删除供应商「${provider.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};
