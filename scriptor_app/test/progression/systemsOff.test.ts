// A system turned Off is skipped by every character-facing reader and every check; nothing stored is touched, and
// turning it back on shows everything as before.

import { CastData } from '../../src/domain/characters/castData';
import { CharacterChanges } from '../../src/domain/characters/characterChanges';
import { hasSystems } from '../../src/domain/characters/screens/profile';
import { abilityTree } from '../../src/domain/abilities/paths';
import { brokenReferences } from '../../src/domain/integrity/rules';
import { mergeEntries } from '../../src/domain/integrity/fixes';
import { StoryModel } from '../../src/domain/model/storyModel';
import { progressionSheets } from '../../src/domain/progression/screens/progressionTab';
import { snapshotEditor, stateCard } from '../../src/domain/progression/screens/snapshotsView';
import { SnapshotChanges } from '../../src/domain/progression/snapshots';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { readJson, samplePath } from '../fixtures';

const content = {
  name: 'Powers',
  variables: [{ id: 'str', name: 'Strength', key: 'str', kind: 'number', base: 10 }],
  groups: [{ id: 'g', name: 'Skills' }],
  items: [{ id: 'iron', groupId: 'g', name: 'Iron Skin', modifiers: [{ id: 'm', target: 'str', op: 'add', value: '5' }] }],
};

function setup() {
  let n = 0;
  const next = () => `id${n++}`;
  const base = NovelSnapshot.fromJson(readJson(samplePath));
  const sc = new SystemChanges(base, { now: 1, createId: next });
  // The sample may already hold systems: only ours is judged.
  const sys = sc.createSystem(content);
  const wren = sc.snapshot.rows('loreEntries').find((r) => r['category'] === 'character')!['id'] as string;
  const sheet = sc.addSheet(sys.id, wren);
  const sn = new SnapshotChanges(sc.snapshot, { now: 2, createId: next });
  const first = sn.createSnapshot(wren);
  // Carry on from the snapshot as stored, with the first one in it.
  return { sc: new SystemChanges(sn.snapshot, { now: 1, createId: next }), sys, wren, sheet, first, next };
}

const withOff = (sc: SystemChanges, id: string, off: boolean) => {
  sc.setSystemOff(id, off);
  return StoryModel.fromSnapshot(sc.snapshot);
};

describe('a system turned off', () => {
  test('the views leave it out, and turning it on brings it all back', () => {
    const { sc, sys, wren, first } = setup();
    const on = StoryModel.fromSnapshot(sc.snapshot);
    const nodes = [...on.nodes.values()];
    const cardOn = stateCard(on, first, nodes).systems.map((s) => s.name);
    expect(cardOn).toContain('Powers');
    expect(progressionSheets(on, wren, 'Wren').sheets.map((s) => s.title)).toContain('Powers');

    const off = withOff(sc, sys.id, true);
    expect(stateCard(off, first, nodes).systems.map((s) => s.name)).not.toContain('Powers');
    expect(progressionSheets(off, wren, 'Wren').sheets.map((s) => s.title)).not.toContain('Powers');
    expect(progressionSheets(off, wren, 'Wren').add?.systems.map((s) => s.id) ?? []).not.toContain(sys.id);
    expect(snapshotEditor(off, first, 'Wren').systems.map((s) => s.name)).not.toContain('Powers');
    expect(sc.snapshot.rows('systemSheets').length).toBeGreaterThan(0);

    const back = withOff(sc, sys.id, false);
    expect(stateCard(back, first, nodes).systems.map((s) => s.name)).toEqual(cardOn);
    expect(progressionSheets(back, wren, 'Wren').sheets.map((s) => s.title)).toContain('Powers');
  });

  test('the Status tab needs an on system', () => {
    const { sc, sys } = setup();
    const only = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1, createId: () => 'solo' });
    for (const s of only.systems()) only.setSystemOff(s.id, true);
    expect(hasSystems(new CastData('n', only.snapshot))).toBe(false);
    only.createSystem(content);
    expect(hasSystems(new CastData('n', only.snapshot))).toBe(true);
    sc.setSystemOff(sys.id, true);
    for (const s of sc.systems()) if (s.id !== sys.id) sc.setSystemOff(s.id, true);
    expect(hasSystems(new CastData('n', sc.snapshot))).toBe(false);
  });

  test('createSnapshot carries the previous state but makes none from the sheet', () => {
    const { sc, sys, wren, first, next } = setup();
    sc.setSystemOff(sys.id, true);
    const second = new SnapshotChanges(sc.snapshot, { now: 3, createId: next }).createSnapshot(wren);
    expect(second.systems.get(sys.id)?.raw).toEqual(first.systems.get(sys.id)!.raw);

    // Another character, with a sheet and no snapshot yet: nothing is made on the off system.
    const other = sc.snapshot.rows('loreEntries').find((r) => r['category'] === 'character' && r['id'] !== wren);
    if (other !== undefined) {
      sc.addSheet(sys.id, other['id'] as string);
      const made = new SnapshotChanges(sc.snapshot, { now: 4, createId: next }).createSnapshot(other['id'] as string);
      expect(made.systems.has(sys.id)).toBe(false);
    }
  });

  test('a new character gets no sheet on it', () => {
    const { sc, sys } = setup();
    sc.setSystemOff(sys.id, true);
    const c = new CharacterChanges(sc.snapshot, { now: 5, createId: () => 'newchar' });
    const made = c.create({ name: 'Newcomer' });
    expect(c.snapshot.rows('systemSheets').some((r) => r['systemId'] === sys.id && r['entryId'] === made.id)).toBe(false);
  });

  test('ability paths skip it; integrity says nothing of it and a merge keeps its sheets', () => {
    const { sc, sys, wren } = setup();
    const off = withOff(sc, sys.id, true);
    expect(abilityTree(off).nodes.some((n) => n.sourceKey === `system:${sys.id}`)).toBe(false);
    expect(abilityTree(StoryModel.fromSnapshot(withOffBack(sc, sys.id))).nodes.some((n) => n.sourceKey === `system:${sys.id}`)).toBe(true);
    sc.setSystemOff(sys.id, true);
    const broken = brokenReferences(StoryModel.fromSnapshot(sc.snapshot)).filter((b) => b.table === 'systemSheets' || b.table === 'systems');
    expect(broken).toEqual([]);

    // Two characters with a sheet each on the off system: merging keeps both sheets.
    const c = new CharacterChanges(sc.snapshot, { now: 6, createId: () => 'twin' });
    const twin = c.create({ name: 'Twin' });
    c.put('systemSheets', { ...sc.snapshot.rows('systemSheets').find((r) => r['systemId'] === sys.id)!, id: 'twin-sheet', entryId: twin.id });
    const merged = mergeEntries(c.snapshot, wren, twin.id, { now: 7 });
    expect(merged.rows('systemSheets').filter((r) => r['systemId'] === sys.id)).toHaveLength(2);
  });
});

function withOffBack(sc: SystemChanges, id: string): NovelSnapshot {
  sc.setSystemOff(id, false);
  return sc.snapshot;
}
