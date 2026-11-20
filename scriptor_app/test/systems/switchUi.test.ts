// The words the On | Off control and the chips use, and the Progression tab when every system is off.

import { StoryModel } from '../../src/domain/model/storyModel';
import { progressionSheets } from '../../src/domain/progression/screens/progressionTab';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { allSystemPresets } from '../../src/domain/systems/systemPresets';
import { switchedToast, systemChipLabel, systemsOf } from '../../src/domain/systems/screens/systemsPage';
import { readJson, samplePath } from '../fixtures';

let ids = 0;
const changes = () => new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `sw${ids++}` });
const model = (c: SystemChanges) => StoryModel.fromSnapshot(c.snapshot);

test('chip label and toast', () => {
  const c = changes();
  const s = c.createSystem(allSystemPresets[0].content);
  expect(systemChipLabel(systemsOf(model(c), null).system!)).toBe(s.name);
  c.setSystemOff(s.id, true);
  expect(systemChipLabel(systemsOf(model(c), null).system!)).toBe(`${s.name} (off)`);
  expect(switchedToast('The Job', false)).toBe('“The Job” turned off.');
  expect(switchedToast('The Job', true)).toBe('“The Job” turned on.');
});

test('Progression says nothing about systems when all are off, and "no blueprints" only when there are none', () => {
  const c = changes();
  const some = model(c).entries.keys().next().value as string;
  for (const s of c.systems()) c.setSystemOff(s.id, true);
  const none = progressionSheets(model(c), some, 'X');
  const had = c.systems().length > 0;
  const s = c.createSystem(allSystemPresets[0].content);
  c.setSystemOff(s.id, true);
  const off = progressionSheets(model(c), some, 'X');
  expect(off.allOff).toBe(true);
  expect(off.none).toBeNull();
  c.setSystemOff(s.id, false);
  const on = progressionSheets(model(c), some, 'X');
  expect(on.allOff).toBe(false);
  expect(on.none).toBeNull();
  expect(had ? none.allOff : none.none !== null).toBe(true);
});
