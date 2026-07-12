import { useEffect, useState, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { desktopApi } from '../../lib/desktopApi';
import { toast } from '../../components/ui';
import { Play, Square, Copy, Check, Loader2, Cpu } from 'lucide-react';

interface ProxyStatus {
  running: boolean;
  host: string;
  port: number;
  uptimeSecs: number;
}

const formatUptime = (secs: number): string => {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分${secs % 60}秒`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}时${m}分`;
};

// ── CSS custom properties override for dark card background ──
const CARD_THEME = {
  '--text-default': 'rgba(255,255,255,0.92)',
  '--text-secondary': 'rgba(255,255,255,0.7)',
  '--text-tertiary': 'rgba(255,255,255,0.5)',
  '--text-disabled': 'rgba(255,255,255,0.25)',
  '--icon-tertiary': 'rgba(255,255,255,0.4)',
  '--icon-disabled': 'rgba(255,255,255,0.15)',
  '--status-success-default': '#4ade80',
  '--status-error-default': '#f87171',
  '--status-success-surface-l1': 'rgba(74,222,128,0.12)',
  '--status-error-surface-l1': 'rgba(248,113,113,0.12)',
  '--status-success-hover': '#22c55e',
  '--status-error-hover': '#ef4444',
  '--text-onbrand': '#ffffff',
} as unknown as React.CSSProperties;

export const ProxyControl: React.FC = () => {
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  const poll = useCallback(() => {
    desktopApi
      .getProxyStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const proxyUrl = `http://${settings.host}:${settings.port}`;
  const authToken = settings.authToken;
  const running = status?.running ?? false;

  const handleToggle = async () => {
    setToggling(true);
    try {
      if (running) {
        await desktopApi.stopProxy();
        toast('代理已停止', 'info');
      } else {
        await desktopApi.startProxy(settings.host, settings.port);
        toast('代理已启动', 'success');
      }
      await desktopApi
        .getProxyStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setToggling(false);
    }
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(proxyUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
      toast('代理地址已复制', 'success');
    } catch {
      /* ignore */
    }
  };

  const copyToken = async () => {
    if (!authToken) return;
    try {
      await navigator.clipboard.writeText(authToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
      toast('认证令牌已复制', 'success');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-12)',
        overflow: 'hidden',
        marginBottom: 'var(--spacer-24)',
      }}
    >
      {/* Gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          borderRadius: 'var(--radius-12)',
          overflow: 'hidden',
          background:
            'radial-gradient(circle at 18% 15%, color-mix(in srgb, var(--bg-brand) 30%, transparent), transparent 36%), linear-gradient(135deg, #171717, #262626)',
        }}
      />

      {/* Overlay gradient for readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.55) 100%)',
          borderRadius: 'var(--radius-12)',
          pointerEvents: 'none',
        }}
      />

      {/* Content card */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--radius-12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacer-16)',
            padding: 'var(--spacer-16) var(--spacer-20)',
            ...CARD_THEME,
          }}
        >
          {/* ── Left: Status + Info ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-10)',
                marginBottom: 'var(--spacer-12)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-10)',
                  background: running ? 'var(--status-success-surface-l1)' : 'var(--bg-overlay-l1)',
                  transition: 'background var(--transition-normal, 0.2s) ease',
                }}
              >
                <Cpu
                  size={20}
                  style={{
                    color: running ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                    transition: 'color var(--transition-normal, 0.2s) ease',
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacer-8)',
                    fontSize: 'var(--heading-xs-font-size)',
                    fontWeight: 'var(--font-weight-strong)',
                    color: 'var(--text-default)',
                  }}
                >
                  本地代理
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacer-4)',
                      height: 22,
                      padding: '0 var(--spacer-8)',
                      borderRadius: 'var(--radius-6)',
                      fontSize: 'var(--body-xs-font-size)',
                      fontWeight: 'var(--font-weight-medium)',
                      background: running ? 'var(--status-success-surface-l1)' : 'var(--bg-overlay-l1)',
                      color: running ? 'var(--status-success-default)' : 'var(--text-tertiary)',
                      transition: 'all var(--transition-normal, 0.2s) ease',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 'var(--radius-full)',
                        background: running ? 'var(--status-success-default)' : 'var(--text-disabled)',
                        transition: 'all var(--transition-normal, 0.2s) ease',
                      }}
                    />
                    {running ? '运行中' : '已停止'}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-tertiary)',
                    marginTop: 'var(--spacer-2)',
                  }}
                >
                  {running && status ? `已运行 ${formatUptime(status.uptimeSecs)}` : '其他应用可通过代理地址访问本服务'}
                </div>
              </div>
            </div>

            {/* Address row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                padding: 'var(--spacer-8) var(--spacer-10)',
                borderRadius: 'var(--radius-8)',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                marginBottom: 'var(--spacer-6)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                地址
              </span>
              <code
                style={{
                  flex: 1,
                  fontSize: 'var(--body-sm-font-size)',
                  fontFamily: 'var(--font-family-mono)',
                  color: running ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {proxyUrl}
              </code>
              <button
                onClick={copyUrl}
                title="复制地址"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                  borderRadius: 'var(--radius-6)',
                  border: 'none',
                  background: 'transparent',
                  color: copiedUrl ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'color var(--transition-fast, 0.12s) ease, background var(--transition-fast, 0.12s) ease',
                }}
                onMouseEnter={(e) => {
                  if (!copiedUrl) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            {/* Auth token row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                padding: 'var(--spacer-8) var(--spacer-10)',
                borderRadius: 'var(--radius-8)',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--body-xs-font-size)',
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                令牌
              </span>
              {authToken ? (
                <>
                  <code
                    style={{
                      flex: 1,
                      fontSize: 'var(--body-sm-font-size)',
                      fontFamily: 'var(--font-family-mono)',
                      color: 'rgba(255,255,255,0.7)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {authToken.length > 32 ? `${authToken.slice(0, 16)}...${authToken.slice(-8)}` : authToken}
                  </code>
                  <button
                    onClick={copyToken}
                    title="复制令牌"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 26,
                      height: 26,
                      borderRadius: 'var(--radius-6)',
                      border: 'none',
                      background: 'transparent',
                      color: copiedToken ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition:
                        'color var(--transition-fast, 0.12s) ease, background var(--transition-fast, 0.12s) ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!copiedToken) e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {copiedToken ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </>
              ) : (
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--body-sm-font-size)',
                    color: 'var(--text-tertiary)',
                    fontStyle: 'italic',
                  }}
                >
                  未设置（无需认证即可连接）
                </span>
              )}
            </div>
          </div>

          {/* Right: Divider + Toggle */}
          <div
            style={{
              width: 1,
              height: 80,
              background: 'var(--border-neutral-l1)',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--spacer-6)',
              flexShrink: 0,
              minWidth: 80,
            }}
          >
            <button
              onClick={handleToggle}
              disabled={toggling}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-6)',
                height: 36,
                padding: '0 var(--spacer-20)',
                borderRadius: 'var(--radius-8)',
                border: 'none',
                cursor: toggling ? 'not-allowed' : 'pointer',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: 'var(--font-weight-strong)',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-normal, 0.2s) ease',
                background: running ? 'var(--status-error-default)' : 'var(--status-success-default)',
                color: 'var(--text-onbrand)',
                opacity: toggling ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!toggling) {
                  e.currentTarget.style.background = running
                    ? 'var(--status-error-hover)'
                    : 'var(--status-success-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!toggling) {
                  e.currentTarget.style.background = running
                    ? 'var(--status-error-default)'
                    : 'var(--status-success-default)';
                }
              }}
            >
              {toggling ? (
                <Loader2 size={16} style={{ animation: 'spin 0.6s linear infinite' }} />
              ) : running ? (
                <Square size={14} />
              ) : (
                <Play size={14} />
              )}
              {toggling ? '' : running ? '停止代理' : '启动代理'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
