// A system blueprint made safe to store, and a fresh copy of one: `tidyBlueprint` and `instantiateBlueprint` of
// flutter_app/lib/shared/domain/systems/system_changes.dart. Genre modules carry a starter system and package one
// (src/domain/modules); the rest of system_changes.dart (SystemChanges) comes with the Systems phase.

import { newId } from '../ids';
import { type JsonMap, isMap, mapOrNull } from '../json';
import { upgradeBlueprintShape } from '../records/blueprintShape';
import { maps, strings } from '../records/jsonRecord';
import { toFormulaKey } from '../records/system';
import { dartTrim } from '../text/dartString';

const variableKinds = ['number', 'resource', 'derived', 'choice'];
const modifierOps = ['add', 'multiply', 'set'];

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const number = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** Dart's `_plainNumber`: a whole number is kept whole. JavaScript has one kind of number, so it is the number. */
const plainNumber = (n: number): number => n;
const or = (a: string, b: string): string => (a.length > 0 ? a : b);
const unique = (values: Iterable<string>): string[] => [...new Set(values)];

/** Makes a blueprint safe to store without imposing any game rules on it: everything has an id and a name, formula
 * names are unique, and references inside the blueprint point at things that exist. As the original's `tidy`. */
export function tidyBlueprint(given: JsonMap, createId: () => string = newId): JsonMap {
  // Blueprints from earlier versions link ranks and table cells by name.
  const input = upgradeBlueprintShape(given, createId);
  const taken = new Set<string>();
  const uniqueKey = (wanted: string): string => {
    const base = toFormulaKey(wanted);
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return key;
  };

  const variables: JsonMap[] = [];
  for (const raw of list(input['variables'])) {
    const v = mapOrNull(raw);
    if (v === null) continue;
    variables.push({
      id: or(text(v['id']), createId()),
      name: or(dartTrim(text(v['name'])), 'Unnamed'),
      key: uniqueKey(or(text(v['key']), or(text(v['name']), 'value'))),
      kind: variableKinds.includes(v['kind'] as string) ? v['kind'] : 'number',
      unit: dartTrim(text(v['unit'])),
      base: plainNumber(number(v['base'])),
      formula: text(v['formula']),
      options: list(v['options'])
        .filter((o) => dartTrim(text(o)).length > 0)
        .map((o) => dartTrim(text(o))),
      note: text(v['note']),
    });
  }
  const tracks: JsonMap[] = [];
  for (const raw of list(input['tracks'])) {
    const t = mapOrNull(raw);
    if (t === null) continue;
    // In Dart's order: the track's own id and key first, then its stages' ids.
    const track: JsonMap = {
      id: or(text(t['id']), createId()),
      name: or(dartTrim(text(t['name'])), 'Unnamed'),
      key: uniqueKey(or(text(t['key']), or(text(t['name']), 'track'))),
      kind: t['kind'] === 'stages' ? 'stages' : 'levels',
      cap: plainNumber(number(t['cap']) < 0 ? 0 : Math.floor(number(t['cap']) + 0.5)),
      curve: text(t['curve']),
      curveUnit: dartTrim(text(t['curveUnit'])),
    };
    if (t['kind'] !== 'stages') {
      track['points'] = plainNumber(number(t['points']) < 0 ? 0 : number(t['points']));
      track['sources'] = unique(
        list(t['sources'])
          .filter((s) => dartTrim(text(s)).length > 0)
          .map((s) => dartTrim(text(s))),
      );
    }
    const stages: JsonMap[] = [];
    for (const rs of list(t['stages'])) {
      const s = mapOrNull(rs);
      if (s === null) continue;
      stages.push({
        id: or(text(s['id']), createId()),
        name: or(dartTrim(text(s['name'])), 'Unnamed stage'),
        requires: text(s['requires']),
        note: text(s['note']),
        grants: unique(list(s['grants']).filter((g) => text(g).length > 0).map((g) => text(g))),
      });
    }
    track['stages'] = stages;
    tracks.push(track);
  }
  const groups: JsonMap[] = [];
  for (const raw of list(input['groups'])) {
    const g = mapOrNull(raw);
    if (g === null) continue;
    groups.push({ id: or(text(g['id']), createId()), name: or(dartTrim(text(g['name'])), 'Unnamed group'), single: g['single'] === true });
  }
  const groupIds = new Set(groups.map((g) => g['id']));
  const rawItems: JsonMap[] = [];
  for (const r of list(input['items'])) {
    const i = mapOrNull(r);
    if (i !== null && groupIds.has(i['groupId'] as string)) rawItems.push({ ...i, id: or(text(i['id']), createId()) });
  }
  const itemIds = new Set(rawItems.map((i) => i['id']));
  const ranks = list(input['ranks']).filter(isMap);
  const rankIds = new Set(ranks.map((r) => r['id']));
  const items = rawItems.map((i): JsonMap => {
    const modifiers: JsonMap[] = [];
    for (const raw of list(i['modifiers'])) {
      const m = mapOrNull(raw);
      if (m === null) continue;
      modifiers.push({
        id: or(text(m['id']), createId()),
        target: text(m['target']),
        op: modifierOps.includes(m['op'] as string) ? m['op'] : 'add',
        value: text(m['value']),
        ...(m['byRank'] === true ? { byRank: true } : {}),
      });
    }
    const costs: JsonMap[] = [];
    for (const raw of list(i['costs'])) {
      const c = mapOrNull(raw);
      if (c === null) continue;
      costs.push({ id: or(text(c['id']), createId()), target: text(c['target']), amount: text(c['amount']) });
    }
    return {
      id: i['id'],
      groupId: i['groupId'],
      name: or(dartTrim(text(i['name'])), 'Unnamed'),
      description: text(i['description']),
      parentId:
        typeof i['parentId'] === 'string' && i['parentId'] !== i['id'] && itemIds.has(i['parentId']) ? i['parentId'] : null,
      rankId: typeof i['rankId'] === 'string' && rankIds.has(i['rankId']) ? i['rankId'] : null,
      requires: text(i['requires']),
      modifiers,
      costs,
      cooldown: text(i['cooldown']),
      affinity: text(i['affinity']),
      evolution: text(i['evolution']),
    };
  });
  const matrices: JsonMap[] = [];
  for (const raw of list(input['matrices'])) {
    const m = mapOrNull(raw);
    if (m === null) continue;
    const cells: JsonMap = {};
    for (const [k, v] of Object.entries(mapOrNull(m['cells']) ?? {})) {
      if (typeof v === 'string' && dartTrim(v).length > 0) cells[k] = v;
    }
    matrices.push({
      id: or(text(m['id']), createId()),
      name: or(dartTrim(text(m['name'])), 'Unnamed table'),
      rows: m['rows'],
      columns: m['columns'],
      cells,
    });
  }
  return {
    name: or(dartTrim(text(input['name'])), 'Untitled system'),
    description: text(input['description']),
    variables,
    // A stage gives only what is still in the blueprint.
    tracks: tracks.map((t) => ({
      ...t,
      stages: maps(t['stages']).map((s) => {
        const given = strings(s['grants']).filter((g) => itemIds.has(g));
        // Written only when a stage gives something: a blueprint without reads as it always has.
        const out: JsonMap = {};
        for (const [k, v] of Object.entries(s)) if (k !== 'grants') out[k] = v;
        if (given.length > 0) out['grants'] = given;
        return out;
      }),
    })),
    ranks,
    groups,
    items,
    matrices,
  };
}

/** A copy of a blueprint's content in which everything has a new id, with references inside it kept intact. */
export function instantiateBlueprint(given: JsonMap, createId: () => string = newId): JsonMap {
  const content = upgradeBlueprintShape(given, createId);
  const ids = new Map<string, string>();
  const fresh = (old: unknown): string => {
    const key = text(old);
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = createId()));
    return id;
  };
  for (const i of maps(content['items'])) fresh(i['id']);
  for (const g of maps(content['groups'])) fresh(g['id']);
  return tidyBlueprint(
    {
      ...content,
      variables: maps(content['variables']).map((v) => ({ ...v, id: createId(), options: [...strings(v['options'])] })),
      tracks: maps(content['tracks']).map((t) => ({
        ...t,
        id: createId(),
        stages: maps(t['stages']).map((s) => {
          const out: JsonMap = { ...s, id: createId() };
          // What it gives, in the copy's own items.
          if ('grants' in s) out['grants'] = strings(s['grants']).map(fresh);
          return out;
        }),
      })),
      ranks: maps(content['ranks']).map((r) => ({ ...r })),
      groups: maps(content['groups']).map((g) => ({ ...g, id: fresh(g['id']) })),
      items: maps(content['items']).map((i) => ({
        ...i,
        id: fresh(i['id']),
        groupId: fresh(i['groupId']),
        parentId: typeof i['parentId'] === 'string' ? fresh(i['parentId']) : null,
        modifiers: maps(i['modifiers']).map((m) => ({ ...m, id: createId() })),
        costs: maps(i['costs']).map((c) => ({ ...c, id: createId() })),
      })),
      matrices: maps(content['matrices']).map((m) => ({
        ...m,
        id: createId(),
        rows: maps(m['rows']).map((r) => ({ ...r })),
        columns: maps(m['columns']).map((c) => ({ ...c })),
        cells: { ...(mapOrNull(m['cells']) ?? {}) },
      })),
    },
    createId,
  );
}
