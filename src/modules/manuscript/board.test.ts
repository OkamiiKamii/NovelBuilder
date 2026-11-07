import { beforeEach, describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createProjectService } from '@/modules/projects/service';
import { boardOf, bulkOf, changeWords, dropOf, filterBoard, NO_BOARD_FILTER, placeOf, samePlace, undoProblem, type BoardChange, type Place } from './board';
import { countWords } from './metrics';
import { createManuscriptService, registerManuscript, type ProjectManuscript } from './service';
import { buildTree, flatten } from './tree';
import type { StoryNode } from './types';

let n = 0;
let m: ProjectManuscript;

beforeEach(async () => {
  const db = new NovelDB(`board-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  const p = await projects.create({ title: 'Board' });
  m = createManuscriptService(db, projects.contentChanged).forProject(p.id);
});

const write = (id: string, text: string) => m.saveDoc(id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }, { words: countWords(text), characters: text.length });
const outline = async () => flatten(buildTree(await m.list())).map((t) => `${'  '.repeat(t.depth)}${t.node.title}`);
const titles = (parts: ReturnType<typeof boardOf>) => parts.map((p) => [p.path.map((n) => n.title).join(' › ') || 'top', p.columns.map((c) => `${c.chapter.title}: ${c.scenes.map((s) => s.node.title).join(', ')}`)]);

/**
 * Prologue
 * Act I › Arrival (The gate, The inn), Betrayal (The vault)
 * Act II (empty)
 * Epilogue (The road)
 */
async function book() {
  const prologue = await m.create('chapter', null, 'Prologue');
  const act1 = await m.create('act', null, 'Act I');
  const arrival = await m.create('chapter', act1.id, 'Arrival');
  const betrayal = await m.create('chapter', act1.id, 'Betrayal');
  const act2 = await m.create('act', null, 'Act II');
  const epilogue = await m.create('chapter', null, 'Epilogue');
  const gate = await m.create('scene', arrival.id, 'The gate');
  const inn = await m.create('scene', arrival.id, 'The inn');
  const vault = await m.create('scene', betrayal.id, 'The vault');
  const road = await m.create('scene', epilogue.id, 'The road');
  await write(gate.id, 'one two three');
  await write(inn.id, 'four five');
  await write(arrival.id, 'six');
  await m.update(inn.id, { status: 'drafting', summary: 'A stranger at the inn' });
  return { prologue, act1, arrival, betrayal, act2, epilogue, gate, inn, vault, road };
}

describe('the board is read from the manuscript itself', () => {
  it('a column per chapter, its scenes as cards, grouped by where the chapters sit, in reading order', async () => {
    const b = await book();
    const parts = boardOf(await m.list());
    expect(titles(parts)).toEqual([
      ['top', ['Prologue: ']],
      ['Act I', ['Arrival: The gate, The inn', 'Betrayal: The vault']],
      ['Act II', []],
      ['top', ['Epilogue: The road']],
    ]);
    // Words are the editor's own counts: a chapter's column counts its scenes too.
    expect(parts[1].columns[0].words).toBe(6);
    expect(parts[1].columns[0].scenes.map((s) => s.words)).toEqual([3, 2]);
    // The ends of the parts: the Prologue run ends before Act I; Act I's chapters are last in it; the empty Act II takes chapters at its end.
    expect(parts.map((p) => p.endBeforeId)).toEqual([b.act1.id, null, null, null]);
    // The cards are the nodes themselves, not copies.
    expect(parts[1].columns[0].scenes[1].node).toMatchObject({ id: b.inn.id, status: 'drafting' });
  });

  it('a filter keeps chapters that match or hold a matching scene, with only those scenes', async () => {
    await book();
    const parts = boardOf(await m.list());
    expect(titles(filterBoard(parts, { status: 'drafting', text: '' }))).toEqual([['Act I', ['Arrival: The inn']]]);
    expect(titles(filterBoard(parts, { status: null, text: 'STRANGER' }))).toEqual([['Act I', ['Arrival: The inn']]]);
    expect(titles(filterBoard(parts, { status: null, text: 'betray' }))).toEqual([['Act I', ['Betrayal: ']]]);
    expect(filterBoard(parts, { status: 'published', text: '' })).toEqual([]);
    expect(filterBoard(parts, NO_BOARD_FILTER)).toBe(parts);
  });

  it('a book of 60 chapters and 300 scenes is laid out at once', async () => {
    const at = Date.now();
    const nodes: StoryNode[] = [];
    const node = (id: string, kind: 'chapter' | 'scene', parentId: string | null, order: number): StoryNode => ({ id, projectId: 'p', parentId, kind, title: id, order, summary: '', notes: '', status: 'idea', wordCount: 100, charCount: 500, createdAt: at, updatedAt: at });
    for (let c = 0; c < 60; c++) {
      nodes.push(node(`c${c}`, 'chapter', null, c));
      for (let s = 0; s < 5; s++) nodes.push(node(`c${c}s${s}`, 'scene', `c${c}`, s));
    }
    const started = performance.now();
    const parts = boardOf(nodes);
    expect(performance.now() - started).toBeLessThan(500);
    expect([parts.length, parts[0].columns.length, parts[0].columns[59].scenes.length, parts[0].columns[0].words]).toEqual([1, 60, 5, 600]);
  });
});

describe('moving cards', () => {
  it('where a drop lands, and drops that are not allowed or change nothing', async () => {
    const b = await book();
    const nodes = await m.list();
    const to = (parentId: string | null, beforeId: string | null): Place => ({ parentId, beforeId });
    expect(dropOf(nodes, b.vault.id, to(b.arrival.id, b.inn.id))).toEqual(to(b.arrival.id, b.inn.id));
    // A scene must be in a chapter; a chapter cannot go inside a scene, or itself.
    expect(dropOf(nodes, b.vault.id, to(null, null))).toBeNull();
    expect(dropOf(nodes, b.arrival.id, to(b.gate.id, null))).toBeNull();
    // A "before" that is not in that place is refused rather than guessed at.
    expect(dropOf(nodes, b.vault.id, to(b.arrival.id, b.road.id))).toBeNull();
    // Where it already is: before itself, or before the card already after it.
    expect(dropOf(nodes, b.gate.id, to(b.arrival.id, b.gate.id))).toBeNull();
    expect(dropOf(nodes, b.gate.id, to(b.arrival.id, b.inn.id))).toBeNull();
    expect(samePlace(nodes, b.inn.id, to(b.arrival.id, null))).toBe(true);
    expect(placeOf(nodes, b.gate.id)).toEqual(to(b.arrival.id, b.inn.id));
  });

  it('a chapter carrying scenes into another act is a bulk move, to be asked about; nothing else is', async () => {
    const b = await book();
    const nodes = await m.list();
    expect(bulkOf(nodes, b.arrival.id, { parentId: b.act2.id, beforeId: null })).toEqual({ scenes: 2, words: 6 });
    expect(bulkOf(nodes, b.arrival.id, { parentId: b.act1.id, beforeId: null })).toBeNull();
    expect(bulkOf(nodes, b.prologue.id, { parentId: b.act2.id, beforeId: null })).toBeNull();
    expect(bulkOf(nodes, b.vault.id, { parentId: b.arrival.id, beforeId: null })).toBeNull();
  });

  it('a move goes through the manuscript’s own move, and undo puts back exactly what was there', async () => {
    const b = await book();
    const before = await outline();
    const from = placeOf(await m.list(), b.vault.id)!;
    const to = { parentId: b.arrival.id, beforeId: b.inn.id };
    await m.move(b.vault.id, to.parentId, to.beforeId);
    const moved: BoardChange = { kind: 'move', nodeId: b.vault.id, title: 'The vault', from, to };
    expect(placeOf(await m.list(), b.vault.id)).toEqual(to);
    expect(changeWords(moved, await m.list())).toBe('Moved “The vault” in “Arrival”, before “The inn”.');
    expect(undoProblem(await m.list(), moved)).toBeNull();
    await m.move(b.vault.id, from.parentId, from.beforeId);
    expect(await outline()).toEqual(before);
  });

  it('a chapter moved with its scenes, and back', async () => {
    const b = await book();
    const before = await outline();
    const from = placeOf(await m.list(), b.arrival.id)!;
    await m.move(b.arrival.id, b.act2.id, null);
    expect(titles(boardOf(await m.list())).slice(1, 3)).toEqual([['Act I', ['Betrayal: The vault']], ['Act II', ['Arrival: The gate, The inn']]]);
    expect(undoProblem(await m.list(), { kind: 'move', nodeId: b.arrival.id, title: 'Arrival', from, to: { parentId: b.act2.id, beforeId: null } })).toBeNull();
    await m.move(b.arrival.id, from.parentId, from.beforeId);
    expect(await outline()).toEqual(before);
  });

  it('undo refuses, and says why, when things have changed since', async () => {
    const b = await book();
    const from = placeOf(await m.list(), b.gate.id)!;
    const to = { parentId: b.betrayal.id, beforeId: null };
    await m.move(b.gate.id, to.parentId, to.beforeId);
    const change: BoardChange = { kind: 'move', nodeId: b.gate.id, title: 'The gate', from, to };
    // Moved again elsewhere (in the Organizer, say).
    await m.move(b.gate.id, b.epilogue.id, null);
    expect(undoProblem(await m.list(), change)).toBe('“The gate” has been moved since.');
    await m.move(b.gate.id, to.parentId, to.beforeId);
    expect(undoProblem(await m.list(), change)).toBeNull();
    // The card it stood before is gone.
    await m.remove(b.inn.id);
    expect(undoProblem(await m.list(), change)).toBe('Where “The gate” came from has changed since.');
    await m.remove(b.gate.id);
    expect(undoProblem(await m.list(), change)).toBe('“The gate” no longer exists.');
  });

  it('a status change is undone only while the status is still the one the board set', async () => {
    const b = await book();
    await m.update(b.vault.id, { status: 'final' });
    const change: BoardChange = { kind: 'status', nodeId: b.vault.id, title: 'The vault', from: 'idea', to: 'final' };
    expect(changeWords(change, await m.list())).toBe('“The vault” set to Final.');
    expect(undoProblem(await m.list(), change)).toBeNull();
    await m.update(b.vault.id, { status: 'revising' });
    expect(undoProblem(await m.list(), change)).toBe('The status of “The vault” has been changed since.');
  });

  it('moving touches only where things sit: text, words, summaries and ids stay', async () => {
    const b = await book();
    const keep = (nodes: StoryNode[]) => nodes.map(({ id, title, wordCount, summary, status, kind }) => ({ id, title, wordCount, summary, status, kind })).sort((x, y) => x.id.localeCompare(y.id));
    const before = keep(await m.list());
    await m.move(b.inn.id, b.epilogue.id, b.road.id);
    await m.move(b.betrayal.id, b.act2.id, null);
    expect(keep(await m.list())).toEqual(before);
    expect(JSON.stringify(await m.loadDoc(b.gate.id))).toContain('one two three');
  });
});
