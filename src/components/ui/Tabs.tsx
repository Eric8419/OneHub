import React from 'react';

interface TabsProps {
  tabs: { key: string; label: string; count?: number }[];
  activeKey: string;
  onChange: (key: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange }) => {
  return (
    <div
      className="ds-tabs"
      style={{
        display: 'flex',
        gap: 'var(--spacer-24)',
        borderBottom: '1px solid var(--border-neutral-l1)',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            className={`ds-tab ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(tab.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 'var(--spacer-12) 0',
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--text-default)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 'var(--body-base-font-size)',
              lineHeight: 'var(--body-base-line-height)',
              fontWeight: 'var(--font-weight-medium)',
              position: 'relative',
              ...((isActive) ? {
                // When active, the tab gets a custom style
                // underline pseudo will be via className
              } : {}),
            }}
          >
            <span>{tab.label}</span>
            {tab.count != null && (
              <span
                className="ds-tab__count"
                style={{
                  marginLeft: 'var(--spacer-6)',
                  minWidth: 18,
                  height: 18,
                  padding: '0 var(--spacer-6)',
                  display: 'inline-grid',
                  placeItems: 'center',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-overlay-l2)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-family-metric)',
                  fontSize: 'var(--body-xs-font-size)',
                  lineHeight: 'var(--body-xs-line-height)',
                }}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: -1,
                  height: 2,
                  background: 'var(--icon-default)',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
