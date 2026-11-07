import { describe, expect, it } from 'vitest';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { ContinuityRule, Resolution } from '@/modules/continuity/types';
import { buildModel } from '@/modules/model/model';
import { RULE_TEXT, reviewTimeline, withDecisions } from './review';
import type { EventDate, TimelineEvent } from './types';

const day = (year: number, month: number | null = null, d: number | null = null): EventDate => ({ precision: 'exact', year, month, day: d, hour: null, minute: null });
const entry = (id: string, name: string, category: string, fields: { key: string; value: string }[] = []): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: fields.map((f, i) => ({ id: `f${i}`, ...f })), createdAt: 0, updatedAt: 0 }) as LoreEntry;
const event = (id: string, when: EventDate, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name: id, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const at = (place: string, ...who: string[]) => ({ locationId: place, characters: who.map((id) => ({ id, age: null })) });
const travel = (from: string, to: string, amount: number, unit: ContinuityRule['unit'] = 'days'): ContinuityRule => ({ id: `t-${from}-${to}`, projectId: 'p', kind: 'travel', entryId: from, toEntryId: to, amount, unit, aliases: [], state: null, label: '', words: [], scope: 'paragraph', holderId: null, fromNodeId: null, untilNodeId: null, note: '', createdAt: 0, updatedAt: 0 });
const link = (from: string, to: string): LoreLink => ({ id: `l-${from}`, projectId: 'p', fromId: from, toId: to, fromLabel: '', toLabel: '', type: 'located-in', createdAt: 0 });
const entries = [entry('mira', 'Mira', 'character'), entry('bren', 'Bren', 'character'), entry('keep', 'The Keep', 'location'), entry('docks', 'The Docks', 'location'), entry('gate', 'The Gate', 'location')];
const model = (events: TimelineEvent[], extra: { entries?: LoreEntry[]; links?: LoreLink[] } = {}) => buildModel({ project: { id: 'p' } as never, nodes: [], plans: [], entries: extra.entries ?? entries, schemas: [], links: extra.links ?? [], relations: [], events, threads: [], systems: [], sheets: [] });
const found = (events: TimelineEvent[], rules: ContinuityRule[] = [], extra = {}) => reviewTimeline(model(events, extra), rules).map((f) => [f.rule, f.message]);

describe('reviewing the timeline: only when the data is there', () => {
  it('finds nothing in a timeline with too little data to judge', () => {
    expect(found([event('a', { precision: 'unknown' }, at('keep', 'mira')), event('b', { precision: 'unknown' }, at('docks', 'mira')), event('c', day(10))], [travel('keep', 'docks', 5)])).toEqual([]);
  });

  it('every rule says what it is and what it needs', () => {
    for (const text of Object.values(RULE_TEXT)) expect(text.rule.length * text.needs.length * text.title.length).toBeGreaterThan(0);
  });
});

describe('contradictory dates', () => {
  it('an event that ends before it starts, or is dated before what it follows', () => {
    expect(found([event('war', day(12), { end: day(10) })])).toEqual([['dates', '“war” ends before it starts.']]);
    expect(found([event('first', day(10)), event('second', day(9), { afterId: 'first' })])).toEqual([['follows', '“second” is set to come after “first”, but is dated before it.']]);
  });

  it('a date from an event since deleted, or one the calendar does not have', () => {
    expect(found([event('omen', { precision: 'relative', anchorId: 'gone', amount: 2, unit: 'days', direction: 'after' })])).toEqual([['anchor', '“omen”: its date is given from an event that no longer exists.']]);
    expect(found([event('feast', day(10, 13))])).toEqual([['calendar', '“feast”: its date is not in the calendar.']]);
  });

  it('ages that disagree, and taking part before being born', () => {
    const born = entry('mira', 'Mira', 'character', [{ key: 'Date of Birth', value: '1000-3-1' }]);
    const list = [born, ...entries.slice(1)];
    expect(found([event('graduation', day(1016, 6, 1), { characters: [{ id: 'mira', age: 22 }] })], [], { entries: list })).toEqual([['ages', 'Mira’s age at “graduation” does not fit the other records.']]);
    expect(found([event('war', day(990, 5, 1), { characters: [{ id: 'mira', age: null }] })], [], { entries: list })).toEqual([['born', 'Mira takes part in “war”, which the dates put before their birth.']]);
  });
});

describe('where characters are', () => {
  it('too little time to travel, only when a travel time is recorded between the places', () => {
    const events = [event('siege', day(10, 3, 1), at('keep', 'mira')), event('feast', day(10, 3, 3), at('docks', 'mira'))];
    const findings = reviewTimeline(model(events), [travel('keep', 'docks', 5)]);
    expect(findings.map((f) => [f.rule, f.message, f.because])).toEqual([['travel', 'Mira cannot get from The Keep to The Docks in time for “feast”.', '“siege” (Year 10, March 1) is at The Keep; “feast” (Year 10, March 3) is at The Docks, at most 3 days later. The travel time recorded between them is 5 days.']]);
    // Either direction of the recorded route counts; enough time, or no recorded route, finds nothing.
    expect(found(events, [travel('docks', 'keep', 5)]).map((f) => f[0])).toEqual(['travel']);
    expect(found([events[0], event('feast', day(10, 3, 9), at('docks', 'mira'))], [travel('keep', 'docks', 5)])).toEqual([]);
    expect(found(events)).toEqual([]);
    // Dates too rough to be sure there was too little time: nothing.
    expect(found([event('siege', day(10), at('keep', 'mira')), event('feast', day(11), at('docks', 'mira'))], [travel('keep', 'docks', 5)])).toEqual([]);
    // Someone else's journey is theirs: Bren was never at the Keep.
    expect(found([events[0], event('feast', day(10, 3, 3), at('docks', 'bren'))], [travel('keep', 'docks', 5)])).toEqual([]);
  });

  it('in two places at once, unless one lies inside the other or the dates do not say so', () => {
    const same = [event('ball', day(10, 3, 3), at('keep', 'mira')), event('raid', day(10, 3, 3), at('docks', 'mira'))];
    expect(found(same)).toEqual([['two-places', 'Mira is at The Keep and at The Docks at the same time.']]);
    // The gate is in the Keep: being at both is no contradiction.
    expect(found([same[0], event('raid', day(10, 3, 3), at('gate', 'mira'))], [], { links: [link('gate', 'keep')] })).toEqual([]);
    // Some time in Year 10, both: could be months apart.
    expect(found([event('ball', day(10), at('keep', 'mira')), event('raid', day(10), at('docks', 'mira'))])).toEqual([]);
    // A war going on at the Keep while she is at the Docks for a day of it.
    expect(found([event('war', day(10, 1, 1), { ...at('keep', 'mira'), end: day(10, 12, 1) }), event('raid', day(10, 6, 1), at('docks', 'mira'))]).map((f) => f[0])).toEqual(['two-places']);
  });
});

describe('the same findings every time, decided on by the author, never acted on', () => {
  it('is deterministic, and reads only', () => {
    const events = [event('war', day(12), { end: day(10) }), event('ball', day(10, 3, 3), at('keep', 'mira')), event('raid', day(10, 3, 3), at('docks', 'mira'))];
    const m = model(events);
    const before = JSON.stringify([...m.events.values()]);
    const first = reviewTimeline(m);
    expect(reviewTimeline(m)).toEqual(first);
    expect(JSON.stringify([...m.events.values()])).toBe(before);
    expect(first.map((f) => f.key)).toEqual(['timeline|dates|war', 'timeline|two-places|mira|ball|raid']);
  });

  it('a decision keeps a finding out of the open list while it still applies; one whose finding has gone is set apart', () => {
    const findings = reviewTimeline(model([event('war', day(12), { end: day(10) }), event('ball', day(10, 3, 3), at('keep', 'mira')), event('raid', day(10, 3, 3), at('docks', 'mira'))]));
    const decision = (key: string, kind: Resolution['kind']): Resolution => ({ id: key, projectId: 'p', key, kind, note: kind === 'intentional' ? 'A double' : '', message: '', nodeId: null, createdAt: 0 });
    const split = withDecisions(findings, [decision('timeline|two-places|mira|ball|raid', 'intentional'), decision('timeline|dates|gone', 'dismissed'), decision('status|x|y', 'dismissed')]);
    expect(split.open.map((f) => f.rule)).toEqual(['dates']);
    expect(split.decided.map((d) => [d.finding.rule, d.decision.kind, d.decision.note])).toEqual([['two-places', 'intentional', 'A double']]);
    // The manuscript's own decisions are not the timeline's.
    expect(split.gone.map((d) => d.key)).toEqual(['timeline|dates|gone']);
  });
});
