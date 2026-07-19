import React, { useCallback, useState } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = (props) => {
  const { checked, onChange, disabled, ...rest } = props;
  const [pressed, setPressed] = useState(false);

  const toggle = useCallback(() => {
    if (!disabled) onChange?.(!checked);
  }, [checked, disabled, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle]
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      id={rest.id}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={handleKeyDown}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className="ds-switch-btn"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 51,
        height: 31,
        padding: 0,
        border: 'none',
        borderRadius: 999,
        background: checked ? 'var(--bg-brand)' : 'var(--bg-overlay-l2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .28s cubic-bezier(0.22,1,0.36,1)',
        opacity: disabled ? 0.5 : 1,
        boxSizing: 'border-box',
        flexShrink: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span
        className="ds-switch-thumb"
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: pressed ? 30 : 27,
          height: 27,
          borderRadius: '50%',
          background: '#fff',
          boxShadow:
            '0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06), 0 1px 0 rgba(0,0,0,0.04)',
          transition: 'left .28s cubic-bezier(0.22,1,0.36,1), width .2s ease',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
};
