import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { codex, db, manuscript, projects } from '@/core';
import { dashboardKey } from '@/modules/dashboard/layout';
import { forgetBrowserData, keysFor } from '@/modules/projects/browserData';
import { buildSampleNovel, SAMPLE } from './sample-novel';

/**
 * THE QA SAMPLE NOVEL, AS A FILE
 * The file in this folder is what `buildSampleNovel` makes, saved as the
 * Library saves a backup. It is made the same way every time (ids counted up
 * from one, one fixed clock), so a change to the builder or to how the app
 * stores records shows here. To write it again: `npm run qa:sample`.
 */
const FILE = join(__dirname, 'qa-sample.novel.json');
const CLOCK = Date.UTC(2026, 0, 15, 12, 0, 0);

async function madeFile(): Promise<string> {
  let n = 0;
  const ids = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}` as ReturnType<Crypto['randomUUID']>);
  vi.useFakeTimers({ toFake: ['Date'], now: CLOCK });
  try {
    const id = await buildSampleNovel();
    const file = JSON.stringify(await projects.exportSnapshot(id, { everything: true }), null, 2);
    await projects.remove(id);
    return file;
  } finally {
    ids.mockRestore();
    vi.useRealTimers();
  }
}

/** Every row of every table, as text: to look for ids anywhere at all. */
const everything = async () => JSON.stringify(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()])));

describe('the QA sample novel', () => {
  it('is never there unless imported: the app starts with no novels of its own', async () => {
    expect(await projects.list()).toEqual([]);
  });

  it('the file in this folder is exactly what the builder makes', async () => {
    const made = await madeFile();
    if (process.env.QA_SAMPLE_WRITE) writeFileSync(FILE, made);
    expect(readFileSync(FILE, 'utf8')).toBe(made);
  }, 30_000);

  it('imported on purpose, it is a novel of its own, labelled as test data, and changes no other novel', async () => {
    const mine = await projects.create({ title: 'My real novel' });
    await codex.forProject(mine.id).create('character', 'Someone of mine');
    const chapter = await manuscript.forProject(mine.id).create('chapter', null, 'My chapter');
    const before = JSON.stringify(await Promise.all(db.tables.map(async (t) => [t.name, (await t.toArray()).filter((r) => (r as { projectId?: string }).projectId === mine.id || (r as { id?: string }).id === mine.id)])));

    const sample = await projects.importSnapshot(JSON.parse(readFileSync(FILE, 'utf8')));
    expect(sample.title).toBe(SAMPLE.title);
    expect(sample.tags).toEqual(['qa-sample', 'test data']);
    expect(sample.synopsis).toMatch(/^Test data for checking the app’s views/);
    // Its own ids: nothing in it is the file's, or the other novel's.
    const rows = await db.chapters.where('projectId').equals(sample.id).toArray();
    expect(rows.length).toBe(10);
    expect(rows.every((r) => !r.id.startsWith('00000000-0000-4000-8000-'))).toBe(true);
    expect(rows.some((r) => r.id === chapter.id)).toBe(false);
    const after = JSON.stringify(await Promise.all(db.tables.map(async (t) => [t.name, (await t.toArray()).filter((r) => (r as { projectId?: string }).projectId === mine.id || (r as { id?: string }).id === mine.id)])));
    expect(after).toBe(before);
    // A second import is a second novel, numbered, not a merge into the first.
    const again = await projects.importSnapshot(JSON.parse(readFileSync(FILE, 'utf8')));
    expect(again.title).toBe(`${SAMPLE.title} 2`);
    expect(again.id).not.toBe(sample.id);
    for (const id of [mine.id, sample.id, again.id]) await projects.remove(id);
  });

  it('deleted, it leaves nothing behind: no record, no reference, no setting of this browser', async () => {
    const sample = await projects.importSnapshot(JSON.parse(readFileSync(FILE, 'utf8')));
    const nodeIds = (await db.chapters.where('projectId').equals(sample.id).primaryKeys()) as string[];
    const ids = [sample.id, ...(await Promise.all(db.tables.map(async (t) => (await t.toArray()).filter((r) => (r as { projectId?: string }).projectId === sample.id).map((r) => (r as { id: string }).id)))).flat()];
    expect(ids.length).toBeGreaterThan(50);

    // What the browser keeps for it, beside a setting of another novel and the app's own.
    const data = new Map<string, string>([
      [dashboardKey(sample.id), '{}'],
      [`novel-builder:studio:layout:${sample.id}`, '{}'],
      [`novel-builder:scratch:${sample.id}`, 'notes'],
      [`novel-builder:scroll:${nodeIds[0]}`, '12'],
      [`novel-builder:emergency-draft:${nodeIds[1]}`, '{}'],
      [dashboardKey('another-novel'), '{}'],
      ['novel-builder:theme', 'dark'],
    ]);
    const storage = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k) };
    expect(keysFor(storage, [sample.id, ...nodeIds])).toHaveLength(5);

    await projects.remove(sample.id);
    expect(forgetBrowserData(sample.id, nodeIds, storage)).toHaveLength(5);
    expect([...data.keys()]).toEqual([dashboardKey('another-novel'), 'novel-builder:theme']);
    const left = await everything();
    expect(ids.filter((id) => left.includes(id))).toEqual([]);
  });

  it('is never part of the app: nothing the app is built from includes it', () => {
    const root = join(__dirname, '..');
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    // No app source names this folder or the file (tests aside, which are never built).
    const sources = files(join(root, 'src')).filter((f) => /\.(ts|tsx|css|html|json)$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(sources.filter((f) => /qa-sample|['"/]qa\//.test(readFileSync(f, 'utf8')))).toEqual([]);
    // Nothing that is copied into a build as it is (`public/`), and the page the build starts from, holds it.
    expect(files(join(root, 'public')).filter((f) => f.endsWith('.novel.json') || readFileSync(f).includes(SAMPLE.title))).toEqual([]);
    expect(readFileSync(join(root, 'index.html'), 'utf8')).not.toMatch(/qa/i);
  });
});
