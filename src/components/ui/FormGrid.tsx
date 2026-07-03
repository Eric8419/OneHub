import React from 'react';

interface FormGridProps {
  children: React.ReactNode;
}

/** A 2-column grid layout for form fields with consistent gap. */
export const FormGrid: React.FC<FormGridProps> = ({ children }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 'var(--spacer-20) var(--spacer-32)',
    }}
  >
    {children}
  </div>
);