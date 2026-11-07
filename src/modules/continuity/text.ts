import { HOURS, type TimeUnit } from './types';

interface PMNode {
  type?: string;
  text?: string;
  marks?: { type: string; attrs?: { entryId?: unknown } }[];
  content?: PMNode[];
}

export interface Paragraph {
  /** Paragraph number, counted the way the editor and search count it. */
  index: number;
  text: string;
  /** Words linked to a codex entry in this paragraph. */
  links: { entryId: string; text: string }[];
}

/** The paragraphs and headings of a saved document, with the entity links inside each. Reads only. */
export function paragraphsOf(doc: unknown): Paragraph[] {
  const out: Paragraph[] = [];
  const walk = (node: PMNode | null | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'paragraph' || node.type === 'heading') {
      const paragraph: Paragraph = { index: out.length, text: '', links: [] };
      const inline = (nodes: PMNode[] | undefined) => {
        for (const child of nodes ?? []) {
          if (child.type === 'text') {
            const text = child.text ?? '';
            paragraph.text += text;
            for (const mark of child.marks ?? []) {
              if (mark.type !== 'entityLink' || typeof mark.attrs?.entryId !== 'string') continue;
              const last = paragraph.links[paragraph.links.length - 1];
              // A link split by formatting is still one link.
              if (last?.entryId === mark.attrs.entryId && paragraph.text.endsWith(last.text + text)) last.text += text;
              else paragraph.links.push({ entryId: mark.attrs.entryId, text });
            }
          } else if (child.type === 'hardBreak') paragraph.text += '\n';
          else inline(child.content);
        }
      };
      inline(node.content);
      out.push(paragraph);
    } else for (const child of node.content ?? []) walk(child);
  };
  walk(doc as PMNode);
  return out;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BEFORE = '(?<![\\p{L}\\p{N}])';
const AFTER = '(?![\\p{L}\\p{N}])';

export interface Found {
  index: number;
  text: string;
}

/** Every place one of `terms` appears as whole words. Names are matched as written; set `loose` for ordinary words. */
export function find(text: string, terms: string[], loose = false): Found[] {
  const wanted = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!wanted.length) return [];
  const pattern = new RegExp(`${BEFORE}(?:${wanted.map(escape).join('|')})${AFTER}`, loose ? 'giu' : 'gu');
  return [...text.matchAll(pattern)].map((m) => ({ index: m.index, text: m[0] }));
}

export const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?…]["”’']?)\s+/).filter((s) => s.trim());

const SPEECH = 'said|says|asked|asks|replied|replies|answered|answers|shouted|whispered|muttered|murmured|called|cried|snapped|growled|hissed|added|continued|agreed|laughed';
const ACTS = `${SPEECH}|smiled|grinned|nodded|shrugged|sighed|frowned|walked|ran|stepped|stood|sat|turned|looked|glanced|stared|drew|grabbed|took|reached|opened|closed|entered|left|arrived|came|went|fought|struck|spoke|speaks|waved|pointed|leaned|raised|lifted|pulled|pushed|kicked|jumped|knelt|bowed|smiles|nods|walks|runs|steps|stands|sits|turns|looks|draws|grabs|takes|reaches|opens|enters|leaves|arrives|comes|goes|fights|strikes`;
const ACTS_AFTER = new RegExp(`^,?\\s+(?:(?:\\p{L}+ly|then|just|only|also|still|now|suddenly)\\s+)?(?:${ACTS})${AFTER}`, 'u');
const SPEECH_BEFORE = new RegExp(`${BEFORE}(?:${SPEECH})\\s+$`, 'u');

/**
 * Whether a name at this place in the text is doing or saying something:
 * "Mira smiled", "Mira quietly said", "said Mira". "Mira had said" and
 * "they spoke of Mira" are not, which is how the dead are usually written.
 */
export const isActing = (text: string, at: Found): boolean => ACTS_AFTER.test(text.slice(at.index + at.text.length, at.index + at.text.length + 40)) || SPEECH_BEFORE.test(text.slice(Math.max(0, at.index - 20), at.index));

const USES = 'drew|draws|drawing|wielded|wields|wielding|swung|swings|swinging|raised|raises|raising|unsheathed|unsheathes|gripped|grips|gripping|held|holds|holding|carried|carries|carrying|used|uses|using|brandished|brandishes|lifted|lifts|fired|fires|wore|wears|wearing|opened|opens|drank|drinks|read|reads|sheathed|pocketed|handed|threw|throws|clutched|clutching';
const USED_BEFORE = new RegExp(`${BEFORE}(?:${USES})\\s+(?:(?:the|his|her|their|its|my|our|your|a|an|that|this)\\s+)?(?:[\\p{L}'’-]+\\s+){0,2}$`, 'iu');
const IN_HAND_AFTER = /^\s+(?:in|into)\s+(?:his|her|their|my|its|one|both)\s+(?:hands?|grip|fist)/iu;

/** Whether an item named at this place is being handled: "drew the Sunblade", "the Sunblade in her hand". */
export const isUsed = (text: string, at: Found): boolean => USED_BEFORE.test(text.slice(Math.max(0, at.index - 60), at.index)) || IN_HAND_AFTER.test(text.slice(at.index + at.text.length, at.index + at.text.length + 30));

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const WORD_NUMBER = `(?:${Object.keys(NUMBER_WORDS).filter((w) => w.length > 2).join('|')})(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?`;

/** "19", "nineteen", "twenty-two". Null for anything else. */
export function toNumber(text: string): number | null {
  const clean = text.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
  const parts = clean.split(/[- ]/);
  if (!parts.every((p) => p in NUMBER_WORDS)) return null;
  return parts.reduce((sum, p) => sum + NUMBER_WORDS[p], 0);
}

export interface Duration {
  amount: number;
  unit: TimeUnit;
  hours: number;
  text: string;
}

const DURATION = new RegExp(`${BEFORE}(half an?|\\d+(?:\\.\\d+)?|an?|${WORD_NUMBER})[\\s-]+(minute|hour|day|week|month)s?${AFTER}`, 'giu');

/** Lengths of time stated in a passage: "two hours", "3 days", "half an hour", "a week". */
export function durationsIn(text: string): Duration[] {
  return [...text.matchAll(DURATION)].flatMap((m) => {
    const amount = /^half/i.test(m[1]) ? 0.5 : toNumber(m[1]);
    const unit = `${m[2].toLowerCase()}s` as TimeUnit;
    return amount === null ? [] : [{ amount, unit, hours: amount * HOURS[unit], text: m[0] }];
  });
}

export const TRAVEL_WORDS = ['travel', 'travelled', 'traveled', 'travelling', 'journey', 'journeyed', 'rode', 'ride', 'riding', 'walk', 'walked', 'sailed', 'sail', 'voyage', 'trip', 'reached', 'arrived', 'flew', 'flight', 'marched', 'march', 'trek', 'trekked', 'drove', 'crossing', 'crossed', 'road'];

export const formatDuration = (amount: number, unit: TimeUnit): string => `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;

const COLOURS: Record<string, string> = {
  blue: 'blue', green: 'green', brown: 'brown', grey: 'grey', gray: 'grey', black: 'black', hazel: 'hazel', amber: 'amber', violet: 'violet', red: 'red', golden: 'golden', gold: 'golden',
  silver: 'silver', white: 'white', blond: 'blonde', blonde: 'blonde', auburn: 'auburn', copper: 'copper', chestnut: 'chestnut', purple: 'purple', yellow: 'yellow', pink: 'pink', orange: 'orange',
};
const COLOUR = Object.keys(COLOURS).join('|');

/** The colours named in a piece of text, with spelling variants folded together ("gray" is "grey"). */
export const coloursIn = (text: string): string[] => [...new Set(find(text, Object.keys(COLOURS), true).map((f) => COLOURS[f.text.toLowerCase()]))];

/** The colour a sentence gives to someone's eyes or hair: "her grey eyes", "Alex's hair was black". */
export function colourOf(sentence: string, feature: 'eyes' | 'hair', names: string[]): Found | null {
  const owner = `(?:${names.map(escape).join('|')})['’]s|his|her|their|whose`;
  const before = new RegExp(`${BEFORE}(?:${owner})\\s+(?:[\\p{L}-]+,?\\s+){0,2}?(${COLOUR})(?:[\\s-]+[\\p{L}-]+)?\\s+${feature}${AFTER}`, 'iu').exec(sentence);
  const after = new RegExp(`${BEFORE}(?:${owner})\\s+${feature}\\s+(?:were|was|are|is)\\s+(?:[\\p{L}-]+\\s+)?(${COLOUR})${AFTER}`, 'iu').exec(sentence);
  const hit = before ?? after;
  return hit ? { index: hit.index, text: hit[0] } : null;
}

/** The age a sentence gives for one of `names`: "Alex was nineteen years old", "nineteen-year-old Alex", "Alex, 19,". */
export function ageOf(sentence: string, names: string[]): { age: number; text: string } | null {
  const name = `(?:${names.map(escape).join('|')})`;
  const number = `(\\d{1,3}|${WORD_NUMBER})`;
  const patterns = [
    new RegExp(`${BEFORE}${name}\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?${number}\\s+years?[\\s-]+old`, 'u'),
    new RegExp(`${BEFORE}${name}\\s+(?:was|is|had just turned|had turned|turned|turns)\\s+(?:only\\s+|just\\s+|now\\s+|barely\\s+)?(\\d{1,3})(?=[.,;!?]|\\s+(?:and|when|then|but)\\b|$)`, 'u'),
    new RegExp(`${BEFORE}${number}[\\s-]+years?[\\s-]+old\\s+${name}${AFTER}`, 'iu'),
    new RegExp(`${BEFORE}${name},\\s+(?:aged?\\s+)?(\\d{1,3}),`, 'u'),
  ];
  for (const pattern of patterns) {
    const hit = pattern.exec(sentence);
    const age = hit ? toNumber(hit[1]) : null;
    if (hit && age !== null && age < 1000) return { age, text: hit[0] };
  }
  return null;
}

/** A short, stable fingerprint of a passage. The same words give the same value on every run. */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (const char of text.toLowerCase().replace(/\s+/g, ' ').trim()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Keeps an excerpt readable: the sentence around the match, trimmed to a sensible length. */
export function excerptAround(text: string, at: number, length = 220): string {
  if (text.length <= length) return text;
  const start = Math.max(0, Math.min(at - Math.floor(length / 3), text.length - length));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + length).trim()}${start + length < text.length ? '…' : ''}`;
}
