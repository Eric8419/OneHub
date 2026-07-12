import React, { createElement, useEffect, useMemo, useRef, useState } from 'react';

/* ─── AnimatedContent ─────────────────────────────────────── */

interface AnimatedContentProps {
  children: React.ReactNode;
  /** HTML element type, e.g. "section", "div" (default "div") */
  as?: React.ElementType;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Disable animation (useful for reduced-motion or performance) */
  disabled?: boolean;
}

const animatedStyle = (style: React.CSSProperties | undefined, delay: number, duration: number, distance: number) =>
  ({
    '--rb-delay': `${delay}ms`,
    '--rb-duration': `${duration}ms`,
    '--rb-distance': `${distance}px`,
    ...style,
  }) as React.CSSProperties;

export const AnimatedContent: React.FC<AnimatedContentProps> = ({
  children,
  as = 'div',
  delay = 0,
  duration = 360,
  distance = 8,
  className = '',
  style,
  disabled = false,
}) => {
  const reduced = usePrefersReducedMotion();
  return createElement(
    as,
    {
      className: disabled || reduced ? className : `rb-animated-content ${className}`,
      style: disabled || reduced ? style : animatedStyle(style, delay, duration, distance),
    },
    children,
  );
};

/* ─── CountUpValue ─────────────────────────────────────────── */

interface CountUpValueProps {
  value: number;
  formatter?: (value: number) => string;
  duration?: number;
}

export const CountUpValue: React.FC<CountUpValueProps> = ({
  value,
  formatter = (value) => Math.round(value).toLocaleString(),
  duration = 640,
}) => {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setDisplay(value);
      previous.current = value;
      return;
    }

    const from = previous.current;
    const delta = value - from;
    if (Math.abs(delta) < 0.01) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + delta * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        previous.current = value;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);

  return <>{formatter(display)}</>;
};

/* ─── SpotlightCard ────────────────────────────────────────── */

type SpotlightVariant = 'kpi' | 'provider' | 'danger' | 'neutral';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  padding?: string;
  delay?: number;
  /** Visual variant for border/glow intensity */
  variant?: SpotlightVariant;
}

const variantBorder: Record<SpotlightVariant, string> = {
  kpi: 'var(--border-neutral-l1)',
  provider: 'var(--border-neutral-l1)',
  danger: 'var(--status-error-default)',
  neutral: 'var(--border-neutral-l1)',
};

const variantGlow: Record<SpotlightVariant, string> = {
  kpi: 'var(--bg-brand)',
  provider: 'var(--bg-brand)',
  danger: 'var(--status-error-default)',
  neutral: 'transparent',
};

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  style,
  padding,
  delay = 0,
  variant = 'neutral',
}) => {
  const [enabled, setEnabled] = useState(false);
  const reduced = usePrefersReducedMotion();

  const cardStyle = useMemo<React.CSSProperties>(
    () => ({
      background: 'var(--bg-base-secondary)',
      border: `1px solid ${variantBorder[variant]}`,
      borderRadius: 'var(--radius-12)',
      padding: padding || 'var(--spacer-20)',
      color: 'var(--text-default)',
      ['--rb-delay' as string]: `${delay}ms`,
      ['--rb-glow-color' as string]: variantGlow[variant],
      ...style,
    }),
    [delay, padding, style, variant],
  );

  if (reduced) {
    return (
      <div className={`ds-card ${className}`} style={cardStyle}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={`ds-card rb-spotlight-card ${enabled ? 'is-active' : ''} ${className}`}
      style={cardStyle}
      data-variant={variant}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--rb-x', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--rb-y', `${event.clientY - rect.top}px`);
      }}
      onPointerEnter={() => setEnabled(true)}
      onPointerLeave={() => setEnabled(false)}
    >
      {children}
    </div>
  );
};

/* ─── ShinyText ────────────────────────────────────────────── */

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  active?: boolean;
}

export const ShinyText: React.FC<ShinyTextProps> = ({ children, className = '', style, active = true }) => {
  const reduced = usePrefersReducedMotion();

  if (reduced) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }

  return (
    <span className={`rb-shiny-text ${active ? 'is-active' : ''} ${className}`} style={style}>
      {children}
    </span>
  );
};

/* ─── Skeleton ─────────────────────────────────────────────── */

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 'var(--radius-6)',
  className = '',
  style,
}) => (
  <div
    className={`rb-skeleton ${className}`}
    style={{
      width,
      height,
      borderRadius,
      ...style,
    }}
  />
);

/* ─── helpers ──────────────────────────────────────────────── */

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
