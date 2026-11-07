import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, projects } from '@/core';
import { abilityTree, pathProblems } from '@/modules/abilities/paths';
import { appearanceMatrix } from '@/modules/characters/appearances';
import { lifeHistory } from '@/modules/characters/lifeHistory';
import { settingsOf } from '@/modules/dashboard/layout';
import { appearanceSummary, threadSummary, upcomingEvents, wordRows } from '@/modules/dashboard/widgets';
import { factionAt } from '@/modules/factions/ties';
import { knowledgeGraph, type GraphEdge } from '@/modules/graph/knowledge';
import { eventRecords } from '@/modules/model/events';
import { loadModel } from '@/modules/model/model';
import type { StoryModel } from '@/modules/model/types';
import { parentsOf, placeTree } from '@/modules/places/explore';
import type { PlaceSettings } from '@/modules/places/types';
import { threadLanes } from '@/modules/plot/lanes';
import { progressAt } from '@/modules/progression/track';
import { relationNetwork } from '@/modules/relationships/network';
import { stageAt } from '@/modules/relationships/timeline';
import { collectWarnings } from '@/modules/review/collect';
import { lengthBars } from '@/modules/structure/pacing';
import { withHistory } from '@/modules/timeline/histories';
import type { AlternateHistory } from '@/modules/timeline/histories';
import { nodeLabel, twoOrders } from '@/modules/timeline/narrative';
import { plotRows, relationshipRows, timelineRows } from '@/modules/visualize/summaries';
import { SAMPLE } from './sample-novel';

/**
 * THE VIEWS AGREE ON THE SAME RECORDS
 * The QA sample novel, imported from its file as a developer would import it,
 * read by every view's own computation. Each test takes one kind of record and
 * checks that the views showing it (the timeline, story vs reading order, the
 * relationship map, the plot board, places, the knowledge graph, character
 * history, appearances, ability paths, progression, factions, structure and
 * the dashboard's widgets) name the same records, by the same ids, and say
 * the same about them.
 */

let model: StoryModel;
let pid: string;
let placeSettings: PlaceSettings | undefined;
let histories: Map<string, AlternateHistory>;
const byName = (name: string) => {
  const found = [...model.entries.values()].find((e) => e.name === name) ?? [...model.events.values()].find((e) => e.name === name) ?? [...model.nodes.values()].find((n) => n.title === name) ?? [...model.threads.values()].find((t) => t.title === name);
  if (!found) throw new Error(`No record named ${name}`);
  return found.id;
};
const chapter = (n: number) => model.order.chapters[n - 1].id;
/** The chapter a chapter or scene is, or is in. */
const chapterOfNode = (nodeId: string) => (model.nodes.get(nodeId)?.kind === 'scene' ? model.nodes.get(nodeId)!.parentId! : nodeId);
const edges = (type: string) => knowledgeGraph(model).edges.filter((e) => e.type === type);
const pair = (e: Pick<GraphEdge, 'from' | 'to'>) => `${e.from.split(':')[1]}>${e.to.split(':')[1]}`;
const sorted = <T>(list: T[]) => [...list].sort();

beforeAll(async () => {
  const project = await projects.importSnapshot(JSON.parse(readFileSync(join(__dirname, 'qa-sample.novel.json'), 'utf8')));
  pid = project.id;
  model = (await loadModel(db, pid))!;
  placeSettings = (await db.placeSettings.where('projectId').equals(pid).toArray())[0];
  histories = new Map((await db.alternateHistories.where('projectId').equals(pid).toArray()).map((h) => [h.id, h]));
});

describe('the QA sample novel, read by every view', () => {
  it('holds what it says it holds', () => {
    expect([model.entries.size, model.nodes.size, model.order.chapters.length, model.events.size, model.relations.size, model.threads.size, model.abilities.size, histories.size]).toEqual([13, 10, 6, 7, 4, 1, 4, 1]);
    // A consistent novel: no check finds a confirmed error in its records.
    const warnings = collectWarnings(pid, { model, facts: [], rules: [], markers: [], aliases: new Map(), secrets: [], travel: { settings: null, maps: [], pins: [] }, snapshots: [], manuscript: null });
    expect(warnings.filter((w) => w.certainty === 'error').map((w) => w.title)).toEqual([]);
  });

  it('every view of events names the same events, told in the same chapters', () => {
    const ids = sorted([...model.events.keys()]);
    const graph = knowledgeGraph(model);
    expect(sorted(timelineRows(model).map((r) => r.id))).toEqual(ids);
    expect(sorted(twoOrders(model).events.map((e) => e.id))).toEqual(ids);
    expect(sorted(graph.nodes.filter((n) => n.type === 'event').map((n) => n.ref!.id))).toEqual(ids);
    // Where each is told: the shared event records, story vs reading order, and the graph's "told in" connections.
    const told = sorted(eventRecords(model).flatMap((e) => e.told.map((t) => `${e.id}>${t.ref.id}`)));
    expect(sorted(twoOrders(model).tellings.map((t) => `${t.eventId}>${t.nodeId}`))).toEqual(told);
    expect(sorted(edges('told-in').map(pair))).toEqual(told);
    // Who takes part and where: the graph's participants and places, against the records.
    expect(sorted(edges('participant').map(pair))).toEqual(sorted([...model.events.values()].flatMap((e) => e.characters.map((c) => `${c.id}>${e.id}`))));
    expect(sorted(edges('occurs-at').map(pair))).toEqual(sorted([...model.events.values()].map((e) => `${e.id}>${e.locationId}`)));
  });

  it('the flashback is first in story time and last in reading order, in every view that shows either', () => {
    const fire = byName(SAMPLE.events.fire);
    const orders = twoOrders(model);
    const event = orders.events.find((e) => e.id === fire)!;
    // Story order: the timeline, story vs reading order, and each character's history all start with it.
    expect(timelineRows(model)[0].id).toBe(fire);
    expect(event.storyRank).toBe(0);
    expect(lifeHistory(model, byName(SAMPLE.characters.ilse))!.story[0]).toMatchObject({ ref: { type: 'event', id: fire }, age: { kind: 'stated', age: 6 } });
    expect(lifeHistory(model, byName(SAMPLE.characters.corin))!.story[0]).toMatchObject({ ref: { type: 'event', id: fire }, age: { kind: 'stated', age: 31 } });
    // Reading order: foreshadowed in Ch 2, told as a flashback in Ch 6, the last part of the book; both go back in time.
    expect(event.tellings.map((t) => [chapterOfNode(t.nodeId), t.role, t.back])).toEqual([[chapter(2), 'foreshadowed', true], [chapter(6), 'flashback', true]]);
    expect(Math.max(...orders.tellings.map((t) => t.readingRank))).toBe(event.tellings[1].readingRank);
    expect(orders.linear).toBe(false);
    // The dashboard's upcoming events, by reading order, meet it in Ch 6 (not written yet) as a flashback.
    const upcoming = upcomingEvents(model, settingsOf('upcoming', {}));
    expect(upcoming.rows.map((r) => r.id)).toEqual([byName(SAMPLE.events.returns), fire, byName(SAMPLE.events.read)]);
    expect(upcoming.rows[1].places).toEqual([{ nodeId: chapter(6), label: `Ch 6: ${SAMPLE.chapters[5]}`, role: 'flashback', written: false }]);
    // By story order, the story has reached the flight inland (the latest event a written chapter tells as it happens).
    const ahead = upcomingEvents(model, settingsOf('upcoming', { from: 'story' }));
    expect([ahead.reached?.id, ahead.rows.map((r) => r.id)]).toEqual([byName(SAMPLE.events.flight), [byName(SAMPLE.events.returns), byName(SAMPLE.events.read)]]);
  });

  it('the parallel events share one moment, and keep their own places and people', () => {
    const [heist, vote] = [byName(SAMPLE.events.heist), byName(SAMPLE.events.vote)];
    const records = new Map(eventRecords(model).map((e) => [e.id, e]));
    const rows = new Map(timelineRows(model).map((r) => [r.id, r]));
    const ranks = new Map(twoOrders(model).events.map((e) => [e.id, e.storyRank]));
    expect(records.get(heist)!.span).toEqual(records.get(vote)!.span);
    expect(rows.get(heist)!.when).toBe(rows.get(vote)!.when);
    expect(ranks.get(heist)).toBe(ranks.get(vote));
    // Told in the two scenes of Ch 3, one after the other in reading order, and named alike in the lists and in story vs reading order.
    expect([rows.get(heist)!.told, rows.get(vote)!.told]).toEqual([[nodeLabel(model, byName(SAMPLE.scenes[0]))], [nodeLabel(model, byName(SAMPLE.scenes[1]))]]);
    expect(rows.get(heist)!.told).toEqual([`Ch 3, scene: ${SAMPLE.scenes[0]}`]);
    expect([records.get(heist)!.told[0].ref.id, records.get(vote)!.told[0].ref.id]).toEqual([byName(SAMPLE.scenes[0]), byName(SAMPLE.scenes[1])]);
    // Each at its own place, both inside Port Calder; no one is in two places at once.
    const places = new Map(placeTree(model, { settings: placeSettings }).map((r) => [r.entry.id, r]));
    expect([places.get(byName(SAMPLE.places.archive))!.events, places.get(byName(SAMPLE.places.hall))!.events]).toEqual([1, 1]);
    expect(places.get(byName(SAMPLE.places.calder))!.eventsWithin).toBe(2);
    const people = (id: string) => model.events.get(id)!.characters.map((c) => c.id);
    expect(people(heist).filter((c) => people(vote).includes(c))).toEqual([]);
  });

  it('the place hierarchy is the same in the Places view, the graph and the places’ own records', () => {
    const rows = placeTree(model, { settings: placeSettings });
    const tree = sorted(rows.filter((r) => r.parentId).map((r) => `${r.entry.id}>${r.parentId}`));
    expect(sorted(edges('link:located-in').map(pair))).toEqual(tree);
    expect(sorted([...parentsOf(model).parent].map(([child, parent]) => `${child}>${parent}`))).toEqual(tree);
    const p = SAMPLE.places;
    expect(rows.map((r) => [r.entry.name, r.depth, r.levelWords])).toEqual([
      [p.hills, 0, 'Region'],
      [p.house, 1, 'Building'],
      [p.coast, 0, 'Region'],
      [p.calder, 1, 'City'],
      [p.hall, 2, 'Building'],
      [p.archive, 2, 'Building'],
    ]);
    // Events at each place: the Places view's count, the graph's "takes place at", the timeline's records.
    for (const row of rows) expect([row.entry.name, row.events]).toEqual([row.entry.name, edges('occurs-at').filter((e) => e.to === `entry:${row.entry.id}`).length]);
  });

  it('relationships agree: the map, the graph, the list and each character’s history, at each point in the book', () => {
    const network = relationNetwork(model);
    expect(sorted(network.edges.map((e) => e.id))).toEqual(sorted([...model.relations.keys()]));
    expect(sorted(network.edges.map((e) => `${e.from}>${e.to}`))).toEqual(sorted(edges('relationship').map(pair)));
    const [ilse, tamsin, corin] = [byName(SAMPLE.characters.ilse), byName(SAMPLE.characters.tamsin), byName(SAMPLE.characters.corin)];
    const rivals = [...model.relations.values()].find((r) => r.fromId === ilse && r.toId === tamsin)!;
    // In Ch 3 they are rivals; from Ch 4, friends: on the map at each chapter, in the stage the timeline reads, and in the list.
    const at = (n: number) => relationNetwork(model, { when: { kind: 'at', nodeId: chapter(n) } }).edges.find((e) => e.id === rivals.id)!.label;
    expect([at(3), at(4), network.edges.find((e) => e.id === rivals.id)!.label]).toEqual(['Rivals', 'Friends', 'Friends']);
    expect([stageAt(rivals, chapter(3), model.order)!.title, stageAt(rivals, chapter(4), model.order)!.title]).toEqual(['Two thieves, one lock', 'Friends on the salt road']);
    expect(relationshipRows(model).find((r) => r.id === rivals.id)).toMatchObject({ now: 'Friends on the salt road', stages: 2 });
    // Ilse's history meets each change where the map does.
    const changes = lifeHistory(model, ilse)!.reading.filter((h) => h.kind === 'relationship' && h.ref?.id === rivals.id).map((h) => h.when);
    expect(changes).toEqual(['Before the story', `Ch 4: ${SAMPLE.chapters[3]}`]);
    const mentor = [...model.relations.values()].find((r) => r.fromId === corin && r.toId === ilse)!;
    expect(mentor.stages.map((s) => (s.startNodeId ? model.order.chapterNumber.get(s.startNodeId) : null))).toEqual([null, 5, 6]);
    expect(lifeHistory(model, corin)!.reading.filter((h) => h.kind === 'relationship' && h.ref?.id === mentor.id).map((h) => h.title)).toEqual([`Relationship with ${SAMPLE.characters.ilse}: Teacher and pupil`, `Relationship changes with ${SAMPLE.characters.ilse}: Old wounds`, `Relationship changes with ${SAMPLE.characters.ilse}: Reconciled`]);
  });

  it('the ability tree agrees with the blueprint, the sheets, the progression and the histories', () => {
    const tree = abilityTree(model);
    const system = [...model.systems.values()][0];
    const key = (name: string) => `ability:${system.id}/${system.items.find((i) => i.name === name)!.id}`;
    const a = SAMPLE.abilities;
    expect(sorted(tree.nodes.map((n) => n.key))).toEqual(sorted(system.items.map((i) => `ability:${system.id}/${i.id}`)));
    expect(sorted(knowledgeGraph(model).nodes.filter((n) => n.type === 'ability').map((n) => n.key))).toEqual(sorted(tree.nodes.map((n) => n.key)));
    // Its paths: the blueprint's branches, and the two recorded connections, each as what it is.
    expect(sorted(tree.edges.map((e) => `${e.from} ${e.role} ${e.to}`))).toEqual(sorted([`${key(a.read)} branch ${key(a.step)}`, `${key(a.step)} branch ${key(a.mirror)}`, `${key(a.read)} branch ${key(a.shatter)}`, `${key(a.step)} evolution ${key(a.mirror)}`, `${key(a.shatter)} exclusive ${key(a.mirror)}`]));
    expect(pathProblems(tree, model)).toEqual([]);
    // Who holds each: the tree, the sheets, and each character's history.
    const holders = Object.fromEntries(tree.nodes.map((n) => [n.name, n.holders.map((h) => h.name).sort()]));
    expect(holders).toEqual({ [a.read]: [SAMPLE.characters.corin, SAMPLE.characters.ilse], [a.step]: [SAMPLE.characters.ilse], [a.mirror]: [SAMPLE.characters.ilse], [a.shatter]: [SAMPLE.characters.corin] });
    const ilse = byName(SAMPLE.characters.ilse);
    expect(sorted(lifeHistory(model, ilse)!.throughout.filter((h) => h.kind === 'ability').map((h) => h.title))).toEqual([`Holds ${a.step}`, `Holds ${a.mirror}`, `Holds ${a.read}`].sort());
    // When: in Ch 3 she holds Read the Glass and Glass Step; Mirror Walk comes in Ch 6. Progression, the tree and her history say so alike.
    const held = (at: Parameters<typeof progressAt>[2]) => progressAt(model, ilse, at).categories.flatMap((c) => c.lines.map((l) => l.value)).sort();
    expect(held({ kind: 'node', nodeId: chapter(3) })).toEqual([a.step, a.read]);
    expect(held('end')).toEqual([a.step, a.mirror, a.read]);
    expect(tree.nodes.find((n) => n.name === a.mirror)!.acquired.map((x) => [x.name, x.when])).toEqual([[SAMPLE.characters.ilse, `Ch 6: ${SAMPLE.chapters[5]}`]]);
    expect(lifeHistory(model, ilse)!.reading.filter((h) => h.kind === 'progress').map((h) => `${h.title} | ${h.when}`)).toEqual([`Gained ${a.read} | Before the story`, `Gained ${a.step} | Ch 2: ${SAMPLE.chapters[1]}`, `Gained ${a.mirror} | Ch 6: ${SAMPLE.chapters[5]}`]);
    // Every gain is drawn in the graph, from the character to the ability.
    expect(edges('progress').filter((e) => e.to.startsWith('ability:')).length).toBe(5);
  });

  it('the plot thread is in the same chapters on the plot board, in the graph, in the list and on the dashboard', () => {
    const thread = byName(SAMPLE.thread);
    const lanes = threadLanes(model);
    const lane = lanes.lanes.find((l) => l.thread.id === thread)!;
    const onBoard = lane.cells.map((c, i) => (c.places.length ? i + 1 : null)).filter(Boolean);
    expect(onBoard).toEqual([1, 3, 4, 6]);
    expect(lane.gaps.map((g) => [g.from + 1, g.to + 1])).toEqual([[2, 2], [5, 5]]);
    const beats = sorted(model.threads.get(thread)!.beats.map((b) => chapterOfNode(b.nodeId!)));
    expect(sorted(edges('beat').map((e) => chapterOfNode(e.to.split(':')[1])))).toEqual(beats);
    expect(sorted(onBoard.map((n) => chapter(n as number)))).toEqual(beats);
    expect(plotRows(model).find((r) => r.id === thread)!.chapters).toEqual([`Ch 1: ${SAMPLE.chapters[0]}`, `Ch 3, scene: ${SAMPLE.scenes[0]}`, `Ch 4: ${SAMPLE.chapters[3]}`, `Ch 6: ${SAMPLE.chapters[5]}`]);
    // Its events: the events that name it, the graph's "in thread", and the events on its lane.
    const events = sorted([...model.events.values()].filter((e) => e.threadIds?.includes(thread)).map((e) => e.id));
    expect(sorted(edges('in-thread').filter((e) => e.to === `thread:${thread}`).map((e) => e.from.split(':')[1]))).toEqual(events);
    expect(sorted(lane.cells.flatMap((c) => c.places.flatMap((p) => p.eventIds)))).toEqual(events);
    // The dashboard's plot threads widget: its status and its latest development, in Ch 6.
    expect(threadSummary(model, settingsOf('threads', {})).rows[0]).toMatchObject({ id: thread, statusLabel: 'Active', developments: 4, latest: { nodeId: chapter(6) } });
  });

  it('chapters, words and appearances agree across the manuscript views and the dashboard', () => {
    // One reading order everywhere.
    const order = model.order.chapters.map((c) => c.id);
    expect(lengthBars(model, { grain: 'chapters', partId: null }).map((b) => b.nodeId)).toEqual(order);
    expect(threadLanes(model).chapters.map((c) => c.id)).toEqual(order);
    expect(appearanceMatrix(model, { grain: 'chapters', all: true }).columns.map((c) => c.nodeId)).toEqual(order);
    // Words: the editor's counts (a chapter with its scenes), the structure chart and the dashboard.
    const words = order.map((id) => model.nodes.get(id)!.wordCount + [...model.nodes.values()].filter((n) => n.parentId === id).reduce((s, n) => s + n.wordCount, 0));
    expect(lengthBars(model, { grain: 'chapters', partId: null }).map((b) => b.words)).toEqual(words);
    expect(wordRows(model, settingsOf('words', {})).rows.map((r) => r.words)).toEqual(words);
    expect(words.map((w) => w > 0)).toEqual([true, true, true, true, false, false]);
    // Appearances: the matrix, each character's history and the dashboard's widget find the same chapters, on the page and only mentioned.
    const matrix = appearanceMatrix(model, { grain: 'chapters', all: true });
    expect(matrix.rows.map((r) => `${r.name}: ${r.cells.map((c) => ({ appears: 'A', mentioned: 'M', other: 'o', none: '.' })[c.state]).join('')}`)).toEqual(['Corin Ashe: MA.MAA', 'Ilse Varn: AAAAAA', 'Odo Hale: ..A...', 'Tamsin Roe: ..AAA.', 'Wren Varn: A.....']);
    for (const row of matrix.rows) {
      const at = (state: string) => row.cells.map((c, i) => (c.state === state ? order[i] : null)).filter(Boolean);
      const lines = lifeHistory(model, row.characterId)!.reading.filter((h) => h.kind === 'appearance');
      const said = (verb: string) => [...new Set(lines.filter((h) => h.title.startsWith(verb)).map((h) => chapterOfNode(h.ref!.id)))];
      expect([row.name, said('Appears in'), said('Mentioned in')]).toEqual([row.name, at('appears'), at('mentioned')]);
      const widget = appearanceSummary(model, settingsOf('appearances', { characterId: row.characterId }));
      expect([row.name, widget.mode === 'one' && [widget.appears, widget.mentioned]]).toEqual([row.name, [at('appears').length, at('mentioned').length]]);
    }
  });

  it('the faction’s members are the same in the Factions view, the graph and the histories, at each point', () => {
    const guild = byName(SAMPLE.faction);
    const members = (at: Parameters<typeof factionAt>[2]) => (factionAt(model, guild, at).byRole.get('member') ?? []).map((t) => t.otherName).sort();
    expect(members({ kind: 'node', nodeId: chapter(1) })).toEqual([SAMPLE.characters.corin]);
    expect(members({ kind: 'node', nodeId: chapter(2) })).toEqual([SAMPLE.characters.corin, SAMPLE.characters.ilse]);
    expect(sorted(edges('link:member-of').map((e) => e.from.split(':')[1]))).toEqual(sorted([byName(SAMPLE.characters.corin), byName(SAMPLE.characters.ilse)]));
    expect(lifeHistory(model, byName(SAMPLE.characters.ilse))!.reading.find((h) => h.kind === 'affiliation')).toMatchObject({ title: `Member of ${SAMPLE.faction}`, when: `Ch 2: ${SAMPLE.chapters[1]}` });
  });

  it('the alternate history changes the events it is opened on, and nothing in the main timeline', () => {
    const [history] = [...histories.values()];
    expect(history.name).toBe(SAMPLE.history);
    const vote = byName(SAMPLE.events.vote);
    // It holds only what differs: the vote's name and description, and one event of its own.
    expect(Object.keys(history.changed)).toEqual([vote]);
    expect(Object.keys(history.changed[vote]).sort()).toEqual(['description', 'name']);
    expect(history.added.map((e) => e.name)).toEqual([SAMPLE.removed]);
    const alt = withHistory(model, histories, history.id);
    const main = timelineRows(model).map((r) => r.title);
    expect(timelineRows(alt).map((r) => r.title)).toEqual([...main.slice(0, 2), 'The council vote fails', main[3], SAMPLE.removed, ...main.slice(4)]);
    // The main timeline is as it was, and so is every record the history does not change.
    expect(main).toEqual(Object.values(SAMPLE.events).map((name) => name).filter((n) => n !== SAMPLE.events.heist && n !== SAMPLE.events.vote).flatMap((n) => (n === SAMPLE.events.flight ? [SAMPLE.events.vote, SAMPLE.events.heist, n] : [n])));
    expect(alt.entries).toBe(model.entries);
    expect(alt.relations).toBe(model.relations);
    // Read on it, the views that read events follow: the added event is at Council Hall, in Hale's history, and told in no chapter.
    const hall = byName(SAMPLE.places.hall);
    expect(placeTree(alt, { settings: placeSettings }).find((r) => r.entry.id === hall)!.events).toBe(2);
    expect(placeTree(model, { settings: placeSettings }).find((r) => r.entry.id === hall)!.events).toBe(1);
    const hale = byName(SAMPLE.characters.hale);
    expect(lifeHistory(alt, hale)!.story.map((h) => h.title)).toEqual(['The council vote fails', SAMPLE.removed]);
    expect(lifeHistory(model, hale)!.story.map((h) => h.title)).toEqual([SAMPLE.events.vote]);
    expect(twoOrders(alt).events.find((e) => e.title === SAMPLE.removed)!.tellings).toEqual([]);
  });
});
