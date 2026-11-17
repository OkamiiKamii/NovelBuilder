// The timeline's changes, its calendar presets and fictional time, as the Flutter app's own domain tests check them:
// ports of flutter_app/test/shared/domain/timeline_changes_test.dart, calendar_presets_test.dart and the parts of
// history_test.dart not already in test/relationships (validity in story time and reading order, dates and calendars).

import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap, jsonEquals, mapOrNull, str } from '../../src/domain/json';
import { planDelete } from '../../src/domain/model/deletePolicy';
import { EntityRef } from '../../src/domain/model/entityRef';
import { StoryModel } from '../../src/domain/model/storyModel';
import { Anchor, Validity, historyOf, overlaps, spanOfEvent, validAt } from '../../src/domain/model/validity';
import { Calendar, calendarProblems } from '../../src/domain/records/calendar';
import { EventDate, TimelineEvent } from '../../src/domain/records/event';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { calendarPresets, presetIsValid, yearOf } from '../../src/domain/timeline/calendarPresets';
import { resolveChronology } from '../../src/domain/timeline/chronology';
import { EventChanges } from '../../src/domain/timeline/eventChanges';
import { AlternateHistory, historyEvents } from '../../src/domain/timeline/histories';
import { orderSummary, twoOrders } from '../../src/domain/timeline/narrative';
import { NovelBuilder, exact, year } from '../model/builder';

class Novel {
  snapshot = new NovelSnapshot({
    project: { id: 'novel', title: 'Ashfall' },
    collections: {
      loreEntries: [
        { id: 'mira', projectId: 'novel', category: 'character', name: 'Mira' },
        { id: 'bren', projectId: 'novel', category: 'character', name: 'Bren' },
        { id: 'keep', projectId: 'novel', category: 'location', name: 'The Keep' },
        { id: 'guild', projectId: 'novel', category: 'faction', name: 'The Guild' },
      ],
      chapters: [
        { id: 'ch1', projectId: 'novel', parentId: null, kind: 'chapter', title: 'One', order: 0 },
        { id: 'ch2', projectId: 'novel', parentId: null, kind: 'chapter', title: 'Two', order: 1 },
      ],
      plotThreads: [{ id: 'thread', projectId: 'novel', title: 'The curse' }],
    },
  });
  private ids = 0;

  change<T>(f: (x: EventChanges) => T): T {
    const c = new EventChanges(this.snapshot, { now: 1000, createId: () => `id${++this.ids}` });
    const out = f(c);
    this.snapshot = c.snapshot;
    return out;
  }

  event(id: string): TimelineEvent {
    return new TimelineEvent(this.snapshot.rows('timelineEvents').find((r) => r['id'] === id)!);
  }
  raw(id: string): JsonMap {
    return this.event(id).raw;
  }
}

describe('the timeline’s changes', () => {
  test('a new event has nothing the author did not give it: no date, so it waits under “Not placed in time”', () => {
    const n = new Novel();
    const id = n.change((x) => x.createEvent('  The siege  '));
    const e = n.raw(id);
    expect([e['name'], e['when'], e['duration'], e['importance'], e['characters']]).toEqual([
      'The siege',
      { precision: 'unknown' },
      null,
      'minor',
      [],
    ]);
    expect(n.change((x) => x.createEvent('  '))).not.toBe('');
    expect(n.event('id2').name).toBe('New event');
  });

  test('every field is checked before it is stored; what does not fit is not stored', () => {
    const n = new Novel();
    const id = n.change((x) => x.createEvent('The siege'));
    n.change((x) =>
      x.updateEvent(id, () => ({
        name: '   ',
        when: { precision: 'exact', year: 1020, month: null, day: 4, hour: 3 },
        locationId: 'guild',
        characters: [
          { id: 'mira', age: '17' },
          { id: 'mira', age: 3 },
          { id: 'guild', age: 1 },
          { id: 'gone', age: 1 },
          { id: 'bren', age: -2 },
        ],
        entryIds: ['guild', 'gone', 'guild'],
        nodeIds: ['ch2', 'nowhere'],
        afterId: id,
        threadIds: ['thread', 'other'],
        labels: ['  mystery   CLUE ', 'Mystery clue', '', 'mine'],
        status: 'someday',
        canon: 'maybe',
        importance: 'enormous',
      })),
    );
    const e = n.raw(id);
    expect(e['name']).toBe('Untitled event');
    expect(e['when']).toEqual({ precision: 'exact', year: 1020, month: null, day: null, hour: null, minute: null });
    expect(e['locationId']).toBeNull(); // a faction is not a place
    expect(e['characters']).toEqual([
      { id: 'mira', age: 17 },
      { id: 'bren', age: null },
    ]);
    expect([e['entryIds'], e['nodeIds'], e['afterId'], e['threadIds']]).toEqual([['guild'], ['ch2'], null, ['thread']]);
    expect(e['labels']).toEqual(['Mystery clue', 'mine']);
    expect([e['status'], e['canon'], e['importance']]).toEqual(['confirmed', 'canon', 'minor']);
  });

  test('how long an event lasts is said one way at a time: a duration, an end, or still going on', () => {
    const n = new Novel();
    const id = n.change((x) => x.createEvent('The war'));
    const set = (changes: JsonMap) => n.change((x) => x.updateEvent(id, () => changes));
    set({ duration: { amount: 3, unit: 'years' } });
    expect([n.raw(id)['duration'], n.raw(id)['end'], n.raw(id)['ongoing']]).toEqual([{ amount: 3, unit: 'years' }, null, false]);
    set({ end: { precision: 'approximate', year: 12, season: 'spring' } });
    expect([n.raw(id)['duration'], n.raw(id)['ongoing']]).toEqual([null, false]);
    expect(mapOrNull(n.raw(id)['end'])!['season']).toBe('spring');
    set({ ongoing: true });
    expect([n.raw(id)['duration'], n.raw(id)['end'], n.raw(id)['ongoing']]).toEqual([null, null, true]);
    set({ duration: { amount: 0, unit: 'days' } });
    expect(n.raw(id)['duration']).toBeNull(); // no length is no duration
    expect(n.raw(id)['ongoing']).toBe(true); // an empty duration says nothing about the end
  });

  test('a relative date points at another event of the novel, never at itself', () => {
    const n = new Novel();
    const a = n.change((x) => x.createEvent('A'));
    const b = n.change((x) => x.createEvent('B'));
    n.change((x) =>
      x.updateEvent(b, () => ({ when: { precision: 'relative', anchorId: b, amount: 2, unit: 'days', direction: 'after' } })),
    );
    expect(mapOrNull(n.raw(b)['when'])!['anchorId']).toBeNull();
    n.change((x) =>
      x.updateEvent(b, () => ({
        when: { precision: 'relative', anchorId: a, amount: -2, unit: 'fortnights', direction: 'x' },
      })),
    );
    expect(n.raw(b)['when']).toEqual({ precision: 'relative', anchorId: a, amount: 2, unit: 'years', direction: 'before' });
  });

  test('a chapter’s role in telling an event lasts as long as the event is told there', () => {
    const n = new Novel();
    const id = n.change((x) => x.createEvent('The duel'));
    n.change((x) =>
      x.updateEvent(id, () => ({
        nodeIds: ['ch1', 'ch2'],
        reveals: [
          { nodeId: 'ch1', role: 'flashforward' },
          { nodeId: 'ch1', role: 'flashback' },
          { nodeId: 'ch2', role: 'told' },
          { nodeId: 'elsewhere', role: 'mentioned' },
          { nodeId: 'ch2', role: 'sung' },
        ],
      })),
    );
    expect(n.raw(id)['reveals']).toEqual([{ nodeId: 'ch1', role: 'flashforward' }]);
    n.change((x) => x.updateEvent(id, () => ({ nodeIds: ['ch2'] })));
    expect(n.raw(id)['reveals']).toEqual([]); // taking the chapter off takes its role
  });

  test('saving a calendar is checked first, and never changes an event', () => {
    const n = new Novel();
    const id = n.change((x) => x.createEvent('The council'));
    n.change((x) => x.updateEvent(id, () => ({ when: { precision: 'exact', year: 10, month: 12, day: 31 } })));
    const before = n.raw(id);
    expect(() => n.change((x) => x.saveCalendar({ kind: 'custom', name: '', months: [], hoursPerDay: 0 }))).toThrow(
      ChangeRefused,
    );
    expect(n.snapshot.rows('storyCalendars')).toEqual([]);
    n.change((x) =>
      x.saveCalendar({
        kind: 'custom',
        name: ' The Reckoning ',
        months: [
          { name: 'Thaw', days: 40 },
          { name: 'Frost', days: 40 },
        ],
        hoursPerDay: 20,
        daysPerWeek: 6,
        eras: [
          { name: 'Second Age', startYear: 1000 },
          { name: 'First Age', startYear: 0 },
        ],
        seasons: { spring: 1, summer: 1, autumn: 2, winter: 2 },
      }),
    );
    const rows = n.snapshot.rows('storyCalendars');
    expect(rows.length).toBe(1);
    expect([rows[0]['name'], (rows[0]['eras'] as unknown[])[0]]).toEqual(['The Reckoning', { name: 'First Age', startYear: 0 }]);
    expect(jsonEquals(n.raw(id), before)).toBe(true); // the stored date is left as it was
    const model = StoryModel.fromSnapshot(n.snapshot);
    const placed = resolveChronology(model.events.values(), model.calendar);
    expect(placed.length).toBe(1);
    expect(placed[0].issues.length).toBe(1);
    expect(placed[0].issues[0]).toContain('Month 12 is not in The Reckoning, which has 2 months.');
  });

  test('alternate histories keep only their differences, inside themselves, and never touch the main timeline', () => {
    const n = new Novel();
    const siege = n.change((x) => x.createEvent('The siege'));
    const feast = n.change((x) => x.createEvent('The feast'));
    n.change((x) => x.updateEvent(siege, () => ({ when: { precision: 'exact', year: 10 }, locationId: 'keep' })));
    const main = n.snapshot.rows('timelineEvents').map((r) => ({ ...r }));
    const h = n.change((x) => x.createHistory({ name: 'If the Keep fell', baseId: 'nobody', originEventId: 'gone' }));
    expect([n.change((x) => x.history(h)).baseId, n.change((x) => x.history(h)).originEventId]).toEqual([null, null]);

    // The same as the base: nothing is kept.
    n.change((x) => x.changeHistoryEvent(h, siege, { name: 'The siege', locationId: 'keep', ongoing: false }));
    expect(n.change((x) => x.history(h)).changed.size).toBe(0);
    n.change((x) => x.changeHistoryEvent(h, siege, { when: { precision: 'exact', year: 12 }, locationId: 'mira' }));
    expect(n.change((x) => x.history(h)).changed.get(siege)).toEqual({
      when: { precision: 'exact', year: 12, month: null, day: null, hour: null, minute: null },
      locationId: null,
    });
    n.change((x) => x.removeHistoryEvent(h, feast));
    const only = n.change((x) => x.addHistoryEvent(h, 'The parley'));
    const events = historyEvents(
      new Map(n.snapshot.rows('timelineEvents').map((r) => [str(r['id']), new TimelineEvent(r)])),
      new Map(n.snapshot.rows('alternateHistories').map((r) => [str(r['id']), new AlternateHistory(r)])),
      h,
    );
    expect(new Set(events.keys())).toEqual(new Set([siege, only]));
    expect(mapOrNull(events.get(siege)!.raw['when'])!['year']).toBe(12);
    expect(n.snapshot.rows('timelineEvents').some((r) => r['id'] === only)).toBe(false); // kept inside the history
    // An added event is changed as an added event.
    expect(() => n.change((x) => x.changeHistoryEvent(h, only, { name: 'x' }))).toThrow(ChangeRefused);

    // A history based on this one is based on its base when it goes.
    const child = n.change((x) => x.createHistory({ name: 'Further', baseId: h }));
    n.change((x) => x.removeHistory(h));
    expect(n.change((x) => x.history(child)).baseId).toBeNull();
    expect(jsonEquals(n.snapshot.rows('timelineEvents'), main)).toBe(true); // the main timeline is never touched
  });

  test('deleting an event takes its connections with it; events that followed it keep everything and are flagged', () => {
    const n = new Novel();
    const a = n.change((x) => x.createEvent('A'));
    const b = n.change((x) => x.createEvent('B'));
    n.change((x) => x.updateEvent(b, () => ({ afterId: a })));
    const after = planDelete(n.snapshot, new EntityRef('event', a)).snapshot;
    const model = StoryModel.fromSnapshot(after);
    expect([...model.events.keys()]).toEqual([b]);
    expect(model.events.get(b)!.afterId).toBe(a); // kept, so the author can place it again
    const placed = resolveChronology(model.events.values());
    expect(placed[0].issues).toContain('It is set to follow an event that no longer exists.');
  });

  test('moving a chapter changes only reading order, never when anything happens', () => {
    const n = new Novel();
    const early = n.change((x) => x.createEvent('Childhood'));
    const late = n.change((x) => x.createEvent('The duel'));
    n.change((x) => x.updateEvent(early, () => ({ when: { precision: 'exact', year: 1 }, nodeIds: ['ch2'] })));
    n.change((x) => x.updateEvent(late, () => ({ when: { precision: 'exact', year: 20 }, nodeIds: ['ch1'] })));
    const before = twoOrders(StoryModel.fromSnapshot(n.snapshot));
    expect(orderSummary(before)).toBe('Not told in story order: 1 telling goes back in time.');
    const moved = n.snapshot.withRows(
      'chapters',
      n.snapshot.rows('chapters').map((c) => ({ ...c, order: c['id'] === 'ch1' ? 1 : 0 })),
    );
    const after = twoOrders(StoryModel.fromSnapshot(moved));
    expect(orderSummary(after)).toBe('Told in story order: the reader meets the events in the order they happen.');
    expect(after.events.map((e) => e.id)).toEqual(before.events.map((e) => e.id));
    expect(jsonEquals(moved.rows('timelineEvents'), n.snapshot.rows('timelineEvents'))).toBe(true);
  });

  test('the timeline starts from the chapters only when it is empty, in the order they are told', () => {
    const n = new Novel();
    const made = n.change((x) => x.eventsFromChapters(['ch2', 'ch1', 'nowhere']));
    const events = made.map((id) => n.event(id));
    expect(events.map((e) => [e.name, e.nodeIds, e.afterId])).toEqual([
      ['Two', ['ch2'], null],
      ['One', ['ch1'], made[0]],
    ]);
    expect(events.every((e) => e.when?.precision === 'unknown')).toBe(true); // no date is made up
    expect(() => n.change((x) => x.eventsFromChapters(['ch1']))).toThrow('The timeline already has events.');
    expect(() => new Novel().change((x) => x.eventsFromChapters(['nowhere']))).toThrow('There are no chapters to start from.');
  });
});

test('every ready-made calendar is accepted as it is, and its year said plainly', () => {
  for (const p of calendarPresets) {
    expect([p.name, presetIsValid(p)]).toEqual([p.name, true]);
    expect([p.name, Calendar.fromJson(p.settings).standard]).toEqual([p.name, false]); // reads as its own calendar
  }
  expect(yearOf(calendarPresets[0].settings)).toBe('364 days in 13 months');
});

const model = () =>
  StoryModel.fromSnapshot(
    new NovelBuilder()
      .node('ch1')
      .node('ch2', { order: 1 })
      .node('ch3', { order: 2 })
      .entry('mira')
      .entry('orrin')
      .event('siege', { when: year(10) })
      .event('treaty', { when: exact(12, { month: 3, day: 1 }) })
      .build(),
  );

describe('historical states are kept and retrievable', () => {
  test('a fact that holds from one chapter to another', () => {
    const m = model();
    const v = new Validity(Anchor.node('ch2'), Anchor.node('ch3'));
    expect(['ch1', 'ch2', 'ch3'].map((n) => validAt(v, Anchor.node(n), m.timeContext))).toEqual(['no', 'yes', 'no']);
  });

  test('reading order and story time are never compared: the answer is unknown', () => {
    const m = model();
    expect(validAt(new Validity(Anchor.node('ch2'), null), Anchor.event('siege'), m.timeContext)).toBe('unknown');
  });

  test('a date only known to the year cannot settle a question inside that year', () => {
    const m = model();
    const fromSpring = new Validity(Anchor.date(exact(10, { month: 4 })), null);
    expect(validAt(fromSpring, Anchor.event('siege'), m.timeContext)).toBe('unknown');
    expect(validAt(fromSpring, Anchor.event('treaty'), m.timeContext)).toBe('yes');
    expect(validAt(fromSpring, Anchor.date(year(9)), m.timeContext)).toBe('no');
  });

  test('a handover at the same point does not overlap; open-ended ones do', () => {
    const ctx = model().timeContext;
    const first = new Validity(null, Anchor.event('treaty'));
    const second = new Validity(Anchor.event('treaty'), null);
    expect(overlaps(first, second, ctx)).toBe('no');
    expect(overlaps(Validity.always, second, ctx)).toBe('yes');
  });

  test('history is ordered: open starts, story time, reading order, then unplaceable, never dropped', () => {
    const ctx = model().timeContext;
    const states = [
      new Validity(Anchor.node('ch2'), null),
      new Validity(Anchor.date({ precision: 'unknown' }), null),
      new Validity(Anchor.event('treaty'), null),
      Validity.always,
      new Validity(Anchor.event('siege'), null),
    ];
    expect(historyOf(states, (v) => v, ctx)).toEqual([states[3], states[4], states[2], states[0], states[1]]);
  });
});

describe('fictional time is modelled honestly', () => {
  test('approximate dates cover their whole stretch; exact days cover a day', () => {
    const c = Calendar.standardCalendar;
    const yearSpan = c.spanOf(EventDate.fromJson(year(10))!)!;
    expect(yearSpan.hi - yearSpan.lo + 1).toBe(c.minutesPerYear);
    const day = c.spanOf(EventDate.fromJson(exact(10, { month: 1, day: 1 }))!)!;
    expect(day.hi - day.lo + 1).toBe(c.minutesPerDay);
    const summer = c.spanOf(EventDate.fromJson(year(10, { season: 'summer' }))!)!;
    expect(summer.lo).toBe(yearSpan.lo + c.monthStarts[5]);
  });

  test('an unknown date has no place; a relative one is placed from its anchor', () => {
    const m = StoryModel.fromSnapshot(
      new NovelBuilder()
        .event('siege', { when: year(10) })
        .event('before', { when: { precision: 'relative', anchorId: 'siege', amount: 2, unit: 'years', direction: 'before' } })
        .event('loop', { when: { precision: 'relative', anchorId: 'loop', amount: 1, unit: 'days', direction: 'after' } })
        .event('never')
        .build(),
    );
    const ctx = m.timeContext;
    expect(spanOfEvent('never', ctx)).toBeNull();
    expect(spanOfEvent('before', ctx)!.lo).toBe(spanOfEvent('siege', ctx)!.lo - 2 * Calendar.standardCalendar.minutesPerYear);
    expect(spanOfEvent('loop', ctx)).toBeNull(); // an event dated from itself cannot be placed
  });

  test('a custom calendar with its own months and day length', () => {
    const c = Calendar.fromJson({
      kind: 'custom',
      name: 'The Reckoning',
      months: [
        { name: 'Frost', days: 40 },
        { name: 'Thaw', days: 30 },
      ],
      hoursPerDay: 20,
      daysPerWeek: 5,
      eras: [{ name: 'Second Age', startYear: 100 }],
      seasons: { spring: 2, summer: 2, autumn: 1, winter: 1 },
    });
    expect(c.standard).toBe(false);
    expect(c.minutesPerDay).toBe(1200);
    expect(c.minutesPerYear).toBe(70 * 1200);
    expect(c.yearName(103)).toBe('Second Age 4');
    expect(c.dateProblem(EventDate.fromJson(exact(1, { month: 3 }))!)).toContain('Month 3 is not in The Reckoning');
    expect(c.spanOf(EventDate.fromJson(exact(1, { month: 3 }))!)).toBeNull(); // a date that does not fit is not placed
  });

  test('a calendar that cannot be read falls back to the standard one; stored dates are not touched', () => {
    expect(Calendar.fromJson({ kind: 'custom', name: '', months: [] }).standard).toBe(true);
    expect(calendarProblems({ kind: 'custom', name: '', months: [] })).toContain('Give the calendar a name.');
  });
});
