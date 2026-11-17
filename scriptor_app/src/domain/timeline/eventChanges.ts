// Changes to a novel's timeline: its events, its calendar and its alternate histories. A port of
// flutter_app/lib/shared/domain/timeline/event_changes.dart.

import { ChangeRefused, RecordChanges } from '../codex/codexChanges';
import { type JsonMap, jsonEquals, listOf, mapOrNull, numOrNull, str } from '../json';
import { Calendar } from '../records/calendar';
import { canonStatusOf } from '../records/canon';
import { dartNumTryParse } from '../records/dartNum';
import { type TimeUnit, TimelineEvent, revealRoleOf, timeUnitOf } from '../records/event';
import { maps, strings } from '../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { cleanCalendar, jsRound, normalizeDate } from './dates';
import {
  AlternateHistory,
  changeableFields,
  fieldValue,
  historyEvents,
  historyKindOf,
  historyStatusOf,
  lineage,
  staleChanges,
} from './histories';

/** What the timeline screens read and change: events, the calendar, alternate histories, and the records an event
 * points at (entries, chapters, threads) to check those pointers against. */
export const timelineCollections: readonly string[] = [
  'timelineEvents',
  'storyCalendars',
  'alternateHistories',
  'loreEntries',
  'loreLinks',
  'loreSchemas',
  'chapters',
  'plotThreads',
  'continuityRules',
  'continuityResolutions',
];

/** Labels offered for events and scenes, as the original suggests them. */
export const suggestedLabels: readonly string[] = ['Action', 'Dialogue', 'Exposition', 'Romance', 'Mystery clue', 'Quiet moment'];
const labelMax = 40;
const labelsPerItem = 12;

/** Labels as kept: trimmed, spaces collapsed, at most 40 characters, a suggested one in its own spelling, no repeats
 * (ignoring case), at most 12. */
export function cleanLabels(list: unknown): string[] {
  const out: string[] = [];
  for (const value of listOf(list)) {
    if (typeof value !== 'string') continue;
    let typed = dartTrim(value).replace(/\s+/g, ' ');
    if (typed.length > labelMax) typed = typed.substring(0, labelMax);
    const label = suggestedLabels.find((l) => dartToLowerCase(l) === dartToLowerCase(typed)) ?? typed;
    if (label.length > 0 && !out.some((l) => dartToLowerCase(l) === dartToLowerCase(label))) out.push(label);
  }
  return out.slice(0, labelsPerItem);
}

function whole(value: unknown, min: number, max: number): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && dartTrim(value).length > 0
        ? dartNumTryParse(dartTrim(value))
        : null;
  if (n === null || !Number.isFinite(n)) return null;
  const r = jsRound(n);
  return r >= min && r <= max ? r : null;
}

const importances = ['minor', 'major', 'climax'];
const has = (m: JsonMap, key: string) => Object.prototype.hasOwnProperty.call(m, key);

/** Changes to a novel's timeline: every way an event's date, length, ages or order can change, which is only by the
 * author editing the event. Each checks what it is given as the original's timeline service does. */
export class EventChanges extends RecordChanges {
  get calendar(): Calendar {
    const rows = this.rows('storyCalendars');
    return Calendar.fromJson(rows.length === 0 ? null : rows[0]);
  }

  owned(eventId: string): TimelineEvent {
    const row = this.row('timelineEvents', eventId);
    if (row === null) throw new ChangeRefused('That event is not in this novel.');
    return new TimelineEvent(row);
  }

  /** Ids of this novel's rows in `collection` (of one codex category, when given), without blanks or repeats. */
  existing(collection: string, ids: unknown, category?: string | null): string[] {
    const wanted = new Set<string>();
    for (const id of listOf(ids)) if (typeof id === 'string' && id.length > 0) wanted.add(id);
    return [...wanted].filter((id) => {
      const r = this.row(collection, id);
      return r !== null && (category == null || r['category'] === category);
    });
  }

  private newEvent(name: string | null | undefined): JsonMap {
    return {
      id: this.newId(),
      projectId: this.projectId,
      name: name != null && dartTrim(name).length > 0 ? dartTrim(name) : 'New event',
      description: '',
      when: { precision: 'unknown' },
      duration: null,
      importance: 'minor',
      locationId: null,
      characters: [],
      entryIds: [],
      nodeIds: [],
      afterId: null,
      createdAt: this.now,
      updatedAt: this.now,
    };
  }

  /** A new event: no date yet, so it appears under "Not placed in time" until the author gives it one. */
  createEvent(name?: string | null): string {
    const event = this.newEvent(name);
    this.put('timelineEvents', event);
    return event['id'] as string;
  }

  /** A first timeline from the chapters as told, for a novel with none: an event for each chapter (in `chapterIds`'
   * order), named as the chapter, its summary as the event's, linked to the chapter it is told in, each coming after
   * the one before. None has a date: they wait under "Not placed in time", in the order the story tells them, until
   * the author moves them where they happen. Refused when the timeline already has events. */
  eventsFromChapters(chapterIds: readonly string[]): string[] {
    if (this.rows('timelineEvents').length > 0) throw new ChangeRefused('The timeline already has events.');
    const made: string[] = [];
    chapterIds.forEach((id, i) => {
      const chapter = this.row('chapters', id);
      if (chapter === null) return;
      const title = dartTrim(str(chapter['title']));
      const event: JsonMap = {
        ...this.newEvent(title.length === 0 ? `Chapter ${i + 1}` : title),
        description: str(chapter['summary']),
        nodeIds: [id],
        afterId: made.length === 0 ? null : made[made.length - 1],
        // A millisecond apart, so events of the same moment keep the chapters' order.
        createdAt: this.now + i,
      };
      this.put('timelineEvents', event);
      made.push(event['id'] as string);
    });
    if (made.length === 0) throw new ChangeRefused('There are no chapters to start from.');
    return made;
  }

  /** Updates an event from what it holds now. Anything that does not fit is not stored: ids that are not this novel's,
   * statuses that do not exist, a date the calendar does not have. How long it lasts is said one way at a time. */
  updateEvent(eventId: string, edit: (stored: TimelineEvent) => JsonMap): void {
    const current = this.owned(eventId);
    const changes = edit(current);
    const next: JsonMap = { updatedAt: this.now };
    if (typeof changes['name'] === 'string') {
      const name = dartTrim(changes['name']);
      next['name'] = name.length === 0 ? 'Untitled event' : name;
    }
    if (typeof changes['description'] === 'string') next['description'] = changes['description'];
    if (importances.includes(changes['importance'] as string)) next['importance'] = changes['importance'];
    const c = this.calendar;
    const anchorOf = (id: unknown): string | null =>
      typeof id === 'string' && id.length > 0 && id !== eventId ? (this.existing('timelineEvents', [id])[0] ?? null) : null;
    if (has(changes, 'when')) {
      const when = normalizeDate(changes['when'], c);
      // A relative date must point at another event of this novel.
      if (when['precision'] === 'relative') when['anchorId'] = anchorOf(when['anchorId']);
      next['when'] = when;
    }
    if (has(changes, 'duration')) {
      const d = mapOrNull(changes['duration']);
      const amount =
        d === null ? null : typeof d['amount'] === 'number' ? d['amount'] : dartNumTryParse(String(d['amount'] ?? null));
      next['duration'] =
        amount !== null && Number.isFinite(amount) && amount > 0
          ? { amount, unit: timeUnitOf(d!['unit']) ?? ('years' as TimeUnit) }
          : null;
    }
    if (has(changes, 'locationId')) {
      next['locationId'] = this.existing('loreEntries', [changes['locationId']], 'location')[0] ?? null;
    }
    if (has(changes, 'characters')) {
      const given = maps(changes['characters']);
      const ids = this.existing(
        'loreEntries',
        given.map((x) => x['id']),
        'character',
      );
      next['characters'] = ids.map((id) => ({ id, age: whole(given.find((x) => x['id'] === id)!['age'], 0, 100000) }));
    }
    if (has(changes, 'entryIds')) next['entryIds'] = this.existing('loreEntries', changes['entryIds']);
    if (has(changes, 'nodeIds')) next['nodeIds'] = this.existing('chapters', changes['nodeIds']);
    if (has(changes, 'afterId')) next['afterId'] = anchorOf(changes['afterId']);
    // How long it lasts is said one way at a time: a duration, an end date, or "still going on".
    if (next['duration'] != null) Object.assign(next, { end: null, ongoing: false });
    if (has(changes, 'end')) {
      const end = changes['end'] == null ? null : normalizeDate(changes['end'], c);
      if (end !== null && end['precision'] === 'relative') end['anchorId'] = anchorOf(end['anchorId']);
      next['end'] = end;
      if (end !== null) Object.assign(next, { duration: null, ongoing: false });
    }
    if (has(changes, 'ongoing')) {
      next['ongoing'] = changes['ongoing'] === true;
      if (next['ongoing'] === true) Object.assign(next, { end: null, duration: null });
    }
    if (has(changes, 'threadIds')) next['threadIds'] = this.existing('plotThreads', changes['threadIds']);
    if (has(changes, 'labels')) next['labels'] = cleanLabels(changes['labels']);
    if (has(changes, 'status')) {
      next['status'] = ['idea', 'planned', 'confirmed'].includes(changes['status'] as string) ? changes['status'] : 'confirmed';
    }
    if (has(changes, 'canon')) {
      next['canon'] = canonStatusOf(changes['canon']) !== null ? changes['canon'] : 'canon';
    }
    // A chapter's role in telling the event lasts as long as the event is told there; "told" is not stored.
    if (has(changes, 'reveals') || has(changes, 'nodeIds')) {
      const told = new Set(listOf(next['nodeIds'] ?? current.raw['nodeIds']));
      const given = has(changes, 'reveals') ? maps(changes['reveals']) : maps(current.raw['reveals']);
      const seen = new Set<string>();
      const reveals: JsonMap[] = [];
      for (const r of given) {
        const nodeId = r['nodeId'];
        if (
          typeof nodeId === 'string' &&
          told.has(nodeId) &&
          revealRoleOf(r['role']) !== null &&
          r['role'] !== 'told' &&
          !seen.has(nodeId)
        ) {
          seen.add(nodeId);
          reveals.push({ nodeId, role: r['role'] });
        }
      }
      next['reveals'] = reveals;
    }
    this.put('timelineEvents', current.merged(next));
  }

  /** Saves the calendar settings, checked first: nothing is written when they have a problem. Saving one never changes
   * an event; each date is read in whichever calendar is in use. */
  saveCalendar(input: JsonMap): JsonMap {
    const settings = cleanCalendar(input);
    const rows = this.rows('storyCalendars');
    const was = rows.length === 0 ? null : rows[0];
    this.put('storyCalendars', { ...settings, id: was?.['id'] ?? this.newId(), projectId: this.projectId, updatedAt: this.now });
    return settings;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Alternate histories

  get histories(): Map<string, AlternateHistory> {
    return new Map(this.rows('alternateHistories').map((r) => [str(r['id']), new AlternateHistory(r)]));
  }

  get mainEvents(): Map<string, TimelineEvent> {
    return new Map(this.rows('timelineEvents').map((r) => [str(r['id']), new TimelineEvent(r)]));
  }

  history(id: string): AlternateHistory {
    const row = this.row('alternateHistories', id);
    if (row === null) throw new ChangeRefused('That alternate history is not in this novel.');
    return new AlternateHistory(row);
  }

  private baseOf(h: AlternateHistory): Map<string, TimelineEvent> {
    return historyEvents(this.mainEvents, this.histories, h.baseId);
  }

  private save(id: string, changes: JsonMap): void {
    this.put('alternateHistories', { ...this.history(id).merged(changes), updatedAt: this.now });
  }

  /** A change as it can be stored: each field checked as the timeline checks it, ids kept only when they name a record
   * of this novel (an event, when this history has it), the length said one way at a time. Fields the same as
   * `against` are dropped, so a history only ever holds what is different. */
  private clean(change: JsonMap, events: ReadonlyMap<string, TimelineEvent>, against: TimelineEvent | null): JsonMap {
    const c = this.calendar;
    const entries = new Map(this.rows('loreEntries').map((r) => [str(r['id']), r]));
    const anchored = (when: JsonMap): JsonMap =>
      when['precision'] === 'relative' && when['anchorId'] != null && !events.has(when['anchorId'] as string)
        ? { ...when, anchorId: null }
        : when;
    const out: JsonMap = {};
    if (has(change, 'name')) {
      const name = dartTrim(`${(change['name'] as string | null) ?? ''}`);
      out['name'] = name.length === 0 ? 'Untitled event' : name;
    }
    if (has(change, 'description')) out['description'] = `${(change['description'] as string | null) ?? ''}`;
    if (has(change, 'when')) out['when'] = anchored(normalizeDate(change['when'], c));
    if (has(change, 'end')) out['end'] = change['end'] == null ? null : anchored(normalizeDate(change['end'], c));
    if (has(change, 'duration')) {
      const d = mapOrNull(change['duration']);
      const amount = d === null ? null : numOrNull(d['amount']);
      out['duration'] = amount !== null && amount > 0 ? { amount, unit: timeUnitOf(d!['unit']) ?? ('days' as TimeUnit) } : null;
    }
    if (has(change, 'ongoing')) out['ongoing'] = change['ongoing'] === true;
    if (has(change, 'importance')) {
      out['importance'] = importances.includes(change['importance'] as string) ? change['importance'] : 'minor';
    }
    if (has(change, 'locationId')) {
      const id = change['locationId'];
      out['locationId'] = typeof id === 'string' && entries.get(id)?.['category'] === 'location' ? id : null;
    }
    if (has(change, 'characters')) {
      const seen = new Set<string>();
      const list: JsonMap[] = [];
      for (const ch of maps(change['characters'])) {
        const id = ch['id'];
        if (typeof id === 'string' && entries.get(id)?.['category'] === 'character' && !seen.has(id)) {
          seen.add(id);
          const age = ch['age'];
          list.push({ id, age: typeof age === 'number' && Number.isInteger(age) && age >= 0 ? age : null });
        }
      }
      out['characters'] = list;
    }
    if (has(change, 'entryIds')) out['entryIds'] = [...new Set(strings(change['entryIds']))].filter((id) => entries.has(id));
    if (has(change, 'afterId')) {
      const id = change['afterId'];
      out['afterId'] = typeof id === 'string' && events.has(id) ? id : null;
    }
    if (out['duration'] != null) Object.assign(out, { end: null, ongoing: false });
    if (out['end'] != null) Object.assign(out, { duration: null, ongoing: false });
    if (out['ongoing'] === true) Object.assign(out, { end: null, duration: null });
    if (against !== null) {
      for (const field of changeableFields.keys()) {
        if (has(out, field) && jsonEquals(fieldValue(out, field), fieldValue(against.raw, field))) delete out[field];
      }
    }
    return out;
  }

  /** Starts a history: no differences yet, so it reads exactly as its base until the author changes something. */
  createHistory(
    args: {
      name?: string | null;
      baseId?: string | null;
      kind?: string | null;
      status?: string | null;
      originEventId?: string | null;
      causeEventId?: string | null;
      note?: string | null;
    } = {},
  ): string {
    const all = this.histories;
    const base = args.baseId != null && all.has(args.baseId) ? args.baseId : null;
    const events = historyEvents(this.mainEvents, all, base);
    const id = this.newId();
    this.put('alternateHistories', {
      id,
      projectId: this.projectId,
      name: args.name != null && dartTrim(args.name).length > 0 ? dartTrim(args.name) : 'Untitled alternate history',
      baseId: base,
      kind: historyKindOf(args.kind) ?? 'hypothetical',
      status: historyStatusOf(args.status) ?? 'experimental',
      originEventId: args.originEventId != null && events.has(args.originEventId) ? args.originEventId : null,
      causeEventId: args.causeEventId != null && events.has(args.causeEventId) ? args.causeEventId : null,
      note: args.note == null ? '' : dartTrim(args.note),
      changed: {},
      removed: [],
      added: [],
      createdAt: this.now,
      updatedAt: this.now,
    });
    return id;
  }

  /** Its name, kind, canon status, where it departs and why. Its base is fixed once it is made. */
  updateHistory(id: string, input: JsonMap): void {
    const h = this.history(id);
    const base = this.baseOf(h);
    const next: JsonMap = {};
    if (typeof input['name'] === 'string') {
      const name = dartTrim(input['name']);
      next['name'] = name.length === 0 ? h.name : name;
    }
    if (historyKindOf(input['kind']) !== null) next['kind'] = input['kind'];
    if (historyStatusOf(input['status']) !== null) next['status'] = input['status'];
    for (const key of ['originEventId', 'causeEventId']) {
      if (!has(input, key)) continue;
      const value = input[key];
      next[key] = typeof value === 'string' && base.has(value) ? value : null;
    }
    if (typeof input['note'] === 'string') next['note'] = dartTrim(input['note']);
    this.save(id, next);
  }

  /** A base event goes differently in this history. Only the fields that differ from the base are kept; none left
   * restores it. */
  changeHistoryEvent(id: string, eventId: string, change: JsonMap): void {
    const h = this.history(id);
    const event = this.baseOf(h).get(eventId);
    if (event === undefined) throw new ChangeRefused('That event is not in the timeline this history branches from.');
    const merged = this.clean(
      { ...(h.changed.get(eventId) ?? {}), ...change },
      historyEvents(this.mainEvents, this.histories, id),
      event,
    );
    const changed: JsonMap = Object.fromEntries(h.changed);
    if (Object.keys(merged).length > 0) {
      changed[eventId] = merged;
    } else {
      delete changed[eventId];
    }
    this.save(id, { changed, removed: h.removed.filter((r) => r !== eventId) });
  }

  /** A base event does not happen in this history. */
  removeHistoryEvent(id: string, eventId: string): void {
    const h = this.history(id);
    if (!this.baseOf(h).has(eventId)) {
      throw new ChangeRefused('That event is not in the timeline this history branches from.');
    }
    const changed: JsonMap = Object.fromEntries(h.changed);
    delete changed[eventId];
    this.save(id, { changed, removed: [...new Set([...h.removed, eventId])] });
  }

  /** Back as the base has it: the history's change or removal is dropped. */
  restoreHistoryEvent(id: string, eventId: string): void {
    const h = this.history(id);
    const changed: JsonMap = Object.fromEntries(h.changed);
    delete changed[eventId];
    this.save(id, { changed, removed: h.removed.filter((r) => r !== eventId) });
  }

  /** An event that happens only in this history. It is kept in the history, never in the main timeline. */
  addHistoryEvent(id: string, name?: string | null): string {
    const h = this.history(id);
    const event = this.newEvent(name);
    this.save(id, { added: [...maps(h.raw['added']), event] });
    return event['id'] as string;
  }

  updateAddedEvent(id: string, eventId: string, change: JsonMap): void {
    const h = this.history(id);
    if (!h.added.some((e) => e.id === eventId)) throw new ChangeRefused('That event is not one this history adds.');
    const cleaned = this.clean(change, historyEvents(this.mainEvents, this.histories, id), null);
    this.save(id, {
      added: maps(h.raw['added']).map((e) => (e['id'] === eventId ? { ...e, ...cleaned, updatedAt: this.now } : e)),
    });
  }

  deleteAddedEvent(id: string, eventId: string): void {
    const h = this.history(id);
    this.save(id, { added: maps(h.raw['added']).filter((e) => e['id'] !== eventId) });
  }

  /** Drops changes and removals that point at events the base no longer has. */
  forgetStale(id: string): void {
    const h = this.history(id);
    const stale = new Set(staleChanges(this.mainEvents, this.histories, h));
    this.save(id, {
      changed: Object.fromEntries([...h.changed].filter(([key]) => !stale.has(key))),
      removed: h.removed.filter((r) => !stale.has(r)),
    });
  }

  /** Deletes a history. Histories based on it are based on its base instead, keeping their own differences; the main
   * timeline is untouched. */
  removeHistory(id: string): void {
    const h = this.history(id);
    for (const other of this.histories.values()) {
      if (other.baseId === id) this.save(other.id, { baseId: h.baseId });
    }
    this.remove('alternateHistories', id);
  }

  /** Whether basing a history on `baseId` would loop back to itself. */
  loops(id: string, baseId: string): boolean {
    return lineage(this.histories, baseId).some((h) => h.id === id);
  }
}
