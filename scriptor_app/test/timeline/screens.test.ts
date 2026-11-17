// The logic of the timeline's screens, as the Flutter app's feature tests check it: ports of
// flutter_app/test/features/timeline/{timeline_screens,chapter_seed,what_if,calendar_presets_screen}_test.dart. What
// those check of the widgets themselves (taps, scrolling, 200% text, tap-target and contrast guidelines) belongs to the
// screens and is not here; each press is run as the change it makes, through the timeline service on a real library.
// The drawn timeline, story order beside reading order, a character's whole history and the timeline review are
// Visualize's and Review's screens (later phases); their domain is in original.test.ts and agreement.test.ts.

import { openLibrary } from '../../src/data/library';
import { CastData } from '../../src/domain/characters/castData';
import { CharacterService } from '../../src/domain/characters/characterService';
import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap, mapOrNull } from '../../src/domain/json';
import { maps } from '../../src/domain/records/jsonRecord';
import { TimelineEvent } from '../../src/domain/records/event';
import { resolveChronology } from '../../src/domain/timeline/chronology';
import { calendarSettingsOf as calendarSettingsOfRow } from '../../src/domain/timeline/dates';
import type { EventChanges } from '../../src/domain/timeline/eventChanges';
import { TimelineService } from '../../src/domain/timeline/timelineService';
import { calendarView, draftChanges, savedMessage } from '../../src/domain/timeline/screens/calendarPage';
import { chronicleRows } from '../../src/domain/timeline/screens/chronicle';
import { commitNumber, dateEditor, setPrecision } from '../../src/domain/timeline/screens/dateEditor';
import { characterChanges, deleteEventDialog, endChanged, endHint, eventPage } from '../../src/domain/timeline/screens/eventPage';
import { comparison, comparePair, selectedHistory, whatIfFor, whatIfName, whatIfStarters } from '../../src/domain/timeline/screens/historiesPage';
import { TimelineData } from '../../src/domain/timeline/screens/timelineData';
import { chapterSeed, newEvent, noFilters, seededMessage, timelineView } from '../../src/domain/timeline/screens/timelinePage';
import { testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

/** A novel in a real library, with Mira in its cast, and the timeline service. */
function setUpNovel() {
  let now = Date.UTC(2026, 10, 17, 9);
  const lib = openLibrary(memoryLibrary(), () => now, testIds());
  const { novel } = lib.library.create({ title: 'Ashfall' });
  const characters = new CharacterService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const mira = characters.change(novel.id, (x) => x.create({ name: 'Mira' })).id;
  const timeline = new TimelineService(lib.novels, lib.backups, { clock: () => (now += 1000), createId: testIds() });
  const data = () => new TimelineData(new CastData(novel.id, lib.novels.load(novel.id)!));
  const eventsOf = () => lib.novels.rowsIn(novel.id, 'timelineEvents').map((r) => new TimelineEvent(r));
  const timelineIn = <T>(f: (x: EventChanges) => T): T => timeline.change(novel.id, f);
  return { lib, novel: novel.id, mira, timeline, data, eventsOf, timelineIn, characters };
}

/** Saving a date field from the event page: the editor's edit, applied to the date as stored. */
function saveDate(w: ReturnType<typeof setUpNovel>, id: string, edit: (stored: JsonMap) => JsonMap) {
  w.timelineIn((x) => x.updateEvent(id, (stored) => ({ when: edit(mapOrNull(stored.raw['when']) ?? {}) })));
}

/** A number typed in one of the date editor's fields and committed. */
function typeIn(w: ReturnType<typeof setUpNovel>, id: string, label: string, text: string): string | null {
  const data = w.data();
  const page = eventPage(data, id)!;
  const editor = dateEditor({ when: mapOrNull(data.model.events.get(id)!.raw['when']), calendar: data.calendar, others: page.others });
  const field = editor.fields.find((f) => f.kind === 'number' && f.label === label);
  if (field === undefined || field.kind !== 'number') throw new Error(`no field ${label}`);
  if (!field.enabled) return 'disabled';
  const result = commitNumber(text, field);
  if ('problem' in result) return result.problem;
  if ('save' in result) saveDate(w, id, field.commit(result.save));
  return null;
}

test('a new event is dated, given an end, someone taking part, and deleted with Undo', () => {
  const w = setUpNovel();
  expect(timelineView(w.data(), noFilters).empty.title).toBe('What happened, and when');
  const id = w.timelineIn(newEvent(null));
  expect(w.eventsOf().map((e) => e.id)).toEqual([id]);

  saveDate(w, id, setPrecision('exact', []));
  expect(typeIn(w, id, 'Year', '1020')).toBeNull();
  expect(w.eventsOf()[0].when).toMatchObject({ precision: 'exact', year: 1020 });
  expect(typeIn(w, id, 'Day', '4')).toBe('disabled'); // no month yet: day disabled
  expect(mapOrNull(w.eventsOf()[0].raw['when'])!['day']).toBeNull();

  w.timelineIn((x) => x.updateEvent(id, endChanged('ongoing')));
  expect(w.eventsOf()[0].ongoing).toBe(true);
  expect(endHint(eventPage(w.data(), id)!.endMode)).toContain('the timeline draws it to the edge');

  expect(eventPage(w.data(), id)!.addCharacter.map((c) => c.label)).toEqual(['Mira']);
  w.timelineIn((x) => x.updateEvent(id, characterChanges.add(w.mira)));
  expect(w.eventsOf()[0].characters.map((c) => c.id)).toEqual([w.mira]);
  w.timelineIn((x) => x.updateEvent(id, characterChanges.age(w.mira, 17)));
  expect(w.eventsOf()[0].characters[0].age).toBe(17);

  const dialog = deleteEventDialog(w.eventsOf()[0], false);
  expect(dialog.title).toBe('Delete New event?');
  const kept = w.timeline.deleteEvent(w.novel, id, { name: dialog.name });
  expect(w.eventsOf()).toEqual([]);
  w.timeline.undo(kept);
  expect(w.eventsOf()[0].characters[0].age).toBe(17);
});

test('the timeline lists events in story order, by year, with a life path and its ages', () => {
  const w = setUpNovel();
  w.timelineIn((x) => {
    const born = x.createEvent('Mira is born');
    x.updateEvent(born, () => ({
      when: { precision: 'exact', year: 1000, month: 3, day: 1 },
      characters: [{ id: w.mira, age: 0 }],
    }));
    const siege = x.createEvent('The siege');
    x.updateEvent(siege, () => ({
      when: { precision: 'approximate', year: 1026 },
      characters: [{ id: w.mira, age: null }],
      importance: 'climax',
    }));
    x.createEvent('A rumour');
  });
  const view = timelineView(w.data(), noFilters);
  expect(view.groups.map((g) => g.heading)).toEqual(['Year 1000', 'Year 1026', 'Not yet placed in time']);
  expect(view.groups.flatMap((g) => g.items.map((p) => p.event.name))).toEqual(['Mira is born', 'The siege', 'A rumour']);
  // The chronicle: the years between are said on the line, and events hang to either side of it on a wide screen.
  const rows = chronicleRows(view.groups, true);
  expect(rows.some((r) => r.kind === 'gap' && r.text === '26 years later')).toBe(true);
  const sides = rows.flatMap((r) => (r.kind === 'event' ? [[r.placed.event.name, r.left]] : []));
  expect(sides.slice(0, 2)).toEqual([
    ['Mira is born', true],
    ['The siege', false],
  ]);

  const life = timelineView(w.data(), { ...noFilters, character: w.mira });
  expect(life.lifeBox!.summary).toBe('Age 0: Mira is born → Age 25–26: The siege');
  expect(life.visible.map((p) => p.event.name)).not.toContain('A rumour');
});

test('an event page refuses a day its month does not have, and keeps the date as it was', () => {
  const w = setUpNovel();
  const id = w.timelineIn((x) => {
    const id = x.createEvent('The council');
    x.updateEvent(id, () => ({ when: { precision: 'exact', year: 10, month: 2 } }));
    x.saveCalendar({
      kind: 'custom',
      name: 'The Reckoning',
      months: [
        { name: 'Thaw', days: 30 },
        { name: 'Bloom', days: 20 },
      ],
      hoursPerDay: 20,
      daysPerWeek: 6,
      eras: [],
      seasons: { spring: 1, summer: 1, autumn: 2, winter: 2 },
    });
    return id;
  });
  expect(typeIn(w, id, 'Day', '25')).toBe('Bloom has 20 days: day 25 was not saved.');
  expect(mapOrNull(w.eventsOf()[0].raw['when'])!['day']).toBeNull();
  expect(typeIn(w, id, 'Day', '20')).toBeNull();
  expect(mapOrNull(w.eventsOf()[0].raw['when'])!['day']).toBe(20);
});

test('the calendar is a draft until saved, says what is wrong, and lists events it does not have', () => {
  const w = setUpNovel();
  w.timelineIn((x) => {
    const id = x.createEvent('The thaw feast');
    x.updateEvent(id, () => ({ when: { precision: 'exact', year: 10, month: 12, day: 1 } }));
  });
  expect(calendarView(w.data(), null).summary).toBe('Standard calendar. Dates read like “Year 10, January 1”.');
  let draft: JsonMap | null = null;
  const set = (change: (current: JsonMap) => JsonMap) => {
    const current = draft ?? savedOf(w);
    draft = { ...current, ...change(current) };
  };
  set(draftChanges.kind(true));
  set(draftChanges.name('The Reckoning'));
  set(draftChanges.month(0, { days: null }));
  let view = calendarView(w.data(), draft);
  expect(view.problems).toContain('January needs a whole number of days, from 1 to 1000.');
  expect(view.canSave).toBe(false);
  set(draftChanges.month(0, { days: 40 }));
  for (let i = 0; i < 11; i++) {
    view = calendarView(w.data(), draft);
    expect(view.months[1].remove).toBe(
      `Remove ${['February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]}`,
    );
    set(draftChanges.removeMonth(1));
  }
  view = calendarView(w.data(), draft);
  expect(view.away.count).toContain('1 event has a date this calendar does not have.');
  expect(view.away.shown.map((m) => m.text)).toEqual(['The thaw feast: Month 12 is not in The Reckoning, which has 1 month.']);
  expect(w.lib.novels.rowsIn(w.novel, 'storyCalendars')).toEqual([]); // a draft until saved
  expect(view.canSave).toBe(true);
  w.timelineIn((x) => x.saveCalendar(draft!));
  const rows = w.lib.novels.rowsIn(w.novel, 'storyCalendars');
  expect([rows[0]['kind'], rows[0]['name'], maps(rows[0]['months']).length]).toEqual(['custom', 'The Reckoning', 1]);
  expect(savedMessage(draft!)).toContain('now read in the “The Reckoning” calendar');
  expect(mapOrNull(w.eventsOf()[0].raw['when'])!['month']).toBe(12); // never rewritten
});

/** The calendar settings as saved now, which a draft starts from. */
function savedOf(w: ReturnType<typeof setUpNovel>): JsonMap {
  const rows = w.lib.novels.rowsIn(w.novel, 'storyCalendars');
  return calendarSettingsOfRow(rows.length === 0 ? null : rows[0]);
}

test('an alternate history is started, an event goes differently there, and the two are compared', () => {
  const w = setUpNovel();
  const siege = w.timelineIn((x) => {
    const id = x.createEvent('The siege');
    x.updateEvent(id, () => ({ when: { precision: 'exact', year: 10 } }));
    return id;
  });
  expect(w.data().historyList).toEqual([]);
  const h = w.timelineIn((x) => x.createHistory({ name: 'If the Keep fell' }));
  let data = w.data();
  let pair = comparePair(data, { a: null, b: null }, data.histories.get(h)!);
  expect(comparison(data, pair.a, pair.b, false).summary).toBe('The main timeline and “If the Keep fell” have the same events.');

  w.timelineIn((x) => x.changeHistoryEvent(h, siege, { name: 'The fall of the Keep' }));
  data = w.data();
  pair = comparePair(data, { a: null, b: null }, data.histories.get(h)!);
  const compared = comparison(data, pair.a, pair.b, false);
  expect(compared.summary).toBe('1 event differs: 1 changed.');
  expect(compared.lines.map((l) => l.what)).toEqual(['Changed: name']);
  expect(selectedHistory(data, data.histories.get(h)!).events[0].changed).toBe('Changed here: name');
  expect(w.eventsOf()[0].name).toBe('The siege'); // the main timeline is never touched
  expect(w.eventsOf()[0].id).toBe(siege);
});

test('an empty timeline offers the chapters as told; one press makes them its events, in that order', () => {
  const w = setUpNovel();
  const chapter = (id: string, title: string, order: number, summary = ''): JsonMap => ({
    id,
    projectId: w.novel,
    parentId: null,
    kind: 'chapter',
    title,
    summary,
    order,
    status: 'drafting',
    wordCount: 0,
    createdAt: order,
    updatedAt: 0,
  });
  // The novel's own first chapter goes, so these three are the book.
  for (const r of w.lib.novels.rowsIn(w.novel, 'chapters')) {
    w.timelineIn((x) => x.remove('chapters', r['id'] as string));
  }
  w.timelineIn((x) => {
    x.put('chapters', chapter('c2', 'The Crossing', 1));
    x.put('chapters', chapter('c1', 'The Call', 0, 'Mira hears the bell.'));
    x.put('chapters', chapter('c3', '', 2));
  });
  const data = w.data();
  expect(timelineView(data, noFilters).instead).toBe('seed');
  const seed = chapterSeed(data.model.order.chapters);
  expect(seed.rows.map((r) => r.title)).toEqual(['The Call', 'The Crossing', 'Untitled chapter']);
  expect(seed.seed).toBe('Make 3 events from the chapters');

  const made = w.timelineIn((x) => x.eventsFromChapters(data.model.order.chapters.map((c) => c.id)));
  const events = w.eventsOf();
  const byName = new Map(events.map((e) => [e.name, e]));
  expect(new Set(byName.keys())).toEqual(new Set(['The Call', 'The Crossing', 'Chapter 3']));
  expect(byName.get('The Call')!.description).toBe('Mira hears the bell.');
  expect(byName.get('The Crossing')!.nodeIds).toEqual(['c2']);
  expect(byName.get('The Crossing')!.afterId).toBe(byName.get('The Call')!.id);
  expect(byName.get('The Call')!.when?.precision ?? 'unknown').toBe('unknown'); // no date is made up
  expect(resolveChronology(events).map((p) => p.event.name)).toEqual(['The Call', 'The Crossing', 'Chapter 3']);
  expect(seededMessage(made.length)).toContain('3 events made from your chapters');
  expect(() => w.timelineIn((x) => x.eventsFromChapters(['c1']))).toThrow(ChangeRefused); // only for an empty timeline
});

test('starters come out of the story, then a few for any story', () => {
  const s = whatIfStarters({ events: [{ id: 'e1', name: 'The Fall of Emberhold' }], people: ['Mira'] });
  expect(s[0]).toEqual({ question: 'What if The Fall of Emberhold never happened?', eventId: 'e1' });
  expect(s[1].question).toBe('What if Mira chose otherwise?');
  expect(s.length).toBeLessThanOrEqual(6);
  expect(whatIfName('  What if the Keep had held  ')).toBe('What if the Keep had held?');
});

test('with no histories, a question branches the story in one press, departing at its event', () => {
  const w = setUpNovel();
  const fall = w.timelineIn((x) => x.createEvent('The Fall of Emberhold'));
  const starters = whatIfFor(w.data());
  expect(starters.map((s) => s.question)).toContain('What if Mira chose otherwise?'); // from the cast
  const chosen = starters.find((s) => s.question === 'What if The Fall of Emberhold never happened?')!;
  const made = w.timelineIn((x) => x.createHistory({ name: whatIfName(chosen.question), originEventId: chosen.eventId }));
  const rows = w.lib.novels.rowsIn(w.novel, 'alternateHistories');
  expect(rows.length).toBe(1);
  expect(rows[0]['name']).toBe('What if The Fall of Emberhold never happened?');
  expect(rows[0]['originEventId']).toBe(fall);
  expect(rows[0]['id']).toBe(made);
});

test('a calendar of the novel’s own begins from a ready-made one, in one press, then saved', () => {
  const w = setUpNovel();
  expect(calendarView(w.data(), null).custom).toBe(false); // the presets are only for a calendar of its own
  let draft: JsonMap = { ...savedOf(w), ...draftChanges.kind(true)() };
  const view = calendarView(w.data(), draft);
  expect(view.presets.map((p) => p.year)).toContain('364 days in 13 months');
  draft = { ...draft, ...draftChanges.preset(0)() };
  expect(calendarView(w.data(), draft).months.map((m) => m.name)).toContain('Frostmoon'); // every month filled in
  w.timelineIn((x) => x.saveCalendar(draft));
  const rows = w.lib.novels.rowsIn(w.novel, 'storyCalendars');
  expect([rows[0]['kind'], rows[0]['name'], maps(rows[0]['months']).length]).toEqual(['custom', 'The Moon Reckoning', 13]);
});
