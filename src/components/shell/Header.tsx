import React, { useState, useEffect, useRef, useCallback } from 'react';
import { desktopApi } from '../../lib/desktopApi';
import { Avatar, ConfirmDialog } from '../ui';
import { useT } from '../../i18n';
import { Info, LogOut } from 'lucide-react';
import { WindowControls } from './WindowControls';

interface HeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, actions }) => {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMotionEnabled, setMenuMotionEnabled] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback((withMotion: boolean) => {
    setMenuMotionEnabled(withMotion);
    setMenuOpen(false);
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu(true);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen, closeMenu]);

  // Escape to close menu
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu(false);
        avatarRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [menuOpen, closeMenu]);

  const handleExit = () => {
    closeMenu(true);
    setConfirmExit(true);
  };

  const handleConfirmExit = () => {
    desktopApi.exitApp();
  };

  return (
    <header
      className="ds-shell__header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--spacer-16)',
        padding: '0 var(--spacer-24)',
        borderBottom: '1px solid var(--border-neutral-l1)',
        background: 'var(--bg-base-default)',
        flexShrink: 0,
        height: 57,
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Page title */}
      <h1
        className="ds-shell__page-title"
        data-tauri-drag-region
        style={{
          fontFamily: 'var(--heading-md-font-family)',
          fontSize: 'var(--heading-md-font-size)',
          fontWeight: 'var(--heading-md-font-weight)',
          lineHeight: 'var(--heading-md-line-height)',
          color: 'var(--text-default)',
          margin: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          minWidth: 0,
          WebkitUserSelect: 'none',
        }}
      >
        {title}
      </h1>
      <div
        className="ds-shell__header-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-12)',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {actions}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            ref={avatarRef}
            onClick={() => {
              setMenuMotionEnabled(true);
              setMenuOpen((current) => !current);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMenuMotionEnabled(false);
                setMenuOpen((current) => !current);
              }
              if (e.key === 'Escape') closeMenu(false);
            }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              padding: 0,
              fontFamily: 'inherit',
              borderRadius: 'var(--radius-full)',
              transition: 'box-shadow var(--transition-fast, 0.12s ease)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px var(--bg-brand)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Avatar size="sm">U</Avatar>
          </button>

          {/* Dropdown menu */}
          <div
            className="ds-menu"
            data-open={menuOpen}
            data-motion={menuMotionEnabled}
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 'var(--spacer-4)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacer-2)',
              background: 'var(--bg-menu)',
              border: '1px solid var(--border-neutral-l1)',
              borderRadius: 'var(--radius-12)',
              padding: 'var(--spacer-8)',
              minWidth: 160,
              color: 'var(--text-default)',
              boxShadow:
                '0 12px 32px color-mix(in srgb, var(--text-default) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--text-default) 8%, transparent)',
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? 'translateY(0) scale(1)' : 'translateY(-4px) scale(0.97)',
              transformOrigin: 'top right',
              pointerEvents: menuOpen ? 'auto' : 'none',
              transition: menuMotionEnabled
                ? 'opacity 160ms cubic-bezier(0.23, 1, 0.32, 1), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)'
                : 'none',
            }}
          >
            <button
              className="ds-menu__item"
              role="menuitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                minHeight: 32,
                padding: 'var(--spacer-6) var(--spacer-8)',
                borderRadius: 'var(--radius-8)',
                color: 'var(--text-default)',
                fontSize: 'var(--body-base-font-size)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                width: '100%',
                textAlign: 'left',
                transition: 'background var(--transition-fast, 0.12s ease)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-overlay-l1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => closeMenu(true)}
            >
              <Info size={14} style={{ color: 'var(--icon-tertiary)' }} />
              {t('header.about')}
            </button>
            <div
              className="ds-menu__divider"
              style={{ height: 1, background: 'var(--border-neutral-l1)', margin: 'var(--spacer-4) 0' }}
            />
            <button
              className="ds-menu__item ds-menu__item--danger"
              role="menuitem"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacer-8)',
                minHeight: 32,
                padding: 'var(--spacer-6) var(--spacer-8)',
                borderRadius: 'var(--radius-8)',
                color: 'var(--status-error-default)',
                fontSize: 'var(--body-base-font-size)',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                width: '100%',
                textAlign: 'left',
                transition: 'background var(--transition-fast, 0.12s ease)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--status-error-surface-l1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={handleExit}
            >
              <LogOut size={14} />
              {t('header.exit')}
            </button>
          </div>
        </div>
      </div>

      {/* Windows/Linux: window controls on the right.
          On macOS, WindowControls renders null (native traffic lights used). */}
      <WindowControls />

      {/* Exit confirmation dialog */}
      <ConfirmDialog
        open={confirmExit}
        title="退出应用"
        message="确定要退出 Melody Hub 吗？所有运行中的代理将会停止。"
        confirmLabel="退出"
        variant="danger"
        onConfirm={handleConfirmExit}
        onCancel={() => setConfirmExit(false)}
      />
    </header>
  );
};
