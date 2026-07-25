import './StarBorder.css';

interface StarBorderProps {
  className?: string;
  color?: string;
  speed?: string;
  thickness?: number;
  children?: React.ReactNode;
}

export const StarBorder: React.FC<StarBorderProps> = ({
  className = '',
  color = 'var(--bg-brand)',
  speed = '6s',
  thickness = 1,
  children,
}) => {
  return (
    <div
      className={`star-border-container ${className}`}
      style={{
        padding: `${thickness}px 0`,
      }}
    >
      <div
        className="star-border-gradient-bottom"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 25%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="star-border-gradient-top"
        style={{
          background: `radial-gradient(circle, ${color}, transparent 25%)`,
          animationDuration: speed,
        }}
      />
      <div className="star-border-inner">{children}</div>
    </div>
  );
};
