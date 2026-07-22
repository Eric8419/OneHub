import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger' | 'link';

type ButtonSize = 'sm' | 'md' | 'lg';

// motion/react overrides the drag / animation / gesture handler
// signatures (e.g. `onDrag` receives `PanInfo` as a second arg), so
// we strip them out of `ButtonHTMLAttributes` before merging with
// `HTMLMotionProps`. Without this, TS complains that React's
// `DragEventHandler` isn't assignable to motion's `(event, info) => void`.
type StripMotionHandlers<T> = {
  [K in keyof T]: K extends
    | 'onDrag'
    | 'onDragStart'
    | 'onDragEnd'
    | 'onAnimationStart'
    | 'onAnimationEnd'
    | 'onAnimationIteration'
    ? never
    : T[K];
};

interface ButtonProps extends StripMotionHandlers<React.ButtonHTMLAttributes<HTMLButtonElement>> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'background: var(--bg-brand); color: #fff; border-color: var(--bg-brand);',
  secondary: 'background: var(--bg-overlay-l1); color: var(--text-default); border-color: var(--border-neutral-l1);',
  ghost: 'background: transparent; color: var(--text-default); border-color: transparent;',
  brand: 'background: var(--bg-brand); color: var(--text-onbrand); border-color: var(--bg-brand);',
  danger:
    'background: var(--status-error-default); color: var(--text-onaccent); border-color: var(--status-error-default);',
  link: 'background: transparent; color: var(--text-default); border-color: transparent; padding: 0; height: auto;',
};

// Initial background per variant — used to restore the inline style
// after onMouseLeave. We can't just clear `style.background` because
// the variant's initial background is also applied via inline style
// (see parseCSS above); clearing it would leave the button with no
// background at all, falling back to the user-agent `<button>` color
// (which is light in macOS dark mode and makes the text invisible).
const variantInitialBackground: Record<ButtonVariant, string> = {
  primary: 'var(--bg-brand)',
  secondary: 'var(--bg-overlay-l1)',
  ghost: 'transparent',
  brand: 'var(--bg-brand)',
  danger: 'var(--status-error-default)',
  link: 'transparent',
};

// Hover background per variant — kept in one place so hover and
// initial stay in sync.
const variantHoverBackground: Record<ButtonVariant, string> = {
  primary: 'var(--bg-brand-hover)',
  secondary: 'var(--bg-overlay-l2)',
  ghost: 'var(--bg-overlay-l1)',
  brand: 'var(--bg-brand-hover)',
  danger: 'var(--status-error-hover)',
  link: 'transparent',
};

// Subtle elevation for "emphasis" variants (brand / primary / danger).
// Secondary / ghost / link stay flat to preserve their quiet role.
const variantShadow: Record<ButtonVariant, string> = {
  primary: '0 1px 2px color-mix(in srgb, var(--bg-brand) 40%, transparent), 0 4px 12px color-mix(in srgb, var(--bg-brand) 24%, transparent)',
  secondary: 'none',
  ghost: 'none',
  brand: '0 1px 2px color-mix(in srgb, var(--bg-brand) 40%, transparent), 0 4px 12px color-mix(in srgb, var(--bg-brand) 24%, transparent)',
  danger: '0 1px 2px rgba(0, 0, 0, 0.08)',
  link: 'none',
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
  const isBusy = loading && !disabled;

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
      'background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast), transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow var(--transition-fast), width 240ms cubic-bezier(0.23, 1, 0.32, 1)',
    opacity: disabled ? 0.5 : 1,
    boxShadow: variantShadow[variant],
    ...(isIconOnly
      ? { width: size === 'sm' ? 24 : size === 'lg' ? 36 : 28, padding: 0, justifyContent: 'center' }
      : {}),
    ...parseCSS(variantClasses[variant]),
    ...parseCSS(sizeClasses[size]),
    ...style,
  };

  // Content renderer — the spinner / icon swap is wrapped in
  // AnimatePresence so the cross-fade is smooth instead of a hard
  // cut. The text label also fades opacity to signal loading state
  // without jumping layout.
  const renderLeading = () => {
    if (isBusy) {
      return (
        <motion.span
          key="spinner"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.18 }}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <Loader2 size={iconSize[size]} className="animate-spin" />
        </motion.span>
      );
    }
    if (Icon) {
      return (
        <motion.span
          key={`icon-${Icon.displayName ?? 'unknown'}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.18 }}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <Icon size={iconSize[size]} />
        </motion.span>
      );
    }
    return null;
  };

  return (
    <motion.button
      className="ds-btn"
      // `disabled || loading` keeps click handlers from firing while
      // in-flight, but we still render content (not the browser
      // default disabled look) so the spinner + faded label remains
      // visible.
      disabled={disabled || loading}
      style={btnStyle}
      // Press-down feedback: scale to 0.97 on tap. Disabled / loading
      // buttons don't get the press feedback (loading already has
      // its own motion).
      whileTap={disabled || isBusy ? undefined : { scale: 0.97 }}
      whileHover={disabled || isBusy ? undefined : {}}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = variantHoverBackground[variant];
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.background = variantInitialBackground[variant];
        }
      }}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        {renderLeading()}
      </AnimatePresence>
      {!isIconOnly && children != null && (
        <motion.span
          key="label"
          animate={{ opacity: isBusy ? 0.7 : 1 }}
          transition={{ duration: 0.18 }}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          {children}
        </motion.span>
      )}
    </motion.button>
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
