import type { jsPDF } from 'jspdf';
import type { Compiled, HeadingRole, Run } from '../compile';

/**
 * Characters the PDF's built-in fonts can draw: Latin-1 plus the Windows-1252
 * extras (curly quotes, dashes, ellipsis, euro…). Text beyond that (Cyrillic,
 * Greek, CJK, some accented letters) needs the browser's own fonts, so the
 * caller offers "print to PDF" instead of producing a file with missing letters.
 */
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export const pdfCanDraw = (text: string): boolean => [...text].every((ch) => ch.charCodeAt(0) < 256 || EXTRA.has(ch));

export function pdfTextOf(compiled: Compiled): string {
  return compiled.blocks
    .map((b) => (b.type === 'heading' ? b.text : b.type === 'paragraph' ? b.runs.map((r) => r.text).join('') : b.type === 'field' ? b.label + b.text : b.type === 'list' ? b.items.join('') : ''))
    .join('');
}

const PAGE = { width: 612, height: 792, margin: 72 };
const BODY = 12;
const LEADING = 18;
const HEADINGS: Record<HeadingRole, { size: number; center: boolean; before: number; after: number; style: 'bold' | 'italic' }> = {
  title: { size: 30, center: true, before: 150, after: 14, style: 'bold' },
  subtitle: { size: 16, center: true, before: 0, after: 14, style: 'italic' },
  part: { size: 22, center: true, before: 90, after: 24, style: 'bold' },
  chapter: { size: 18, center: false, before: 36, after: 18, style: 'bold' },
  section: { size: 18, center: false, before: 24, after: 14, style: 'bold' },
  entry: { size: 14, center: false, before: 16, after: 8, style: 'bold' },
  minor: { size: 12, center: false, before: 14, after: 6, style: 'bold' },
};

interface Piece {
  text: string;
  run: Run;
  width: number;
}

/**
 * A paginated PDF on US Letter with one-inch margins, Times 12pt. Volumes and
 * chapters start a new page, headings never sit alone at the foot of a page,
 * and pages are numbered. Layout is done here, word by word, so bold and
 * italic can change mid-line.
 */
export async function renderPdf(compiled: Compiled): Promise<Uint8Array> {
  const { jsPDF: PDF } = await import('jspdf');
  const doc: jsPDF = new PDF({ unit: 'pt', format: 'letter' });
  doc.setProperties({ title: compiled.title, author: compiled.author });
  const width = PAGE.width - PAGE.margin * 2;
  const bottom = PAGE.height - PAGE.margin;
  let y = PAGE.margin;
  let fresh = true; // nothing drawn on this page yet

  const font = (run: Run, size = BODY) => {
    doc.setFont('times', run.bold && run.italic ? 'bolditalic' : run.bold ? 'bold' : run.italic ? 'italic' : 'normal');
    doc.setFontSize(size);
  };
  const newPage = () => {
    doc.addPage();
    y = PAGE.margin;
    fresh = true;
  };
  const room = (height: number) => {
    if (y + height > bottom && !fresh) newPage();
  };

  /** Breaks runs into lines that fit, keeping the author's spaces and forced line breaks. */
  function lines(runs: Run[], size: number, maxWidth: number): Piece[][] {
    const out: Piece[][] = [[]];
    let used = 0;
    for (const run of runs) {
      font(run, size);
      for (const token of run.text.replace(/\t/g, '    ').split(/(\n| +)/)) {
        if (!token) continue;
        if (token === '\n') {
          out.push([]);
          used = 0;
          continue;
        }
        const tokenWidth = doc.getTextWidth(token);
        const line = out[out.length - 1];
        if (used + tokenWidth > maxWidth && line.length && token.trim()) {
          while (line.length && !line[line.length - 1].text.trim()) used -= line.pop()!.width; // no trailing spaces
          out.push([]);
          used = 0;
        }
        const current = out[out.length - 1];
        current.push({ text: token, run, width: tokenWidth });
        used += tokenWidth;
      }
    }
    return out;
  }

  function draw(runs: Run[], options: { size?: number; align?: 'left' | 'center' | 'right'; indent?: number; after?: number } = {}) {
    const size = options.size ?? BODY;
    const leading = size * 1.5;
    const indent = options.indent ?? 0;
    for (const line of lines(runs, size, width - indent * 2)) {
      room(leading);
      const lineWidth = line.reduce((n, p) => n + p.width, 0);
      let x = PAGE.margin + indent + (options.align === 'center' ? (width - indent * 2 - lineWidth) / 2 : options.align === 'right' ? width - indent * 2 - lineWidth : 0);
      const baseline = y + size;
      // Neighbouring words in the same style are drawn as one string.
      const stretches: Piece[] = [];
      for (const piece of line) {
        const last = stretches[stretches.length - 1];
        if (last?.run === piece.run) {
          last.text += piece.text;
          last.width += piece.width;
        } else stretches.push({ ...piece });
      }
      for (const piece of stretches) {
        font(piece.run, size);
        doc.text(piece.text, x, baseline);
        if (piece.run.underline) doc.line(x, baseline + 1.5, x + piece.width, baseline + 1.5);
        if (piece.run.strike) doc.line(x, baseline - size * 0.28, x + piece.width, baseline - size * 0.28);
        x += piece.width;
      }
      y += leading;
      fresh = false;
    }
    y += options.after ?? 0;
  }

  doc.setLineWidth(0.6);
  for (const block of compiled.blocks) {
    if (block.type === 'heading') {
      const spec = HEADINGS[block.role];
      if (block.pageBreak && !fresh) newPage();
      // Keep a heading with at least two lines of what follows.
      room(spec.before + spec.size * 1.5 + spec.after + LEADING * 2);
      if (!fresh || block.role === 'title' || block.role === 'part') y += spec.before;
      draw([{ text: block.text, bold: spec.style === 'bold', italic: spec.style === 'italic' }], { size: spec.size, align: spec.center ? 'center' : undefined, after: spec.after });
    } else if (block.type === 'paragraph') {
      if (block.runs.length === 0) y += LEADING; // a blank line the author left
      else draw(block.runs, { align: block.align === 'justify' ? undefined : block.align, indent: block.quote ? 36 : 0, after: 6 });
    } else if (block.type === 'divider') {
      y += 6;
      draw([{ text: '* * *' }], { align: 'center', after: 12 });
    } else if (block.type === 'field') {
      draw([{ text: `${block.label}:`, bold: true }, ...(block.text ? [{ text: ` ${block.text}` }] : [])], { indent: 18, after: 4 });
    } else {
      block.items.forEach((item, i) => draw([{ text: `${block.ordered ? `${i + 1}.` : '•'}  ${item}` }], { indent: 36, after: 2 }));
      y += 4;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let page = 2; page <= pages; page++) {
    doc.setPage(page);
    font({ text: '' }, 10);
    doc.text(String(page), PAGE.width / 2, PAGE.height - PAGE.margin / 2, { align: 'center' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
