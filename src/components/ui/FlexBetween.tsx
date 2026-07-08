import React from 'react';

interface FlexBetweenProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/** A flex row with space-between alignment, centered items. */
export const FlexBetween: React.FC<FlexBetweenProps> = ({ children, style, className = '' }) => (
  <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}>
    {children}
  </div>
);