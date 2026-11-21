// Power entries named like a system skill are offered "Move to Skills and tie"; skills that can be logged in World.

import { ChangeRefused, CodexChanges } from '../../src/domain/codex/codexChanges';
import { StoryModel } from '../../src/domain/model/storyModel';
import { maps } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { loggable, skillsToSort, tiedAbilityId } from '../../src/domain/systems/skillTies';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { levelingJobPreset } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

let ids = 0;
const changes = () => new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `ss${ids++}` });
const model = (c: SystemChanges) => StoryModel.fromSnapshot(c.snapshot);
const row = (c: SystemChanges, id: string) => c.snapshot.rows('loreEntries').find((r) => r['id'] === id)!;
const system = (c: SystemChanges, id: string) => c.systems().find((s) => s.id === id)!;

function setup() {
  const c = changes();
  const sys = c.createSystem(levelingJobPreset.content);
  const skills = maps(sys.raw['groups']).find((g) => g['name'] === 'Skills')!['id'];
  c.updateSystem(sys.id, (cur) => ({ items: [...maps(cur.raw['items']), { id: 'dash', groupId: skills, name: 'Dash' }, { id: 'blink', groupId: skills, name: 'Blink' }] }));
  const power = (id: string, name: string, extra = {}) =>
    c.put('loreEntries', { id, projectId: c.projectId, category: 'power', name, fields: [], createdAt: 1, updatedAt: 1, ...extra });
  return { c, sys, dash: `${sys.id}/dash`, blink: `${sys.id}/blink`, power };
}

describe('loggable', () => {
  test('a skill of an On system is; an item of a one-at-a-time group is not; an Off system is not', () => {
    const { c, sys } = setup();
    const item = (id: string) => system(c, sys.id).items.find((i) => i.id === id)!;
    expect(loggable(system(c, sys.id), item('dash'))).toBe(true);
    c.updateSystem(sys.id, (cur) => ({
      groups: maps(cur.raw['groups']).map((g) => (g['name'] === 'Skills' ? { ...g, single: true } : g)),
    }));
    expect(loggable(system(c, sys.id), item('dash'))).toBe(false);
    c.updateSystem(sys.id, (cur) => ({
      groups: maps(cur.raw['groups']).map((g) => (g['name'] === 'Skills' ? { ...g, single: false } : g)),
    }));
    expect(loggable(system(c, sys.id), item('dash'))).toBe(true);
    c.setSystemOff(sys.id, true);
    expect(loggable(system(c, sys.id), item('dash'))).toBe(false);
  });
});

describe('skillsToSort', () => {
  test('matches by name ignoring case and space; sorted by name; labels', () => {
    const { c, dash, blink, power } = setup();
    power('p1', 'dASH  ');
    power('p2', 'Blink');
    power('p3', 'Unrelated');
    const items = skillsToSort(model(c));
    expect(items.map((i) => [i.entry.id, i.abilityId])).toEqual([['p2', blink], ['p1', dash]]);
    expect(items[0].to.key).toBe('skill');
    expect(items[0].choices).toEqual([
      { action: 'keep', label: 'Keep as Power' },
      { action: 'move', label: 'Move to Skills and tie' },
    ]);
    expect(items[0].ability.item.name).toBe('Blink');
  });

  test('tied and skillSorted are excluded; a typeSorted Power is still offered', () => {
    const { c, power, dash } = setup();
    power('p1', 'Dash', { typeSorted: true });
    power('p2', 'Blink', { skillSorted: true });
    expect(skillsToSort(model(c)).map((i) => i.entry.id)).toEqual(['p1']);
    c.tieSkill('p1', dash);
    expect(skillsToSort(model(c))).toEqual([]);
  });

  test('a skill of an Off system, a non-power entry, and an empty book offer nothing', () => {
    const { c, sys, power } = setup();
    power('p1', 'Dash');
    c.put('loreEntries', { ...row(c, 'p1'), id: 'ch', category: 'character', name: 'Blink' });
    expect(skillsToSort(model(c)).map((i) => i.entry.id)).toEqual(['p1']);
    c.setSystemOff(sys.id, true);
    expect(skillsToSort(model(c))).toEqual([]);
    expect(skillsToSort(model(changes()))).toEqual([]);
  });

  test('one skill is not offered to two entries', () => {
    const { c, power, dash } = setup();
    power('a', 'Dash');
    power('b', 'dash');
    const items = skillsToSort(model(c));
    expect(items).toHaveLength(1);
    expect(items[0].abilityId).toBe(dash);
  });
});

describe('keep', () => {
  test('keepAsPower writes only skillSorted; keepRestAsPowers does every one', () => {
    const { c, power } = setup();
    power('a', 'Dash');
    power('b', 'Blink');
    const before = row(c, 'a');
    c.keepAsPower('a');
    expect(row(c, 'a')).toEqual({ ...before, skillSorted: true, updatedAt: 1700000000000 });
    expect(skillsToSort(model(c)).map((i) => i.entry.id)).toEqual(['b']);
    c.keepRestAsPowers(['a', 'b']);
    expect(row(c, 'b')['skillSorted']).toBe(true);
    expect(row(c, 'b')['category']).toBe('power');
    expect(skillsToSort(model(c))).toEqual([]);
    expect(() => c.keepAsPower('nope')).toThrow(ChangeRefused);
  });
});

describe('moveToSkillAndTie', () => {
  test('becomes a Skill, keeps values by name or as own fields, ties, takes the skill name', () => {
    const { c, power, dash } = setup();
    power('p', 'dash ');
    const codex = new CodexChanges(c.snapshot, { now: 1, createId: () => `cx${ids++}` });
    codex.setOwnFields('p', [
      { key: 'Effect', value: 'Short burst of speed' },
      { key: 'Mood', value: 'swift' },
    ]);
    c.snapshot = codex.snapshot;
    c.moveToSkillAndTie('p', dash);
    const r = row(c, 'p');
    expect([r['category'], r['skillSorted'], r['ability'], r['name']]).toEqual(['skill', true, dash, 'Dash']);
    expect(r['typeSorted']).toBeUndefined();
    const e = model(c).entries.get('p')!;
    expect(e.fields.map((f) => f.value).sort()).toEqual(['Short burst of speed', 'swift']);
    expect(e.fields.find((f) => f.value === 'Short burst of speed')!.defId).not.toBeNull();
    expect(e.fields.find((f) => f.value === 'swift')!.defId).toBeNull();
    expect(tiedAbilityId(e)).toBe(dash);
    expect(skillsToSort(model(c))).toEqual([]);
  });

  test('refused: Off system, missing skill, already tied, missing entry; nothing changes', () => {
    const { c, sys, power, dash, blink } = setup();
    power('p', 'Dash');
    power('q', 'Other');
    c.tieSkill('q', blink);
    const before = JSON.stringify(row(c, 'p'));
    expect(() => c.moveToSkillAndTie('p', blink)).toThrow(ChangeRefused);
    expect(() => c.moveToSkillAndTie('p', 'x/y')).toThrow(ChangeRefused);
    expect(() => c.moveToSkillAndTie('nope', dash)).toThrow(ChangeRefused);
    c.setSystemOff(sys.id, true);
    expect(() => c.moveToSkillAndTie('p', dash)).toThrow(ChangeRefused);
    expect(JSON.stringify(row(c, 'p'))).toBe(before);
  });
});
