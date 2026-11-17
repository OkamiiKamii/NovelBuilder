// VOICES: who speaks each line of dialogue in a chapter, found by how dialogue is written (the same rules as "In their
// own words", `characters/voice.dart`), never guessed:
//
// - a quotation followed by a word of speech and a name: “It's going,” Wren said / “Go,” said Nan;
// - a name and a word of speech before it: Wren said, “Go.” / Ilse whispered: “Close the drawer.”;
// - in a paragraph where one character alone is named as speaking, its other quotations too.
//
// "She said" names no one: the line is dialogue nobody is named for. So is a line in a paragraph where two are named
// as speaking and it is tied to neither. Reads the text only; returns places in it. Pure TypeScript (it also runs in
// the editor's WebView). A port of flutter_app/lib/shared/domain/text/voices.dart.

/** One quotation: the paragraph it is in, where it starts and ends (the quotation marks included, end exclusive), who
 * says it (a character's id, or null when nobody is named for it), and its words. */
export type VoiceLine = { block: number; start: number; end: number; speaker: string | null; words: number };

/** One speaker's share of the dialogue: their words and their lines (speaker null: nobody named). */
export type VoiceShare = { speaker: string | null; words: number; lines: number };

/** The chapter's dialogue: every quotation in order, and its words against the chapter's. */
export class VoiceReport {
  static readonly empty = new VoiceReport([], 0);

  /**
   * @param lines Every quotation in order.
   * @param chapterWords Every word in the chapter, dialogue and the rest.
   */
  constructor(
    readonly lines: readonly VoiceLine[],
    readonly chapterWords: number,
  ) {}

  /** The words of all the dialogue. */
  get dialogueWords(): number {
    return this.lines.reduce((a, l) => a + l.words, 0);
  }

  /** Words spoken by each speaker (null: nobody named), most first. */
  get speakers(): VoiceShare[] {
    const words = new Map<string | null, number>();
    const count = new Map<string | null, number>();
    for (const l of this.lines) {
      words.set(l.speaker, (words.get(l.speaker) ?? 0) + l.words);
      count.set(l.speaker, (count.get(l.speaker) ?? 0) + 1);
    }
    const out: VoiceShare[] = [...words.keys()].map((s) => ({ speaker: s, words: words.get(s)!, lines: count.get(s)! }));
    // Named speakers by how much they say; the unnamed lines last, whatever their length.
    out.sort((a, b) => {
      if ((a.speaker === null) !== (b.speaker === null)) return a.speaker === null ? 1 : -1;
      return b.words - a.words;
    });
    return out;
  }

  /** The lines of one speaker (null: the lines nobody is named for), in order. */
  of(speaker: string | null): VoiceLine[] {
    return this.lines.filter((l) => l.speaker === speaker);
  }
}

/** The words of speech a name is tied to a line by. */
export const speechWords: readonly string[] = [
  'said',
  'says',
  'asked',
  'asks',
  'whispered',
  'shouted',
  'called',
  'replied',
  'answered',
  'murmured',
  'cried',
  'snapped',
  'muttered',
  'added',
  'told',
  'began',
  'sang',
  'breathed',
  'laughed',
  'sighed',
  'admitted',
  'insisted',
  'demanded',
  'warned',
  'yelled',
  'hissed',
  'growled',
  'went on',
  'agreed',
  'explained',
  'repeated',
  'gasped',
];

const quoteSource = '“([^”]+)”|"([^"]+)"';
const word = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** How many words a text has, as the voices and the rhythm count them: a run of letters and digits, with apostrophes
 * and hyphens inside it ("don't", "well-known" are one word each). Not the manuscript's count (`prose.ts`). */
export function countWords(text: string): number {
  return text.match(word)?.length ?? 0;
}

// As Dart's String.trim, which also takes off U+0085 (NEXT LINE); JavaScript's `\s` and trim do not.
function dartTrim(text: string): string {
  return text.replace(/^[\s\u0085]+|[\s\u0085]+$/g, '');
}

// As Dart's RegExp.escape: the characters with a meaning in a pattern, each behind a backslash.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The dialogue in [paragraphs], with speakers from [names] (each character's id → the names they go by in the text,
 * as `namesToFind` gives them). A name two characters share speaks for neither. */
export function voicesOf(paragraphs: readonly string[], names: Readonly<Record<string, readonly string[]>>): VoiceReport {
  const owner = new Map<string, string | null>(); // name → its character, or null when two share it
  for (const [id, list] of Object.entries(names)) {
    for (const raw of list) {
      const n = dartTrim(raw);
      if (n.length === 0) continue;
      owner.set(n, owner.has(n) && owner.get(n) !== id ? null : id);
    }
  }
  const wanted = [...owner.entries()].filter(([, id]) => id !== null).map(([n]) => n);
  wanted.sort((a, b) => b.length - a.length);

  const verb = `(?:${speechWords.join('|')})`;
  let after: RegExp | null = null;
  let before: RegExp | null = null;
  if (wanted.length > 0) {
    const name = `(?:${wanted.map(escapeRegExp).join('|')})`;
    // After a line: “…,” Wren said / “…,” said Wren (a comma or dash left outside the marks is passed over).
    after = new RegExp('^[\\s,;:—–-]*(?:(' + name + ')\\s+' + verb + '\\b|' + verb + '\\s+(' + name + ')\\b)', 'u');
    // Before a line: Wren said, “…” / Ilse whispered: “…”.
    before = new RegExp(`(${name})\\s+${verb}(?:\\s+\\w+)?\\s*[,:]?\\s*$`, 'u');
  }
  // Anyone named as speaking at all ("She said" too), for telling a paragraph of one speaker from one of two.
  const anyone = new RegExp("(\\p{Lu}[\\p{L}'’-]+)\\s+" + verb + '\\b|\\b' + verb + "\\s+(\\p{Lu}[\\p{L}'’-]+)", 'gu');
  // "she said", "said he": someone else may be speaking, and is not named.
  const pronoun = new RegExp(
    '\\b(?:[Hh]e|[Ss]he|[Tt]hey|I|[Ww]e|[Yy]ou)\\s+' + verb + '\\b|\\b' + verb + '\\s+(?:he|she|they|I|we|you)\\b',
  );

  const idOf = (said: string): string | null => {
    const whole = owner.get(said);
    if (whole != null) return whole;
    // "Wren" in a paragraph where the name searched for was "Wren Hollis".
    const ids = new Set<string>();
    for (const n of wanted) if (n.split(' ').includes(said)) ids.add(owner.get(n)!);
    return ids.size === 1 ? [...ids][0] : null;
  };

  const endOf = (m: RegExpExecArray) => m.index + m[0].length;
  const lines: VoiceLine[] = [];
  let total = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i];
    total += countWords(text);
    const quotes = [...text.matchAll(new RegExp(quoteSource, 'g'))];
    if (quotes.length === 0) continue;
    const who: (string | null)[] = quotes.map(() => null);
    if (after !== null && before !== null) {
      for (let q = 0; q < quotes.length; q++) {
        const m = quotes[q];
        const tail = text.substring(endOf(m), Math.min(endOf(m) + 80, text.length));
        const head = text.substring(q === 0 ? 0 : endOf(quotes[q - 1]), m.index);
        const a = after.exec(tail);
        const b = a === null ? before.exec(head) : null;
        const said = a !== null ? (a[1] ?? a[2]) : b?.[1];
        if (said != null) who[q] = idOf(said);
      }
      // The only one named as speaking here: every line in it is theirs.
      const tied = new Set(who.filter((s): s is string => s !== null));
      const unquoted = text.replace(new RegExp(quoteSource, 'g'), ' ');
      if (tied.size === 1 && !pronoun.test(unquoted)) {
        const single = [...tied][0];
        const named = [...unquoted.matchAll(anyone)].map((s) => (s[1] ?? s[2])!);
        if (named.every((s) => idOf(s) === single)) who.fill(single);
      }
    }
    for (let q = 0; q < quotes.length; q++) {
      const m = quotes[q];
      const words = countWords(m[1] ?? m[2]!);
      if (words === 0) continue;
      lines.push({ block: i, start: m.index, end: endOf(m), speaker: who[q], words });
    }
  }
  return new VoiceReport(lines, total);
}
