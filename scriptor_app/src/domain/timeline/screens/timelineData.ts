// The open novel's timeline as the screens read it: the same records the characters and world screens read, with the
// timeline worked out from them. Nothing here is stored. A port of TimelineData in
// flutter_app/lib/features/timeline/timeline_providers.dart.

import type { CastData } from '../../characters/castData';
import { localeCompare } from '../../collation';
import { str } from '../../json';
import type { StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import type { Calendar } from '../../records/calendar';
import type { Entry } from '../../records/entry';
import { ReviewItem } from '../../records/review';
import type { PlotThread } from '../../records/thread';
import { type Placed, resolveChronology } from '../chronology';
import { type EventRecord, eventRecords } from '../eventRecord';
import { AlternateHistory } from '../histories';
import { type ReviewFinding, reviewTimeline, withDecisions } from '../review';

export class TimelineData {
  constructor(readonly cast: CastData) {}

  get model(): StoryModel {
    return this.cast.model;
  }
  get calendar(): Calendar {
    return this.model.calendar;
  }
  get novelId(): string {
    return this.cast.novelId;
  }

  private kept = new Map<string, unknown>();
  private once<T>(key: string, make: () => T): T {
    if (!this.kept.has(key)) this.kept.set(key, make());
    return this.kept.get(key) as T;
  }

  /** Every event in story order, with its date in words and its problems. */
  get placed(): Placed[] {
    return this.once('placed', () => resolveChronology(this.model.events.values(), this.calendar));
  }
  get placedById(): Map<string, Placed> {
    return this.once('placedById', () => new Map(this.placed.map((p) => [p.event.id, p])));
  }

  /** Every event as every view reads it. */
  get records(): EventRecord[] {
    return this.once('records', () => eventRecords(this.model));
  }
  get recordById(): Map<string, EventRecord> {
    return this.once('recordById', () => new Map(this.records.map((r) => [r.id, r])));
  }

  get findings(): ReviewFinding[] {
    return this.once('findings', () => reviewTimeline(this.model, this.cast.snapshot.rows('continuityRules')));
  }
  get decisions(): ReviewItem[] {
    return this.once('decisions', () => this.cast.snapshot.rows('continuityResolutions').map((r) => new ReviewItem(r)));
  }
  get review(): ReturnType<typeof withDecisions> {
    return this.once('review', () => withDecisions(this.findings, this.decisions));
  }

  /** Findings an event's page shows beside its own problems: those its other checks do not already raise. */
  findingsOf(eventId: string): ReviewFinding[] {
    return this.review.open.filter(
      (f) => f.eventIds.includes(eventId) && (f.rule === 'dates' || f.rule === 'travel' || f.rule === 'two-places'),
    );
  }

  get histories(): Map<string, AlternateHistory> {
    return this.once(
      'histories',
      () => new Map(this.cast.snapshot.rows('alternateHistories').map((r) => [str(r['id']), new AlternateHistory(r)])),
    );
  }

  /** Alternate histories, oldest first. */
  get historyList(): AlternateHistory[] {
    return this.once('historyList', () => stableSorted(this.histories.values(), (a, b) => a.createdAt - b.createdAt));
  }

  entriesOf(category: string): Entry[] {
    return stableSorted(
      this.cast.entries.filter((e) => e.category === category),
      (a, b) => localeCompare(a.name, b.name),
    );
  }

  get places(): Entry[] {
    return this.once('places', () => this.entriesOf('location'));
  }

  get threads(): PlotThread[] {
    return this.once('threads', () => stableSorted(this.model.threads.values(), (a, b) => localeCompare(a.title, b.title)));
  }

  eventName(id: string): string | null {
    return this.model.events.get(id)?.name ?? null;
  }
}
