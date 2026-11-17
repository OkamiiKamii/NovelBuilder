// Scriptor's outputs for the relationships domain, keyed as golden/dump.dart writes the Flutter app's: history, the
// network and its layout under many filters, and runs of relation changes.

import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap, mapOrNull, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { CharacterRelation } from '../../src/domain/records/relation';
import { roleOf, stageDifferences, timelineOf } from '../../src/domain/relationships/history';
import {
  Across,
  AsOf,
  Ever,
  type Network,
  type NetworkFilter,
  Now,
  type Trig,
  type When,
  layoutGraph,
  layoutNetwork,
  relationNetwork,
  stageShown,
} from '../../src/domain/relationships/network';
import { type AttributeInput, RelationChanges, type StageInput } from '../../src/domain/relationships/relationChanges';
import {
  type Affinity,
  type RelationCategory,
  TrackedAttribute,
  relationSettingsOf,
} from '../../src/domain/relationships/relationTypes';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';

/** The layout's cosine and sine: the Flutter app's (as golden/dump.dart's platform gave them) where they differ from
 * this engine's, so the layouts can be compared to the pixel. */
let trig: Trig = Math;
export function useTrig(overrides: readonly (readonly [number, number, number])[]): void {
  const cos = new Map(overrides.map(([a, c]) => [a, c]));
  const sin = new Map(overrides.map(([a, , s]) => [a, s]));
  trig = { cos: (a) => cos.get(a) ?? Math.cos(a), sin: (a) => sin.get(a) ?? Math.sin(a) };
}

const codeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function netJson(net: Network): JsonMap {
  const layout: JsonMap = {};
  for (const [id, p] of layoutNetwork(net.nodes, net.edges, trig)) layout[id] = [p.x, p.y];
  return {
    nodes: net.nodes.map((n) => ({ id: n.id, name: n.name, degree: n.degree, focus: n.focus })),
    edges: net.edges.map((e) => ({
      id: e.id,
      kind: e.kind,
      from: e.from,
      to: e.to,
      directed: e.directed,
      label: e.label,
      fromRole: e.fromRole,
      toRole: e.toRole,
      category: e.category,
      affinity: e.affinity,
      stage: e.stage?.id ?? null,
      range: e.range,
    })),
    total: net.total,
    hidden: net.hidden,
    layout,
  };
}

export function report(s: NovelSnapshot): JsonMap {
  const model = StoryModel.fromSnapshot(s);
  const settings = relationSettingsOf(s.rows('relationSettings'));
  const chapters = model.order.chapters.map((c) => c.id);
  const characters = [...model.entries.values()]
    .filter((e) => e.category === 'character')
    .map((e) => e.id)
    .sort(codeUnits);
  const factions = [...model.entries.values()]
    .filter((e) => e.category === 'faction')
    .map((e) => e.id)
    .sort(codeUnits);
  const presets = [...new Set([...model.relations.values()].flatMap((r) => r.stages.map((st) => st.preset)))].sort(
    codeUnits,
  );
  const name = (id: string) => model.entries.get(id)?.name ?? '?';
  const attributes = [new TrackedAttribute('trust', 'Trust'), ...settings.attributes];
  const timelines: JsonMap = {};
  for (const r of model.relations.values()) {
    const t = timelineOf(r, model.order);
    timelines[r.id] = t.map((e, i) => ({
      stage: e.stage.id,
      range: e.range,
      orphaned: e.orphaned,
      changes: stageDifferences(i === 0 ? null : t[i - 1].stage, e.stage, {
        fromName: name(r.fromId),
        toName: name(r.toId),
        attributes,
      }),
      roles: [roleOf(e.stage, r, r.fromId), roleOf(e.stage, r, r.toId)],
    }));
  }
  const whens: [string, When][] = [
    ['current', new Now()],
    ['ever', new Ever()],
    ['acrossAll', new Across(null, null)],
    ['acrossGone', new Across('gone', 'gone')],
    ['atGone', new AsOf('gone')],
    ...chapters.map((c, i): [string, When] => [`at${i}`, new AsOf(c)]),
  ];
  for (let i = 0; i < chapters.length; i++) {
    for (let j = i; j < chapters.length && j < i + 3; j++)
      whens.push([`across${i}-${j}`, new Across(chapters[i], chapters[j])]);
  }
  if (chapters.length > 0) {
    whens.push(['fromFirst', new Across(chapters[0], null)]);
    whens.push(['toLast', new Across(null, chapters[chapters.length - 1])]);
  }
  const filters: [string, NetworkFilter][] = [
    ['all', {}],
    ['ever', { when: new Ever() }],
    ['isolated', { isolated: true }],
    ['noSocial', { hidden: new Set(['social', 'connection'] as const) }],
    ['noFamilyLabels', { hidden: new Set(['family', 'labels'] as const) }],
    ['keepNone', { keep: () => false }],
    ['keepHalf', { keep: (id) => codeUnits(id, 'm') < 0 }],
    ...presets.map((p): [string, NetworkFilter] => [`type:${p}`, { type: p }]),
    ...presets.map((p): [string, NetworkFilter] => [`typeEver:${p}`, { type: p, when: new Ever() }]),
    ...factions.map((f): [string, NetworkFilter] => [`faction:${f}`, { factionId: f }]),
    ...factions.map((f): [string, NetworkFilter] => [`factionIsolated:${f}`, { factionId: f, isolated: true }]),
    ['factionGone', { factionId: 'gone' }],
    ...characters.slice(0, 6).map((c): [string, NetworkFilter] => [`focus1:${c}`, { focus: { id: c, depth: 1 } }]),
    ...characters
      .slice(0, 6)
      .map((c): [string, NetworkFilter] => [`focus2:${c}`, { focus: { id: c, depth: 2 }, isolated: true }]),
    ['focusGone', { focus: { id: 'gone', depth: 1 } }],
    ...chapters.slice(0, 8).map((c, i): [string, NetworkFilter] => [`at${i}`, { when: new AsOf(c) }]),
  ];
  if (chapters.length > 1) {
    filters.push(['across', { when: new Across(chapters[1], chapters.length > 3 ? chapters[3] : null) }]);
  }
  const shown: JsonMap = {};
  for (const [k, w] of whens) {
    const byRelation: JsonMap = {};
    for (const r of model.relations.values()) {
      byRelation[r.id] = [
        stageShown(r, model, w)?.id ?? null,
        ...presets.slice(0, 4).map((p) => stageShown(r, model, w, p)?.id ?? null),
      ];
    }
    shown[k] = byRelation;
  }
  const networks: JsonMap = {};
  for (const [k, f] of filters) networks[k] = netJson(relationNetwork(model, f));
  return { timelines, shown, networks };
}

export function changed(s: NovelSnapshot): JsonMap {
  const out: JsonMap = {};
  for (const c of ['characterRelations', 'relationSettings', 'loreLinks']) out[c] = s.rows(c);
  return out;
}

const wrapped = (v: unknown): { value: string | null } | undefined =>
  mapOrNull(v) === null ? undefined : { value: (mapOrNull(v)!['value'] as string | null | undefined) ?? null };

function input(c: JsonMap): StageInput {
  const out: StageInput = {};
  const s = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : undefined);
  if (s('preset') !== undefined) out.preset = s('preset');
  if (s('label') !== undefined) out.label = s('label');
  if (s('fromRole') !== undefined) out.fromRole = s('fromRole');
  if (s('toRole') !== undefined) out.toRole = s('toRole');
  if (typeof c['directional'] === 'boolean') out.directional = c['directional'];
  if (s('category') !== undefined) out.category = s('category') as RelationCategory;
  if (s('title') !== undefined) out.title = s('title');
  if (s('affinity') !== undefined) out.affinity = s('affinity') as Affinity;
  if (s('event') !== undefined) out.event = s('event');
  if (s('notes') !== undefined) out.notes = s('notes');
  const attributes = mapOrNull(c['attributes']);
  if (attributes !== null) {
    out.attributes = new Map(
      Object.entries(attributes).map(([key, raw]): [string, AttributeInput] => {
        const v = mapOrNull(raw) ?? {};
        return [
          key,
          {
            from: (v['from'] as number | null | undefined) ?? null,
            to: (v['to'] as number | null | undefined) ?? null,
            setFrom: v['setFrom'] === true,
            setTo: v['setTo'] === true,
          },
        ];
      }),
    );
  }
  if (wrapped(c['start']) !== undefined) out.start = wrapped(c['start']);
  if (typeof c['startUnknown'] === 'boolean') out.startUnknown = c['startUnknown'];
  if (wrapped(c['storyEventId']) !== undefined) out.storyEventId = wrapped(c['storyEventId']);
  if (mapOrNull(c['storyDate']) !== null) out.storyDate = { value: mapOrNull(mapOrNull(c['storyDate'])!['value']) };
  if (wrapped(c['causeEventId']) !== undefined) out.causeEventId = wrapped(c['causeEventId']);
  if (wrapped(c['causeNodeId']) !== undefined) out.causeNodeId = wrapped(c['causeNodeId']);
  return out;
}

/** Runs a script of relation changes: each step on what the one before left. */
export function runScript(
  start: NovelSnapshot,
  steps: readonly unknown[],
): { steps: JsonMap[]; final: NovelSnapshot; refs: JsonMap } {
  let s = start;
  let clock = 1000;
  let ids = 0;
  const refs: Record<string, string> = {};
  const resolve = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(/\$(\w+)/g, (m, k: string) => refs[k] ?? m);
    if (Array.isArray(v)) return v.map(resolve);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    }
    return v;
  };
  const out: JsonMap[] = [];
  for (const raw of steps) {
    const step = resolve(raw) as JsonMap;
    const c = new RelationChanges(s, { now: ++clock, createId: () => `id${++ids}` });
    const stageId = (relId: unknown, at: unknown): string => {
      if (typeof at !== 'number') return `${at as string}`;
      const row = c.row('characterRelations', `${relId as string}`);
      const stages = row === null ? [] : new CharacterRelation(row).stages;
      return at < stages.length ? stages[at].id : 'missing';
    };
    const rel = () => step['rel'] as string;
    const changes = () => input(mapOrNull(step['changes']) ?? {});
    let result: unknown = null;
    try {
      switch (step['op']) {
        case 'createRelation':
          result = c.createRelation(
            step['from'] as string,
            step['to'] as string,
            (step['preset'] as string) ?? 'friends',
          ).raw;
          break;
        case 'recordChange':
          result = c.recordChange(rel(), {
            nodeId: (step['nodeId'] as string | null) ?? null,
            unknown: step['unknown'] === true,
            changes: changes(),
          }).raw;
          break;
        case 'addStage':
          result = c.addStage(rel(), (step['nodeId'] as string | null) ?? null, {
            unknown: step['unknown'] === true,
          }).raw;
          break;
        case 'updateStage':
          c.updateStage(rel(), stageId(step['rel'], step['stage']), changes());
          break;
        case 'moveStage':
          c.moveStage(rel(), stageId(step['rel'], step['stage']), step['by'] as number);
          break;
        case 'removeStage':
          c.removeStage(rel(), stageId(step['rel'], step['stage']));
          break;
        case 'reverse':
          c.reverse(rel());
          break;
        case 'removeRelation':
          c.removeRelation(rel());
          break;
        case 'saveType':
          result = c.saveType({
            label: step['label'] as string | undefined,
            category: step['category'] as RelationCategory | undefined,
            directional: step['directional'] as boolean | undefined,
            fromRole: step['fromRole'] as string | undefined,
            toRole: step['toRole'] as string | undefined,
            typeId: step['typeId'] as string | undefined,
          }).raw;
          break;
        case 'removeType':
          c.removeType(step['id'] as string);
          break;
        case 'offerBuiltIn':
          c.offerBuiltIn(step['key'] as string, { offered: step['offered'] === true });
          break;
        case 'trackAttribute':
          result = c.trackAttribute(step['name'] as string).toJson();
          break;
        case 'untrackAttribute':
          c.untrackAttribute(step['key'] as string);
          break;
        case 'putLink':
          c.put('loreLinks', { projectId: c.projectId, ...(step['link'] as JsonMap) });
          break;
        case 'changeConnection':
          result = c.changeConnection(step['id'] as string, step['at'] as JsonMap, {
            fromId: step['fromId'] as string | undefined,
            toId: step['toId'] as string | undefined,
            type: step['type'] as string | undefined,
            label: step['label'] as string | undefined,
            how: step['how'] as string | undefined,
          });
          break;
        case 'startConnectionAt':
          c.startConnectionAt(step['id'] as string, step['at'] as JsonMap);
          break;
        case 'endConnection':
          c.endConnection(step['id'] as string, step['at'] as JsonMap, { endHow: (step['endHow'] as string) ?? '' });
          break;
        default:
          throw new Error(`Unknown step ${String(step['op'])}`);
      }
      s = c.snapshot;
      const as = step['as'];
      if (typeof as === 'string') refs[as] = typeof result === 'string' ? result : str((result as JsonMap)['id']);
      out.push({ ok: result, after: changed(s) });
    } catch (e) {
      if (!(e instanceof ChangeRefused)) throw e;
      out.push({ refused: e.message });
    }
  }
  return { steps: out, final: s, refs };
}

export function scriptNovel(spec: JsonMap): NovelSnapshot {
  let created = 0;
  const row = (r: unknown): JsonMap => ({ projectId: 'novel', createdAt: ++created, ...(r as JsonMap) });
  const list = (k: string) => spec[k] as unknown[];
  return NovelSnapshot.fromJson({
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 0,
    project: { id: 'novel', title: 'Ties', createdAt: 0, updatedAt: 0 },
    collections: {
      chapters: list('chapters').map(row),
      timelineEvents: list('events').map(row),
      loreEntries: list('entries').map((r) => ({ ...row(r), fields: [], tags: [] })),
      loreLinks: list('links').map(row),
    },
  });
}

/** A round trip through JSON, as the golden carries values. */
export function asJson(s: NovelSnapshot): NovelSnapshot {
  return NovelSnapshot.fromJson(JSON.parse(JSON.stringify(s.toJson(0))));
}

/** The small graphs dump.dart lays out. */
export function graphs(): JsonMap {
  const star = {
    nodes: Array.from({ length: 9 }, (_, i) => ({ id: `n${i}`, degree: i === 0 ? 8 : 1 })),
    edges: Array.from({ length: 8 }, (_, i) => ({ from: 'n0', to: `n${i + 1}` })),
  };
  const all: Record<string, { nodes: { id: string; degree: number }[]; edges: { from: string; to: string }[] }> = {
    empty: { nodes: [], edges: [] },
    one: { nodes: [{ id: 'a', degree: 0 }], edges: [] },
    pair: {
      nodes: [
        { id: 'a', degree: 1 },
        { id: 'b', degree: 1 },
      ],
      edges: [{ from: 'a', to: 'b' }],
    },
    self: {
      nodes: [
        { id: 'a', degree: 2 },
        { id: 'b', degree: 0 },
      ],
      edges: [{ from: 'a', to: 'a' }],
    },
    stray: {
      nodes: [
        { id: 'a', degree: 1 },
        { id: 'b', degree: 0 },
      ],
      edges: [{ from: 'a', to: 'zz' }],
    },
    twice: {
      nodes: [
        { id: 'a', degree: 2 },
        { id: 'b', degree: 2 },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    },
    star,
    apart: { nodes: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, degree: 0 })), edges: [] },
  };
  const out: JsonMap = {};
  for (const [k, g] of Object.entries(all)) {
    const placed: JsonMap = {};
    for (const [id, p] of layoutGraph(g.nodes, g.edges, trig)) placed[id] = [p.x, p.y];
    out[k] = placed;
  }
  return out;
}
