// A World entry tied to a skill of a system: the tie lives on the entry row; names stay together; deleting either side
// drops only the tie.

import { StoryModel } from '../../src/domain/model/storyModel';
import { Category, builtinCategoryKeys, resolveCategories } from '../../src/domain/records/category';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { type JsonMap } from '../../src/domain/json';
import { maps } from '../../src/domain/records/jsonRecord';
import { SystemChanges } from '../../src/domain/systems/systemChanges';
import { entryForAbility, isJobSystem, jobSystems, skillKindKey, skillTieOf, tiedAbilityId, untiedSkills } from '../../src/domain/systems/skillTies';
import { allSystemPresets, levelingJobPreset } from '../../src/domain/systems/systemPresets';
import { readJson, samplePath } from '../fixtures';

let ids = 0;
const changes = () => new SystemChanges(NovelSnapshot.fromJson(readJson(samplePath)), { now: 1700000000000, createId: () => `st${ids++}` });
const model = (c: SystemChanges) => StoryModel.fromSnapshot(c.snapshot);
const entryRow = (c: SystemChanges, id: string) => c.snapshot.rows('loreEntries').find((r) => r['id'] === id)!;
const entryOf = (c: SystemChanges, category = 'character') => c.snapshot.rows('loreEntries').find((r) => r['category'] === category)!['id'] as string;
const textOf = (v: unknown) => String(v);

/** The Leveling Job with Super Strength (rank S, multiplies Strength by its rank's power) and Dash. */
function withJob(c: SystemChanges) {
  const sys = c.createSystem(levelingJobPreset.content);
  const skills = maps(sys.raw['groups']).find((g) => g['name'] === 'Skills')!['id'];
  c.updateSystem(sys.id, (cur) => ({
    items: [
      ...maps(cur.raw['items']),
      { id: 'super', groupId: skills, name: 'Super Strength', rankId: 'r-s', modifiers: [{ id: 'm1', target: 'strength', op: 'multiply', value: '', byRank: true }], costs: [{ id: 'c1', target: 'health', amount: '5' }], cooldown: '1 hour' },
      { id: 'dash', groupId: skills, name: 'Dash' },
    ],
  }));
  return { sys, super: `${sys.id}/super`, dash: `${sys.id}/dash` };
}

describe('the Skills built-in', () => {
  test('is the eleventh, between Powers and Rules, with its three suggested fields', () => {
    expect(builtinCategoryKeys).toHaveLength(11);
    const all = resolveCategories([]);
    const keys = all.map((c) => c.key);
    expect(keys.indexOf('skill')).toBe(keys.indexOf('power') + 1);
    const skill = all.find((c) => c.key === 'skill')!;
    expect([skill.name, skill.singular]).toEqual(['Skills', 'Skill']);
    expect(skill.fields.map((f) => [f.name, f.type])).toEqual([['Effect', 'longtext'], ['Limits', 'longtext'], ['First appears', 'text']]);
    expect(new Set(all.map((c) => c.color)).size).toBe(all.length);
  });

  test('a module’s "Skills & Abilities" stands in for it, unless entries are filed under the built-in', () => {
    const own = new Category({ key: 'custom-sa', name: 'Skills & Abilities', singular: 'Skill', color: '#111111', builtin: false, order: 20, fields: [] });
    const shown = resolveCategories([own]);
    expect(shown.some((c) => c.key === 'skill')).toBe(false);
    expect(skillKindKey(shown)).toBe('custom-sa');
    expect(skillKindKey(resolveCategories([own], ['skill']))).toBe('skill');
    expect(skillKindKey(resolveCategories([]))).toBe('skill');
  });
});

describe('tying', () => {
  test('tie, read from both sides, and untie (the key is removed)', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    expect(entryRow(c, e)['ability']).toBe(j.super);
    expect(entryRow(c, e)['name']).toBe('Super Strength');
    const m = model(c);
    expect(tiedAbilityId(m.entries.get(e)!)).toBe(j.super);
    expect(entryForAbility(m, j.super)!.id).toBe(e);
    expect(entryForAbility(m, j.dash)).toBeNull();
    expect(skillTieOf(m, e)!.item.name).toBe('Super Strength');
    c.untieSkill(e);
    expect('ability' in entryRow(c, e)).toBe(false);
    expect(skillTieOf(model(c), e)).toBeNull();
  });

  test('a second tie to the same skill is refused; an unknown skill or entry too', () => {
    const c = changes();
    const j = withJob(c);
    const [a, b] = c.snapshot.rows('loreEntries').map((r) => r['id'] as string);
    c.tieSkill(a, j.super);
    expect(() => c.tieSkill(b, j.super)).toThrow(ChangeRefused);
    expect(() => c.tieSkill(a, j.super)).not.toThrow();
    expect(() => c.tieSkill(a, 'x/y')).toThrow(ChangeRefused);
    expect(() => c.tieSkill('nope', j.dash)).toThrow(ChangeRefused);
  });

  test('an Off system: not tieable; an existing tie is kept but shows nothing', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    c.setSystemOff(j.sys.id, true);
    expect(entryRow(c, e)['ability']).toBe(j.super);
    expect(skillTieOf(model(c), e)).toBeNull();
    expect(() => c.tieSkill(entryOf(c, 'location'), j.dash)).toThrow(ChangeRefused);
    c.setSystemOff(j.sys.id, false);
    expect(skillTieOf(model(c), e)).not.toBeNull();
  });

  test('a dangling tie reads as untied', () => {
    const c = changes();
    const e = entryOf(c);
    c.put('loreEntries', { ...entryRow(c, e), ability: 'gone/gone' });
    expect(skillTieOf(model(c), e)).toBeNull();
  });
});

describe('names stay together', () => {
  test('renaming the skill in the system renames the entry', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    c.updateSystem(j.sys.id, (cur) => ({ items: maps(cur.raw['items']).map((i) => (i['id'] === 'super' ? { ...i, name: 'Titan Might' } : i)) }));
    expect(entryRow(c, e)['name']).toBe('Titan Might');
  });

  test('renameTiedSkill renames both; blank is refused; untied renames the entry only', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    c.renameTiedSkill(e, '  Colossus ');
    expect(entryRow(c, e)['name']).toBe('Colossus');
    expect(model(c).abilities.get(j.super)!.item.name).toBe('Colossus');
    expect(() => c.renameTiedSkill(e, '  ')).toThrow(ChangeRefused);
    c.untieSkill(e);
    c.renameTiedSkill(e, 'Plain');
    expect(entryRow(c, e)['name']).toBe('Plain');
    expect(model(c).abilities.get(j.super)!.item.name).toBe('Colossus');
  });
});

describe('deleting either side keeps the other', () => {
  test('a skill taken out drops the tie and keeps the entry', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    c.updateSystem(j.sys.id, (cur) => ({ items: maps(cur.raw['items']).filter((i) => i['id'] !== 'super') }));
    expect('ability' in entryRow(c, e)).toBe(false);
    expect(entryRow(c, e)['name']).toBe('Super Strength');
  });

  test('a system removed drops its ties and keeps the entries', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.dash);
    c.removeSystem(j.sys.id);
    expect(entryRow(c, e)).toBeDefined();
    expect('ability' in entryRow(c, e)).toBe(false);
  });

  test('an entry removed leaves the skill in the system', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    c.remove('loreEntries', e);
    expect(model(c).abilities.has(j.super)).toBe(true);
    expect(entryForAbility(model(c), j.super)).toBeNull();
  });
});

describe('Log in World', () => {
  test('makes an entry under the Skills kind, tied; a second call returns the same one', () => {
    const c = changes();
    const j = withJob(c);
    const made = c.logInWorld(j.dash);
    expect([made.category, made.name, tiedAbilityId(made)]).toEqual(['skill', 'Dash', j.dash]);
    expect(entryRow(c, made.id)['ability']).toBe(j.dash);
    const before = c.snapshot.rows('loreEntries').length;
    expect(c.logInWorld(j.dash).id).toBe(made.id);
    expect(c.snapshot.rows('loreEntries')).toHaveLength(before);
  });

  test('files under the category that stands in for Skills', () => {
    const c = changes();
    const j = withJob(c);
    c.put('loreSchemas', { id: 'sa', projectId: c.projectId, key: 'custom-sa', name: 'Skills & Abilities', singular: 'Skill', color: '#111111', builtin: false, order: 20, fields: [] });
    expect(c.logInWorld(j.dash).category).toBe('custom-sa');
  });

  test('an Off system or unknown skill is refused', () => {
    const c = changes();
    const j = withJob(c);
    c.setSystemOff(j.sys.id, true);
    expect(() => c.logInWorld(j.dash)).toThrow(ChangeRefused);
    expect(() => c.logInWorld('x/y')).toThrow(ChangeRefused);
  });
});

describe('Log in System', () => {
  const skillItems = (c: SystemChanges, id: string) => maps(c.snapshot.rows('systems').find((r) => r['id'] === id)!['items']);

  test('the Leveling Job keeps its preset stamp through a copy', () => {
    const c = changes();
    const j = withJob(c);
    expect(c.snapshot.rows('systems').find((r) => r['id'] === j.sys.id)!['preset']).toBe('leveling-job');
    expect(isJobSystem(j.sys)).toBe(true);
    expect(isJobSystem(c.createSystem(allSystemPresets[0].content))).toBe(false);
  });

  test('adds a tied skill to The Job’s Skills group, named for the entry', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c, 'location');
    const id = c.logInSystem(e);
    expect(id.startsWith(`${j.sys.id}/`)).toBe(true);
    const item = skillItems(c, j.sys.id).find((i) => `${j.sys.id}/${i['id']}` === id)!;
    expect(item['name']).toBe(entryRow(c, e)['name']);
    expect(maps(c.snapshot.rows('systems').find((r) => r['id'] === j.sys.id)!['groups']).find((g) => g['id'] === item['groupId'])!['name']).toBe('Skills');
    expect(skillTieOf(model(c), e)!.system.id).toBe(j.sys.id);
    expect(() => c.logInSystem(e)).toThrow(ChangeRefused);
  });

  test('older copies: a system named "The Job" with a Skills group, no stamp', () => {
    const c = changes();
    const stripped: JsonMap = { ...levelingJobPreset.content };
    delete stripped['preset'];
    const old = c.createSystem({ ...stripped, name: ' the job ' });
    expect(old.raw['preset']).toBeUndefined();
    expect(isJobSystem(old)).toBe(true);
    expect(isJobSystem(c.createSystem({ ...stripped, name: 'Other' }))).toBe(false);
    expect(jobSystems(model(c)).map((s) => s.id)).toEqual([old.id]);
    expect(c.logInSystem(entryOf(c)).startsWith(`${old.id}/`)).toBe(true);
  });

  test('refused when no Job system is on, for a non-Job system, an Off Job, or a Job without a Skills group', () => {
    const c = changes();
    const e = entryOf(c);
    const other = c.createSystem(allSystemPresets[0].content);
    expect(() => c.logInSystem(e)).toThrow(ChangeRefused);
    expect(() => c.logInSystem(e, other.id)).toThrow(ChangeRefused);
    const j = withJob(c);
    c.setSystemOff(j.sys.id, true);
    expect(() => c.logInSystem(e)).toThrow(ChangeRefused);
    expect(() => c.logInSystem(e, j.sys.id)).toThrow(ChangeRefused);
    c.setSystemOff(j.sys.id, false);
    c.updateSystem(j.sys.id, () => ({ groups: [{ id: 'only', name: 'Job', single: true }], items: [] }));
    expect(() => c.logInSystem(e, j.sys.id)).toThrow(ChangeRefused);
  });
});

describe('what a skill shows from the system', () => {
  test('boosts, cost, cooldown, rank; holders skip switched-off skills', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.super);
    const [a, b] = c.snapshot.rows('loreEntries').filter((r) => r['category'] === 'character').map((r) => r['id'] as string);
    const sheetA = c.addSheet(j.sys.id, a);
    const sheetB = c.addSheet(j.sys.id, b);
    c.updateSheet(sheetA.id, () => ({ itemIds: ['super'] }));
    c.updateSheet(sheetB.id, () => ({ itemIds: ['super'] }));
    c.setItemOff(sheetB.id, 'super', true);
    const tie = skillTieOf(model(c), e)!;
    expect(tie.boosts).toEqual(['Strength ×20 at rank S']);
    expect(tie.rank).toBe('S');
    expect(tie.group).toBe('Skills');
    expect(tie.cost).toEqual(['5 Health']);
    expect(tie.cooldown).toBe('1 hour');
    expect(tie.holders).toEqual([{ entryId: a, name: textOf(entryRow(c, a)['name']) }]);
    expect(tie.abilityId).toBe(j.super);
  });

  test('a skill with no boosts has none; a rank without power gives no line', () => {
    const c = changes();
    const j = withJob(c);
    const e = entryOf(c);
    c.tieSkill(e, j.dash);
    const tie = skillTieOf(model(c), e)!;
    expect([tie.boosts, tie.cost, tie.rank, tie.holders]).toEqual([[], [], null, []]);
  });
});

describe('untiedSkills', () => {
  test('lists On systems’ skills not tied, in system, group and item order', () => {
    const c = changes();
    const a = withJob(c);
    const off = withJob(c);
    c.setSystemOff(off.sys.id, true);
    c.tieSkill(entryOf(c), a.super);
    const names = untiedSkills(model(c)).map((r) => [r.system.id, r.item.name]);
    expect(names).toEqual([[a.sys.id, 'Dash']]);
  });
});

describe('review fixes', () => {
  test('a job (one-at-a-time group) is not offered or tied as a skill', () => {
    const c = changes();
    const j = withJob(c);
    const jobGroup = maps(j.sys.raw['groups']).find((g) => g['name'] === 'Job')!['id'];
    c.updateSystem(j.sys.id, (cur) => ({ items: [...maps(cur.raw['items']), { id: 'warrior', groupId: jobGroup, name: 'Warrior' }] }));
    expect(untiedSkills(model(c)).some((a) => a.item.id === 'warrior')).toBe(false);
    expect(() => c.tieSkill(entryOf(c), `${j.sys.id}/warrior`)).toThrow(ChangeRefused);
    expect(() => c.logInWorld(`${j.sys.id}/warrior`)).toThrow(ChangeRefused);
  });

  test('a Job without its Skills group is not offered for Log in System', () => {
    const c = changes();
    const j = withJob(c);
    expect(jobSystems(model(c)).map((s) => s.id)).toContain(j.sys.id);
    c.updateSystem(j.sys.id, (cur) => ({ groups: maps(cur.raw['groups']).filter((g) => g['name'] !== 'Skills') }));
    expect(jobSystems(model(c)).map((s) => s.id)).not.toContain(j.sys.id);
  });

  test('an archived built-in Skills gives way to the module’s type', () => {
    const own = new Category({ key: 'custom-sa', name: 'Skills & Abilities', singular: 'Skill', color: '#111111', builtin: false, order: 20, fields: [] });
    const archived = new Category({ ...Category.builtin('skill').raw, archived: true });
    expect(skillKindKey(resolveCategories([archived, own]))).toBe('custom-sa');
  });
});
