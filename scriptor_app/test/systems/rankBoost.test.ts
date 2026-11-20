// Boosts by rank power, compounding multipliers, items switched off, a rank's power, the Leveling Job preset.

import { type JsonMap } from '../../src/domain/json';
import { SystemBlueprint } from '../../src/domain/records/system';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { tidyBlueprint } from '../../src/domain/systems/blueprints';
import { SheetProfile, computeSheet } from '../../src/domain/systems/compute';
import { modifierPreviews } from '../../src/domain/systems/screens/sheetEditor';
import { statusWindowView } from '../../src/domain/systems/screens/statusWindow';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { allSystemPresets, levelingJobPreset, systemPresets } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

const mod = (id: string, op: string, value: string, byRank = false): JsonMap => ({ id, target: 'str', op, value, ...(byRank ? { byRank: true } : {}) });
const item = (id: string, name: string, rankId: string | null, modifiers: JsonMap[]): JsonMap => ({ id, groupId: 'g', name, rankId, modifiers });

function blueprint(items: JsonMap[]): SystemBlueprint {
  return new SystemBlueprint({
    id: 'sys',
    name: 'Powers',
    variables: [{ id: 'str', name: 'Strength', key: 'str', kind: 'number', base: 10 }],
    ranks: [{ id: 'rs', name: 'S', power: 20 }, { id: 'rx', name: 'X' }],
    groups: [{ id: 'g', name: 'Skills' }],
    items,
  });
}
const strength = (b: SystemBlueprint, held: string[], off: string[] = []) => {
  const sheet = computeSheet(b, new SheetProfile({ itemIds: held, offIds: off }));
  return { row: sheet.rows[0], sheet };
};

describe('multipliers compound', () => {
  test('×20 and ×5 make ×100', () => {
    const b = blueprint([item('a', 'Super Strength', null, [mod('m1', 'multiply', '20')]), item('b', 'Brute', null, [mod('m2', 'multiply', '5')])]);
    expect(strength(b, ['a', 'b']).row.value).toBe(1000);
  });
});

describe('a boost by rank power', () => {
  const b = blueprint([
    item('ss', 'Super Strength', 'rs', [mod('m1', 'multiply', '999', true)]),
    item('iron', 'Iron Skin', null, [mod('m2', 'add', '5')]),
    item('set', 'Fixed', 'rs', [mod('m3', 'set', '1', true)]),
  ]);

  test('multiply takes the power and ignores the typed value, and says how it came out', () => {
    const { row } = strength(b, ['ss']);
    expect(row.value).toBe(200);
    expect(row.breakdown).toBe('10 base × 20 Super Strength (S)');
  });

  test('set takes it too; an add comes before a multiply in the breakdown', () => {
    expect(strength(b, ['set']).row.value).toBe(20);
    const both = strength(b, ['iron', 'ss']);
    expect(both.row.value).toBe(300);
    expect(both.row.breakdown).toBe('(10 base + 5 Iron Skin) × 20 Super Strength (S)');
  });

  test('nothing changed it: no breakdown', () => {
    expect(strength(b, []).row.breakdown).toBeNull();
  });

  test('a rank without a power, or no rank, is an error on the item and the value stays', () => {
    const bad = blueprint([item('x', 'Odd', 'rx', [mod('m', 'multiply', '3', true)]), item('y', 'Bare', null, [mod('m', 'multiply', '3', true)])]);
    const x = strength(bad, ['x']);
    expect(x.row.value).toBe(10);
    expect(x.sheet.items[0].error).toBe('Give rank “X” a power number, or type a number for this boost.');
    const y = strength(bad, ['y']);
    expect(y.row.value).toBe(10);
    expect(y.sheet.items[0].error).toMatch(/Give Bare a rank/);
  });

  test('a rank list reads the power; an older rank without one reads null; `ranks` still works', () => {
    expect(b.rankList).toEqual([{ id: 'rs', name: 'S', power: 20 }, { id: 'rx', name: 'X', power: null }]);
    expect(b.rankPower(b.items[0])).toBe(20);
    expect(b.ranks).toEqual([{ id: 'rs', name: 'S' }, { id: 'rx', name: 'X' }]);
  });

  test('the preview a skill editor shows, from the starting values', () => {
    expect(modifierPreviews(b, b.items[0])).toEqual([{ id: 'm1', byRank: true, preview: 'Strength 10 → 200' }]);
    const bad = blueprint([item('x', 'Odd', 'rx', [mod('m', 'multiply', '3', true)])]);
    expect(modifierPreviews(bad, bad.items[0])[0].preview).toBeNull();
  });
});

describe('switched off', () => {
  const b = blueprint([item('iron', 'Iron Skin', null, [mod('m', 'add', '5')])]);

  test('still held and listed, but changes nothing', () => {
    const { row, sheet } = strength(b, ['iron'], ['iron']);
    expect(row.value).toBe(10);
    expect(row.breakdown).toBeNull();
    expect(sheet.items.map((i) => [i.item.name, i.off, i.effects])).toEqual([['Iron Skin', true, []]]);
    expect(strength(b, ['iron']).sheet.items[0].off).toBe(false);
  });

  test('the status window lists it as off', () => {
    const view = statusWindowView({ content: b.raw, presetId: 'x', holder: 'A', held: ['iron'], caption: '', profile: new SheetProfile({ itemIds: ['iron'], offIds: ['iron'] }) });
    expect(view.groups[0].held[0]).toMatchObject({ name: 'Iron Skin', off: true });
  });
});

describe('the changes', () => {
  function setup() {
    let n = 0;
    const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 5, createId: () => `id${n++}` });
    const sys = c.createSystem(levelingJobPreset.content);
    const wren = c.snapshot.rows('loreEntries')[0]['id'] as string;
    c.addSheet(sys.id, wren);
    return { c, sys };
  }

  test('a rank’s power is set, changed and taken away; a missing rank or a non-number is refused', () => {
    const { c, sys } = setup();
    const rankS = c.systems()[0].rankList.find((r) => r.name === 'S')!;
    expect(rankS.power).toBe(20);
    c.setRankPower(sys.id, rankS.id, 25);
    expect(c.systems()[0].rankList.find((r) => r.name === 'S')!.power).toBe(25);
    c.setRankPower(sys.id, rankS.id, null);
    expect(c.systems()[0].rankList.find((r) => r.name === 'S')!.power).toBeNull();
    expect(c.systems()[0].rankList).toHaveLength(9);
    expect(() => c.setRankPower(sys.id, 'nope', 1)).toThrow('That rank is not in this system.');
    expect(() => c.setRankPower(sys.id, rankS.id, NaN)).toThrow('must be a number');
  });

  test('an item is switched off and on; a sheet that never used it stays without the field', () => {
    const { c, sys } = setup();
    const group = c.systems()[0].groupList.find((g) => g.name === 'Skills')!;
    c.updateSystem(sys.id, (cur) => ({ items: [...cur.items.map((i) => i.raw), { id: 'sk', groupId: group.id, name: 'Sprint' }] }));
    const sheetId = c.sheets()[0].id;
    c.updateSheet(sheetId, () => ({ itemIds: ['sk'] }));
    expect('offIds' in c.sheets()[0].raw).toBe(false);
    c.setItemOff(sheetId, 'sk', true);
    c.setItemOff(sheetId, 'sk', true);
    expect(c.sheets()[0].offIds).toEqual(['sk']);
    c.setItemOff(sheetId, 'sk', false);
    expect('offIds' in c.sheets()[0].raw).toBe(false);
    expect(() => c.setItemOff(sheetId, 'nope', true)).toThrow('That item is not in this system.');
  });
});

describe('Leveling Job', () => {
  test('it is offered after the original four, which stay as they were', () => {
    expect(systemPresets).toHaveLength(4);
    expect(allSystemPresets.map((p) => p.id)).toEqual([...systemPresets.map((p) => p.id), 'leveling-job']);
  });

  test('loads and computes: stats at their start, a Level, ranks by power, Job single, Skills not', () => {
    const b = new SystemBlueprint(levelingJobPreset.content);
    const sheet = computeSheet(b);
    expect(sheet.rows.map((r) => [r.variable.name, r.display])).toEqual([
      ['Strength', '10'], ['Speed', '10'], ['Intelligence', '10'], ['Defense', '10'], ['Vitality', '10'], ['Health', '100 HP'],
    ]);
    expect(sheet.tracks[0].label).toBe('1');
    expect(b.rankList.map((r) => `${r.name}=${r.power}`).join(' ')).toBe('F=1.5 E=2 D=3 C=5 B=8 A=12 S=20 SS=35 SSS=60');
    expect(b.groupList.map((g) => [g.name, g.single])).toEqual([['Job', true], ['Skills', false]]);
    expect(b.items).toEqual([]);
  });

  test('a rank S skill boosts Strength ×20', () => {
    const raw: JsonMap = {
      ...levelingJobPreset.content,
      items: [{ id: 'ss', groupId: 'g-skills', name: 'Super Strength', rankId: 'r-s', modifiers: [{ id: 'm', target: 'strength', op: 'multiply', value: '', byRank: true }] }],
    };
    const row = computeSheet(new SystemBlueprint(raw), new SheetProfile({ itemIds: ['ss'] })).rows[0];
    expect(row.value).toBe(200);
    expect(row.breakdown).toBe('10 base × 20 Super Strength (S)');
  });
});

test('tidyBlueprint keeps a modifier’s byRank (and a rank’s power) through save', () => {
  const raw = blueprint([item('ss', 'Super Strength', 'rs', [mod('m1', 'multiply', '', true), mod('m2', 'add', '5')])]).raw;
  const tidy = new SystemBlueprint({ id: 'sys', ...tidyBlueprint(raw) });
  const [byRank, plain] = tidy.items[0].modifiers;
  expect(byRank.byRank).toBe(true);
  expect(plain.byRank).toBe(false);
  expect(plain.raw['byRank']).toBeUndefined();
  expect(tidy.rankPower(tidy.items[0])).toBe(20);
  // (10 base + 5) × 20: adds come before multiplies.
  expect(strength(tidy, ['ss']).row.value).toBe(300);
});
