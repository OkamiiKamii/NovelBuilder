import { describe, expect, it } from 'vitest';
import type { LoreEntry, LoreLink } from '@/modules/codex/types';
import type { StoryNode } from '@/modules/manuscript/types';
import { buildModel } from '@/modules/model/model';
import { layoutNetwork, relationNetwork, stageShown } from './network';
import { presetFor, type CharacterRelation, type RelationStage } from './types';

const entry = (id: string, name: string, category = 'character'): LoreEntry => ({ id, projectId: 'p', category, name, summary: '', description: '', image: null, notes: '', tags: [], fields: [], createdAt: 0, updatedAt: 0 }) as LoreEntry;
const chapter = (id: string, order: number): StoryNode => ({ id, projectId: 'p', parentId: null, kind: 'chapter', title: id, order, summary: '', notes: '', status: 'idea', wordCount: 0, charCount: 0, createdAt: 0, updatedAt: 0 });
const stage = (preset: string, startNodeId: string | null = null, more: Partial<RelationStage> = {}): RelationStage => {
  const p = presetFor(preset);
  return { id: `${preset}-${startNodeId}-${Math.random()}`, startNodeId, preset: p.key, category: p.category, label: p.label, fromRole: p.fromRole, toRole: p.toRole, directional: p.directional, title: '', affinity: 'neutral', event: '', notes: '', ...more };
};
const relation = (id: string, fromId: string, toId: string, stages: RelationStage[]): CharacterRelation => ({ id, projectId: 'p', fromId, toId, stages, createdAt: 0, updatedAt: 0 });
const link = (id: string, fromId: string, toId: string, type: string): LoreLink => ({ id, projectId: 'p', fromId, toId, fromLabel: '', toLabel: '', type, createdAt: 0 });
const model = (entries: LoreEntry[], relations: CharacterRelation[], links: LoreLink[] = [], nodes: StoryNode[] = []) =>
  buildModel({ project: { id: 'p' } as never, nodes, plans: [], entries, schemas: [], links, relations, events: [], threads: [], systems: [], sheets: [] });

/** A crowded cast: 400 characters, 1,200 relationships of six kinds, five factions of 80, and 60 other connections. */
function crowd() {
  const kinds = ['parent-child', 'friends', 'rivals', 'mentor-student', 'romantic-interest', 'employer-employee'];
  const people = Array.from({ length: 400 }, (_, i) => entry(`c${i}`, `Character ${String(i).padStart(3, '0')}`));
  const factions = Array.from({ length: 5 }, (_, i) => entry(`f${i}`, `Faction ${i}`, 'faction'));
  const relations: CharacterRelation[] = [];
  for (let i = 0; i < 1200; i++) {
    const a = i % 400;
    const b = (a + 1 + ((i * 7) % 37)) % 400;
    relations.push(relation(`r${i}`, `c${a}`, `c${b}`, [stage(kinds[i % kinds.length])]));
  }
  const links = [...people.map((p, i) => link(`m${i}`, p.id, `f${i % 5}`, 'member-of')), ...Array.from({ length: 60 }, (_, i) => link(`d${i}`, `c${i}`, `c${i + 200}`, 'distrusts'))];
  return { m: model([...people, ...factions], relations, links), kinds };
}

describe('the relationship network, filtered', () => {
  it('shows every relationship and every connection between characters by default, quickly, even in a crowd', () => {
    const { m } = crowd();
    const started = performance.now();
    const net = relationNetwork(m);
    const took = performance.now() - started;
    expect(net.edges.filter((e) => e.kind === 'relationship')).toHaveLength(1200);
    expect(net.edges.filter((e) => e.kind === 'connection')).toHaveLength(60);
    expect(net.nodes).toHaveLength(400);
    expect(net.hidden).toBe(0);
    expect(took).toBeLessThan(1500);
  });

  it('narrows by type, by hidden layers, by faction and by the page’s own filters', () => {
    const { m } = crowd();
    const rivals = relationNetwork(m, { type: 'rivals' });
    expect(rivals.edges.every((e) => e.label === 'Rivals')).toBe(true);
    expect(rivals.edges).toHaveLength(200);
    expect(rivals.hidden).toBe(1000);
    const noFamily = relationNetwork(m, { hidden: ['family', 'connection'] });
    expect(noFamily.edges.some((e) => e.category === 'family' || e.kind === 'connection')).toBe(false);
    expect(noFamily.edges).toHaveLength(1000);
    // Faction 0's people are characters 0, 5, 10…: only relationships touching one of them.
    const faction = relationNetwork(m, { factionId: 'f0', hidden: ['connection'] });
    expect(faction.edges.length).toBeGreaterThan(0);
    expect(faction.edges.every((e) => Number(e.from.slice(1)) % 5 === 0 || Number(e.to.slice(1)) % 5 === 0)).toBe(true);
    const kept = relationNetwork(m, { keep: (id) => id === 'r1' || id === 'r2', hidden: ['connection'] });
    expect(kept.edges.map((e) => e.id)).toEqual(['r1', 'r2']);
  });

  it('focuses on a character’s neighbourhood, one or two steps out, out of 400', () => {
    const { m } = crowd();
    const all = relationNetwork(m, { hidden: ['connection'] });
    const near = (ids: Set<string>) => new Set(all.edges.flatMap((e) => (ids.has(e.from) ? [e.to] : ids.has(e.to) ? [e.from] : [])).concat([...ids]));
    const one = relationNetwork(m, { hidden: ['connection'], focus: { id: 'c7', depth: 1 } });
    expect(new Set(one.nodes.map((n) => n.id))).toEqual(near(new Set(['c7'])));
    expect(one.nodes.find((n) => n.focus)!.id).toBe('c7');
    const two = relationNetwork(m, { hidden: ['connection'], focus: { id: 'c7', depth: 2 } });
    expect(new Set(two.nodes.map((n) => n.id))).toEqual(near(near(new Set(['c7']))));
    expect(one.nodes.length).toBeLessThan(two.nodes.length);
    expect(two.nodes.length).toBeLessThan(400);
    // Every edge shown is within the neighbourhood.
    const ids = new Set(two.nodes.map((n) => n.id));
    expect(two.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
  });

  it('shows characters with nothing on the map only when asked', () => {
    const lone = model([entry('a', 'A'), entry('b', 'B'), entry('c', 'C')], [relation('r', 'a', 'b', [stage('friends')])]);
    expect(relationNetwork(lone).nodes.map((n) => n.name)).toEqual(['A', 'B']);
    expect(relationNetwork(lone, { isolated: true }).nodes.map((n) => n.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('a relationship as it stood', () => {
  const chapters = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5'].map((id, i) => chapter(id, i));
  const history = relation('r', 'a', 'b', [stage('friends'), stage('rivals', 'ch3'), stage('enemies', null, { startUnknown: true }), stage('allies', 'ch5')]);
  const m = model([entry('a', 'A'), entry('b', 'B')], [history], [], chapters);

  it('now, as of a chapter, across chapters, or over the whole history', () => {
    expect(stageShown(history, m, { kind: 'current' })!.label).toBe('Allies');
    expect(stageShown(history, m, { kind: 'at', nodeId: 'ch2' })!.label).toBe('Friends');
    expect(stageShown(history, m, { kind: 'at', nodeId: 'ch4' })!.label).toBe('Rivals');
    expect(stageShown(history, m, { kind: 'range', from: 'ch1', to: 'ch2' })!.label).toBe('Friends');
    expect(stageShown(history, m, { kind: 'range', from: 'ch2', to: 'ch4' })!.label).toBe('Rivals');
    expect(stageShown(history, m, { kind: 'ever', }, 'friends')!.label).toBe('Friends');
    // Looking for friends now finds none: they are allies by the end.
    expect(stageShown(history, m, { kind: 'current' }, 'friends')).toBeNull();
    // A stage whose chapter is not said is in the history, but in no chapter range.
    expect(stageShown(history, m, { kind: 'ever' }, 'enemies')!.label).toBe('Enemies');
    expect(stageShown(history, m, { kind: 'range', from: 'ch1', to: 'ch5' }, 'enemies')).toBeNull();
  });

  it('draws each relationship as that stage, with its direction and where it applies', () => {
    const net = relationNetwork(m, { when: { kind: 'at', nodeId: 'ch4' } });
    expect(net.edges.map((e) => [e.label, e.range, e.directed])).toEqual([['Rivals', 'From chapter 3', false]]);
    const mentor = model([entry('a', 'A'), entry('b', 'B')], [relation('r', 'a', 'b', [stage('mentor-student')])]);
    expect(relationNetwork(mentor).edges[0]).toMatchObject({ directed: true, fromRole: 'Mentor', toRole: 'Student', from: 'a', to: 'b' });
  });
});

describe('laying the network out', () => {
  it('is the same every time, places everyone apart, and copes with a crowd', () => {
    const { m } = crowd();
    const net = relationNetwork(m, { hidden: ['connection'] });
    const started = performance.now();
    const first = layoutNetwork(net.nodes, net.edges);
    const took = performance.now() - started;
    expect(took).toBeLessThan(5000);
    expect(layoutNetwork(net.nodes, net.edges)).toEqual(first);
    expect([...first.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(new Set([...first.values()].map((p) => `${p.x},${p.y}`)).size).toBe(400);
    expect(layoutNetwork([], [])).toEqual(new Map());
  });
});
