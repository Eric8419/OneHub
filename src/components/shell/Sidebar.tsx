import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Cpu, Settings, Music } from 'lucide-react';
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

export const Sidebar: React.FC<SidebarProps> = ({ activeKey, onNavigate }) => {
  const t = useT();
  const [proxyRunning, setProxyRunning] = useState(false);
  const [proxyPort, setProxyPort] = useState(0);

  const navItems: NavItem[] = [
    { key: 'dashboard', label: t('sidebar.dashboard'), icon: <LayoutDashboard size={16} />, path: '/dashboard' },
    { key: 'models', label: t('sidebar.models'), icon: <Cpu size={16} />, path: '/models' },
    { key: 'settings', label: t('sidebar.settings'), icon: <Settings size={16} />, path: '/settings' },
  ];

  useEffect(() => {
    const check = () => {
      try {
        invoke('get_proxy_status').then((status: any) => {
          setProxyRunning(status?.running ?? false);
          setProxyPort(status?.port ?? 0);
        }).catch(() => {});
      } catch {}
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);
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
        <Music size={20} style={{ color: 'var(--bg-brand)', flexShrink: 0 }} />
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
          padding: 'var(--spacer-12) var(--spacer-8)',
        }}
      >
        {navItems.map(item => {
          const isActive = item.key === activeKey;
          return (
            <a
              key={item.key}
              href={item.path}
              onClick={e => { e.preventDefault(); onNavigate(item.path); }}
              className="ds-shell__nav-item"
              data-active={isActive ? 'true' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-10)',
                padding: 'var(--spacer-8) var(--spacer-10)',
                borderRadius: 'var(--radius-8)',
                textDecoration: 'none',
                color: isActive ? 'var(--bg-brand)' : 'var(--text-default)',
                fontSize: 'var(--body-base-font-size)',
                fontWeight: isActive ? 'var(--font-weight-medium)' : 'var(--body-base-font-weight)',
                lineHeight: 'var(--body-base-line-height)',
                cursor: 'pointer',
                background: isActive ? 'var(--brand-100)' : 'transparent',
                transition: 'opacity 0.15s ease, background-color 0.15s ease',
              }}
            >
              <span style={{ color: isActive ? 'var(--icon-brand)' : 'var(--icon-secondary)', display: 'flex' }}>
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
            </a>
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
            className="ds-shell__status-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: 'var(--radius-full)',
              background: proxyRunning ? 'var(--status-success-default)' : 'var(--icon-disabled)',
              display: 'inline-block',
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
            {proxyRunning ? `${t('sidebar.running')}:${proxyPort}` : t('sidebar.stopped')}
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
          v1.0.0
        </span>
      </div>
    </aside>
  );
};