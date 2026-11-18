// Word documents (.docx) read into import blocks: paragraphs with their heading styles, bold, italic, underline,
// strikethrough, alignment, tabs and line breaks. Images, tables' layout, footnotes and tracked-change markup are not
// carried over. A port of flutter_app/lib/shared/domain/exchange/import_docx.dart (the zip is read with fflate).

import { unzipSync } from 'fflate';

import { type Align, Run } from './compile';
import { type ImportBlock, ImportException, ImportHeading, ImportParagraph } from './importParse';
import { decodeUtf8Lenient } from './utf8';
import { dartTrim } from '../text/dartString';

const fromCode = (code: number) => (code <= 0xffff ? String.fromCharCode(code) : String.fromCodePoint(code));

function decode(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => fromCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => fromCode(Number(dec)))
    .replaceAll('&amp;', '&');
}

/** True when a toggle such as `<w:b/>` is present and not switched off with `w:val="0"`. */
function toggle(xml: string, tag: string): boolean {
  const match = new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(xml);
  return match !== null && !['0', 'false', 'none'].includes(match[1] ?? '');
}

/** Maps each paragraph style to a heading level (0 for the document title), whatever language Word named it in. */
function headingStyles(stylesXml: string): Map<string, number> {
  const levels = new Map<string, number>();
  for (const style of stylesXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const xml = style[0];
    const id = /w:styleId="([^"]+)"/.exec(xml)?.[1];
    const name = (/<w:name w:val="([^"]+)"/.exec(xml)?.[1] ?? '').toLowerCase();
    if (id === undefined) continue;
    const heading = /^heading (\d)$/.exec(name);
    if (heading !== null) {
      levels.set(id, Number(heading[1]));
    } else if (name === 'title') {
      levels.set(id, 0);
    }
  }
  return levels;
}

export function parseDocx(file: Uint8Array): ImportBlock[] {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(file);
  } catch {
    throw new ImportException('This file could not be opened as a Word document.');
  }
  const part = (name: string) => (zip[name] === undefined ? null : decodeUtf8Lenient(zip[name]));
  const documentXml = part('word/document.xml');
  if (documentXml === null) throw new ImportException('This file could not be opened as a Word document.');
  const levels = headingStyles(part('word/styles.xml') ?? '');
  // Text Word has marked as deleted (tracked changes) is not part of the document.
  const body = documentXml.replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
  const blocks: ImportBlock[] = [];

  for (const p of body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const paragraph = p[0];
    const props = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? '';
    const styleId = /<w:pStyle w:val="([^"]+)"/.exec(props)?.[1] ?? null;
    const outline = /<w:outlineLvl w:val="(\d)"/.exec(props)?.[1] ?? null;
    const jc = /<w:jc w:val="(\w+)"/.exec(props)?.[1] ?? null;
    const runs: Run[] = [];

    for (const r of paragraph.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)) {
      const run = r[0];
      const runProps = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ?? '';
      let text = '';
      for (const piece of run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g)) {
        if (piece[1] !== undefined) {
          text += decode(piece[1]);
        } else if (piece[0].startsWith('<w:tab')) {
          text += '\t';
        } else if (!/w:type="(page|column)"/.test(piece[0])) {
          text += '\n';
        }
      }
      if (text.length === 0) continue;
      const style = new Run('', {
        bold: toggle(runProps, 'b'),
        italic: toggle(runProps, 'i'),
        strike: toggle(runProps, 'strike'),
        underline: /<w:u\s+w:val="(?!none)/.test(runProps),
      });
      if (runs.length > 0 && runs[runs.length - 1].sameStyle(style)) {
        const last = runs.pop()!;
        runs.push(new Run(last.text + text, last));
      } else {
        runs.push(new Run(text, style));
      }
    }

    const text = runs.map((r) => r.text).join('');
    if (dartTrim(text).length === 0) continue; // Word uses empty paragraphs for spacing
    const level =
      styleId !== null && levels.has(styleId)
        ? levels.get(styleId)!
        : styleId !== null && /^heading(\d)$/i.test(styleId)
          ? Number(/\d/.exec(styleId)![0])
          : styleId?.toLowerCase() === 'title'
            ? 0
            : outline !== null
              ? Number(outline) + 1
              : null;
    if (level !== null) {
      blocks.push(new ImportHeading(level, dartTrim(text.replace(/\s+/g, ' '))));
    } else {
      const align: Align | null = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : null;
      blocks.push(new ImportParagraph(runs, align));
    }
  }
  return blocks;
}
