// AT A GLANCE: what a writer stops to look up mid-sentence (her eyes, his age, who she is to him) is on the record
// already. With the caret on a name on the page, its card: who or what it is, the facts recorded, and the ties.
// A port of flutter_app/lib/shared/domain/characters/glance.dart. Reads only.
//
// The ties ("Kai’s sister") come from the relationships, which arrive with Organize; until then the caller passes
// none.

import { type JsonMap, listOf, isMap, str } from '../json';
import { dartTrim } from '../text/dartString';

/** Where a name is on the page: whose it is, and where it starts and ends. */
export type NameAt = { id: string; start: number; end: number };

const letter = /[\p{L}\p{N}]/u;

function whole(text: string, start: number, end: number): boolean {
  return (start === 0 || !letter.test(text[start - 1])) && (end === text.length || !letter.test(text[end]));
}

/** The name on `text` that the caret at `caret` is in or touches (the longest, where names overlap), as written:
 * whole words, capitals as recorded. */
export function nameAt(text: string, caret: number, names: Readonly<Record<string, readonly string[]>>): NameAt | null {
  if (text === '' || caret < 0 || caret > text.length) return null;
  let best: NameAt | null = null;
  for (const [id, list] of Object.entries(names)) {
    for (const name of list) {
      if (name === '') continue;
      let from = Math.min(Math.max(caret - name.length, 0), text.length);
      for (;;) {
        const at = text.indexOf(name, from);
        if (at < 0 || at > caret) break;
        const end = at + name.length;
        if (end >= caret && whole(text, at, end) && (best === null || end - at > best.end - best.start)) {
          best = { id, start: at, end };
        }
        from = at + 1;
      }
    }
  }
  return best;
}

/** One fact on the card: its label, as recorded ("Eyes"), and its value ("Grey"). */
export type GlanceFact = { label: string; value: string };

/** The card: the name, what it is ("Protagonist", "Location"), the epithet, the facts, the ties, and the summary's
 * first sentence. */
export type GlanceCard = {
  id: string;
  name: string;
  what: string;
  epithet: string;
  facts: GlanceFact[];
  ties: string[];
  summary: string;
};

/** The longest a fact's value may be to stand on the card (longer ones are prose, for the profile). */
export const glanceFactChars = 40;

/** The card for `entry` (a loreEntries row): `what` says what it is when it is not a character with a role. Facts are
 * its fields with a short value, in the order recorded. */
export function glanceOf(
  entry: JsonMap,
  { profile = null, what = '', ties = [] }: { profile?: JsonMap | null; what?: string; ties?: string[] } = {},
): GlanceCard {
  const facts: GlanceFact[] = [];
  for (const f of listOf(entry['fields']).filter(isMap)) {
    const key = dartTrim(str(f['key']));
    const value = str(f['value']);
    const v = dartTrim(value);
    if (key !== '' && v !== '' && v.length <= glanceFactChars && !value.includes('\n')) facts.push({ label: key, value: v });
  }
  const roles = profile
    ? listOf(profile['roles'])
        .filter((r): r is string => typeof r === 'string')
        .filter((r) => dartTrim(r) !== '')
    : [];
  const name = dartTrim(str(entry['name']));
  const summary = str(entry['summary']);
  return {
    id: str(entry['id']),
    name: name === '' ? 'Unnamed' : name,
    what: roles.length > 0 ? roles.map(capital).join(', ') : what,
    epithet: profile ? dartTrim(str(profile['epithet'])) : '',
    facts,
    ties,
    summary: firstSentence(dartTrim(summary) !== '' ? summary : str(entry['description'])),
  };
}

function capital(s: string): string {
  return s === '' ? s : `${s[0].toUpperCase()}${s.substring(1)}`;
}

/** The first sentence of `text`, cut at about 160 characters. */
function firstSentence(text: string): string {
  const t = dartTrim(text).replace(/\s+/g, ' ');
  if (t === '') return '';
  const stop = /[.!?…](?=\s|$)/.exec(t);
  const s = stop === null ? t : t.substring(0, stop.index + stop[0].length);
  if (s.length <= 160) return s;
  const cut = s.lastIndexOf(' ', 157);
  return `${s.substring(0, cut < 0 ? 157 : cut)}…`;
}
