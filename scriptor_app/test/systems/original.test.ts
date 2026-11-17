// Systems agree with the original app: sheets worked out from blueprints (the four presets, each with five kinds of
// profile, and every sheet in the original's own novels), formulas checked as typed, level curves, settling, the level
// history, tidying, formula keys and numbers. Ported from flutter_app/test/shared/domain/growth_test.dart: the same
// report, compared with the original app's own golden (flutter_app/test/fixtures/golden/growth.golden.json), as the
// Flutter app compares itself with it.

import { join } from 'node:path';

import { type JsonMap } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { SystemBlueprint, XpEntry, toFormulaKey } from '../../src/domain/records/system';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { tidyBlueprint } from '../../src/domain/systems/blueprints';
import { type ComputedSheet, type FormulaCheck, SheetProfile, checkFormula, computeSheet, curveTable, settle, xpHistory } from '../../src/domain/systems/compute';
import { type FNode, type FormulaScope, FormulaError, evaluateFormula, formatNumber, namesIn, parseFormula, unmet } from '../../src/domain/systems/formula';
import { systemPresets } from '../../src/domain/systems/systemPresets';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'growth.golden.json')) as Record<string, Record<string, unknown>>;

/** A number as the golden writes it: non-finite ones as words. */
const js = (v: unknown): unknown =>
  typeof v === 'number' && !Number.isFinite(v) ? (Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity') : v;

export function sheetOut(s: ComputedSheet): JsonMap {
  return {
    rows: s.rows.map((r) => ({ id: r.variable.id, value: js(r.value), display: r.display, sources: r.sources, error: r.error })),
    tracks: s.tracks.map((t) => ({
      id: t.track.id,
      label: t.label,
      level: t.level,
      next: t.next,
      unmet: t.unmet,
      xp: t.xp === null ? null : { total: t.xp.total, into: t.xp.into, needed: t.xp.needed, gained: t.xp.gained, progress: t.xp.progress },
      error: t.error,
    })),
    items: s.items.map((i) => ({
      id: i.item.id,
      group: i.group?.id ?? null,
      requires: i.requires,
      unmet: i.unmet,
      costs: i.costs.map((c) => ({ label: c.label, error: c.error })),
      effects: i.effects,
      error: i.error,
    })),
    available: s.available.map((i) => i.id),
    points: s.points === null ? null : { name: s.points.name, earned: s.points.earned, spent: s.points.spent, unspent: s.points.unspent },
  };
}

/** Deep equality as the Flutter test's `expectJson`: maps by keys, lists in order, numbers from pow() and the like to a
 * part in a trillion, everything else exactly. Returns where they first differ, or null. */
export function jsonDiff(a: unknown, e: unknown, path = ''): string | null {
  if (a !== null && e !== null && typeof a === 'object' && typeof e === 'object' && !Array.isArray(a) && !Array.isArray(e)) {
    const am = a as JsonMap;
    const em = e as JsonMap;
    for (const k of new Set([...Object.keys(am), ...Object.keys(em)])) {
      if (!(k in am)) return `${path}.${k} missing (expected ${JSON.stringify(em[k])})`;
      if (!(k in em)) return `${path}.${k} unexpected (${JSON.stringify(am[k])})`;
      const d = jsonDiff(am[k], em[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  if (Array.isArray(a) && Array.isArray(e)) {
    for (let i = 0; i < a.length && i < e.length; i++) {
      const d = jsonDiff(a[i], e[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return a.length === e.length ? null : `${path} has ${a.length} items, expected ${e.length}`;
  }
  if (typeof a === 'number' && typeof e === 'number' && Math.abs(a - e) <= 1e-12 * (Math.abs(e) > 1 ? Math.abs(e) : 1)) return null;
  return a === e ? null : `${path}: ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`;
}

const safe = (f: () => unknown): unknown => {
  try {
    return f();
  } catch (e) {
    if (e instanceof FormulaError) return { error: e.message };
    throw e;
  }
};

function formulas(): JsonMap[] {
  const values: Record<string, number | string> = { strength: 12, level: 30, mana: 0, label: 'Fire', half: 0.5, neg: -3 };
  const scope: FormulaScope = {
    value: (name) => values[name.toLowerCase()] ?? null,
    holds: (group, name) => (group.toLowerCase() === 'class' ? name.toLowerCase() === 'void mage' : group.toLowerCase() === 'title' ? false : null),
  };
  const texts = [
    'strength * 1.5', '100 * level ^ 1.5', 'max(1, floor(strength / 5))', 'min(3, 1, 2)', 'clamp(strength, 0, 10)',
    'round(2.5)', 'round(-2.5)', 'ceil(half)', 'abs(neg)', 'sqrt(16)',
    'Class: Void Mage AND level >= 50', 'NOT (level < 3) OR Title: Chosen', 'Class: Void Mage and Title: Chosen',
    'label = "fire"', "label != 'Water'", 'label = “Fire”', 'strength ≥ 10 × 1', '10 ÷ 4', '7 % 3', '-7 % 3',
    '2 ^ 3 ^ 2', '-2 ^ 2',
    'strength / mana', 'strength % mana', 'unknown + 1', 'Guild: Ash', 'label + 1', 'foo(1)', 'floor(1, 2)',
    'clamp(1)', 'if(level > 10, 1, 2)', 'if(1, 2)', '[strength] + 1', 'true and yes', 'no or false',
    '', '(1 + 2', '1 +', '1 2', 'Class:', '§', 'max()', 'strength >= 10 && level > 1 || 0', '!strength',
    'level <> 30', 'level == 30', '.5 + 1', 'strength = 12', 'label = 3',
  ];
  return texts.map((text) => {
    let tree: FNode;
    try {
      tree = parseFormula(text);
    } catch (e) {
      if (e instanceof FormulaError) return { text, parse: { error: e.message } };
      throw e;
    }
    return { text, names: namesIn(tree), value: safe(() => js(evaluateFormula(tree, scope))), unmet: safe(() => unmet(tree, scope)) };
  });
}

const xp = (id: string, trackId: string, amount: number) => new XpEntry({ id, trackId, amount, source: '', nodeId: null, note: '' });
const obj = (m: ReadonlyMap<string, unknown>): JsonMap => Object.fromEntries(m);

function profiles(c: SystemBlueprint): Record<string, SheetProfile> {
  const items = c.items;
  const vars = c.variables;
  const tracks = c.tracks;
  const item = (i: number): string | null => (i < items.length ? items[i].id : null);
  const stage = (t: number, s: number): string | null => (t < tracks.length && s < tracks[t].stages.length ? tracks[t].stages[s].id : null);
  const v = (i: number): string => (i >= 0 && i < vars.length ? vars[i].id : 'undefined');
  const t = (i: number): string => (i < tracks.length ? tracks[i].id : 'undefined');
  const present = (ids: (string | null)[]): string[] => ids.filter((x): x is string => x !== null);
  return {
    empty: new SheetProfile(),
    holding: new SheetProfile({
      values: new Map([[v(0), 20]]),
      progress: new Map([[t(0), stage(0, 2) ?? 30]]),
      itemIds: present([item(0), item(1), item(2), item(4), item(5)]),
    }),
    xp: new SheetProfile({
      progress: new Map([[t(0), 3]]),
      itemIds: present([item(1)]),
      xp: [xp('a', t(0), 5000), xp('b', t(0), -100), xp('c', 'nope', 3)],
      spent: new Map([
        [v(0), 2],
        [v(1), 1],
        [vars.length > 4 ? vars[4].id : 'x', 7],
      ]),
    }),
    overrides: new SheetProfile({ overrides: new Map<string, unknown>([[v(0), 99], [v(vars.length - 1), 3]]), itemIds: items.map((i) => i.id) }),
    odd: new SheetProfile({ values: new Map([[v(0), 'text']]), progress: new Map([[t(0), 'nonsense']]), itemIds: ['nope'] }),
  };
}

function systemsReport(): JsonMap {
  const check = (c: FormulaCheck): JsonMap => ({ ok: c.ok, error: c.error, preview: c.preview });
  const presets: JsonMap = {};
  for (const p of systemPresets) {
    const c = new SystemBlueprint(p.content);
    const profs = profiles(c);
    const texts = new Set<string>([
      ...c.variables.map((v) => v.formula),
      ...c.items.map((i) => i.requires),
      ...c.tracks.flatMap((t) => [t.curve, ...t.stages.map((s) => s.requires)]),
      'levl >= 5', 'Class: Nobody', 'Spirit Root: Lava', 'Cultivation Realm: Nowhere', 'Skill: Fireball',
      'strength + 1', 'label', '"text"', 'Planet: Mars',
    ]);
    const prof = profs['xp'];
    const settled = settle(c, prof);
    const none = settle(c, prof, () => false);
    presets[p.id] = {
      sheets: Object.fromEntries(Object.entries(profs).map(([k, v]) => [k, sheetOut(computeSheet(c, v))])),
      checks: Object.fromEntries(
        [...texts].map((text) => [text, { number: check(checkFormula(c, text, { condition: false })), condition: check(checkFormula(c, text, { condition: true })) }]),
      ),
      curves: Object.fromEntries(c.tracks.map((t) => [t.id, curveTable(c, t, [0, 1, 2, 3, 10, 99, 100, 101]).map((row) => ({ level: row.level, cost: row.cost }))])),
      settle: { values: obj(settled.values), progress: obj(settled.progress), itemIds: settled.itemIds },
      settleNone: { values: obj(none.values), progress: obj(none.progress), itemIds: none.itemIds },
      history: xpHistory(c, prof, () => 0).map((h) => ({ entry: h.entry.id, level: h.level, track: h.track.id })),
    };
  }
  let n = 0;
  const fresh = () => `00000000-0000-4000-8000-${(n++).toString(16).padStart(12, '0')}`;
  const tidied = tidyBlueprint(
    {
      name: '  ',
      description: 5,
      variables: [{ name: 'Max Health', kind: 'odd' }, { name: 'Max Health', key: 'max_health' }, { id: 'x', name: '', base: 'x', options: ['a', '', 3] }, { name: 'Élan Vital' }],
      tracks: [
        { name: 'Level', points: -2, sources: ['A', 'A', ' ', 'B'] },
        { name: 'Realm', kind: 'stages', stages: [{ name: '' }, { id: 'keep', name: 'Two', requires: 'x' }] },
      ],
      ranks: ['Low', { id: 'r', name: 'High' }, ''],
      groups: [{ id: 'g', name: '' }, { id: 'h', name: 'Classes', single: true }],
      items: [
        { id: 'a', groupId: 'g', name: 'A', parentId: 'a', rank: 'Low' },
        { id: 'b', groupId: 'h', name: '', parentId: 'a', rankId: 'r', modifiers: [{ target: 'x', op: 'pow', value: 2 }], costs: [{}] },
        { id: 'c', groupId: 'none', name: 'Lost' },
      ],
      matrices: [{ name: '', rows: ['R'], columns: ['C'], cells: { 'R|C': 'hit', 'R|D': '  ', 'Q|C': 5 } }],
    },
    fresh,
  );
  return {
    presets,
    tidy: named(JSON.parse(JSON.stringify(tidied))),
    keys: ['Max Health', 'Élan  Vital!', '', '---', 'ﬁre', 'Strength 2', 'ÆON'].map(toFormulaKey),
    formatNumbers: [0, 1.005, 2.345, -1.5, 1e21, 1 / 3, NaN, Infinity].map(formatNumber),
    formulas: formulas(),
  };
}

const uuid = /^[0-9a-f-]{36}$/;
const cellKey = /^[0-9a-f-]{36}\|[0-9a-f-]{36}$/;

/** Ids made up while tidying are random in the original: both sides name them by where they are first met. */
function named(json: unknown): unknown {
  const fresh = new Map<string, string>();
  const visit = (v: unknown, key: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => visit(x, key));
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as JsonMap).map(([k, x]) => [cellKey.test(k) ? 'cell' : k, visit(x, k)]));
    }
    if (typeof v === 'string' && uuid.test(v)) {
      if (!fresh.has(v)) fresh.set(v, `new:${key}`);
      return fresh.get(v);
    }
    return v;
  };
  return visit(json, '');
}

describe('systems agree with the original', () => {
  const expected = golden['systems'];
  const actual = systemsReport();
  for (const part of Object.keys(expected)) {
    test(part, () => {
      const want = part === 'tidy' ? named(expected[part]) : expected[part];
      expect(jsonDiff(actual[part], want, `systems.${part}`)).toBeNull();
    });
  }
});

describe.each(['qa-sample', 'made-in-the-app', 'growth'])('%s: every sheet agrees with the original', (name) => {
  test('sheets', () => {
    const model = StoryModel.fromSnapshot(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`))));
    const sheets = model.sheets.map((sheet) => {
      const system = model.systems.get(sheet.systemId);
      return { id: sheet.id, sheet: system === undefined ? null : sheetOut(computeSheet(system, SheetProfile.of(sheet))) };
    });
    expect(jsonDiff(sheets, golden[name]['sheets'], `${name}.sheets`)).toBeNull();
  });
});
