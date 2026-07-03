import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({ options, placeholder, style, ...props }) => {
  return (
    <div className="ds-select-wrap" style={{ position: 'relative', width: '100%' }}>
      <select
        className="ds-select"
        style={{
          width: '100%',
          height: 32,
          padding: '0 var(--spacer-12)',
          paddingRight: 'var(--spacer-32)',
          backgroundColor: 'var(--bg-base-default)',
          color: 'var(--text-default)',
          border: '1px solid var(--border-neutral-l1)',
          borderRadius: 'var(--radius-8)',
          appearance: 'none',
          WebkitAppearance: 'none',
          font: 'inherit',
          fontSize: 'var(--body-base-font-size)',
          lineHeight: 'var(--body-base-line-height)',
          cursor: 'pointer',
          outline: 'none',
          ...style,
        }}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown
        size={16}
        style={{
          position: 'absolute',
          right: 'var(--spacer-12)',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--icon-secondary)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
