import { useEffect, useState, type CSSProperties } from 'react';
import { useCategories } from '../categories';
import type { LoreCategory, LoreEntry } from '../types';

const tint = (color: string) => ({ '--cat': color }) as CSSProperties;

export function CategoryBadge({ category }: { category: LoreCategory }) {
  const kind = useCategories().get(category);
  return (
    <span className="cat" style={tint(kind.color)}>
      {kind.singular}
    </span>
  );
}

/** Entry image, or a coloured initial when there is none or it fails to load. */
export function EntryThumb({ entry, className = '' }: { entry: Pick<LoreEntry, 'name' | 'image' | 'category'>; className?: string }) {
  const kind = useCategories().get(entry.category);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [entry.image]);
  return (
    <span className={`thumb ${className}`} style={tint(kind.color)}>
      {entry.image && !broken ? (
        <img src={entry.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span aria-hidden="true">{entry.name.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </span>
  );
}
