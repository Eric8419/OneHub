import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';

interface GradualBlurProps {
  position?: 'top' | 'bottom';
  height?: string;
  strength?: number;
  divCount?: number;
  exponential?: boolean;
  curve?: 'linear' | 'bezier' | 'ease-in' | 'ease-out';
  opacity?: number;
  animated?: boolean | 'scroll';
  duration?: string;
  easing?: string;
  hoverIntensity?: number;
  target?: 'parent' | 'page';
  zIndex?: number;
  onAnimationComplete?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const CURVE_FUNCTIONS: Record<string, (p: number) => number> = {
  linear: (p) => p,
  bezier: (p) => p * p * (3 - 2 * p),
  'ease-in': (p) => p * p,
  'ease-out': (p) => 1 - Math.pow(1 - p, 2),
};

const getGradientDirection = (position: string) =>
  ({ top: 'to top', bottom: 'to bottom', left: 'to left', right: 'to right' })[position] || 'to bottom';

export const GradualBlur: React.FC<GradualBlurProps> = ({
  position = 'bottom',
  height = '6rem',
  strength = 2,
  divCount = 5,
  exponential = false,
  curve = 'linear',
  opacity = 1,
  animated = false,
  duration = '0.3s',
  easing = 'ease-out',
  hoverIntensity,
  target = 'parent',
  zIndex = 1000,
  onAnimationComplete,
  className = '',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(animated !== 'scroll');

  // Scroll-triggered visibility
  useEffect(() => {
    if (animated !== 'scroll' || !containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [animated]);

  // onAnimationComplete callback
  useEffect(() => {
    if (isVisible && animated === 'scroll' && onAnimationComplete) {
      const ms = parseFloat(duration) * 1000;
      const timer = setTimeout(() => onAnimationComplete(), ms);
      return () => clearTimeout(timer);
    }
  }, [isVisible, animated, onAnimationComplete, duration]);

  const handleMouseEnter = useCallback(() => {
    if (hoverIntensity) setIsHovered(true);
  }, [hoverIntensity]);

  const handleMouseLeave = useCallback(() => {
    if (hoverIntensity) setIsHovered(false);
  }, [hoverIntensity]);

  const blurDivs = useMemo(() => {
    const divs: React.ReactElement[] = [];
    const increment = 100 / divCount;
    const currentStrength =
      isHovered && hoverIntensity ? strength * hoverIntensity : strength;
    const curveFunc = CURVE_FUNCTIONS[curve] || CURVE_FUNCTIONS.linear;

    for (let i = 1; i <= divCount; i++) {
      let progress = i / divCount;
      progress = curveFunc(progress);

      let blurValue: number;
      if (exponential) {
        blurValue = Math.pow(2, progress * 4) * 0.0625 * currentStrength;
      } else {
        blurValue = 0.0625 * (progress * divCount + 1) * currentStrength;
      }

      const p1 = Math.round((increment * i - increment) * 10) / 10;
      const p2 = Math.round(increment * i * 10) / 10;
      const p3 = Math.round((increment * i + increment) * 10) / 10;
      const p4 = Math.round((increment * i + increment * 2) * 10) / 10;

      let gradient = `transparent ${p1}%, black ${p2}%`;
      if (p3 <= 100) gradient += `, black ${p3}%`;
      if (p4 <= 100) gradient += `, transparent ${p4}%`;

      const direction = getGradientDirection(position);

      const divStyle: React.CSSProperties = {
        position: 'absolute',
        inset: 0,
        maskImage: `linear-gradient(${direction}, ${gradient})`,
        WebkitMaskImage: `linear-gradient(${direction}, ${gradient})`,
        backdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        WebkitBackdropFilter: `blur(${blurValue.toFixed(3)}rem)`,
        opacity,
        transition:
          animated && animated !== 'scroll'
            ? `backdrop-filter ${duration} ${easing}`
            : undefined,
      };

      divs.push(<div key={i} style={divStyle} />);
    }

    return divs;
  }, [divCount, strength, isHovered, hoverIntensity, curve, exponential, opacity, animated, duration, easing, position]);

  const isPageTarget = target === 'page';
  const isVertical = ['top', 'bottom'].includes(position);

  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      position: isPageTarget ? 'fixed' : 'absolute',
      pointerEvents: hoverIntensity ? 'auto' : 'none',
      opacity: isVisible ? 1 : 0,
      transition: animated ? `opacity ${duration} ${easing}` : undefined,
      zIndex: isPageTarget ? zIndex + 100 : zIndex,
      ...(isVertical ? { height, width: '100%', [position]: 0, left: 0, right: 0 } : {}),
      ...style,
    }),
    [isPageTarget, isVertical, hoverIntensity, isVisible, animated, duration, easing, zIndex, height, position, style],
  );

  return (
    <div
      ref={containerRef}
      className={`gradual-blur ${className}`}
      style={containerStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {blurDivs}
      </div>
    </div>
  );
};
