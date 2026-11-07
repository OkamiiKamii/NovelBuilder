import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createManuscriptService, registerManuscript, type ManuscriptService } from '@/modules/manuscript/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { createRelationshipService, registerRelationships, type RelationshipService } from './service';
import { layoutMap, roleOf, stageAt, storyOrder, timelineOf } from './timeline';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;
let relationships: RelationshipService;

beforeEach(() => {
  db = new NovelDB(`relationships-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerRelationships(registry);
  manuscript = createManuscriptService(db, projects.contentChanged);
  codex = createCodexService(db, projects.contentChanged);
  relationships = createRelationshipService(db, projects.contentChanged);
});

/** Volume 1 (Ch 1–3), Volume 2 (Ch 4–5 with a scene), and four characters. */
async function story() {
  const p = await projects.create({ title: 'P' });
  const m = manuscript.forProject(p.id);
  const c = codex.forProject(p.id);
  const r = relationships.forProject(p.id);
  const v1 = await m.create('volume');
  const ch = [await m.create('chapter', v1.id), await m.create('chapter', v1.id), await m.create('chapter', v1.id)];
  const v2 = await m.create('volume');
  ch.push(await m.create('chapter', v2.id), await m.create('chapter', v2.id));
  const scene = await m.create('scene', ch[3].id);
  const [mira, bren, orrin, ysolde] = await Promise.all(['Mira', 'Bren', 'Orrin', 'Ysolde'].map((name) => c.create('character', name)));
  const guild = await c.create('faction', 'Ash Guild');
  return { p, m, c, r, v1, v2, ch, scene, mira, bren, orrin, ysolde, guild };
}
const order = async (m: ReturnType<ManuscriptService['forProject']>) => storyOrder(await m.list());

describe('creating relationships', () => {
  it('links two characters with a preset type, directional or mutual', async () => {
    const { r, mira, bren, orrin } = await story();
    const rivals = await r.create(mira.id, bren.id, 'rivals');
    const mentor = await r.create(orrin.id, mira.id, 'mentor-student');
    expect(rivals.stages).toHaveLength(1);
    expect(rivals.stages[0]).toMatchObject({ category: 'social', label: 'Rivals', fromRole: 'Rival', toRole: 'Rival', directional: false, affinity: 'neutral', startNodeId: null });
    expect(mentor.stages[0]).toMatchObject({ category: 'mentorship', label: 'Mentor / Student', directional: true });
    expect(roleOf(mentor.stages[0], mentor, orrin.id)).toBe('Mentor');
    expect(roleOf(mentor.stages[0], mentor, mira.id)).toBe('Student');
  });

  it('rejects self-links, duplicates either way round, and non-characters', async () => {
    const { r, mira, bren, guild } = await story();
    await r.create(mira.id, bren.id);
    await expect(r.create(mira.id, mira.id)).rejects.toThrow('two different');
    await expect(r.create(bren.id, mira.id)).rejects.toThrow('already have a relationship');
    await expect(r.create(mira.id, guild.id)).rejects.toThrow('not a character');
    await expect(r.create(mira.id, 'ghost')).rejects.toThrow('no longer exists');
    expect(await r.list()).toHaveLength(1);
  });

  it('edits type, title, affinity, origin and notes; custom types are free-form', async () => {
    const { r, mira, bren, ch } = await story();
    const rel = await r.create(mira.id, bren.id, 'enemies');
    const [stage] = rel.stages;
    await r.updateStage(rel.id, stage.id, { title: ' Rivalry over the Royal Tournament ', affinity: 'hostile', event: 'Bren cheats in the final.', notes: 'Keep it petty.', startNodeId: ch[0].id });
    await r.updateStage(rel.id, stage.id, { label: 'ignored for presets', affinity: 'furious' as never, startNodeId: 'no-such-chapter' });
    expect((await r.get(rel.id))!.stages[0]).toMatchObject({ label: 'Enemies', title: 'Rivalry over the Royal Tournament', affinity: 'hostile', event: 'Bren cheats in the final.', notes: 'Keep it petty.', startNodeId: null });

    await r.updateStage(rel.id, stage.id, { preset: 'custom' });
    await r.updateStage(rel.id, stage.id, { label: 'Blood oath', fromRole: 'Oath-holder', toRole: 'Sworn', directional: true, category: 'hierarchy' });
    expect((await r.get(rel.id))!.stages[0]).toMatchObject({ preset: 'custom', category: 'hierarchy', label: 'Blood oath', fromRole: 'Oath-holder', toRole: 'Sworn', directional: true });

    await r.updateStage(rel.id, stage.id, { preset: 'parent-child' });
    await r.reverse(rel.id);
    const reversed = (await r.get(rel.id))!;
    expect(reversed).toMatchObject({ fromId: bren.id, toId: mira.id });
    expect(roleOf(reversed.stages[0], reversed, mira.id)).toBe('Child'); // Mira was the Parent before the swap
    expect(roleOf(reversed.stages[0], reversed, bren.id)).toBe('Parent');
  });
});

describe('timeline', () => {
  async function arc() {
    const s = await story();
    const rel = await s.r.create(s.mira.id, s.bren.id, 'enemies');
    await s.r.updateStage(rel.id, rel.stages[0].id, { affinity: 'hostile', title: 'Rivalry over Royal Tournament' });
    const allies = await s.r.addStage(rel.id, s.ch[2].id);
    await s.r.updateStage(rel.id, allies.id, { preset: 'allies', affinity: 'reluctant', title: 'Shared threat in Underground Lab' });
    const friends = await s.r.addStage(rel.id, s.v2.id);
    await s.r.updateStage(rel.id, friends.id, { preset: 'friends', affinity: 'trusting' });
    return { ...s, rel: (await s.r.get(rel.id))! };
  }
  const ranges = async (s: Awaited<ReturnType<typeof arc>>, relId = s.rel.id) =>
    timelineOf((await s.r.get(relId))!, await order(s.m)).map((t) => `${t.range}: ${t.stage.label} (${t.stage.affinity})${t.orphaned ? ' [orphaned]' : ''}`);

  it('records how a relationship changes across chapters', async () => {
    const s = await arc();
    expect(await ranges(s)).toEqual(['Chapters 1–2: Enemies (hostile)', 'Chapter 3: Allies (reluctant)', 'Chapters 4+: Friends (trusting)']);
  });

  it('answers "how do they stand at this point in the story?"', async () => {
    const s = await arc();
    const o = await order(s.m);
    const at = (nodeId: string | null) => stageAt(s.rel, nodeId, o)?.label ?? null;
    expect([at(s.ch[0].id), at(s.ch[1].id), at(s.ch[2].id), at(s.ch[3].id), at(s.scene.id), at(s.ch[4].id), at(null)]).toEqual(['Enemies', 'Enemies', 'Allies', 'Friends', 'Friends', 'Friends', 'Friends']);

    // A relationship that only begins later does not exist before then.
    const late = await s.r.create(s.orrin.id, s.ysolde.id, 'exes');
    await s.r.updateStage(late.id, late.stages[0].id, { startNodeId: s.ch[3].id });
    const lateNow = (await s.r.get(late.id))!;
    expect(stageAt(lateNow, s.ch[1].id, o)).toBeNull();
    expect(stageAt(lateNow, s.ch[4].id, o)?.label).toBe('Exes');
    expect(await ranges(s, late.id)).toEqual(['Chapters 4+: Exes (neutral)']);
  });

  it('follows the manuscript when chapters are reordered, added or deleted', async () => {
    const s = await arc();
    // Move chapter 3 (where they became allies) to the very front.
    await s.m.move(s.ch[2].id, s.v1.id, s.ch[0].id);
    expect(await ranges(s)).toEqual(['Chapter 1: Enemies (hostile)', 'Chapters 1–3: Allies (reluctant)', 'Chapters 4+: Friends (trusting)']);
    await s.m.move(s.ch[2].id, s.v1.id, null); // back to third
    await s.m.create('chapter', s.v1.id); // a new chapter 4 pushes Volume 2 to chapters 5+
    expect(await ranges(s)).toEqual(['Chapters 1–2: Enemies (hostile)', 'Chapters 3–4: Allies (reluctant)', 'Chapters 5+: Friends (trusting)']);

    // Deleting the chapter a stage starts at leaves the stage in place, flagged, counted from the start.
    await s.m.remove(s.ch[2].id);
    const after = await ranges(s);
    expect(after).toHaveLength(3);
    expect(after.filter((line) => line.includes('[orphaned]'))).toEqual(['Chapters 1–3: Allies (reluctant) [orphaned]']);
    expect((await s.r.get(s.rel.id))!.stages).toHaveLength(3); // nothing was silently dropped
  });

  it('keeps at least one stage, and removing a stage rejoins its neighbours', async () => {
    const s = await arc();
    const middle = s.rel.stages[1];
    await s.r.removeStage(s.rel.id, middle.id);
    expect(await ranges(s)).toEqual(['Chapters 1–3: Enemies (hostile)', 'Chapters 4+: Friends (trusting)']);
    await s.r.removeStage(s.rel.id, s.rel.stages[2].id);
    await expect(s.r.removeStage(s.rel.id, s.rel.stages[0].id)).rejects.toThrow('at least one stage');
  });
});

describe('integration with the codex and the project', () => {
  it('deleting a character removes their relationships and nothing else', async () => {
    const { r, c, mira, bren, orrin, ysolde } = await story();
    await r.create(mira.id, bren.id, 'rivals');
    await r.create(orrin.id, mira.id, 'mentor-student');
    const kept = await r.create(bren.id, ysolde.id, 'siblings');
    await c.update(bren.id, { summary: 'A swordsman.' });
    const brenBefore = await c.get(bren.id);

    await c.remove(mira.id);

    expect((await r.list()).map((x) => x.id)).toEqual([kept.id]);
    expect(await c.get(bren.id)).toEqual(brenBefore);
    expect((await c.list()).map((e) => e.name).sort()).toEqual(['Ash Guild', 'Bren', 'Orrin', 'Ysolde']);
  });

  it('renaming or editing a character leaves relationships attached by id', async () => {
    const { r, c, mira, bren } = await story();
    const rel = await r.create(mira.id, bren.id, 'friends');
    await c.update(mira.id, { name: 'Mira Ashborne', tags: ['renamed'] });
    expect(await r.get(rel.id)).toMatchObject({ fromId: mira.id, toId: bren.id });
  });

  it("is private to its project, and copies re-point at the copy's characters and chapters", async () => {
    const { p, r, m, mira, bren, ch } = await story();
    const rel = await r.create(mira.id, bren.id, 'rivals');
    const later = await r.addStage(rel.id, ch[2].id);
    await r.updateStage(rel.id, later.id, { preset: 'friends' });

    const other = relationships.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.list()).toEqual([]);
    expect(await other.get(rel.id)).toBeUndefined();
    await expect(other.remove(rel.id)).rejects.toThrow('not found');
    await expect(other.addStage(rel.id, null)).rejects.toThrow('not found');
    await expect(other.create(mira.id, bren.id)).rejects.toThrow('no longer exists');

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id, { everything: true }))))).id]) {
      const [copy] = await relationships.forProject(projectId).list();
      const entries = await codex.forProject(projectId).list();
      const nodes = await manuscript.forProject(projectId).list();
      expect(copy.id).not.toBe(rel.id);
      expect(entries.find((e) => e.id === copy.fromId)?.name).toBe('Mira');
      expect(entries.find((e) => e.id === copy.toId)?.name).toBe('Bren');
      expect(nodes.some((x) => x.id === copy.stages[1].startNodeId)).toBe(true);
      expect(timelineOf(copy, storyOrder(nodes)).map((t) => `${t.range}: ${t.stage.label}`)).toEqual(['Chapters 1–2: Rivals', 'Chapters 3+: Friends']);
    }
    expect(timelineOf((await r.get(rel.id))!, await order(m)).map((t) => t.range)).toEqual(['Chapters 1–2', 'Chapters 3+']);

    await projects.remove(p.id);
    expect(await db.characterRelations.where('projectId').equals(p.id).count()).toBe(0);
  });
});

describe('network map layout', () => {
  it('centres the focus character with their connections around them', async () => {
    const { r, c, mira, bren, orrin, ysolde } = await story();
    await r.create(mira.id, bren.id);
    await r.create(orrin.id, mira.id);
    await r.create(bren.id, ysolde.id);
    const entries = await c.list();
    const relations = await r.list();

    const focused = layoutMap(entries, relations, mira.id);
    expect(focused.map((node) => node.entry.name)).toEqual(['Mira', 'Bren', 'Orrin']); // Ysolde is not connected to Mira
    expect(focused[0]).toMatchObject({ x: 400, y: 280, focus: true });
    expect(new Set(focused.map((node) => `${node.x},${node.y}`)).size).toBe(3);

    const everyone = layoutMap(entries, relations, null);
    expect(everyone.map((node) => node.entry.name)).toEqual(['Bren', 'Mira', 'Orrin', 'Ysolde']); // the faction is not a character in any relationship
    expect(everyone.every((node) => node.x >= 30 && node.x <= 770 && node.y >= 30 && node.y <= 530)).toBe(true);
    expect(layoutMap(entries, relations, null)).toEqual(everyone); // stable between visits
    expect(layoutMap(entries, [], null)).toEqual([]);
  });
});
