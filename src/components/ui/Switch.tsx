import React from 'react';
import { Switch as RACSwitch } from 'react-aria-components';

interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = (props) => {
  const { checked, onChange, disabled, ...rest } = props;
  return (
    <RACSwitch
      isSelected={checked}
      onChange={onChange}
      isDisabled={disabled}
      {...rest}
      className="ds-switch-rac"
      style={({ isSelected: sel, isDisabled: dis }) => ({
        position: 'relative',
        display: 'inline-flex',
        width: 32,
        height: 18,
        background: sel ? 'var(--bg-brand)' : 'var(--bg-overlay-l3)',
        border: '1px solid',
        borderColor: sel ? 'var(--bg-brand)' : 'var(--border-neutral-l1)',
        borderRadius: 'var(--radius-full)',
        cursor: dis ? 'not-allowed' : 'pointer',
        transition: 'background .15s, border-color .15s',
        opacity: dis ? 0.5 : 1,
        alignItems: 'center',
        boxSizing: 'border-box',
      })}
    >
      <style>{`
        .ds-switch-rac .react-aria-Switch__indicator {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .ds-switch-rac .react-aria-Switch__thumb {
          position: absolute;
          top: 2px;
          width: 12px;
          height: 12px;
          border-radius: var(--radius-full);
          transition: left .15s, background .15s;
        }
        .ds-switch-rac[data-selected="true"] .react-aria-Switch__thumb {
          left: 16px;
          background: var(--icon-onbrand);
        }
        .ds-switch-rac[data-selected="false"] .react-aria-Switch__thumb {
          left: 2px;
          background: var(--bg-base-default);
        }
      `}</style>
    </RACSwitch>
  );
};