import { badgeOf, type OverlayMark } from '../overlay';

/**
 * A canon and continuity marker on a drawing: on a mark, a node, a line or a
 * cell. A glyph says what it is (never colour alone) and a number counts the
 * findings. Hidden from screen readers: the same words are in the name of
 * what it sits on, and in every list.
 */
export function MarkBadge({ mark, x, y }: { mark: OverlayMark | null | undefined; x: number; y: number }) {
  const badge = badgeOf(mark);
  if (!badge) return null;
  const width = 8 + badge.glyph.length * 7;
  return (
    <g className={`mk-badge mk-${badge.tone}`} transform={`translate(${x} ${y})`} aria-hidden="true">
      {/* Critical is squared, the others rounded (information also has a dashed edge): severity by shape, not colour alone. */}
      <rect x={-width / 2} y={-8} width={width} height={16} rx={badge.tone === 'critical' ? 2 : 8} />
      <text textAnchor="middle" dy="0.35em">
        {badge.glyph}
      </text>
    </g>
  );
}
