interface PinteLogoProps {
  className?: string;
  variant?: 'plain' | 'tile';
  shape?: 'horizontal' | 'square';
}

export default function PinteLogo({
  className = 'h-8 w-auto',
  variant = 'plain',
  shape = 'horizontal',
}: PinteLogoProps) {
  const image = (
    <img
      src={shape === 'square' ? '/pinte-logo-square.png' : '/pinte-logo.png'}
      alt="PINTE 品特"
      className={`${className} object-contain`}
      draggable={false}
    />
  );

  if (variant === 'tile') {
    return (
      <div className="flex items-center justify-center">
        {image}
      </div>
    );
  }

  return image;
}
