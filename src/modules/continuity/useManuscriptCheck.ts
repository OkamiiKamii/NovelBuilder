import { useEffect, useState } from 'react';
import { continuity } from '@/core';
import type { AuditResult } from './audit';

export interface ManuscriptCheck {
  state: 'checking' | 'checked' | 'failed';
  /** The last check's result; null before the first. */
  result: AuditResult | null;
  at: number | null;
  error: string | null;
}

/**
 * The continuity check of the manuscript, run while `on`: when it comes on,
 * again when anything in `after` changes (the records, the rules, the
 * decisions), and when asked. It reads every chapter's saved text and
 * changes nothing.
 */
export function useManuscriptCheck(projectId: string, on: boolean, after: unknown[]): ManuscriptCheck & { recheck: () => void } {
  const [check, setCheck] = useState<ManuscriptCheck>({ state: 'checking', result: null, at: null, error: null });
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    if (!on) return;
    let live = true;
    setCheck((c) => (c.state === 'checking' ? c : { ...c, state: 'checking' }));
    // A moment's wait, so a burst of changes is checked once.
    const timer = setTimeout(() => {
      void continuity
        .forProject(projectId)
        .run()
        .then(
          (result) => live && setCheck({ state: 'checked', result, at: Date.now(), error: null }),
          (e) => live && setCheck((c) => ({ ...c, state: 'failed', error: e instanceof Error ? e.message : String(e) })),
        );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [on, projectId, asked, ...after]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...check, recheck: () => setAsked((n) => n + 1) };
}
