// What a manuscript file is read into, whatever its format: plain text, Markdown and Rich Text Format (Word documents
// are importDocx.ts). A port of flutter_app/lib/shared/domain/exchange/import_parse.dart.

import { dartTrim, dartTrimLeft, dartTrimRight } from '../text/dartString';
import { type Align, Run } from './compile';

/** A heading the file itself marked as one. Level 0 is a document title. */
export class ImportHeading {
  readonly type = 'heading' as const;
  constructor(
    readonly level: number,
    readonly text: string,
  ) {}
}

export class ImportParagraph {
  readonly type = 'paragraph' as const;
  constructor(
    readonly runs: readonly Run[],
    readonly align: Align | null = null,
    readonly quote: boolean = false,
  ) {}
  get text(): string {
    return this.runs.map((r) => r.text).join('');
  }
}

/** A scene break or horizontal rule. */
export class ImportDivider {
  readonly type = 'divider' as const;
}

export type ImportBlock = ImportHeading | ImportParagraph | ImportDivider;

/** Why a file cannot be read. Nothing is imported when this is thrown. */
export class ImportException extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ImportException';
  }
}

const normalise = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/** Plain text. One paragraph per line, blank lines dropped; unless the file is hard-wrapped (short lines in blocks
 * separated by blank lines), in which case each block is re-joined into one paragraph. Indents are kept as typed. */
export function parseText(source: string): ImportBlock[] {
  const lines = normalise(source).split('\n').map(dartTrimRight);
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (dartTrim(line).length > 0) {
      current.push(line);
    } else if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);

  const inner = chunks.flatMap((chunk) => chunk.slice(0, chunk.length - 1));
  const wrapped = inner.length >= 5 && inner.filter((line) => line.length >= 45 && line.length <= 100).length / inner.length > 0.7;
  const paragraphs = wrapped ? chunks.map((chunk) => chunk.map((line, i) => (i > 0 ? dartTrim(line) : line)).join(' ')) : chunks.flat();
  return paragraphs.map((text) => new ImportParagraph([new Run(text)]));
}

const inlinePattern =
  /\\([\\`*_{}[\]<>#|~-])|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\2|(\*|_)(?=\S)([\s\S]+?)(?<=\S)\4|~~([\s\S]+?)~~|<u>([\s\S]+?)<\/u>/;

type Style = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };
const plainStyle: Style = { bold: false, italic: false, underline: false, strike: false };

/** Inline Markdown (bold, italic, strikethrough, underline, escapes) to formatted runs. */
export function parseInline(text: string, style: Style = plainStyle): Run[] {
  const runs: Run[] = [];
  const push = (value: string) => {
    if (value.length > 0) runs.push(new Run(value, style));
  };
  let rest = text;
  // Each match consumes at least two characters, so this ends within text.length turns.
  for (let turns = 0; turns <= text.length; turns++) {
    const match = inlinePattern.exec(rest);
    if (match === null) break;
    push(rest.substring(0, match.index));
    if (match[1] !== undefined) {
      push(match[1]);
    } else if (match[2] !== undefined) {
      runs.push(...parseInline(match[3], { ...style, bold: true }));
    } else if (match[4] !== undefined) {
      runs.push(...parseInline(match[5], { ...style, italic: true }));
    } else if (match[6] !== undefined) {
      runs.push(...parseInline(match[6], { ...style, strike: true }));
    } else {
      runs.push(...parseInline(match[7], { ...style, underline: true }));
    }
    rest = rest.substring(match.index + match[0].length);
  }
  push(rest);
  return runs;
}

const rule = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;

/** Markdown: `#` and underlined headings, rules as scene breaks, block quotes, inline formatting. */
export function parseMarkdown(source: string): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  let lines: string[] = [];
  let quote = false;
  const flush = () => {
    if (lines.length === 0) return;
    // Lines of one paragraph are joined; a trailing backslash or two spaces is a real line break.
    const text = lines
      .map((line, i) =>
        i === lines.length - 1 ? dartTrimRight(line) : /(\\| {2,})$/.test(line) ? `${line.replace(/(\\| {2,})$/, '')}\n` : `${dartTrimRight(line)} `,
      )
      .join('');
    blocks.push(
      new ImportParagraph(
        text === '&nbsp;' ? [] : parseInline(text.replace(/^(\s*)(\d+)\\\. /, (_m, a: string, b: string) => `${a}${b}. `)),
        null,
        quote,
      ),
    );
    lines = [];
  };

  for (const raw of normalise(source).split('\n')) {
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    const isQuote = /^ {0,3}>/.test(raw);
    if (heading !== null) {
      flush();
      blocks.push(new ImportHeading(heading[1].length, parseInline(heading[2]).map((r) => r.text).join('')));
    } else if (/^\s*=+\s*$/.test(raw) && lines.length === 1 && !quote) {
      blocks.push(new ImportHeading(1, parseInline(dartTrim(lines.pop()!)).map((r) => r.text).join('')));
    } else if (rule.test(raw)) {
      flush();
      blocks.push(new ImportDivider());
    } else if (dartTrim(raw).length === 0) {
      flush();
    } else {
      if (isQuote !== quote) flush();
      quote = isQuote;
      lines.push(isQuote ? raw.replace(/^ {0,3}> ?/, '') : raw);
    }
  }
  flush();
  return blocks;
}

const cp1252: Readonly<Record<number, string>> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

/** Groups that hold settings or binary data rather than text. */
const skipped = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl',
  'footerr', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'generator', 'listtable',
  'listoverridetable', 'rsidtbl', 'xmlnstbl', 'fldinst',
]);
const has = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);
const symbols: Readonly<Record<string, string>> = {
  tab: '\t', emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
  bullet: '•', emspace: ' ', enspace: ' ', '~': ' ', _: '-',
};

type RtfState = Style & { align: Align | null; skip: boolean; uc: number };

/** Dart's `int.tryParse` for the decimal numbers RTF writes. */
function intTryParse(text: string): number | null {
  return /^[+-]?\d+$/.test(text) ? Number(text) : null;
}

/** Dart's `String.fromCharCode` for a UTF-16 code unit or a code point. */
const fromCode = (code: number) => (code <= 0xffff ? String.fromCharCode(code) : String.fromCodePoint(code));

/** Rich Text Format: paragraphs, bold/italic/underline/strikethrough, alignment, and all the usual character escapes. */
export function parseRtf(source: string): ImportBlock[] {
  if (!dartTrimLeft(source).startsWith('{\\rtf')) throw new ImportException('This does not look like an RTF file.');
  const blocks: ImportBlock[] = [];
  const stack: RtfState[] = [];
  let state: RtfState = { ...plainStyle, align: null, skip: false, uc: 1 };
  let runs: Run[] = [];
  let align: Align | null = null;
  let pending = 0; // fallback characters to ignore after a \u escape

  const emit = (value: string) => {
    let text = value;
    if (state.skip || text.length === 0) return;
    if (pending > 0) {
      const dropped = pending < text.length ? pending : text.length;
      pending -= dropped;
      text = text.substring(dropped);
      if (text.length === 0) return;
    }
    const last = runs.length === 0 ? null : runs[runs.length - 1];
    if (last !== null && last.bold === state.bold && last.italic === state.italic && last.underline === state.underline && last.strike === state.strike) {
      runs[runs.length - 1] = new Run(last.text + text, last);
    } else {
      runs.push(new Run(text, state));
    }
    align = state.align;
  };

  const endParagraph = () => {
    if (runs.some((r) => dartTrim(r.text).length > 0)) blocks.push(new ImportParagraph(runs, align));
    runs = [];
    align = null;
  };

  const token = /\\([a-z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|([^\\{}]+)/gi;
  for (const m of source.matchAll(token)) {
    const word = m[1];
    const number = m[2];
    const hex = m[3];
    const symbol = m[4];
    const brace = m[5];
    const text = m[6];
    if (brace === '{') {
      stack.push({ ...state });
    } else if (brace === '}') {
      state = stack.length > 0 ? stack.pop()! : state;
    } else if (hex !== undefined) {
      const code = parseInt(hex, 16);
      emit(cp1252[code] ?? String.fromCharCode(code));
    } else if (symbol !== undefined) {
      if (symbol === '*') {
        state.skip = true;
      } else if (symbol === '\n' || symbol === '\r') {
        endParagraph();
      } else {
        emit(has(symbols, symbol) ? symbols[symbol] : symbol);
      }
    } else if (text !== undefined) {
      emit(text.replace(/[\r\n]/g, ''));
    } else if (word !== undefined) {
      const on = number !== '0';
      if (skipped.has(word)) {
        state.skip = true;
      } else if (word === 'par' || word === 'sect' || word === 'page') {
        endParagraph();
      } else if (word === 'line') {
        emit('\n');
      } else if (word === 'b') {
        state.bold = on;
      } else if (word === 'i') {
        state.italic = on;
      } else if (word === 'ul') {
        state.underline = on;
      } else if (word === 'ulnone') {
        state.underline = false;
      } else if (word === 'strike') {
        state.strike = on;
      } else if (word === 'plain') {
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.strike = false;
      } else if (word === 'pard' || word === 'ql') {
        state.align = null;
      } else if (word === 'qc') {
        state.align = 'center';
      } else if (word === 'qr') {
        state.align = 'right';
      } else if (word === 'qj') {
        state.align = 'justify';
      } else if (word === 'uc') {
        state.uc = intTryParse(number ?? '1') ?? 1;
      } else if (word === 'u' && number !== undefined) {
        const code = Number(number);
        emit(fromCode(code < 0 ? code + 65536 : code));
        pending = state.uc;
      } else if (has(symbols, word)) {
        emit(symbols[word]);
      }
    }
  }
  endParagraph();
  return blocks;
}
