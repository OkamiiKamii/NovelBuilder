import type { ReactNode } from 'react';
import { limitedLine } from '../notice';

interface ViewHeaderProps {
  title: string;
  /** One line on what the view shows and what it is drawn from. */
  description?: string;
  /** How much is shown, when a filter or a limit shows only part of it. */
  count?: { shown: number; total: number };
  /** Buttons and switches for the whole view: the visual/list switch, export… */
  actions?: ReactNode;
}

/** The top of a visual view: what it is, what it is drawn from, and whether all of it is showing. */
export function ViewHeader({ title, description, count, actions }: ViewHeaderProps) {
  const limited = count ? limitedLine(count.shown, count.total) : null;
  return (
    <header className="page-header viz-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
        {limited && (
          <p className="muted small" role="status">
            {limited}
          </p>
        )}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
