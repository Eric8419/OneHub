import React, { useRef, useState, useCallback } from 'react';
import { LucideIcon } from 'lucide-react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'brand'
  | 'danger'
  | 'link';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
  /** Show a subtle ripple effect on click (default: true for brand/primary) */
  ripple?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'background: var(--bg-invert); color: var(--text-white); border-color: var(--bg-invert);',
  secondary:
    'background: var(--bg-overlay-l1); color: var(--text-default); border-color: var(--border-neutral-l1);',
  ghost:
    'background: transparent; color: var(--text-default); border-color: transparent;',
  brand:
    'background: var(--bg-brand); color: var(--text-onbrand); border-color: var(--bg-brand);',
  danger:
    'background: var(--status-error-default); color: var(--text-onaccent); border-color: var(--status-error-default);',
  link:
    'background: transparent; color: var(--text-default); border-color: transparent; padding: 0; height: auto;',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'height: 24px; padding: 0 var(--spacer-8); border-radius: var(--radius-8); font-size: var(--body-sm-font-size);',
  md: 'height: 28px; padding: 0 var(--spacer-12); border-radius: var(--radius-8);',
  lg: 'height: 36px; padding: 0 var(--spacer-16); border-radius: var(--radius-8); font-size: var(--body-base-font-size);',
};

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 20 };

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconOnly = false,
  loading = false,
  ripple,
  children,
  style,
  disabled,
  ...props
}) => {
  const isIconOnly = iconOnly || (!children && !!Icon);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [showRipple, setShowRipple] = useState(false);

  // Enable ripple by default for brand and primary buttons
  const hasRipple = ripple ?? (variant === 'brand' || variant === 'primary');

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;
    if (hasRipple && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      btnRef.current.style.setProperty('--ripple-x', `${x}px`);
      btnRef.current.style.setProperty('--ripple-y', `${y}px`);
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 400);
    }
    props.onClick?.(e);
  }, [disabled, loading, hasRipple, props.onClick]);

  // Track original width to prevent text jump during loading
  const btnStyle: React.CSSProperties = {
    position: 'relative',
    overflow: hasRipple ? 'hidden' : undefined,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacer-6)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    fontSize: 'var(--body-base-font-size)',
    fontWeight: 'var(--font-weight-medium)',
    lineHeight: '1',
    transition: 'background var(--transition-fast, 0.12s ease), color var(--transition-fast, 0.12s ease), border-color var(--transition-fast, 0.12s ease), opacity var(--transition-fast, 0.12s ease), transform var(--transition-fast, 0.12s ease)',
    opacity: disabled ? 0.5 : 1,
    transform: disabled ? 'none' : 'scale(1)',
    ...(isIconOnly ? { width: size === 'sm' ? 24 : size === 'lg' ? 36 : 28, padding: 0, justifyContent: 'center' } : {}),
    ...parseCSS(variantClasses[variant]),
    ...parseCSS(sizeClasses[size]),
    ...style,
  };

  return (
    <button
      ref={btnRef}
      className="ds-btn"
      disabled={disabled || loading}
      style={btnStyle}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          if (variant === 'secondary') e.currentTarget.style.background = 'var(--bg-overlay-l2)';
          else if (variant === 'ghost') e.currentTarget.style.background = 'var(--bg-overlay-l1)';
          else if (variant === 'brand') e.currentTarget.style.background = 'var(--bg-brand-hover)';
          else if (variant === 'primary') e.currentTarget.style.background = 'var(--bg-invert-hover)';
          else if (variant === 'danger') e.currentTarget.style.background = 'var(--status-error-hover)';
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = '';
          e.currentTarget.style.transform = 'scale(1)';
        }
      }}
      onMouseDown={e => {
        if (!disabled && !loading) e.currentTarget.style.transform = 'scale(0.97)';
      }}
      onMouseUp={e => {
        if (!disabled && !loading) e.currentTarget.style.transform = 'scale(1)';
      }}
      onClick={handleClick}
      {...props}
    >
      {/* Ripple effect */}
      {hasRipple && showRipple && (
        <span
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            borderRadius: '50%',
            width: 40,
            height: 40,
            left: 'var(--ripple-x)',
            top: 'var(--ripple-y)',
            transform: 'translate(-50%, -50%) scale(0)',
            background: 'var(--bg-overlay-l3)',
            animation: 'ripple 0.4s ease-out forwards',
          }}
        />
      )}

      {loading ? (
        <span
          style={{
            width: iconSize[size],
            height: iconSize[size],
            display: 'inline-block',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      ) : Icon ? (
        <Icon size={iconSize[size]} />
      ) : null}
      {!isIconOnly && children != null && (
        <span style={{ opacity: loading ? 0.7 : 1 }}>{children}</span>
      )}
    </button>
  );
};

// Tiny CSS string parser for inline styles
function parseCSS(css: string): React.CSSProperties {
  const style: React.CSSProperties = {};
  css.split(';').forEach(rule => {
    const [key, ...rest] = rule.split(':');
    if (!key || rest.length === 0) return;
    const k = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const v = rest.join(':').trim();
    if (k === 'padding') style.padding = v;
    else if (k === 'height') style.height = v;
    else if (k === 'borderRadius') style.borderRadius = v;
    else if (k === 'fontSize') style.fontSize = v;
    else if (k === 'borderColor') style.borderColor = v;
    else if (k === 'background') (style as any).background = v;
    else if (k === 'color') style.color = v;
    else if (k === 'opacity') style.opacity = parseFloat(v);
    else if (k === 'width') style.width = v;
    else if (k in style) (style as any)[k] = v;
  });
  return style;
}