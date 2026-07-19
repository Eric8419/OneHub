import React from 'react';
import { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger' | 'link';

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'background: var(--bg-invert); color: var(--text-white); border-color: var(--bg-invert);',
  secondary: 'background: var(--bg-overlay-l1); color: var(--text-default); border-color: var(--border-neutral-l1);',
  ghost: 'background: transparent; color: var(--text-default); border-color: transparent;',
  brand: 'background: var(--bg-brand); color: var(--text-onbrand); border-color: var(--bg-brand);',
  danger:
    'background: var(--status-error-default); color: var(--text-onaccent); border-color: var(--status-error-default);',
  link: 'background: transparent; color: var(--text-default); border-color: transparent; padding: 0; height: auto;',
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
  children,
  style,
  disabled,
  ...props
}) => {
  const isIconOnly = iconOnly || (!children && !!Icon);

  // Track original width to prevent text jump during loading
  const btnStyle: React.CSSProperties = {
    position: 'relative',
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
    transition:
      'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast), transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
    opacity: disabled ? 0.5 : 1,
    ...(isIconOnly
      ? { width: size === 'sm' ? 24 : size === 'lg' ? 36 : 28, padding: 0, justifyContent: 'center' }
      : {}),
    ...parseCSS(variantClasses[variant]),
    ...parseCSS(sizeClasses[size]),
    ...style,
  };

  return (
    <button
      className="ds-btn"
      disabled={disabled || loading}
      style={btnStyle}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          if (variant === 'secondary') e.currentTarget.style.background = 'var(--bg-overlay-l2)';
          else if (variant === 'ghost') e.currentTarget.style.background = 'var(--bg-overlay-l1)';
          else if (variant === 'brand') e.currentTarget.style.background = 'var(--bg-brand-hover)';
          else if (variant === 'primary') e.currentTarget.style.background = 'var(--bg-invert-hover)';
          else if (variant === 'danger') e.currentTarget.style.background = 'var(--status-error-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = '';
        }
      }}
      {...props}
    >
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
      {!isIconOnly && children != null && <span style={{ opacity: loading ? 0.7 : 1 }}>{children}</span>}
    </button>
  );
};

// Tiny CSS string parser for inline styles
function parseCSS(css: string): React.CSSProperties {
  const style: React.CSSProperties = {};
  css.split(';').forEach((rule) => {
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
