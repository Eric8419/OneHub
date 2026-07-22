import React, { useCallback, useState } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  'aria-label'?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = (props) => {
  const { checked, onChange, disabled, indeterminate, ...rest } = props;
  const [pressed, setPressed] = useState(false);

  const isActive = !indeterminate && checked;
  const thumbLeft = indeterminate ? 9 : isActive ? 16 : 2;
  const bgColor = indeterminate
    ? 'var(--bg-overlay-l3)'
    : isActive
      ? 'var(--bg-brand)'
      : 'var(--bg-overlay-l2)';

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
      aria-checked={indeterminate ? 'mixed' : checked}
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
        justifyContent: 'center',
        width: 36,
        height: 22,
        padding: 0,
        border: 'none',
        borderRadius: 999,
        background: bgColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .28s cubic-bezier(0.22,1,0.36,1)',
        opacity: disabled ? 0.5 : 1,
        boxSizing: 'border-box',
        flexShrink: 0,
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {indeterminate && (
        <span
          style={{
            position: 'absolute',
            width: 10,
            height: 2,
            borderRadius: 1,
            background: 'var(--text-tertiary)',
            zIndex: 1,
          }}
        />
      )}
      <span
        className="ds-switch-thumb"
        style={{
          position: 'absolute',
          top: 2,
          left: thumbLeft,
          width: pressed ? 20 : 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          boxShadow:
            '0 2px 4px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.06)',
          transition: 'left .28s cubic-bezier(0.22,1,0.36,1), width .2s ease',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
};
