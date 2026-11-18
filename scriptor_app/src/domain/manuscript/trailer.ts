// THE TRAILER: the novel cut as a film trailer is cut, from its own words. A card says who it is from; then lines from
// the book, one at a time, the ones a trailer would choose (short, a question or a cry, something said aloud, a word
// like "never" or "blood"), in the order the book has them and none from its last pages; the names of the people it is
// about, the most written first, between them; the line that lands hardest kept for last; and the title. Only the
// author's words, nothing written for them. Reads only.
//
// A port of flutter_app/lib/shared/domain/manuscript/trailer.dart.

import { dartEscape, storedPages } from '../characters/pageText';
import { docBlocks } from '../prose';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { sentencePattern, startsLower } from './bestLines';
import { dartSort } from './dartSort';
import { countStanding, lettersOnly } from '../text/letters';

/** The pattern `leads` counts each name by, as words of its own (countStanding finds the same: test/perf). */
export function standingPattern(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${dartEscape(name)}(?![\\p{L}\\p{N}])`, 'gu');
}

/** What a shot of the trailer shows: who it is from ("From RGA"), a line from the book, a name large, the title. */
export type ShotKind = 'from' | 'line' | 'name' | 'title';

/** One shot: what it shows, and its words. */
export type Shot = { kind: ShotKind; text: string };

/** The trailer: its shots in order, the line kept for last (the poster's tagline, or empty), and the names in it. */
export type Trailer = { shots: Shot[]; sting: string; cast: string[] };

/** A character the trailer may name: the name to show, and every name they go by in the pages. */
export type TrailerPerson = { name: string; names: string[] };

/** The most lines a trailer shows. */
export const trailerLines = 5;

/** The most names it shows. */
export const trailerNames = 2;

const quoted = /“([^”]+)”|"([^"]+)"/g;
const space = /\s+/;

/** Words a trailer leans on. */
const charged = new Set([
  'never', 'always', 'only', 'everything', 'nothing', 'nobody', 'everyone', 'die', 'dies', 'died', 'death', 'dead',
  'blood', 'kill', 'killed', 'secret', 'truth', 'power', 'war', 'fire', 'dark', 'darkness', 'world', 'lie', 'lies',
  'alone', 'last', 'end', 'forever', 'gone', 'run', 'fall', 'remember', 'promise', 'monster', 'curse', 'magic',
  'king', 'queen', 'god', 'gods', 'heart', 'love', 'fear', 'afraid', 'storm', 'shadow', 'shadows', 'mission',
]);

/** A line the book has, where, and how much a trailer wants it. */
type Candidate = { text: string; paragraph: number; score: number };

/** The trailer of a book whose paragraphs (in reading order, without headings) are `paragraphs`. */
export function trailerOf(
  paragraphs: readonly string[],
  options: { title: string; author: string; cast?: readonly TrailerPerson[] },
): Trailer {
  const cast = options.cast ?? [];
  const text = paragraphs.map(dartTrim);
  const names = leads(text, cast);
  // None from the last pages: a trailer does not tell the ending. (A short book gives all it has.)
  const reach = text.length < 8 ? text.length : Math.ceil(text.length * 0.85);
  const found: Candidate[] = [];
  const castNames = cast.flatMap((p) => p.names);
  for (let i = 0; i < reach; i++) found.push(...candidates(text[i], i, castNames));
  dartSort(found, (a, b) => (b.score !== a.score ? b.score - a.score : a.paragraph - b.paragraph));
  // A mix, as a trailer cuts it: not all questions, and something told as well as said.
  const asks = (c: Candidate) => /\?["”’]*$/.test(c.text);
  const said = (c: Candidate) => c.text.startsWith('“');
  const chosen: Candidate[] = [];
  for (const c of found) {
    if (chosen.length === trailerLines) break;
    if (c.score <= 0) break;
    if (chosen.some((d) => d.paragraph === c.paragraph || d.text === c.text)) continue;
    if (asks(c) && chosen.filter(asks).length >= 2) continue;
    if (said(c) && chosen.filter(said).length >= trailerLines - 2) continue;
    chosen.push(c);
  }
  // The strongest last, the rest as the book has them.
  const sting = chosen.length === 0 ? null : chosen[0];
  const rest = dartSort(chosen.slice(1), (a, b) => a.paragraph - b.paragraph);
  const lines = sting === null ? rest : [...rest, sting];

  const shots: Shot[] = [
    { kind: 'from', text: dartTrim(options.author).length === 0 ? 'A new novel' : `From ${dartTrim(options.author)}` },
  ];
  lines.forEach((l, i) => {
    shots.push({ kind: 'line', text: l.text });
    // A name after the second line, and after the third.
    const n = i - 1;
    if (n >= 0 && n < names.length && i < lines.length - 1) shots.push({ kind: 'name', text: names[n] });
  });
  // Names not yet shown (a book of few lines): before the title.
  const shown = new Set(shots.filter((s) => s.kind === 'name').map((s) => s.text));
  for (const n of names) {
    if (!shown.has(n)) shots.push({ kind: 'name', text: n });
  }
  shots.push({ kind: 'title', text: dartTrim(options.title).length === 0 ? 'Untitled' : dartTrim(options.title) });
  return { shots, sting: sting?.text ?? '', cast: names };
}

/** The people most written about, up to `trailerNames`, each written at least twice. */
function leads(text: readonly string[], cast: readonly TrailerPerson[]): string[] {
  const all = text.join('\n');
  const counted: [string, number][] = [];
  for (const p of cast) {
    let n = 0;
    for (const name of new Set([...p.names, p.name])) {
      if (dartTrim(name).length === 0) continue;
      // The name as words of its own (standingPattern's matches), found without running a pattern per name over the
      // whole book (text/letters.ts; test/perf/letters.test.ts checks that the two agree).
      n += countStanding(all, dartTrim(name));
    }
    if (n >= 2) counted.push([p.name, n]);
  }
  dartSort(counted, (a, b) => b[1] - a[1]);
  return counted.slice(0, trailerNames).map(([name]) => name);
}

/** The lines of one paragraph a trailer could use, each scored: what is said aloud, and the sentences around it. */
function candidates(paragraph: string, at: number, names: readonly string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const m of paragraph.matchAll(quoted)) {
    const said = dartTrim(m[1] ?? m[2] ?? '').replace(/[,;:—–-]+$/, '.');
    if (said.length === 0) continue;
    const ended = /[.!?…]$/.test(said) ? said : `${said}.`;
    out.push({ text: `“${ended}”`, paragraph: at, score: score(ended, names, true) });
  }
  const told = paragraph.replace(quoted, ' ¶ ');
  for (const m of told.matchAll(sentencePattern)) {
    const s = dartTrim(m[0]);
    if (s.includes('¶') || s.length === 0) continue;
    out.push({ text: s, paragraph: at, score: score(s, names, false) });
  }
  return out;
}

/** How much a trailer wants `line`: below one, not at all. */
function score(line: string, names: readonly string[], spoken: boolean): number {
  const words = line.split(space).filter((w) => w.length > 0);
  if (words.length < 3 || words.length > 16) return 0;
  const first = line.replace(/^[“"‘(]+/, '');
  if (first.length === 0 || startsLower(first)) return 0; // A piece of a sentence.
  if (/[;:()[\]{}/\\#*_]/.test(line)) return 0;
  let s = 1;
  if (line.endsWith('?') || line.endsWith('?”')) s += 3;
  if (line.endsWith('!') || line.endsWith('!”')) s += 2;
  if (spoken) s += 2;
  if (words.length >= 4 && words.length <= 11) s += 2;
  const lower = new Set(words.map((w) => lettersOnly(dartToLowerCase(w))));
  if ([...lower].some((w) => charged.has(w))) s += 2;
  if (names.some((n) => n.length > 0 && line.includes(n))) s += 1;
  if (/^(And|But|Then|So|Or)\b/.test(first)) s -= 1;
  if (/\d/.test(line)) s -= 1;
  return s;
}

/** `trailerOf` over the chapters as stored (JSON text, a row each), in reading order `order`, as a job. */
export function trailerJob(
  storedContents: readonly string[],
  order: readonly string[],
  options: { title: string; author: string; cast?: readonly TrailerPerson[] },
): () => Trailer {
  return () => {
    const pages = storedPages(storedContents, new Set(order), (doc) =>
      docBlocks(doc)
        .filter((b) => !b.heading && dartTrim(b.text).length > 0)
        .map((b) => b.text),
    );
    return trailerOf(
      order.flatMap((id) => pages.get(id) ?? []),
      options,
    );
  };
}
