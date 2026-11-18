// The rest of flutter_app/test/shared/domain/exchange_agreement_test.dart, against the same golden file (made by the
// original app): reading manuscript files (.txt, .md, .rtf, .docx) and their structure under every split, the reasons a
// file cannot be read, and a view's records.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type JsonMap, isMap } from '../../src/domain/json';
import { type ImportBlock, ImportException } from '../../src/domain/exchange/importParse';
import { type ImportNode, buildStructure, metricsOf, parseFile, summarise, toDoc } from '../../src/domain/exchange/importStructure';
import { exportRecords, namesJson, recordsJson, viewData } from '../../src/domain/exchange/recordsExport';
import { StoryModel } from '../../src/domain/model/storyModel';
import { strings } from '../../src/domain/records/jsonRecord';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { flutterFixturesDir, readJson } from '../fixtures';

const golden = readJson(join(flutterFixturesDir, 'golden', 'exchange.golden.json')) as JsonMap;
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const runJson = (r: { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean }) => ({
  text: r.text,
  ...(r.bold ? { bold: true } : {}),
  ...(r.italic ? { italic: true } : {}),
  ...(r.underline ? { underline: true } : {}),
  ...(r.strike ? { strike: true } : {}),
});

export const blockJson = (b: ImportBlock): unknown =>
  b.type === 'heading'
    ? { type: 'heading', level: b.level, text: b.text }
    : b.type === 'paragraph'
      ? { type: 'paragraph', runs: b.runs.map(runJson), ...(b.align !== null ? { align: b.align } : {}), ...(b.quote ? { quote: true } : {}) }
      : { type: 'divider' };

export const nodeJson = (n: ImportNode): unknown => ({
  kind: n.kind,
  title: n.title,
  words: metricsOf(n.blocks).words,
  doc: toDoc(n.blocks),
  children: n.children.map(nodeJson),
});

describe('manuscript import agrees with the original app', () => {
  const imports = golden['imports'] as JsonMap;
  for (const [fileName, expected] of Object.entries(imports)) {
    test(fileName, () => {
      const want = expected as JsonMap;
      const blocks = parseFile(fileName, new Uint8Array(readFileSync(join(flutterFixturesDir, 'exchange', fileName))));
      expect(plain(blocks.map(blockJson))).toEqual(want['blocks']);
      const splits: Record<string, [boolean, boolean]> = { both: [true, true], chapters: [true, false], scenes: [false, true], none: [false, false] };
      for (const [split, [chapters, scenes]] of Object.entries(splits)) {
        const nodes = buildStructure(blocks, { splitChapters: chapters, splitScenes: scenes, fallbackTitle: fileName.replace(/\.[^.]+$/, '') });
        const s = summarise(nodes);
        const w = (want['splits'] as JsonMap)[split] as JsonMap;
        expect([split, plain(nodes.map(nodeJson))]).toEqual([split, w['nodes']]);
        expect([split, { volumes: s.volumes, chapters: s.chapters, scenes: s.scenes, words: s.words }]).toEqual([split, w['summary']]);
      }
    });
  }

  test('files that cannot be read say why, in the same words', () => {
    for (const [fileName, message] of Object.entries(golden['errors'] as JsonMap)) {
      const bytes = new TextEncoder().encode(fileName === 'broken.docx' ? 'not a zip' : fileName === 'fake.rtf' ? 'plain words' : 'x');
      let reason: string | null = null;
      try {
        parseFile(fileName, bytes);
      } catch (e) {
        if (e instanceof ImportException) reason = e.reason;
      }
      expect([fileName, reason]).toEqual([fileName, message]);
    }
  });
});

describe("a view's records agree with the original app", () => {
  const views = golden['views'] as JsonMap;
  for (const [name, perView] of Object.entries(views)) {
    const model = StoryModel.fromSnapshot(NovelSnapshot.fromJson(readJson(join(flutterFixturesDir, `${name}.novel.json`))));
    const byView = perView as JsonMap;
    const some = new Set(strings(byView['some']));
    for (const [view, want] of Object.entries(byView)) {
      if (view === 'some' || !isMap(want)) continue;
      test(`${name}, ${view}`, () => {
        for (const [key, keep, includePrivate] of [
          ['all', () => true, false],
          ['private', () => true, true],
          ['some', (id: string) => some.has(id), false],
        ] as const) {
          const got = exportRecords(model, viewData[view], { keep, includePrivate });
          expect([key, plain({ records: recordsJson(got), names: namesJson(got), count: got.count })]).toEqual([key, want[key]]);
        }
      });
    }
  }
});
