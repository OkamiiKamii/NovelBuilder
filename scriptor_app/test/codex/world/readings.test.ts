// The world's readings of the pages: ports of flutter_app/test/shared/domain/in_chapter_test.dart,
// present_in_test.dart and world_finder_test.dart.

import { dartEscape } from '../../../src/domain/characters/pageText';
import { type Present, presentIn } from '../../../src/domain/codex/inChapter';
import { worldFinds, worldKey } from '../../../src/domain/codex/worldFinder';
import { str } from '../../../src/domain/json';
import { dartSort } from '../../../src/domain/manuscript/dartSort';
import { StoryOrder } from '../../../src/domain/model/storyOrder';
import { blockTexts } from '../../../src/domain/prose';
import { StoryNode } from '../../../src/domain/records/storyNode';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { dartTrim } from '../../../src/domain/text/dartString';
import { readJson, samplePath } from '../../fixtures';
import { largeNovelText } from '../../characters/views/largeNovel';

const m = (o: Record<string, string[]>) => new Map(Object.entries(o));

describe('in this chapter', () => {
  const names = m({ w: ['Wren Hollis', 'Wren'], n: ['Nan'], f: ['The Mimir Forest', 'Mimir Forest'] });

  test('named as whole words, capitals as written, a full name once; most first', () => {
    const found = presentIn(
      ['Wren Hollis walked into the Mimir Forest.', 'Wren said nothing. Nan laughed; Wren did not.', 'A wren sang. Nanny came. Wrenfield was far.'],
      names,
    );
    expect(found).toEqual([
      { id: 'w', mentions: 3 },
      { id: 'n', mentions: 1 },
      { id: 'f', mentions: 1 },
    ]);
  });

  test('links count too: linked and never named still counts; the larger count is kept', () => {
    expect(presentIn(['Nobody is named.'], names, { links: new Map([['x', 2]]) })).toEqual([{ id: 'x', mentions: 2 }]);
    expect(presentIn(['Nan, Nan.'], names, { links: new Map([['n', 1]]) })).toEqual([{ id: 'n', mentions: 2 }]);
    expect(presentIn(['Nothing here.'], names)).toEqual([]);
  });

  test('the same count keeps the codex’s order', () => {
    expect(presentIn(['Nan met Wren.'], names)).toEqual([
      { id: 'w', mentions: 1 },
      { id: 'n', mentions: 1 },
    ]);
  });
});

/** Who and what a page names, as it was found before: a search per entry of the codex over the page. */
function searchedPerEntry(paragraphs: string[], names: Map<string, string[]>, links = new Map<string, number>()): Present[] {
  const text = paragraphs.join('\n');
  const counts = new Map<string, number>();
  for (const [id, list] of names) {
    const wanted = dartSort([...new Set(list.map(dartTrim))].filter((n) => n.length > 0), (a, b) => b.length - a.length);
    if (wanted.length === 0) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(dartEscape).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
    const n = Array.from(text.matchAll(pattern)).length;
    if (n > 0) counts.set(id, n);
  }
  for (const [id, n] of links) if (n > (counts.get(id) ?? 0)) counts.set(id, n);
  const order = [...names.keys(), ...[...links.keys()].filter((k) => !names.has(k))];
  const out = order.filter((id) => counts.has(id)).map((id) => ({ id, mentions: counts.get(id)! }));
  const at = new Map(order.map((id, i) => [id, i]));
  out.sort((a, b) => (a.mentions !== b.mentions ? b.mentions - a.mentions : at.get(a.id)! - at.get(b.id)!));
  return out;
}

describe('the page read once for its words', () => {
  test('a long book’s scenes, first to last: the same entries, the same counts, in the same order', () => {
    const { cast, scenes } = largeNovelText();
    // The book's own names, and the first names its pages call people by (shared by many of its characters): entries
    // a page does name, among the hundreds it does not.
    const names = new Map<string, string[]>(cast.map((c) => [c.id, [c.name]]));
    for (const n of ['Mira', 'Kai', 'Ren', 'Tamsin', 'Oren', 'Lise', 'Bram', 'Ysolde', 'Corin', 'Ada', 'Hale', 'Nadia']) {
      names.set(`called ${n}`, [n]);
    }
    let named = 0;
    const pages = [...scenes.filter((_, i) => i % 25 === 0), scenes[scenes.length - 1]];
    for (const scene of pages) {
      const found = presentIn(scene.paragraphs, names);
      expect([scene.id, found]).toEqual([scene.id, searchedPerEntry(scene.paragraphs, names)]);
      named += found.length;
    }
    expect(named).toBeGreaterThan(pages.length);
  });

  test('the hard cases: whole words, capitals as written, names of several words, marks and digits', () => {
    const names = m({
      wren: ['Wren Hollis', 'Wren'],
      bird: ['wren'],
      obrien: ["O'Brien", 'O’Brien'],
      mj: ['Mary-Jane'],
      kai: ['Kai'],
      droid: ['3PO'],
      cafe: ['Café Noir'],
      stars: ['***'],
      empty: ['  ', ''],
      none: ['Nobody Here'],
    });
    const cases = [
      ['Wren Hollis came. Wren sat; a wren sang.'],
      ["O'Brien and O’Brien met Mary-Jane, not Mary or Jane."],
      ['Kai2 is not Kai, but Kai is; Kaiser is not.'],
      ['3PO spoke. R3PO did not. 3PO.'],
      ['At the Café Noir, the café noir.', 'Then *** and then ***.'],
      ['', 'Nothing here names anyone.'],
    ];
    for (const paragraphs of cases) {
      expect(presentIn(paragraphs, names)).toEqual(searchedPerEntry(paragraphs, names));
      const links = new Map([
        ['kai', 5],
        ['linkedOnly', 2],
      ]);
      expect(presentIn(paragraphs, names, { links })).toEqual(searchedPerEntry(paragraphs, names, links));
    }
    expect(presentIn(['Wren Hollis came. Wren sat; a wren sang.'], names)).toEqual([
      { id: 'wren', mentions: 2 },
      { id: 'bird', mentions: 1 },
    ]);
  });
});

describe('found in your pages: what the words say', () => {
  const found = (paragraphs: string[], o: { known?: Set<string>; aside?: Set<string> } = {}) =>
    worldFinds([[1, paragraphs]], { known: o.known, setAside: o.aside }).map((f) => [f.name, f.kind]);
  const sorted = (list: unknown[][]) => [...list].sort((a, b) => (String(a) < String(b) ? -1 : 1));

  test('a place, a group, a thing, a power: by what the words say', () => {
    expect(
      sorted(
        found([
          'That was James, flying towards the nearest city; he cut through the Mimir Forest to do so.',
          'For now, James was flying by using the Smart Atoms skill.',
          'The Salt Guild sent its factors. House Vane said nothing. She kept the Brass Compass close.',
          'They sailed to the Isle of Skye, past Mount Ash, to the Order of the Rose.',
        ]),
      ),
    ).toEqual(
      sorted([
        ['Mimir Forest', 'location'],
        ['Smart Atoms', 'power'],
        ['Salt Guild', 'faction'],
        ['House Vane', 'faction'],
        ['Brass Compass', 'item'],
        ['Isle of Skye', 'location'],
        ['Mount Ash', 'location'],
        ['Order of the Rose', 'faction'],
      ]),
    );
  });

  test('not a name: one word alone, someone’s power, words across a comma, what the world already holds', () => {
    expect(found(['The Forest was dark. The Provost’s power was absolute. They spoke of Vell, Tower and all.'])).toEqual([]);
    expect(found(['He walked down Lantern Street.'], { known: new Set(['lantern street']) })).toEqual([]);
    // A sentence's own capital.
    expect(found(['This skill was new. Water spell or not, it held.'])).toEqual([]);
    expect(found(['His Fireball spell burned. She knew the old Frost spell.'])).toEqual([
      ['Fireball', 'power'],
      ['Frost', 'power'],
    ]);
    // With or without The.
    expect(found(['The Drowned Road rose.'], { known: new Set([worldKey('The Drowned Road')]) })).toEqual([]);
    expect(found(['Into the Mimir Forest.'], { aside: new Set(['mimir forest']) })).toEqual([]);
  });

  test('counted where it is written, most first', () => {
    const finds = worldFinds([
      [1, ['The Glass River ran.', 'By the Glass River.']],
      [3, ['The Glass River again, and the Iron Gate.']],
    ]);
    expect(finds.map((f) => [f.name, f.times, f.chapters, f.first])).toEqual([
      ['Glass River', 3, 2, 1],
      ['Iron Gate', 1, 1, 3],
    ]);
  });

  test('the sample novel names nothing the world does not hold', () => {
    const s = NovelSnapshot.fromJson(readJson(samplePath));
    const order = StoryOrder.of(s.rows('chapters').map((r) => new StoryNode(r)));
    const finds = worldFinds(
      s.rows('chapterContents').map((r): [number, string[]] => [order.chapterNumber.get(str(r['id']))!, blockTexts(r['doc'])]),
      { known: new Set(s.rows('loreEntries').map((e) => worldKey(str(e['name'])))) },
    );
    expect(finds).toEqual([]);
  });

  test('a name’s form for comparing', () => {
    expect(worldKey('  The Drowned  Road ')).toBe('drowned road');
    expect(worldKey("Merrow's Bell")).toBe('merrow bell');
    expect(worldKey('O’Neil')).toBe('oneil');
  });
});
