import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { isViewOn, viewLabel, viewOfPath, viewsOn } from './modules';

/** The views the open novel has turned off. */
export const useViewsOff = (): string[] => useCurrentProject().viewsOff ?? [];

/** Whether a page may be offered: anything but a view this novel has turned off (or Visualize itself, with every view off). */
export function useLinkAllowed(): (to: string) => boolean {
  const off = useViewsOff();
  return (to) => {
    const key = viewOfPath(to);
    if (key) return isViewOn(off, key);
    return /\/visualize\/?(\?|$)/.test(to) ? viewsOn(off).length > 0 : true;
  };
}

/** Shows what it holds only while a view is on: a sentence about a view, with its link. */
export function IfViewOn({ view, children }: { view: string; children: ReactNode }) {
  return isViewOn(useViewsOff(), view) ? <>{children}</> : null;
}

/**
 * A link into a view, offered only while that view is on. With the view off
 * it is left out; with `said`, it says the view is off instead, for a place
 * that tells the author where something lives.
 */
export function ViewLink({ to, said, children, ...rest }: Omit<LinkProps, 'to'> & { to: string; said?: boolean }) {
  const allowed = useLinkAllowed();
  if (allowed(to)) {
    return (
      <Link to={to} {...rest}>
        {children}
      </Link>
    );
  }
  if (!said) return null;
  const key = viewOfPath(to);
  return (
    <span className="muted">
      {children} ({key ? `the ${viewLabel(key)} view is turned off in this novel` : 'every view is turned off in this novel'})
    </span>
  );
}
