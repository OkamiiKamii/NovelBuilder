// THE GAZETTE: each chapter of the book as the front page of its world's newspaper, an edition a chapter. The paper is
// named for the place the book names most ("The Vell Gazette"), else for the book ("The Ash Road Herald"). Each front
// page: the chapter's title as the headline, its best line beneath, its opening as the lead story, the lines said in
// it and who said them, the weather the chapter's own words give, and who is in the news (the names it says most).
// Only the author's words, cut and set; nothing written for them. Reads only.
//
// A port of flutter_app/lib/shared/domain/manuscript/gazette.dart.

import { CastNames, standingAt } from '../characters/castNames';
import { spokenBy } from '../characters/voice';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { bestLines, sentencePattern, storedParagraphs, wordsOf } from './bestLines';
import { dartSort } from './dartSort';
import { placesNamedIn } from './postcards';

/** What the sky is doing in a chapter, by the words it uses. */
export type Weather = 'storm' | 'rain' | 'snow' | 'fog' | 'wind' | 'sun' | 'night' | 'fair';

/** Each weather in order (a storm over rain, rain over fair skies), what the paper says of it, and its words. */
export const weathers: readonly { weather: Weather; forecast: string; words: readonly string[] }[] = [
  { weather: 'storm', forecast: 'Storms. Stay off the roads.', words: ['storm', 'thunder', 'lightning', 'gale', 'tempest'] },
  { weather: 'rain', forecast: 'Rain, and more of it.', words: ['rain', 'drizzle', 'downpour', 'raining', 'rained', 'wet'] },
  { weather: 'snow', forecast: 'Snow; the roads are white.', words: ['snow', 'frost', 'sleet', 'ice', 'icy', 'blizzard'] },
  { weather: 'fog', forecast: 'Fog by morning, lifting late.', words: ['fog', 'mist', 'haze', 'murk', 'foggy', 'misty'] },
  { weather: 'wind', forecast: 'High winds; hold on to your hat.', words: ['wind', 'gust', 'gusts', 'windy', 'breeze'] },
  { weather: 'sun', forecast: 'Bright and warm.', words: ['sun', 'sunlight', 'sunny', 'heat', 'warm', 'bright'] },
  { weather: 'night', forecast: 'A long night, and a clear one.', words: ['night', 'moon', 'stars', 'dark', 'darkness', 'midnight'] },
  { weather: 'fair', forecast: 'Fair, for now.', words: [] },
];

/** What the paper says of `w`. */
export function forecastOf(w: Weather): string {
  return weathers.find((x) => x.weather === w)!.forecast;
}

/** A line said in a chapter, and who said it. */
export type Said = { words: string; speaker: string };

/** One front page (see the file's comment). */
export type Edition = {
  chapter: number;
  nodeId: string;
  headline: string;
  deck: string;
  lead: string[];
  continues: boolean;
  said: Said[];
  weather: Weather;
  weatherWord: string;
  weatherCount: number;
  inTheNews: { name: string; count: number }[];
  words: number;
};

/** The paper: its name and its editions, a chapter each in reading order. */
export type Gazette = { name: string; editions: Edition[] };

/** A chapter for the paper: its id, title and paragraphs (headings left out). */
export type GazetteChapter = { id: string; title: string; paragraphs: string[] };

/** A character for the paper: the name they go by (first) and every name they are found by. */
export type GazettePerson = { name: string; names: string[] };

/** The words the lead story runs to, at most. */
export const leadWords = 120;

const count = (text: string): number => wordsOf(text).length;

/** The paper's name: for `place` when there is one ("The Vell Gazette"), else for the book `title`. */
export function gazetteName(place: string | null, title: string): string {
  if (place !== null && dartTrim(place).length > 0) {
    return `The ${dartTrim(place).replace(/^The\s+/, '')} Gazette`;
  }
  const book = dartTrim(title).replace(/^The\s+/, '');
  return book.length === 0 ? 'The Morning Herald' : `The ${book} Herald`;
}

/** The lead story of `paragraphs`: the opening, cut at the end of a sentence near `leadWords`; and whether it goes on. */
export function leadOf(paragraphs: readonly string[]): { lead: string[]; continues: boolean } {
  const out: string[] = [];
  let words = 0;
  for (const p of paragraphs) {
    const text = dartTrim(p);
    if (text.length === 0) continue;
    const n = count(text);
    if (words + n <= leadWords) {
      out.push(text);
      words += n;
      continue;
    }
    // The paragraph that crosses the line, cut at its last sentence that fits (one sentence at least, when nothing
    // has been set yet).
    let kept = '';
    for (const m of text.matchAll(sentencePattern)) {
      const s = m[0];
      if (words + count(s) > leadWords && (out.length > 0 || kept.length > 0)) break;
      kept += s;
      words += count(s);
    }
    if (kept.length > 0) out.push(dartTrim(kept));
    return { lead: out, continues: true };
  }
  return { lead: out, continues: false };
}

/** The weather of a chapter's `text`: the kind its words bring most, the word, and how often it is said. */
export function weatherOf(text: string): { weather: Weather; word: string; count: number } {
  const counts = new Map<string, number>();
  for (const m of wordsOf(dartToLowerCase(text))) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  let best: { weather: Weather; word: string; count: number } | null = null;
  for (const w of weathers) {
    let total = 0;
    let top: string | null = null;
    let topCount = 0;
    for (const word of w.words) {
      const n = counts.get(word) ?? 0;
      total += n;
      if (n > topCount) {
        top = word;
        topCount = n;
      }
    }
    // Twice is weather; once is a word.
    if (top !== null && total >= 2 && (best === null || total > best.count)) best = { weather: w.weather, word: top, count: total };
  }
  return best ?? { weather: 'fair', word: '', count: 0 };
}

/** Counts, for each of some lists of names, how many times its names stand in a text: the text read once for all of
 * them. A list holding a name with spaces round it, or an empty one, is counted name by name. */
class NameCounts {
  private readonly plain: boolean[];
  private readonly finder: CastNames;

  constructor(readonly lists: readonly (readonly string[])[]) {
    const plain = (names: readonly string[]) => names.every((n) => n.length > 0 && n === dartTrim(n));
    this.plain = lists.map(plain);
    this.finder = new CastNames(lists.flatMap((names, i) => (plain(names) ? [{ id: `${i}`, names }] : [])));
  }

  inText(text: string): number[] {
    const counts = this.lists.map(() => 0);
    for (const h of this.finder.all(text)) counts[Number(h.id)]++;
    this.lists.forEach((names, i) => {
      if (!this.plain[i]) counts[i] = names.reduce((n, name) => n + standingAt(text, name).length, 0);
    });
    return counts;
  }
}

/** The paper for the book called `title`, of `chapters` (in reading order) and `people`; `places` are the world's places
 * (each its names), the places the pages name besides. */
export function gazette(
  title: string,
  chapters: readonly GazetteChapter[],
  people: readonly GazettePerson[],
  options: { places?: readonly (readonly string[])[] } = {},
): Gazette {
  const places = options.places ?? [];
  const pages = new Map(chapters.map((c) => [c.id, c.paragraphs] as const));
  const all = chapters.flatMap((c) => c.paragraphs).join('\n');

  // The place named most names the paper: the world's places, then the places the pages name (a name not already
  // there, whatever its capitals), all counted over the book in one reading.
  const placeNames: [string, readonly string[]][] = places.filter((n) => n.length > 0).map((n) => [n[0], n]);
  const known = new Set(placeNames.map(([key]) => dartToLowerCase(key)));
  for (const p of chapters.flatMap((c) => c.paragraphs)) {
    for (const name of placesNamedIn(p)) {
      const key = dartToLowerCase(name);
      if (known.has(key)) continue;
      known.add(key);
      placeNames.push([name, [name]]);
    }
  }
  const placeCounts = new NameCounts(placeNames.map(([, names]) => names)).inText(all);
  // A map, as the Dart's: a key named twice keeps its first place and its last count.
  const namedCount = new Map<string, number>();
  placeNames.forEach(([key], i) => namedCount.set(key, placeCounts[i]));
  let place: [string, number] | null = null;
  for (const [key, n] of namedCount) {
    if (n > 0 && (place === null || n > place[1])) place = [key, n];
  }

  const editions: Edition[] = [];
  const peopleCounts = new NameCounts(people.map((p) => p.names));
  chapters.forEach((c, i) => {
    const text = c.paragraphs.join('\n');
    const words = count(text);
    if (words === 0) return;
    const best = bestLines([{ id: c.id, paragraphs: c.paragraphs }]);
    const lead = leadOf(c.paragraphs);
    // The deck is a line the lead story does not already hold, else (a short chapter, all of it in the lead) its best.
    const leadText = lead.lead.join(' ');
    const deck = best.map((l) => l.text).find((l) => !leadText.includes(l)) ?? (best.length === 0 ? '' : best[0].text);
    const said: Said[] = [];
    // Every run of three characters the chapter holds: a name with a run of three that is not among them is not
    // written in it, and is not looked for.
    const grams = new Set<string>();
    for (let k = 0; k + 3 <= text.length; k++) grams.add(text.substring(k, k + 3));
    const written = (name: string): boolean => {
      for (let k = 0; k + 3 <= name.length; k++) {
        if (!grams.has(name.substring(k, k + 3))) return false;
      }
      return text.includes(name);
    };
    for (const p of people) {
      // A line is someone's only where one of their names is written by it: a chapter without any is passed over.
      if (!p.names.some((n) => dartTrim(n).length > 0 && written(dartTrim(n)))) continue;
      for (const s of spokenBy(pages, [c.id], p.names, { limit: 12 })) {
        const n = count(s.words);
        if (n < 3 || n > 18) continue;
        said.push({ words: dartTrim(s.words), speaker: p.name });
        break;
      }
    }
    const mentions = peopleCounts.inText(text);
    const news = dartSort(
      people.flatMap((p, j) => (mentions[j] > 0 ? [{ name: p.name, count: mentions[j] }] : [])),
      (a, b) => b.count - a.count,
    );
    const weather = weatherOf(text);
    editions.push({
      chapter: i + 1,
      nodeId: c.id,
      headline: dartTrim(c.title).length === 0 ? `Chapter ${i + 1}` : dartTrim(c.title),
      deck,
      lead: lead.lead,
      continues: lead.continues,
      said: said.slice(0, 3),
      weather: weather.weather,
      weatherWord: weather.word,
      weatherCount: weather.count,
      inTheNews: news.slice(0, 4),
      words,
    });
  });
  return { name: gazetteName(place === null ? null : place[0], title), editions };
}

/** `gazette` over the chapters as stored: `order` the chapters' ids in reading order, `titles` their titles. */
export function gazetteJob(
  title: string,
  storedContents: readonly string[],
  order: readonly string[],
  titles: ReadonlyMap<string, string>,
  people: readonly GazettePerson[],
  places: readonly (readonly string[])[],
): () => Gazette {
  return () => {
    const pages = storedParagraphs(storedContents, order);
    return gazette(
      title,
      order.map((id) => ({ id, title: titles.get(id) ?? '', paragraphs: pages.get(id) ?? [] })),
      people,
      { places },
    );
  };
}
