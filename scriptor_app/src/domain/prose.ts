// Manuscript text is stored as ProseMirror document JSON (`chapterContents.doc`), exactly as the original web app and the
// Flutter app store it. These helpers read it without changing it. A port of
// flutter_app/lib/shared/domain/manuscript/prose.dart.

import { type JsonMap, isMap, listOf, str } from './json';

/** A new, empty chapter: one empty paragraph, as the editor writes it. */
export function emptyDoc(): JsonMap {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] };
}

function inlineText(nodes: unknown): string {
  return listOf(nodes)
    .filter(isMap)
    .map((n) => (n['type'] === 'text' ? str(n['text']) : n['type'] === 'hardBreak' ? '\n' : inlineText(n['content'])))
    .join('');
}

/** The paragraphs and headings of a document in reading order, each with its text. The position of each is the
 * paragraph number links in canon and comments rely on. */
export function docBlocks(doc: unknown): { heading: boolean; text: string }[] {
  const blocks: { heading: boolean; text: string }[] = [];
  const walk = (node: unknown): void => {
    if (!isMap(node)) return;
    const type = node['type'];
    if (type === 'paragraph' || type === 'heading') {
      blocks.push({ heading: type === 'heading', text: inlineText(node['content']) });
    } else {
      for (const c of listOf(node['content'])) walk(c);
    }
  };
  walk(doc);
  return blocks;
}

export function blockTexts(doc: unknown): string[] {
  return docBlocks(doc).map((b) => b.text);
}

/** Codex entries linked inside the text, in the order first linked. */
export function mentionsIn(doc: unknown): string[] {
  const ids = new Set<string>();
  const walk = (node: unknown): void => {
    if (!isMap(node)) return;
    for (const mark of listOf(node['marks']).filter(isMap)) {
      const id = isMap(mark['attrs']) ? mark['attrs']['entryId'] : undefined;
      if (mark['type'] === 'entityLink' && typeof id === 'string') ids.add(id);
    }
    for (const c of listOf(node['content'])) walk(c);
  };
  walk(doc);
  return [...ids];
}

/** A document from plain text: one paragraph per line, blank lines kept as empty paragraphs. */
export function textToDoc(text: string): JsonMap {
  return {
    type: 'doc',
    content: text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => ({
        type: 'paragraph',
        attrs: { textAlign: null },
        ...(line ? { content: [{ type: 'text', text: line }] } : {}),
      })),
  };
}

// ---------------------------------------------------------------------------------------------------- counting words

// Characters that join two letters ("don't", "e.g.") or two digits ("3.14", "1,000") into one word, as Unicode word
// boundaries (a browser's Intl.Segmenter, which the original app used) treat them.
const midLetter = new Set([0x3a, 0xb7, 0x387, 0x5f4, 0x2027, 0xfe13, 0xfe55, 0xff1a]);
const midNumLet = new Set([0x2e, 0x27, 0x2019, 0x2018, 0xfe52, 0xff07, 0xff0e]);
const midNum = new Set([
  0x2c, 0x3b, 0x37e, 0x589, 0x60c, 0x60d, 0x66c, 0x7f8, 0x2044, 0xfe10, 0xfe14, 0xfe50, 0xfe54, 0xff0c, 0xff1b,
]);

type Kind = 'letter' | 'digit' | 'connector' | 'other';
const letterRe = /\p{L}/u;
const markRe = /\p{M}/u;
const digitRe = /\p{Nd}/u;
const connectorRe = /\p{Pc}/u;

function kindOf(c: string): Kind {
  if (letterRe.test(c)) return 'letter';
  if (digitRe.test(c)) return 'digit';
  if (connectorRe.test(c)) return 'connector';
  return 'other';
}

/** How many words a text has, counted as the Flutter app counts them: "don't", "e.g.", "3.14", "1,000" and
 * "_snake_case" are one word each; "well-known" is two. */
export function countWords(text: string): number {
  const chars = Array.from(text);
  const kinds: (Kind | null)[] = chars.map((c) => (markRe.test(c) ? null : kindOf(c)));
  const wordish = (k: Kind | null) => k === 'letter' || k === 'digit' || k === 'connector';
  let words = 0;
  let i = 0;
  while (i < chars.length) {
    if (!wordish(kinds[i])) {
      i++;
      continue;
    }
    words++;
    let last = kinds[i]!;
    i++;
    while (i < chars.length) {
      const k = kinds[i];
      if (k === null) {
        i++; // A combining mark belongs to the character before it.
        continue;
      }
      if (wordish(k)) {
        last = k;
        i++;
        continue;
      }
      const next = i + 1 < chars.length ? kinds[i + 1] : null;
      const r = chars[i].codePointAt(0)!;
      const joinsLetters = last === 'letter' && next === 'letter' && (midLetter.has(r) || midNumLet.has(r));
      const joinsDigits = last === 'digit' && next === 'digit' && (midNum.has(r) || midNumLet.has(r));
      if (joinsLetters || joinsDigits) {
        i += 2;
        last = next!;
        continue;
      }
      break;
    }
  }
  return words;
}

export type Measure = { words: number; characters: number; paragraphs: number; readingMinutes: number };

/** Words, characters (Unicode code points), non-empty paragraphs and reading time at 250 words a minute. */
export function measure(blocks: readonly string[]): Measure {
  let words = 0;
  let characters = 0;
  let paragraphs = 0;
  for (const b of blocks) {
    words += countWords(b);
    characters += Array.from(b).length;
    if (b.trim()) paragraphs++;
  }
  const minutes = Math.round(words / 250);
  return { words, characters, paragraphs, readingMinutes: words === 0 ? 0 : Math.max(1, minutes) };
}

export function measureDoc(doc: unknown): Measure {
  return measure(blockTexts(doc));
}

// ------------------------------------------------------------------------------------------ comparing two documents

/** The order the original editor writes marks in (its schema's order). Marks it does not know come after, by type. */
const markOrder = ['bold', 'italic', 'strike', 'underline', 'entityLink'];

/** Neighbouring pieces of text with the same formatting are one piece: "—" then " a dash" is "— a dash". ProseMirror
 * joins them as it reads a document. */
function joinTextRuns(content: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const node of content) {
    const prev = out[out.length - 1];
    if (
      isMap(node) &&
      isMap(prev) &&
      node['type'] === 'text' &&
      prev['type'] === 'text' &&
      jsonEqualsMarks(prev['marks'], node['marks'])
    ) {
      out[out.length - 1] = { ...prev, text: str(prev['text']) + str(node['text']) };
    } else {
      out.push(node);
    }
  }
  return out;
}

function jsonEqualsMarks(a: unknown, b: unknown): boolean {
  return JSON.stringify(listOf(a)) === JSON.stringify(listOf(b));
}

/** A document in the form two documents can be compared in: marks in the schema's order, empty lists dropped, an
 * empty document's single empty paragraph made explicit, and the alignment paragraphs and headings carry by default
 * (`textAlign: null`, which the editor always writes) filled in where a stored file left it out. Used only to compare,
 * never to save. */
export function normalizeProse(doc: JsonMap): JsonMap {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isMap(v)) return v;
    const out: JsonMap = {};
    for (const [key, raw] of Object.entries(v)) {
      let value = walk(raw);
      if (key === 'marks' && Array.isArray(value)) {
        const rank = (t: string) => (markOrder.includes(t) ? markOrder.indexOf(t) : markOrder.length);
        value = [...value].sort((a, b) => {
          const ta = str(isMap(a) ? a['type'] : '');
          const tb = str(isMap(b) ? b['type'] : '');
          return rank(ta) - rank(tb) || (ta < tb ? -1 : ta > tb ? 1 : 0);
        });
      }
      if (key === 'content' && Array.isArray(value)) value = joinTextRuns(value);
      if ((key === 'marks' || key === 'content') && Array.isArray(value) && value.length === 0) continue;
      out[key] = value;
    }
    if (out['type'] === 'paragraph' || out['type'] === 'heading') {
      const attrs = isMap(out['attrs']) ? out['attrs'] : {};
      out['attrs'] = {
        ...attrs,
        textAlign: attrs['textAlign'] ?? null,
        // A heading without a level is a first-level heading, the schema's default.
        ...(out['type'] === 'heading' ? { level: attrs['level'] ?? 1 } : {}),
      };
    }
    return out;
  };
  const out = walk(doc) as JsonMap;
  if (listOf(out['content']).length === 0) out['content'] = [{ type: 'paragraph', attrs: { textAlign: null } }];
  return out;
}
