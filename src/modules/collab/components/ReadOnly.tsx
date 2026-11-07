import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Shows its contents for reading. Every place something could be typed is
 * switched off, and stays off as the page changes; buttons and links are
 * left alone, because a reviewer still has to open things, expand them and
 * move about. A button that would change something is stopped where all
 * changes are checked, in the database, and says why.
 */
export function ReadOnlyScope({ active, className = '', children }: { active: boolean; className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fields = 'input:not([type="search"]), textarea';
    if (!active) {
      el.querySelectorAll<HTMLInputElement>('[data-locked]').forEach((field) => {
        field.disabled = false;
        delete field.dataset.locked;
      });
      return;
    }
    const lock = () =>
      el.querySelectorAll<HTMLInputElement>(fields).forEach((field) => {
        if (field.disabled) return;
        field.disabled = true;
        field.dataset.locked = '';
      });
    lock();
    const observer = new MutationObserver(lock);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);
  return (
    <div ref={root} className={`readonly-scope ${className}`} data-readonly={active || undefined}>
      {children}
    </div>
  );
}
