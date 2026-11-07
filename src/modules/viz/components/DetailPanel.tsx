import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { NARROW } from '../breakpoints';

/** Below NARROW the details open as a sheet over the view, as on the Relationships and Timeline pages. */
export { NARROW };

interface DetailPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The details of what is selected: beside the view on a wide screen, as a
 * sheet over it on a narrow one. Escape closes it either way; when it opens
 * beside the view, focus moves to its heading so a screen reader hears it.
 */
export function DetailPanel({ title, onClose, children }: DetailPanelProps) {
  const narrow = useMediaQuery(NARROW);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  // What had focus before the panel took it (the mark or name selected): focus goes back there when the panel closes.
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (narrow) return;
    if (!panel.current?.contains(document.activeElement)) opener.current = document.activeElement;
    heading.current?.focus();
  }, [narrow, title]);
  // As the panel closes, while it is still in the page: if focus is in it (or nowhere), it goes back.
  useLayoutEffect(() => {
    const own = panel.current;
    return () => {
      const back = opener.current;
      const active = document.activeElement;
      const lost = !active || active === document.body || !active.isConnected || Boolean(own?.contains(active));
      if (lost && (back instanceof HTMLElement || back instanceof SVGElement) && back.isConnected && !own?.contains(back)) back.focus();
    };
  }, [narrow]);
  if (narrow) {
    return (
      <Modal title={title} onClose={onClose}>
        {children}
      </Modal>
    );
  }
  return (
    <aside ref={panel} className="panel rel-drawer viz-detail" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <header className="viz-detail-header">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" className="btn ghost icon" aria-label={`Close ${title}`} onClick={onClose}>
          ✕
        </button>
      </header>
      {children}
    </aside>
  );
}

/** A view with an optional detail panel: side by side when there is room, the panel as a sheet when there is not. */
export function VizLayout({ children, detail }: { children: ReactNode; detail: ReactNode | null }) {
  const narrow = useMediaQuery(NARROW);
  return (
    <div className={`rel-body viz-body${detail && !narrow ? ' with-details' : ''}`}>
      <div className="stack viz-main">{children}</div>
      {detail}
    </div>
  );
}
