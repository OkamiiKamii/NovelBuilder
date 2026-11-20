// A system turned Off is set aside, never deleted: hidden from the model's `systems`, everything else kept.

import { str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { SystemBlueprint, isSystemOn } from '../../src/domain/records/system';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { SystemChanges, ChangeRefused } from '../../src/domain/systems/systemChanges';
import { allSystemPresets } from '../../src/domain/systems/systemPresets';
import { addSheet, deleteSystemDialog, systemSwitch, systemsOf, systemsWords, turnSystemOff, turnSystemOn } from '../../src/domain/systems/screens/systemsPage';
import { readJson, samplePath } from '../fixtures';

let ids = 0;
const changes = () => new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `off${ids++}` });
const row = (c: SystemChanges, id: string) => c.snapshot.rows('systems').find((r) => r['id'] === id)!;
const model = (c: SystemChanges) => StoryModel.fromSnapshot(c.snapshot);
const preset = allSystemPresets[0].content;

describe('turning a system off and on', () => {
  test('off writes off: true; on removes the key again', () => {
    const c = changes();
    const s = c.createSystem(preset);
    const before = { ...row(c, s.id) };
    turnSystemOff(s.id)(c);
    expect(row(c, s.id)['off']).toBe(true);
    expect(isSystemOn(row(c, s.id))).toBe(false);
    turnSystemOn(s.id)(c);
    expect('off' in row(c, s.id)).toBe(false);
    expect({ ...row(c, s.id), updatedAt: 0 }).toEqual({ ...before, updatedAt: 0 });
  });

  test('an unknown system is refused', () => {
    expect(() => changes().setSystemOff('nope', true)).toThrow(ChangeRefused);
  });

  test('anything but off: true reads as on', () => {
    expect(isSystemOn({ off: false })).toBe(true);
    expect(isSystemOn({ off: 'yes' })).toBe(true);
    expect(isSystemOn(new SystemBlueprint({ off: true }))).toBe(false);
  });

  test('off survives editing the blueprint', () => {
    const c = changes();
    const s = c.createSystem(preset);
    c.setSystemOff(s.id, true);
    c.updateSystem(s.id, () => ({ name: 'Renamed', off: false }));
    expect(row(c, s.id)['off']).toBe(true);
    expect(row(c, s.id)['name']).toBe('Renamed');
  });

  test('a new system starts on: from a preset and from the content of an off system', () => {
    const c = changes();
    expect('off' in row(c, c.createSystem(preset).id)).toBe(false);
    const a = c.createSystem(preset);
    c.setSystemOff(a.id, true);
    const copy = c.createSystem(row(c, a.id));
    expect('off' in row(c, copy.id)).toBe(false);
  });
});

describe('the model and the Systems page', () => {
  test('systems holds the on ones; allSystems and abilities hold every one', () => {
    const c = changes();
    const a = c.createSystem(preset);
    const b = c.createSystem(preset);
    c.setSystemOff(a.id, true);
    const m = model(c);
    expect([...m.systems.keys()]).toEqual([b.id]);
    expect([...m.allSystems.keys()]).toEqual([a.id, b.id]);
    expect([...m.abilities.values()].some((x) => x.system.id === a.id)).toBe(true);
    const kept = m.withEvents(m.events);
    expect([...kept.systems.keys()]).toEqual([b.id]);
    expect(kept.allSystems.size).toBe(2);
  });

  test('systemsOf lists on first, then off, each in stored order', () => {
    const c = changes();
    const [a, b, d] = [c.createSystem(preset), c.createSystem(preset), c.createSystem(preset)];
    c.setSystemOff(a.id, true);
    const list = systemsOf(model(c), null);
    expect(list.systems.map((s) => s.id)).toEqual([b.id, d.id, a.id]);
    expect(list.system!.id).toBe(b.id);
    expect(systemsOf(model(c), a.id).system!.id).toBe(a.id);
  });

  test('switch words, helpers and the delete dialog', () => {
    const c = changes();
    const s = c.createSystem(preset);
    expect(systemSwitch(s)).toMatchObject({ on: true, label: 'On' });
    c.setSystemOff(s.id, true);
    const off = c.systems().find((x) => x.id === s.id)!;
    expect(systemSwitch(off)).toMatchObject({ on: false, label: 'Off', accessibilityLabel: `${off.name} is off` });
    expect(systemsWords.turnedOff).toBe('Turned off');
    expect(deleteSystemDialog(off).message).toContain('turn the system off');
  });

  test('an off system keeps its sheets and xp', () => {
    const c = changes();
    const s = c.createSystem(preset);
    const entry = str(c.snapshot.rows('loreEntries')[0]['id']);
    const sheet = addSheet(s.id, entry)(c);
    const track = s.tracks.find((t) => t.kind === 'levels');
    if (track !== undefined) c.updateSheet(sheet.id, () => ({ xp: [{ id: 'x1', trackId: track.id, amount: 50 }] }));
    const sheetsBefore = JSON.stringify(c.snapshot.rows('systemSheets'));
    c.setSystemOff(s.id, true);
    expect(JSON.stringify(c.snapshot.rows('systemSheets'))).toBe(sheetsBefore);
    expect(model(c).sheets).toHaveLength(1);
    c.setSystemOff(s.id, false);
    expect(JSON.stringify(c.snapshot.rows('systemSheets'))).toBe(sheetsBefore);
  });
});
