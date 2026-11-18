// THE PDF WRITER: a paginated PDF on US Letter with one-inch margins, Times 12pt, as the Flutter app makes it. Volumes
// and chapters start a new page, headings never sit alone at the foot of a page, and pages are numbered. Layout is done
// here, word by word, so bold and italic can change mid-line, with the core fonts' own widths (pdfFonts.ts), so lines
// break and pages turn where the Flutter app's do (`layoutPdf`, checked against the Dart). The file itself is written by
// hand (`renderPdf`): four core fonts in the Windows-1252 encoding every reader holds, nothing embedded, no dependency.
// Text the core fonts cannot draw is refused (`PdfCannotDraw`) rather than printed with letters missing.
//
// A port of flutter_app/lib/shared/domain/exchange/render_pdf.dart (its layout; the file is Scriptor's own writing).

import { dartTrim } from '../text/dartString';
import { type Align, type Compiled, type HeadingRole, Run } from './compile';
import { timesBoldItalicWidths, timesBoldWidths, timesItalicWidths, timesRomanWidths } from './pdfFonts';

/** Characters beyond Latin-1 that the core fonts can still draw, at their Windows-1252 positions. */
const cp1252: ReadonlyMap<string, number> = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89],
  ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

/** Whether the core fonts can draw every character of `text`. */
export function pdfCanDraw(text: string): boolean {
  return pdfMissing(text).length === 0;
}

/** Every character an export would draw, for `pdfCanDraw`. */
export function pdfTextOf(compiled: Compiled): string {
  return compiled.blocks
    .map((b) =>
      b.type === 'heading'
        ? b.text
        : b.type === 'paragraph'
          ? b.text
          : b.type === 'field'
            ? b.label + b.text
            : b.type === 'list'
              ? b.items.join('')
              : '',
    )
    .join('');
}

/** The characters the fonts can not draw, each once (by code point, as the Dart reads runes). */
export function pdfMissing(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  for (const ch of text) {
    const r = ch.codePointAt(0)!;
    if (seen.has(r)) continue;
    seen.add(r);
    if (r >= 256 && !cp1252.has(ch)) out.push(ch);
  }
  return out;
}

/** Thrown when the text holds characters the core fonts cannot draw. */
export class PdfCannotDraw extends Error {
  constructor(readonly characters: readonly string[]) {
    super(
      `The PDF fonts cannot draw some characters in this text (${characters.slice(0, 8).join(' ')}${characters.length > 8 ? ' …' : ''}). Choose Word or a web page instead: they keep every character.`,
    );
  }
}

/** Text as the fonts' single-byte codes. */
function codes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    out.push(cp1252.get(c) ?? text.charCodeAt(i));
  }
  return out;
}

/** The four faces: 0 regular, 1 bold, 2 italic, 3 bold italic. */
export type PdfFace = 0 | 1 | 2 | 3;
const faceWidths: readonly (readonly number[])[] = [timesRomanWidths, timesBoldWidths, timesItalicWidths, timesBoldItalicWidths];
const faceNames = ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'];
const faceOf = (run: Run): PdfFace => (run.bold && run.italic ? 3 : run.bold ? 1 : run.italic ? 2 : 0);

/** The width of `text` in `face` at `size`, as the Dart `pdf` package measures it. */
export function pdfWidth(text: string, face: PdfFace, size: number): number {
  if (text.length === 0) return 0;
  const widths = faceWidths[face];
  let right = 0;
  for (const c of codes(text)) right += widths[c] + 0;
  return right * size;
}

export const pdfPageWidth = 612;
export const pdfPageHeight = 792;
const margin = 72;
const body = 12;
const leadingBody = 18;

type Spec = { size: number; center: boolean; before: number; after: number; bold: boolean; italic: boolean };
const headings: Readonly<Record<HeadingRole, Spec>> = {
  title: { size: 30, center: true, before: 150, after: 14, bold: true, italic: false },
  subtitle: { size: 16, center: true, before: 0, after: 14, bold: false, italic: true },
  part: { size: 22, center: true, before: 90, after: 24, bold: true, italic: false },
  chapter: { size: 18, center: false, before: 36, after: 18, bold: true, italic: false },
  section: { size: 18, center: false, before: 24, after: 14, bold: true, italic: false },
  entry: { size: 14, center: false, before: 16, after: 8, bold: true, italic: false },
  minor: { size: 12, center: false, before: 14, after: 6, bold: true, italic: false },
};

/** A string drawn: its face, size, text (as written, not yet encoded) and where its baseline starts (PDF points, from
 * the page's bottom left). */
export type PdfText = { face: PdfFace; size: number; text: string; x: number; y: number };

/** A line drawn (an underline or a strike), 0.6 wide. */
export type PdfLine = { x1: number; y1: number; x2: number; y2: number };

/** A page as laid out. */
export type PdfPage = { texts: PdfText[]; lines: PdfLine[] };

type Piece = { text: string; run: Run; width: number };

/** The pages of `compiled` as the Flutter app lays them out. Throws `PdfCannotDraw` rather than leave letters out. */
export function layoutPdf(compiled: Compiled): PdfPage[] {
  const missing = pdfMissing(pdfTextOf(compiled));
  if (missing.length > 0) throw new PdfCannotDraw(missing);

  const widthOf = (text: string, run: Run, size: number) => pdfWidth(text, faceOf(run), size);
  const width = pdfPageWidth - margin * 2;
  const bottom = pdfPageHeight - margin;
  const pages: PdfPage[] = [];
  let page: PdfPage = { texts: [], lines: [] };
  let y = margin;
  let fresh = true; // nothing drawn on this page yet

  const newPage = () => {
    page = { texts: [], lines: [] };
    pages.push(page);
    y = margin;
    fresh = true;
  };
  const room = (height: number) => {
    if (y + height > bottom && !fresh) newPage();
  };

  /** Breaks runs into lines that fit, keeping the author's spaces and forced line breaks. */
  const lines = (runs: readonly Run[], size: number, maxWidth: number): Piece[][] => {
    const out: Piece[][] = [[]];
    let used = 0;
    for (const run of runs) {
      const text = run.text.replaceAll('\t', '    ');
      for (const m of text.matchAll(/\n| +|[^\n ]+/g)) {
        const token = m[0];
        if (token === '\n') {
          out.push([]);
          used = 0;
          continue;
        }
        const tokenWidth = widthOf(token, run, size);
        const line = out[out.length - 1];
        if (used + tokenWidth > maxWidth && line.length > 0 && dartTrim(token).length > 0) {
          while (line.length > 0 && dartTrim(line[line.length - 1].text).length === 0) {
            used -= line.pop()!.width; // no trailing spaces
          }
          out.push([]);
          used = 0;
        }
        out[out.length - 1].push({ text: token, run, width: tokenWidth });
        used += tokenWidth;
      }
    }
    return out;
  };

  const draw = (
    runs: readonly Run[],
    options: { size?: number; align?: Align | null; indent?: number; after?: number } = {},
  ) => {
    const size = options.size ?? body;
    const indent = options.indent ?? 0;
    const align = options.align ?? null;
    const leading = size * 1.5;
    for (const line of lines(runs, size, width - indent * 2)) {
      room(leading);
      const lineWidth = line.reduce((n, p) => n + p.width, 0);
      let x =
        margin +
        indent +
        (align === 'center' ? (width - indent * 2 - lineWidth) / 2 : align === 'right' ? width - indent * 2 - lineWidth : 0);
      const baseline = y + size;
      // Neighbouring words in the same style are drawn as one string.
      const stretches: Piece[] = [];
      for (const piece of line) {
        const last = stretches[stretches.length - 1];
        if (last !== undefined && last.run === piece.run) {
          last.text += piece.text;
          last.width += piece.width;
        } else {
          stretches.push({ ...piece });
        }
      }
      for (const piece of stretches) {
        const pdfY = pdfPageHeight - baseline;
        page.texts.push({ face: faceOf(piece.run), size, text: piece.text, x, y: pdfY });
        if (piece.run.underline) page.lines.push({ x1: x, y1: pdfY - 1.5, x2: x + piece.width, y2: pdfY - 1.5 });
        if (piece.run.strike) page.lines.push({ x1: x, y1: pdfY + size * 0.28, x2: x + piece.width, y2: pdfY + size * 0.28 });
        x += piece.width;
      }
      y += leading;
      fresh = false;
    }
    y += options.after ?? 0;
  };

  newPage();
  for (const block of compiled.blocks) {
    switch (block.type) {
      case 'heading': {
        const spec = headings[block.role];
        if (block.pageBreak && !fresh) newPage();
        // Keep a heading with at least two lines of what follows.
        room(spec.before + spec.size * 1.5 + spec.after + leadingBody * 2);
        if (!fresh || block.role === 'title' || block.role === 'part') y += spec.before;
        draw([new Run(block.text, { bold: spec.bold, italic: spec.italic })], {
          size: spec.size,
          align: spec.center ? 'center' : null,
          after: spec.after,
        });
        break;
      }
      case 'paragraph':
        if (block.runs.length === 0) {
          y += leadingBody; // a blank line the author left
        } else {
          draw(block.runs, { align: block.align === 'justify' ? null : block.align, indent: block.quote ? 36 : 0, after: 6 });
        }
        break;
      case 'divider':
        y += 6;
        draw([new Run('* * *')], { align: 'center', after: 12 });
        break;
      case 'field':
        draw([new Run(`${block.label}:`, { bold: true }), ...(block.text.length > 0 ? [new Run(` ${block.text}`)] : [])], {
          indent: 18,
          after: 4,
        });
        break;
      case 'list':
        block.items.forEach((item, i) => {
          draw([new Run(`${block.ordered ? `${i + 1}.` : '•'}  ${item}`)], { indent: 36, after: 2 });
        });
        y += 4;
        break;
    }
  }

  for (let i = 1; i < pages.length; i++) {
    const number = `${i + 1}`;
    const w = pdfWidth(number, 0, 10);
    pages[i].texts.push({ face: 0, size: 10, text: number, x: pdfPageWidth / 2 - w / 2, y: margin / 2 });
  }
  return pages;
}

// ------------------------------------------------------------------------------------------------- the file

/** A number as PDF writes it: at most three decimals, no trailing zeros. */
function num(n: number): string {
  const s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** Bytes as a PDF literal string: printable ASCII as it is, brackets and backslashes escaped, the rest in octal. */
function literal(bytes: readonly number[]): string {
  let out = '(';
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += `\\${b.toString(8).padStart(3, '0')}`;
  }
  return `${out})`;
}

/** Text for the document's information (title, author): UTF-16 with its byte order mark, as hex. */
function infoString(text: string): string {
  let hex = '<FEFF';
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return `${hex}>`;
}

/** The PDF of `compiled`: its pages as `layoutPdf` lays them out, written as a PDF 1.4 file. `creator` names the app in
 * the document's information. Throws `PdfCannotDraw` rather than leave letters out. */
export function renderPdf(compiled: Compiled, options: { creator?: string } = {}): Uint8Array {
  const pages = layoutPdf(compiled);
  const objects: string[] = [];
  // 1 the catalog, 2 the page tree, 3–6 the fonts, 7 the information; then each page and its contents.
  const fontsAt = 3;
  const infoAt = 7;
  const firstPage = 8;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  faceNames.forEach((name) => objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`));
  const creator = options.creator ?? 'Scriptor';
  objects.push(
    `<< /Title ${infoString(compiled.title)} /Author ${infoString(compiled.author)} /Creator ${infoString(creator)} /Producer ${infoString(creator)} >>`,
  );
  const fonts = faceNames.map((_, i) => `/F${i + 1} ${fontsAt + i} 0 R`).join(' ');
  pages.forEach((page, i) => {
    let stream = '';
    if (page.lines.length > 0) {
      stream += '0.6 w\n';
      for (const l of page.lines) stream += `${num(l.x1)} ${num(l.y1)} m ${num(l.x2)} ${num(l.y2)} l S\n`;
    }
    for (const t of page.texts) {
      stream += `BT /F${t.face + 1} ${num(t.size)} Tf ${num(t.x)} ${num(t.y)} Td ${literal(codes(t.text))} Tj ET\n`;
    }
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfPageWidth} ${pdfPageHeight}] /Resources << /Font << ${fonts} >> >> /Contents ${firstPage + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  // Every character written is ASCII, so the text's length is its length in bytes.
  let file = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) file += `${String(at).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoAt} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i);
  return bytes;
}
