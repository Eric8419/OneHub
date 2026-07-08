import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  padding?: string;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export const Card: React.FC<CardProps> = ({ children, style, className = '', padding, onMouseEnter, onMouseLeave }) => {
  return (
    <div
      className={`ds-card ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: 'var(--bg-base-secondary)',
        border: '1px solid var(--border-neutral-l1)',
        borderRadius: 'var(--radius-12)',
        padding: padding || 'var(--spacer-20)',
        color: 'var(--text-default)',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      fontSize: 'var(--heading-sm-font-size)',
      lineHeight: 'var(--heading-sm-line-height)',
      fontWeight: 'var(--heading-sm-font-weight)',
      marginBottom: 'var(--spacer-8)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const CardDesc: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 'var(--body-base-font-size)', lineHeight: 'var(--body-base-line-height)', color: 'var(--text-secondary)' }}>
    {children}
  </div>
);

// Also export default Card with CardTitle and CardDesc attached
Object.assign(Card, { Title: CardTitle, Desc: CardDesc });
