// The calendar, chronology and the two orders against the original app's own outputs: the parts of
// flutter_app/test/shared/domain/timeline_test.dart for dates.dart, chronology.dart and narrative.dart, on both real
// files and the generated chronicle, each in the standard calendar and in one of its own. The test's other parts (the
// axis, scales, read dates, tracks, ages, life histories, the timeline review and alternate histories) are of
// timeline modules not ported yet.

import { join } from 'node:path';

import { type JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { calendarProblems } from '../../src/domain/records/calendar';
import { EventDate } from '../../src/domain/records/event';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { resolveChronology } from '../../src/domain/timeline/chronology';
import { cleanCalendar, describeCalendar, formatDate, normalizeDate } from '../../src/domain/timeline/dates';
import { type StoryTelling, orderSummary, tellingNotes, twoOrders } from '../../src/domain/timeline/narrative';
import { flutterFixturesDir, readJson } from '../fixtures';
import { plain } from './outputs';

const golden = readJson(join(flutterFixturesDir, 'golden', 'timeline.golden.json')) as Record<string, JsonMap>;

const custom: JsonMap = {
  kind: 'custom',
  name: 'The Reckoning',
  months: ['Thaw', 'Bloom', 'Swelter', 'Harvest', 'Fall', 'Frost', 'Deep', 'Dark', 'Wake', 'Mud'].map((name) => ({
    name,
    days: 40,
  })),
  hoursPerDay: 20,
  daysPerWeek: 6,
  eras: [
    { name: 'First Age', startYear: 0 },
    { name: 'Second Age', startYear: 1000 },
  ],
  seasons: { spring: 1, summer: 3, autumn: 6, winter: 8 },
};

const withCalendar = (s: NovelSnapshot) =>
  s.withRows('storyCalendars', [{ ...custom, id: 'cal', projectId: s.projectId, updatedAt: 0 }]);

const telling = (t: StoryTelling) => ({
  eventId: t.eventId,
  nodeId: t.nodeId,
  role: t.role,
  storyRank: t.storyRank,
  readingRank: t.readingRank,
  back: t.back,
  ahead: t.ahead,
});

function report(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const cal = model.calendar;
  const nameOf = (id: string) => model.events.get(id)?.name ?? null;
  const orders = twoOrders(model);
  const samples: unknown[] = [
    { precision: 'exact', year: 10, month: 2, day: 31, hour: 25, minute: 70 },
    { precision: 'exact', year: '12', month: '13', day: 3 },
    { precision: 'exact', year: 2.5, month: 2.5, day: 1.5, hour: 0.5 },
    { precision: 'exact', year: -2.5, month: 1, day: 40, hour: 19, minute: null },
    { precision: 'approximate', year: 7, month: 0, season: 'winter' },
    { precision: 'approximate', year: 7, month: 3, season: 'winter' },
    { precision: 'approximate', year: null },
    { precision: 'relative', anchorId: '', amount: -3, unit: 'fortnights', direction: 'sideways' },
    { precision: 'relative', anchorId: 'x', amount: '2.5', unit: 'weeks', direction: 'after' },
    { precision: 'nonsense' },
    null,
  ];
  const normalized = samples.map((x) => normalizeDate(x, cal));
  const firstEvent = [...model.events.keys()][0] ?? null;
  const formatted = [
    ...normalized,
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 0, minute: 5 },
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 13, minute: null },
    { precision: 'approximate', year: 1001, month: 2, season: null },
    { precision: 'relative', anchorId: firstEvent, amount: 1.5, unit: 'years', direction: 'before' },
    { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' },
  ].map((d) => formatDate(EventDate.fromJson(d), nameOf, cal));
  return plain({
    calendar: describeCalendar(cal),
    chronology: resolveChronology(model.events.values(), cal).map((p) => ({
      id: p.event.id,
      value: p.value,
      year: p.year,
      anchored: p.anchored,
      label: p.label,
      issues: p.issues,
    })),
    orders: {
      events: orders.events.map((e) => ({
        id: e.id,
        title: e.title,
        when: e.when,
        storyRank: e.storyRank,
        tellings: e.tellings.map(telling),
      })),
      nodes: orders.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        readingRank: n.readingRank,
        tellings: n.tellings.map((t) => `${t.eventId}@${t.nodeId}`),
      })),
      tellings: orders.tellings.map(telling),
      placed: orders.placed,
      linear: orders.linear,
    },
    notes: tellingNotes(orders, model).map((n) => ({ telling: `${n.telling.eventId}@${n.telling.nodeId}`, note: n.note })),
    summary: orderSummary(orders),
    normalized,
    formatted,
  }) as JsonMap;
}

const sources: [string, NovelSnapshot][] = ['qa-sample', 'made-in-the-app', 'chronicle'].map((name) => [
  name,
  NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`))),
]);

for (const [name, snapshot] of sources) {
  for (const [suffix, s] of [
    ['', snapshot],
    ['+calendar', withCalendar(snapshot)],
  ] as const) {
    test(`${name}${suffix}: the calendar, chronology and both orders agree with the original`, () => {
      const expected = golden[`${name}${suffix}`];
      const actual = report(s);
      for (const part of Object.keys(actual)) expect([part, actual[part]]).toEqual([part, expected[part]]);
    });
  }
}

test('calendar settings are checked and cleaned as the original does', () => {
  const inputs: JsonMap[] = [
    custom,
    { ...custom, kind: 'standard' },
    {
      ...custom,
      name: ' ',
      months: [
        { name: 'A', days: 0 },
        { name: 'a', days: 1.5 },
      ],
      hoursPerDay: 0,
      daysPerWeek: 200,
      eras: [
        { name: '', startYear: 5 },
        { name: 'B', startYear: 5 },
      ],
      seasons: { spring: 0, summer: 3, autumn: 1, winter: 1 },
    },
    { kind: 'standard', name: 'x', months: [], hoursPerDay: 0, daysPerWeek: 0, eras: [], seasons: {} },
  ];
  const actual = inputs.map((i) => ({
    problems: calendarProblems(i),
    cleaned: (() => {
      try {
        return cleanCalendar(i);
      } catch {
        return null;
      }
    })(),
  }));
  expect(actual).toEqual(golden['calendars']);
});
