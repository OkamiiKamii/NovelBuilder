import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry, type ProjectRegistry } from '@/core/projectRegistry';
import { createProjectService, InvalidSnapshotError, type ProjectService } from './service';

// Stands in for a future phase's table (e.g. the chapter tree) so the
// isolation guarantees are proven against real child data.
interface Node {
  id: string;
  projectId: string;
  parentId: string | null;
  linkedIds: string[];
  body: string;
}

let dbCount = 0;
let db: NovelDB;
let registry: ProjectRegistry;
let service: ProjectService;

const nodesOf = (projectId: string) => db.table<Node>('nodes').where('projectId').equals(projectId).toArray();

async function seedNodes(projectId: string) {
  const root: Node = { id: `${projectId}-root`, projectId, parentId: null, linkedIds: [], body: 'one two three' };
  const child: Node = { id: `${projectId}-child`, projectId, parentId: root.id, linkedIds: [root.id], body: `see [[${root.id}]]` };
  await db.table('nodes').bulkAdd([root, child]);
  return { root, child };
}

beforeEach(async () => {
  db = new NovelDB(`test-${++dbCount}`);
  db.version(99).stores({ nodes: 'id, projectId' });
  registry = createProjectRegistry();
  registry.registerCollection({
    table: 'nodes',
    refs: ['parentId', 'linkedIds'],
    remap: (row, mapId) => ({ ...row, body: String(row.body).replace(/\[\[(.+?)\]\]/g, (_, id) => `[[${mapId(id)}]]`) }),
  });
  registry.registerStats(async (database, projectId) => {
    const rows = await database.table<Node>('nodes').where('projectId').equals(projectId).toArray();
    return { wordCount: rows.reduce((n, r) => n + r.body.split(/\s+/).length, 0), counts: { nodes: rows.length } };
  });
  service = createProjectService(db, registry);
});

describe('create / update', () => {
  it('normalises input and starts with empty stats', async () => {
    const p = await service.create({ title: '  Ashfall  ', tags: ['epic', 'epic', ' '], targetWordCount: -5, status: 'nope' as never });
    expect(p).toMatchObject({ title: 'Ashfall', tags: ['epic'], targetWordCount: null, status: 'planning', archived: false });
    expect(await service.getStats(p.id)).toMatchObject({ wordCount: 0, counts: {} });
  });

  it('keeps genres distinct and accepts only image covers', async () => {
    const p = await service.create({ title: 'A', primaryGenre: 'Fantasy', secondaryGenres: ['LitRPG', 'fantasy', 'LitRPG', ''], cover: 'javascript:alert(1)' });
    expect(p).toMatchObject({ primaryGenre: 'Fantasy', secondaryGenres: ['LitRPG'], cover: null });
    await service.update(p.id, { cover: 'data:image/png;base64,AAAA' });
    expect((await service.get(p.id))!.cover).toBe('data:image/png;base64,AAAA');
  });

  it('falls back to a title when none is given', async () => {
    expect((await service.create({ title: '   ' })).title).toBe('Untitled project');
  });

  it('updates only the given fields and bumps updatedAt', async () => {
    const p = await service.create({ title: 'A', primaryGenre: 'Fantasy' });
    await new Promise((r) => setTimeout(r, 2));
    await service.update(p.id, { title: 'B' });
    const next = await service.get(p.id);
    expect(next).toMatchObject({ title: 'B', primaryGenre: 'Fantasy', createdAt: p.createdAt });
    expect(next!.updatedAt).toBeGreaterThan(p.updatedAt);
  });

  it('rejects updates to a missing project', async () => {
    await expect(service.update('missing', { title: 'x' })).rejects.toThrow('not found');
  });
});

describe('isolation', () => {
  it('delete removes only the target project and its rows', async () => {
    const a = await service.create({ title: 'A' });
    const b = await service.create({ title: 'B' });
    await seedNodes(a.id);
    await seedNodes(b.id);

    await service.remove(a.id);

    expect(await service.get(a.id)).toBeUndefined();
    expect(await nodesOf(a.id)).toHaveLength(0);
    expect(await db.projectStats.get(a.id)).toBeUndefined();
    expect(await nodesOf(b.id)).toHaveLength(2);
    expect(await service.get(b.id)).toBeDefined();
  });

  it('stats are computed per project', async () => {
    const a = await service.create({ title: 'A' });
    const b = await service.create({ title: 'B' });
    await seedNodes(a.id);
    expect(await service.recomputeStats(a.id)).toMatchObject({ wordCount: 5, counts: { nodes: 2 } });
    expect(await service.recomputeStats(b.id)).toMatchObject({ wordCount: 0, counts: { nodes: 0 } });
  });
});

describe('duplicate', () => {
  it('deep-copies rows with fresh ids and rewritten references', async () => {
    const a = await service.create({ title: 'A', primaryGenre: 'Fantasy', secondaryGenres: ['LitRPG'], cover: 'https://example.com/c.png', targetWordCount: 90000 });
    const { root, child } = await seedNodes(a.id);
    await service.setPinned(a.id, true);

    const copy = await service.duplicate(a.id);

    expect(copy).toMatchObject({ title: 'A (Copy)', primaryGenre: 'Fantasy', secondaryGenres: ['LitRPG'], cover: 'https://example.com/c.png', targetWordCount: 90000, pinned: false });
    expect(copy.id).not.toBe(a.id);

    const copied = await nodesOf(copy.id);
    expect(copied).toHaveLength(2);
    const newRoot = copied.find((n) => n.parentId === null)!;
    const newChild = copied.find((n) => n.parentId !== null)!;
    expect([newRoot.id, newChild.id]).not.toContain(root.id);
    expect([newRoot.id, newChild.id]).not.toContain(child.id);
    expect(newChild.parentId).toBe(newRoot.id);
    expect(newChild.linkedIds).toEqual([newRoot.id]);
    expect(newChild.body).toBe(`see [[${newRoot.id}]]`);

    // Source untouched, and stats carried over by recomputation.
    expect(await nodesOf(a.id)).toEqual([root, child].sort((x, y) => x.id.localeCompare(y.id)));
    expect(await service.getStats(copy.id)).toMatchObject({ wordCount: 5, counts: { nodes: 2 } });
  });

  it('editing the copy does not affect the original', async () => {
    const a = await service.create({ title: 'A' });
    const { root } = await seedNodes(a.id);
    const copy = await service.duplicate(a.id);
    await db.table<Node>('nodes').where('projectId').equals(copy.id).modify({ body: 'changed' });
    await service.remove(copy.id);
    expect((await db.table<Node>('nodes').get(root.id))!.body).toBe('one two three');
  });

  it('numbers repeated copies', async () => {
    const a = await service.create({ title: 'A' });
    await service.duplicate(a.id);
    expect((await service.duplicate(a.id)).title).toBe('A (Copy) 2');
  });
});

describe('export / import', () => {
  it('round-trips through JSON as an independent project', async () => {
    const a = await service.create({ title: 'A', synopsis: 'S' });
    await seedNodes(a.id);
    const file = JSON.parse(JSON.stringify(await service.exportSnapshot(a.id)));

    const imported = await service.importSnapshot(file);

    expect(imported.id).not.toBe(a.id);
    expect(imported).toMatchObject({ title: 'A 2', synopsis: 'S' });
    expect(await nodesOf(imported.id)).toHaveLength(2);
    expect(await nodesOf(a.id)).toHaveLength(2);
    expect(await service.list()).toHaveLength(2);
  });

  it('exports a JSON document with a slot for every future module', async () => {
    const a = await service.create({ title: 'A' });
    await seedNodes(a.id);
    const file = JSON.parse(JSON.stringify(await service.exportSnapshot(a.id)));
    expect(file.project.id).toBe(a.id);
    expect(file.collections).toMatchObject({ chapters: [], characters: [], loreEntries: [], outlines: [] });
    expect(file.collections.nodes).toHaveLength(2);
  });

  it('imports files written before genres were split', async () => {
    const a = await service.create({ title: 'A' });
    const file = await service.exportSnapshot(a.id);
    const legacy = { ...file, version: 1, project: { ...file.project, primaryGenre: undefined, genre: 'Horror' } };
    expect(await service.importSnapshot(legacy)).toMatchObject({ primaryGenre: 'Horror', secondaryGenres: [] });
  });

  it('rejects foreign or malformed files without writing anything', async () => {
    for (const bad of [null, 'text', {}, { format: 'other' }, { format: 'novel-builder/project', version: 99, project: {} }]) {
      await expect(service.importSnapshot(bad)).rejects.toBeInstanceOf(InvalidSnapshotError);
    }
    expect(await service.list()).toHaveLength(0);
  });

  it('never writes into tables that are not the project’s own, and says so instead of dropping them quietly', async () => {
    const a = await service.create({ title: 'A' });
    const file = await service.exportSnapshot(a.id);
    const before = (await service.list()).length;
    await expect(service.importSnapshot({ ...file, collections: { projects: [{ id: 'evil', title: 'x' }] } })).rejects.toThrow('it holds records this version of the app cannot keep: projects (1)');
    expect(await service.get('evil')).toBeUndefined();
    expect(await service.list()).toHaveLength(before);
  });
});

describe('schema migration', () => {
  it('upgrades v1 projects to primary/secondary genres', async () => {
    const legacy = new Dexie('migrate-me');
    legacy.version(1).stores({ projects: 'id, updatedAt, status', projectStats: 'projectId' });
    await legacy.table('projects').add({ id: 'p1', title: 'Old', genre: 'Sci-Fi', tags: [], updatedAt: 1, status: 'drafting' });
    legacy.close();

    const upgraded = new NovelDB('migrate-me');
    const project = (await upgraded.projects.get('p1')) as unknown as Record<string, unknown>;
    expect(project).toMatchObject({ title: 'Old', primaryGenre: 'Sci-Fi', secondaryGenres: [], cover: null });
    expect(project).not.toHaveProperty('genre');
  });
});
