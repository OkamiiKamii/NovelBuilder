// Reference outputs of the original app's timeline: story order, event records, the drawn axis, scales, overlaps,
// tracks, the two orders, ages, life histories, the review and alternate histories. Run on both real files and on a
// generated chronicle, in the standard calendar and in one of its own (written beside the goldens so the Dart tests
// read the very same records).
// GOLDEN_OUT=<dir> npx vitest run golden/timeline.test.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';
import { lifeHistory } from '@/modules/characters/lifeHistory';
import { eventRecords, validateEvent } from '@/modules/model/events';
import { buildModel } from '@/modules/model/model';
import { agesOf, birthDateOf, lifePath } from '@/modules/timeline/ages';
import { domainOf, layoutAxis } from '@/modules/timeline/axis';
import { calendarProblems, cleanCalendar, describeCalendar } from '@/modules/timeline/calendar';
import { formatDate, resolveChronology } from '@/modules/timeline/chronology';
import { compareTimelines, comparisonSummary, historyEvents, originWords, staleChanges } from '@/modules/timeline/histories';
import { orderSummary, tellingNotes, twoOrders } from '@/modules/timeline/narrative';
import { atTheSameTime } from '@/modules/timeline/overlap';
import { reviewTimeline } from '@/modules/timeline/review';
import { chooseScale, readDate, ticksFor } from '@/modules/timeline/scale';
import { normalizeDate } from '@/modules/timeline/service';
import { arrange, decodeGrouping, groupings, tracksFor } from '@/modules/timeline/tracks';

const OUT = process.env.GOLDEN_OUT!;
const FIXTURES: Record<string, string> = {
  'qa-sample': '../qa/qa-sample.novel.json',
  'made-in-the-app': '../src/modules/projects/fixtures/made-in-the-app.novel.json',
};

/** Infinity has no JSON; it is written as a word, and the Dart side reads it back the same way. */
const json = (value: unknown) => JSON.stringify(value, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v > 0 ? 'Infinity' : '-Infinity') : v), 1);

/** A deterministic chronicle: every kind of date, length, age and telling the timeline reads. */
function chronicle() {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const id = (k: string, i: number) => `00000000-0000-4000-8000-${k}${String(i).padStart(11, '0')}`;
  const P = 'chronicle';
  const volume = { id: id('v', 0), projectId: P, parentId: null, kind: 'volume', title: 'Book One', order: 0, mentions: [], createdAt: 0 };
  const chapters = Array.from({ length: 12 }, (_, i) => ({ id: id('c', i), projectId: P, parentId: volume.id, kind: 'chapter', title: i === 4 ? '' : `Chapter ${i + 1}`, order: i, mentions: [], createdAt: i + 1 }));
  const scenes = Array.from({ length: 6 }, (_, i) => ({ id: id('s', i), projectId: P, parentId: chapters[i * 2].id, kind: 'scene', title: `Scene ${i + 1}`, order: 0, mentions: [], createdAt: 50 + i }));
  const fields = (i: number) => (i === 0 ? [{ id: 'f0', key: 'Date of Birth', value: '1000-3-1' }] : i === 1 ? [{ id: 'f1', key: 'Born', value: 'the year of the comet' }] : i === 2 ? [{ id: 'f2', key: 'Birth date', value: '990' }] : i === 3 ? [{ id: 'f3', key: 'born', value: 'Second Age 2' }] : []);
  const people = Array.from({ length: 16 }, (_, i) => ({ id: id('p', i), projectId: P, category: 'character', name: `Person ${String.fromCharCode(65 + i)}`, summary: '', description: '', tags: [], fields: fields(i), createdAt: 100 + i }));
  const places = Array.from({ length: 8 }, (_, i) => ({ id: id('l', i), projectId: P, category: 'location', name: `Place ${i}`, summary: '', description: '', tags: [], fields: [], createdAt: 200 + i }));
  const factions = Array.from({ length: 3 }, (_, i) => ({ id: id('f', i), projectId: P, category: 'faction', name: `Order ${i}`, summary: '', description: '', tags: [], fields: [], createdAt: 300 + i }));
  const ships = Array.from({ length: 2 }, (_, i) => ({ id: id('x', i), projectId: P, category: 'ship', name: `Ship ${i}`, summary: '', description: '', tags: [], fields: [], createdAt: 400 + i }));
  const threads = Array.from({ length: 3 }, (_, i) => ({ id: id('t', i), projectId: P, title: `Thread ${i}`, description: '', color: '#888888', status: 'open', beats: [], createdAt: 500 + i }));
  const units = ['minutes', 'hours', 'days', 'weeks', 'months', 'years'];
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const events: any[] = [];
  const date = (k: number): any => {
    const year = 980 + Math.floor(rnd() * 60);
    switch (k) {
      case 0: return { precision: 'exact', year, month: 1 + Math.floor(rnd() * 12), day: 1 + Math.floor(rnd() * 31), hour: null, minute: null };
      case 1: { const hour = Math.floor(rnd() * 24); return { precision: 'exact', year, month: 1 + Math.floor(rnd() * 12), day: 1 + Math.floor(rnd() * 28), hour, minute: Math.floor(rnd() * 60) }; }
      case 2: return { precision: 'exact', year, month: null, day: null, hour: null, minute: null };
      case 3: return { precision: 'exact', year, month: 1 + Math.floor(rnd() * 13), day: null, hour: null, minute: null };
      case 4: return { precision: 'approximate', year, month: null, season: null };
      case 5: return { precision: 'approximate', year, month: 1 + Math.floor(rnd() * 12), season: null };
      case 6: return { precision: 'approximate', year, month: null, season: pick(seasons) };
      case 7: return events.length ? { precision: 'relative', anchorId: pick(events).id, amount: 1 + Math.floor(rnd() * 20), unit: pick(units), direction: rnd() < 0.5 ? 'before' : 'after' } : { precision: 'unknown' };
      default: return { precision: 'unknown' };
    }
  };
  for (let i = 0; i < 70; i++) {
    const kind = Math.floor(rnd() * 9);
    const when = date(kind);
    const length = rnd();
    const cast = Array.from({ length: Math.floor(rnd() * 4) }, () => pick(people)).filter((p, j, all) => all.indexOf(p) === j);
    const told = Array.from({ length: Math.floor(rnd() * 3) }, () => pick([...chapters, ...scenes])).filter((n, j, all) => all.indexOf(n) === j);
    const event: any = {
      id: id('e', i), projectId: P, name: `Event ${String(i).padStart(2, '0')}${i % 7 === 0 ? ' at night' : ''}`, description: '', when,
      duration: length < 0.2 ? { amount: 1 + Math.floor(rnd() * 10), unit: pick(units) } : null,
      importance: pick(['minor', 'minor', 'major', 'climax']),
      locationId: rnd() < 0.7 ? pick(places).id : null,
      characters: cast.map((p) => ({ id: p.id, age: rnd() < 0.3 ? Math.floor(rnd() * 50) : null })),
      entryIds: rnd() < 0.3 ? [pick([...factions, ...ships]).id] : [],
      nodeIds: told.map((n) => n.id),
      afterId: rnd() < 0.25 && events.length ? pick(events).id : null,
      createdAt: 1000 + (i % 9), updatedAt: 0,
    };
    if (length >= 0.2 && length < 0.32) event.end = rnd() < 0.2 ? { precision: 'unknown' } : date(pick([0, 2, 4, 5, 6]));
    if (length >= 0.32 && length < 0.38) event.ongoing = true;
    if (rnd() < 0.4) event.threadIds = [pick(threads).id];
    if (told.length && rnd() < 0.6) event.reveals = [{ nodeId: told[0].id, role: pick(['flashback', 'flashforward', 'foreshadowed', 'mentioned', 'revealed', 'told']) }];
    if (rnd() < 0.2) event.status = pick(['idea', 'planned', 'confirmed']);
    events.push(event);
  }
  // Hand-made cases: a birth, a loop of relative dates, a deleted anchor, a deleted predecessor, same-day meetings apart.
  events.push({ id: id('e', 90), projectId: P, name: 'A is born', description: '', when: { precision: 'exact', year: 1000, month: 3, day: 1, hour: null, minute: null }, duration: null, importance: 'major', locationId: places[0].id, characters: [{ id: people[0].id, age: 0 }], entryIds: [], nodeIds: [chapters[0].id], afterId: null, createdAt: 2000, updatedAt: 0 });
  events.push({ id: id('e', 91), projectId: P, name: 'Loop one', description: '', when: { precision: 'relative', anchorId: id('e', 92), amount: 2, unit: 'days', direction: 'after' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 2001, updatedAt: 0 });
  events.push({ id: id('e', 92), projectId: P, name: 'Loop two', description: '', when: { precision: 'relative', anchorId: id('e', 91), amount: 2, unit: 'days', direction: 'after' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 2002, updatedAt: 0 });
  events.push({ id: id('e', 93), projectId: P, name: 'Orphan', description: '', when: { precision: 'relative', anchorId: id('e', 999), amount: 3, unit: 'weeks', direction: 'before' }, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: id('e', 998), createdAt: 2003, updatedAt: 0 });
  events.push({ id: id('e', 94), projectId: P, name: 'Council', description: '', when: { precision: 'exact', year: 1020, month: 5, day: 4, hour: null, minute: null }, duration: { amount: 2, unit: 'days' }, importance: 'major', locationId: places[1].id, characters: [{ id: people[5].id, age: null }, { id: people[0].id, age: 20 }], entryIds: [], nodeIds: [chapters[6].id], afterId: null, createdAt: 2004, updatedAt: 0 });
  events.push({ id: id('e', 95), projectId: P, name: 'Ride', description: '', when: { precision: 'exact', year: 1020, month: 5, day: 7, hour: null, minute: null }, duration: null, importance: 'minor', locationId: places[2].id, characters: [{ id: people[5].id, age: null }], entryIds: [], nodeIds: [chapters[5].id], afterId: null, createdAt: 2005, updatedAt: 0 });
  events.push({ id: id('e', 96), projectId: P, name: 'Feast', description: '', when: { precision: 'exact', year: 1020, month: 5, day: 5, hour: null, minute: null }, duration: null, importance: 'minor', locationId: places[3].id, characters: [{ id: people[5].id, age: null }, { id: people[0].id, age: 40 }], entryIds: [], nodeIds: [], afterId: id('e', 94), createdAt: 2006, updatedAt: 0 });
  events.push({ id: id('e', 97), projectId: P, name: 'Before birth', description: '', when: { precision: 'exact', year: 990, month: null, day: null, hour: null, minute: null }, duration: null, importance: 'minor', locationId: places[4].id, characters: [{ id: people[0].id, age: null }], entryIds: [], nodeIds: [], afterId: null, createdAt: 2007, updatedAt: 0 });
  const links = [
    { id: id('k', 0), projectId: P, fromId: places[2].id, toId: places[1].id, fromType: 'entry', toType: 'entry', type: 'located-in', fromLabel: '', toLabel: '', createdAt: 0 },
    { id: id('k', 1), projectId: P, fromId: places[5].id, toId: places[2].id, fromType: 'entry', toType: 'entry', type: 'located-in', fromLabel: '', toLabel: '', createdAt: 1 },
    { id: id('k', 2), projectId: P, fromId: people[0].id, toId: factions[0].id, fromType: 'entry', toType: 'entry', type: 'member-of', fromLabel: '', toLabel: '', createdAt: 2, validity: { from: { kind: 'event', eventId: id('e', 94) }, until: null } },
    { id: id('k', 3), projectId: P, fromId: people[0].id, toId: places[6].id, fromType: 'entry', toType: 'entry', type: 'lives-in', fromLabel: '', toLabel: '', createdAt: 3, validity: { from: { kind: 'node', nodeId: chapters[3].id }, until: null } },
    { id: id('k', 4), projectId: P, fromId: people[0].id, toId: places[7].id, fromType: 'entry', toType: 'entry', type: 'related', fromLabel: 'Born near', toLabel: '', createdAt: 4 },
    { id: id('k', 5), projectId: P, fromId: id('e', 3), toId: ships[0].id, fromType: 'event', toType: 'entry', type: 'related', fromLabel: '', toLabel: '', createdAt: 5 },
    { id: id('k', 6), projectId: P, fromId: people[0].id, toId: factions[1].id, fromType: 'entry', toType: 'entry', type: 'member-of', fromLabel: '', toLabel: '', createdAt: 6, validity: { from: { kind: 'date', when: { precision: 'exact', year: 1015, month: null, day: null, hour: null, minute: null } }, until: { kind: 'event', eventId: id('e', 96) } } },
  ];
  const continuityRules = [
    { id: id('r', 0), projectId: P, kind: 'travel', entryId: places[1].id, toEntryId: places[3].id, amount: 5, unit: 'days', createdAt: 0 },
    { id: id('r', 1), projectId: P, kind: 'travel', entryId: places[3].id, toEntryId: places[2].id, amount: 1, unit: 'weeks', createdAt: 1 },
    { id: id('r', 2), projectId: P, kind: 'travel', entryId: places[0].id, toEntryId: places[4].id, amount: 0, unit: 'days', createdAt: 2 },
  ];
  const relations = [{ id: id('q', 0), projectId: P, fromId: people[0].id, toId: people[5].id, stages: [{ id: 's0', startNodeId: null, preset: 'friends', category: 'social', label: 'Friends', fromRole: 'friend', toRole: 'friend', directional: false, title: '', affinity: 'friendly', event: '', notes: '' }, { id: 's1', startNodeId: chapters[7].id, preset: 'rivals', category: 'social', label: 'Rivals', fromRole: 'rival', toRole: 'rival', directional: false, title: 'The falling out', affinity: 'hostile', event: '', notes: '' }], createdAt: 0, updatedAt: 0 }];
  const plans = [{ id: id('n', 0), projectId: P, nodeId: chapters[2].id, summary: '', goals: '', presentIds: [people[0].id], povIds: [people[0].id], appearanceIds: [], mentionedIds: [], createdAt: 0, updatedAt: 0 }];
  const characterHistory = [{ id: id('h', 0), projectId: P, entryId: people[0].id, kind: 'story', text: 'Takes the oath', nodeId: chapters[8].id, at: 0 }];
  const alternateHistories = [
    { id: id('a', 0), projectId: P, name: 'If the council failed', baseId: null, kind: 'hypothetical', status: 'experimental', originEventId: id('e', 94), causeEventId: null, note: '', changed: { [id('e', 94)]: { when: { precision: 'exact', year: 1021, month: 5, day: 4, hour: null, minute: null } }, [id('e', 3)]: { name: 'Event 03, otherwise' }, [id('e', 999)]: { name: 'Gone' } }, removed: [id('e', 10)], added: [{ id: id('e', 80), projectId: P, name: 'Only here', description: '', when: { precision: 'approximate', year: 1022, month: null, season: 'autumn' }, duration: null, importance: 'major', locationId: places[0].id, characters: [{ id: people[1].id, age: 30 }], entryIds: [], nodeIds: [], afterId: null, createdAt: 3000, updatedAt: 0 }], createdAt: 1, updatedAt: 0 },
    { id: id('a', 1), projectId: P, name: 'Further still', baseId: id('a', 0), kind: 'time-travel', status: 'alternate', originEventId: null, causeEventId: id('e', 80), note: '', changed: { [id('e', 80)]: { importance: 'minor' } }, removed: [id('e', 20)], added: [], createdAt: 2, updatedAt: 0 },
  ];
  return { chapters: [volume, ...chapters, ...scenes], chapterPlans: plans, loreEntries: [...people, ...places, ...factions, ...ships], loreLinks: links, plotThreads: threads, timelineEvents: events, continuityRules, characterRelations: relations, characterHistory, alternateHistories };
}

const CUSTOM = { kind: 'custom', name: 'The Reckoning', months: ['Thaw', 'Bloom', 'Swelter', 'Harvest', 'Fall', 'Frost', 'Deep', 'Dark', 'Wake', 'Mud'].map((name) => ({ name, days: 40 })), hoursPerDay: 20, daysPerWeek: 6, eras: [{ name: 'First Age', startYear: 0 }, { name: 'Second Age', startYear: 1000 }], seasons: { spring: 1, summer: 3, autumn: 6, winter: 8 } };

const report = (c: Record<string, any[]>, project: unknown) => {
  const rows = (k: string) => (c[k] ?? []) as any[];
  const model = buildModel({ project, nodes: rows('chapters'), plans: rows('chapterPlans'), entries: rows('loreEntries'), schemas: rows('loreSchemas'), links: rows('loreLinks'), relations: rows('characterRelations'), events: rows('timelineEvents'), threads: rows('plotThreads'), systems: rows('systems'), sheets: rows('systemSheets'), timeline: null, calendar: rows('storyCalendars')[0] ?? null, progressCategories: rows('progressCategories'), progress: rows('progressChanges'), journeys: rows('journeys') } as any);
  const cal = model.calendar;
  const nameOf = (id: string) => model.events.get(id)?.name;
  const chronology = resolveChronology([...model.events.values()], cal).map((p) => ({ id: p.event.id, value: p.value, year: p.year, anchored: p.anchored, label: p.label, issues: p.issues }));
  const records = eventRecords(model);
  const eventRows = Object.fromEntries(records.map((r) => [r.id, { label: r.label, shape: r.shape, precision: r.precision, span: r.span, bounds: r.bounds, dateProblem: r.dateProblem, told: r.told.map((t) => ({ nodeId: t.ref.id, role: t.role, position: t.position })), problems: validateEvent(model, model.events.get(r.id)!) }]));
  const time = { day: cal.minutesPerDay, year: cal.minutesPerYear };
  const axis = layoutAxis(records, 1200, domainOf(records, time), time);
  const domain = domainOf(records, time);
  const windows = domain ? [1, 0.2, 0.01, 0.0005, 0.00001, 0.0000002].map((share) => ({ from: domain.from, to: domain.from + (domain.to - domain.from) * share })) : [];
  const scales = windows.map((w) => ({ window: w, scale: chooseScale(w, 1200, cal), ticks: ticksFor(w, 1200, cal), narrow: ticksFor(w, 320, cal) }));
  const typed = ['10', 'Year -500', '1020-5', '1020-5-4', '1020-13', '1020-5-45', 'June 1020', 'Thaw 1005', 'Second Age 4', 'Bloom Second Age 4', 'First Age 12', 'year of the comet', ' 1000 / 3 / 1 '];
  const readDates = Object.fromEntries(typed.map((t) => [t, readDate(t, cal)]));
  const sameTime = Object.fromEntries(records.map((r) => [r.id, atTheSameTime(records, r.id, cal.minutesPerDay).map((x) => ({ id: x.record.id, how: x.how }))]));
  const ways = groupings(model);
  const tracks = Object.fromEntries(ways.map((g) => {
    const list = tracksFor(model, records, decodeGrouping(g.value));
    const ids = list.map((t) => t.id);
    const arranged = arrange(list, { order: [...ids].reverse().slice(0, 2), hidden: ids.slice(1, 2), folded: ids.slice(0, 1), focus: null });
    const focused = arrange(list, { order: [], hidden: [], folded: [], focus: ids[ids.length - 1] ?? null });
    return [g.value, { label: g.label, tracks: list, arranged: { shown: arranged.shown.map((t) => [t.id, t.folded]), hidden: arranged.hidden.map((t) => t.id) }, focused: focused.shown.map((t) => t.id) }];
  }));
  const orders = twoOrders(model);
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id).sort();
  const ages = Object.fromEntries(characters.map((id) => {
    const a = agesOf(id, model.events, cal, birthDateOf(model.entries.get(id)));
    return [id, { birth: a.birth, at: Object.fromEntries(a.at), issues: Object.fromEntries(a.issues) }];
  }));
  const placed = resolveChronology([...model.events.values()], cal);
  const lifePaths = Object.fromEntries(characters.map((id) => [id, lifePath(placed, id, cal, birthDateOf(model.entries.get(id))).map((s) => ({ id: s.placed.event.id, label: s.label, age: s.age, stated: s.stated, issue: s.issue }))]));
  const extras = { snapshots: rows('progressSnapshots'), milestones: rows('characterHistory') };
  const lives = Object.fromEntries(characters.map((id) => {
    const life = lifeHistory(model, id, extras)!;
    const item = (i: any) => ({ key: i.key, kind: i.kind, ref: i.ref, to: i.to ?? null, title: i.title, detail: i.detail, when: i.when, age: i.age });
    return [id, { born: life.born, story: life.story.map(item), reading: life.reading.map(item), throughout: life.throughout.map(item), issues: life.issues }];
  }));
  const review = reviewTimeline(model, rows('continuityRules'));
  const histories = new Map(rows('alternateHistories').map((h) => [h.id, h]));
  const historyOut = Object.fromEntries([...histories.values()].map((h) => {
    const events = historyEvents(model.events, histories, h.id);
    const diffs = compareTimelines(model.events, events, cal);
    return [h.id, { events: Object.fromEntries([...events].map(([id, e]) => [id, e])), diffs: diffs.map((d) => ({ id: d.id, difference: d.difference, fields: d.fields, whenA: d.whenA, whenB: d.whenB, direction: d.direction })), summary: comparisonSummary(diffs, 'The main timeline', h.name), origin: originWords(h, historyEvents(model.events, histories, h.baseId), histories, cal), stale: staleChanges(model.events, histories, h) }];
  }));
  const samples = [
    { precision: 'exact', year: 10, month: 2, day: 31, hour: 25, minute: 70 }, { precision: 'exact', year: '12', month: '13', day: 3 }, { precision: 'exact', year: 2.5, month: 2.5, day: 1.5, hour: 0.5 },
    { precision: 'exact', year: -2.5, month: 1, day: 40, hour: 19, minute: null }, { precision: 'approximate', year: 7, month: 0, season: 'winter' }, { precision: 'approximate', year: 7, month: 3, season: 'winter' },
    { precision: 'approximate', year: null }, { precision: 'relative', anchorId: '', amount: -3, unit: 'fortnights', direction: 'sideways' }, { precision: 'relative', anchorId: 'x', amount: '2.5', unit: 'weeks', direction: 'after' }, { precision: 'nonsense' }, null,
  ];
  const normalized = samples.map((s) => normalizeDate(s, cal));
  const formatted = [...samples.map((s) => normalizeDate(s, cal)), { precision: 'exact', year: 1020, month: 5, day: 4, hour: 0, minute: 5 }, { precision: 'exact', year: 1020, month: 5, day: 4, hour: 13, minute: null }, { precision: 'approximate', year: 1001, month: 2, season: null }, { precision: 'relative', anchorId: records[0]?.id ?? null, amount: 1.5, unit: 'years', direction: 'before' }, { precision: 'relative', anchorId: 'gone', amount: 1, unit: 'days', direction: 'after' }].map((d) => formatDate(d as any, nameOf, cal));
  return { calendar: describeCalendar(cal), chronology, events: eventRows, axis, scales, readDates, sameTime, tracks, orders: { events: orders.events, nodes: orders.nodes.map((n) => ({ id: n.id, label: n.label, readingRank: n.readingRank, tellings: n.tellings.map((t) => `${t.eventId}@${t.nodeId}`) })), tellings: orders.tellings, placed: orders.placed, linear: orders.linear }, notes: tellingNotes(orders, model).map((n) => ({ telling: `${n.telling.eventId}@${n.telling.nodeId}`, note: n.note })), summary: orderSummary(orders), ages, lifePaths, lives, review, histories: historyOut, normalized, formatted };
};

test('timeline', () => {
  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    const file = JSON.parse(readFileSync(join(__dirname, path), 'utf8'));
    out[name] = report(file.collections, file.project);
    const own = { ...file.collections, storyCalendars: [{ ...CUSTOM, id: 'cal', projectId: file.project.id, updatedAt: 0 }] };
    out[`${name}+calendar`] = report(own, file.project);
  }
  const c = chronicle();
  const project = { id: 'chronicle', title: 'The Chronicle', createdAt: 0, updatedAt: 0 };
  out.chronicle = report(c, project);
  out['chronicle+calendar'] = report({ ...c, storyCalendars: [{ ...CUSTOM, id: 'cal', projectId: 'chronicle', updatedAt: 0 }] }, project);
  const inputs = [CUSTOM, { ...CUSTOM, kind: 'standard' }, { ...CUSTOM, name: ' ', months: [{ name: 'A', days: 0 }, { name: 'a', days: 1.5 }], hoursPerDay: 0, daysPerWeek: 200, eras: [{ name: '', startYear: 5 }, { name: 'B', startYear: 5 }], seasons: { spring: 0, summer: 3, autumn: 1, winter: 1 } }, { kind: 'standard', name: 'x', months: [], hoursPerDay: 0, daysPerWeek: 0, eras: [], seasons: {} }];
  out.calendars = inputs.map((i) => { const problems = calendarProblems(i as any); let cleaned = null; try { cleaned = cleanCalendar(i as any); } catch { cleaned = null; } return { problems, cleaned }; });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'timeline.golden.json'), json(out));
  writeFileSync(join(OUT, 'chronicle.novel.json'), JSON.stringify({ format: 'novel-builder/project', version: 4, exportedAt: 0, project, collections: c }, null, 1));
});
