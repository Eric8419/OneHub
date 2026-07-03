import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled }) => {
  return (
    <label
      className="ds-switch"
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 32,
        height: 18,
        background: checked ? 'var(--bg-brand)' : 'var(--bg-overlay-l3)',
        border: '1px solid',
        borderColor: checked ? 'var(--bg-brand)' : 'var(--border-neutral-l1)',
        borderRadius: 'var(--radius-full)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s, border-color .15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange?.(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span
        className="ds-switch__thumb"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          width: 12,
          height: 12,
          background: checked ? 'var(--icon-onbrand)' : 'var(--bg-base-default)',
          borderRadius: 'var(--radius-full)',
          transition: 'left .15s, background .15s',
        }}
      />
    </label>
  );
};
