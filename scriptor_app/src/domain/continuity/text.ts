// READING THE MANUSCRIPT FOR THE CONTINUITY CHECK (as in the original app). Words are matched, never understood: every
// finding built on these says "appears to". A port of flutter_app/lib/shared/domain/continuity/text.dart (its
// `WordIndex` was ported before, for namedIn.ts, and is re-exported from there).

import { dartEscape } from '../characters/pageText';
import { type JsonMap, isMap, listOf, mapOrNull, str } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { maps } from '../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { hoursIn, type RuleTimeUnit } from './rules';

export { WordIndex } from '../characters/wordIndex';

/** A paragraph or heading of a saved document: its number (counted the way the editor and search count it), its text,
 * and the words linked to a codex entry inside it. */
export class Paragraph {
  text = '';
  readonly links: { entryId: string; text: string }[] = [];
  constructor(readonly index: number) {}
}

/** The paragraphs and headings of a saved document, with the entity links inside each. Reads only. */
export function paragraphsOf(doc: unknown): Paragraph[] {
  const out: Paragraph[] = [];
  const walk = (node: JsonMap | null): void => {
    if (node === null) return;
    const type = node['type'];
    if (type === 'paragraph' || type === 'heading') {
      const paragraph = new Paragraph(out.length);
      const inline = (nodes: unknown): void => {
        for (const child of maps(nodes)) {
          if (child['type'] === 'text') {
            const text = str(child['text']);
            paragraph.text += text;
            for (const mark of maps(child['marks'])) {
              const id = mapOrNull(mark['attrs'])?.['entryId'];
              if (mark['type'] !== 'entityLink' || typeof id !== 'string') continue;
              const last = paragraph.links.length === 0 ? null : paragraph.links[paragraph.links.length - 1];
              // A link split by formatting is still one link.
              if (last !== null && last.entryId === id && paragraph.text.endsWith(last.text + text)) {
                paragraph.links[paragraph.links.length - 1] = { entryId: id, text: last.text + text };
              } else {
                paragraph.links.push({ entryId: id, text });
              }
            }
          } else if (child['type'] === 'hardBreak') {
            paragraph.text += '\n';
          } else {
            inline(child['content']);
          }
        }
      };
      inline(node['content']);
      out.push(paragraph);
    } else {
      for (const child of listOf(node['content'])) if (isMap(child)) walk(child);
    }
  };
  walk(mapOrNull(doc));
  return out;
}

const before = '(?<![\\p{L}\\p{N}])';
const after = '(?![\\p{L}\\p{N}])';

/** A place in a text: where it starts, and the words found there. */
export type Found = { index: number; text: string };

/** Every place one of `terms` appears as whole words. Names are matched as written; set `loose` for ordinary words. */
export function findWords(text: string, terms: readonly string[], options: { loose?: boolean } = {}): Found[] {
  const loose = options.loose ?? false;
  const set = new Set<string>();
  for (const t of terms) if (dartTrim(t).length > 0) set.add(dartTrim(t));
  const wanted = dartSort([...set], (a, b) => b.length - a.length);
  if (wanted.length === 0) return [];
  const out: Found[] = [];
  for (const m of text.matchAll(patternFor(wanted, loose))) out.push({ index: m.index, text: m[0] });
  return out;
}

/** In order of use, the least recently used first: the same names are looked for in paragraph after paragraph, and
 * making a pattern costs far more than running it. The pattern is the same either way, so what is found is too. */
const patterns = new Map<string, RegExp>();
const kept = 256;

function patternFor(wanted: readonly string[], loose: boolean): RegExp {
  const key = `${loose ? 'l' : 's'}\u0000${wanted.join('\u0001')}`;
  const had = patterns.get(key);
  if (had !== undefined) {
    patterns.delete(key);
    patterns.set(key, had);
    return had;
  }
  if (patterns.size >= kept) patterns.delete(patterns.keys().next().value as string);
  const made = new RegExp(`${before}(?:${wanted.map(dartEscape).join('|')})${after}`, loose ? 'giu' : 'gu');
  patterns.set(key, made);
  return made;
}

const sentenceBreak = /(?<=[.!?…]["”’']?)\s+/u;

/** The sentences of a text: split after an end mark (and a quote closing after it). */
export function sentencesOf(text: string): string[] {
  return text.split(sentenceBreak).filter((s) => dartTrim(s).length > 0);
}

const speech =
  'said|says|asked|asks|replied|replies|answered|answers|shouted|whispered|muttered|murmured|called|cried|snapped|' +
  'growled|hissed|added|continued|agreed|laughed';
const acts =
  `${speech}|smiled|grinned|nodded|shrugged|sighed|frowned|walked|ran|stepped|stood|sat|turned|looked|glanced|stared|` +
  'drew|grabbed|took|reached|opened|closed|entered|left|arrived|came|went|fought|struck|spoke|speaks|waved|pointed|' +
  'leaned|raised|lifted|pulled|pushed|kicked|jumped|knelt|bowed|smiles|nods|walks|runs|steps|stands|sits|turns|looks|' +
  'draws|grabs|takes|reaches|opens|enters|leaves|arrives|comes|goes|fights|strikes';
const actsAfter = new RegExp(
  `^,?\\s+(?:(?:\\p{L}+ly|then|just|only|also|still|now|suddenly)\\s+)?(?:${acts})${after}`,
  'u',
);
const speechBefore = new RegExp(`${before}(?:${speech})\\s+$`, 'u');

/** Dart's `clamp` on whole numbers. */
const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function slice(text: string, start: number, end: number): string {
  return text.substring(clampInt(start, 0, text.length), clampInt(end, 0, text.length));
}

/** Whether a name at this place in the text is doing or saying something: "Mira smiled", "Mira quietly said", "said
 * Mira". "Mira had said" and "they spoke of Mira" are not, which is how the dead are usually written. */
export function isActing(text: string, at: Found): boolean {
  return (
    actsAfter.test(slice(text, at.index + at.text.length, at.index + at.text.length + 40)) ||
    speechBefore.test(slice(text, at.index - 20, at.index))
  );
}

const uses =
  'drew|draws|drawing|wielded|wields|wielding|swung|swings|swinging|raised|raises|raising|unsheathed|unsheathes|' +
  'gripped|grips|gripping|held|holds|holding|carried|carries|carrying|used|uses|using|brandished|brandishes|lifted|' +
  'lifts|fired|fires|wore|wears|wearing|opened|opens|drank|drinks|read|reads|sheathed|pocketed|handed|threw|throws|' +
  'clutched|clutching';
const usedBefore = new RegExp(
  `${before}(?:${uses})\\s+(?:(?:the|his|her|their|its|my|our|your|a|an|that|this)\\s+)?(?:[\\p{L}'’-]+\\s+){0,2}$`,
  'iu',
);
const inHandAfter = /^\s+(?:in|into)\s+(?:his|her|their|my|its|one|both)\s+(?:hands?|grip|fist)/iu;

/** Whether an item named at this place is being handled: "drew the Sunblade", "the Sunblade in her hand". */
export function isUsed(text: string, at: Found): boolean {
  return (
    usedBefore.test(slice(text, at.index - 60, at.index)) ||
    inHandAfter.test(slice(text, at.index + at.text.length, at.index + at.text.length + 30))
  );
}

const numberWords: ReadonlyMap<string, number> = new Map([
  ['a', 1], ['an', 1], ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7],
  ['eight', 8], ['nine', 9], ['ten', 10], ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14],
  ['fifteen', 15], ['sixteen', 16], ['seventeen', 17], ['eighteen', 18], ['nineteen', 19], ['twenty', 20],
  ['thirty', 30], ['forty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70], ['eighty', 80], ['ninety', 90],
  ['hundred', 100],
]); // prettier-ignore
const wordNumber = `(?:${[...numberWords.keys()].filter((w) => w.length > 2).join('|')})(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?`;

/** "19", "nineteen", "twenty-two". Null for anything else. */
export function toNumber(text: string): number | null {
  const clean = dartToLowerCase(dartTrim(text));
  if (/^\d+(?:\.\d+)?$/.test(clean)) return parseFloat(clean);
  const parts = clean.split(/[- ]/);
  if (!parts.every((p) => numberWords.has(p))) return null;
  return parts.reduce((sum, p) => sum + numberWords.get(p)!, 0);
}

/** A length of time a passage states: how much, of what unit, as hours, and the words. */
export type StatedDuration = { amount: number; unit: RuleTimeUnit; hours: number; text: string };

const duration = new RegExp(
  `${before}(half an?|\\d+(?:\\.\\d+)?|an?|${wordNumber})[\\s-]+(minute|hour|day|week|month)s?${after}`,
  'giu',
);

/** Lengths of time stated in a passage: "two hours", "3 days", "half an hour", "a week". */
export function durationsIn(text: string): StatedDuration[] {
  const out: StatedDuration[] = [];
  for (const m of text.matchAll(duration)) {
    const amount = /^half/i.test(m[1]) ? 0.5 : toNumber(m[1]);
    if (amount === null) continue;
    const unit = `${dartToLowerCase(m[2])}s` as RuleTimeUnit;
    out.push({ amount, unit, hours: amount * hoursIn[unit], text: m[0] });
  }
  return out;
}

export const travelWords: readonly string[] = [
  'travel', 'travelled', 'traveled', 'travelling', 'journey', 'journeyed', 'rode', 'ride', 'riding', 'walk',
  'walked', 'sailed', 'sail', 'voyage', 'trip', 'reached', 'arrived', 'flew', 'flight', 'marched', 'march', 'trek',
  'trekked', 'drove', 'crossing', 'crossed', 'road',
]; // prettier-ignore

/** A double as the check prints it (Dart's `v == v.truncateToDouble() ? v.toInt().toString() : '$v'`): a whole one
 * without ".0" and in full (`toInt` stops at the largest 64-bit whole number), any other as Dart writes it. */
export function dartWhole(v: number): string {
  if (!Number.isInteger(v)) return String(v);
  if (v >= 9223372036854775807) return '9223372036854775807';
  if (v <= -9223372036854775808) return '-9223372036854775808';
  return Math.abs(v) < 1e21 ? String(v === 0 ? 0 : v) : BigInt(v).toString();
}

/** "3 days", "1 hour", as the check words a length of time. */
export function formatRuleDuration(amount: number, unit: string): string {
  return `${dartWhole(amount)} ${amount === 1 ? unit.substring(0, unit.length - 1) : unit}`;
}

const colours: ReadonlyMap<string, string> = new Map([
  ['blue', 'blue'], ['green', 'green'], ['brown', 'brown'], ['grey', 'grey'], ['gray', 'grey'], ['black', 'black'],
  ['hazel', 'hazel'], ['amber', 'amber'], ['violet', 'violet'], ['red', 'red'], ['golden', 'golden'],
  ['gold', 'golden'], ['silver', 'silver'], ['white', 'white'], ['blond', 'blonde'], ['blonde', 'blonde'],
  ['auburn', 'auburn'], ['copper', 'copper'], ['chestnut', 'chestnut'], ['purple', 'purple'], ['yellow', 'yellow'],
  ['pink', 'pink'], ['orange', 'orange'],
]); // prettier-ignore
const colour = [...colours.keys()].join('|');

/** The colours named in a piece of text, with spelling variants folded together ("gray" is "grey"). */
export function coloursIn(text: string): string[] {
  const out = new Set<string>();
  for (const f of findWords(text, [...colours.keys()], { loose: true })) out.add(colours.get(dartToLowerCase(f.text))!);
  return [...out];
}

/** The colour a sentence gives to someone's eyes or hair: "her grey eyes", "Alex's hair was black". */
export function colourOf(sentence: string, feature: string, names: readonly string[]): Found | null {
  const owner = `(?:${names.map(dartEscape).join('|')})['’]s|his|her|their|whose`;
  const beforeHit = new RegExp(
    `${before}(?:${owner})\\s+(?:[\\p{L}-]+,?\\s+){0,2}?(${colour})(?:[\\s-]+[\\p{L}-]+)?\\s+${feature}${after}`,
    'iu',
  ).exec(sentence);
  const afterHit = new RegExp(
    `${before}(?:${owner})\\s+${feature}\\s+(?:were|was|are|is)\\s+(?:[\\p{L}-]+\\s+)?(${colour})${after}`,
    'iu',
  ).exec(sentence);
  const hit = beforeHit ?? afterHit;
  return hit === null ? null : { index: hit.index, text: hit[0] };
}

/** The age a sentence gives for one of `names`: "Alex was nineteen years old", "nineteen-year-old Alex", "Alex, 19,". */
export function ageOf(sentence: string, names: readonly string[]): { age: number; text: string } | null {
  const name = `(?:${names.map(dartEscape).join('|')})`;
  const number = `(\\d{1,3}|${wordNumber})`;
  const patterns = [
    new RegExp(
      `${before}${name}\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?` +
        `${number}\\s+years?[\\s-]+old`,
      'u',
    ),
    new RegExp(
      `${before}${name}\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?` +
        '(\\d{1,3})(?=[.,;!?]|\\s+(?:and|when|then|but)\\b|$)',
      'u',
    ),
    new RegExp(`${before}${number}[\\s-]+years?[\\s-]+old\\s+${name}${after}`, 'iu'),
    new RegExp(`${before}${name},\\s+(?:aged?\\s+)?(\\d{1,3}),`, 'u'),
  ];
  for (const pattern of patterns) {
    const hit = pattern.exec(sentence);
    const age = hit === null ? null : toNumber(hit[1]);
    if (hit !== null && age !== null && age < 1000) return { age, text: hit[0] };
  }
  return null;
}

/** A short, stable fingerprint of a passage. The same words give the same value on every run (FNV-1a, as the
 * original), read by code point as Dart's `runes` are. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (const ch of dartTrim(dartToLowerCase(text).replace(/\s+/g, ' '))) {
    hash = (hash ^ ch.codePointAt(0)!) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Keeps an excerpt readable: the sentence around the match, trimmed to a sensible length. */
export function excerptAround(text: string, at: number, length = 220): string {
  if (text.length <= length) return text;
  const start = clampInt(at - Math.trunc(length / 3), 0, text.length - length);
  const cut = dartTrim(text.substring(start, start + length));
  return `${start > 0 ? '…' : ''}${cut}${start + length < text.length ? '…' : ''}`;
}
