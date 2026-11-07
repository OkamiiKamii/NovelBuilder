import { useEffect, useState } from 'react';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { PHONE } from '../breakpoints';

export type SwatchShape = 'circle' | 'square' | 'diamond' | 'line' | 'dashed' | 'arrow' | 'hatched' | 'fade' | 'dotted' | 'dashdot' | 'longdash' | 'thin' | 'half' | 'outline' | 'empty' | 'cross' | 'dots' | 'ring' | 'triangle' | 'dot' | 'double';

export interface LegendItem {
  key: string;
  label: string;
  /** A CSS colour; a variable (`var(--accent)`) follows the light or dark theme. */
  color: string;
  /** Shape as well as colour, so nothing is told by colour alone. */
  shape: SwatchShape;
  description?: string;
  /** A letter code drawn on the marks too ("C" for characters), where several kinds share a shape. */
  glyph?: string;
}

function Swatch({ color, shape }: Pick<LegendItem, 'color' | 'shape'>) {
  return (
    <svg className="viz-swatch" width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
      {shape === 'circle' && <circle cx="11" cy="7" r="5" fill={color} />}
      {shape === 'square' && <rect x="6" y="2" width="10" height="10" rx="2" fill={color} />}
      {shape === 'diamond' && <path d="M11 1 L17 7 L11 13 L5 7 Z" fill={color} />}
      {shape === 'line' && <line x1="2" y1="7" x2="20" y2="7" stroke={color} strokeWidth="3" />}
      {shape === 'dashed' && <line x1="2" y1="7" x2="20" y2="7" stroke={color} strokeWidth="3" strokeDasharray="4 3" />}
      {shape === 'dotted' && <line x1="3" y1="7" x2="20" y2="7" stroke={color} strokeWidth="3" strokeDasharray="0.1 4" strokeLinecap="round" />}
      {shape === 'dashdot' && <line x1="1" y1="7" x2="21" y2="7" stroke={color} strokeWidth="2.5" strokeDasharray="6 2 1.5 2" />}
      {shape === 'longdash' && <line x1="1" y1="7" x2="21" y2="7" stroke={color} strokeWidth="2.5" strokeDasharray="8 3" />}
      {shape === 'thin' && <line x1="2" y1="7" x2="20" y2="7" stroke={color} strokeWidth="1" opacity="0.7" />}
      {shape === 'double' && (
        <>
          <line x1="2" y1="4.8" x2="20" y2="4.8" stroke={color} strokeWidth="1.6" />
          <line x1="2" y1="9.2" x2="20" y2="9.2" stroke={color} strokeWidth="1.6" />
        </>
      )}
      {shape === 'arrow' && <path d="M2 7 H17 M13 3 L18 7 L13 11" stroke={color} strokeWidth="2" fill="none" />}
      {shape === 'hatched' && (
        <>
          <rect x="2" y="3" width="18" height="8" rx="1" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
          <path d="M5 11 L9 3 M10 11 L14 3 M15 11 L19 3" stroke={color} strokeWidth="1.5" />
        </>
      )}
      {shape === 'ring' && <circle cx="11" cy="7" r="4.5" fill="none" stroke={color} strokeWidth="2.2" />}
      {shape === 'triangle' && <path d="M11 2 L16.5 12 L5.5 12 Z" fill={color} />}
      {shape === 'dot' && <circle cx="11" cy="7" r="2.5" fill={color} />}
      {shape === 'half' && (
        <>
          <rect x="5" y="2" width="12" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          <rect x="5" y="2" width="6" height="10" rx="1" fill={color} />
        </>
      )}
      {shape === 'outline' && <rect x="5.5" y="2.5" width="11" height="9" rx="2" fill="none" stroke={color} strokeWidth="1.5" />}
      {shape === 'empty' && <rect x="5.5" y="2.5" width="11" height="9" rx="2" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" />}
      {shape === 'cross' && (
        <>
          <rect x="5" y="2" width="12" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M5 2 L17 12 M17 2 L5 12" stroke={color} strokeWidth="1.5" />
        </>
      )}
      {shape === 'dots' && (
        <>
          <rect x="5" y="2" width="12" height="10" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
          {[8, 11, 14].map((x) => [5, 9].map((y) => <circle key={x + '-' + y} cx={x} cy={y} r="1.1" fill={color} />))}
        </>
      )}
      {shape === 'fade' && (
        <>
          <rect x="2" y="4" width="6" height="6" fill={color} />
          <rect x="9" y="5" width="3" height="4" fill={color} opacity="0.6" />
          <rect x="13" y="5" width="3" height="4" fill={color} opacity="0.35" />
          <rect x="17" y="5" width="3" height="4" fill={color} opacity="0.15" />
        </>
      )}
    </svg>
  );
}

/**
 * What the marks of a view mean: each with a shape and a name, never a colour
 * alone. Always under the drawing, under its title; it can be folded away, and
 * starts folded on a phone, where room is short.
 */
export function Legend({ title, items }: { title: string; items: LegendItem[] }) {
  const phone = useMediaQuery(PHONE);
  const [open, setOpen] = useState(!phone);
  // Turning a tablet into a phone-sized window folds it; the author's own folding is kept otherwise.
  useEffect(() => setOpen(!phone), [phone]);
  if (!items.length) return null;
  return (
    <figure className="viz-legend">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="muted small">{title}</summary>
        <ul>
          {items.map((item) => (
            <li key={item.key} title={item.description}>
              <Swatch color={item.color} shape={item.shape} />
              {item.glyph && (
                <b className="viz-glyph" aria-hidden="true">
                  {item.glyph}
                </b>
              )}
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </details>
    </figure>
  );
}
