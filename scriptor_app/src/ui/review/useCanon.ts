// The open novel as the canon, timeline review and knowledge pages read it (the cast's records: canon statements, the
// author's decisions, secrets), the canon review worked out from them once per change, and the canon service that
// changes them. The canon part of flutter_app/lib/features/review/review_providers.dart (ReviewData's canon and
// decisions, ReviewActions' canon changes, decide and reopen).

import { useCallback, useMemo } from 'react';

import { type CanonChanges } from '../../domain/canon/canonChanges';
import { CanonService, canonSaveKey } from '../../domain/canon/canonService';
import { type FactPair, type FactReview, reviewCanon } from '../../domain/canon/review';
import { CharacterSecret } from '../../domain/characters/characterRecords';
import { CanonFact } from '../../domain/records/canon';
import { type ReviewDecision, ReviewItem } from '../../domain/records/review';
import { useLibrary } from '../LibraryContext';
import { useToast } from '../toast';
import { type OpenCast, useCast } from '../organize/useCast';

export type OpenCanon = {
  novelId: string;
  open: OpenCast;
  facts: CanonFact[];
  reviews: FactReview[];
  pairs: FactPair[];
  decisions: ReviewItem[];
  secrets: CharacterSecret[];
  service: CanonService;
  decisionOf: (key: string) => ReviewItem | null;
  /** A change made now: a refusal is said, and nothing is saved. */
  now: <T>(make: (c: CanonChanges) => T) => T | undefined;
  /** Typing: saved a moment after it stops; a refusal is said as "Not saved: <why>". */
  later: (key: string, make: (c: CanonChanges) => void) => void;
  /** Keeps the author's decision about a finding, replacing any earlier one. */
  decide: (key: string, message: string, kind: ReviewDecision, note?: string) => void;
  /** Withdraws a decision, so the finding is raised again if it still applies. */
  reopen: (decisionId: string) => void;
};

export function useCanon(): OpenCanon | null {
  const lib = useLibrary();
  const toast = useToast();
  const open = useCast();
  const service = useMemo(() => new CanonService(lib.novels), [lib]);
  const novelId = open?.novelId ?? null;
  const read = useMemo(() => {
    if (!open) return null;
    const s = open.cast.snapshot;
    const model = open.cast.model;
    const facts = s.rows('canonFacts').map((r) => new CanonFact(r));
    const { reviews, pairs } = reviewCanon(facts, [...model.entries.values()], [...model.nodes.values()], (k) => model.categories.get(k) ?? null);
    return {
      facts,
      reviews,
      pairs,
      decisions: s.rows('continuityResolutions').map((r) => new ReviewItem(r)),
      secrets: s.rows('characterSecrets').map((r) => new CharacterSecret(r)),
    };
  }, [open?.cast]); // eslint-disable-line react-hooks/exhaustive-deps

  const tell = useCallback((e: unknown, prefix = '') => toast(`${prefix}${e instanceof Error ? e.message : String(e)}`, { error: true }), [toast]);
  const now = useCallback(
    <T,>(make: (c: CanonChanges) => T): T | undefined => {
      if (!novelId) return undefined;
      try {
        return service.canon(novelId, make);
      } catch (e) {
        tell(e);
        return undefined;
      }
    },
    [service, novelId, tell],
  );
  const later = useCallback(
    (key: string, make: (c: CanonChanges) => void) => {
      if (!novelId) return;
      lib.saves.schedule(canonSaveKey(novelId, key), () => {
        try {
          service.canon(novelId, make);
        } catch (e) {
          tell(e, 'Not saved: ');
        }
      });
    },
    [lib, service, novelId, tell],
  );
  const decide = useCallback(
    (key: string, message: string, kind: ReviewDecision, note = '') => {
      if (!novelId) return;
      try {
        service.decide(novelId, key, message, kind, { note });
      } catch (e) {
        tell(e);
      }
    },
    [service, novelId, tell],
  );
  const reopen = useCallback(
    (decisionId: string) => {
      if (!novelId) return;
      try {
        service.reopen(novelId, decisionId);
      } catch (e) {
        tell(e);
      }
    },
    [service, novelId, tell],
  );

  if (!open || !read || !novelId) return null;
  const decisionOf = (key: string) => read.decisions.find((d) => d.key === key) ?? null;
  return { novelId, open, ...read, service, decisionOf, now, later, decide, reopen };
}
