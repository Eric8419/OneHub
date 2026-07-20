import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useSettingsStore } from '../../store/settingsStore';
import { desktopApi } from '../../lib/desktopApi';
import { toast, Counter } from '../../components/ui';
import Prism from '../../components/ui/Prism';
import { Play, Square, Copy, Check, Loader2, Cpu } from 'lucide-react';

interface ProxyStatus {
  running: boolean;
  host: string;
  port: number;
  uptimeSecs: number;
}

const formatUptime = (secs: number): { hours: number; mins: number; secs: number } => {
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { hours, mins, secs: s };
};

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

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };
const DURATION_SLOW = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };
const DURATION_FAST = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };

export const ProxyControl: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<number | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [now, setNow] = useState(Date.now());
  const statusAtRef = useRef<number>(0);

  const settings = useSettingsStore((s) => s.settings);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loaded = useSettingsStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  const poll = useCallback(() => {
    desktopApi
      .getProxyStatus()
      .then((s) => {
        statusAtRef.current = Date.now();
        setStatus(s);
      })
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const baseUrl = `http://${settings.host}:${settings.port}`;
  const endpoints = [
    { label: 'OpenAI', path: '/v1/chat/completions', url: `${baseUrl}/v1/chat/completions` },
    { label: 'Anthropic', path: '/v1/messages', url: `${baseUrl}/v1/messages` },
    { label: 'Responses', path: '/v1/responses', url: `${baseUrl}/v1/responses` },
  ];
  const authToken = settings.authToken;
  const running = status?.running ?? false;
  const showUptime = running && status !== null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

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

  const copyEndpoint = async (index: number) => {
    try {
      await navigator.clipboard.writeText(endpoints[index].url);
      setCopiedEndpoint(index);
      setTimeout(() => setCopiedEndpoint(null), 2000);
      toast('端点地址已复制', 'success');
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

  const totalUptime = showUptime
    ? status!.uptimeSecs + Math.max(0, Math.floor((now - statusAtRef.current) / 1000))
    : 0;
  const uptimeParts = formatUptime(totalUptime);
  const counterProps = {
    fontSize: 11,
    gap: 0,
    horizontalPadding: 0,
    gradientHeight: 0,
    gradientFrom: 'transparent',
    gradientTo: 'transparent',
    textColor: 'var(--text-tertiary)',
    fontWeight: 'inherit' as const,
  };

  // Combine endpoints + token into a 4-item list for 2x2 grid.
  const gridItems = [
    ...endpoints.map((ep, idx) => ({
      kind: 'endpoint' as const,
      key: `ep-${idx}`,
      label: ep.label,
      value: ep.url,
      copied: copiedEndpoint === idx,
      onCopy: () => void copyEndpoint(idx),
    })),
    {
      kind: 'token' as const,
      key: 'token',
      label: '令牌',
      value: authToken,
      copied: copiedToken,
      onCopy: () => void copyToken(),
    },
  ];

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-12)',
        overflow: 'hidden',
        marginBottom: 'var(--spacer-24)',
        minHeight: 180,
      }}
    >
      {/* Prism background.
          Renders a WebGL prism refractor on pure black. The prism's
          built-in chromatic dispersion already produces a colorful
          spectrum, so no theme-color tint is applied. zIndex:0 keeps
          it behind content (zIndex:2). pointerEvents:none so it
          stays decorative. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          backgroundColor: '#000',
          opacity: running ? 1 : 0.6,
          transition: 'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
          pointerEvents: 'none',
        }}
      >
        <Prism
          animationType="rotate"
          timeScale={running && !shouldReduceMotion ? 0.6 : 0.2}
          height={3.5}
          baseWidth={5.5}
          scale={3.6}
          hueShift={0}
          colorFrequency={1}
          noise={0.4}
          glow={1}
          bloom={1}
          transparent
          suspendWhenOffscreen
        />
      </div>

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
            padding: 'var(--spacer-16) var(--spacer-20)',
            ...CARD_THEME,
          }}
        >
          {/* ── Header: icon + title + status, with toggle button on the right ── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacer-16)',
              marginBottom: 'var(--spacer-16)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-10)',
                }}
              >
                <motion.div
                  initial={false}
                  animate={{
                    background: running
                      ? 'rgba(74,222,128,0.14)'
                      : 'rgba(255,255,255,0.10)',
                    borderColor: running
                      ? 'rgba(74,222,128,0.25)'
                      : 'rgba(255,255,255,0.14)',
                  }}
                  transition={DURATION_FAST}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--radius-10)',
                    backdropFilter: 'blur(12px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(12px) saturate(140%)',
                    border: '1px solid',
                    flexShrink: 0,
                  }}
                >
                  <motion.div
                    animate={running ? { scale: [1, 1.06, 1], opacity: [0.9, 1, 0.9] } : { scale: 1, opacity: 1 }}
                    transition={running ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
                  >
                    <Cpu
                      size={20}
                      style={{
                        color: running ? 'var(--status-success-default)' : 'var(--icon-tertiary)',
                        transition: 'color 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </motion.div>
                </motion.div>

                <div style={{ minWidth: 0 }}>
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
                    <motion.span
                      layout
                      initial={false}
                      animate={{
                        background: running
                          ? 'rgba(74,222,128,0.16)'
                          : 'rgba(255,255,255,0.10)',
                        borderColor: running
                          ? 'rgba(74,222,128,0.25)'
                          : 'rgba(255,255,255,0.14)',
                        color: running ? 'var(--status-success-default)' : 'var(--text-tertiary)',
                      }}
                      transition={SPRING}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--spacer-4)',
                        height: 22,
                        padding: '0 var(--spacer-8)',
                        borderRadius: 'var(--radius-6)',
                        fontSize: 'var(--body-xs-font-size)',
                        fontWeight: 'var(--font-weight-medium)',
                        backdropFilter: 'blur(12px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(12px) saturate(140%)',
                        border: '1px solid',
                      }}
                    >
                      <motion.span
                        initial={false}
                        animate={running
                          ? {
                              scale: [1, 1.5, 1],
                              opacity: [1, 0.5, 1],
                              background: 'var(--status-success-default)',
                              boxShadow: '0 0 0 0 rgba(74,222,128,0.5)',
                            }
                          : {
                              scale: 1,
                              opacity: 1,
                              background: 'var(--text-disabled)',
                              boxShadow: '0 0 0 0 rgba(255,255,255,0)',
                            }}
                        transition={running
                          ? {
                              scale: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                              opacity: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
                              background: { duration: 0.4 },
                              boxShadow: { duration: 0.4 },
                            }
                          : { duration: 0.3 }}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--radius-full)',
                          display: 'inline-block',
                        }}
                      />
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={running ? 'running' : 'stopped'}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={DURATION_FAST}
                        >
                          {running ? '运行中' : '已停止'}
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--body-sm-font-size)',
                      color: 'var(--text-tertiary)',
                      marginTop: 'var(--spacer-2)',
                      minHeight: '16px',
                    }}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {showUptime ? (
                        <motion.span
                          key="uptime"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={DURATION_FAST}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}
                        >
                          已运行
                          {uptimeParts.hours > 0 && (
                            <>
                              <Counter value={uptimeParts.hours} {...counterProps} />
                              <span>时</span>
                            </>
                          )}
                          <Counter value={uptimeParts.mins} {...counterProps} />
                          <span>分</span>
                          {uptimeParts.hours === 0 && (
                            <>
                              <Counter value={uptimeParts.secs} {...counterProps} />
                              <span>秒</span>
                            </>
                          )}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="idle"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={DURATION_FAST}
                        >
                          其他应用可通过代理地址访问本服务
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>

            {/* Toggle button — moved to top right */}
            <motion.button
              onClick={handleToggle}
              disabled={toggling}
              initial={false}
              animate={{
                background: running
                  ? toggling
                    ? 'rgba(248,113,113,0.20)'
                    : 'rgba(248,113,113,0.30)'
                  : toggling
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(74,222,128,0.30)',
                borderColor: running
                  ? 'rgba(248,113,113,0.30)'
                  : 'rgba(74,222,128,0.30)',
                scale: toggling ? 0.96 : 1,
              }}
              whileHover={toggling ? {} : {
                background: running
                  ? 'rgba(248,113,113,0.42)'
                  : 'rgba(74,222,128,0.42)',
                scale: 1.03,
              }}
              whileTap={toggling ? {} : { scale: 0.97 }}
              transition={SPRING}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--spacer-6)',
                height: 36,
                padding: '0 var(--spacer-20)',
                borderRadius: 'var(--radius-8)',
                border: '1px solid',
                cursor: toggling ? 'not-allowed' : 'pointer',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: 'var(--font-weight-strong)',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(14px) saturate(160%)',
                WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                color: 'var(--text-onbrand)',
                flexShrink: 0,
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                {toggling ? (
                  <motion.span
                    key="loading"
                    initial={{ rotate: 0, opacity: 0 }}
                    animate={{ rotate: 360, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      rotate: { duration: 0.6, repeat: Infinity, ease: 'linear' },
                      opacity: { duration: 0.15 },
                    }}
                    style={{ display: 'flex' }}
                  >
                    <Loader2 size={16} />
                  </motion.span>
                ) : running ? (
                  <motion.span
                    key="stop"
                    initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
                    transition={SPRING}
                    style={{ display: 'flex' }}
                  >
                    <Square size={14} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="start"
                    initial={{ scale: 0.5, opacity: 0, x: -4 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    exit={{ scale: 0.5, opacity: 0, x: 4 }}
                    transition={SPRING}
                    style={{ display: 'flex' }}
                  >
                    <Play size={14} />
                  </motion.span>
                )}
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                {!toggling && (
                  <motion.span
                    key={running ? 'stop-text' : 'start-text'}
                    initial={{ opacity: 0, x: running ? -8 : 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: running ? 8 : -8 }}
                    transition={DURATION_FAST}
                  >
                    {running ? '停止代理' : '启动代理'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* ── 2x2 grid: OpenAI / Anthropic / Responses / 令牌 ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 'var(--spacer-8)',
            }}
          >
            {gridItems.map((item) => (
              <motion.div
                key={item.key}
                initial={false}
                animate={{
                  background: running
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(255,255,255,0.06)',
                  borderColor: running
                    ? 'rgba(255,255,255,0.16)'
                    : 'rgba(255,255,255,0.10)',
                }}
                transition={DURATION_FAST}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacer-8)',
                  padding: 'var(--spacer-8) var(--spacer-10)',
                  borderRadius: 'var(--radius-8)',
                  backdropFilter: 'blur(14px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(150%)',
                  border: '1px solid',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--body-xs-font-size)',
                    color: 'var(--text-tertiary)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    minWidth: 60,
                  }}
                >
                  {item.label}
                </span>
                {item.kind === 'endpoint' || (item.kind === 'token' && item.value) ? (
                  <>
                    <motion.code
                      initial={false}
                      animate={{
                        color: running ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.25)',
                      }}
                      transition={DURATION_SLOW}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 'var(--body-sm-font-size)',
                        fontFamily: 'var(--font-family-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.kind === 'token' && item.value.length > 32
                        ? `${item.value.slice(0, 16)}...${item.value.slice(-8)}`
                        : item.value}
                    </motion.code>
                    <button
                      onClick={item.onCopy}
                      title={item.kind === 'token' ? '复制令牌' : '复制地址'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 26,
                        height: 26,
                        borderRadius: 'var(--radius-6)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(10px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                        color: item.copied
                          ? 'var(--status-success-default)'
                          : 'var(--icon-tertiary)',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition:
                          'color var(--transition-fast, 0.12s ease), background var(--transition-fast, 0.12s ease)',
                      }}
                      onMouseEnter={(e) => {
                        if (!item.copied) e.currentTarget.style.background = 'rgba(255,255,255,0.16)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {item.copied ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={SPRING}
                          >
                            <Check size={14} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="copy"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={SPRING}
                          >
                            <Copy size={14} />
                          </motion.span>
                        )}
                      </AnimatePresence>
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
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
