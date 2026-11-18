// The project analytics' own tests, as logic: flutter_app/test/shared/domain/analytics_names_test.dart (names found in
// exactly the chapters the name search finds them in), the logic of features/progress/analytics_names_test.dart (by
// every name Characters finds them by) and of progress_screens_test.dart's analytics test, plus ranges.

import { ranges } from '../../../src/domain/analytics/analytics';
import { CastData } from '../../../src/domain/characters/castData';
import { findWords } from '../../../src/domain/continuity/text';
import { type JsonMap } from '../../../src/domain/json';
import { textToDoc } from '../../../src/domain/prose';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { analyticsOf } from './json';

const p = 'p0000000-0000-4000-8000-000000000000';

function novel(collections: Record<string, JsonMap[]>, project: JsonMap = {}): NovelSnapshot {
  return NovelSnapshot.fromJson({
    format: 'novel-builder/project',
    version: 4,
    exportedAt: 1,
    project: { id: p, title: 'Names', createdAt: 1, updatedAt: 1, ...project },
    collections,
  });
}

const chapter = (id: string, title: string, order: number, words: number, extra: JsonMap = {}): JsonMap => ({
  id,
  projectId: p,
  parentId: null,
  kind: 'chapter',
  title,
  order,
  status: 'drafting',
  wordCount: words,
  createdAt: order,
  updatedAt: 0,
  mentions: [],
  ...extra,
});

test('ranges: runs of chapters are joined, the rest listed', () => {
  expect([ranges([]), ranges([4]), ranges([1, 2, 3, 7, 12]), ranges([1, 3, 4, 5, 9, 10])]).toEqual([
    '',
    '4',
    '1–3, 7, 12',
    '1, 3–5, 9–10',
  ]);
});

describe('analytics_names_test', () => {
  const texts = [
    "Zoë met O'Neil by the gate. Jean-Luc stayed home.",
    'Ann-Marie laughed; Anne did not. R2 beeped twice.',
    'Señor Núñez, the 3rd of his name, waited for Dr. Ho.',
    'Nobody came. annie whispered to the ANN on the radio.',
    '“Mira!” said Vane. Mira Vane. MiraVane. Mira  Vane.',
  ];
  const names = [
    'Zoë', 'Zoe', "O'Neil", 'Neil', 'Jean-Luc', 'Jean', 'Luc', 'Ann', 'Anne', 'Ann-Marie', 'Marie', 'R2', 'R',
    'Señor Núñez', 'Núñez', 'Nunez', '3rd', 'Dr. Ho', 'Ho', 'annie', 'Annie', 'ANN', 'Mira', 'Vane', 'Mira Vane',
    'Mira  Vane', 'MiraVane', 'the', '...', ' Mira ',
  ]; // prettier-ignore

  test('every name is found in exactly the chapters the name search finds it in', () => {
    const s = novel({
      chapters: texts.map((_, i) => chapter(`${p}-c${i}`, `Chapter ${i + 1}`, i, 10)),
      chapterContents: texts.map((text, i) => ({
        id: `${p}-c${i}`,
        projectId: p,
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      })),
      loreEntries: names.map((name, i) => ({ id: `${p}-n${i}`, projectId: p, category: 'character', name, fields: [] })),
    });
    const a = analyticsOf(s, new Date(2026, 9, 27).getTime());
    const found = new Map(a.cast.rows.map((r) => [r.name, r.chapters]));
    for (const name of names) {
      const expected = texts.flatMap((text, i) =>
        name.trim().length > 0 && text.includes(name.trim()) && findWords(text, [name]).length > 0 ? [i + 1] : [],
      );
      expect([name, found.get(name)]).toEqual([name, expected]);
    }
    // The check is not vacuous: hard names are found, and near misses are not.
    expect(found.get('Zoë')).toEqual([1]);
    expect(found.get("O'Neil")).toEqual([1]);
    expect(found.get('Ann')).toEqual([2]);
    expect(found.get('Núñez')).toEqual([3]);
    expect(found.get('Nunez')).toEqual([]);
    expect(found.get('MiraVane')).toEqual([5]);
  });
});

test('a book that calls her Ilse: Analytics has her where she is, as Characters does', () => {
  const pages = [
    'Ilse Marrow came down to the water.', // 1: her full name
    'Ilse waited. Marrow bones in the soup.', // 2: her own first name; "Marrow" is shared with Kit
    'They called for the Ferryman twice.', // 3: Oren, by his alias, as written
    'Ilsehaven was far. Kit slept.', // 4: not Ilse (inside another word); Kit by the name no one else has
  ];
  const s = novel({
    chapters: pages.map((_, i) => chapter(`c${i + 1}`, `Chapter ${i + 1}`, i, 10)),
    chapterContents: pages.map((text, i) => ({ id: `c${i + 1}`, projectId: p, doc: textToDoc(text) })),
    loreEntries: [
      { id: 'ilse', projectId: p, category: 'character', name: 'Ilse Marrow', fields: [] },
      { id: 'kit', projectId: p, category: 'character', name: 'Kit Marrow', fields: [] },
      { id: 'oren', projectId: p, category: 'character', name: 'Oren Vale', fields: [] },
    ],
    characterProfiles: [{ id: 'po', projectId: p, entryId: 'oren', aliases: ['the Ferryman'] }],
  });
  const cast = new CastData(p, s);
  const a = analyticsOf(s, Date.now(), cast.findNames);
  const rows = new Map(a.cast.rows.map((r) => [r.id, r]));
  expect(rows.get('ilse')!.chapters).toEqual([1, 2]);
  expect(rows.get('kit')!.chapters).toEqual([4]);
  expect(rows.get('oren')!.chapters).toEqual([3]);
  expect(rows.get('ilse')!.line).toMatch(/^Ilse Marrow: appears in 2 chapters, first: Ch\. 1, latest: Ch\. 2/);
});

test('analytics: counts stated as they are (progress_screens_test)', () => {
  const now = Date.now();
  const s = novel(
    {
      chapters: [
        chapter('c1', 'The Call', 0, 1200),
        chapter('c2', 'Crossing', 1, 0),
        { ...chapter('s2', 'At the river', 2, 800), kind: 'scene', parentId: 'c2' },
        chapter('c3', 'Ashes', 3, 3000),
      ],
      chapterContents: [
        { id: 'c1', projectId: p, doc: textToDoc('Mira woke early.') },
        { id: 's2', projectId: p, doc: textToDoc('Mira and Kai crossed.') },
      ],
      loreEntries: [
        { id: 'mira', projectId: p, category: 'character', name: 'Mira', fields: [] },
        { id: 'kai', projectId: p, category: 'character', name: 'Kai', fields: [] },
      ],
    },
    { targetWordCount: 10000 },
  );
  const a = analyticsOf(s, now);
  expect(a.observations.some((o) => o.startsWith('The longest chapter with text (“Ashes”, 3,000 words) is 3.8 times'))).toBe(true);
  expect(a.cast.rows.find((r) => r.id === 'mira')!.line).toMatch(/^Mira: appears in 2 chapters, first: Ch\. 1, latest: Ch\. 2/);
  expect(a.structure.lengths.map((l) => [l.number, l.words])).toEqual([
    [1, 1200],
    [2, 800],
    [3, 3000],
  ]);
  expect(a.output.percent).toBe(50);
});
