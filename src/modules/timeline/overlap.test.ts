import { describe, expect, it } from 'vitest';
import { eventRecords, validateEvent } from '@/modules/model/events';
import { buildModel } from '@/modules/model/model';
import { detailsOf } from '@/modules/model/navigate';
import type { LoreEntry } from '@/modules/codex/types';
import { AXIS_WIDTH, domainOf, layoutAxis } from './axis';
import { DAY, MONTH, YEAR } from './calendar';
import { atTheSameTime, certainTime, together } from './overlap';
import type { EventDate, TimelineEvent } from './types';

const exact = (year: number, month: number | null = null, day: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour: null, minute: null });
const event = (id: string, when: EventDate, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const place = (id: string, name: string): LoreEntry => ({ id, projectId: 'p', category: 'location', name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }) as LoreEntry;
const model = (events: TimelineEvent[], entries: LoreEntry[] = []) => buildModel({ project: { id: 'p' } as never, nodes: [], plans: [], entries, schemas: [], links: [], relations: [], events, threads: [], systems: [], sheets: [] });
const recordsOf = (events: TimelineEvent[]) => eventRecords(model(events));
const byId = (events: TimelineEvent[]) => new Map(recordsOf(events).map((r) => [r.id, r]));
const how = (events: TimelineEvent[], a: string, b: string) => {
  const r = byId(events);
  return together(r.get(a)!.bounds!, r.get(b)!.bounds!);
};

describe('events at the same time', () => {
  // Two places, one night.
  const night = [event('ball', exact(10, 3, 3), { locationId: 'court' }), event('raid', exact(10, 3, 3), { locationId: 'docks' }), event('dawn', exact(10, 3, 4))];

  it('are at the same time, side by side on the drawing, in their own places', () => {
    expect(how(night, 'ball', 'raid')).toBe('same-time');
    expect(how(night, 'ball', 'dawn')).toBeNull();
    const axis = layoutAxis(recordsOf(night));
    const [ball, raid] = ['ball', 'raid'].map((id) => axis.marks.find((m) => m.id === id)!);
    expect(ball.x).toBe(raid.x);
    expect(ball.lane).not.toBe(raid.lane);
    expect([ball.kind, raid.kind]).toEqual(['moment', 'moment']);
    const details = detailsOf(model(night, [place('court', 'The court'), place('docks', 'The docks')]), { type: 'event', id: 'ball' })!;
    expect(details.groups.find((g) => g.title === 'At the same time')!.items.map((i) => [i.label, i.note])).toEqual([['raid', 'at the same time · at The docks']]);
  });

  it('are never treated as a mistake', () => {
    const m = model([...night, event('war', exact(9, 1, 1), { end: exact(12, 1, 1) }), event('mira-a', exact(10, 3, 3), { characters: [{ id: 'mira', age: null }], locationId: 'court' }), event('mira-b', exact(10, 3, 3), { characters: [{ id: 'mira', age: null }], locationId: 'docks' })], [place('court', 'The court'), place('docks', 'The docks'), { ...place('mira', 'Mira'), category: 'character' }]);
    for (const e of m.events.values()) expect(validateEvent(m, e), e.id).toEqual([]);
  });
});

describe('overlapping and lasting events', () => {
  const war = event('war', exact(10, 3, 1), { end: exact(12, 1, 1) });
  const siege = event('siege', exact(11, 6, 1), { duration: { amount: 2, unit: 'years' } });
  const battle = event('battle', exact(11, 2, 2));
  const truce = event('truce', exact(12, 1, 2));
  const all = [war, siege, battle, truce];

  it('says how each shares time with the others, from either side', () => {
    expect(how(all, 'war', 'siege')).toBe('overlaps');
    expect(how(all, 'siege', 'war')).toBe('overlaps');
    expect(how(all, 'war', 'battle')).toBe('during');
    expect(how(all, 'battle', 'war')).toBe('contains');
    // The war ends the day before the truce: touching is not sharing.
    expect(how(all, 'war', 'truce')).toBeNull();
    expect(atTheSameTime(recordsOf(all), 'war').map((t) => [t.record.id, t.how])).toEqual([
      ['battle', 'during'],
      ['siege', 'overlaps'],
    ]);
  });

  it('draws each as a bar as long as it lasts, overlapping ones on separate rows', () => {
    const axis = layoutAxis(recordsOf(all));
    const mark = (id: string) => axis.marks.find((m) => m.id === id)!;
    expect([mark('war').kind, mark('siege').kind, mark('battle').kind]).toEqual(['lasting', 'lasting', 'moment']);
    expect(mark('siege').end - mark('siege').start).toBe(2 * YEAR - 1);
    expect(new Set([mark('war').lane, mark('siege').lane, mark('battle').lane]).size).toBe(3);
    expect([mark('war').startFuzz, mark('war').endFuzz]).toEqual([null, null]);
  });
});

describe('ends not given, and no end at all', () => {
  const journey = event('journey', exact(10, 1, 1), { end: { precision: 'unknown' } });
  const curse = event('curse', exact(10, 1, 1), { ongoing: true });
  const later = event('later', exact(15, 6, 1));
  const before = event('before', exact(9, 6, 1));
  const lost = event('lost', exact(10, 1, 1), { end: { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' } });
  const all = [journey, curse, later, before, lost];

  it('a missing end is never guessed: it may still be going on, and it is drawn fading out', () => {
    const r = byId(all);
    expect(r.get('journey')!.bounds).toMatchObject({ end: null, open: 'unknown' });
    expect(r.get('journey')!.label).toBe('Year 10, January 1, end not known');
    expect(r.get('journey')!.span!.hi).toBe(Infinity);
    expect(how(all, 'journey', 'later')).toBe('maybe');
    expect(how(all, 'journey', 'before')).toBeNull();
    // An end dated from a deleted event cannot be worked out either.
    expect(r.get('lost')!.bounds).toMatchObject({ end: null, open: 'unknown' });
    const axis = layoutAxis(recordsOf(all));
    expect(axis.marks.find((m) => m.id === 'journey')).toMatchObject({ kind: 'unended', endFuzz: null });
    expect(axis.marks.find((m) => m.id === 'lost')!.kind).toBe('unended');
  });

  it('an open-ended event goes on through everything after it begins, to the edge of the drawing', () => {
    expect(how(all, 'curse', 'later')).toBe('during');
    expect(how(all, 'later', 'curse')).toBe('contains');
    expect(how(all, 'curse', 'before')).toBeNull();
    // A journey begun the day the curse fell, whenever it ends, is under the curse.
    expect(how(all, 'curse', 'journey')).toBe('during');
    const axis = layoutAxis(recordsOf(all));
    const curseMark = axis.marks.find((m) => m.id === 'curse')!;
    expect(curseMark.kind).toBe('ongoing');
    expect(curseMark.x + curseMark.width).toBeCloseTo(AXIS_WIDTH);
    expect(byId(all).get('curse')!.label).toBe('Year 10, January 1, still going on');
  });
});

describe('starts and ends known only roughly', () => {
  // A war from some time in Year 10 until some time in the spring of Year 14.
  const war = event('war', exact(10), { end: { precision: 'approximate', year: 14, month: null, season: 'spring' } });
  // A voyage that began some month in Year 20 and lasted three months.
  const voyage = event('voyage', { precision: 'approximate', year: 20, month: null, season: null }, { duration: { amount: 3, unit: 'months' } });
  const summer = event('summer', { precision: 'approximate', year: 11, month: null, season: 'summer' });
  const year10 = event('year10', exact(10));
  const all = [war, voyage, summer, year10];

  it('draws the stretch each end could fall in, and solid only where it is certainly going on', () => {
    const axis = layoutAxis(recordsOf(all));
    const mark = (id: string) => axis.marks.find((m) => m.id === id)!;
    expect(mark('war')).toMatchObject({ kind: 'lasting', startFuzz: { lo: 10 * YEAR, hi: 11 * YEAR - 1 }, endFuzz: { lo: 14 * YEAR + 2 * MONTH, hi: 14 * YEAR + 5 * MONTH - 1 } });
    expect(mark('war').end).toBe(14 * YEAR + 5 * MONTH - 1);
    // A rough start leaves the end as rough: three months after some moment in Year 20.
    expect(mark('voyage').startFuzz).toEqual({ lo: 20 * YEAR, hi: 21 * YEAR - 1 });
    expect(mark('voyage').endFuzz).toEqual({ lo: 20 * YEAR + 3 * MONTH - 1, hi: 21 * YEAR + 3 * MONTH - 2 });
    expect(certainTime(byId(all).get('war')!.bounds!)).toEqual({ lo: 11 * YEAR - 1, hi: 14 * YEAR + 2 * MONTH });
  });

  it('is honest about what the dates allow', () => {
    // A summer moment is certainly inside a war that runs from Year 10 to Year 14.
    expect(how(all, 'war', 'summer')).toBe('during');
    // "Some time in Year 10" could be before the war had begun.
    expect(how(all, 'war', 'year10')).toBe('maybe');
    expect(how(all, 'war', 'voyage')).toBeNull();
    const domain = domainOf(recordsOf(all))!;
    expect(domain.to).toBeGreaterThan(21 * YEAR + 3 * MONTH);
    expect(DAY).toBe(1440);
  });
});
