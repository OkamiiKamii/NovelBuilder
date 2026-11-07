import { useEffect, useState } from 'react';

interface PortraitProps {
  name: string;
  image: string | null;
  focal?: { x: number; y: number };
  className?: string;
  /** Said to screen readers. Left empty where the name is right beside it. */
  alt?: string;
}

/** A character's portrait, cropped around its focal point; or their initial on a plain ground when they have none. */
export function Portrait({ name, image, focal = { x: 50, y: 30 }, className = '', alt = '' }: PortraitProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [image]);
  return (
    <span className={`portrait ${className}`}>
      {image && !broken ? (
        <img src={image} alt={alt} loading="lazy" referrerPolicy="no-referrer" style={{ objectPosition: `${focal.x}% ${focal.y}%` }} onError={() => setBroken(true)} />
      ) : (
        <span className="portrait-none" role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}
