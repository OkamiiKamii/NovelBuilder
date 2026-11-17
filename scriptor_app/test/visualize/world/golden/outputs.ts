// Scriptor's outputs for Visualize's world views and the knowledge graph, keyed and shaped as golden/dump.dart makes
// the Flutter app's (see there for what each part is).

import { ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import { type Ownership, ownedItems, ownershipOf } from '../../../../src/domain/factions/ownership';
import { type Tie, factionAt, factionNetwork, factionTies, factionsOf } from '../../../../src/domain/factions/ties';
import {
  type KnowledgeGraph,
  collapseGraph,
  edgeTypeLabel,
  edgeWords,
  groupOf,
  knowledgeGraph,
  limitGraph,
  nodeTypeColor,
  nodeTypeLabel,
  pairsOf,
  pathBetween,
  queryGraph,
  refOf,
  shapeOf,
  typeCodes,
  typeCounts,
} from '../../../../src/domain/graph/knowledge';
import type { JsonMap } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { Anchor } from '../../../../src/domain/model/validity';
import { PlaceChanges } from '../../../../src/domain/places/placeChanges';
import { MapPin, WorldMap } from '../../../../src/domain/places/places';
import { Journey } from '../../../../src/domain/records/journey';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { type RouteItem, type TravelPoint, journeyRecord, routeOf, travelProblems, withoutJourneyReference } from '../../../../src/domain/travel/routes';
import { TravelMethod, TravelSettings } from '../../../../src/domain/travel/travel';

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** As dump.dart's `rounded`: numbers not whole to nine significant places, NaN as a word. */
export function rounded(v: unknown): unknown {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    return Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(9)) : v;
  }
  if (Array.isArray(v)) return v.map(rounded);
  if (v instanceof Map) return rounded(Object.fromEntries(v));
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, rounded(x)]));
  }
  return v;
}

const point = (p: TravelPoint | null) => p?.toJson() ?? null;

const tieJson = (t: Tie) => ({
  link: t.link.id,
  role: t.role,
  other: `${t.other.type}:${t.other.id}`,
  otherName: t.otherName,
  words: t.words,
  when: t.when,
  timeless: t.timeless,
  holds: t.holds,
});

const graphJson = (g: KnowledgeGraph) => ({
  nodes: g.nodes.map((n) => ({ key: n.key, type: n.type, label: n.label, aka: n.aka, color: n.color, degree: n.degree, members: n.members })),
  edges: g.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    kind: e.kind,
    type: e.type,
    label: e.label,
    reverse: e.reverseLabel,
    directed: e.directed,
  })),
  dangling: g.dangling,
  excluded: (g.excluded ?? []).map((x) => ({ category: x.category, count: x.count })),
  undrawn: (g.undrawn ?? []).map((x) => ({ category: x.category, field: x.field, count: x.count })),
});

export function reads(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const settingsRow = s.rows('travelSettings')[0];
  const settings = settingsRow === undefined ? null : new TravelSettings(settingsRow);
  const maps = s.rows('worldMaps').map((r) => new WorldMap(r));
  const pins = s.rows('mapPins').map((r) => new MapPin(r));
  const journeys = s.rows('journeys').map((r) => new Journey(r));
  const chapterAt = model.order.chapters.length === 0 ? null : Anchor.node(model.order.chapters[0].id);
  const eventIds = [...model.events.keys()].sort(byText);
  const eventAt = eventIds.length === 0 ? null : Anchor.event(eventIds[0]);

  const out: Record<string, unknown> = {};
  out['journeys'] = journeys.map((j) => {
    const r = journeyRecord(model, j, settings, maps, pins);
    return {
      id: j.id,
      travellers: r.travellers,
      from: r.from,
      to: r.to,
      leaves: point(r.leaves),
      arrives: point(r.arrives),
      leavesWords: r.leavesWords,
      arrivesWords: r.arrivesWords,
      method: r.method?.toJson() ?? null,
      methodWords: r.methodWords,
      distance: r.distance === null ? null : { value: r.distance.value, unit: r.distance.unit, from: r.distance.from },
      leastMinutes: r.leastMinutes,
      words: r.words,
    };
  });
  const travellers = [...new Set(journeys.flatMap((j) => j.travellerIds))].sort(byText);
  const items = (list: readonly RouteItem[]) =>
    list.map((i) => ({
      key: i.key,
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      when: i.when,
      placeIds: i.placeIds,
      order: Number.isFinite(i.order) ? i.order : 'infinite',
      journeyId: i.journeyId,
    }));
  const who = new Set([...travellers, ...[...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id)]);
  out['routes'] = Object.fromEntries(
    [...who].map((t) => {
      const r = routeOf(model, t, journeys, settings, maps, pins);
      return [t, { story: items(r.story), reading: items(r.reading), unknown: items(r.unknown) }];
    }),
  );
  out['problems'] = travelProblems(model, journeys, settings, maps, pins).map((p) => p.toJson());
  out['without'] = journeys.flatMap((j) =>
    [...j.travellerIds, ...(j.fromId !== null ? [j.fromId] : []), ...j.eventIds].map((id) => withoutJourneyReference(j, id)),
  );

  const factions = factionsOf(model);
  out['factions'] = factions.map((f) => f.id);
  out['ties'] = Object.fromEntries(
    factions.map((f) => [
      f.id,
      {
        end: factionTies(model, f.id).map(tieJson),
        chapter: factionTies(model, f.id, chapterAt).map(tieJson),
        event: factionTies(model, f.id, eventAt).map(tieJson),
      },
    ]),
  );
  out['at'] = Object.fromEntries(
    factions.map((f) => {
      const a = factionAt(model, f.id, chapterAt);
      return [f.id, { byRole: Object.fromEntries([...a.byRole].map(([k, v]) => [k, v.map((t) => t.link.id)])), notNow: a.notNow }];
    }),
  );
  const network = (n: ReturnType<typeof factionNetwork>) => ({
    factions: n.factions.map((f) => f.id),
    edges: n.edges.map((t) => t.link.id),
    territories: n.territories.map((t) => t.id),
    left: n.left,
  });
  out['network'] = {
    all: network(factionNetwork(model, null)),
    chapter: network(factionNetwork(model, chapterAt)),
    two: network(factionNetwork(model, null, { most: 2 })),
    ...Object.fromEntries(factions.map((f) => [`around:${f.id}`, network(factionNetwork(model, null, { around: f.id }))])),
  };

  const owned = (o: Ownership | null) =>
    o === null
      ? null
      : {
          item: o.item.id,
          makers: o.makers.map((m) => ({ name: m.name, when: m.when })),
          holdings: o.holdings.map((h) => ({
            link: h.link.id,
            holder: h.holderId,
            name: h.holderName,
            how: h.how,
            began: h.began,
            ended: h.ended,
            endHow: h.endHow,
            timeless: h.timeless,
            here: h.inThisTimeline,
          })),
          unknown: o.unknown,
          now: { state: o.now.state, holders: o.now.holders, words: o.now.words },
        };
  const items2 = ownedItems(model);
  out['items'] = items2.map((i) => i.id);
  out['ownership'] = Object.fromEntries(
    items2.map((i) => [
      i.id,
      { end: owned(ownershipOf(model, i.id)), chapter: owned(ownershipOf(model, i.id, chapterAt)), event: owned(ownershipOf(model, i.id, eventAt)) },
    ]),
  );

  const graph = knowledgeGraph(model);
  out['graph'] = graphJson(graph);
  const counts = typeCounts(graph);
  out['counts'] = { nodes: counts.nodes, edges: counts.edges, statuses: counts.statuses };
  out['codes'] = typeCodes(
    graph.nodes.map((n) => n.type),
    (t) => nodeTypeLabel(t, model),
  );
  out['typeLabels'] = Object.fromEntries(counts.nodes.map(([t]) => [t, [nodeTypeLabel(t, model), nodeTypeColor(t, model)]]));
  out['edgeLabels'] = Object.fromEntries(counts.edges.map(([t]) => [t, edgeTypeLabel(t)]));
  const first = graph.nodes.length === 0 ? null : graph.nodes[0].key;
  const busiest =
    graph.nodes.length === 0 ? null : [...graph.nodes].sort((a, b) => (b.degree !== a.degree ? b.degree - a.degree : byText(a.key, b.key)))[0].key;
  const word = graph.nodes.length === 0 ? '' : graph.nodes[Math.trunc(graph.nodes.length / 2)].label.split(' ')[0];
  out['queries'] = {
    none: graphJson(queryGraph(graph, {})),
    isolated: graphJson(queryGraph(graph, { isolated: true })),
    text: graphJson(queryGraph(graph, { text: ` ${word} ` })),
    hidden: graphJson(
      queryGraph(graph, {
        hiddenNodes: new Set(counts.nodes.slice(0, 1).map(([t]) => t)),
        hiddenEdges: new Set(counts.edges.slice(0, 1).map(([t]) => t)),
        hiddenStatuses: new Set(['confirmed']),
      }),
    ),
    focus1: busiest === null ? null : graphJson(queryGraph(graph, { focus: { key: busiest, depth: 1 } })),
    focus2: busiest === null ? null : graphJson(queryGraph(graph, { focus: { key: busiest, depth: 2 } })),
  };
  const paths: Record<string, unknown> = {};
  if (first !== null) for (const n of graph.nodes.slice(0, 12)) paths[n.key] = pathBetween(graph.edges, first, n.key)?.map((e) => e.id) ?? null;
  if (busiest !== null) {
    for (const n of [...graph.nodes].reverse().slice(0, 12)) paths[`b:${n.key}`] = pathBetween(graph.edges, busiest, n.key, 3)?.map((e) => e.id) ?? null;
  }
  out['paths'] = paths;
  const folder = (key: string): string | null => {
    const ref = refOf(key);
    if (ref === null || ref.type !== 'node') return null;
    const node = model.nodes.get(ref.id);
    return node?.kindKey === 'scene' && node.parentId !== null && model.nodes.get(node.parentId)?.kindKey === 'chapter' ? `node:${node.parentId}` : null;
  };
  const folded = collapseGraph(graph, {
    types: new Set(counts.nodes.slice(0, 2).map(([t]) => t)),
    fold: folder,
    groupLabel: (type, count) => `${count} ${nodeTypeLabel(type, model).toLowerCase()}`,
  });
  out['collapsed'] = { graph: graphJson(folded.graph), into: folded.into, inside: folded.inside };
  const limited = limitGraph(graph, 5, new Set(first === null ? [] : [first]));
  out['limited'] = { graph: graphJson(limited.graph), total: limited.total, cut: limited.cut };
  out['pairs'] = pairsOf(graph.edges).map((p) => ({ key: p.key, a: p.a, b: p.b, group: p.group, edges: p.edges.map((e) => e.id) }));
  out['words'] = graph.edges.slice(0, 40).map((e) => edgeWords(e, (k) => graph.nodes.find((n) => n.key === k)?.label ?? k));
  out['groups'] = Object.fromEntries(graph.edges.map((e) => [e.id, groupOf(e.kind)]));
  out['shapes'] = Object.fromEntries(counts.nodes.map(([t]) => [t, shapeOf(t)]));

  out['script'] = script(s, model);
  return out;
}

function script(s: NovelSnapshot, model: StoryModel): unknown[] {
  let n = 0;
  const c = new PlaceChanges(s, { now: 1000, createId: () => `made-${++n}` });
  const locs = [...model.entries.values()].filter((e) => e.category === 'location').map((e) => e.id).sort(byText);
  const chars = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id).sort(byText);
  const chapters = model.order.chapters.map((ch) => ch.id);
  const events = [...model.events.keys()].sort(byText);
  const loc = (i: number) => (locs.length > i ? locs[i] : `no-place-${i}`);
  const who = (i: number) => (chars.length > i ? chars[i] : `no-one-${i}`);
  const out: unknown[] = [];
  const made = new Map<string, string>();
  const step = (op: string, run: () => unknown) => {
    let outcome: string;
    try {
      const r = run();
      outcome = `ok${typeof r === 'string' ? `:${r}` : ''}`;
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      outcome = `refused:${e.message}`;
    }
    out.push({
      op,
      outcome,
      records: Object.fromEntries(
        ['placeSettings', 'worldMaps', 'mapPins', 'travelSettings', 'journeys', 'loreEntries', 'loreLinks'].map((k) => [k, c.snapshot.rows(k)]),
      ),
    });
  };
  const setMade = (k: string, v: string) => {
    made.set(k, v);
    return v;
  };

  step('levels', () =>
    c.setLevels([
      { id: null, name: 'World' },
      { id: null, name: ' city ' },
      { id: null, name: 'CITY' },
      { id: null, name: '' },
    ]).id,
  );
  step('preset', () => `${c.applyPreset('world').levels.length}`);
  step('preset-bad', () => c.applyPreset('nope'));
  step('level', () => c.setLevel(loc(0), c.settings()!.levels[0].id));
  step('level-bad', () => c.setLevel(loc(0), 'nope'));
  step('level-person', () => c.setLevel(who(0), null));
  step('levels-drop', () => c.setLevels([{ id: null, name: 'Only' }]));
  step('parent', () => c.setParent(loc(1), loc(0)));
  step('parent-loop', () => c.setParent(loc(0), loc(1)));
  step('parent-self', () => c.setParent(loc(0), loc(0)));
  step('parent-none', () => c.setParent(loc(1), null));
  step('map', () => setMade('map', c.saveMap(null, { name: 'Atlas', width: 200, height: 100, unit: 'leagues', grid: 0 }).id));
  step('map-unnamed', () => c.saveMap(null, { name: '  ' }));
  step('map-change', () => c.saveMap(made.get('map') ?? null, { placeId: { value: loc(0) }, grid: -3, width: -5 }).id);
  step('pin', () => c.pin(made.get('map') ?? 'x', loc(0), 10, 20).id);
  step('pin2', () => c.pin(made.get('map') ?? 'x', loc(1), 40, 60).id);
  step('pin-move', () => c.pin(made.get('map') ?? 'x', loc(0), 15.5, 25).id);
  step('pin-nan', () => c.pin(made.get('map') ?? 'x', loc(0), Number.NaN, 1));
  step('unpin', () => c.unpin(made.get('map') ?? 'x', loc(1)));
  step('image', () => c.setImage(made.get('map') ?? 'x', 'data:image/png;base64,AAAA'));
  step('image-bad', () => c.setImage(made.get('map') ?? 'x', 'http://example.com/x.png'));
  step('image-none', () => c.setImage(made.get('map') ?? 'x', null));
  step('methods', () =>
    `${
      c.setMethods([
        new TravelMethod({ id: '', name: 'On foot', speed: 30, distanceUnit: 'leagues' }),
        new TravelMethod({ id: '', name: 'on foot' }),
        new TravelMethod({ id: '', name: 'Ship', speed: -2, per: 'hours' }),
      ]).methods.length
    }`,
  );
  const method = c.travelSettings()?.methods[0]?.id ?? null;
  step('journey', () =>
    setMade(
      'j1',
      c.saveJourney(null, {
        travellerIds: [who(0), who(0)],
        fromId: loc(0),
        toId: loc(1),
        via: [loc(2), ''],
        departure: chapters.length === 0 ? null : { kind: 'node', nodeId: chapters[0] },
        arrival: events.length === 0 ? { kind: 'date', when: { precision: 'unknown' } } : { kind: 'event', eventId: events[0] },
        method: ' by cart ',
        methodId: method,
        duration: { amount: 3, unit: 'days' },
        distance: 90,
        distanceUnit: 'leagues',
        eventIds: events.slice(0, 1),
        note: ' a note ',
      }).id,
    ),
  );
  step('journey-nobody', () => c.saveJourney(null, { travellerIds: [] }));
  step('journey-place', () => c.saveJourney(null, { travellerIds: [loc(0)] }));
  step('journey-duration', () => c.saveJourney(null, { travellerIds: [who(0)], duration: { amount: -1, unit: 'days' } }));
  step('journey-distance', () => c.saveJourney(null, { travellerIds: [who(0)], distance: 'far' }));
  step('journey-method', () => c.saveJourney(null, { travellerIds: [who(0)], methodId: 'nope' }));
  step('journey-when', () => c.saveJourney(null, { travellerIds: [who(0)], departure: { kind: 'node', nodeId: 'nope' } }));
  step('journey2', () => setMade('j2', c.saveJourney(null, { travellerIds: [who(1)], afterId: made.get('j1') ?? null }).id));
  step('journey-cycle', () => c.saveJourney(made.get('j1') ?? null, { afterId: made.get('j2') ?? null }));
  step('journey-change', () => c.saveJourney(made.get('j1') ?? null, { toId: null, note: 'changed' }).id);
  step('methods-drop', () => c.setMethods([]));
  step('remove-journey', () => c.removeJourney(made.get('j1') ?? 'x'));
  step('remove-journey-gone', () => c.removeJourney('nope'));
  step('remove-map', () => c.removeMap(made.get('map') ?? 'x'));
  return out;
}

export type Reads = JsonMap;
