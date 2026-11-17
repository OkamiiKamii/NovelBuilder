// A port of flutter_app/test/shared/domain/reader_prefs_test.dart: the reader's look and the book's matter, against
// the original app's own results (computed from its `prefs.ts`).

import { matterWithChanges } from '../../src/domain/reader/matterChanges';
import {
  bookmarkFromJson,
  bookmarkToJson,
  contrastOf,
  contrastVerdict,
  copyReaderPrefs,
  defaultReaderPrefs,
  readerPrefsEqual,
  readerPrefsFromJson,
  readerPrefsToJson,
  resolveLook,
} from '../../src/domain/reader/readerPrefs';

test("contrast and its verdict are the original's", () => {
  const expected: [string, string, number, string][] = [
    ['#ffffff', '#1b1b1b', 17.2, 'comfortable for long reading'],
    ['#f4ecd8', '#3b2f20', 11.1, 'comfortable for long reading'],
    ['#000000', '#d6d6d6', 14.4, 'comfortable for long reading'],
    ['#fdf6e3', '#073642', 12.1, 'comfortable for long reading'],
    ['#777777', '#888888', 1.3, 'too faint to read comfortably'],
    ['#ffffff', '#767676', 4.5, 'readable'],
  ];
  for (const [a, b, ratio, verdict] of expected) {
    expect([a, b, contrastOf(a, b)]).toEqual([a, b, ratio]);
    expect(contrastVerdict(contrastOf(a, b))).toBe(verdict);
  }
});

test('stored preferences are read defensively: out of range is clamped, unknown is the default', () => {
  const p = readerPrefsFromJson({
    size: 99,
    leading: 0.5,
    font: 'nope',
    format: 'serial',
    scheme: 'custom',
    customBg: '#ABCDEF',
    customText: 'red',
    justify: 'yes',
  });
  expect(readerPrefsToJson(p)).toEqual({
    format: 'serial',
    flow: 'paged',
    font: 'book',
    size: 28,
    leading: 1.2,
    measure: 66,
    paragraphs: 'auto',
    indent: 1.5,
    spacing: 0.8,
    justify: true,
    scheme: 'custom',
    customBg: '#abcdef',
    customText: '#073642',
    device: 'ereader',
  });
  expect(readerPrefsEqual(readerPrefsFromJson(null), defaultReaderPrefs)).toBe(true);
  expect(readerPrefsEqual(readerPrefsFromJson(readerPrefsToJson(p)), p)).toBe(true);
});

test('a change is read back as a stored one: clamped, an invalid colour ignored', () => {
  const p = copyReaderPrefs(defaultReaderPrefs, { size: 5, customBg: 'blue', scheme: 'sepia', justify: false });
  expect([p.size, p.customBg, p.scheme, p.justify]).toEqual([13, '#fdf6e3', 'sepia', false]);
  expect(readerPrefsEqual(p, defaultReaderPrefs)).toBe(false);
  expect(copyReaderPrefs(p, {})).toEqual(p);
});

test('a web serial always scrolls, is spaced apart and ragged, whatever is chosen', () => {
  const look = resolveLook({ ...defaultReaderPrefs, format: 'serial' });
  expect([look.flow, look.indented, look.justify, look.background, look.text]).toEqual([
    'scroll',
    false,
    false,
    '#ffffff',
    '#1b1b1b',
  ]);
  const novel = resolveLook({ ...defaultReaderPrefs, paragraphs: 'spaced', scheme: 'sepia' });
  expect([novel.flow, novel.indented, novel.justify, novel.background]).toEqual(['paged', false, true, '#f4ecd8']);
  const dark = resolveLook({ ...defaultReaderPrefs, scheme: 'dark' });
  expect([dark.background, dark.text]).toEqual(['#000000', '#d6d6d6']);
  const custom = resolveLook({ ...defaultReaderPrefs, scheme: 'custom', customBg: '#102030', customText: '#a0b0c0' });
  expect([custom.background, custom.text]).toEqual(['#102030', '#a0b0c0']);
});

test('a bookmark that cannot be read is no bookmark', () => {
  expect(bookmarkFromJson({ fraction: 0.5 })).toBeNull();
  const b = bookmarkFromJson({ sectionId: 'c1', fraction: 3, furthest: -1 })!;
  expect([b.sectionId, b.fraction, b.furthest]).toEqual(['c1', 1, 0]);
  expect(bookmarkToJson(b)).toEqual({ sectionId: 'c1', fraction: 1, furthest: 0 });
});

test('matter is saved as the original saves it: named fields only, every other field kept', () => {
  const made = matterWithChanges(null, {
    projectId: 'p1',
    changes: { dedication: 'For Wren' },
    now: 5,
    newId: () => 'm1',
  });
  expect(made).toEqual({
    id: 'm1',
    dedication: 'For Wren',
    epigraph: '',
    epigraphSource: '',
    copyright: '',
    acknowledgements: '',
    aboutAuthor: '',
    sceneBreak: '* * *',
    projectId: 'p1',
    updatedAt: 5,
  });
  expect(Object.keys(made)).toEqual([
    'id',
    'dedication',
    'epigraph',
    'epigraphSource',
    'copyright',
    'acknowledgements',
    'aboutAuthor',
    'sceneBreak',
    'projectId',
    'updatedAt',
  ]);
  const changed = matterWithChanges(
    { ...made, fromANewerVersion: { kept: true } },
    {
      projectId: 'p1',
      changes: { sceneBreak: '~ ~ ~ ~ ~ ~ ~ ~ ~', epigraph: 'All glass remembers.', unknownField: 'ignored' },
      now: 9,
      newId: () => 'unused',
    },
  );
  expect(changed['id']).toBe('m1');
  expect(changed['dedication']).toBe('For Wren');
  expect(changed['sceneBreak']).toBe('~ ~ ~ ~ ~ ~ '); // at most 12 characters
  expect(changed['epigraph']).toBe('All glass remembers.');
  expect(changed['fromANewerVersion']).toEqual({ kept: true });
  expect('unknownField' in changed).toBe(false);
});
