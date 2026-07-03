import React from 'react';

type TagVariant = 'default' | 'brand' | 'green' | 'orange' | 'blue' | 'neutral' | 'success' | 'danger' | 'warning';

interface TagProps {
  children: React.ReactNode;
  variant?: TagVariant;
  style?: React.CSSProperties;
  className?: string;
}

const variantStyle: Record<TagVariant, React.CSSProperties> = {
  default: {
    background: 'var(--bg-overlay-l2)',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-neutral-l1)',
  },
  brand: {
    background: 'var(--bg-brand-popup)',
    color: 'var(--text-brand)',
    borderColor: 'transparent',
  },
  green: {
    background: 'var(--status-success-surface-l1)',
    color: 'var(--status-success-default)',
    borderColor: 'transparent',
  },
  orange: {
    background: 'var(--status-alert-surface-l1)',
    color: 'var(--status-warning-default)',
    borderColor: 'transparent',
  },
  blue: {
    background: 'var(--status-primary-surface-l1)',
    color: 'var(--status-primary-default)',
    borderColor: 'transparent',
  },
  neutral: {
    background: 'var(--bg-overlay-l1)',
    color: 'var(--text-tertiary)',
    borderColor: 'var(--border-neutral-l1)',
  },
  success: {
    background: 'var(--status-success-surface-l1)',
    color: 'var(--status-success-default)',
    borderColor: 'transparent',
  },
  danger: {
    background: 'var(--status-error-surface-l1)',
    color: 'var(--status-error-default)',
    borderColor: 'transparent',
  },
  warning: {
    background: 'var(--status-warning-surface-l1)',
    color: 'var(--status-warning-default)',
    borderColor: 'transparent',
  },
};

export const Tag: React.FC<TagProps> = ({ children, variant = 'default', style, className = '' }) => {
  return (
    <span
      className={`ds-tag ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacer-4)',
        height: 22,
        padding: '0 var(--spacer-8)',
        borderRadius: 'var(--radius-8)',
        fontSize: 'var(--body-sm-font-size)',
        lineHeight: 'var(--body-sm-line-height)',
        fontWeight: 'var(--body-sm-strong-font-weight, 500)',
        border: '1px solid',
        whiteSpace: 'nowrap',
        ...variantStyle[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
};
