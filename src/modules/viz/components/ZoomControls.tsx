import type { ZoomCommand } from '../zoom';

interface ZoomControlsProps {
  /** The current scale, 1 being actual size. */
  scale: number;
  onCommand: (command: ZoomCommand) => void;
  /** What is being zoomed, for the buttons' names: "the relationship map". */
  of: string;
}

/** Zoom in, zoom out and fit, as real buttons, with the scale read out when it changes. Keys do the same on the focused drawing. */
export function ZoomControls({ scale, onCommand, of }: ZoomControlsProps) {
  return (
    <div className="viz-zoom" role="group" aria-label={`Zoom ${of}`}>
      <button type="button" className="btn ghost icon" aria-label={`Zoom in on ${of}`} title="Zoom in (+)" onClick={() => onCommand('in')}>
        +
      </button>
      <button type="button" className="btn ghost icon" aria-label={`Zoom out of ${of}`} title="Zoom out (−)" onClick={() => onCommand('out')}>
        −
      </button>
      <button type="button" className="btn ghost" aria-label={`Fit ${of} to the space`} title="Fit (0)" onClick={() => onCommand('fit')}>
        Fit
      </button>
      <span className="muted small viz-scale" aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
    </div>
  );
}
