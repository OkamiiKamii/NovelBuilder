/**
 * PICTURES AND PRINTOUTS OF A VIEW
 * A view's drawing copied so it stands on its own (every element carrying
 * the styles it is drawn with, so it looks the same away from the app),
 * framed with the view's title, the novel, its filters, the date and its
 * legends; as SVG, as PNG, or as a page laid out for printing. Everything is
 * made in the browser from what is on screen: nothing is fetched, so it
 * works offline. A picture is of what is shown, not a copy of the records.
 */

const STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display'];

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The largest drawing in a part of the page: the view's own, not a legend's swatch or an icon. */
export function mainDrawing(root: Element | null): SVGSVGElement | null {
  if (!root) return null;
  const drawings = [...root.querySelectorAll('svg')].filter((svg) => !svg.closest('.viz-legend, dialog, [hidden]'));
  const area = (svg: SVGSVGElement) => {
    const box = svg.getBoundingClientRect();
    return box.width * box.height;
  };
  const best = drawings.sort((a, b) => area(b) - area(a))[0];
  return best && area(best) >= 4000 ? best : null;
}

/** A copy of a drawing that keeps its look anywhere: each element carries the styles it is drawn with, the app's stylesheet aside. */
export function standalone(svg: SVGSVGElement): { node: SVGSVGElement; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((el, i) => {
    const computed = getComputedStyle(el);
    const copy = copies[i];
    copy.setAttribute('style', STYLE.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';'));
    copy.removeAttribute('class');
    for (const a of ['tabindex', 'role', 'aria-pressed', 'data-mark']) copy.removeAttribute(a);
  });
  const box = svg.getBoundingClientRect();
  const width = Math.round(Number(svg.getAttribute('width')) || box.width);
  const height = Math.round(Number(svg.getAttribute('height')) || box.height);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { node: clone, width, height };
}

export interface LegendCopy {
  title: string;
  items: { swatch: string; label: string }[];
}

/** The legends shown with a drawing: each entry's swatch (standing on its own) and words. */
export function legendsIn(root: Element | null): LegendCopy[] {
  if (!root) return [];
  return [...root.querySelectorAll('.viz-legend')].filter((l) => !l.closest('[hidden]')).map((legend) => ({
    title: legend.querySelector('figcaption')?.textContent?.trim() ?? '',
    items: [...legend.querySelectorAll('li')].map((li) => {
      const svg = li.querySelector('svg');
      return { swatch: svg ? new XMLSerializer().serializeToString(standalone(svg as SVGSVGElement).node) : '', label: [li.querySelector('.viz-glyph')?.textContent?.trim(), li.querySelector('span:not(.viz-glyph)')?.textContent?.trim() ?? li.textContent?.trim() ?? ''].filter(Boolean).join(' ') };
    }),
  }));
}

export interface Framing {
  title: string;
  /** Lines under the title: the novel, the date, the filters. */
  lines: string[];
  /** Colours of the page the drawing sits on, as shown. */
  background: string;
  ink: string;
  muted: string;
}

/** The drawing with its title, lines and legends around it, as one SVG. */
export function framedSvg(drawing: { node: SVGSVGElement; width: number; height: number } | null, legends: LegendCopy[], framing: Framing): { markup: string; width: number; height: number } {
  const pad = 24;
  const width = Math.max(drawing?.width ?? 0, 520) + pad * 2;
  const parts: string[] = [];
  // A printed page has its own heading: the picture then holds only the drawing and its legends.
  let y = framing.title ? pad + 20 : pad - 16;
  if (framing.title) parts.push(`<text x="${pad}" y="${y}" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="${framing.ink}">${xml(framing.title)}</text>`);
  for (const line of framing.lines) {
    y += 19;
    parts.push(`<text x="${pad}" y="${y}" font-family="system-ui, sans-serif" font-size="13" fill="${framing.muted}">${xml(line)}</text>`);
  }
  y += 16;
  if (drawing) {
    drawing.node.setAttribute('x', String(pad));
    drawing.node.setAttribute('y', String(y));
    parts.push(new XMLSerializer().serializeToString(drawing.node));
    y += drawing.height + 16;
  }
  for (const legend of legends) {
    if (legend.title) {
      y += 16;
      parts.push(`<text x="${pad}" y="${y}" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${framing.muted}">${xml(legend.title)}</text>`);
    }
    // Entries flow across, wrapping at the drawing's width.
    let x = pad;
    y += 8;
    for (const item of legend.items) {
      const w = 30 + Math.ceil(item.label.length * 6.6) + 16;
      if (x + w > width - pad && x > pad) {
        x = pad;
        y += 20;
      }
      if (item.swatch) parts.push(item.swatch.replace('<svg', `<svg x="${x}" y="${y}"`));
      parts.push(`<text x="${x + 28}" y="${y + 11}" font-family="system-ui, sans-serif" font-size="12" fill="${framing.ink}">${xml(item.label)}</text>`);
      x += w;
    }
    y += 22;
  }
  const height = y + pad;
  return {
    markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${framing.background}"/>${parts.join('')}</svg>`,
    width,
    height,
  };
}

/** An SVG drawn into a PNG, at twice the size where the browser allows (a very large drawing is drawn smaller rather than not at all). */
export async function pngOf(markup: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(2, Math.sqrt(16_000_000 / Math.max(1, width * height)));
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the drawing could not be turned into a picture'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('this browser cannot draw pictures');
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be made'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A view's list or table as plain, printable HTML: what it says, without its buttons, menus or fields. */
export function printableData(root: Element | null): string {
  if (!root) return '';
  const copy = root.cloneNode(true) as Element;
  // The filters and settings are said in the heading; a control's label goes with the control.
  copy.querySelectorAll('fieldset, label').forEach((el) => el.querySelector('input, select, textarea') && el.remove());
  copy.querySelectorAll('input, select, textarea, form, .viz-toolbar, .actions, .viz-switch, [role=search], .visually-hidden, script, style, dialog, .chart-tip').forEach((el) => el.remove());
  copy.querySelectorAll('details').forEach((el) => el.setAttribute('open', ''));
  // Buttons and links keep their words, as text.
  copy.querySelectorAll('button, a').forEach((el) => {
    const span = el.ownerDocument.createElement('span');
    span.textContent = el.textContent;
    el.replaceWith(span);
  });
  copy.querySelectorAll('svg').forEach((el) => el.remove());
  copy.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (!['colspan', 'rowspan', 'scope'].includes(a.name)) el.removeAttribute(a.name);
  });
  return copy.innerHTML;
}

/** A page laid out for printing (or saving as PDF from the print dialog): title, lines, the framed drawing, the data. */
export function printDocument(options: { title: string; lines: string[]; picture: string | null; data: string; footer: string; lang: string }): string {
  return `<!doctype html><html lang="${xml(options.lang)}"><head><meta charset="utf-8"><title>${xml(options.title)}</title><style>
@page { margin: 14mm; }
body { font: 11pt/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 4pt; overflow-wrap: anywhere; }
.meta { color: #444; margin: 0 0 10pt; }
.meta p { margin: 0; overflow-wrap: anywhere; }
.picture { margin: 10pt 0; break-inside: avoid; }
.picture svg { max-width: 100%; height: auto; }
.data { overflow-wrap: anywhere; }
.data h2, .data h3 { font-size: 12pt; margin: 12pt 0 4pt; break-after: avoid; }
.data ul, .data ol { padding-left: 16pt; }
.data li { margin: 2pt 0; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 10pt; }
thead { display: table-header-group; }
th, td { border: 0.5pt solid #999; padding: 3pt 5pt; text-align: left; vertical-align: top; }
tr { break-inside: avoid; }
footer { margin-top: 14pt; color: #555; font-size: 9pt; }
</style></head><body><header><h1>${xml(options.title)}</h1><div class="meta">${options.lines.map((l) => `<p>${xml(l)}</p>`).join('')}</div></header>${options.picture ? `<div class="picture">${options.picture}</div>` : ''}<main class="data">${options.data}</main><footer>${xml(options.footer)}</footer></body></html>`;
}

/** Opens the browser's print dialog on a page, in a hidden frame; "Save as PDF" there makes the file. Nothing is sent anywhere. */
export function printHtml(html: string): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  frame.className = 'viz-print-frame';
  frame.title = 'Print layout';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.append(frame);
  return frame;
}
