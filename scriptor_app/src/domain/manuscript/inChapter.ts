// IN THIS CHAPTER: the entries a chapter names, most-mentioned first. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/codex/in_chapter.dart (kept here, beside the storyboard that reads it, until there is a
// codex folder to hold it).

import { dartTrim } from '../text/dartString';
import { dartSort } from './dartSort';

/** An entry found in a chapter, and how many times: by its names in the text, or by links to it, whichever is more. */
export type Present = { id: string; mentions: number };

/** Runs of letters and digits: a name matched as whole words has each of its own runs as a whole run of the text. */
const runs = () => /[\p{L}\p{N}]+/gu;

/** An entry's pattern, by its names: kept, so a page read again after each pause in typing does not build again the
 * patterns of the few entries it names. The most recently used `kept` are kept. */
const patterns = new Map<string, RegExp>();
const kept = 512;

// As Dart's RegExp.escape: the characters with a meaning in a pattern, each behind a backslash.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternFor(wanted: readonly string[]): RegExp {
  const key = wanted.join('\u0000');
  const found = patterns.get(key);
  if (found !== undefined) {
    patterns.delete(key);
    patterns.set(key, found);
    return found;
  }
  if (patterns.size >= kept) patterns.delete(patterns.keys().next().value!);
  const made = new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  patterns.set(key, made);
  return made;
}

/** The entries a chapter's [paragraphs] name, most-mentioned first (ties in the order of [names]). Names are matched as
 * whole words, capitals as written ("Wren" a person, "wren" a bird). A text that says "Wren Hollis" counts once for
 * Wren, not once for each of the names she goes by. [links] counts the links to each entry in the text; an entry
 * linked and never named still counts. */
export function presentIn(
  paragraphs: readonly string[],
  names: Readonly<Record<string, readonly string[]>>,
  links: Readonly<Record<string, number>> = {},
): Present[] {
  const text = paragraphs.join('\n');
  const words = new Set([...text.matchAll(runs())].map((m) => m[0]));
  const counts = new Map<string, number>();
  for (const [id, list] of Object.entries(names)) {
    const wanted = dartSort(
      [...new Set(list.map((n) => dartTrim(n)))].filter((n) => n !== ''),
      (a, b) => b.length - a.length,
    );
    if (wanted.length === 0) continue;
    if (!wanted.some((n) => [...n.matchAll(runs())].every((m) => words.has(m[0])))) continue;
    const n = [...text.matchAll(patternFor(wanted))].length;
    if (n > 0) counts.set(id, n);
  }
  for (const [id, n] of Object.entries(links)) {
    if (n > (counts.get(id) ?? 0)) counts.set(id, n);
  }
  const order = [...Object.keys(names), ...Object.keys(links).filter((k) => !Object.hasOwn(names, k))];
  const out: Present[] = [];
  for (const id of order) {
    const n = counts.get(id);
    if (n !== undefined) out.push({ id, mentions: n });
  }
  // Most first; the same count keeps the given order.
  const at = new Map(order.map((id, i) => [id, i]));
  out.sort((a, b) => (a.mentions !== b.mentions ? b.mentions - a.mentions : at.get(a.id)! - at.get(b.id)!));
  return out;
}
