import { useId, type ReactNode } from 'react';
import { useZoomPan } from '../hooks';
import type { Bounds, View } from '../zoom';
import { ZoomControls } from './ZoomControls';

interface ViewportProps {
  /** What the drawing is: "Relationship map of 12 characters". */
  label: string;
  /** The extent of what is drawn, in the drawing's own units, for fitting. Null while there is nothing to draw. */
  bounds: Bounds | null;
  /** Drawn in the drawing's own units; the view is passed along for marks that keep their screen size (labels). */
  children: (view: View) => ReactNode;
  /** For the zoom buttons' names: "the map". */
  of?: string;
  height?: string;
}

/**
 * A drawing that can be zoomed and panned with the mouse, a finger or two,
 * the wheel, or the keyboard. It is one stop in the tab order; its marks can
 * take focus inside it. The keys are written out for screen readers.
 */
export function Viewport({ label, bounds, children, of = 'the drawing', height = 'min(70vh, 640px)' }: ViewportProps) {
  const { ref, size, view, command, handlers } = useZoomPan(bounds);
  const help = useId();
  return (
    <div className="viz-viewport-wrap">
      <ZoomControls scale={view.k} onCommand={command} of={of} />
      <div ref={ref} className="viz-viewport" style={{ height }} tabIndex={0} role="group" aria-roledescription="zoomable drawing" aria-label={label} aria-describedby={help} {...handlers}>
        <svg width={size.width} height={size.height} aria-hidden={!size.width}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>{children(view)}</g>
        </svg>
      </div>
      <p id={help} className="visually-hidden">
        Drag or use the arrow keys to move around, plus and minus to zoom, 0 to fit everything in. The list view shows the same records as text.
      </p>
    </div>
  );
}
