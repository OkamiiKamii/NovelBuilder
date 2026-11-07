import { useEffect, useState } from 'react';

interface CoverProps {
  title: string;
  cover: string | null;
  accent: string;
  className?: string;
}

/** Cover image, falling back to a coloured block when there is none or it fails to load. */
export function Cover({ title, cover, accent, className = '' }: CoverProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [cover]);

  return (
    <div className={`cover ${className}`} style={{ '--accent': accent } as React.CSSProperties}>
      {cover && !broken ? (
        <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{title.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </div>
  );
}
