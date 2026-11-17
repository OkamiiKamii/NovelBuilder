// THE RED PENCIL: what an editor's pencil marks on a page of prose, found by counting, never by guessing. Three marks:
//
// - an echo: a distinctive word used again within a few lines of itself ("the stone… the stone");
// - a long sentence: more than `longSentenceWords` words between full stops;
// - a filler: a word that usually weakens what it leans on ("very", "really", "suddenly", "began to").
//
// It only reads. Nothing here changes text, and nothing is a rule: a mark is a place to look again. Pure TypeScript
// (it also runs in the editor's WebView). A port of flutter_app/lib/shared/domain/text/red_pencil.dart.

import { dartToLowerCase, dartTrim } from './dartString';

/** A sentence longer than this many words is marked. */
export const longSentenceWords = 40;

/** How near a word must come again, in words, to be an echo. */
export const echoWindow = 40;

/** The distinctive words used at least this many times are the ones the text leans on. */
export const leanedOnAtLeast = 5;

/** The three marks, in the order findings at the same place are listed. */
export const pencilMarks = [
  { key: 'echo', label: 'Echoes', meaning: 'A word used again close to itself' },
  { key: 'long', label: 'Long sentences', meaning: `More than ${longSentenceWords} words in one sentence` },
  { key: 'filler', label: 'Fillers', meaning: 'Very, really, just, suddenly, began to…' },
] as const;

export type PencilMark = (typeof pencilMarks)[number]['key'];

const markIndex: Record<PencilMark, number> = { echo: 0, long: 1, filler: 2 };

/** One mark: in paragraph `block`, from `start` to `end` (exclusive, UTF-16 indices into the paragraph), on `word`
 * (lower case; a sentence's first words for a long sentence). */
export type PencilFinding = { kind: PencilMark; block: number; start: number; end: number; word: string };

export type PencilReport = {
  /** Every mark, in reading order. */
  findings: PencilFinding[];
  /** The distinctive words used most in the text, most first, each at least `leanedOnAtLeast` times. */
  leanedOn: { word: string; count: number }[];
};

export const emptyPencilReport: PencilReport = { findings: [], leanedOn: [] };

/** The findings of one kind, in reading order. */
export function findingsOf(report: PencilReport, kind: PencilMark): PencilFinding[] {
  return report.findings.filter((f) => f.kind === kind);
}

export function countOf(report: PencilReport, kind: PencilMark): number {
  return findingsOf(report, kind).length;
}

export function isEmptyReport(report: PencilReport): boolean {
  return report.findings.length === 0 && report.leanedOn.length === 0;
}

/** Marks `paragraphs` (one string each, in reading order). */
export function redPencil(paragraphs: readonly string[]): PencilReport {
  // Two findings are the same mark when kind, block, start and end agree; the first one kept stands.
  const findings = new Map<string, PencilFinding>();
  const add = (f: PencilFinding) => {
    const id = `${f.kind}|${f.block}|${f.start}|${f.end}`;
    if (!findings.has(id)) findings.set(id, f);
  };
  const counts = new Map<string, number>();
  const shown = new Map<string, string>();
  const lastAt = new Map<string, { index: number; block: number; start: number; end: number }>();
  let index = 0;
  const all = paragraphs.map(words);
  // A word written with a capital in the middle of a sentence anywhere is a name, everywhere: names come back by
  // right ("Wren ran. Wren stopped." is no echo).
  const names = new Set<string>();
  for (const ws of all) for (const w of ws) if (w.name) names.add(stem(w.key));

  paragraphs.forEach((text, block) => {
    const ws = all[block];

    // Fillers, and "began to" / "started to".
    ws.forEach((w, i) => {
      if (fillers.has(w.key)) add({ kind: 'filler', block, start: w.start, end: w.end, word: w.key });
      if (beginnings.has(w.key) && i + 1 < ws.length && ws[i + 1].key === 'to') {
        const to = ws[i + 1];
        if (dartTrim(text.substring(w.end, to.start)) === '') {
          add({ kind: 'filler', block, start: w.start, end: to.end, word: `${w.key} to` });
        }
      }
    });

    // Echoes: a distinctive word again within `echoWindow` words, across paragraphs too.
    for (const w of ws) {
      const at = index++;
      const key = stem(w.key);
      if (!w.distinctive || names.has(key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!shown.has(key)) shown.set(key, w.key);
      const before = lastAt.get(key);
      if (before !== undefined && at - before.index <= echoWindow) {
        const word = shown.get(key)!;
        add({ kind: 'echo', block: before.block, start: before.start, end: before.end, word });
        add({ kind: 'echo', block, start: w.start, end: w.end, word });
      }
      lastAt.set(key, { index: at, block, start: w.start, end: w.end });
    }

    // Long sentences.
    for (const s of sentences(text)) {
      const inside = ws.filter((w) => w.start >= s.start && w.end <= s.end);
      if (inside.length > longSentenceWords) {
        add({
          kind: 'long',
          block,
          start: s.start,
          end: s.end,
          word: inside
            .slice(0, 4)
            .map((w) => w.key)
            .join(' '),
        });
      }
    }
  });

  const ordered = [...findings.values()].sort(
    (a, b) => a.block - b.block || a.start - b.start || markIndex[a.kind] - markIndex[b.kind],
  );
  const leaned: { word: string; count: number }[] = [];
  for (const [key, count] of counts) if (count >= leanedOnAtLeast) leaned.push({ word: shown.get(key)!, count });
  leaned.sort((a, b) => (b.count !== a.count ? b.count - a.count : compareCodeUnits(a.word, b.word)));
  return { findings: ordered, leanedOn: leaned.slice(0, 5) };
}

/** Dart's `String.compareTo`: by UTF-16 code units. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Word = { start: number; end: number; key: string; distinctive: boolean; name: boolean };

const wordPattern = /[\p{L}\p{M}][\p{L}\p{M}\p{Nd}'’-]*/gu;
const sentenceEnd = /[.!?…]+/u;
const sentenceEnds = /[.!?…]+/gu;
const closers = /^["”’')\]»]*/;
const openQuote = /["“]/;
const possessive = /['’]s$/u;

function words(text: string): Word[] {
  const out: Word[] = [];
  let sentenceStart = true;
  let from = 0;
  for (const m of text.matchAll(wordPattern)) {
    const mStart = m.index;
    // Between the last word and this one: did a sentence end?
    const gap = text.substring(from, mStart);
    if (sentenceEnd.test(gap) || (gap.includes(':') && openQuote.test(gap))) sentenceStart = true;
    let raw = m[0];
    // A trailing apostrophe or dash is punctuation, not part of the word.
    while (raw.length > 0 && "'’-".includes(raw[raw.length - 1])) {
      raw = raw.substring(0, raw.length - 1);
    }
    if (raw.length === 0) continue;
    const key = dartToLowerCase(raw).replaceAll("'", '’');
    const capital = raw[0] !== dartToLowerCase(raw[0]);
    // A capital not at the start of a sentence is a name.
    const name = capital && !sentenceStart;
    const base = key.replace(possessive, '');
    const distinctive = !name && base.length >= 4 && !common.has(base) && !fillers.has(base);
    out.push({ start: mStart, end: mStart + raw.length, key, distinctive, name });
    sentenceStart = false;
    from = mStart + raw.length;
  }
  return out;
}

/** "stones" and "stone", "Ilse’s" and "Ilse" are the same word to the ear. */
function stem(key: string): string {
  let k = key.replace(possessive, '');
  if (k.length > 4 && k.endsWith('s') && !k.endsWith('ss') && !k.endsWith('us') && !k.endsWith('is')) {
    k = k.substring(0, k.length - 1);
  }
  return k;
}

/** Each sentence's start and end (end exclusive, after its full stop and any closing quote). */
function sentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(sentenceEnds)) {
    let end = m.index + m[0].length;
    const close = closers.exec(text.substring(end));
    if (close !== null) end += close[0].length;
    // Only a full stop followed by a space or the end of the paragraph ends a sentence ("3.5", "Mr.Fenn" do not).
    if (end < text.length && text[end] !== ' ') continue;
    const s = trimmed(text, start, end);
    if (s !== null) out.push(s);
    start = end;
  }
  const last = trimmed(text, start, text.length);
  if (last !== null) out.push(last);
  return out;
}

function trimmed(text: string, start: number, end: number): { start: number; end: number } | null {
  while (start < end && text[start] === ' ') start++;
  while (end > start && text[end - 1] === ' ') end--;
  return end > start ? { start, end } : null;
}

const fillers: ReadonlySet<string> = new Set([
  'very',
  'really',
  'just',
  'suddenly',
  'quite',
  'rather',
  'somewhat',
  'actually',
  'basically',
  'literally',
  'totally',
  'definitely',
  'simply',
  'truly',
]);

const beginnings: ReadonlySet<string> = new Set([
  'began',
  'begin',
  'begins',
  'beginning',
  'started',
  'start',
  'starts',
  'starting',
]);

/** Words every sentence needs, which repeat without anyone hearing them. */
const common: ReadonlySet<string> = new Set([
  'about', 'above', 'after', 'again', 'against', 'almost', 'along', 'also', 'always', 'among', 'another', 'anyone',
  'anything', 'around', 'away', 'back', 'because', 'been', 'before', 'behind', 'being', 'below', 'beside', 'between',
  'both', 'came', 'come', 'comes', 'could', 'didn', 'does', 'doesn', 'doing', 'done', 'down', 'each', 'even', 'ever',
  'every', 'everyone', 'everything', 'from', 'gave', 'give', 'goes', 'going', 'gone', 'good', 'got', 'great', 'had',
  'hadn', 'have', 'having', 'he’d', 'he’s', 'hers', 'herself', 'here', 'himself', 'into', 'it’s', 'know', 'knew',
  'last', 'left', 'less', 'like', 'little', 'long', 'look', 'looked', 'made', 'make', 'many', 'might', 'more', 'most',
  'much', 'must', 'myself', 'never', 'next', 'nothing', 'once', 'only', 'onto', 'other', 'others', 'ours', 'over',
  'own', 'perhaps', 'said', 'same', 'says', 'seemed', 'shall', 'she’d', 'she’s', 'should', 'since', 'some',
  'something', 'still', 'such', 'take', 'than', 'that', 'that’s', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', 'there’s', 'these', 'they', 'they’d', 'they’re', 'thing', 'things', 'think', 'this', 'those', 'though',
  'thought', 'through', 'till', 'time', 'told', 'took', 'toward', 'towards', 'under', 'until', 'upon', 'want',
  'wanted', 'wasn', 'well', 'went', 'were', 'weren', 'what', 'when', 'where', 'whether', 'which', 'while', 'whom',
  'whose', 'will', 'with', 'within', 'without', 'won’t', 'would', 'wouldn', 'yes', 'yet', 'your', 'yours', 'yourself',
  'can’t', 'don’t', 'didn’t', 'wasn’t', 'i’m', 'i’ve', 'i’ll', 'you’re', 'you’ll', 'we’re', 'it’ll', 'let’s',
  'isn’t', 'aren’t', 'haven’t', 'hasn’t', 'couldn’t', 'wouldn’t', 'shouldn’t', 'one', 'two', 'first', 'second',
  'three', 'four', 'five', 'half', 'enough', 'turned', 'turn', 'felt', 'feel', 'seen', 'saw', 'heard', 'hear', 'asked',
  'ask', 'tell', 'right', 'it’d', 'can', 'cannot',
]);
