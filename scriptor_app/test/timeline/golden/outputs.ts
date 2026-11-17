// Scriptor's outputs for phase 6a's timeline, keyed and shaped as dump.dart's, so the agreement test can compare them
// with the Flutter app's (timeline.golden.json). Where dump.dart copies a widget's logic, this calls the screens' pure
// parts (src/domain/timeline/screens/*), so they are what is checked. See dump.dart for what is read.

import { CastData } from '../../../src/domain/characters/castData';
import { CharacterHistoryLine } from '../../../src/domain/characters/characterRecords';
import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { localeCompare } from '../../../src/domain/collation';
import type { JsonMap } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { EventBounds } from '../../../src/domain/model/validity';
import { stableSorted } from '../../../src/domain/reader/stableSort';
import { Calendar, Span } from '../../../src/domain/records/calendar';
import type { Entry } from '../../../src/domain/records/entry';
import { EventDate } from '../../../src/domain/records/event';
import type { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { type AgeAt, ageAt, ageLabel, ageWords, agesOf, birthDateOf, lifePath, lifeSummary } from '../../../src/domain/timeline/ages';
import { calendarPresets, presetIsValid, yearOf } from '../../../src/domain/timeline/calendarPresets';
import { resolveChronology } from '../../../src/domain/timeline/chronology';
import { calendarSettingsOf, describeCalendar, formatDate, normalizeDate } from '../../../src/domain/timeline/dates';
import { EventChanges, cleanLabels } from '../../../src/domain/timeline/eventChanges';
import { eventRecords, validateEvent } from '../../../src/domain/timeline/eventRecord';
import { staleChanges } from '../../../src/domain/timeline/histories';
import { type HistoryItem, lifeHistory } from '../../../src/domain/timeline/lifeHistory';
import { atTheSameTime, together, togetherWords } from '../../../src/domain/timeline/overlap';
import { reviewTimeline, withDecisions } from '../../../src/domain/timeline/review';
import { chooseScale, partsOf, readDate, scaleName, ticksFor } from '../../../src/domain/timeline/scale';
import { calendarView } from '../../../src/domain/timeline/screens/calendarPage';
import { chronicleRows } from '../../../src/domain/timeline/screens/chronicle';
import { eventPage } from '../../../src/domain/timeline/screens/eventPage';
import { comparison, counts, selectedHistory, whatIfFor } from '../../../src/domain/timeline/screens/historiesPage';
import { TimelineData } from '../../../src/domain/timeline/screens/timelineData';
import { chapterSeed, eventCard, noFilters, seededMessage, timelineView } from '../../../src/domain/timeline/screens/timelinePage';
import { ReviewItem } from '../../../src/domain/records/review';

const span = (s: Span | null) => (s === null ? null : [s.lo, s.hi]);

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

const charactersOf = (model: StoryModel): Entry[] =>
  stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );

const mapOf = <V>(m: ReadonlyMap<string, V>, f: (v: V) => unknown): JsonMap => {
  const out: JsonMap = {};
  for (const [k, v] of m) out[k] = f(v);
  return out;
};

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const cal = model.calendar;
  const data = new TimelineData(new CastData(s.projectId, s));
  const placed = resolveChronology(model.events.values(), cal);
  const records = eventRecords(model);
  const out: Record<string, unknown> = {};

  out['records'] = records.map((r) => ({
    id: r.id,
    label: r.label,
    shape: r.shape,
    precision: r.precision,
    span: span(r.span),
    bounds: r.bounds === null ? null : [span(r.bounds.start), span(r.bounds.end), r.bounds.open],
    dateProblem: r.dateProblem,
    told: r.told.map((t) => [t.nodeId, t.role, t.position]),
    problems: validateEvent(model, r.event),
  }));
  const sameTime: JsonMap = {};
  for (const r of records) {
    sameTime[r.id] = atTheSameTime(records, r.id, cal.minutesPerDay).map((x) => [x.record.id, x.how, togetherWords[x.how]]);
  }
  out['sameTime'] = sameTime;
  const characters = charactersOf(model);
  const ages: JsonMap = {};
  for (const c of characters) {
    const a = agesOf(c.id, model.events, { calendar: cal, birthDate: birthDateOf(c) });
    ages[c.id] = {
      birth: [span(a.birth.span), a.birth.basis, a.birth.unread, a.birth.conflict],
      at: mapOf(a.at, age),
      issues: mapOf(a.issues, (v) => v),
      labels: mapOf(a.at, (v) => [ageLabel(v), ageWords(v)]),
    };
  }
  out['ages'] = ages;
  const lifePaths: JsonMap = {};
  for (const c of characters) {
    const steps = lifePath(placed, c.id, { calendar: cal, birthDate: birthDateOf(c) });
    lifePaths[c.id] = {
      steps: steps.map((st) => [st.placed.event.id, st.label, st.age, st.stated, st.issue]),
      summary: lifeSummary(steps),
    };
  }
  out['lifePaths'] = lifePaths;
  const milestones = s.rows('characterHistory').map((r) => new CharacterHistoryLine(r));
  const item = (i: HistoryItem) => [
    i.key,
    i.kind,
    i.ref?.toJson() ?? null,
    i.to === null ? null : [i.to.page, i.to.id],
    i.title,
    i.detail,
    i.when,
    i.age === null ? null : age(i.age),
  ];
  const lives: JsonMap = {};
  for (const c of characters) {
    const life = lifeHistory(model, c.id, { snapshots: s.rows('progressSnapshots'), milestones })!;
    lives[c.id] = {
      born: life.born,
      story: life.story.map(item),
      reading: life.reading.map(item),
      throughout: life.throughout.map(item),
      issues: life.issues,
    };
  }
  out['lives'] = lives;
  const findings = reviewTimeline(model, s.rows('continuityRules'));
  const review = withDecisions(findings, s.rows('continuityResolutions').map((r) => new ReviewItem(r)));
  out['review'] = {
    findings: findings.map((f) => f.toJson()),
    open: review.open.map((f) => f.key),
    decided: review.decided.map((d) => [d.finding.key, d.decision.decision]),
    gone: review.gone.map((d) => d.key),
  };

  // The chronicle, through the timeline page's own view.
  const view = timelineView(data, noFilters);
  const rows = (wide: boolean) =>
    chronicleRows(view.groups, wide).map((r) =>
      r.kind === 'gap'
        ? ['gap', r.text]
        : r.kind === 'year'
          ? ['year', r.heading, r.undated, r.first]
          : ['event', r.placed.event.id, r.left, r.importance, r.dashed],
    );
  const livesGroups: JsonMap = {};
  for (const c of characters) {
    livesGroups[c.id] = timelineView(data, { ...noFilters, character: c.id }).groups.map((g) => [g.key, g.heading, g.items.length]);
  }
  out['chronicle'] = {
    groups: view.groups.map((g) => [g.key, g.heading, g.items.map((p) => p.event.id)]),
    wide: rows(true),
    narrow: rows(false),
    lives: livesGroups,
  };
  const cards: JsonMap = {};
  for (const p of placed) {
    const card = eventCard(data, p, null);
    cards[p.event.id] = [card.when, card.name, card.importance?.label ?? null, card.details, card.problems];
  }
  out['cards'] = cards;
  const pages: JsonMap = {};
  for (const p of placed) {
    const page = eventPage(data, p.event.id)!;
    pages[p.event.id] = {
      subtitle: page.subtitle,
      issues: page.issues,
      endMode: page.endMode,
      cast: page.cast.map((c) => [c.id, c.age, c.hint]),
      followers: page.followers,
      sameTime: page.sameTime.lines.map((l) => l.text),
      told: page.told.map((t) => [t.nodeId, t.label, t.role]),
    };
  }
  out['pages'] = pages;

  const histories: JsonMap = {};
  for (const h of data.historyList) {
    const selected = selectedHistory(data, h);
    const compared = comparison(data, h.baseId, h.id, true);
    histories[h.id] = {
      name: h.name,
      kind: h.kind,
      status: h.status,
      events: selected.events.map((e) => [e.id, e.label, e.name]),
      summary: compared.summary,
      lines: compared.lines.map((l, i) => [l.name, l.inA, l.inB, l.what, compared.diffs[i].difference]),
      origin: selected.origin,
      stale: staleChanges(model.events, data.histories, h),
      before: selected.before,
      counts: counts(h),
    };
  }
  out['histories'] = histories;

  const rowsNow = s.rows('storyCalendars');
  out['calendars'] = [calendarSettingsOf(rowsNow.length === 0 ? null : rowsNow[0]), ...calendarPresets.map((p) => p.settings)].map(
    (draft, i) => {
      const v = calendarView(data, i === 0 ? null : draft);
      const preview = Calendar.fromJson(draft);
      return {
        problems: v.problems,
        summary: v.summary,
        away: v.away.shown.map((m) => [m.id, m.text]),
        awayTotal: v.away.total,
        labels: placed.map((p) => formatDate(p.event.when, (id) => model.events.get(id)?.name ?? null, preview)),
      };
    },
  );
  out['whatIf'] = whatIfFor(data).map((st) => [st.question, st.eventId]);

  out['seed'] = (() => {
    const chapters = model.order.chapters;
    const seed = chapterSeed(chapters);
    const empty = s.withRows('timelineEvents', []);
    let n = 0;
    const c = new EventChanges(empty, { now: 1000, createId: () => `id${++n}` });
    let made: unknown;
    try {
      const ids = c.eventsFromChapters(chapters.map((ch) => ch.id));
      made = ids.map((id) => {
        const r = c.snapshot.rows('timelineEvents').find((x) => x['id'] === id)!;
        return [r['name'], r['description'], r['nodeIds'], r['afterId'], r['createdAt']];
      });
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      made = `refused: ${e.message}`;
    }
    return {
      rows: seed.rows.map((r) => [r.title, r.stemAbove, r.stemBelow]),
      more: seed.more,
      button: seed.seed,
      made,
      message: Array.isArray(made) ? seededMessage(made.length) : null,
    };
  })();

  out['script'] = script(s);
  return out;
}

function script(s: NovelSnapshot): unknown[] {
  let snapshot = s;
  let n = 0;
  const model = StoryModel.fromSnapshot(s);
  const firstEvent = [...model.events.keys()][0] ?? null;
  const firstPlace = [...model.entries.values()].find((e) => e.category === 'location')?.id ?? null;
  const firstCharacter = charactersOf(model)[0]?.id ?? null;
  const firstChapter = model.order.chapters[0]?.id ?? null;
  const firstThread = [...model.threads.keys()][0] ?? null;
  const out: unknown[] = [];
  let made: string | null = null;
  let history: string | null = null;
  const step = (what: string, apply: (c: EventChanges) => unknown) => {
    const c = new EventChanges(snapshot, { now: 5000 + out.length, createId: () => `new${++n}` });
    try {
      const result = apply(c);
      snapshot = c.snapshot;
      out.push([
        what,
        result === undefined || result === null || typeof result === 'string' || typeof result === 'object' ? (result ?? null) : `${String(result)}`,
        snapshot.rows('timelineEvents'),
        snapshot.rows('storyCalendars'),
        snapshot.rows('alternateHistories'),
      ]);
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      out.push([what, `refused: ${e.message}`]);
    }
  };

  step('create', (c) => (made = c.createEvent('  The siege  ')));
  step('create blank', (c) => c.createEvent('   '));
  step('update all', (c) =>
    c.updateEvent(made!, () => ({
      name: '   ',
      description: 'At the gate.',
      when: { precision: 'exact', year: 1020, month: 5, day: 4, hour: 30 },
      locationId: firstPlace ?? 'gone',
      characters: [
        { id: firstCharacter ?? 'gone', age: '17.4' },
        { id: firstCharacter ?? 'gone', age: 3 },
        { id: 'gone', age: 1 },
      ],
      entryIds: [firstPlace ?? 'gone', 'gone', firstPlace ?? 'gone'],
      nodeIds: [firstChapter ?? 'gone', 'nowhere'],
      afterId: made,
      threadIds: [firstThread ?? 'gone', 'other'],
      labels: ['  quiet   MOMENT ', 'Quiet moment', '', 'mine', 'x'.repeat(50)],
      status: 'planned',
      canon: 'provisional',
      importance: 'climax',
      reveals: [
        { nodeId: firstChapter ?? 'gone', role: 'flashback' },
        { nodeId: firstChapter ?? 'gone', role: 'mentioned' },
      ],
    })),
  );
  step('duration', (c) => c.updateEvent(made!, () => ({ duration: { amount: '2.5', unit: 'weeks' } })));
  step('duration zero', (c) => c.updateEvent(made!, () => ({ duration: { amount: 0, unit: 'days' } })));
  step('end', (c) => c.updateEvent(made!, () => ({ end: { precision: 'approximate', year: 1021, season: 'winter' } })));
  step('ongoing', (c) => c.updateEvent(made!, () => ({ ongoing: true })));
  step('relative', (c) =>
    c.updateEvent(made!, () => ({
      when: { precision: 'relative', anchorId: firstEvent ?? made, amount: -3, unit: 'fortnights', direction: 'x' },
    })),
  );
  step('after', (c) => c.updateEvent(made!, () => ({ afterId: firstEvent })));
  step('unknown event', (c) => c.updateEvent('nobody', () => ({ name: 'x' })));
  step('from chapters', (c) => c.eventsFromChapters(model.order.chapters.map((ch) => ch.id)));
  step('bad calendar', (c) => c.saveCalendar({ kind: 'custom', name: '', months: [], hoursPerDay: 0 }));
  step('preset calendar', (c) => c.saveCalendar(calendarPresets[1].settings));
  step('standard calendar', (c) => c.saveCalendar({ kind: 'standard' }));
  step('history', (c) =>
    (history = c.createHistory({ name: '  If the Keep fell  ', originEventId: made, kind: 'time-travel', status: 'alternate' })),
  );
  step('history change same', (c) => c.changeHistoryEvent(history!, made!, { name: 'The siege' }));
  step('history change', (c) =>
    c.changeHistoryEvent(history!, made!, {
      name: 'The fall',
      when: { precision: 'exact', year: 1030 },
      locationId: firstCharacter,
      characters: [
        { id: firstCharacter ?? 'gone', age: 4 },
        { id: firstCharacter ?? 'gone', age: 5 },
      ],
      duration: { amount: 3, unit: 'months' },
    }),
  );
  if (firstEvent !== null) step('history remove', (c) => c.removeHistoryEvent(history!, firstEvent));
  step('history remove unknown', (c) => c.removeHistoryEvent(history!, 'nobody'));
  let added: string | null = null;
  step('history add', (c) => (added = c.addHistoryEvent(history!, 'The parley')));
  step('history update added', (c) => c.updateAddedEvent(history!, added!, { name: '  ', ongoing: true }));
  step('history update added unknown', (c) => c.updateAddedEvent(history!, made!, { name: 'x' }));
  step('history update', (c) =>
    c.updateHistory(history!, { name: ' ', kind: 'nope', status: 'non-canon', note: ' why ', originEventId: 'gone' }),
  );
  let child: string | null = null;
  step('child history', (c) => (child = c.createHistory({ name: 'Further', baseId: history })));
  step('loops', (c) => [c.loops(history!, child!), c.loops(child!, history!)]);
  if (firstEvent !== null) step('history restore', (c) => c.restoreHistoryEvent(history!, firstEvent));
  step('forget stale', (c) => c.forgetStale(history!));
  step('remove history', (c) => c.removeHistory(history!));
  return out;
}

export function misc(): Record<string, unknown> {
  const calendars = new Map<string, Calendar>([
    ['standard', Calendar.standardCalendar],
    ...calendarPresets.map((p): [string, Calendar] => [p.name, Calendar.fromJson(p.settings)]),
  ]);
  const dates: unknown[] = [
    { precision: 'exact', year: 10, month: 2, day: 31, hour: 25, minute: 70 },
    { precision: 'exact', year: 1020, month: 13, day: 3, hour: 5, minute: 7 },
    { precision: 'exact', year: -3, month: 1, day: 1 },
    { precision: 'approximate', year: 7, month: 0, season: 'winter' },
    { precision: 'approximate', year: 7, month: 3 },
    { precision: 'approximate', year: 1, season: 'summer' },
    { precision: 'relative', anchorId: 'x', amount: '2.5', unit: 'weeks', direction: 'after' },
    { precision: 'unknown' },
  ];
  const typed = [
    '10',
    'Year -500',
    '1020-5',
    '1020-5-4',
    '1020-13',
    'Frostmoon 4',
    'Cycle 3 12',
    'Age of Kings 4',
    'Ashen Age of Kings 2',
    'First Turning 1',
    ' 7 / 3 / 1 ',
  ];
  const byCalendar: JsonMap = {};
  for (const [name, c] of calendars) {
    const typedOut: JsonMap = {};
    for (const t of typed) {
      const r = readDate(t, c);
      typedOut[t] = r === null ? null : [r.t, r.length];
    }
    const windows = [
      { from: 0.0, to: c.minutesPerYear * 3 },
      { from: c.minutesPerYear * 10, to: c.minutesPerYear * 10 + c.minutesPerDay * 40 },
      { from: -c.minutesPerYear * 2000, to: c.minutesPerYear * 3000 },
      { from: c.minutesPerYear * 5 + 100, to: c.minutesPerYear * 5 + c.minutesPerDay * 2 },
    ];
    byCalendar[name] = {
      normalized: dates.map((d) => normalizeDate(d, c)),
      formatted: dates.map((d) => formatDate(EventDate.fromJson(normalizeDate(d, c)), () => 'The Siege', c)),
      problems: dates.flatMap((d) => {
        const date = EventDate.fromJson(d);
        return date === null ? [] : [c.dateProblem(date)];
      }),
      typed: typedOut,
      ticks: windows.map((w) =>
        [1200.0, 320.0].map((width) => {
          const sc = chooseScale(w, width, c);
          return [sc.unit, sc.step, scaleName(sc.unit, sc.step), ticksFor(w, width, c).map((t) => [t.t, t.label])];
        }),
      ),
      parts: [0.0, 12345.0, c.minutesPerYear * 3.5, -c.minutesPerDay * 3].map((t) => {
        const p = partsOf(t, c);
        return [p.year, p.month, p.day, p.minute];
      }),
      ages: (
        [
          [new Span(0, 1439), new Span(c.minutesPerYear * 17, c.minutesPerYear * 17 + 10)],
          [new Span(0, c.minutesPerYear - 1), new Span(c.minutesPerYear * 26, c.minutesPerYear * 27 - 1)],
          [new Span(c.minutesPerYear * 5, c.minutesPerYear * 5 + 100), new Span(0, 10)],
        ] as const
      ).map(([b, a]) => age(ageAt(b, a, c))),
    };
  }
  const bounds = (a: [number, number], b: [number, number] | null, open: 'ongoing' | 'unknown' | null) =>
    new EventBounds(new Span(a[0], a[1]), b === null ? null : new Span(b[0], b[1]), open);
  return {
    presets: calendarPresets.map((p) => [p.name, p.about, yearOf(p.settings), presetIsValid(p), describeCalendar(Calendar.fromJson(p.settings))]),
    calendars: byCalendar,
    labels: [['  mystery   CLUE ', 'Mystery clue', '', 'mine'], 'x', [1, 'Action', 'ACTION', 'a'.repeat(41)]].map(cleanLabels),
    together: (
      [
        [bounds([0, 1439], [0, 1439], null), bounds([0, 1439], [0, 1439], null)],
        [bounds([0, 525599], null, 'ongoing'), bounds([1440, 2879], [1440, 2879], null)],
        [bounds([0, 43199], [0, 43199], null), bounds([1440, 2879], [1440, 2879], null)],
        [bounds([0, 100], [5000, 6000], null), bounds([3000, 4000], [9000, 9999], null)],
        [bounds([0, 100], [0, 100], null), bounds([9000, 9999], [9000, 9999], null)],
      ] as const
    ).map(([a, b]) => [together(a, b), together(b, a)]),
  };
}

