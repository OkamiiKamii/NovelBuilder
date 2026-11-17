// IN THIS CHAPTER: the entries a chapter names, most-mentioned first. A port of
// flutter_app/lib/shared/domain/codex/in_chapter.dart.

import { dartEscape } from '../characters/pageText';
import { dartSort } from '../manuscript/dartSort';
import { dartTrim } from '../text/dartString';

/** An entry found in a chapter, and how many times: by its names in the text, or by links to it, whichever is more. */
export type Present = { id: string; mentions: number };

/** Runs of letters and digits: a name matched as whole words has each of its own runs as a whole run of the text. */
const runs = /[\p{L}\p{N}]+/gu;

const runsOf = (text: string): string[] => Array.from(text.matchAll(runs), (m) => m[0]);

/** An entry's pattern, by its names: kept, so a page read again after each pause in typing does not build again the
 * patterns of the few entries it names. The most recently used `kept` are kept. */
const patterns = new Map<string, RegExp>();
const kept = 512;

function patternFor(wanted: readonly string[]): RegExp {
  const key = wanted.join('\u0000');
  const was = patterns.get(key);
  if (was !== undefined) {
    patterns.delete(key);
    patterns.set(key, was);
    return was;
  }
  if (patterns.size >= kept) patterns.delete(patterns.keys().next().value!);
  const made = new RegExp(`(?<![\\p{L}\\p{N}])(?:${wanted.map(dartEscape).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  patterns.set(key, made);
  return made;
}

/** The entries `paragraphs` name (`names`: each entry's names), most-mentioned first (ties in the order of `names`).
 * Names are matched as whole words, capitals as written. A text that says "Wren Hollis" counts once for Wren, not once
 * for each of the names she goes by. `links` counts the links to each entry in the text; an entry linked and never
 * named still counts. An entry none of whose names has all its words in the text is passed over without a search. */
export function presentIn(
  paragraphs: readonly string[],
  names: ReadonlyMap<string, readonly string[]>,
  options: { links?: ReadonlyMap<string, number> } = {},
): Present[] {
  const links = options.links ?? new Map<string, number>();
  const text = paragraphs.join('\n');
  const words = new Set(runsOf(text));
  const counts = new Map<string, number>();
  for (const [id, list] of names) {
    const wanted = dartSort(
      [...new Set(list.map(dartTrim))].filter((n) => n.length > 0),
      (a, b) => b.length - a.length,
    );
    if (wanted.length === 0) continue;
    if (!wanted.some((n) => runsOf(n).every((w) => words.has(w)))) continue;
    const re = patternFor(wanted);
    re.lastIndex = 0;
    const n = Array.from(text.matchAll(re)).length;
    if (n > 0) counts.set(id, n);
  }
  for (const [id, n] of links) {
    if (n > (counts.get(id) ?? 0)) counts.set(id, n);
  }
  const order = [...names.keys(), ...[...links.keys()].filter((k) => !names.has(k))];
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
