// THE LEDGER: the numbers a progression story's pages give for its system (the stats and the levels the blueprint
// names), in the order the book gives them, and where they do not add up. Readers of these books keep the ledger
// themselves and write in about every slip; this keeps it first.
//
// A number is read where the page names a stat or a track and gives it a number: "Strength 14", "Strength: 14",
// "Level 5", "reached Level 5", and the system's own form, "Strength +2 (12 → 14)". Four slips are found:
//
// - **the sum**: "+2 (12 → 15)": the sum does not come out;
// - **the start**: a rise from a number the pages did not leave it at ("12 → 14", when it was last 13);
// - **backwards**: a level lower than one the book already gave;
// - **the sheet**: the pages end on a number the sheet does not hold (when the system has one sheet).
//
// Reads only. A port of flutter_app/lib/shared/domain/systems/number_ledger.dart.

import { allMatches, dartEscape, paragraphsOf, storedPages } from '../characters/pageText';
import { dartSort } from '../manuscript/dartSort';
import { dartNumTryParse } from '../records/dartNum';
import { dartToLowerCase, dartTrim } from '../text/dartString';

/** Where a number was read: the chapter (its place, from 1, and id), the paragraph, the value (the "to" of a rise),
 * the rise when it is one (from, by), and the sentence. */
export type LedgerEntry = {
  chapter: number;
  nodeId: string;
  block: number;
  value: number;
  from: number | null;
  by: number | null;
  said: string;
};

/** One stat or track's numbers in reading order; `track` when it is a level that should not go down. */
export type LedgerLine = { name: string; track: boolean; entries: LedgerEntry[] };

/** What a slip is. */
export type SlipKind = 'sum' | 'start' | 'backwards' | 'sheet';
export const slipKinds: readonly SlipKind[] = ['sum', 'start', 'backwards', 'sheet'];

/** A slip: which kind, on which line, where (the entry it is at), and what it says. */
export type LedgerSlip = { kind: SlipKind; name: string; at: LedgerEntry; says: string };

/** What a book's ledger holds: each named thing's numbers, and the slips. */
export type Ledger = { lines: LedgerLine[]; slips: LedgerSlip[] };

const int64Max = 9223372036854775807;

/** A number as the ledger writes it: whole as a whole number ("14", as Dart's `round().toString()`, which stops at the
 * largest 64-bit whole number), else as Dart writes a fraction ("3.5"). */
export function ledgerNumber(v: number): string {
  if (v === Math.round(v)) {
    const r = v < 0 ? -Math.round(-v) : Math.round(v);
    if (r >= int64Max) return '9223372036854775807';
    if (r <= -int64Max) return '-9223372036854775808';
    return String(r + 0);
  }
  return String(v);
}

/** A sentence: up to a stop, a closing bracket of the system's ("]", "】"), not a stop inside a number ("3.5"). */
const sentencePattern = /(?:[^.!?…\]】]|\.(?=\d))+[.!?…\]】]*/g;

/** Where the earlier number was, said from the later one: "in chapter 4", or "earlier in the chapter". */
const where = (earlier: LedgerEntry, later: LedgerEntry): string =>
  earlier.chapter === later.chapter ? 'earlier in the chapter' : `in chapter ${earlier.chapter}`;

/** The sentence of `text` around `at`. */
function around(text: string, at: number): string {
  for (const m of allMatches(sentencePattern, text)) {
    if (m.start <= at && at < m.end) return dartTrim(m.text);
  }
  return dartTrim(text);
}

const parse = (s: string): number => dartNumTryParse(s)!;

/** The ledger of `chapters` (in reading order, each its id and paragraphs) for the stats `stats` and levels `tracks` a
 * blueprint names; `sheet`, when the system has one sheet, its values by name, for the last check. */
export function numberLedger(
  chapters: readonly { id: string; paragraphs: readonly string[] }[],
  args: { stats: readonly string[]; tracks: readonly string[]; sheet?: ReadonlyMap<string, number> },
): Ledger {
  const sheet = args.sheet ?? new Map<string, number>();
  const names = [
    ...args.stats.filter((s) => dartTrim(s).length >= 2).map((s) => ({ name: dartTrim(s), track: false })),
    ...args.tracks.filter((t) => dartTrim(t).length >= 2).map((t) => ({ name: dartTrim(t), track: true })),
  ];
  const number = String.raw`(\d+(?:\.\d+)?)`;
  const lines: LedgerLine[] = [];
  for (const n of names) {
    const word = dartEscape(n.name);
    const rise = new RegExp(
      `(?<![\\p{L}])${word}\\s*([+−-])\\s*${number}\\s*\\(\\s*${number}\\s*(?:→|->|to)\\s*${number}\\s*\\)`,
      'giu',
    );
    const plain = new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])\\s*(?::|=|is now|is|of|at)?\\s*${number}(?![\\d%])`, 'giu');
    const entries: LedgerEntry[] = [];
    chapters.forEach((chapter, c) => {
      chapter.paragraphs.forEach((text, b) => {
        const found: [number, LedgerEntry][] = [];
        const taken: [number, number][] = [];
        for (const m of allMatches(rise, text)) {
          const sign = m.groups[0] === '+' ? 1 : -1;
          found.push([
            m.start,
            {
              chapter: c + 1,
              nodeId: chapter.id,
              block: b,
              value: parse(m.groups[3]!),
              from: parse(m.groups[2]!),
              by: sign * parse(m.groups[1]!),
              said: around(text, m.start),
            },
          ]);
          taken.push([m.start, m.end]);
        }
        for (const m of allMatches(plain, text)) {
          if (taken.some(([start, end]) => m.start >= start && m.start < end)) continue;
          found.push([
            m.start,
            { chapter: c + 1, nodeId: chapter.id, block: b, value: parse(m.groups[0]!), from: null, by: null, said: around(text, m.start) },
          ]);
        }
        dartSort(found, (x, y) => x[0] - y[0]);
        for (const f of found) entries.push(f[1]);
      });
    });
    if (entries.length > 0) lines.push({ name: n.name, track: n.track, entries });
  }

  const slips: LedgerSlip[] = [];
  const nf = ledgerNumber;
  for (const line of lines) {
    let last: LedgerEntry | null = null;
    for (const e of line.entries) {
      if (e.from !== null && e.by !== null && Math.abs(e.from + e.by - e.value) > 1e-9) {
        slips.push({
          kind: 'sum',
          name: line.name,
          at: e,
          says:
            `${line.name} ${nf(e.from)} ${e.by < 0 ? '−' : '+'} ${nf(Math.abs(e.by))} is ${nf(e.from + e.by)}, ` +
            `not ${nf(e.value)} (chapter ${e.chapter}).`,
        });
      } else if (e.from !== null && last !== null && Math.abs(e.from - last.value) > 1e-9) {
        slips.push({
          kind: 'start',
          name: line.name,
          at: e,
          says: `${line.name} rises from ${nf(e.from)} in chapter ${e.chapter}, but it was ${nf(last.value)} ${where(last, e)}.`,
        });
      } else if (line.track && last !== null && e.value < last.value) {
        slips.push({
          kind: 'backwards',
          name: line.name,
          at: e,
          says: `${line.name} ${nf(e.value)} in chapter ${e.chapter}, after ${line.name} ${nf(last.value)} ${where(last, e)}.`,
        });
      }
      last = e;
    }
    const held = [...sheet].find(([k]) => dartToLowerCase(k) === dartToLowerCase(line.name));
    if (held !== undefined && last !== null && Math.abs(held[1] - last.value) > 1e-9) {
      slips.push({
        kind: 'sheet',
        name: line.name,
        at: last,
        says: `The pages end on ${line.name} ${nf(last.value)} (chapter ${last.chapter}); the sheet holds ${nf(held[1])}.`,
      });
    }
  }
  return { lines, slips };
}

/** `numberLedger` over the chapters as stored (JSON text, as the store reads them), in reading order `order`, as a job
 * to run away from the screen. */
export function numberLedgerJob(
  storedContents: readonly string[],
  order: readonly string[],
  args: { stats: readonly string[]; tracks: readonly string[]; sheet?: ReadonlyMap<string, number> },
): () => Ledger {
  return () => {
    const pages = storedPages(storedContents, new Set(order), paragraphsOf);
    return numberLedger(
      order.map((id) => ({ id, paragraphs: pages.get(id) ?? [] })),
      args,
    );
  };
}
