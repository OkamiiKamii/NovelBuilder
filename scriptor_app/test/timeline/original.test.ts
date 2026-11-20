// The whole timeline domain against the original app's own outputs: every part of
// flutter_app/test/shared/domain/timeline_test.dart's report (event records, the axis and its scales, typed dates,
// events at the same time, tracks, both orders, ages, life paths, life histories, the timeline review and alternate
// histories), on both real fixtures and the generated chronicle, each in the standard calendar and in one of its own.
// test/model/timeline.test.ts checks the calendar, chronology and orders parts of the same golden; this checks all.

import '../flutterBuiltins';
import { join } from 'node:path';

import { CharacterHistoryLine } from '../../src/domain/characters/characterRecords';
import { type JsonMap, listOf, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import type { EventBounds } from '../../src/domain/model/validity';
import type { Span } from '../../src/domain/records/calendar';
import { EventDate } from '../../src/domain/records/event';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { type AgeAt, agesOf, birthDateOf, lifePath } from '../../src/domain/timeline/ages';
import { domainOf, layoutAxis } from '../../src/domain/timeline/axis';
import { resolveChronology } from '../../src/domain/timeline/chronology';
import { describeCalendar, formatDate, normalizeDate } from '../../src/domain/timeline/dates';
import { eventRecords, validateEvent } from '../../src/domain/timeline/eventRecord';
import {
  AlternateHistory,
  compareTimelines,
  comparisonSummary,
  historyEvents,
  originWords,
  staleChanges,
} from '../../src/domain/timeline/histories';
import { type HistoryItem, lifeHistory } from '../../src/domain/timeline/lifeHistory';
import { type StoryTelling, orderSummary, tellingNotes, twoOrders } from '../../src/domain/timeline/narrative';
import { atTheSameTime } from '../../src/domain/timeline/overlap';
import { reviewTimeline } from '../../src/domain/timeline/review';
import { chooseScale, readDate, type TimeWindow, ticksFor } from '../../src/domain/timeline/scale';
import { arrange, decodeGrouping, groupings, tracksFor } from '../../src/domain/timeline/tracks';
import { flutterFixturesDir, readJson } from '../fixtures';
import { expectJson, plain } from './compare';

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

/** An event as the original's model hands it out: the stored row with its defaults filled in. */
const asModelReads = (e: JsonMap): JsonMap => ({
  ...e,
  characters: listOf(e['characters']),
  entryIds: listOf(e['entryIds']),
  nodeIds: listOf(e['nodeIds']),
  afterId: e['afterId'] ?? null,
  locationId: e['locationId'] ?? null,
  end: e['end'] ?? null,
  ongoing: e['ongoing'] === true,
  threadIds: listOf(e['threadIds']),
  status: e['status'] ?? 'confirmed',
  canon: e['canon'] ?? 'canon',
  reveals: listOf(e['reveals']),
});

const span = (s: Span | null) => (s === null ? null : { lo: s.lo, hi: s.hi });
const bounds = (b: EventBounds | null) => (b === null ? null : { start: span(b.start), end: span(b.end), open: b.open });

function age(a: AgeAt): JsonMap {
  switch (a.kind) {
    case 'stated':
    case 'known':
      return { kind: a.kind, age: a.age };
    case 'range':
      return { kind: 'range', min: a.min, max: a.max };
    case 'unborn':
      return { kind: 'unborn' };
    case 'unknown':
      return { kind: 'unknown', reason: a.reason };
  }
}

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
  const records = eventRecords(model);
  const events: JsonMap = {};
  for (const r of records) {
    events[r.id] = {
      label: r.label,
      shape: r.shape,
      precision: r.precision,
      span: span(r.span),
      bounds: bounds(r.bounds),
      dateProblem: r.dateProblem,
      told: r.told.map((t) => ({ nodeId: t.nodeId, role: t.role, position: t.position })),
      problems: validateEvent(model, r.event),
    };
  }
  const domain = domainOf(records, { day: cal.minutesPerDay, year: cal.minutesPerYear });
  const axis = layoutAxis(records, { domain, useDomain: true, day: cal.minutesPerDay, year: cal.minutesPerYear });
  const windows: TimeWindow[] =
    domain === null
      ? []
      : [1, 0.2, 0.01, 0.0005, 0.00001, 0.0000002].map((share) => ({
          from: domain.from,
          to: domain.from + (domain.to - domain.from) * share,
        }));
  const ticks = (list: { t: number; label: string }[]) => list.map((t) => ({ t: t.t, label: t.label }));
  const scales = windows.map((w) => ({
    window: { from: w.from, to: w.to },
    scale: (() => {
      const sc = chooseScale(w, 1200, cal);
      return { unit: sc.unit, step: sc.step };
    })(),
    ticks: ticks(ticksFor(w, 1200, cal)),
    narrow: ticks(ticksFor(w, 320, cal)),
  }));
  const typed = [
    '10',
    'Year -500',
    '1020-5',
    '1020-5-4',
    '1020-13',
    '1020-5-45',
    'June 1020',
    'Thaw 1005',
    'Second Age 4',
    'Bloom Second Age 4',
    'First Age 12',
    'year of the comet',
    ' 1000 / 3 / 1 ',
  ];
  const readDates: JsonMap = {};
  for (const t of typed) {
    const r = readDate(t, cal);
    readDates[t] = r === null ? null : { t: r.t, length: r.length };
  }
  const sameTime: JsonMap = {};
  for (const r of records) {
    sameTime[r.id] = atTheSameTime(records, r.id, cal.minutesPerDay).map((x) => ({ id: x.record.id, how: x.how }));
  }
  const tracks: JsonMap = {};
  for (const g of groupings(model)) {
    const list = tracksFor(model, records, decodeGrouping(g.value));
    const ids = list.map((t) => t.id);
    const arranged = arrange(list, {
      order: [...ids].reverse().slice(0, 2),
      hidden: ids.slice(1, 2),
      folded: ids.slice(0, 1),
    });
    const focused = arrange(list, { focus: ids.length === 0 ? null : ids[ids.length - 1] });
    tracks[g.value] = {
      label: g.label,
      tracks: list.map((t) => ({ id: t.id, label: t.label, eventIds: t.eventIds })),
      arranged: { shown: arranged.shown.map((t) => [t.id, t.folded]), hidden: arranged.hidden.map((t) => t.id) },
      focused: focused.shown.map((t) => t.id),
    };
  }
  const orders = twoOrders(model);
  const characters = [...model.entries.values()]
    .filter((e) => e.category === 'character')
    .map((e) => e.id)
    .sort();
  const ages: JsonMap = {};
  for (const id of characters) {
    const a = agesOf(id, model.events, { calendar: cal, birthDate: birthDateOf(model.entries.get(id)) });
    const at: JsonMap = {};
    for (const [k, v] of a.at) at[k] = age(v);
    const issues: JsonMap = {};
    for (const [k, v] of a.issues) issues[k] = v;
    ages[id] = {
      birth: { span: span(a.birth.span), basis: a.birth.basis, unread: a.birth.unread, conflict: a.birth.conflict },
      at,
      issues,
    };
  }
  const placed = resolveChronology(model.events.values(), cal);
  const lifePaths: JsonMap = {};
  for (const id of characters) {
    lifePaths[id] = lifePath(placed, id, { calendar: cal, birthDate: birthDateOf(model.entries.get(id)) }).map((step) => ({
      id: step.placed.event.id,
      label: step.label,
      age: step.age,
      stated: step.stated,
      issue: step.issue,
    }));
  }
  const snapshots = s.rows('progressSnapshots');
  const milestones = s.rows('characterHistory').map((r) => new CharacterHistoryLine(r));
  const item = (i: HistoryItem) => ({
    key: i.key,
    kind: i.kind,
    ref: i.ref?.toJson() ?? null,
    to: i.to === null ? null : { page: i.to.page, id: i.to.id },
    title: i.title,
    detail: i.detail,
    when: i.when,
    age: i.age === null ? null : age(i.age),
  });
  const lives: JsonMap = {};
  for (const id of characters) {
    const life = lifeHistory(model, id, { snapshots, milestones })!;
    lives[id] = {
      born: life.born,
      story: life.story.map(item),
      reading: life.reading.map(item),
      throughout: life.throughout.map(item),
      issues: life.issues,
    };
  }
  const review = reviewTimeline(model, s.rows('continuityRules')).map((f) => ({ ...f.toJson(), severity: 'warning' }));
  const histories = new Map(s.rows('alternateHistories').map((r) => [str(r['id']), new AlternateHistory(r)]));
  const historyOut: JsonMap = {};
  for (const h of histories.values()) {
    const evs = historyEvents(model.events, histories, h.id);
    const diffs = compareTimelines(model.events, evs, cal);
    const eventsOut: JsonMap = {};
    for (const [k, e] of evs) eventsOut[k] = model.events.has(k) ? asModelReads(e.raw) : e.raw;
    historyOut[h.id] = {
      events: eventsOut,
      diffs: diffs.map((d) => ({
        id: d.id,
        difference: d.difference,
        fields: d.fields,
        whenA: d.whenA,
        whenB: d.whenB,
        direction: d.direction,
      })),
      summary: comparisonSummary(diffs, 'The main timeline', h.name),
      origin: originWords(h, historyEvents(model.events, histories, h.baseId), histories, cal),
      stale: staleChanges(model.events, histories, h),
    };
  }
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
  const formatted = [
    ...normalized,
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 0, minute: 5 },
    { precision: 'exact', year: 1020, month: 5, day: 4, hour: 13, minute: null },
    { precision: 'approximate', year: 1001, month: 2, season: null },
    { precision: 'relative', anchorId: records[0]?.id ?? null, amount: 1.5, unit: 'years', direction: 'before' },
    { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' },
  ].map((d) => formatDate(EventDate.fromJson(d), nameOf, cal));
  return plain({
    calendar: describeCalendar(cal),
    chronology: placed.map((p) => ({
      id: p.event.id,
      value: p.value,
      year: p.year,
      anchored: p.anchored,
      label: p.label,
      issues: p.issues,
    })),
    events,
    axis: {
      marks: axis.marks.map((m) => ({
        id: m.id,
        title: m.title,
        when: m.when,
        kind: m.kind,
        start: m.start,
        end: m.end,
        startFuzz: span(m.startFuzz),
        endFuzz: span(m.endFuzz),
        lane: m.lane,
        x: m.x,
        width: m.width,
      })),
      unplaced: axis.unplaced.map((u) => ({ id: u.id, title: u.title, reason: u.reason })),
      from: axis.from,
      to: axis.to,
      width: axis.width,
      lanes: axis.lanes,
    },
    scales,
    readDates,
    sameTime,
    tracks,
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
    ages,
    lifePaths,
    lives,
    review,
    histories: historyOut,
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
    describe(`${name}${suffix} agrees with the original`, () => {
      const expected = golden[`${name}${suffix}`];
      const actual = report(s);
      for (const part of Object.keys(expected)) {
        test(part, () => expectJson(actual[part], expected[part], `${name}${suffix}.${part}`));
      }
    });
  }
}
