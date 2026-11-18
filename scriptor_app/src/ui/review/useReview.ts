// The review of the open novel (every check's warnings, with the author's decisions), read again whenever the novel
// changes; and the record check's fixes and decisions. A port of reviewDataProvider and ReviewActions' decide/reopen in
// flutter_app/lib/features/review/review_providers.dart, and the record check's IntegrityService.
//
// The review reads the whole book (the manuscript check reads every paragraph), so it is worked out a moment after the
// page is drawn, and kept while the cast and the text are the same: going back to Review with nothing written since
// does not check the whole book again.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { IntegrityService } from '../../domain/integrity/integrityService';
import type { MergePlan } from '../../domain/integrity/fixes';
import { str } from '../../domain/json';
import { type ReviewDecision } from '../../domain/records/review';
import { ReviewData } from '../../domain/review/reviewData';
import type { CastData } from '../../domain/characters/castData';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';

/** The review last made: kept while the app runs (the same cast and no chapter written since is the same review). */
const kept: { cast: CastData | null; text: number; data: ReviewData | null } = { cast: null, text: -1, data: null };

export type OpenReview = {
  novelId: string;
  open: OpenCast;
  /** Null while the book is being read. */
  data: ReviewData | null;
  service: IntegrityService;
  /** Keeps the author's decision about a finding, replacing any earlier one. True when kept. */
  decide: (key: string, message: string, kind: ReviewDecision, note?: string, nodeId?: string | null) => boolean;
  /** Withdraws a decision, so the finding is raised again if it still applies. */
  reopen: (decisionId: string) => void;
  /** A fix of the record check: said when it does not happen, and nothing is changed. */
  run: (what: string, fix: () => void) => void;
  mergePlan: (keepId: string, mergeId: string) => { plan: MergePlan | null; problem: string | null };
};

export function useReview(): OpenReview | null {
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const service = useMemo(() => new IntegrityService(lib.novels, lib.backups), [lib]);
  const novelId = open?.novelId ?? null;
  const text = novelId === null ? -1 : lib.novels.versionOf(novelId, ['chapterContents']);
  const fresh = open !== null && kept.cast === open.cast && kept.text === text ? kept.data : null;
  const [data, setData] = useState<ReviewData | null>(fresh);

  useEffect(() => {
    if (open === null || novelId === null) return;
    if (kept.cast === open.cast && kept.text === text && kept.data !== null) {
      setData(kept.data);
      return;
    }
    const t = setTimeout(() => {
      const docs = new Map(lib.novels.rowsIn(novelId, 'chapterContents').map((r) => [str(r['id']), r['doc']]));
      const made = new ReviewData(novelId, open.cast.snapshot, open.cast.model, docs);
      kept.cast = open.cast;
      kept.text = text;
      kept.data = made;
      setData(made);
    }, 30);
    return () => clearTimeout(t);
  }, [open?.cast, text, novelId, lib]); // eslint-disable-line react-hooks/exhaustive-deps

  const tell = useCallback((e: unknown) => toast(e instanceof Error ? e.message : String(e), { error: true }), [toast]);
  const decide = useCallback(
    (key: string, message: string, kind: ReviewDecision, note = '', nodeId: string | null = null) => {
      if (novelId === null) return false;
      try {
        service.decide(novelId, key, message, kind, { note, nodeId });
        return true;
      } catch (e) {
        tell(e);
        return false;
      }
    },
    [service, novelId, tell],
  );
  const reopen = useCallback(
    (decisionId: string) => {
      if (novelId === null) return;
      try {
        service.reopen(novelId, decisionId);
      } catch (e) {
        tell(e);
      }
    },
    [service, novelId, tell],
  );
  const run = useCallback(
    (what: string, fix: () => void) => {
      try {
        fix();
      } catch (e) {
        toast(`${what} did not happen, and nothing was changed: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      }
    },
    [toast],
  );
  const mergePlan = useCallback(
    (keepId: string, mergeId: string) => {
      if (novelId === null) return { plan: null, problem: 'No novel is open.' };
      try {
        return { plan: service.mergePlan(novelId, keepId, mergeId), problem: null };
      } catch (e) {
        return { plan: null, problem: e instanceof Error ? e.message : String(e) };
      }
    },
    [service, novelId],
  );

  if (open === null || novelId === null) return null;
  const shown = data !== null && kept.cast === open.cast && kept.text === text ? data : fresh;
  return { novelId, open, data: shown, service, decide, reopen, run, mergePlan };
}

/** The open novel's title, for a review page's heading. */
export function useOpenNovelTitle(): string | undefined {
  const open = useCast();
  return open?.cast.novelTitle;
}
