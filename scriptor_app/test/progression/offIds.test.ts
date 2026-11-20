// A snapshot keeps which held items were switched off, through clean, create, resolve and the change.

import { SnapshotChanges, SnapshotSystem, resolveSystem } from '../../src/domain/progression/snapshots';
import { SystemBlueprint } from '../../src/domain/records/system';
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
  const sc = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1, createId: next });
  const sys = sc.createSystem(content);
  const itemId = sc.systems()[0].items[0].id;
  const wren = sc.snapshot.rows('loreEntries')[0]['id'] as string;
  const sheet = sc.addSheet(sys.id, wren);
  sc.updateSheet(sheet.id, () => ({ itemIds: [itemId] }));
  return { sc, sys, itemId, wren, sheet, next };
}

const hasOff = (s: { raw: Record<string, unknown> }, systemId: string): boolean => 'offIds' in (s.raw['systems'] as Record<string, object>)[systemId];

describe('snapshots keep what is switched off', () => {
  test('an old snapshot system without offIds reads as none; resolve skips an off item but lists it', () => {
    const b = new SystemBlueprint({ id: 's', ...content });
    expect(new SnapshotSystem({}).offIds).toEqual([]);
    expect(resolveSystem(b, new SnapshotSystem({ itemIds: ['iron'] })).rows[0].value).toBe(15);
    const off = resolveSystem(b, new SnapshotSystem({ itemIds: ['iron'], offIds: ['iron'] }));
    expect(off.rows[0].value).toBe(10);
    expect(off.items.map((i) => [i.item.name, i.off])).toEqual([['Iron Skin', true]]);
  });

  test('createSnapshot copies it from the sheet, setItemOff changes one snapshot, clean keeps it', () => {
    const { sc, sys, itemId, wren, sheet, next } = setup();
    sc.setItemOff(sheet.id, itemId, true);
    const sn = new SnapshotChanges(sc.snapshot, { now: 2, createId: next });
    const first = sn.createSnapshot(wren);
    expect(first.systems.get(sys.id)!.offIds).toEqual([itemId]);
    // The next snapshot starts from the previous one.
    const second = sn.createSnapshot(wren);
    expect(second.systems.get(sys.id)!.offIds).toEqual([itemId]);
    sn.setItemOff(second.id, sys.id, itemId, false);
    const after = sn.snapshots();
    const again = after.find((s) => s.id === second.id)!;
    expect(again.systems.get(sys.id)!.offIds).toEqual([]);
    expect(hasOff(again, sys.id)).toBe(false);
    expect(after.find((s) => s.id === first.id)!.systems.get(sys.id)!.offIds).toEqual([itemId]);
    // An unrelated edit keeps it through clean.
    sn.updateSnapshot(first.id, () => ({ label: 'Later' }));
    expect(sn.snapshots().find((s) => s.id === first.id)!.systems.get(sys.id)!.offIds).toEqual([itemId]);
  });

  test('with nothing off, a created snapshot has no offIds field (as before)', () => {
    const { sc, sys, wren, next } = setup();
    const snap = new SnapshotChanges(sc.snapshot, { now: 2, createId: next }).createSnapshot(wren);
    expect(hasOff(snap, sys.id)).toBe(false);
  });

  test('a skill let go and given back comes back on, on the sheet and in a snapshot', () => {
    const { sc, sys, itemId, wren, sheet, next } = setup();
    sc.setItemOff(sheet.id, itemId, true);
    sc.updateSheet(sheet.id, (c) => ({ itemIds: c.itemIds.filter((id) => id !== itemId) }));
    sc.updateSheet(sheet.id, (c) => ({ itemIds: [...c.itemIds, itemId] }));
    expect(sc.snapshot.rows('systemSheets').find((r) => r['id'] === sheet.id)!['offIds']).toBeUndefined();
    sc.setItemOff(sheet.id, itemId, true);
    const sn = new SnapshotChanges(sc.snapshot, { now: 2, createId: next });
    const snap = sn.createSnapshot(wren);
    const edit = (ids: string[]) => sn.updateSnapshot(snap.id, (cur) => ({ systems: { [sys.id]: { ...cur.systems.get(sys.id)!.raw, itemIds: ids } } }));
    edit([]);
    edit([itemId]);
    expect(sn.snapshots().find((s) => s.id === snap.id)!.systems.get(sys.id)!.offIds).toEqual([]);
  });

  test('a snapshot row carries how a boosted value came out; by hand, none', () => {
    const b = new SystemBlueprint({ id: 's', ...content });
    expect(resolveSystem(b, new SnapshotSystem({ itemIds: ['iron'] })).rows[0].breakdown).toContain('5');
    expect(resolveSystem(b, new SnapshotSystem({ itemIds: ['iron'], overrides: { str: 99 } })).rows[0].breakdown).toBeNull();
  });
});

test('a skill a stage gives (not in itemIds) can be switched off on a sheet and in a snapshot', () => {
  let n = 0;
  const next = () => `g${n++}`;
  const sc = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1, createId: next });
  const sys = sc.createSystem({
    ...content,
    tracks: [{ id: 't', name: 'Tier', key: 'tier', kind: 'stages', stages: [{ id: 'st1', name: 'First', grants: ['iron'] }] }],
  });
  const itemId = sc.systems()[0].items[0].id;
  const granted = sc.systems()[0].tracks[0].stages[0].grants;
  expect(granted).toEqual([itemId]);
  const wren = sc.snapshot.rows('loreEntries')[0]['id'] as string;
  const sheet = sc.addSheet(sys.id, wren);
  sc.setItemOff(sheet.id, itemId, true);
  expect(sc.sheets().find((s) => s.id === sheet.id)!.offIds).toEqual([itemId]);
  const sn = new SnapshotChanges(sc.snapshot, { now: 2, createId: next });
  const snap = sn.createSnapshot(wren);
  expect(snap.systems.get(sys.id)!.offIds).toEqual([itemId]);
  sn.updateSnapshot(snap.id, () => ({ label: 'Later' }));
  expect(sn.snapshots().find((s) => s.id === snap.id)!.systems.get(sys.id)!.offIds).toEqual([itemId]);
});

test('a stage grant switched off comes back on once its stage is left and reached again', () => {
  let n = 0;
  const next = () => `r${n++}`;
  const sc = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1, createId: next });
  const sys = sc.createSystem({
    ...content,
    tracks: [
      { id: 't', name: 'Tier', key: 'tier', kind: 'stages', stages: [{ id: 'st1', name: 'First' }, { id: 'st2', name: 'Second', grants: ['iron'] }] },
    ],
  });
  const blueprint = sc.systems()[0];
  const itemId = blueprint.items[0].id;
  const [first, second] = blueprint.tracks[0].stages.map((s) => s.id);
  const trackId = blueprint.tracks[0].id;
  const wren = sc.snapshot.rows('loreEntries')[0]['id'] as string;
  const sheet = sc.addSheet(sys.id, wren);
  const offIds = () => sc.sheets().find((s) => s.id === sheet.id)!.offIds;
  sc.updateSheet(sheet.id, () => ({ progress: { [trackId]: second } }));
  sc.setItemOff(sheet.id, itemId, true);
  expect(offIds()).toEqual([itemId]);
  sc.updateSheet(sheet.id, () => ({ progress: { [trackId]: first } }));
  expect(offIds()).toEqual([]);
  sc.updateSheet(sheet.id, () => ({ progress: { [trackId]: second } }));
  expect(offIds()).toEqual([]);
});

test('in a snapshot too, a stage grant switched off is let go when its stage is left', () => {
  let n = 0;
  const next = () => `q${n++}`;
  const sc = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1, createId: next });
  const sys = sc.createSystem({
    ...content,
    tracks: [
      { id: 't', name: 'Tier', key: 'tier', kind: 'stages', stages: [{ id: 'st1', name: 'First' }, { id: 'st2', name: 'Second', grants: ['iron'] }] },
    ],
  });
  const blueprint = sc.systems()[0];
  const itemId = blueprint.items[0].id;
  const [first, second] = blueprint.tracks[0].stages.map((s) => s.id);
  const trackId = blueprint.tracks[0].id;
  const wren = sc.snapshot.rows('loreEntries')[0]['id'] as string;
  const sheet = sc.addSheet(sys.id, wren);
  sc.updateSheet(sheet.id, () => ({ progress: { [trackId]: second } }));
  const sn = new SnapshotChanges(sc.snapshot, { now: 2, createId: next });
  const snap = sn.createSnapshot(wren);
  sn.setItemOff(snap.id, sys.id, itemId, true);
  const offOf = () => sn.snapshots().find((s) => s.id === snap.id)!.systems.get(sys.id)!.offIds;
  expect(offOf()).toEqual([itemId]);
  const systemsWith = (stage: string) => (cur: { raw: Record<string, unknown> }) => {
    const systems = cur.raw['systems'] as Record<string, Record<string, unknown>>;
    return { systems: { ...systems, [sys.id]: { ...systems[sys.id], progress: { [trackId]: stage } } } };
  };
  sn.updateSnapshot(snap.id, systemsWith(first));
  expect(offOf()).toEqual([]);
});
