import { strFromU8, unzipSync } from 'fflate';
import type { Run } from '../compile';
import type { ImportBlock } from './types';

const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');

/** True when a toggle such as `<w:b/>` is present and not switched off with `w:val="0"`. */
const toggle = (xml: string, tag: string) => {
  const match = new RegExp(`<w:${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(xml);
  return match ? !['0', 'false', 'none'].includes(match[1] ?? '') : false;
};

/** Maps each paragraph style to a heading level (0 for the document title), whatever language Word named it in. */
function headingStyles(stylesXml: string): Map<string, number> {
  const levels = new Map<string, number>();
  for (const style of stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) ?? []) {
    const id = /w:styleId="([^"]+)"/.exec(style)?.[1];
    const name = /<w:name w:val="([^"]+)"/.exec(style)?.[1]?.toLowerCase() ?? '';
    if (!id) continue;
    const heading = /^heading (\d)$/.exec(name);
    if (heading) levels.set(id, Number(heading[1]));
    else if (name === 'title') levels.set(id, 0);
  }
  return levels;
}

/**
 * Word documents. Reads paragraphs with their heading styles, bold, italic,
 * underline, strikethrough, alignment, tabs and line breaks. Images, tables'
 * layout, footnotes and tracked-change markup are not carried over.
 */
export function parseDocx(file: Uint8Array): ImportBlock[] {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file, { filter: (entry) => entry.name === 'word/document.xml' || entry.name === 'word/styles.xml' });
  } catch {
    throw new Error('This file could not be opened as a Word document.');
  }
  const documentXml = entries['word/document.xml'];
  if (!documentXml) throw new Error('This file could not be opened as a Word document.');
  const levels = headingStyles(entries['word/styles.xml'] ? strFromU8(entries['word/styles.xml']) : '');
  // Text Word has marked as deleted (tracked changes) is not part of the document.
  const body = strFromU8(documentXml).replace(/<w:del\b[\s\S]*?<\/w:del>/g, '');
  const blocks: ImportBlock[] = [];

  for (const paragraph of body.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    const props = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0] ?? '';
    const styleId = /<w:pStyle w:val="([^"]+)"/.exec(props)?.[1];
    const outline = /<w:outlineLvl w:val="(\d)"/.exec(props)?.[1];
    const jc = /<w:jc w:val="(\w+)"/.exec(props)?.[1];
    const runs: Run[] = [];

    for (const run of paragraph.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) ?? []) {
      const runProps = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run)?.[0] ?? '';
      let text = '';
      for (const piece of run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>/g)) {
        if (piece[1] !== undefined) text += decode(piece[1]);
        else if (piece[0].startsWith('<w:tab')) text += '\t';
        else if (!/w:type="(page|column)"/.test(piece[0])) text += '\n';
      }
      if (!text) continue;
      const style = { bold: toggle(runProps, 'b'), italic: toggle(runProps, 'i'), strike: toggle(runProps, 'strike'), underline: /<w:u\s+w:val="(?!none)/.test(runProps) };
      const last = runs[runs.length - 1];
      if (last && !!last.bold === style.bold && !!last.italic === style.italic && !!last.strike === style.strike && !!last.underline === style.underline) last.text += text;
      else runs.push({ text, ...(style.bold && { bold: true }), ...(style.italic && { italic: true }), ...(style.underline && { underline: true }), ...(style.strike && { strike: true }) });
    }

    const text = runs.map((r) => r.text).join('');
    if (!text.trim()) continue; // Word uses empty paragraphs for spacing
    const level = styleId !== undefined && levels.has(styleId) ? levels.get(styleId)! : styleId && /^heading(\d)$/i.test(styleId) ? Number(/\d/.exec(styleId)![0]) : styleId?.toLowerCase() === 'title' ? 0 : outline !== undefined ? Number(outline) + 1 : null;
    if (level !== null) blocks.push({ type: 'heading', level, text: text.replace(/\s+/g, ' ').trim() });
    else {
      const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : undefined;
      blocks.push({ type: 'paragraph', runs, ...(align ? { align } : {}) });
    }
  }
  return blocks;
}
