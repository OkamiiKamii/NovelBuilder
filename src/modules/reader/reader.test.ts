import { describe, expect, it } from 'vitest';
import { NovelDB } from '@/core/db';
import { createProjectRegistry } from '@/core/projectRegistry';
import { createManuscriptService, registerManuscript } from '@/modules/manuscript/service';
import { createProjectService } from '@/modules/projects/service';
import { refusal, visible } from '@/modules/sync/access';
import { buildBook, isBreakLine, progressAt, readingMinutes, showsLabel, type DocNode } from './book';
import { contrast, contrastVerdict, createPrefsStore, defaultPrefs, parsePrefs, resolve } from './prefs';
import { createReaderService, registerReader } from './service';

let n = 0;
const para = (text: string, marks?: string[]): DocNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) }] : [] });
const doc = (...blocks: (string | DocNode)[]) => ({ type: 'doc', content: blocks.map((b) => (typeof b === 'string' ? para(b) : b)) });
const said = (pieces: { kind: string; node?: DocNode }[]) => pieces.map((p) => (p.kind === 'break' ? '<break>' : (p.node!.content ?? []).map((c) => c.text ?? '').join('')));

async function world() {
  const db = new NovelDB(`reader-${++n}`);
  const registry = createProjectRegistry();
  const projects = createProjectService(db, registry);
  registerManuscript(registry);
  registerReader(registry);
  const manuscript = createManuscriptService(db, projects.contentChanged);
  const reader = createReaderService(db, projects.contentChanged);
  const p = await projects.create({ title: 'Ashfall', subtitle: 'A Novel', author: 'R. G. Almonte' });
  const m = manuscript.forProject(p.id);
  const volume = await m.create('volume', null, 'The Ash');
  const one = await m.create('chapter', volume.id, 'Chapter 1');
  const two = await m.create('chapter', volume.id, 'The Bell');
  const sceneA = await m.create('scene', two.id, 'Morning');
  const sceneB = await m.create('scene', two.id, 'Night');
  const three = await m.create('chapter', null, 'After');
  const w = { words: 3, characters: 12 };
  await m.saveDoc(one.id, doc('It began in ash.', 'Nobody ran.', '***', 'Later, they did.'), w);
  await m.saveDoc(two.id, doc('The bell rang.'), w);
  await m.saveDoc(sceneA.id, doc('', 'Morning came.', { type: 'horizontalRule' }, 'Still morning.', ''), w);
  await m.saveDoc(sceneB.id, doc(para('Night', ['bold', 'italic']), 'fell.'), w);
  await m.update(two.id, { noteBefore: 'Thanks for reading!', noteAfter: 'Next chapter on Friday.' });
  await reader.forProject(p.id).updateMatter({ dedication: 'For the patient.', epigraph: 'All is ash.', epigraphSource: 'An old song', copyright: '© 2026', aboutAuthor: 'Writes at night.', sceneBreak: '⁂' });
  const source = (await reader.forProject(p.id).load())!;
  return { db, projects, manuscript, reader, p, one, two, three, sceneA, sceneB, volume, source };
}

const dump = async (db: NovelDB): Promise<string> => {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) out[table.name] = await table.toArray();
  return JSON.stringify(out);
};

describe('laying the manuscript out as a book', () => {
  it('puts front matter, part dividers, chapters and back matter in order for a printed novel', async () => {
    const { source } = await world();
    const book = buildBook(source, 'novel');
    expect(book.sections.map((s) => [s.kind, showsLabel(s) ? `${s.label}: ${s.title}` : s.title])).toEqual([
      ['title', 'Title page'], ['copyright', 'Copyright'], ['dedication', 'Dedication'], ['epigraph', 'Epigraph'],
      ['part', 'Volume 1: The Ash'], ['chapter', 'Chapter 1'], ['chapter', 'Chapter 2: The Bell'], ['chapter', 'Chapter 3: After'], ['about', 'About the author'],
    ]);
    expect(book).toMatchObject({ title: 'Ashfall', subtitle: 'A Novel', author: 'R. G. Almonte', chapters: 3, sceneBreak: '⁂' });
    expect(book.sections.filter((s) => s.kind === 'chapter').map((s) => [s.number, s.depth])).toEqual([[1, 1], [2, 1], [3, 0]]);
    // Acknowledgements were left empty, so there is no such page.
    expect(book.sections.some((s) => s.kind === 'acknowledgements')).toBe(false);
  });

  it('adds a cover and an interactive contents page for an ebook, and strips everything but chapters for a web serial', async () => {
    const { source } = await world();
    expect(buildBook(source, 'ebook').sections.map((s) => s.kind)).toEqual(['cover', 'title', 'copyright', 'dedication', 'epigraph', 'contents', 'part', 'chapter', 'chapter', 'chapter', 'about']);
    const serial = buildBook(source, 'serial');
    expect(serial.sections.map((s) => [s.kind, s.number, s.title])).toEqual([['chapter', 1, 'Chapter 1'], ['chapter', 2, 'The Bell'], ['chapter', 3, 'After']]);
    expect(serial.sections[1]).toMatchObject({ noteBefore: 'Thanks for reading!', noteAfter: 'Next chapter on Friday.' });
    expect(serial.sections[0]).toMatchObject({ noteBefore: '', noteAfter: '' });
  });

  it('gathers a chapter’s scenes into it with a scene break between, and reads typed breaks as breaks', async () => {
    const { source } = await world();
    const [one, two, three] = buildBook(source, 'novel').sections.filter((s) => s.kind === 'chapter');
    expect(said(one.pieces)).toEqual(['It began in ash.', 'Nobody ran.', '<break>', 'Later, they did.']);
    // The chapter's own opening, then each scene; blank lines at the edges are dropped, and there is never a break at an end or two together.
    expect(said(two.pieces)).toEqual(['The bell rang.', '<break>', 'Morning came.', '<break>', 'Still morning.', '<break>', 'Night', 'fell.']);
    expect(three.pieces).toEqual([]);
    expect([one.words, two.words, three.words]).toEqual([9, 9, 0]);
    for (const line of ['***', '* * *', '*  *  *  *', '#', '---', '-----', '~~~', '⁂', '  ***  ']) expect(isBreakLine(line)).toBe(true);
    for (const line of ['', '*', '**', 'A * B', '# Heading', '-- no', 'He said ***']) expect(isBreakLine(line)).toBe(false);
  });

  it('keeps the author’s text and formatting exactly, by reference to what is saved', async () => {
    const { source, sceneB } = await world();
    const two = buildBook(source, 'ebook').sections.filter((s) => s.kind === 'chapter')[1];
    const night = two.pieces.find((p) => p.kind === 'text' && p.node.content?.[0]?.text === 'Night');
    expect(night).toMatchObject({ kind: 'text', node: { type: 'paragraph', content: [{ type: 'text', text: 'Night', marks: [{ type: 'bold' }, { type: 'italic' }] }] } });
    expect((night as { node: DocNode }).node).toBe((source.docs.get(sceneB.id) as { content: DocNode[] }).content[0]);
  });

  it('measures progress by words of story, wherever the reader is', async () => {
    const { source } = await world();
    const book = buildBook(source, 'novel');
    const at = (kind: string, nth = 0) => book.sections.findIndex((s, i) => s.kind === kind && book.sections.slice(0, i).filter((x) => x.kind === kind).length === nth);
    expect(book.words).toBe(18);
    expect(progressAt(book, { index: 0, fraction: 0 })).toBe(0);
    expect(progressAt(book, { index: at('chapter', 0), fraction: 0 })).toBe(0);
    expect(progressAt(book, { index: at('chapter', 0), fraction: 1 })).toBe(0.5);
    expect(progressAt(book, { index: at('chapter', 1), fraction: 0.5 })).toBe(0.75);
    expect(progressAt(book, { index: at('about'), fraction: 0 })).toBe(1);
    expect(progressAt(book, { index: 99, fraction: 5 })).toBe(1);
    expect([readingMinutes(0), readingMinutes(250), readingMinutes(1200)]).toEqual([1, 1, 5]);
    const empty = buildBook({ ...source, nodes: [], docs: new Map() }, 'serial');
    expect(empty.sections).toEqual([]);
    expect(progressAt(empty, { index: 0, fraction: 0 })).toBe(0);
  });
});

describe('READ-ONLY RENDERING RULE', () => {
  it('builds every format, any number of times, without changing a byte of what is stored', async () => {
    const { db, reader, p } = await world();
    const before = await dump(db);
    for (let round = 0; round < 3; round++) {
      const source = (await reader.forProject(p.id).load())!;
      for (const format of ['novel', 'ebook', 'serial'] as const) {
        const book = buildBook(source, format);
        for (let index = 0; index < book.sections.length; index++) progressAt(book, { index, fraction: 0.5 });
      }
    }
    expect(await dump(db)).toBe(before);
  });

  it('loads through a transaction the database opens for reading only, so a write from inside it is refused', async () => {
    const { db, p, one } = await world();
    const before = await dump(db);
    await expect(
      db.transaction('r', db.projects, db.chapters, db.chapterContents, db.bookMatter, async () => {
        await db.chapterContents.update(one.id, { doc: { type: 'doc', content: [] } });
      }),
    ).rejects.toThrow();
    await expect(db.transaction('r', db.projects, db.chapters, db.chapterContents, db.bookMatter, () => db.chapters.update(one.id, { title: 'Changed' }))).rejects.toThrow();
    expect(await dump(db)).toBe(before);
    expect((await db.chapters.get(one.id))!.title).toBe('Chapter 1');
    expect(p.title).toBe('Ashfall');
  });

  it('hands the page a copy of the structure, not the stored rows: changing the book changes nothing saved', async () => {
    const { db, reader, p } = await world();
    const before = await dump(db);
    const book = buildBook((await reader.forProject(p.id).load())!, 'novel');
    book.title = 'Vandalised';
    book.sections.length = 0;
    expect(await dump(db)).toBe(before);
    expect(buildBook((await reader.forProject(p.id).load())!, 'novel').sections.length).toBe(9);
  });

  it('keeps the reader’s own settings on the device, apart from every project', async () => {
    const { db } = await world();
    const before = await dump(db);
    const stored = new Map<string, string>();
    const store = createPrefsStore({ getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, v) });
    store.set({ format: 'serial', scheme: 'dark', size: 22, font: 'humanist' });
    expect(store.get()).toMatchObject({ format: 'serial', scheme: 'dark', size: 22, font: 'humanist' });
    expect([...stored.keys()]).toEqual(['novel-builder:reader']);
    expect(createPrefsStore({ getItem: (k) => stored.get(k) ?? null, setItem: () => {} }).get().size).toBe(22);
    expect(await dump(db)).toBe(before);
  });
});

describe('the reader’s settings', () => {
  it('fall back to sound defaults for anything missing or invalid', () => {
    expect(parsePrefs(null)).toEqual(defaultPrefs());
    expect(parsePrefs({ format: 'scroll', font: 'comic', size: 400, leading: 0, measure: 'wide', scheme: 'neon', customBg: 'red', device: 'watch', justify: 'yes' })).toEqual({ ...defaultPrefs(), size: 28, leading: 1.2 });
    expect(parsePrefs({ customBg: '#ABCDEF', customText: '#123456' })).toMatchObject({ customBg: '#abcdef', customText: '#123456' });
  });

  it('follow the format unless told otherwise', () => {
    const base = defaultPrefs();
    expect(resolve({ ...base, format: 'novel' })).toMatchObject({ flow: 'paged', indented: true, justify: true, bg: '#ffffff' });
    expect(resolve({ ...base, format: 'ebook', flow: 'scroll' })).toMatchObject({ flow: 'scroll', indented: true });
    // A web serial scrolls, with space between paragraphs and a ragged right edge, whatever the other settings say.
    expect(resolve({ ...base, format: 'serial', flow: 'paged' })).toMatchObject({ flow: 'scroll', indented: false, justify: false });
    expect(resolve({ ...base, format: 'serial', paragraphs: 'indent' }).indented).toBe(true);
    expect(resolve({ ...base, format: 'novel', paragraphs: 'spaced' }).indented).toBe(false);
    expect(resolve({ ...base, scheme: 'dark' })).toMatchObject({ bg: '#000000', text: '#d6d6d6' });
    expect(resolve({ ...base, scheme: 'custom', customBg: '#112233', customText: '#ffeecc' })).toMatchObject({ bg: '#112233', text: '#ffeecc' });
  });

  it('measure the contrast of a colour pair as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBe(21);
    expect(contrast('#ffffff', '#000000')).toBe(21);
    expect(contrast('#777777', '#ffffff')).toBe(4.5);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    expect([contrastVerdict(21), contrastVerdict(5), contrastVerdict(2)]).toEqual(['comfortable for long reading', 'readable', 'too faint to read comfortably']);
  });
});

describe('front and back matter', () => {
  it('belongs to the project: saved once, copied with it, and readable by whoever may read the book', async () => {
    const { db, projects, reader, p } = await world();
    expect(await db.bookMatter.where('projectId').equals(p.id).count()).toBe(1);
    await reader.forProject(p.id).updateMatter({ acknowledgements: 'To my editor.' });
    expect(await db.bookMatter.where('projectId').equals(p.id).count()).toBe(1);
    expect(await reader.forProject(p.id).matter()).toMatchObject({ dedication: 'For the patient.', acknowledgements: 'To my editor.', sceneBreak: '⁂' });
    const copy = await projects.duplicate(p.id);
    expect(await reader.forProject(copy.id).matter()).toMatchObject({ dedication: 'For the patient.', projectId: copy.id });
    expect((await reader.forProject('nowhere').matter()).dedication).toBe('');
    await expect(reader.forProject('nowhere').updateMatter({ dedication: 'x' })).rejects.toThrow();
    const row = (await db.bookMatter.where('projectId').equals(p.id).toArray())[0] as unknown as Record<string, unknown>;
    for (const role of ['editor', 'reader', 'viewer'] as const) {
      expect(visible(role, 'm', `bookMatter:${row.id as string}`, row, () => null)).toBe(row);
      expect(refusal(role, 'm', `bookMatter:${row.id as string}`, row, { ...row, dedication: 'Mine' })).not.toBeNull();
    }
    expect(refusal('coauthor', 'm', `bookMatter:${row.id as string}`, row, { ...row, dedication: 'Ours' })).toBeNull();
    // A chapter's notes to readers are public; its private notes and summary are not.
    const chapter = { id: 'c', kind: 'chapter', status: 'published', notes: 'private', summary: 'plan', noteBefore: 'Hello readers', noteAfter: 'Bye' };
    expect(visible('viewer', 'm', 'chapters:c', chapter, () => null)).toMatchObject({ notes: '', summary: '', noteBefore: 'Hello readers', noteAfter: 'Bye' });
  });
});
