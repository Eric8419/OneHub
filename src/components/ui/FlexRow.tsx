import React from 'react';

interface FlexRowProps {
  children: React.ReactNode;
  gap?: string;
  style?: React.CSSProperties;
  className?: string;
}

/** A flex row with centered items and configurable gap. */
export const FlexRow: React.FC<FlexRowProps> = ({ children, gap = 'var(--spacer-6)', style, className = '' }) => (
  <div className={className} style={{ display: 'flex', alignItems: 'center', gap, ...style }}>
    {children}
  </div>
);