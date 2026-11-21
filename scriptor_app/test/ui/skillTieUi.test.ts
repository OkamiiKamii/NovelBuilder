// The words of the skill tie on the World screens.

import { StoryModel } from '../../src/domain/model/storyModel';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { tiedAbilityId, untiedSkills } from '../../src/domain/systems/skillTies';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { allSystemPresets } from '../../src/domain/systems/systemPresets';
import { manySystems, skillChoiceLabel, tiedNameSave, tieWords, undoTie } from '../../src/ui/organize/skillTieWords';
import { readJson, samplePath } from '../fixtures';

test('a skill choice names its group, and its system only when there are several', () => {
  let n = 0;
  const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `st${n++}` });
  const s = c.createSystem(allSystemPresets[0].content);
  const skills = untiedSkills(StoryModel.fromSnapshot(c.snapshot)).filter((a) => a.system.id === s.id);
  if (skills.length > 0) {
    expect(skillChoiceLabel(skills[0]!, false)).toBe(`${skills[0]!.item.name} · ${skills[0]!.group}`);
    expect(skillChoiceLabel(skills[0]!, true).endsWith(s.name)).toBe(true);
  }
  expect(manySystems(skills)).toBe(false);
});

test('the untie message says what stays', () => {
  expect(tieWords.untieMessage('Fireball', 'Fireball', 'The Job')).toBe('Fireball stays in World and Fireball stays in The Job; only the tie goes.');
});

describe('names and undo', () => {
  const setup = () => {
    let n = 0;
    const c = new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `nu${n++}` });
    const s = c.createSystem(allSystemPresets.find((p) => p.id === 'leveling-job')!.content);
    const group = s.groupList.find((g) => g.name === 'Skills')!.id;
    c.updateSystem(s.id, (cur) => ({ items: [...cur.items.map((i) => i.raw), { id: 'dash', groupId: group, name: 'Dash' }] }));
    const entryId = c.snapshot.rows('loreEntries')[0]!['id'] as string;
    const entry = () => StoryModel.fromSnapshot(c.snapshot).entries.get(entryId)!;
    return { c, s, entryId, entry };
  };

  test('a tied entry is renamed with its skill; an untied one and a blank name are left to the usual path', () => {
    const { c, s, entryId, entry } = setup();
    expect(tiedNameSave(entry(), 'Sprint')).toBeNull();
    c.tieSkill(entryId, `${s.id}/dash`);
    expect(tiedNameSave(entry(), '  ')).toBeNull();
    tiedNameSave(entry(), 'Sprint')!(c);
    expect(entry().name).toBe('Sprint');
    expect(StoryModel.fromSnapshot(c.snapshot).abilities.get(`${s.id}/dash`)!.item.name).toBe('Sprint');
  });

  test('undoing a tie gives the entry its old name back and leaves the skill as it is', () => {
    const { c, s, entryId, entry } = setup();
    const old = entry().name;
    c.tieSkill(entryId, `${s.id}/dash`);
    expect(entry().name).toBe('Dash');
    undoTie(entryId, old)(c);
    expect(entry().name).toBe(old);
    expect(tiedAbilityId(entry())).toBeNull();
    expect(StoryModel.fromSnapshot(c.snapshot).abilities.get(`${s.id}/dash`)!.item.name).toBe('Dash');
  });
});
