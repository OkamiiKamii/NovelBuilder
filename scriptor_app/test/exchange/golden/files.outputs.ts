// Scriptor's side of files.dump.dart: the same parts, made the same way, keyed the same. See that file for what each
// part is.

import { strFromU8, unzipSync } from 'fflate';

import { CodexChanges, categoriesOf } from '../../../src/domain/codex/codexChanges';
import { bibleExport, compileNovel } from '../../../src/domain/exchange/compile';
import { type ImportBlock, ImportException, parseMarkdown } from '../../../src/domain/exchange/importParse';
import { type ImportNode, buildStructure, metricsOf, parseFile, toDoc } from '../../../src/domain/exchange/importStructure';
import { addImportedTree, importItemOf } from '../../../src/domain/exchange/importTree';
import {
  csvCell,
  exportFileName,
  exportRecords,
  filterWords,
  namesJson,
  notABackup,
  recordKinds,
  recordsCsv,
  recordsJson,
  viewData,
} from '../../../src/domain/exchange/recordsExport';
import { renderDocx } from '../../../src/domain/exchange/renderDocx';
import type { JsonMap } from '../../../src/domain/json';
import { str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { OutlineError } from '../../../src/domain/outline';
import { whenWords } from '../../../src/domain/progression/track';
import {
  type SharedTemplate,
  type TemplateKind,
  TemplateFileException,
  layoutContent,
  makeSharedTemplate,
  readTemplateFile,
  standingOf,
  systemContent,
} from '../../../src/domain/sharing/templateFiles';
import type { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';

let n = 0;
const nextId = () => `id${++n}`;

const runJson = (r: { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean }) => ({
  text: r.text,
  ...(r.bold ? { bold: true } : {}),
  ...(r.italic ? { italic: true } : {}),
  ...(r.underline ? { underline: true } : {}),
  ...(r.strike ? { strike: true } : {}),
});

const blockJson = (b: ImportBlock): unknown =>
  b.type === 'heading'
    ? { type: 'heading', level: b.level, text: b.text }
    : b.type === 'paragraph'
      ? { type: 'paragraph', runs: b.runs.map(runJson), ...(b.align !== null ? { align: b.align } : {}), ...(b.quote ? { quote: true } : {}) }
      : { type: 'divider' };

const nodeJson = (node: ImportNode): unknown => ({
  kind: node.kind,
  title: node.title,
  words: metricsOf(node.blocks).words,
  doc: toDoc(node.blocks),
  children: node.children.map(nodeJson),
});

const templateJson = (t: SharedTemplate) => ({ file: t.toFileText(), summary: t.summary, leftOut: t.leftOut, json: t.toJson() });

function made(kind: TemplateKind, name: string, content: JsonMap): unknown {
  try {
    const t = makeSharedTemplate({
      kind,
      id: 'lineage',
      version: 3,
      name,
      description: ' A description. ',
      author: ' Ana ',
      license: 'ccBy',
      now: 1700000000000,
      content,
      newId: nextId,
    });
    const back = readTemplateFile(t.toFileText(), nextId);
    return {
      made: templateJson(t),
      back: templateJson(back),
      standing: [
        [],
        [{ id: 'lineage', version: 2 }],
        [{ id: 'lineage', version: 3 }],
        [
          { id: 'other', version: 9 },
          { id: 'lineage', version: 4 },
        ],
      ].map((held) => standingOf(back, held)),
    };
  } catch (e) {
    if (e instanceof TemplateFileException) return { refused: e.message };
    throw e;
  }
}

function tryRead(text: string): unknown {
  try {
    return templateJson(readTemplateFile(text, nextId));
  } catch (e) {
    if (e instanceof TemplateFileException) return { refused: e.message };
    throw e;
  }
}

function tryParse(name: string, bytes: Uint8Array): unknown {
  try {
    const blocks = parseFile(name, bytes);
    const splits: Record<string, unknown> = {};
    for (const [key, ch, sc] of [
      ['both', true, true],
      ['chapters', true, false],
      ['scenes', false, true],
      ['none', false, false],
    ] as const) {
      splits[key] = buildStructure(blocks, { splitChapters: ch, splitScenes: sc, fallbackTitle: 'File' }).map(nodeJson);
    }
    return { blocks: blocks.map(blockJson), splits };
  } catch (e) {
    if (e instanceof ImportException) return { refused: e.reason };
    throw e;
  }
}

const utf8 = (text: string) => new TextEncoder().encode(text);
const latin1 = (text: string) => Uint8Array.from(Array.from(text, (c) => c.charCodeAt(0)));

function zipParts(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(unzipSync(bytes))) out[k] = strFromU8(v);
  return out;
}

export function novel(s: NovelSnapshot, importMd: string): Record<string, unknown> {
  n = 0;
  const model = StoryModel.fromSnapshot(s);
  const out: Record<string, unknown> = {};

  const categories = [...categoriesOf(s).values()].filter((c) => !c.archived).map((c) => CodexChanges.kindTemplate(c));
  out['categoriesTemplate'] = made('categories', 'Categories', { categories });
  out['layoutTemplates'] = s.rows('characterTemplates').map((r) => made('profileLayout', str(r['name']), layoutContent(r)));
  out['systemTemplates'] = s.rows('systems').map((r) => made('system', str(r['name']), systemContent(r)));

  const heading = ['Records of the novel', 'Exported 2026-10-22T10:00:00.000Z', 'No filters', notABackup];
  const csv: Record<string, string> = {};
  for (const [view, kinds] of Object.entries(viewData)) csv[view] = recordsCsv(exportRecords(model, kinds), heading);
  out['csv'] = csv;
  const all = exportRecords(model, recordKinds, { includePrivate: true });
  out['allKinds'] = { records: recordsJson(all), names: namesJson(all), count: all.count };
  out['allCsv'] = recordsCsv(all, heading);

  const characters = [...model.entries.values()].filter((e) => e.category === 'character').map((e) => e.id);
  const threads = [...model.threads.keys()];
  const nodes = model.order.chapters.map((c) => c.id);
  const events = [...model.events.keys()];
  out['filters'] = filterWords(
    {
      text: '  the  ',
      characters: characters.slice(0, 2),
      locations: ['not-a-record'],
      threads: threads.slice(0, 1),
      canon: ['canon', 'provisional'],
      status: ['draft'],
      significance: ['major'],
      categories: ['character', 'location'],
      ...(nodes.length > 0 ? { chapters: { from: nodes[0], to: null } } : {}),
      ...(events.length > 0 ? { time: { from: { kind: 'event', eventId: events[0] }, until: null } } : {}),
    },
    model,
    (at) => whenWords(at, model),
  );

  out['bibleDocx'] = zipParts(renderDocx(compileNovel(s, bibleExport)));

  const blocks = parseMarkdown(importMd);
  const structure = buildStructure(blocks, { splitChapters: true, splitScenes: true, fallbackTitle: 'novel' });
  const imported = (parentId: string | null, list: ImportNode[]) => {
    try {
      const r = addImportedTree(s, parentId, list.map(importItemOf), { now: 1700000000000, createId: nextId });
      return {
        created: r.created,
        rows: r.created.map((id) => r.snapshot.rows('chapters').find((x) => x['id'] === id)),
        contents: r.created.flatMap((id) => r.snapshot.rows('chapterContents').filter((x) => x['id'] === id)),
      };
    } catch (e) {
      if (e instanceof OutlineError) return { refused: e.message };
      throw e;
    }
  };
  out['importTop'] = imported(null, structure);
  const volume = [...model.nodes.values()].find((x) => x.kindKey === 'volume') ?? null;
  const chaptersOnly = buildStructure(blocks, { splitChapters: true, splitScenes: false, fallbackTitle: 'novel' }).filter((x) => x.kind === 'chapter');
  out['importIntoVolume'] = volume === null ? null : imported(volume.id, chaptersOnly);
  const chapter = model.order.chapters[0] ?? null;
  out['importRefused'] = chapter === null ? null : imported(chapter.id, structure);
  return out;
}

export function misc(): Record<string, unknown> {
  n = 0;
  const good = {
    format: 'novel-builder/template',
    version: 1,
    kind: 'categories',
    id: 'abc',
    templateVersion: 2,
    name: '  Spells  ',
    author: 'Ana',
    license: 'cc0',
    madeAt: 1700000000000,
    extra: true,
    content: {
      categories: [
        {
          key: 'spells',
          name: 'Spells',
          singular: 'Spell',
          color: '#aabbcc',
          fields: [
            { id: 'f1', name: 'Cost', type: 'number', min: 0, max: 10, secret: 'x' },
            { name: 'School', type: 'select', options: ['Fire', 'Water', ' '] },
            { name: 'Old', type: 'text', archived: true },
            'not a field',
          ],
          uses: { rank: { field: 'f1' }, nonsense: 1 },
          icon: 'star',
        },
        { key: 'Bad Key!', name: '', color: 'red', builtin: true, fields: [] },
        { key: 'character', name: 'People', builtin: true },
        7,
      ],
    },
  };
  const layout = {
    format: 'novel-builder/template',
    version: 1,
    kind: 'profile-layout',
    name: 'Layout',
    content: {
      sections: [
        {
          name: ' Basics ',
          tab: 'details',
          fields: [
            { name: 'Age', type: 'number' },
            { name: '', options: ['a', '', ' b '], color: 1 },
          ],
          icon: 'x',
        },
        { name: '', tab: 'weird' },
        'nope',
      ],
    },
  };
  const system = {
    format: 'novel-builder/template',
    version: 1,
    kind: 'system',
    name: 'Sys',
    templateVersion: 0,
    content: {
      name: 'Sys',
      variables: [{ id: 'v1', name: 'Strength', kind: 'attribute', base: 5, junk: 1 }],
      ranks: [{ id: 'r1', name: ' E ', colour: '#fff' }, { name: '' }],
      groups: [{ id: 'g1', name: 'Skills' }],
      items: [{ id: 'i1', name: 'Slash', groupId: 'g1' }],
      matrices: [{ id: 'm1', name: 'Elements', rows: [{ id: 'a', name: 'Fire', x: 1 }], columns: [{ name: 'Water' }], cells: {} }],
      secretField: 'gone',
    },
  };
  const deep = (k: number): string => (k === 0 ? '"x"' : `{"a":${deep(k - 1)}}`);
  const texts: Record<string, string> = {
    good: JSON.stringify(good),
    layout: JSON.stringify(layout),
    system: JSON.stringify(system),
    notJson: '{nope',
    notTemplate: JSON.stringify({ format: 'something-else' }),
    newer: JSON.stringify({ ...good, version: 2 }),
    unknownKind: JSON.stringify({ ...good, kind: 'spells' }),
    empty: JSON.stringify({ ...good, content: { categories: [] } }),
    emptyLayout: JSON.stringify({ ...layout, content: {} }),
    badField: JSON.stringify({ ...good, content: { categories: [{ name: 'X', fields: [{ name: 'Y', type: 'hologram' }] }] } }),
    longName: JSON.stringify({ ...good, name: 'n'.repeat(201) }),
    tooMany: JSON.stringify({ ...good, content: { categories: Array.from({ length: 101 }, () => ({ name: 'c' })) } }),
    deep: `{"format":"novel-builder/template","version":1,"kind":"system","content":${deep(10)}}`,
    nameNotText: JSON.stringify({ ...good, name: 7, author: ['x'], license: 'nope', templateVersion: 2.7 }),
  };
  const templates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(texts)) templates[k] = tryRead(v);

  const wrappedLines: string[] = [];
  for (let p = 0; p < 3; p++) {
    wrappedLines.push(
      'The sea came in over the causeway at dusk, as it did every night',
      'of the year, and the bell in the tower rang its long single note.',
      'Nobody in Vell thought anything of it, not then, not yet, never.',
      '',
    );
  }
  const parse: Record<string, unknown> = {
    'wrapped.txt': tryParse('wrapped.txt', utf8(wrappedLines.join('\r\n'))),
    'short.txt': tryParse('short.txt', utf8('﻿One.\n\n  Two, indented.\nThree.\n\n\n')),
    'hard.md': tryParse(
      'hard.md',
      utf8(
        [
          'Title Line',
          '==========',
          '',
          '# Chapter One #',
          '',
          'Some **bold *and italic*** text, ~~struck~~, <u>under</u>, \\*not\\* emphasis.',
          'A line with two spaces at the end  ',
          'and a backslash\\',
          'then more.',
          '',
          '> A quote',
          '> over two lines',
          '',
          '1\\. A numbered line',
          '',
          '* * *',
          '',
          '## A scene heading',
          '',
          '&nbsp;',
          '',
          '---',
          'Last words.',
          '',
        ].join('\n'),
      ),
    ),
    'hard.rtf': tryParse(
      'hard.rtf',
      latin1(
        "{\\rtf1\\ansi{\\fonttbl{\\f0 Times;}}{\\*\\generator Word;}\\pard\\qc\\b Bold\\b0  plain \\i it\\i0\\par" +
          "\\pard\\qj caf\\'e9 \\u8212? dash \\emdash\\ \\ldblquote q\\rdblquote \\line next\\par" +
          '{\\pard\\ul under\\ulnone  \\strike s\\strike0\\par}\\uc2\\u9731 xx after\\par\\page\\par}',
      ),
    ),
    'fake.rtf': tryParse('fake.rtf', utf8('plain')),
    'odd.pages': tryParse('odd.pages', utf8('x')),
    noext: tryParse('README', utf8('Just words\nand more')),
    'groups.md': tryParse(
      'groups.md',
      utf8(
        [
          '# The Book',
          '',
          '## Part One',
          '',
          '### Chapter 1',
          '',
          'Text one.',
          '',
          '### Chapter 2',
          '',
          'Text two.',
          '',
          '#### A named scene',
          '',
          'Scene text.',
          '',
          '## Part Two',
          '',
          'Act I',
          '',
          'Chapter Three',
          '',
          'Text three.',
          '',
          'Chapter one was the hardest.',
          '',
          '* * *',
          '',
          'More.',
          '',
          '#',
          '',
          'After a hash.',
          '',
        ].join('\n'),
      ),
    ),
  };

  const cells: unknown[] = [null, '', 'plain', 'a,b', 'say "hi"', 'line\nbreak', '=SUM(A1)', '+1', '-2', '@x', '\tTab', 3, 3.5, -1, true, false, ['a', 'b'], { k: 'v' }];
  const at = new Date(2026, 9, 22, 10, 30);
  const names = ['The Ember Crown', '', '!!!', 'Ελληνικά & 日本語 — Title', 'x'.repeat(80), '  spaced   out  ', 'Ünïcödé-Ñame'];
  const malformed: Record<string, number[]> = {
    ascii: [72, 105],
    truncated: [0xe2, 0x82],
    overlong: [0xc0, 0xaf, 65],
    surrogate: [0xed, 0xa0, 0x80, 66],
    tooBig: [0xf4, 0x90, 0x80, 0x80],
    mixed: [0x41, 0xf0, 0x9f, 0x98, 0x80, 0xff, 0xe2, 0x82, 0xac, 0x80],
    bomTxt: [0xef, 0xbb, 0xbf, 0x48, 0x69],
  };
  const utf: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(malformed)) utf[k] = tryParse(`${k}.txt`, Uint8Array.from(v));
  return {
    templates,
    tooLarge: tryRead(' '.repeat(1000001)),
    parse,
    cells: cells.map(csvCell),
    fileNames: names.map((x) => exportFileName(x, 'timeline', at, 'json')),
    utf8: utf,
  };
}
