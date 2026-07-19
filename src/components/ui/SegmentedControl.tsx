import React, { useRef, useEffect, useState } from 'react';

export interface SegmentOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  size = 'md',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const isSm = size === 'sm';
  const paddingY = isSm ? 3 : 5;
  const paddingX = isSm ? 12 : 16;
  const fontSize = isSm ? 13 : 14;
  const gap = 2;

  useEffect(() => {
    const el = optionRefs.current.get(value);
    const container = containerRef.current;
    if (!el || !container) {
      setIndicatorStyle({ opacity: 0 });
      return;
    }
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    setIndicatorStyle({
      left: eRect.left - cRect.left,
      top: eRect.top - cRect.top,
      width: eRect.width,
      height: eRect.height,
      opacity: 1,
    });
  }, [value, options]);

  return (
    <div
      ref={containerRef}
      className="ds-segmented-control"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
        padding: gap,
        background: 'var(--bg-overlay-l2)',
        borderRadius: 'var(--radius-10)',
        position: 'relative',
      }}
    >
      <div
        className="ds-segmented-control__indicator"
        style={{
          position: 'absolute',
          borderRadius: 'var(--radius-8)',
          background: 'var(--bg-base-default)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
          transition: 'left 0.2s cubic-bezier(0.22,1,0.36,1), top 0.2s cubic-bezier(0.22,1,0.36,1), width 0.2s cubic-bezier(0.22,1,0.36,1), height 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.15s',
          ...indicatorStyle,
        }}
      />
      {options.map(opt => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={el => { if (el) optionRefs.current.set(opt.value, el); }}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: `${paddingY}px ${paddingX}px`,
              border: 'none',
              borderRadius: 'var(--radius-8)',
              background: 'transparent',
              color: isSelected ? 'var(--text-default)' : 'var(--text-secondary)',
              fontSize,
              fontWeight: isSelected ? 500 : 400,
              fontFamily: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
              lineHeight: 1.4,
            }}
          >
            {opt.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{opt.icon}</span>}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
