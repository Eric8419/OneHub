import React, { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Server, Cpu, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useT } from '../../i18n';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface SidebarProps {
  activeKey: string;
  onNavigate: (path: string) => void;
}

type ProxyStatus = 'running' | 'stopped' | 'error' | 'checking';

interface ProxyStatusPayload {
  running?: boolean;
  host?: string;
  port?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeKey, onNavigate }) => {
  const t = useT();
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState(0);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus>('checking');

  const navItems: NavItem[] = [
    { key: 'dashboard', label: t('sidebar.dashboard'), icon: <LayoutDashboard size={16} />, path: '/dashboard' },
    { key: 'providers', label: t('sidebar.providers'), icon: <Server size={16} />, path: '/providers' },
    { key: 'models', label: t('sidebar.models'), icon: <Cpu size={16} />, path: '/models' },
    { key: 'settings', label: t('sidebar.settings'), icon: <Settings size={16} />, path: '/settings' },
  ];

  useEffect(() => {
    const check = () => {
      setProxyStatus('checking');
      try {
        invoke<ProxyStatusPayload>('get_proxy_status').then(status => {
          const running = status?.running ?? false;
          setProxyHost(status?.host ?? '');
          setProxyPort(status?.port ?? 0);
          setProxyStatus(running ? 'running' : 'stopped');
        }).catch(() => {
          setProxyStatus('stopped');
        });
      } catch {
        setProxyStatus('stopped');
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  // Memoize status label and dot class
  const statusInfo = useMemo(() => {
    switch (proxyStatus) {
      case 'running':
        return { label: `${proxyHost || '127.0.0.1'}:${proxyPort}`, dotClass: 'rb-status-dot--running' };
      case 'stopped':
        return { label: t('sidebar.stopped'), dotClass: 'rb-status-dot--stopped' };
      case 'error':
        return { label: t('sidebar.stopped'), dotClass: 'rb-status-dot--error' };
      case 'checking':
        return { label: '检查中...', dotClass: 'rb-status-dot--checking' };
    }
  }, [proxyStatus, proxyHost, proxyPort, t]);

  return (
    <aside
      className="ds-shell__sidebar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 20,
        width: 220,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base-secondary)',
        borderRight: '1px solid var(--border-neutral-l1)',
        overflow: 'hidden',
      }}
    >
      {/* Brand */}
      <div
        className="ds-shell__brand"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-8)',
          padding: '0 var(--spacer-16)',
          borderBottom: '1px solid var(--border-neutral-l1)',
          height: 57,
          boxSizing: 'border-box',
        }}
      >
        <span
          className="ds-shell__brand-name"
          style={{
            fontFamily: 'var(--heading-sm-font-family)',
            fontSize: 'var(--heading-sm-font-size)',
            fontWeight: 'var(--heading-sm-font-weight)',
            lineHeight: 'var(--heading-sm-line-height)',
            color: 'var(--text-default)',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          Melody Hub
        </span>
      </div>

      {/* Navigation */}
      <nav
        className="ds-shell__nav"
        style={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacer-2)',
          padding: 'var(--spacer-12) var(--spacer-10)',
        }}
      >
        {navItems.map(item => {
          const isActive = item.key === activeKey;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.path)}
              className="ds-shell__nav-item"
              data-active={isActive ? 'true' : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-10)',
                padding: 'var(--spacer-8) var(--spacer-10)',
                borderRadius: 'var(--radius-8)',
                border: 'none',
                textDecoration: 'none',
                color: isActive ? 'var(--bg-brand)' : 'var(--text-secondary)',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: isActive ? 'var(--font-weight-strong)' : 'var(--body-base-font-weight)',
                lineHeight: 'var(--body-base-line-height)',
                cursor: 'pointer',
                background: isActive ? 'var(--brand-100)' : 'transparent',
                width: '100%',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'background 0.18s cubic-bezier(0.22,1,0.36,1), color 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-overlay-l1)';
                  e.currentTarget.style.color = 'var(--text-default)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }
              }}
              onMouseDown={e => {
                e.currentTarget.style.background = isActive ? 'var(--brand-200)' : 'var(--bg-overlay-l2)';
              }}
              onMouseUp={e => {
                e.currentTarget.style.background = isActive ? 'var(--brand-100)' : 'var(--bg-overlay-l1)';
              }}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span
                  className="ds-shell__nav-indicator"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 16,
                    borderRadius: '0 var(--radius-4) var(--radius-4) 0',
                    background: 'var(--bg-brand)',
                  }}
                />
              )}
              <span
                className="ds-shell__nav-icon"
                style={{
                  color: isActive ? 'var(--icon-brand)' : 'var(--icon-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-6)',
                  background: isActive ? 'var(--brand-100)' : 'transparent',
                  transition: 'color 0.18s cubic-bezier(0.22,1,0.36,1), background 0.18s cubic-bezier(0.22,1,0.36,1)',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <span
                className="ds-shell__nav-label"
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div
        className="ds-shell__sidebar-footer"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacer-12) var(--spacer-16)',
          borderTop: '1px solid var(--border-neutral-l1)',
        }}
      >
        <div className="ds-shell__status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacer-6)' }}>
          <span
            className={`ds-shell__status-dot ${statusInfo.dotClass}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-full)',
              display: 'inline-block',
              transition: 'background var(--transition-normal, 0.2s) ease, box-shadow var(--transition-normal, 0.2s) ease',
            }}
          />
          <span
            className="ds-shell__status-text"
            style={{
              fontSize: 'var(--body-xs-font-size)',
              lineHeight: 'var(--body-xs-line-height)',
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {statusInfo.label}
          </span>
        </div>
        <span
          className="ds-shell__version"
          style={{
            fontFamily: 'var(--code-terminal-font-family)',
            fontSize: 'var(--body-xs-font-size)',
            lineHeight: 'var(--body-xs-line-height)',
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
          }}
        >
          v0.1.0
        </span>
      </div>
    </aside>
  );
};
