// Ports of flutter_app/test/shared/domain/template_files_test.dart and the manuscript parts of
// flutter_app/test/features/exchange/exchange_service_test.dart (on a real library in memory): template files go out
// and come back exactly and carry nothing of the novel; non-template data is left out and counted; a file over a limit
// or not a template is refused whole; a newer version is recognised. Every format is made from a real novel; one part
// exports under its own name; an import adds after what is there and changes nothing else, or is refused whole; a Word
// file Scriptor made comes back as the same chapters.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

import { ExchangeService, safeName } from '../../src/data/exchangeService';
import { openLibrary } from '../../src/data/library';
import { CodexChanges } from '../../src/domain/codex/codexChanges';
import { bibleExport, compiledToJson, compileNovel, HeadingBlock, readerExport } from '../../src/domain/exchange/compile';
import { ImportException, parseMarkdown } from '../../src/domain/exchange/importParse';
import { buildStructure } from '../../src/domain/exchange/importStructure';
import { type JsonMap, mapOrNull, str } from '../../src/domain/json';
import { StoryModel } from '../../src/domain/model/storyModel';
import { OutlineError } from '../../src/domain/outline';
import { blockTexts, measureDoc } from '../../src/domain/prose';
import { Category } from '../../src/domain/records/category';
import { maps } from '../../src/domain/records/jsonRecord';
import {
  type TemplateKind,
  TemplateFileException,
  layoutContent,
  makeSharedTemplate,
  readTemplateFile,
  standingOf,
  systemContent,
  templateFormat,
  templateKindKey,
} from '../../src/domain/sharing/templateFiles';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson, testIds } from '../fixtures';
import { memoryLibrary } from '../nodeSql';

const load = (name: string) => NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`)));

describe('template files', () => {
  let ids = 0;
  const id = () => `new-${ids++}`;
  const novel = load('made-in-the-app');
  const share = (kind: TemplateKind, content: JsonMap) =>
    makeSharedTemplate({ kind, id: 'tpl-1', version: 2, name: 'My template', description: 'For testing.', author: 'Test Author', license: 'ccBy', now: 1800000000000, content, newId: id });
  const file = (kind: TemplateKind, content: unknown, extra: JsonMap = {}) => ({
    format: templateFormat,
    version: 1,
    kind: templateKindKey[kind],
    id: 'x',
    templateVersion: 1,
    name: 'X',
    content,
    ...extra,
  });
  const refusal = (json: unknown) => {
    try {
      readTemplateFile(typeof json === 'string' ? json : JSON.stringify(json), id);
    } catch (e) {
      if (e instanceof TemplateFileException) return e.message;
      throw e;
    }
    return 'taken in';
  };
  const categories = () => novel.rows('loreSchemas').map((r) => CodexChanges.kindTemplate(new Category(r)));

  test('categories go out and come back exactly, with who made them, the terms and the version', () => {
    const shared = share('categories', { categories: categories() });
    const back = readTemplateFile(shared.toFileText(), id);
    expect(back.kind).toBe('categories');
    expect(JSON.stringify(back.content)).toBe(JSON.stringify(shared.content));
    expect([back.id, back.version, back.name, back.author, back.license]).toEqual(['tpl-1', 2, 'My template', 'Test Author', 'ccBy']);
    expect(back.leftOut).toBe(0);
    expect(maps(back.content['categories']).length).toBe(categories().length);
    expect(back.summary.length).toBeGreaterThan(0);
  });

  test('a template made from a real novel carries none of its records, text or notes', () => {
    const text = share('categories', { categories: categories() }).toFileText();
    const system = share('system', systemContent(novel.rows('systems')[0])).toFileText();
    for (const out of [text, system]) {
      for (const collection of ['loreEntries', 'chapters', 'chapterContents', 'characterSecrets', 'timelineEvents']) {
        for (const r of novel.rows(collection)) expect([collection, out.includes(str(r['id']))]).toEqual([collection, false]);
      }
      for (const r of novel.rows('loreEntries')) {
        if (str(r['notes']).length > 8) expect(out.includes(str(r['notes']))).toBe(false);
        if (str(r['description']).length > 12) expect(out.includes(str(r['description']))).toBe(false);
      }
      expect(out.includes(novel.projectId)).toBe(false);
    }
  });

  test('a profile layout and a system go out and come back exactly', () => {
    const layout = share(
      'profileLayout',
      layoutContent({
        sections: [
          {
            name: 'Combat',
            tab: 'details',
            fields: [
              { name: 'Weapon', type: 'text' },
              { name: 'Style', type: 'select', options: ['Swift', 'Heavy'] },
            ],
          },
        ],
      }),
    );
    expect(JSON.stringify(readTemplateFile(layout.toFileText(), id).content)).toBe(JSON.stringify(layout.content));
    const row = novel.rows('systems')[0];
    const system = share('system', systemContent(row));
    const back = readTemplateFile(system.toFileText(), id);
    expect(JSON.stringify(back.content)).toBe(JSON.stringify(system.content));
    expect('projectId' in back.content).toBe(false);
    expect('createdAt' in back.content).toBe(false);
    // Formulas travel as the words the author wrote; they are read by the app's own arithmetic, never run.
    for (const f of maps(row['variables']).map((v) => str(v['formula'])).filter((x) => x.length > 0)) {
      expect(JSON.stringify(back.content).includes(JSON.stringify(f).replaceAll('"', ''))).toBe(true);
    }
  });

  test('anything that is not template data is left out, and counted', () => {
    const read = readTemplateFile(
      JSON.stringify(
        file(
          'categories',
          {
            categories: [
              {
                key: 'custom-spells',
                name: 'Spells',
                color: '#123456',
                onLoad: 'alert(1)',
                fields: [
                  { id: 'f1', name: 'Cost', type: 'number', script: 'rm -rf /', archived: false },
                  { id: 'f2', name: 'Old', type: 'text', archived: true },
                ],
                entries: [{ name: 'A secret entry' }],
              },
            ],
            manuscript: 'Chapter one...',
          },
          { run: 'code', author: 'Someone' },
        ),
      ),
      id,
    );
    const text = JSON.stringify(read.toJson());
    for (const bad of ['alert(1)', 'rm -rf', 'A secret entry', 'Chapter one', 'code']) expect([bad, text.includes(bad)]).toEqual([bad, false]);
    expect(read.leftOut).toBeGreaterThanOrEqual(4);
    const fields = maps(maps(read.content['categories'])[0]['fields']);
    expect(fields.map((f) => f['name'])).toEqual(['Cost']);
    const allowed = new Set(['id', 'name', 'type', 'options', 'required', 'help', 'min', 'max', 'target']);
    expect(Object.keys(fields[0]).filter((k) => !allowed.has(k))).toEqual([]);
  });

  test('a file over a limit, of an unknown kind, or not a template is refused whole, with the reason', () => {
    const long = 'x'.repeat(2001);
    expect(refusal('not json at all')).toContain('could not be read');
    expect(refusal({ format: 'novel-builder/project' })).toContain('not a Novel Builder template file');
    expect(refusal({ ...file('categories', {}), version: 2 })).toContain('newer version');
    expect(refusal({ ...file('categories', {}), kind: 'macro' })).toContain('does not know');
    expect(refusal(file('categories', { categories: [] }))).toContain('nothing to use');
    expect(refusal(file('categories', { categories: Array.from({ length: 101 }, (_, i) => ({ name: `C${i}`, fields: [] })) }))).toContain(
      'more than 100 categories',
    );
    expect(refusal(file('categories', { categories: [{ name: long }] }))).toContain('longer than');
    expect(refusal(file('categories', { categories: [{ name: 'C', fields: [{ name: 'F', type: 'formula' }] }] }))).toContain(
      'field of a kind this app does not know',
    );
    expect(refusal(file('profileLayout', { sections: [{ name: 'S', fields: [{ name: 'F', type: 'executable' }] }] }))).toContain(
      'field of a kind this app does not know',
    );
    let deep: unknown = 'x';
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(refusal(file('system', { name: 'S', variables: [deep] }))).toContain('nested');
    expect(refusal(`{"format":"novel-builder/template","pad":"${'y'.repeat(1000001)}"}`)).toContain('larger than');
  });

  test('a newer version of a template is recognised; the same or an older one is not taken as new', () => {
    const t = share('categories', { categories: [{ name: 'Spells', fields: [] }] });
    expect(standingOf(t, [])).toBe('added');
    expect(standingOf(t, [{ id: 'tpl-1', version: 1 }])).toBe('newer');
    expect(standingOf(t, [{ id: 'tpl-1', version: 2 }])).toBe('sameOrOlder');
    expect(standingOf(t, [{ id: 'other', version: 9 }])).toBe('added');
  });
});

describe('the manuscript, in and out', () => {
  const setUp = () => {
    let now = 1800000000000;
    const lib = openLibrary(memoryLibrary(), () => (now += 1000), testIds());
    const exchange = new ExchangeService(lib.novels, () => now, testIds());
    return { lib, exchange };
  };
  const stored = (lib: ReturnType<typeof setUp>['lib'], name: string) => {
    const snapshot = load(name);
    lib.novels.putNovel(snapshot);
    return snapshot.projectId;
  };
  const md = () => new Uint8Array(readFileSync(join(flutterFixturesDir, 'exchange', 'novel.md')));

  test('makes every format from a real novel, each a file of its kind', () => {
    const { lib, exchange } = setUp();
    const id = stored(lib, 'qa-sample');
    const compiled = exchange.compile(id, readerExport);
    const parts = Object.keys(unzipSync(exchange.render(compiled, 'docx')));
    expect(parts).toEqual(expect.arrayContaining(['word/document.xml', 'word/styles.xml', '[Content_Types].xml', 'docProps/core.xml']));
    const pdf = exchange.render(compiled, 'pdf');
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-');
    const text = (b: Uint8Array) => new TextDecoder().decode(b);
    expect(text(exchange.render(compiled, 'html')).startsWith('<!doctype html>')).toBe(true);
    expect(text(exchange.render(compiled, 'md')).startsWith('# QA Sample')).toBe(true);
    expect(text(exchange.render(compiled, 'txt')).startsWith('QA SAMPLE')).toBe(true);
    expect(compiled.wordCount).toBeGreaterThan(0);
  });

  test('one part of the book can be exported on its own, under its own file name', () => {
    const { lib, exchange } = setUp();
    const id = stored(lib, 'qa-sample');
    const part = exchange.scopes(id).find((s) => s.node.kindKey !== 'chapter')!;
    const compiled = exchange.compile(id, { ...readerExport, scopeId: part.node.id });
    expect((compiled.blocks[0] as HeadingBlock).text.endsWith(`: ${part.node.title}`)).toBe(true);
    expect(compiled.chapterCount).toBeLessThan(exchange.compile(id, readerExport).chapterCount + 1);
    expect(ExchangeService.fileName('T', 'docx', part.node.displayTitle)).toBe(`T - ${safeName(part.node.displayTitle)}.docx`);
    expect(ExchangeService.fileName(' A/B: C? ', 'pdf')).toBe('AB C.pdf');
  });

  test('private notes reach the file only through their switch', () => {
    const fixture = load('qa-sample');
    const chapter = fixture.rows('chapters').find((r) => r['kind'] === 'chapter')!;
    const snapshot = fixture.putRow('chapters', { ...chapter, notes: 'SECRET NOTE' });
    const all = (o: typeof readerExport) => JSON.stringify(compiledToJson(compileNovel(snapshot, o)));
    expect(all(readerExport)).not.toContain('SECRET NOTE');
    expect(all(bibleExport)).toContain('SECRET NOTE');
  });

  test('adds what a file holds after what is there, text and formatting intact, and changes nothing else', () => {
    const { lib, exchange } = setUp();
    const p = lib.library.create({ title: 'T' }).novel.id;
    for (const n of lib.manuscript.nodes(p)) lib.manuscript.delete(p, n.id, n.title);
    lib.manuscript.create(p, 'chapter', null, 'Already here');
    const nodes = buildStructure(exchange.read('novel.md', md()), { splitChapters: true, splitScenes: true, fallbackTitle: 'novel' });
    const before = lib.manuscript.nodes(p).map((n) => JSON.stringify(n.raw));
    const created = exchange.importNodes(p, null, nodes);
    const all = lib.manuscript.nodes(p);
    expect(created.length).toBe(all.length - 1);
    for (const n of before) expect(all.map((x) => JSON.stringify(x.raw))).toContain(n);
    const top = all.filter((n) => n.parentId === null).sort((a, b) => a.order - b.order);
    expect(top[0].title).toBe('Already here');
    expect(top.slice(1).map((n) => `${n.kind}: ${n.title}`)).toEqual(['volume: The Ember Crown', 'chapter: Chapter 2', 'volume: Part Two: Embers']);
    const chapter1 = all.find((n) => n.title === 'Chapter 1')!;
    const scene = all.find((n) => n.parentId === chapter1.id && n.kind === 'scene')!;
    const doc = mapOrNull(lib.novels.rowsIn(p, 'chapterContents').find((r) => r['id'] === scene.id)?.['doc'])!;
    const json = JSON.stringify(doc);
    for (const want of ['"bold"', '"italic"', 'blockquote', 'black gate']) expect(json).toContain(want);
    expect(Number(scene.raw['wordCount'])).toBe(measureDoc(doc).words);
    expect(scene.raw['status']).toBe('drafting');
  });

  test('a structure that cannot go where asked is refused whole: nothing is added', () => {
    const { lib, exchange } = setUp();
    const p = lib.library.create({ title: 'T' }).novel.id;
    const chapter = lib.manuscript.nodes(p)[0] ?? lib.manuscript.create(p, 'chapter', null, 'Already here');
    const nodes = buildStructure(parseMarkdown(new TextDecoder().decode(md())), { splitChapters: true, splitScenes: true, fallbackTitle: 'x' });
    const before = JSON.stringify(lib.novels.load(p)!.toJson(0));
    expect(() => exchange.importNodes(p, chapter.id, nodes)).toThrow(OutlineError);
    expect(JSON.stringify(lib.novels.load(p)!.toJson(0))).toBe(before);
  });

  test('a Word file Scriptor made comes back as the same chapters with the same paragraphs', () => {
    const { lib, exchange } = setUp();
    const id = stored(lib, 'qa-sample');
    const p = lib.library.create({ title: 'T' }).novel.id;
    const source = lib.novels.load(id)!;
    const docx = exchange.render(exchange.compile(id, readerExport), 'docx');
    exchange.importNodes(p, null, buildStructure(exchange.read('back.docx', docx), { splitChapters: true, splitScenes: true, fallbackTitle: 'back' }));
    const model = StoryModel.fromSnapshot(source);
    const texts = new Set<string>();
    for (const n of model.nodes.values()) {
      if (n.kindKey !== 'chapter' && n.kindKey !== 'scene') continue;
      for (const t of blockTexts(source.rows('chapterContents').find((r) => r['id'] === n.id)?.['doc'])) if (t.trim().length > 0) texts.add(t);
    }
    const imported = new Set(lib.novels.rowsIn(p, 'chapterContents').flatMap((r) => blockTexts(r['doc'])));
    expect([...texts].filter((t) => !imported.has(t))).toEqual([]);
    const titles = new Set(lib.manuscript.nodes(p).map((n) => n.title));
    expect([...model.nodes.values()].filter((n) => n.kindKey === 'chapter' && !titles.has(n.title)).map((n) => n.title)).toEqual([]);
  });

  test('a file that is not a manuscript says why, and nothing is added', () => {
    const { exchange } = setUp();
    expect(() => exchange.read('old.doc', new Uint8Array([1, 2, 3]))).toThrow(ImportException);
    expect(() => exchange.read('broken.docx', new TextEncoder().encode('nope'))).toThrow(ImportException);
  });
});
