import React from 'react';

type AvatarSize = 'sm' | 'md' | 'lg';

interface AvatarProps {
  children?: React.ReactNode;
  size?: AvatarSize;
  src?: string;
  alt?: string;
  style?: React.CSSProperties;
}

const sizeMap: Record<AvatarSize, { width: number; height: number; fontSize: string }> = {
  sm: { width: 24, height: 24, fontSize: 'var(--body-sm-font-size)' },
  md: { width: 32, height: 32, fontSize: 'var(--body-base-strong-font-size)' },
  lg: { width: 40, height: 40, fontSize: 'var(--body-base-font-size)' },
};

export const Avatar: React.FC<AvatarProps> = ({ children, size = 'md', src, alt, style }) => {
  const dims = sizeMap[size];

  if (src) {
    return (
      <img
        src={src}
        alt={alt || 'avatar'}
        style={{
          width: dims.width,
          height: dims.height,
          borderRadius: 'var(--radius-full)',
          flexShrink: 0,
          objectFit: 'cover',
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className={`ds-avatar ${size !== 'md' ? `ds-avatar--${size}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dims.width,
        height: dims.height,
        borderRadius: 'var(--radius-full)',
        background: 'var(--bg-overlay-l3)',
        color: 'var(--text-default)',
        fontFamily: 'var(--body-base-strong-font-family)',
        fontSize: dims.fontSize,
        fontWeight: 'var(--body-base-strong-font-weight)',
        lineHeight: 'var(--body-base-strong-line-height)',
        flexShrink: 0,
        ...style,
      }}
    >
      {children || 'U'}
    </div>
  );
};
