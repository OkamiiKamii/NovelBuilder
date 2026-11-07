import type { Run } from '../compile';
import type { ImportBlock } from './types';

const normalise = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');

/**
 * Plain text. One paragraph per line, blank lines dropped; unless the file is
 * hard-wrapped (short lines in blocks separated by blank lines), in which
 * case each block is re-joined into one paragraph. Indents are kept as typed.
 */
export function parseText(source: string): ImportBlock[] {
  const lines = normalise(source).split('\n').map((line) => line.trimEnd());
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim()) current.push(line);
    else if (current.length) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length) chunks.push(current);

  const inner = chunks.flatMap((chunk) => chunk.slice(0, -1));
  const wrapped = inner.length >= 5 && inner.filter((line) => line.length >= 45 && line.length <= 100).length / inner.length > 0.7;
  const paragraphs = wrapped ? chunks.map((chunk) => chunk.map((line, i) => (i ? line.trim() : line)).join(' ')) : chunks.flat();
  return paragraphs.map((text) => ({ type: 'paragraph', runs: [{ text }] }));
}

const INLINE = /\\([\\`*_{}[\]<>#|~-])|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\2|(\*|_)(?=\S)([\s\S]+?)(?<=\S)\4|~~([\s\S]+?)~~|<u>([\s\S]+?)<\/u>/;

/** Inline Markdown (bold, italic, strikethrough, underline, escapes) to formatted runs. */
export function parseInline(text: string, style: Omit<Run, 'text'> = {}): Run[] {
  const runs: Run[] = [];
  const push = (value: string) => value && runs.push({ text: value, ...style });
  let rest = text;
  for (let match = INLINE.exec(rest); match; match = INLINE.exec(rest)) {
    push(rest.slice(0, match.index));
    if (match[1] !== undefined) push(match[1]);
    else if (match[2]) runs.push(...parseInline(match[3], { ...style, bold: true }));
    else if (match[4]) runs.push(...parseInline(match[5], { ...style, italic: true }));
    else if (match[6] !== undefined) runs.push(...parseInline(match[6], { ...style, strike: true }));
    else runs.push(...parseInline(match[7], { ...style, underline: true }));
    rest = rest.slice(match.index + match[0].length);
  }
  push(rest);
  return runs;
}

const RULE = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;

/** Markdown: `#` and underlined headings, rules as scene breaks, block quotes, inline formatting. */
export function parseMarkdown(source: string): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  let lines: string[] = [];
  let quote = false;
  const flush = () => {
    if (!lines.length) return;
    // Lines of one paragraph are joined; a trailing backslash or two spaces is a real line break.
    const text = lines.map((line, i) => (i === lines.length - 1 ? line.trimEnd() : /(\\| {2,})$/.test(line) ? `${line.replace(/(\\| {2,})$/, '')}\n` : `${line.trimEnd()} `)).join('');
    blocks.push({ type: 'paragraph', runs: text === '&nbsp;' ? [] : parseInline(text.replace(/^(\s*)(\d+)\\\. /, '$1$2. ')), ...(quote ? { quote } : {}) });
    lines = [];
  };

  for (const raw of normalise(source).split('\n')) {
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    const isQuote = /^ {0,3}>/.test(raw);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: parseInline(heading[2]).map((r) => r.text).join('') });
    } else if (/^\s*=+\s*$/.test(raw) && lines.length === 1 && !quote) {
      blocks.push({ type: 'heading', level: 1, text: parseInline(lines.pop()!.trim()).map((r) => r.text).join('') });
    } else if (RULE.test(raw)) {
      flush();
      blocks.push({ type: 'divider' });
    } else if (!raw.trim()) {
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

const CP1252: Record<number, string> = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
/** Groups that hold settings or binary data rather than text. */
const SKIPPED = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'footnote', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'generator', 'listtable', 'listoverridetable', 'rsidtbl', 'xmlnstbl', 'fldinst']);
const SYMBOLS: Record<string, string> = { tab: '\t', emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ', '~': ' ', _: '-' };

interface RtfState {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: 'center' | 'right' | 'justify';
  skip: boolean;
  /** How many fallback characters follow each `\u` escape. */
  uc: number;
}

/** Rich Text Format: paragraphs, bold/italic/underline/strikethrough, alignment, and all the usual character escapes. */
export function parseRtf(source: string): ImportBlock[] {
  if (!source.trimStart().startsWith('{\\rtf')) throw new Error('This does not look like an RTF file.');
  const blocks: ImportBlock[] = [];
  const stack: RtfState[] = [];
  let state: RtfState = { skip: false, uc: 1 };
  let runs: Run[] = [];
  let align: RtfState['align'];
  let pending = 0; // fallback characters to ignore after a \u escape

  const emit = (text: string) => {
    if (state.skip || !text) return;
    if (pending > 0) {
      const dropped = Math.min(pending, text.length);
      pending -= dropped;
      text = text.slice(dropped);
      if (!text) return;
    }
    const { bold, italic, underline, strike } = state;
    const last = runs[runs.length - 1];
    if (last && !!last.bold === !!bold && !!last.italic === !!italic && !!last.underline === !!underline && !!last.strike === !!strike) last.text += text;
    else runs.push({ text, ...(bold && { bold }), ...(italic && { italic }), ...(underline && { underline }), ...(strike && { strike }) });
    align = state.align;
  };
  const endParagraph = () => {
    if (runs.some((r) => r.text.trim())) blocks.push({ type: 'paragraph', runs, ...(align ? { align } : {}) });
    runs = [];
    align = undefined;
  };

  const token = /\\([a-z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|([^\\{}]+)/gi;
  for (let m = token.exec(source); m; m = token.exec(source)) {
    const [, word, number, hex, symbol, brace, text] = m;
    if (brace === '{') stack.push({ ...state });
    else if (brace === '}') state = stack.pop() ?? state;
    else if (hex) emit(CP1252[parseInt(hex, 16)] ?? String.fromCharCode(parseInt(hex, 16)));
    else if (symbol !== undefined) {
      if (symbol === '*') state.skip = true;
      else if (symbol === '\n' || symbol === '\r') endParagraph();
      else emit(SYMBOLS[symbol] ?? symbol);
    } else if (text !== undefined) emit(text.replace(/[\r\n]/g, ''));
    else if (word) {
      const on = number !== '0';
      if (SKIPPED.has(word)) state.skip = true;
      else if (word === 'par' || word === 'sect' || word === 'page') endParagraph();
      else if (word === 'line') emit('\n');
      else if (word === 'b') state.bold = on;
      else if (word === 'i') state.italic = on;
      else if (word === 'ul') state.underline = on;
      else if (word === 'ulnone') state.underline = false;
      else if (word === 'strike') state.strike = on;
      else if (word === 'plain') Object.assign(state, { bold: false, italic: false, underline: false, strike: false });
      else if (word === 'pard') state.align = undefined;
      else if (word === 'qc') state.align = 'center';
      else if (word === 'qr') state.align = 'right';
      else if (word === 'qj') state.align = 'justify';
      else if (word === 'ql') state.align = undefined;
      else if (word === 'uc') state.uc = Number(number ?? 1);
      else if (word === 'u' && number !== undefined) {
        const code = Number(number);
        emit(String.fromCharCode(code < 0 ? code + 65536 : code));
        pending = state.uc;
      } else if (SYMBOLS[word]) emit(SYMBOLS[word]);
    }
  }
  endParagraph();
  return blocks;
}
