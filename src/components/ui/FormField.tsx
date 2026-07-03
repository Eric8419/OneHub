import React from 'react';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

/** A labeled form field with consistent spacing and typography. */
export const FormField: React.FC<FormFieldProps> = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacer-8)' }}>
    <label
      style={{
        fontSize: 'var(--body-base-strong-font-size)',
        fontWeight: 'var(--body-base-strong-font-weight)',
        color: 'var(--text-default)',
      }}
    >
      {label}
    </label>
    {children}
  </div>
);