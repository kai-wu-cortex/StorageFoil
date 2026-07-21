interface PinteLogoProps {
  className?: string;
  variant?: 'plain' | 'tile';
}

export default function PinteLogo({
  className = 'h-8 w-auto',
  variant = 'plain',
}: PinteLogoProps) {
  const image = (
    <img
      src="/pinte-logo.png"
      alt="PINTE 品特"
      className={`${className} object-contain`}
      draggable={false}
    />
  );

  if (variant === 'tile') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
        {image}
      </div>
    );
  }

  return image;
}

