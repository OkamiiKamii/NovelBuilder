// Scriptor's outputs for what dump.dart dumps of the Flutter app's story views: structure and pacing, the markers and
// their changes, the plot lanes in words, appearance records and the ability paths, keyed and shaped the same way, made
// by the ported code (src/domain/visualize/story/*, src/domain/abilities/paths.ts).

import { type AbilityTree, type PathEdge, type PathProblem, abilityTree, heldBy, pathProblems, pathsOf, standings, treeLayout } from '../../../../src/domain/abilities/paths';
import { localeCompare } from '../../../../src/domain/collation';
import { ChangeRefused } from '../../../../src/domain/codex/codexChanges';
import type { JsonMap } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { readingOrder } from '../../../../src/domain/model/storyOrder';
import { threadLanes } from '../../../../src/domain/plot/lanes';
import { usedLabels } from '../../../../src/domain/plot/labels';
import { PlotChanges } from '../../../../src/domain/plot/plotChanges';
import { snapshotsOf } from '../../../../src/domain/systems/systemsService';
import { stableSorted } from '../../../../src/domain/reader/stableSort';
import { isDocument, isGroup } from '../../../../src/domain/records/storyNode';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { nodeLabel } from '../../../../src/domain/timeline/narrative';
import { dartToLowerCase } from '../../../../src/domain/text/dartString';
import {
  type Grain,
  type LengthBar,
  MarkerChanges,
  barOf,
  labelDistribution,
  lengthBars,
  lengthFacts,
  markersOf,
  partBands,
  placeMarkers,
} from '../../../../src/domain/visualize/story/pacing';
import {
  abilityListItem,
  abilityView,
  barWords,
  edgeShape,
  factLine,
  laneCellWords,
  laneLines,
  laneSequence,
  markerWords,
  niceMax,
  ownAppearance,
  pathWords,
  recordAppearance,
  shortName,
  standingLine,
} from '../../../../src/domain/visualize/story/screens';

const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ------------------------------------------------------------------------------------------------------- structure

const barOut = (b: LengthBar): JsonMap => ({ ...b });

function structureOut(model: StoryModel, s: NovelSnapshot, grain: Grain, partId: string | null): JsonMap {
  const bars = lengthBars(model, { grain, partId });
  const facts = lengthFacts(bars);
  const dist = labelDistribution(bars, model, grain);
  const placed = placeMarkers(markersOf(s.rows('structureMarkers')), model);
  const onBars = new Map<number, string[]>();
  for (const p of placed) {
    const i = barOf(p, bars, model);
    if (i >= 0) {
      if (!onBars.has(i)) onBars.set(i, []);
      onBars.get(i)!.push(p.marker.kind);
    }
  }
  const labels = usedLabels(model);
  return {
    bars: bars.map(barOut),
    bands: partBands(bars, model).map((b) => ({ ...b })),
    facts: {
      count: facts.count,
      total: facts.total,
      average: facts.average,
      median: facts.median,
      longest: facts.longest?.nodeId ?? null,
      shortest: facts.shortest?.nodeId ?? null,
      empty: facts.empty,
      labelled: facts.labelled,
    },
    dist: {
      labels: dist.labels,
      cells: dist.cells.map((c) => ({ nodeId: c.nodeId, words: Object.fromEntries(c.words), unlabelled: c.unlabelled })),
      totals: dist.totals.map((t) => ({ ...t })),
      unlabelled: dist.unlabelled,
    },
    onBars: Object.fromEntries([...onBars].map(([k, v]) => [`${k}`, v])),
    short: bars.map((_, i) => shortName(bars, i)),
    words: bars.map((b, i) => barWords(model, b, onBars.get(i))),
    max: niceMax(facts.longest?.words ?? 0),
    fact: factLine(bars, facts, grain, null, bars.length),
    picked: Object.fromEntries(
      labels.map((l) => [
        l,
        factLine(bars, facts, grain, l, bars.filter((b) => b.labels.some((x) => dartToLowerCase(x) === dartToLowerCase(l))).length),
      ]),
    ),
  };
}

function markersOut(model: StoryModel, s: NovelSnapshot): JsonMap {
  const placed = placeMarkers(markersOf(s.rows('structureMarkers')), model);
  return {
    placed: placed.map((p) => {
      const w = markerWords(model, p, (id) => nodeLabel(model, id));
      return { id: p.marker.id, nodeId: p.nodeId, via: p.via, missing: p.missing, title: w.title, subtitle: w.subtitle, remove: w.remove };
    }),
  };
}

function markerScript(s: NovelSnapshot, model: StoryModel): JsonMap[] {
  let ids = 0;
  let snapshot = s;
  const out: JsonMap[] = [];
  const chapters = model.order.chapters;
  const firstEvent = stableSorted(model.events.values(), (a, b) => localeCompare(a.id, b.id))[0];
  const steps: [string, (m: MarkerChanges) => string | null][] = [
    ['add', (m) => m.save(null, { kind: '  Turning   point ', title: ' The bridge falls ', nodeId: chapters[0]?.id ?? null })],
    ['empty', (m) => m.save(null, { kind: '   ' })],
    ['bad node', (m) => m.save(null, { kind: 'Climax', nodeId: 'nowhere' })],
    ['bad event', (m) => m.save(null, { kind: 'Climax', eventId: 'nowhere' })],
    ['event', (m) => m.save(null, { kind: 'Midpoint', eventId: firstEvent?.id ?? null, note: 'Halfway' })],
    ['long', (m) => m.save(null, { kind: 'x'.repeat(50), title: 'y'.repeat(130) })],
    ['change', (m) => m.save(m.list()[0].id, { kind: 'Climax', nodeId: chapters.length === 0 ? null : chapters[chapters.length - 1].id })],
    ['gone', (m) => m.save('nowhere', { kind: 'Climax' })],
    [
      'remove',
      (m) => {
        const list = m.list();
        m.removeMarker(list[list.length - 1].id);
        return null;
      },
    ],
  ];
  for (const [name, step] of steps) {
    const m = new MarkerChanges(snapshot, { now: 5000 + out.length, createId: () => `m${ids++}` });
    try {
      const r = step(m);
      snapshot = m.snapshot;
      out.push({
        step: name,
        result: r,
        markers: m.list().map((x) => ({ id: x.id, kind: x.kind, title: x.title, nodeId: x.nodeId, eventId: x.eventId, note: x.note, createdAt: x.createdAt })),
      });
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      out.push({ step: name, refused: e.message });
    }
  }
  return out;
}

// ----------------------------------------------------------------------------------------------------------- lanes

function lanesOut(model: StoryModel): JsonMap {
  const ids = stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title)).map((t) => t.id);
  const lanes = threadLanes(model, ids);
  return {
    chapters: lanes.chapters.map((c) => `${c.id}|${c.number}|${c.title}`),
    lanes: lanes.lanes.map((lane) => {
      const seq = laneSequence(model, lane);
      return {
        thread: lane.thread.id,
        cells: lanes.chapters.map((_, col) => laneCellWords(model, lanes, lane, col)),
        roles: lane.cells.map((c) => c.role),
        lines: laneLines(lane),
        unplaced: seq.unplaced,
        untold: seq.untold,
      };
    }),
  };
}

// ----------------------------------------------------------------------------------------------------- appearances

function appearanceScript(s: NovelSnapshot, model: StoryModel): JsonMap[] {
  const who = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.id, b.id),
  )[0];
  if (who === undefined) return [];
  const nodes = readingOrder(model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .slice(0, 3);
  let snapshot = s;
  let ids = 0;
  const out: JsonMap[] = [];
  for (const node of nodes) {
    for (const as of ['appears', 'mentioned', null, 'appears'] as const) {
      const x = new PlotChanges(snapshot, { now: 7000, createId: () => `p${ids++}` });
      recordAppearance(node.id, who.id, as)(x);
      snapshot = x.snapshot;
      const after = StoryModel.fromSnapshot(snapshot);
      const plan = after.plans.get(node.id);
      out.push({
        node: node.id,
        as,
        appear: plan?.appearIds ?? null,
        mention: plan?.mentionIds ?? null,
        own: ownAppearance(after, node.id, who.id),
      });
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------- ability paths

function viewOut(tree: AbilityTree, problems: PathProblem[], choices: { hiddenSources?: string[]; hiddenRoles?: string[]; focus?: string | null; all?: boolean; text?: string }): JsonMap {
  const v = abilityView(tree, problems, {
    hiddenSources: new Set(choices.hiddenSources ?? []),
    hiddenRoles: new Set(choices.hiddenRoles ?? []),
    focus: choices.focus ?? null,
    all: choices.all ?? false,
    text: choices.text ?? '',
  });
  return {
    nodes: v.nodes.map((n) => n.key),
    edges: v.edges.map((e) => e.id),
    focus: v.focus,
    sources: Object.fromEntries(v.sources),
    lone: v.lone,
    flagged: Object.fromEntries(v.flagged),
    roles: v.roles,
    left: v.left,
  };
}

function abilitiesOut(model: StoryModel, s: NovelSnapshot): JsonMap {
  const snaps = snapshotsOf(s);
  const tree = abilityTree(model, snaps);
  const problems = pathProblems(tree, model);
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const name = (key: string) => byKey.get(key)?.name ?? 'something deleted';
  const keys = tree.nodes.map((n) => n.key);
  const layout = treeLayout(keys, tree.edges);
  const pad = 24;
  const h = 96;
  const at = (key: string) => {
    const p = layout.at.get(key)!;
    return { x: p.x + 160 / 2 + pad, y: p.y + h / 2 + pad };
  };
  const documents = readingOrder(model.nodes.values()).filter((n) => isDocument(n.kind));
  const characters = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.id, b.id),
  );
  const first = tree.nodes[0];
  const edgeOut = (e: PathEdge) => ({ id: e.id, from: e.from, to: e.to, role: e.role, label: e.label, directed: e.directed, linkId: e.linkId });
  return {
    nodes: tree.nodes.map((n) => ({
      key: n.key,
      name: n.name,
      source: n.source,
      sourceKey: n.sourceKey,
      color: n.color,
      rank: n.rank,
      requires: n.requires,
      limits: n.limits,
      holders: n.holders.map((x) => `${x.id}|${x.name}|${x.how}`),
      acquired: n.acquired.map((a) => `${a.entryId}|${a.name}|${a.action}|${a.when}|${a.changeId}|${a.snapshotId}`),
    })),
    edges: tree.edges.map(edgeOut),
    notDrawn: tree.notDrawn.map((x) => `${x.connection.id}|${x.connection.label}|${x.reason}`),
    problems: problems.map((p) => ({ key: p.key, kind: p.kind, severity: p.severity, message: p.message, nodes: p.nodes })),
    layout: {
      at: Object.fromEntries([...layout.at].map(([k, v]) => [k, [v.x, v.y, v.layer]])),
      back: [...layout.back].sort(byCodeUnits),
      width: layout.width,
      height: layout.height,
    },
    paths: Object.fromEntries(keys.map((k) => [k, [...pathsOf(tree, k)].sort(byCodeUnits)])),
    shapes: Object.fromEntries(tree.edges.map((e) => [e.id, edgeShape(e, layout, at, h)])),
    words: Object.fromEntries(tree.edges.map((e) => [e.id, [pathWords(e, true, name), pathWords(e, false, name)]])),
    list: tree.nodes.map((n) => abilityListItem(n, tree.edges, name, undefined, false, undefined).lines),
    views: [
      viewOut(tree, problems, {}),
      viewOut(tree, problems, { all: true }),
      ...(first !== undefined ? [viewOut(tree, problems, { hiddenSources: [first.sourceKey] })] : []),
      viewOut(tree, problems, { hiddenRoles: ['prerequisite', 'exclusive'] }),
      ...(first !== undefined ? [viewOut(tree, problems, { focus: first.key })] : []),
      viewOut(tree, problems, { focus: 'nowhere' }),
      viewOut(tree, problems, { text: ' A ' }),
      viewOut(tree, problems, { text: 'zzz' }),
    ],
    characters: Object.fromEntries(
      characters.map((c) => [
        c.id,
        [null, ...documents.map((d) => d.id)].map((atNode) => {
          const held = heldBy(model, snaps, c.id, atNode);
          const st = standings(tree, held);
          const when = atNode === null ? 'at the end of the story' : `as of ${model.nodes.get(atNode)!.displayTitle}`;
          return {
            at: atNode,
            held: [...held].sort(byCodeUnits),
            standings: Object.fromEntries(st),
            lines: Object.fromEntries([...st].map(([key, value]) => [key, standingLine(tree, key, value, c.name, when, held, name)])),
          };
        }),
      ]),
    ),
  };
}

// ------------------------------------------------------------------------------------------------------------ main

export function novel(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const parts = stableSorted(
    [...model.nodes.values()].filter((n) => isGroup(n.kind)),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  );
  const out: JsonMap = {};
  for (const grain of ['chapters', 'scenes'] as const) {
    out[`structure:${grain}`] = structureOut(model, s, grain, null);
    for (const p of parts) out[`structure:${grain}:${p.id}`] = structureOut(model, s, grain, p.id);
  }
  return {
    ...out,
    usedLabels: usedLabels(model),
    markers: markersOut(model, s),
    markerScript: markerScript(s, model),
    lanes: lanesOut(model),
    appearances: appearanceScript(s, model),
    abilities: abilitiesOut(model, s),
  };
}

export function misc(): JsonMap {
  return { niceMax: [-3, 0, 1, 7, 9, 10, 11, 99, 100, 101, 999, 1234, 5000, 98765, 1000000].map(niceMax) };
}
