// Everything the continuity review reads, gathered once for a version of the novel: the shared model, canon statements,
// tracked rules, the author's decisions, secrets, journeys' settings, and the manuscript check. Reads only. A port of
// ReviewData in flutter_app/lib/features/review/review_providers.dart (the marks it lays over the views are the canon
// overlay's, not gathered here).

import { checkRecords, type RecordFinding } from '../canon/checks';
import { type FactPair, type FactReview, reviewCanon } from '../canon/review';
import { CharacterSecret } from '../characters/characterRecords';
import { type AuditResult, allIssues, audit } from '../continuity/audit';
import { ContinuityRule } from '../continuity/rules';
import { str } from '../json';
import type { StoryModel } from '../model/storyModel';
import { MapPin, WorldMap } from '../places/places';
import { ProgressSnapshot } from '../progression/snapshots';
import { CanonFact } from '../records/canon';
import { strings } from '../records/jsonRecord';
import { ReviewItem, decisionCloses } from '../records/review';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { type ReviewFinding, reviewTimeline } from '../timeline/review';
import { TravelSettings } from '../travel/travel';
import { type ReviewedWarning, type Warning, collectWarnings, withStatus } from './collect';

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class ReviewData {
  readonly facts: CanonFact[];
  readonly rules: ContinuityRule[];
  readonly decisions: ReviewItem[];
  readonly secrets: CharacterSecret[];
  readonly manuscript: AuditResult;

  constructor(
    readonly novelId: string,
    readonly snapshot: NovelSnapshot,
    readonly model: StoryModel,
    docs: ReadonlyMap<string, unknown>,
  ) {
    this.facts = snapshot.rows('canonFacts').map((r) => new CanonFact(r));
    this.rules = snapshot
      .rows('continuityRules')
      .map((r) => new ContinuityRule(r))
      .sort((a, b) => {
        const c = a.createdAt - b.createdAt;
        return c !== 0 ? c : byCodeUnits(a.id, b.id);
      });
    this.decisions = snapshot.rows('continuityResolutions').map((r) => new ReviewItem(r));
    this.secrets = snapshot.rows('characterSecrets').map((r) => new CharacterSecret(r));
    this.manuscript = audit(model, docs, this.rules, this.decisions);
  }

  private keptRecords: RecordFinding[] | null = null;
  get records(): RecordFinding[] {
    return (this.keptRecords ??= checkRecords(this.model, { facts: this.facts, rules: this.rules }));
  }

  private keptCanon: { reviews: FactReview[]; pairs: FactPair[] } | null = null;
  get canon(): { reviews: FactReview[]; pairs: FactPair[] } {
    return (this.keptCanon ??= reviewCanon(this.facts, [...this.model.entries.values()], [...this.model.nodes.values()], (k) => this.model.categories.get(k) ?? null));
  }

  private keptTimeline: ReviewFinding[] | null = null;
  get timeline(): ReviewFinding[] {
    return (this.keptTimeline ??= reviewTimeline(
      this.model,
      this.rules.map((r) => r.raw),
    ));
  }

  private keptWarnings: Warning[] | null = null;
  get warnings(): Warning[] {
    if (this.keptWarnings === null) {
      const s = this.snapshot;
      const travel = s.rows('travelSettings')[0];
      this.keptWarnings = collectWarnings({
        model: this.model,
        facts: this.facts,
        rules: this.rules,
        markers: s.rows('structureMarkers'),
        aliases: new Map(s.rows('characterProfiles').map((p) => [str(p['entryId']), strings(p['aliases'])])),
        secrets: this.secrets,
        travel: travel === undefined ? null : new TravelSettings(travel),
        maps: s.rows('worldMaps').map((r) => new WorldMap(r)),
        pins: s.rows('mapPins').map((r) => new MapPin(r)),
        snapshots: s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
        manuscript: allIssues(this.manuscript),
      });
    }
    return this.keptWarnings;
  }

  private keptStatus: { items: ReviewedWarning[]; gone: ReviewItem[] } | null = null;
  get status(): { items: ReviewedWarning[]; gone: ReviewItem[] } {
    return (this.keptStatus ??= withStatus(this.warnings, this.decisions, { manuscriptChecked: true }));
  }

  /** The decision about a finding, when there is one. */
  decisionOf(key: string): ReviewItem | null {
    return this.decisions.find((d) => d.key === key) ?? null;
  }

  /** Whether a finding is still open (no decision, or "needs review"). */
  isOpen(key: string): boolean {
    const d = this.decisionOf(key);
    return d === null || !decisionCloses(d.decision);
  }
}
