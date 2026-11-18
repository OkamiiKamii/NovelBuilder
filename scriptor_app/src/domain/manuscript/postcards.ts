// POSTCARDS FROM YOUR WORLD: each place in the book as a postcard, "Greetings from" on a painted front and on the back
// a line the book sets there. The places are the world's locations, and the places the pages name that are not kept
// yet (a capitalised name ending in Forest, City, Tower, Bay…, or "the Kingdom of …"). A place the book never names in
// a sentence has no postcard: a postcard needs a line. The painting is chosen from what the place is (its name and
// what is said of it); its light (dawn, noon, dusk, night, storm) from its name, so a place always looks the same.
// Reads only.
//
// A port of flutter_app/lib/shared/domain/manuscript/postcards.dart.

import { CastNames, standingAt } from '../characters/castNames';
import { storedPages } from '../characters/pageText';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { countOf, lineScore, sentencePattern, wordsOf } from './bestLines';
import { dartSort } from './dartSort';

/** What a postcard's painting shows. */
export type Scenery = {
  water: boolean;
  trees: boolean;
  peaks: boolean;
  roofs: boolean;
  tower: boolean;
  beacon: boolean;
  dunes: boolean;
};

/** A postcard: the place, the line on the back and where it is (the chapter, 1 first, its title, its id and the
 * paragraph), what the front shows, its light (0–4), and whether the place is kept in the world. */
export type Postcard = {
  place: string;
  line: string;
  chapter: number;
  chapterTitle: string;
  nodeId: string;
  block: number;
  scenery: Scenery;
  light: number;
  kept: boolean;
};

/** A place the world keeps: what it is called (the first the name on the card), and what is said of it. */
export type KeptPlace = { names: string[]; about: string };

/** A chapter for the postcards: its id, its title, its paragraphs (every block, a heading as `null`). */
export type PostcardChapter = { id: string; title: string; paragraphs: (string | null)[] };

/** The most postcards a book is sent. */
export const postcardsKept = 16;

/** The lights a postcard can be painted in. */
export const postcardLights = ['dawn', 'noon', 'dusk', 'night', 'storm'] as const;

const placeNouns = [
  'Forest', 'Woods', 'Wood', 'Grove', 'City', 'Town', 'Village', 'Hamlet', 'Mountains', 'Mountain', 'Peak', 'Peaks',
  'River', 'Lake', 'Sea', 'Ocean', 'Bay', 'Coast', 'Shore', 'Isle', 'Island', 'Islands', 'Valley', 'Vale', 'Desert',
  'Plains', 'Fields', 'Road', 'Street', 'Lane', 'Tower', 'Castle', 'Keep', 'Fortress', 'Fort', 'Palace', 'Temple',
  'Abbey', 'Monastery', 'Academy', 'Inn', 'Tavern', 'Harbour', 'Harbor', 'Port', 'Gate', 'Bridge', 'Hall', 'Kingdom',
  'Empire', 'Realm', 'Marsh', 'Swamp', 'Fen', 'Hills', 'Cliffs', 'Falls', 'Canyon', 'Caverns', 'Cave', 'Caves', 'Ruins',
  'Square', 'Market', 'Wastes', 'Jungle', 'Glacier', 'Pass',
];

const named = new RegExp(
  `\\b((?:[A-Z][\\p{L}’'\\-]+ ){1,3}(?:${placeNouns.join('|')}))\\b` +
    `|\\b((?:Kingdom|Empire|Realm|City|Isle|Isles|Forest|Duchy|Republic) of (?:the )?[A-Z][\\p{L}’'\\-]+)`,
  'gu',
);

const leading = new Set([
  'The', 'A', 'An', 'In', 'At', 'On', 'To', 'From', 'Into', 'Through', 'Across', 'Near', 'Beyond', 'Then', 'When',
  'And', 'But', 'As', 'Of', 'Towards', 'Toward', 'By', 'Past', 'Over', 'Under', 'Inside', 'Outside', 'So', 'If',
]);

/** The places the pages name by the look of the name, without a "the" or "in" before. */
export function placesNamedIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(named)) {
    const name = trimName(m[1] ?? m[2]);
    if (name !== null) out.push(name);
  }
  return out;
}

function trimName(name: string): string | null {
  const words = name.split(' ');
  while (words.length > 0 && leading.has(words[0])) words.shift();
  // One word left is no name of a place: "Forest" alone is only a forest.
  return words.length < 2 ? null : words.join(' ');
}

function has(text: string, words: readonly string[]): boolean {
  const lower = dartToLowerCase(text);
  return words.some((w) => new RegExp(`\\b${w}`, 'u').test(lower));
}

/** What the painting of a place shows, from `text`: its name and what is said of it. */
export function sceneryOf(text: string): Scenery {
  const water = has(text, [
    'sea', 'bay', 'harbou?r', 'coast', 'quay', 'shore', 'ship', 'wreck', 'lighthouse', 'causeway', 'island', 'isle',
    'lake', 'river', 'ocean', 'port', 'tide', 'beach', 'falls', 'water', 'drowned',
  ]);
  const trees = has(text, ['forest', 'wood', 'tree', 'grove', 'jungle', 'orchard', 'glade']);
  const peaks = has(text, ['mountain', 'peak', 'cliff', 'pass', 'ridge', 'summit', 'glacier', 'crag']);
  const roofs = has(text, [
    'town', 'city', 'street', 'village', 'market', 'square', 'house', 'shop', 'lane', 'quarter', 'inn', 'tavern',
    'hamlet', 'roof', 'capital',
  ]);
  const tower = has(text, ['tower', 'keep', 'castle', 'lighthouse', 'fortress', 'fort', 'palace', 'citadel', 'spire']);
  const dunes = has(text, ['desert', 'sand', 'dune', 'wastes']);
  const beacon = has(text, ['lighthouse', 'beacon', 'lamp']);
  return { water, trees, peaks, roofs, tower: tower || beacon, beacon, dunes };
}

/** The light a place is painted in (an index of `postcardLights`): always the same for the same name. */
export function lightOf(place: string): number {
  let h = 7;
  for (let i = 0; i < place.length; i++) h = (h * 31 + place.charCodeAt(i)) & 0x7fffffff;
  return h % postcardLights.length;
}

/** The postcards of the book of `chapters` (in reading order): the world's `kept` places, and the places its pages name
 * that are not kept; in the order the book first names them. */
export function postcards(chapters: readonly PostcardChapter[], kept: readonly KeptPlace[]): Postcard[] {
  // Every sentence, where it is.
  const sentences: { text: string; chapter: number; block: number }[] = [];
  chapters.forEach((chapter, c) => {
    chapter.paragraphs.forEach((text, b) => {
      if (text === null) return;
      for (const m of text.matchAll(sentencePattern)) {
        const s = dartTrim(m[0]);
        if (s.length > 0) sentences.push({ text: s, chapter: c, block: b });
      }
    });
  });
  const places: { name: string; names: string[]; about: string; kept: boolean }[] = kept
    .filter((p) => p.names.length > 0)
    .map((p) => ({ name: p.names[0], names: p.names, about: p.about, kept: true }));
  const known = new Set(places.flatMap((p) => p.names.map(dartToLowerCase)));
  for (const s of sentences) {
    for (const name of placesNamedIn(s.text)) {
      const key = dartToLowerCase(name);
      if (known.has(key)) continue;
      known.add(key);
      places.push({ name, names: [name], about: '', kept: false });
    }
  }

  // The sentences each place is named in, in order: every sentence read once for every place, not searched once a
  // place. A place with a name with spaces round it, or an empty one, is searched for as before.
  const plain = (names: readonly string[]) => names.every((n) => n.length > 0 && n === dartTrim(n));
  const finder = new CastNames(
    places.flatMap((p, i) => (plain(p.names) ? [{ id: `${i}`, names: p.names }] : [])),
  );
  const namedIn: number[][] = places.map(() => []);
  sentences.forEach((s, i) => {
    for (const id of finder.named(s.text)) namedIn[Number(id)].push(i);
  });
  places.forEach((p, pi) => {
    if (plain(p.names)) return;
    sentences.forEach((s, i) => {
      if (p.names.some((n) => standingAt(s.text, n).length > 0)) namedIn[pi].push(i);
    });
  });

  const out: { card: Postcard; first: number }[] = [];
  places.forEach((p, pi) => {
    let best: (typeof sentences)[number] | null = null;
    let bestScore = 0;
    let first: number | null = null;
    for (const i of namedIn[pi]) {
      const s = sentences[i];
      first ??= i;
      const n = wordsOf(s.text).length;
      if (n < 5 || n > 35) continue;
      if (countOf(s.text, '“') !== countOf(s.text, '”')) continue;
      const score = lineScore(s.text);
      if (best === null || score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (best === null || first === null) return;
    out.push({
      card: {
        place: p.name,
        line: best.text,
        chapter: best.chapter + 1,
        chapterTitle: chapters[best.chapter].title,
        nodeId: chapters[best.chapter].id,
        block: best.block,
        scenery: sceneryOf(`${p.name} ${p.about} ${p.kept ? '' : best.text}`),
        light: lightOf(p.name),
        kept: p.kept,
      },
      first,
    });
  });
  // Two places can be first named in one sentence: Dart's own (unstable) sort decides between them.
  dartSort(out, (a, b) => a.first - b.first);
  return out.slice(0, postcardsKept).map((o) => o.card);
}

/** Each chapter's blocks, a heading as `null`, from the chapters as stored (JSON text, a row each). */
export function storedBlocks(storedContents: readonly string[], order: readonly string[]): Map<string, (string | null)[]> {
  return storedPages(storedContents, new Set(order), (doc) => docBlocks(doc).map((b) => (b.heading ? null : b.text)));
}

/** `postcards` over the chapters as stored: `order` the chapters' ids in reading order, `titles` their titles. */
export function postcardsJob(
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  kept: readonly KeptPlace[],
): () => Postcard[] {
  return () => {
    const blocks = storedBlocks(storedContents, order);
    return postcards(
      order.map((id) => ({ id, title: titles.get(id) ?? '', paragraphs: blocks.get(id) ?? [] })),
      kept,
    );
  };
}
