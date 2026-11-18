// The open novel as the continuity check reads it: the cast's records (the model, the tracked rules, the author's
// decisions) and the manuscript as saved, checked a moment after the screen is drawn (the whole book is read, so not
// on the first frame) and again whenever a record or the text changes; and the service that changes tracked rules,
// canon fields and decisions. The continuity part of flutter_app/lib/features/review/review_providers.dart.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { type AuditResult, audit } from '../../domain/continuity/audit';
import { type ContinuityChanges } from '../../domain/continuity/continuityChanges';
import { ContinuityService, rulesSaveKey } from '../../domain/continuity/continuityService';
import { ContinuityRule } from '../../domain/continuity/rules';
import { rulesInOrder } from '../../domain/continuity/screens/continuityPage';
import { str } from '../../domain/json';
import { lastNodeSetting } from '../write/WriteScreen';
import { ReviewItem } from '../../domain/records/review';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';
import { useRouter } from 'expo-router';

export type OpenContinuity = {
  open: OpenCast;
  rules: ContinuityRule[];
  /** The check, once read (null before the first reading); the last one is kept while a new one is read. */
  result: AuditResult | null;
  /** A new reading is under way. */
  reading: boolean;
  /** A change made now: a refusal is said, and nothing is saved. Returns the result, or undefined when refused. */
  now: <T>(make: (c: ContinuityChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops, under `rules:<novel>:<key>`; a failure shows on the save pill. */
  later: (key: string, make: (c: ContinuityChanges) => void) => void;
  /** Opens a chapter or scene in Write (the place is remembered as Write's own). */
  openChapter: (nodeId: string) => void;
};

export function useContinuity(): OpenContinuity | null {
  const lib = useLibrary();
  const toast = useToast();
  const router = useRouter();
  const open = useCast();
  const service = useMemo(() => new ContinuityService(lib.novels), [lib]);
  const novelId = open?.novelId ?? null;
  const text = novelId === null ? 0 : lib.novels.versionOf(novelId, ['chapterContents']);
  const rules = useMemo(
    () => (open === null ? [] : rulesInOrder(open.cast.snapshot.rows('continuityRules'), (r) => new ContinuityRule(r))),
    [open?.cast], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [kept, setKept] = useState<{ cast: unknown; text: number; result: AuditResult } | null>(null);
  useEffect(() => {
    if (open === null) return;
    const cast = open.cast;
    let live = true;
    const t = setTimeout(() => {
      const docs = new Map(lib.novels.rowsIn(cast.novelId, 'chapterContents').map((r) => [str(r['id']), r['doc']] as const));
      const decisions = cast.snapshot.rows('continuityResolutions').map((r) => new ReviewItem(r));
      const result = audit(cast.model, docs, rules, decisions);
      if (live) setKept({ cast, text, result });
    }, 30);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open?.cast, text, rules]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = useCallback(
    <T,>(make: (c: ContinuityChanges) => T): T | undefined => {
      if (novelId === null) return undefined;
      try {
        return service.change(novelId, make);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), { error: true });
        return undefined;
      }
    },
    [service, novelId, toast],
  );
  const later = useCallback(
    (key: string, make: (c: ContinuityChanges) => void) => {
      if (novelId === null) return;
      lib.saves.schedule(rulesSaveKey(novelId, key), () => service.change(novelId, make));
    },
    [lib, service, novelId],
  );
  const openChapter = useCallback(
    (nodeId: string) => {
      if (novelId === null) return;
      lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
      router.navigate('/write');
    },
    [lib, router, novelId],
  );

  if (open === null) return null;
  const fresh = kept !== null && kept.cast === open.cast && kept.text === text;
  return { open, rules, result: kept?.result ?? null, reading: !fresh, now, later, openChapter };
}
