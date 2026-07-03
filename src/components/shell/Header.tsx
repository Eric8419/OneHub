import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Avatar } from '../ui';
import { useT } from '../../i18n';

interface HeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, actions }) => {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);

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
      }}
    >
      <h1
        className="ds-shell__page-title"
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
        <div style={{ position: 'relative' }}>
          <div onClick={() => setMenuOpen(!menuOpen)} style={{ cursor: 'pointer' }}>
            <Avatar size="sm">U</Avatar>
          </div>
          {menuOpen && (
            <div
              className="ds-menu"
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
                minWidth: 140,
                color: 'var(--text-default)',
                boxShadow: '0 12px 32px color-mix(in srgb, var(--text-default) 12%, transparent), 0 2px 8px color-mix(in srgb, var(--text-default) 8%, transparent)',
              }}
              onClick={() => setMenuOpen(false)}
            >
              <div className="ds-menu__item" style={{
                display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)',
                minHeight: 32, padding: 'var(--spacer-6) var(--spacer-8)',
                borderRadius: 'var(--radius-8)', color: 'var(--text-default)',
                fontSize: 'var(--body-base-font-size)', cursor: 'pointer',
              }}>
                {t('header.about')}
              </div>
              <div className="ds-menu__divider" style={{ height: 1, background: 'var(--border-neutral-l1)', margin: 'var(--spacer-4) 0' }} />
              <div className="ds-menu__item ds-menu__item--danger" style={{
                display: 'flex', alignItems: 'center', gap: 'var(--spacer-8)',
                minHeight: 32, padding: 'var(--spacer-6) var(--spacer-8)',
                borderRadius: 'var(--radius-8)', color: 'var(--status-error-default)',
                fontSize: 'var(--body-base-font-size)', cursor: 'pointer',
              }}
              onClick={() => invoke('exit_app')}
            >
                {t('header.exit')}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};