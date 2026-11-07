import type { ReactNode } from 'react';
import type { Undecided } from '@/modules/model/query';
import { undecidedLines } from '../notice';

export type ViewStatus = { kind: 'loading' } | { kind: 'error'; message: string; onRetry?: () => void } | { kind: 'empty'; message: string; action?: ReactNode } | { kind: 'no-results'; onClearFilters: () => void } | { kind: 'ready' };

interface VizStateProps {
  status: ViewStatus;
  /** Records the filters could not decide about; each reason is said under the view. */
  undecided?: Undecided[];
  children?: ReactNode;
}

/**
 * Everything a view can be besides drawn: still loading, failed, empty
 * because nothing has been recorded yet, or empty because the filters match
 * nothing. Under a drawn view it lists what was left out for want of data.
 */
export function VizState({ status, undecided = [], children }: VizStateProps) {
  switch (status.kind) {
    case 'loading':
      return (
        <div className="viz-state" role="status" aria-live="polite">
          <p className="muted">Loading…</p>
        </div>
      );
    case 'error':
      return (
        <div className="viz-state empty" role="alert">
          <p>This view could not be shown: {status.message}</p>
          <p className="muted small">Nothing has been changed. Your records are where they were.</p>
          {status.onRetry && (
            <button type="button" className="btn" onClick={status.onRetry}>
              Try again
            </button>
          )}
        </div>
      );
    case 'empty':
      return (
        <div className="viz-state empty">
          <p className="muted">{status.message}</p>
          {status.action}
        </div>
      );
    case 'no-results':
      return (
        <div className="viz-state empty" role="status">
          <p className="muted">Nothing matches these filters.</p>
          <button type="button" className="btn" onClick={status.onClearFilters}>
            Clear filters
          </button>
          <Undecided lines={undecidedLines(undecided)} />
        </div>
      );
    case 'ready':
      return (
        <>
          {children}
          <Undecided lines={undecidedLines(undecided)} />
        </>
      );
  }
}

function Undecided({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <ul className="viz-undecided muted small" aria-label="Not shown">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
