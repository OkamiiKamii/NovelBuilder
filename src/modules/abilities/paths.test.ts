import { describe, expect, it } from 'vitest';
import type { CategorySchema, LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel } from '@/modules/model/model';
import type { ProgressCategory, ProgressChange } from '@/modules/progression/track';
import type { ProgressSnapshot } from '@/modules/progression/types';
import type { SysItem, SystemBlueprint, SystemSheet } from '@/modules/systems/types';
import { abilityTree, pathProblems, pathsOf, treeLayout, type AbilityTree } from './paths';

const entry = (id: string, name: string, category: string, fields: LoreEntry['fields'] = []): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes: '', tags: [], fields, createdAt: 0, updatedAt: 0 });
const link = (id: string, fromId: string, toId: string, type: string, ends: Partial<Pick<LoreLink, 'fromType' | 'toType'>> = {}): LoreLink => ({ id, projectId: 'p', fromId, toId, fromLabel: '', toLabel: '', createdAt: 0, type, ...ends });
const ab = { fromType: 'ability' as const, toType: 'ability' as const };
const item = (id: string, name: string, groupId: string, more: Partial<SysItem> = {}): SysItem => ({ id, groupId, name, description: '', parentId: null, rankId: null, requires: '', modifiers: [], costs: [], cooldown: '', affinity: '', evolution: '', ...more });
const system = (id: string, name: string, more: Partial<SystemBlueprint>): SystemBlueprint => ({ id, projectId: 'p', name, description: '', variables: [], tracks: [], ranks: [], groups: [], items: [], matrices: [], createdAt: 0, updatedAt: 0, ...more });
const node = (id: string, title: string, order: number): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, mentions: [], createdAt: 0, updatedAt: 0 });

/**
 * Two blueprints that have nothing to do with each other (Ember Arts: skills; Court Ranks: classes), a kind of the
 * author's own set to show in the tree (Techniques, ranked by Grade), and two items that are not abilities at all but
 * are joined by an upgrade. Mira and Orrin hold some of it, on a sheet, in snapshots, or by their progression.
 */
function world(extraLinks: LoreLink[] = []) {
  const ember = system('ember', 'Ember Arts', {
    variables: [{ id: 'v', name: 'Mana', key: 'mana', kind: 'resource', unit: '', base: 10, formula: '', options: [], note: '' }],
    ranks: [{ id: 'r1', name: 'Novice' }, { id: 'r2', name: 'Adept' }],
    groups: [{ id: 'g', name: 'Skills', single: false }],
    items: [
      item('spark', 'Spark', 'g', { rankId: 'r1' }),
      item('lance', 'Fire Lance', 'g', { parentId: 'spark', costs: [{ id: 'c', target: 'mana', amount: '5' }], cooldown: '1 turn' }),
      item('wall', 'Flame Wall', 'g', { requires: 'Skill: Fire Lance' }),
      item('nova', 'Nova', 'g', { requires: 'levl >= 5' }),
      item('inferno', 'Inferno', 'g'),
    ],
  });
  const court = system('court', 'Court Ranks', { groups: [{ id: 'cl', name: 'Classes', single: true }], items: [item('squire', 'Squire', 'cl'), item('knight', 'Knight', 'cl')] });
  const techniques = { id: 's-tech', projectId: 'p', key: 'custom-tech', name: 'Techniques', singular: 'Technique', color: '#6b7a2b', builtin: false, order: 9, fields: [{ id: 'grade', name: 'Grade', type: 'select', options: ['Low', 'High'] }], uses: { tree: true, rank: 'grade' }, createdAt: 0, updatedAt: 0 } as CategorySchema;
  const tech = (id: string, name: string, grade = '') => entry(id, name, 'custom-tech', grade ? [{ id: `${id}-g`, key: '', value: grade, defId: 'grade' }] : []);
  const entries = [
    entry('mira', 'Mira', 'character'), entry('orrin', 'Orrin', 'character'),
    tech('stance', 'Iron Stance'), tech('ember-stance', 'Ember Stance'), tech('fortress', 'Iron Fortress', 'High'),
    tech('palm', 'Palm Strike'), tech('kick', 'Kick'), tech('combo', 'Combo'),
    tech('ouro', 'Ouro'), tech('boros', 'Boros'), tech('tail', 'Tail Whip'),
    entry('rusty', 'Rusty Blade', 'item'), entry('ashen', 'Ashen Blade', 'item'), entry('lonely', 'Lonely Spoon', 'item'),
  ];
  const links = [
    link('l1', 'stance', 'fortress', 'prerequisite-for'), link('l2', 'ember-stance', 'fortress', 'prerequisite-for'), link('l3', 'stance', 'ember-stance', 'excludes'),
    link('l4', 'rusty', 'ashen', 'upgrades-to'),
    link('l5', 'court/squire', 'court/knight', 'evolves-into', ab), link('l6', 'court/knight', 'court/squire', 'evolves-into', ab),
    link('l7', 'palm', 'combo', 'alternative-for'), link('l8', 'kick', 'combo', 'alternative-for'),
    link('l9', 'ember/lance', 'ember/inferno', 'fuses-into', ab),
    link('l10', 'ouro', 'boros', 'prerequisite-for'), link('l11', 'boros', 'ouro', 'prerequisite-for'), link('l12', 'boros', 'tail', 'prerequisite-for'),
    link('l13', 'stance', 'kick', 'teaches'),
    link('l14', 'mira', 'stance', 'prerequisite-for'),
    ...extraLinks,
  ];
  const sheets = [{ id: 'sh', projectId: 'p', systemId: 'ember', entryId: 'mira', values: {}, progress: {}, itemIds: ['spark', 'wall'], note: '', createdAt: 0, updatedAt: 0 } as SystemSheet];
  const progressCategories: ProgressCategory[] = [{ id: 'abilities', projectId: 'p', name: 'Abilities', shape: 'held', ladder: [], characterIds: [], order: 0, createdAt: 0, updatedAt: 0 }];
  const change = (id: string, entryId: string, more: Partial<ProgressChange>): ProgressChange => ({ id, projectId: 'p', entryId, categoryId: 'abilities', action: 'gain', subject: '', value: '', refId: null, abilityId: null, at: { kind: 'date', when: { precision: 'unknown' } }, cost: '', note: '', createdAt: Number(id.slice(1)), updatedAt: 0, ...more });
  const progress = [
    change('p1', 'mira', { refId: 'stance', subject: 'Iron Stance', at: { kind: 'node', nodeId: 'c1' } }),
    change('p2', 'mira', { refId: 'ember-stance', subject: 'Ember Stance' }),
    change('p3', 'orrin', { abilityId: 'ember/lance', subject: 'Fire Lance', at: { kind: 'node', nodeId: 'c2' } }),
  ];
  const snapshot = (id: string, nodeId: string, itemIds: string[]): ProgressSnapshot => ({ id, projectId: 'p', entryId: 'orrin', nodeId, label: '', systems: { court: { auto: true, values: {}, progress: {}, itemIds, overrides: {} } }, gear: [], status: { condition: '', transformations: '', reputation: '', knowledge: '', goals: '' }, notes: '', createdAt: 0, updatedAt: 0 });
  const snapshots = [snapshot('s1', 'c1', ['squire']), snapshot('s2', 'c2', ['knight'])];
  const model = buildModel({ project: { id: 'p' } as never, nodes: [node('c1', 'Chapter 1', 0), node('c2', 'Chapter 2', 1)], plans: [], entries, schemas: [techniques], links, relations: [], events: [], threads: [], systems: [ember, court], sheets, progressCategories, progress });
  return { model, snapshots };
}
const names = (tree: AbilityTree, keys: string[]) => keys.map((k) => tree.nodes.find((n) => n.key === k)?.name);
const edge = (tree: AbilityTree, from: string, to: string) => tree.edges.find((e) => e.from === from && e.to === to);

describe('what the ability paths are drawn from', () => {
  it('abilities from every blueprint, records of a kind set to show, and anything joined by a path; never a character', () => {
    const { model, snapshots } = world();
    const tree = abilityTree(model, snapshots);
    expect(tree.nodes.map((n) => n.name).sort()).toEqual(['Ashen Blade', 'Boros', 'Combo', 'Ember Stance', 'Fire Lance', 'Flame Wall', 'Inferno', 'Iron Fortress', 'Iron Stance', 'Kick', 'Knight', 'Nova', 'Ouro', 'Palm Strike', 'Rusty Blade', 'Spark', 'Squire', 'Tail Whip']);
    expect(tree.nodes.find((n) => n.name === 'Spark')!.source).toBe('Ember Arts · Skills');
    expect(tree.nodes.find((n) => n.name === 'Knight')!.source).toBe('Court Ranks · Classes');
    expect(tree.notDrawn.map((x) => [x.connection.from.id, x.reason.startsWith('one end is a character')])).toEqual([['mira', true]]);
  });

  it('each path keeps what it means: nothing is read as a prerequisite unless recorded as one', () => {
    const { model } = world();
    const tree = abilityTree(model);
    expect([edge(tree, 'entry:stance', 'entry:fortress')?.role, edge(tree, 'entry:rusty', 'entry:ashen')?.role, edge(tree, 'ability:court/squire', 'ability:court/knight')?.role, edge(tree, 'ability:ember/lance', 'ability:ember/inferno')?.role, edge(tree, 'entry:palm', 'entry:combo')?.role, edge(tree, 'entry:stance', 'entry:kick')?.role]).toEqual(['prerequisite', 'upgrade', 'evolution', 'fusion', 'alternative', 'other']);
    expect(edge(tree, 'entry:stance', 'entry:ember-stance')).toMatchObject({ role: 'exclusive', directed: false });
    expect(edge(tree, 'entry:stance', 'entry:kick')?.label).toBe('teaches');
    // From a blueprint: Fire Lance branches from Spark; Flame Wall's rule names Fire Lance.
    expect([edge(tree, 'ability:ember/spark', 'ability:ember/lance')?.role, edge(tree, 'ability:ember/lance', 'ability:ember/wall')?.role]).toEqual(['branch', 'rule']);
  });

  it('ranks, requirements and limits, who holds each and how they came by it, from the records where each is kept', () => {
    const { model, snapshots } = world();
    const tree = abilityTree(model, snapshots);
    const n = (name: string) => tree.nodes.find((x) => x.name === name)!;
    expect([n('Spark').rank, n('Iron Fortress').rank, n('Flame Wall').requires, n('Fire Lance').limits]).toEqual(['Novice', 'High', 'Skill: Fire Lance', ['Costs 5 Mana', 'Cooldown 1 turn']]);
    expect(n('Spark').holders).toEqual([{ id: 'mira', name: 'Mira', how: 'on their system sheet' }]);
    expect(n('Fire Lance').holders).toEqual([{ id: 'orrin', name: 'Orrin', how: 'as of the end, by their progression' }]);
    expect(n('Fire Lance').acquired.map((a) => [a.name, a.action, a.when])).toEqual([['Orrin', 'gain', 'Ch 2: Chapter 2']]);
    expect(n('Knight').holders.map((h) => h.how)).toEqual(['in their latest snapshot (Chapter 2)']);
    expect([n('Squire').acquired[0].when, n('Knight').acquired[0].when, n('Squire').holders]).toEqual(['first in a snapshot at Chapter 1', 'first in a snapshot at Chapter 2', []]);
    expect(n('Iron Stance').acquired.map((a) => [a.name, a.when])).toEqual([['Mira', 'Ch 1: Chapter 1']]);
  });
});

describe('what does not add up', () => {
  const problems = () => {
    const { model, snapshots } = world();
    return pathProblems(abilityTree(model, snapshots), model);
  };

  it('a cycle of requirements: nothing in it can be gained, nor what depends on it', () => {
    const found = problems();
    const cycle = found.find((p) => p.kind === 'cycle')!;
    expect(cycle.severity).toBe('problem');
    expect(cycle.message).toMatch(/^A cycle of requirements: (Ouro → Boros → Ouro|Boros → Ouro → Boros)\./);
    expect(found.filter((p) => p.kind === 'unreachable').map((p) => p.message)).toEqual(['Tail Whip can never be gained: it requires Boros, which can never be gained.']);
  });

  it('requirements that clash with an exclusion, and a rule that names nothing', () => {
    const found = problems();
    expect(found.filter((p) => p.kind === 'conflict').map((p) => p.message)).toEqual([expect.stringMatching(/^Iron Fortress requires both (Iron Stance and Ember Stance|Ember Stance and Iron Stance), which are mutually exclusive, so it can never be gained\.$/)]);
    expect(found.filter((p) => p.kind === 'rule').map((p) => p.message)).toEqual(['Nova’s requirement rule “levl >= 5” cannot be read: Nothing here is called “levl”.']);
  });

  it('a loop of evolutions and a fusion of one thing are said, as notes, not problems', () => {
    const found = problems();
    expect(found.filter((p) => p.severity === 'note' && p.kind !== 'holder').map((p) => [p.kind, p.nodes.length])).toEqual([['loop', 2], ['fusion', 2]]);
  });

  it('holders: something held without what it requires, or two things that exclude each other', () => {
    expect(problems().filter((p) => p.kind === 'holder').map((p) => p.message).sort()).toEqual(['Mira holds Flame Wall without Fire Lance, which it requires.', 'Mira holds both Iron Stance and Ember Stance, which are mutually exclusive.']);
  });

  it('nothing is said about what is fine: alternatives, branches, upgrades', () => {
    const flagged = new Set(problems().flatMap((p) => p.nodes));
    for (const ok of ['entry:combo', 'entry:palm', 'ability:ember/spark', 'entry:rusty', 'entry:ashen', 'entry:lonely']) expect(flagged.has(ok)).toBe(false);
  });

  it('alternatives: one way is enough; with no way left, it can never be gained', () => {
    const { model } = world([link('x1', 'boros', 'palm', 'prerequisite-for'), link('x2', 'boros', 'kick', 'prerequisite-for')]);
    const found = pathProblems(abilityTree(model), model);
    expect(found.find((p) => p.key === 'paths|unreachable|entry:combo')?.message).toBe('Combo can never be gained: none of its alternative prerequisites (Palm Strike, Kick) can be gained.');
  });

  it('an ability that requires what it excludes, and a blueprint whose branches loop', () => {
    const { model } = world([link('x3', 'combo', 'kick', 'excludes')]);
    expect(pathProblems(abilityTree(model), model).find((p) => p.kind === 'conflict' && p.nodes[0] === 'entry:combo')).toBeUndefined();
    const { model: m2 } = world([link('x4', 'kick', 'palm', 'prerequisite-for'), link('x5', 'palm', 'kick', 'excludes')]);
    expect(pathProblems(abilityTree(m2), m2).find((p) => p.key === 'paths|conflict|entry:palm')?.message).toBe('Palm Strike requires Kick, with which it is mutually exclusive, so it can never be gained.');
    const looped = world();
    const ember = looped.model.systems.get('ember')!;
    ember.items = ember.items.map((i) => (i.id === 'spark' ? { ...i, parentId: 'lance' } : i));
    const rebuilt = buildModel({ project: looped.model.project, nodes: [...looped.model.nodes.values()], plans: [], entries: [...looped.model.entries.values()], schemas: [], links: looped.model.links, relations: [], events: [], threads: [], systems: [...looped.model.systems.values()], sheets: looped.model.sheets });
    expect(pathProblems(abilityTree(rebuilt), rebuilt).filter((p) => p.message.startsWith('Blueprint items branch from each other in a loop')).map((p) => p.nodes.length)).toEqual([2]);
  });
});

describe('the tree’s shape', () => {
  it('each ability below what leads to it; a loop drawn bending back; the same every time', () => {
    const { model } = world();
    const tree = abilityTree(model);
    const keys = tree.nodes.map((n) => n.key);
    const layout = treeLayout(keys, tree.edges);
    const layer = (k: string) => layout.at.get(k)!.layer;
    expect([layer('ability:ember/lance') > layer('ability:ember/spark'), layer('ability:ember/wall') > layer('ability:ember/lance'), layer('entry:fortress') > layer('entry:stance'), layer('entry:ashen') > layer('entry:rusty')]).toEqual([true, true, true, true]);
    expect(layout.back.size).toBe(2); // one in the squire–knight loop, one in the Ouro–Boros cycle
    expect(new Set([...layout.at.values()].map((p) => `${p.x},${p.y}`)).size).toBe(keys.length);
    expect(JSON.stringify([...treeLayout(keys, tree.edges).at])).toBe(JSON.stringify([...layout.at]));
  });

  it('one ability’s paths: what leads to it, what it leads to, and what it excludes', () => {
    const { model } = world();
    const tree = abilityTree(model);
    expect(names(tree, [...pathsOf(tree, 'entry:fortress')]).sort()).toEqual(['Ember Stance', 'Iron Fortress', 'Iron Stance']);
    expect(names(tree, [...pathsOf(tree, 'ability:ember/lance')]).sort()).toEqual(['Fire Lance', 'Flame Wall', 'Inferno', 'Spark']);
  });
});
