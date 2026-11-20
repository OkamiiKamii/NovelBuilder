// The rank power field and the skill editor's boost rows, as their view models say them.

import { SystemBlueprint } from '../../src/domain/records/system';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { itemEditor, rankPowerEdit, rankPowerNote, rankRows } from '../../src/domain/systems/screens/systemsPage';
import { levelingJobPreset } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

const bp = (rankPower: number | undefined, byRank: boolean) =>
  new SystemBlueprint({
    id: 'sys',
    name: 'Powers',
    variables: [{ id: 'str', name: 'Strength', key: 'str', kind: 'number', base: 10 }],
    ranks: [{ id: 'rs', name: 'S', ...(rankPower === undefined ? {} : { power: rankPower }) }],
    groups: [{ id: 'g', name: 'Skills' }],
    items: [{ id: 'ss', groupId: 'g', name: 'Super Strength', rankId: 'rs', modifiers: [{ id: 'm', target: 'str', op: 'multiply', value: '', byRank }] }],
  });

test('each rank row has a power field, empty without one', () => {
  expect(rankRows(bp(20, true)).rows[0].power).toMatchObject({ label: 'Power of S', value: '20' });
  expect(rankRows(bp(undefined, true)).rows[0].power.value).toBe('');
});

test('a by-rank boost reads as a sentence with its preview; no power says why', () => {
  const s = bp(20, true);
  expect(itemEditor(s, s.items[0]).modifiers[0]).toMatchObject({
    summary: 'Multiplies Strength by its rank’s power',
    amountMode: 'rank',
    rankNote: 'Uses the power of rank “S”: 20',
    preview: 'Strength 10 → 200',
    problem: null,
  });
  const none = bp(undefined, true);
  const m = itemEditor(none, none.items[0]).modifiers[0];
  expect(m.preview).toBeNull();
  expect(m.problem).toContain('Give rank “S” a power number');
  const typed = bp(20, false);
  expect(itemEditor(typed, typed.items[0]).modifiers[0]).toMatchObject({ amountMode: 'value', rankNote: null, problem: null });
});

test('a power typed sets, clears, or is ignored when not a number', () => {
  const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 5, createId: () => 'x' });
  const sys = c.createSystem(levelingJobPreset.content);
  const rank = c.systems()[0].rankList.find((r) => r.name === 'S')!;
  rankPowerEdit(sys.id, rank.id, '30')!(c);
  expect(c.systems()[0].rankList.find((r) => r.name === 'S')!.power).toBe(30);
  expect(rankPowerEdit(sys.id, rank.id, 'abc')).toBeNull();
  rankPowerEdit(sys.id, rank.id, ' ')!(c);
  expect(c.systems()[0].rankList.find((r) => r.name === 'S')!.power).toBeNull();
});

test('a power with a decimal comma is a number; other text gets a note', () => {
  const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 5, createId: () => 'x' });
  const sys = c.createSystem(levelingJobPreset.content);
  const rank = c.systems()[0].rankList.find((r) => r.name === 'S')!;
  rankPowerEdit(sys.id, rank.id, '1,5')!(c);
  expect(c.systems()[0].rankList.find((r) => r.name === 'S')!.power).toBe(1.5);
  expect(rankPowerNote('×20')).toBe('A number, like 20');
  expect([rankPowerNote('20'), rankPowerNote(''), rankPowerNote('1,5')]).toEqual([null, null, null]);
  expect(rankRows(bp(20, true)).rows[0].power.hint).toBe('20');
});
