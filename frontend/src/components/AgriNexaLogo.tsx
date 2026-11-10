interface AgriNexaLogoProps {
  className?: string;
  size?: number;
  variant?: 'navbar' | 'intro' | 'footer' | 'custom';
  color?: string;
  alt?: string;
  animated?: boolean;
}

export function AgriNexaLogo({
  className = '',
  size,
  variant = 'navbar',
  color: _color,
  alt = 'AgriNexa AI logo',
  animated = true,
}: AgriNexaLogoProps) {
  // Determine standard pixel dimension by variant or custom size
  const dimension = size ?? (variant === 'intro' ? 56 : variant === 'footer' ? 28 : 36);

  const imgClass =
    variant === 'intro'
      ? 'intro-logo-img'
      : variant === 'footer'
      ? 'footer-logo-img'
      : 'navbar-logo-img';

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden ${
        animated ? 'animate-logo-float' : ''
      } ${className}`}
      style={{
        width: dimension,
        height: dimension,
        minWidth: dimension,
        minHeight: dimension,
        maxWidth: dimension,
        maxHeight: dimension,
      }}
    >
      <img
        src="/agrinexa-logo.png"
        alt={alt}
        width={dimension}
        height={dimension}
        className={`${imgClass} object-contain select-none`}
        style={{
          width: dimension,
          height: dimension,
          maxWidth: dimension,
          maxHeight: dimension,
        }}
        loading="eager"
        draggable={false}
      />
    </span>
  );
}

export default AgriNexaLogo;
