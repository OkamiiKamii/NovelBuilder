import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createCodexService, registerCodex, type CodexService } from '@/modules/codex/service';
import { createProjectService, type ProjectService } from '@/modules/projects/service';
import { countWords, measure } from './metrics';
import { createProgressService, registerProgress } from '@/modules/progress/service';
import { createManuscriptService, MAX_REVISIONS, registerManuscript, REVISION_INTERVAL, SaveConflictError, type ManuscriptService, type ProjectManuscript } from './service';
import { buildTree, canContain, dropAt, flatten, resolveDrop, validParents, type TreeNode } from './tree';

let n = 0;
let db: NovelDB;
let projects: ProjectService;
let manuscript: ManuscriptService;
let codex: CodexService;

const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })),
});
const words = (text: string) => ({ words: countWords(text), characters: text.length });

/** Renders the tree as indented "title [totalWords]" lines for easy comparison. */
const outline = async (m: ProjectManuscript) =>
  flatten(buildTree(await m.list())).map((t: TreeNode) => `${'  '.repeat(t.depth)}${t.node.title} [${t.totalWords}]`);

async function write(m: ProjectManuscript, id: string, text: string) {
  await m.saveDoc(id, doc(text), words(text));
}

/** Volume 1 › (Chapter 1 › Scene A, Scene B), Chapter 2 › Scene C; plus a loose Chapter 3. */
async function seed(m: ProjectManuscript) {
  const v1 = await m.create('volume');
  const c1 = await m.create('chapter', v1.id);
  const c2 = await m.create('chapter', v1.id);
  const a = await m.create('scene', c1.id, 'Scene A');
  const b = await m.create('scene', c1.id, 'Scene B');
  const c = await m.create('scene', c2.id, 'Scene C');
  const c3 = await m.create('chapter');
  await write(m, a.id, 'alpha one');
  await write(m, b.id, 'bravo one two');
  await write(m, c.id, 'charlie');
  await write(m, c1.id, 'intro');
  await m.update(a.id, { notes: 'note A', summary: 'sum A', status: 'revising' });
  return { v1, c1, c2, c3, a, b, c };
}

beforeEach(() => {
  db = new NovelDB(`manuscript-${++n}`);
  const registry = createProjectRegistry();
  projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerCodex(registry);
  registerProgress(registry);
  manuscript = createManuscriptService(db, projects.contentChanged, createProgressService(db).recordWriting);
  codex = createCodexService(db, projects.contentChanged);
});

describe('metrics', () => {
  it('counts words, characters and paragraphs', () => {
    expect(countWords('  "Run," she said — don\'t look back.  ')).toBe(6);
    expect(measure(['One two.', '', '   ', 'Three  four five'])).toMatchObject({ words: 5, characters: 27, paragraphs: 2, readingMinutes: 1 });
    expect(measure([])).toMatchObject({ words: 0, readingMinutes: 0 });
  });
});

describe('hierarchy', () => {
  it('allows Volume › Act › Arc › Chapter › Scene and rejects everything else', () => {
    expect(canContain(null, 'volume') && canContain('volume', 'act') && canContain('act', 'arc') && canContain('arc', 'chapter') && canContain('chapter', 'scene')).toBe(true);
    expect(canContain(null, 'chapter') && canContain('volume', 'chapter') && canContain('volume', 'arc')).toBe(true);
    for (const [parent, child] of [[null, 'scene'], ['volume', 'scene'], ['scene', 'scene'], ['chapter', 'chapter'], ['arc', 'volume'], ['act', 'act'], ['chapter', 'arc']] as const) {
      expect(canContain(parent, child), `${parent} › ${child}`).toBe(false);
    }
  });

  it('builds nested structures with word counts aggregated at every level', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    await seed(m);
    expect(await outline(m)).toEqual([
      'Volume 1 [7]',
      '  Chapter 1 [6]',
      '    Scene A [2]',
      '    Scene B [3]',
      '  Chapter 2 [1]',
      '    Scene C [1]',
      'Chapter 3 [0]',
    ]);
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 7, counts: { chapters: 3, scenes: 3 } });
  });

  it('refuses to create a node where it does not belong', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const chapter = await m.create('chapter');
    await expect(m.create('scene')).rejects.toThrow('inside a chapter');
    await expect(m.create('volume', chapter.id)).rejects.toThrow('cannot be created');
    expect(await m.list()).toHaveLength(1);
  });

  it('numbers scenes within their chapter', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const c1 = await m.create('chapter');
    const c2 = await m.create('chapter');
    await m.create('scene', c1.id);
    await m.create('scene', c1.id);
    expect((await m.create('scene', c2.id)).title).toBe('Scene 1');
    expect((await m.create('chapter')).title).toBe('Chapter 3');
  });
});

describe('metadata and status pipeline', () => {
  it('stores summary, notes and one of the seven pipeline statuses', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const chapter = await m.create('chapter');
    expect(chapter.status).toBe('idea');
    expect(chapter).not.toHaveProperty('publication');

    await m.update(chapter.id, { title: '  The Gate ', summary: 'S', notes: 'N', status: 'draft-complete' });
    expect(await m.get(chapter.id)).toMatchObject({ title: 'The Gate', summary: 'S', notes: 'N', status: 'draft-complete' });
    for (const status of ['idea', 'planned', 'drafting', 'draft-complete', 'revising', 'final', 'published'] as const) {
      await m.update(chapter.id, { status });
      expect((await m.get(chapter.id))!.status).toBe(status);
    }
    await m.update(chapter.id, { status: 'editing' as never }); // retired value: ignored
    expect((await m.get(chapter.id))!.status).toBe('published');
  });
});

describe('planning layer', () => {
  const fullPlan = {
    objective: 'Get Mira through the gate.',
    conflict: 'The gatekeeper wants a toll she cannot pay.',
    emotionalArc: 'Dread → defiance',
    dialogue: '"Everyone pays."\n"Not today."',
    foreshadowing: 'The key hums near the wall.',
    reveals: 'The guild sealed the gate.',
    openQuestions: 'Who paid for her?',
    ending: 'The gate opens from the inside.',
  };

  async function planned() {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const c = codex.forProject(p.id);
    const chapter = await m.create('chapter');
    const scene = await m.create('scene', chapter.id);
    const mira = await c.create('character', 'Mira');
    const gate = await c.create('location', 'The Gate');
    await write(m, chapter.id, 'The finished prose of the chapter.');
    return { p, m, c, chapter, scene, mira, gate };
  }

  it('every chapter and scene has a plan, blank until filled in', async () => {
    const { m, chapter, scene } = await planned();
    expect(await m.getPlan(chapter.id)).toMatchObject({ id: chapter.id, objective: '', beats: [], entityIds: [], ending: '' });
    expect(await m.getPlan(scene.id)).toMatchObject({ id: scene.id, beats: [] });
    const volume = await m.create('volume');
    await expect(m.getPlan(volume.id)).rejects.toThrow('not found');
    await expect(m.updatePlan(volume.id, { objective: 'x' })).rejects.toThrow('not found');
  });

  it('saves every planning field, beats in order, and attached entities', async () => {
    const { m, chapter, mira, gate } = await planned();
    await m.updatePlan(chapter.id, fullPlan);
    await m.updatePlan(chapter.id, {
      beats: [{ id: 'b1', text: 'Arrive at dusk' }, { id: 'b2', text: '   ' }, { id: 'b3', text: 'Refuse the toll\n(quietly)' }, { id: '', text: 'The key answers' }],
      entityIds: [mira.id, gate.id, mira.id, 'no-such-entry'],
    });
    await m.updatePlan(chapter.id, { ending: 'She walks through alone.' }); // partial update keeps the rest

    const plan = await m.getPlan(chapter.id);
    expect(plan).toMatchObject({ ...fullPlan, ending: 'She walks through alone.', entityIds: [mira.id, gate.id] });
    expect(plan.beats.map((b) => b.text)).toEqual(['Arrive at dusk', 'Refuse the toll\n(quietly)', 'The key answers']);
    expect(plan.beats[0].id).toBe('b1');

    db.close(); // a "session restart"
    expect(await new NovelDB(db.name).chapterPlans.get(chapter.id)).toEqual(plan);
  });

  it('SEPARATION: planning never changes manuscript text, and writing never changes the plan', async () => {
    const { m, chapter, mira } = await planned();
    const manuscriptState = async () => JSON.stringify([await db.chapterContents.toArray(), await db.chapterDrafts.toArray(), await db.chapterRevisions.toArray(), (await m.get(chapter.id))!.wordCount]);
    const before = await manuscriptState();

    await m.updatePlan(chapter.id, { ...fullPlan, beats: [{ id: 'b', text: 'A beat that must not appear in the prose' }], entityIds: [mira.id] });
    await m.update(chapter.id, { summary: 'A summary', notes: 'Private', status: 'planned' });
    await m.updatePlan(chapter.id, { objective: 'Changed again' });

    expect(await manuscriptState()).toBe(before);
    expect(await m.loadDoc(chapter.id)).toEqual(doc('The finished prose of the chapter.'));
    expect((await m.openDoc(chapter.id)).rev).toBe(1);

    const plan = await m.getPlan(chapter.id);
    await write(m, chapter.id, 'Entirely different prose now.');
    await m.saveVersion(chapter.id, 'v');
    expect(await m.getPlan(chapter.id)).toEqual(plan);
  });

  it('a deleted codex entry simply drops out; the plan is otherwise intact', async () => {
    const { m, c, chapter, mira, gate } = await planned();
    await m.updatePlan(chapter.id, { objective: 'O', entityIds: [mira.id, gate.id] });
    await c.remove(mira.id);
    const plan = await m.getPlan(chapter.id);
    expect(plan.objective).toBe('O');
    // The stale id is harmless and is cleaned on the next change to the list.
    await m.updatePlan(chapter.id, { entityIds: plan.entityIds });
    expect((await m.getPlan(chapter.id)).entityIds).toEqual([gate.id]);
  });

  it('travels with its chapter: duplicated, deleted and isolated per project', async () => {
    const { p, m, chapter, scene, mira } = await planned();
    await m.updatePlan(chapter.id, { objective: 'Chapter goal', entityIds: [mira.id] });
    await m.updatePlan(scene.id, { objective: 'Scene goal', beats: [{ id: 'x', text: 'Beat' }] });

    const copy = await m.duplicate(chapter.id);
    const sceneCopy = (await m.list()).find((n) => n.parentId === copy.id)!;
    expect(await m.getPlan(copy.id)).toMatchObject({ id: copy.id, objective: 'Chapter goal', entityIds: [mira.id] });
    expect((await m.getPlan(sceneCopy.id)).beats.map((b) => b.text)).toEqual(['Beat']);
    await m.updatePlan(copy.id, { objective: 'Diverged' });
    expect((await m.getPlan(chapter.id)).objective).toBe('Chapter goal');

    const other = manuscript.forProject((await projects.create({ title: 'Other' })).id);
    await expect(other.getPlan(chapter.id)).rejects.toThrow('not found');
    await expect(other.updatePlan(chapter.id, { objective: 'hack' })).rejects.toThrow('not found');
    const theirs = await other.create('chapter');
    await other.updatePlan(theirs.id, { entityIds: [mira.id] }); // another project's character
    expect((await other.getPlan(theirs.id)).entityIds).toEqual([]);

    await m.remove(copy.id);
    expect(await db.chapterPlans.where('projectId').equals(p.id).count()).toBe(2);
    await m.remove(chapter.id);
    expect(await db.chapterPlans.where('projectId').equals(p.id).count()).toBe(0);
  });

  it('is included in project copies and backups, with entity links re-pointed', async () => {
    const { p, m, chapter, mira } = await planned();
    await m.updatePlan(chapter.id, { objective: 'Goal', entityIds: [mira.id] });

    for (const projectId of [(await projects.duplicate(p.id)).id, (await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id))))).id]) {
      const cm = manuscript.forProject(projectId);
      const copiedChapter = (await cm.list()).find((n) => n.kind === 'chapter')!;
      const copiedMira = (await codex.forProject(projectId).list()).find((e) => e.name === 'Mira')!;
      const plan = await cm.getPlan(copiedChapter.id);
      expect(plan).toMatchObject({ id: copiedChapter.id, projectId, objective: 'Goal' });
      expect(plan.entityIds).toEqual([copiedMira.id]);
      expect(copiedMira.id).not.toBe(mira.id);
    }
  });
});

describe('reordering keeps everything attached to its id', () => {
  /** id → everything that must survive a structural change untouched. */
  const fingerprint = async (m: ProjectManuscript) =>
    Object.fromEntries(
      await Promise.all(
        (await m.list()).map(async (node) => [
          node.id,
          { title: node.title, kind: node.kind, notes: node.notes, summary: node.summary, status: node.status, words: node.wordCount, doc: await db.chapterContents.get(node.id) },
        ]),
      ),
    );

  it('reorders siblings by id', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { a, b, c1 } = await seed(m);
    const before = await fingerprint(m);

    await m.move(b.id, c1.id, a.id);
    expect((await outline(m)).slice(1, 4)).toEqual(['  Chapter 1 [6]', '    Scene B [3]', '    Scene A [2]']);
    await m.nudge(b.id, 1);
    await m.nudge(b.id, 1); // already last: no-op
    await m.nudge(a.id, -1); // already first: no-op
    expect((await outline(m)).slice(2, 4)).toEqual(['    Scene A [2]', '    Scene B [3]']);
    expect(await fingerprint(m)).toEqual(before);
  });

  it('moves a scene to another chapter with its text, and totals follow', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { a, c, c2 } = await seed(m);
    const before = await fingerprint(m);

    await m.move(a.id, c2.id, c.id);
    expect(await outline(m)).toEqual([
      'Volume 1 [7]',
      '  Chapter 1 [4]',
      '    Scene B [3]',
      '  Chapter 2 [3]',
      '    Scene A [2]',
      '    Scene C [1]',
      'Chapter 3 [0]',
    ]);
    expect(await fingerprint(m)).toEqual(before);
    expect(await m.loadDoc(a.id)).toEqual(doc('alpha one'));
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 7 });
  });

  it('moves a chapter with all of its scenes', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { c1, c3, a, b } = await seed(m);
    const before = await fingerprint(m);

    await m.move(c1.id, null, c3.id);
    expect(await outline(m)).toEqual(['Volume 1 [1]', '  Chapter 2 [1]', '    Scene C [1]', 'Chapter 1 [6]', '  Scene A [2]', '  Scene B [3]', 'Chapter 3 [0]']);
    expect((await m.get(a.id))!.parentId).toBe(c1.id);
    expect((await m.get(b.id))!.parentId).toBe(c1.id);
    expect(await fingerprint(m)).toEqual(before);
  });

  it('rejects impossible moves and leaves the tree unchanged', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { v1, c1, c2, a } = await seed(m);
    const arc = await m.create('arc', v1.id);
    const before = await outline(m);

    await expect(m.move(a.id, null)).rejects.toThrow('inside a chapter');
    await expect(m.move(a.id, v1.id)).rejects.toThrow('inside a chapter');
    await expect(m.move(c1.id, c2.id)).rejects.toThrow('cannot go inside');
    await expect(m.move(v1.id, arc.id)).rejects.toThrow('inside itself');
    await expect(m.move(c1.id, v1.id, 'no-such-id')).rejects.toThrow('no longer exists');
    expect(await outline(m)).toEqual(before);
  });

  it('survives many random moves without losing or mixing anything', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    await seed(m);
    const before = await fingerprint(m);
    let seedValue = 7;
    const random = (max: number) => (seedValue = (seedValue * 1103515245 + 12345) % 2147483648) % max;

    for (let i = 0; i < 120; i++) {
      const nodes = await m.list();
      const node = nodes[random(nodes.length)];
      const parents = validParents(nodes, node.id);
      const parent = parents[random(parents.length)];
      const siblings = nodes.filter((s) => s.parentId === (parent?.id ?? null) && s.id !== node.id);
      const beforeId = siblings.length && random(2) ? siblings[random(siblings.length)].id : null;
      await m.move(node.id, parent?.id ?? null, beforeId);
    }

    const nodes = await m.list();
    expect(await fingerprint(m)).toEqual(before);
    const byId = new Map(nodes.map((x) => [x.id, x]));
    for (const node of nodes) {
      expect(canContain(node.parentId ? byId.get(node.parentId)!.kind : null, node.kind)).toBe(true);
    }
    expect(flatten(buildTree(nodes))).toHaveLength(nodes.length); // no cycles, no orphans
    expect(buildTree(nodes).reduce((sum, t) => sum + t.totalWords, 0)).toBe(7);
  });
});

describe('drag and drop targets', () => {
  it('resolves row drops to id-based destinations', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { v1, c1, c2, c3, a, b, c } = await seed(m);
    const nodes = await m.list();

    expect(resolveDrop(nodes, b.id, a.id, 'before')).toEqual({ parentId: c1.id, beforeId: a.id, zone: 'before' });
    expect(resolveDrop(nodes, a.id, b.id, 'after')).toEqual({ parentId: c1.id, beforeId: null, zone: 'after' });
    expect(resolveDrop(nodes, a.id, c2.id, 'inside')).toEqual({ parentId: c2.id, beforeId: null, zone: 'inside' });
    expect(resolveDrop(nodes, c3.id, c1.id, 'after')).toEqual({ parentId: v1.id, beforeId: c2.id, zone: 'after' });
    // not allowed
    expect(resolveDrop(nodes, a.id, a.id, 'before')).toBeNull();
    expect(resolveDrop(nodes, a.id, v1.id, 'before')).toBeNull();
    expect(resolveDrop(nodes, c1.id, a.id, 'inside')).toBeNull();
    expect(resolveDrop(nodes, v1.id, c.id, 'before')).toBeNull();
    // a scene dragged to the edge of a chapter row lands inside it
    expect(dropAt(nodes, a.id, c2.id, 0.1)).toMatchObject({ parentId: c2.id, zone: 'inside' });
    // a chapter dragged to the middle of a scene row lands beside it? no: scenes cannot have chapter siblings
    expect(dropAt(nodes, c3.id, a.id, 0.5)).toBeNull();
    expect(dropAt(nodes, c3.id, v1.id, 0.5)).toMatchObject({ parentId: v1.id, zone: 'inside' });
    expect(dropAt(nodes, c3.id, v1.id, 0.05)).toMatchObject({ parentId: null, beforeId: v1.id });
  });
});

describe('duplicate and delete', () => {
  it('deep-copies a chapter with its scenes and text under new ids', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { c1, a } = await seed(m);
    const originals = new Set((await m.list()).map((x) => x.id));

    const copy = await m.duplicate(c1.id);
    expect(await outline(m)).toEqual([
      'Volume 1 [13]',
      '  Chapter 1 [6]',
      '    Scene A [2]',
      '    Scene B [3]',
      '  Chapter 1 (Copy) [6]',
      '    Scene A [2]',
      '    Scene B [3]',
      '  Chapter 2 [1]',
      '    Scene C [1]',
      'Chapter 3 [0]',
    ]);
    const copies = (await m.list()).filter((x) => !originals.has(x.id));
    expect(copies).toHaveLength(3);
    const sceneCopy = copies.find((x) => x.title === 'Scene A')!;
    expect(sceneCopy).toMatchObject({ parentId: copy.id, notes: 'note A', summary: 'sum A', status: 'revising' });
    expect(await m.loadDoc(copy.id)).toEqual(doc('intro'));

    // The copy is independent of the original.
    await write(m, sceneCopy.id, 'changed entirely now');
    expect(await m.loadDoc(a.id)).toEqual(doc('alpha one'));
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 14, counts: { chapters: 4, scenes: 5 } });
  });

  it('deletes a node with everything inside it and nothing else', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { v1, c3 } = await seed(m);
    expect(await m.remove(v1.id)).toBe(6);
    expect((await m.list()).map((x) => x.id)).toEqual([c3.id]);
    expect(await db.chapterContents.count()).toBe(0);
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 0, counts: { chapters: 1, scenes: 0 } });
  });
});

describe('text', () => {
  it('stores the document byte-for-byte, whitespace included', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    const written = doc('\t"Wait."  Two  spaces.   ', '', '    indented', 'trailing   ');
    await m.saveDoc(ch.id, written, { words: 6, characters: 40 });
    expect(await m.loadDoc(ch.id)).toEqual(written);
  });

  it('only chapters and scenes hold text', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const volume = await m.create('volume');
    await expect(m.saveDoc(volume.id, doc('x'), { words: 1, characters: 1 })).rejects.toThrow('not found');
  });

  it('bumps the project last-edited time', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const a = await m.create('chapter');
    await new Promise((r) => setTimeout(r, 2));
    await write(m, a.id, 'one two three');
    expect((await projects.get(p.id))!.updatedAt).toBeGreaterThan(p.updatedAt);
  });
});

describe('isolation', () => {
  it("cannot read, write or move another project's nodes", async () => {
    const p1 = await projects.create({ title: 'One' });
    const p2 = await projects.create({ title: 'Two' });
    const mine = manuscript.forProject(p1.id);
    const ch = await mine.create('chapter');
    await write(mine, ch.id, 'secret');

    const other = manuscript.forProject(p2.id);
    const theirs = await other.create('chapter');
    expect((await other.list()).map((x) => x.id)).toEqual([theirs.id]);
    expect(await other.get(ch.id)).toBeUndefined();
    await expect(other.loadDoc(ch.id)).rejects.toThrow('not found');
    await expect(other.saveDoc(ch.id, doc('x'), { words: 1, characters: 1 })).rejects.toThrow('not found');
    await expect(other.remove(ch.id)).rejects.toThrow('not found');
    await expect(other.duplicate(ch.id)).rejects.toThrow('not found');
    await expect(other.create('scene', ch.id)).rejects.toThrow('not found');
    const scene = await other.create('scene', theirs.id);
    await expect(other.move(scene.id, ch.id)).rejects.toThrow('not found');
    expect(await mine.loadDoc(ch.id)).toEqual(doc('secret'));
    expect(await mine.list()).toHaveLength(1);
  });

  it('project duplicate, export/import and delete carry the whole tree', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const { a } = await seed(m);
    const original = await outline(m);

    const copy = await projects.duplicate(p.id);
    const cm = manuscript.forProject(copy.id);
    expect(await outline(cm)).toEqual(original);
    const ids = new Set((await m.list()).map((x) => x.id));
    expect((await cm.list()).some((x) => ids.has(x.id) || (x.parentId && ids.has(x.parentId)))).toBe(false);
    const copiedA = (await cm.list()).find((x) => x.title === 'Scene A')!;
    expect(await cm.loadDoc(copiedA.id)).toEqual(doc('alpha one'));
    await write(cm, copiedA.id, 'changed');
    expect(await m.loadDoc(a.id)).toEqual(doc('alpha one'));

    const file = JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id)));
    const imported = await projects.importSnapshot(file);
    expect(await outline(manuscript.forProject(imported.id))).toEqual(original);

    await projects.remove(copy.id);
    await projects.remove(imported.id);
    expect(await db.chapters.count()).toBe(7);
    expect(await db.chapterContents.count()).toBe(4);
  });
});

describe('save safety', () => {
  afterEach(() => vi.restoreAllMocks());
  async function chapter() {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    return { p, m, ch };
  }

  it('refuses a save based on an outdated revision', async () => {
    const { m, ch } = await chapter();
    const tabA = await m.openDoc(ch.id);
    const tabB = await m.openDoc(ch.id);
    expect(tabA.rev).toBe(0);

    const revA = await m.saveDoc(ch.id, doc('from A'), words('from A'), { baseRev: tabA.rev });
    expect(revA).toBe(1);
    await expect(m.saveDoc(ch.id, doc('from B'), words('from B'), { baseRev: tabB.rev })).rejects.toBeInstanceOf(SaveConflictError);
    expect(await m.loadDoc(ch.id)).toEqual(doc('from A'));
    expect((await m.get(ch.id))!.wordCount).toBe(2);

    // Deliberately keeping B's text files A's in history instead of destroying it.
    await m.saveDoc(ch.id, doc('from B'), words('from B'), { baseRev: tabB.rev, force: true, reason: 'conflict' });
    expect(await m.loadDoc(ch.id)).toEqual(doc('from B'));
    const [kept] = await m.revisions(ch.id);
    expect(kept).toMatchObject({ reason: 'conflict', wordCount: 2 });
    expect((await m.getRevision(kept.id))!.doc).toEqual(doc('from A'));
  });

  it('commits text, counts and project totals together or not at all', async () => {
    const { p, m, ch } = await chapter();
    await write(m, ch.id, 'one two');
    vi.spyOn(db.projectStats, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(write(m, ch.id, 'one two three four')).rejects.toThrow('disk full');
    vi.restoreAllMocks();

    expect(await m.loadDoc(ch.id)).toEqual(doc('one two'));
    expect((await m.get(ch.id))!.wordCount).toBe(2);
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 2 });
    expect((await m.openDoc(ch.id)).rev).toBe(1);
  });

  it('recovers unsaved writing from an interrupted session', async () => {
    const { m, ch } = await chapter();
    await write(m, ch.id, 'saved text');
    const opened = await m.openDoc(ch.id);
    await m.saveDraft(ch.id, doc('saved text plus what I was typing'), opened.rev);
    // …crash. Next launch:
    const reopened = await m.openDoc(ch.id);
    expect(reopened.doc).toEqual(doc('saved text'));
    expect(reopened.recovered?.doc).toEqual(doc('saved text plus what I was typing'));

    // Saving the recovered text keeps the pre-crash version in history and clears the draft.
    await m.saveDoc(ch.id, reopened.recovered!.doc, { words: 7, characters: 33 }, { baseRev: reopened.rev, reason: 'recovery' });
    expect((await m.openDoc(ch.id)).recovered).toBeNull();
    expect(await m.revisions(ch.id)).toMatchObject([{ reason: 'recovery', wordCount: 2 }]);
  });

  it('a normal save clears the draft; discarding keeps the saved text', async () => {
    const { m, ch } = await chapter();
    await m.saveDraft(ch.id, doc('first words'), 0);
    expect((await m.openDoc(ch.id)).recovered?.doc).toEqual(doc('first words')); // never saved at all yet
    await write(m, ch.id, 'first words done');
    expect((await m.openDoc(ch.id)).recovered).toBeNull();

    await m.saveDraft(ch.id, doc('unwanted'), 1);
    await m.discardDraft(ch.id);
    expect(await m.openDoc(ch.id)).toMatchObject({ doc: doc('first words done'), recovered: null });
  });

  it('a draft older than the saved text is filed in history, not applied', async () => {
    const { m, ch } = await chapter();
    await m.saveDraft(ch.id, doc('stale draft'), 0);
    await write(m, ch.id, 'saved from another tab');
    // (a real save clears the draft; simulate one that landed late)
    await db.chapterDrafts.put({ id: ch.id, projectId: ch.projectId, doc: doc('stale draft'), baseRev: 0, updatedAt: 1 });
    const opened = await m.openDoc(ch.id);
    expect(opened).toMatchObject({ doc: doc('saved from another tab'), recovered: null });
    const [filed] = await m.revisions(ch.id);
    expect(filed.reason).toBe('recovery');
    expect((await m.getRevision(filed.id))!.doc).toEqual(doc('stale draft'));
  });
});

describe('version history', () => {
  afterEach(() => vi.restoreAllMocks());
  const at = (time: number) => vi.spyOn(Date, 'now').mockImplementation(() => time);

  it('keeps one automatic snapshot per interval, of the text being replaced', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    const t0 = Date.now();
    await write(m, ch.id, 'v1');
    await write(m, ch.id, 'v2'); // replaces v1 → snapshot of v1 (first ever)
    await write(m, ch.id, 'v3'); // within interval → no snapshot
    at(t0 + REVISION_INTERVAL + 1000);
    await write(m, ch.id, 'v4'); // interval passed → snapshot of v3
    await write(m, ch.id, 'v5');

    const revisions = await m.revisions(ch.id);
    const texts = await Promise.all(revisions.map(async (r) => (await m.getRevision(r.id))!.doc));
    expect(texts).toEqual([doc('v3'), doc('v1')]);
    expect(revisions.every((r) => r.reason === 'auto')).toBe(true);
  });

  it('saves a named version and restores it without losing the current text', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    await write(m, ch.id, 'the good draft');
    await m.saveVersion(ch.id, ' Before rewrite ');
    await m.saveVersion(ch.id, 'again'); // same state: relabelled, not duplicated
    await write(m, ch.id, 'a worse rewrite of it');

    const [version] = await m.revisions(ch.id);
    expect(await m.revisions(ch.id)).toHaveLength(1);
    expect(version).toMatchObject({ reason: 'manual', label: 'again', wordCount: 3 });

    await m.restoreRevision(ch.id, version.id);
    expect(await m.loadDoc(ch.id)).toEqual(doc('the good draft'));
    expect((await m.get(ch.id))!.wordCount).toBe(3);
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 3 });
    const [undo] = await m.revisions(ch.id);
    expect(undo.reason).toBe('restore');
    expect((await m.getRevision(undo.id))!.doc).toEqual(doc('a worse rewrite of it'));
  });

  it('caps history, dropping the oldest automatic snapshots before named ones', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    const t0 = Date.now();
    await write(m, ch.id, 'v0');
    await m.saveVersion(ch.id, 'keep me');
    for (let i = 1; i <= MAX_REVISIONS + 5; i++) {
      at(t0 + i * (REVISION_INTERVAL + 1));
      await write(m, ch.id, `v${i}`);
    }
    const revisions = await m.revisions(ch.id);
    expect(revisions).toHaveLength(MAX_REVISIONS);
    expect(revisions.some((r) => r.label === 'keep me')).toBe(true);
  });

  it('is private to its project, deleted with its chapter, and left out of backups and copies', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    await write(m, ch.id, 'v1');
    await write(m, ch.id, 'v2');
    await m.saveDraft(ch.id, doc('typing'), 2);
    const [revision] = await m.revisions(ch.id);

    const other = manuscript.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.getRevision(revision.id)).toBeUndefined();
    await expect(other.revisions(ch.id)).rejects.toThrow('not found');
    await expect(other.restoreRevision(ch.id, revision.id)).rejects.toThrow('not found');

    const file = await projects.exportSnapshot(p.id);
    expect(Object.keys(file.collections)).not.toContain('chapterRevisions');
    expect(Object.keys(file.collections)).not.toContain('chapterDrafts');
    const copy = await projects.duplicate(p.id);
    expect(await db.chapterRevisions.where('projectId').equals(copy.id).count()).toBe(0);

    await m.remove(ch.id);
    expect(await db.chapterRevisions.where('projectId').equals(p.id).count()).toBe(0);
    expect(await db.chapterDrafts.count()).toBe(0);

    const ch2 = await m.create('chapter');
    await write(m, ch2.id, 'a');
    await write(m, ch2.id, 'b');
    await projects.remove(p.id);
    expect(await db.chapterRevisions.count()).toBe(0);
  });
});

describe('alternate drafts', () => {
  async function chapterWithText() {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    await write(m, ch.id, 'the original ending of the chapter');
    return { p, m, ch };
  }
  const drafts = async (m: ProjectManuscript, id: string) => ({ active: await m.activeDraft(id), others: (await m.branches(id)).map((b) => `${b.name} (${b.wordCount})`) });

  it('starts an alternate from a copy and keeps the original as its own draft', async () => {
    const { p, m, ch } = await chapterWithText();
    expect(await drafts(m, ch.id)).toEqual({ active: 'Main draft', others: [] });

    await m.createBranch(ch.id, ' Alternate Ending A ');
    expect(await drafts(m, ch.id)).toEqual({ active: 'Alternate Ending A', others: ['Main draft (6)'] });
    expect(await m.loadDoc(ch.id)).toEqual(doc('the original ending of the chapter')); // a copy to start from
    expect((await m.openDoc(ch.id)).rev).toBe(1); // text untouched, so an open editor is not disturbed

    await write(m, ch.id, 'a much bleaker ending');
    const [main] = await m.branches(ch.id);
    expect((await m.getBranch(main.id))!.doc).toEqual(doc('the original ending of the chapter'));
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 4 }); // totals count the draft in the manuscript
  });

  it('switching swaps the drafts without losing either, and totals follow', async () => {
    const { p, m, ch } = await chapterWithText();
    await m.createBranch(ch.id, 'Ending A');
    await write(m, ch.id, 'ending A text here');
    await m.createBranch(ch.id, 'Ending B', 'blank');
    expect(await m.loadDoc(ch.id)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    await write(m, ch.id, 'B');
    expect(await drafts(m, ch.id)).toEqual({ active: 'Ending B', others: ['Main draft (6)', 'Ending A (4)'] });

    const sessionsBefore = await db.writingSessions.count();
    const main = (await m.branches(ch.id)).find((b) => b.name === 'Main draft')!;
    await m.switchBranch(ch.id, main.id);
    expect(await drafts(m, ch.id)).toEqual({ active: 'Main draft', others: ['Ending B (1)', 'Ending A (4)'] });
    expect(await m.loadDoc(ch.id)).toEqual(doc('the original ending of the chapter'));
    expect((await m.get(ch.id))!.wordCount).toBe(6);
    expect(await projects.getStats(p.id)).toMatchObject({ wordCount: 6 });
    expect(await db.writingSessions.count()).toBe(sessionsBefore); // swapping is not logged as writing

    const a = (await m.branches(ch.id)).find((b) => b.name === 'Ending A')!;
    await m.switchBranch(ch.id, a.id);
    expect(await m.loadDoc(ch.id)).toEqual(doc('ending A text here'));
    const all = await m.branches(ch.id);
    expect(await Promise.all(all.map(async (b) => [b.name, (await m.getBranch(b.id))!.doc]))).toEqual([
      ['Ending B', doc('B')],
      ['Main draft', doc('the original ending of the chapter')],
    ]);
  });

  it('a stale editor cannot overwrite the draft that was swapped in', async () => {
    const { m, ch } = await chapterWithText();
    const editor = await m.openDoc(ch.id);
    await m.createBranch(ch.id, 'Alt', 'blank');
    await expect(m.saveDoc(ch.id, doc('typed in a stale tab'), { words: 5, characters: 20 }, { baseRev: editor.rev })).rejects.toThrow('changed somewhere else');
    expect(await m.loadDoc(ch.id)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('renames drafts, refuses duplicate names, and deletes only alternates', async () => {
    const { m, ch } = await chapterWithText();
    await m.createBranch(ch.id, 'Ending A');
    const [main] = await m.branches(ch.id);
    await expect(m.createBranch(ch.id, 'ending a')).rejects.toThrow('already has a draft');
    await expect(m.createBranch(ch.id, 'main draft')).rejects.toThrow('already has a draft');
    await expect(m.createBranch(ch.id, '  ')).rejects.toThrow('name');
    await expect(m.renameDraft(ch.id, null, 'Main draft')).rejects.toThrow('already has a draft');

    await m.renameDraft(ch.id, main.id, 'Original');
    await m.renameDraft(ch.id, null, 'Bleak ending');
    expect(await drafts(m, ch.id)).toEqual({ active: 'Bleak ending', others: ['Original (6)'] });

    await m.deleteBranch(main.id);
    expect(await drafts(m, ch.id)).toEqual({ active: 'Bleak ending', others: [] });
    expect(await m.loadDoc(ch.id)).toEqual(doc('the original ending of the chapter'));
  });

  it('versions remember which draft they belong to', async () => {
    const { m, ch } = await chapterWithText();
    await m.saveVersion(ch.id, 'First');
    await m.createBranch(ch.id, 'Alt');
    await write(m, ch.id, 'alt text');
    await m.saveVersion(ch.id, 'Second');
    expect((await m.revisions(ch.id)).map((r) => [r.label, r.branchName])).toEqual([['Second', 'Alt'], ['First', 'Main draft']]);
  });

  it('are private to the project, travel with the chapter, and are in backups', async () => {
    const { p, m, ch } = await chapterWithText();
    await m.createBranch(ch.id, 'Alt');
    const [main] = await m.branches(ch.id);

    const other = manuscript.forProject((await projects.create({ title: 'Other' })).id);
    expect(await other.getBranch(main.id)).toBeUndefined();
    await expect(other.branches(ch.id)).rejects.toThrow('not found');
    await expect(other.switchBranch(ch.id, main.id)).rejects.toThrow('not found');
    await expect(other.deleteBranch(main.id)).rejects.toThrow('not found');
    const theirs = await other.create('chapter');
    await expect(other.switchBranch(theirs.id, main.id)).rejects.toThrow('not found');

    const copy = await m.duplicate(ch.id);
    expect(await drafts(m, copy.id)).toEqual({ active: 'Alt', others: ['Main draft (6)'] });
    expect((await m.branches(copy.id))[0].id).not.toBe(main.id);

    const imported = manuscript.forProject((await projects.importSnapshot(JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id))))).id);
    const importedChapter = (await imported.list()).find((n) => n.title === 'Chapter 1')!;
    expect(await drafts(imported, importedChapter.id)).toEqual({ active: 'Alt', others: ['Main draft (6)'] });
    expect((await imported.getBranch((await imported.branches(importedChapter.id))[0].id))!.doc).toEqual(doc('the original ending of the chapter'));

    await m.remove(copy.id);
    expect(await db.chapterBranches.where('projectId').equals(p.id).count()).toBe(1);
    await m.remove(ch.id);
    expect(await db.chapterBranches.where('projectId').equals(p.id).count()).toBe(0);
  });
});

describe('restoring versions is non-destructive', () => {
  it('saves the current text as a named version before every restore', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    const ch = await m.create('chapter');
    await write(m, ch.id, 'draft one');
    await m.saveVersion(ch.id, 'Original First Draft');
    await write(m, ch.id, 'draft two, heavily rewritten');
    const original = (await m.revisions(ch.id)).find((r) => r.label === 'Original First Draft')!;

    await m.restoreRevision(ch.id, original.id);
    const [saved] = await m.revisions(ch.id);
    expect(saved.reason).toBe('restore');
    expect(saved.label).toMatch(/^Before restoring the version from \w+ \d+$/);
    expect((await m.getRevision(saved.id))!.doc).toEqual(doc('draft two, heavily rewritten'));
    expect(await m.loadDoc(ch.id)).toEqual(doc('draft one'));

    // …and restoring that one brings the rewrite back, again keeping what it replaces.
    await m.restoreRevision(ch.id, saved.id);
    expect(await m.loadDoc(ch.id)).toEqual(doc('draft two, heavily rewritten'));
    const texts = await Promise.all((await m.revisions(ch.id)).map(async (r) => JSON.stringify((await m.getRevision(r.id))!.doc)));
    expect(texts.some((t) => t.includes('draft one'))).toBe(true);
    expect((await m.revisions(ch.id)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('schema migration', () => {
  it('upgrades Phase 2 chapters into story nodes without touching their text', async () => {
    const legacy = new Dexie('migrate-tree');
    legacy.version(3).stores({ projects: 'id, updatedAt, status', projectStats: 'projectId', chapters: 'id, projectId', chapterContents: 'id, projectId' });
    await legacy.table('chapters').bulkAdd([
      { id: 'c1', projectId: 'p', parentId: null, kind: 'chapter', title: 'One', order: 0, notes: 'keep', wordCount: 2, charCount: 7, createdAt: 1, updatedAt: 1 },
      { id: 'c2', projectId: 'p', parentId: null, kind: 'chapter', title: 'Two', order: 1, notes: '', wordCount: 0, charCount: 0, createdAt: 2, updatedAt: 2 },
    ]);
    await legacy.table('chapterContents').add({ id: 'c1', projectId: 'p', doc: doc('one two') });
    legacy.close();

    const upgraded = new NovelDB('migrate-tree');
    expect(await upgraded.chapters.get('c1')).toMatchObject({ title: 'One', notes: 'keep', summary: '', status: 'drafting', wordCount: 2 });
    expect(await upgraded.chapters.get('c2')).toMatchObject({ status: 'idea' });
    expect(await upgraded.chapters.get('c1')).not.toHaveProperty('publication');
    expect((await upgraded.chapterContents.get('c1'))!.doc).toEqual(doc('one two'));
  });

  it('maps the old progress and publication tags onto the single pipeline', async () => {
    const legacy = new Dexie('migrate-status');
    legacy.version(7).stores({ projects: 'id, updatedAt, status', projectStats: 'projectId', chapters: 'id, projectId', chapterContents: 'id, projectId' });
    const base = { projectId: 'p', parentId: null, kind: 'chapter', order: 0, notes: '', summary: '', wordCount: 0, charCount: 0, createdAt: 1, updatedAt: 1 };
    await legacy.table('chapters').bulkAdd([
      { ...base, id: 'a', title: 'A', status: 'idea', publication: 'planned' },
      { ...base, id: 'b', title: 'B', status: 'outlining', publication: 'planned' },
      { ...base, id: 'c', title: 'C', status: 'drafting', publication: 'written' },
      { ...base, id: 'd', title: 'D', status: 'editing', publication: 'written' },
      { ...base, id: 'e', title: 'E', status: 'complete', publication: 'written' },
      { ...base, id: 'f', title: 'F', status: 'complete', publication: 'published' },
      { ...base, id: 'g', title: 'G', kind: 'scene', status: 'editing', publication: null },
    ]);
    legacy.close();

    const upgraded = new NovelDB('migrate-status');
    const statuses = Object.fromEntries((await upgraded.chapters.toArray()).map((n) => [n.id, n.status]));
    expect(statuses).toEqual({ a: 'idea', b: 'planned', c: 'drafting', d: 'revising', e: 'final', f: 'published', g: 'revising' });
    expect((await upgraded.chapters.toArray()).some((n) => 'publication' in n)).toBe(false);
  });

  it('brings old backup files up to date when they are imported', async () => {
    const p = await projects.create({ title: 'P' });
    const m = manuscript.forProject(p.id);
    await m.create('chapter');
    const file = JSON.parse(JSON.stringify(await projects.exportSnapshot(p.id)));
    file.version = 2;
    Object.assign(file.collections.chapters[0], { status: 'complete', publication: 'published' });
    delete file.collections.chapterPlans;

    const imported = manuscript.forProject((await projects.importSnapshot(file)).id);
    const [chapter] = await imported.list();
    expect(chapter.status).toBe('published');
    expect(chapter).not.toHaveProperty('publication');
    expect(await imported.getPlan(chapter.id)).toMatchObject({ objective: '', beats: [] });
  });
});

