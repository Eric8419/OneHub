import React, { forwardRef } from 'react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: React.ReactNode;
  wrapperStyle?: React.CSSProperties;
}

export const Input = forwardRef<HTMLDivElement, InputProps>(
  ({ icon, wrapperStyle, style, className, ...inputProps }, ref) => {
    return (
      <div
        ref={ref}
        className={`ds-input ${className || ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacer-8)',
          minHeight: 32,
          padding: '0 var(--spacer-12)',
          background: 'var(--bg-base-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-8)',
          color: 'var(--text-default)',
          width: '100%',
          fontFamily: 'var(--body-base-font-family)',
          fontSize: 'var(--body-base-font-size)',
          lineHeight: 'var(--body-base-line-height)',
          ...wrapperStyle,
        }}
      >
        {icon && <span className="ds-input__icon" style={{ color: 'var(--icon-secondary)', display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}
        <input
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-default)',
            font: 'inherit',
            minWidth: 0,
            ...style,
          }}
          {...inputProps}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';
