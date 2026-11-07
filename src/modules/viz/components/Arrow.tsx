/** How large an arrowhead is drawn, in the drawing's own units: as tall as the drawing's label text (12). */
export const ARROW_SIZE = 12;

/**
 * The one arrowhead every drawing uses: the same shape, in the colour of its
 * line (a fill, or a class that sets one), and as tall as the drawing's
 * labels. Put it in the drawing's `<defs>` and point a line's `markerEnd` at
 * `url(#id)`. A drawing with larger labels passes their size.
 */
export function ArrowMarker({ id, color, className, size = ARROW_SIZE }: { id: string; color?: string; className?: string; size?: number }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth={size} markerHeight={size} orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" fill={color} className={className} />
    </marker>
  );
}
