// The book set for the reader's page: each section as HTML, styled from the reader's look. A port of the Flutter
// reader's `sectionItems` and `BookLook` (flutter_app/lib/features/reader/book_layout.dart) and its cover, contents and
// serial views (book_view.dart): the same pieces in the same order, with the same sizes and spaces. Only how the text
// is shown: the author's text is drawn exactly as written, and nothing here is stored.

import { blocksOf } from '../domain/exchange/renderBook';
import type { Run } from '../domain/exchange/compile';
import { type Book, castLines, type Section } from '../domain/reader/book';
import { type ReaderFont, type ReaderPrefs, resolveLook } from '../domain/reader/readerPrefs';
import type { ReaderMode, ReaderSectionHtml } from './ReaderView';

/** The typefaces already on an Android device (the Flutter reader's choice there), with the same fallbacks. */
const fontStacks: Record<ReaderFont, string> = {
  book: "serif, 'Palatino', 'Book Antiqua', Georgia, 'Noto Serif'",
  garamond: "serif, 'EB Garamond', 'Times New Roman', 'Noto Serif'",
  charter: "serif, Georgia, 'Noto Serif'",
  georgia: "serif, 'Noto Serif'",
  sans: 'sans-serif',
  humanist: "sans-serif, 'Gill Sans', Verdana",
};

/** The look as the page's CSS: the reader's preferences worked out (`resolveLook`), as custom properties. */
export function bookCss(prefs: ReaderPrefs): string {
  const look = resolveLook(prefs);
  const fg = look.text;
  return `:root { --bg: ${look.background}; --fg: ${fg}; --muted: ${withAlpha(fg, 0.65)}; --size: ${prefs.size}px;
  --leading: ${prefs.leading}; --measure: ${prefs.measure * 0.5}em; --font: ${fontStacks[prefs.font]};
  --align: ${look.justify ? 'justify' : 'left'}; }`;
}

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** A space before, in lines of the body text. */
function before(lines: number, leading: number): string {
  return `margin-top:${(lines * leading).toFixed(3)}em;`;
}

function runsHtml(runs: readonly Run[]): string {
  return runs
    .map((r) => {
      let t = esc(r.text).replace(/\n/g, '<br>');
      if (r.bold) t = `<b>${t}</b>`;
      if (r.italic) t = `<i>${t}</i>`;
      if (r.underline) t = `<u>${t}</u>`;
      if (r.strike) t = `<s>${t}</s>`;
      return t;
    })
    .join('');
}

/** Plain lines, centred (front matter), each its own line; an empty one a blank line. */
function lines(text: string, style: string): string {
  return text
    .split('\n')
    .map((l) => `<p class="matter" style="${style}">${l === '' ? '&nbsp;' : esc(l)}</p>`)
    .join('');
}

/** One section's pages, as the Flutter reader sets them. */
export function sectionHtml(book: Book, index: number, prefs: ReaderPrefs): string {
  const s = book.sections[index];
  const look = resolveLook(prefs);
  const L = prefs.leading;
  const paraGap = look.indented ? 0 : prefs.spacing * L;
  const label = (text: string, lead: number) =>
    `<p class="label" style="${before(lead, L)}">${esc(text.toUpperCase())}</p>`;
  const heading = (text: string, scale: number, lead: number) =>
    `<h2 class="heading" style="font-size:${scale}em;${before(lead / scale, L)}">${esc(text)}</h2>`;

  switch (s.kind) {
    case 'cover':
      return coverHtml(book);
    case 'contents':
      return contentsHtml(book, index);
    case 'title':
      return [
        heading(book.title.trim() === '' ? 'Untitled' : book.title, 2, 4),
        book.subtitle.trim() !== '' ? `<p class="matter" style="font-style:italic;${before(1, L)}">${esc(book.subtitle)}</p>` : '',
        book.author.trim() !== '' ? `<p class="matter" style="${before(3, L)}">${esc(book.author)}</p>` : '',
      ].join('');
    case 'copyright':
    case 'dedication':
      return `<div style="${before(4, L)}"></div>${lines(s.text, s.kind === 'dedication' ? 'font-style:italic;' : 'font-size:0.85em;')}`;
    case 'epigraph':
      return `<div style="${before(4, L)}"></div>${lines(s.text, 'font-style:italic;')}${
        s.source !== '' ? `<p class="matter" style="${before(1, L)}">— ${esc(s.source)}</p>` : ''
      }`;
    case 'part':
      return [
        s.label !== '' && s.label.toLowerCase() !== s.title.toLowerCase() ? label(s.label, 5) : '',
        heading(s.title, 1.8, s.showsLabel ? 1 : 5),
      ].join('');
    case 'acknowledgements':
    case 'about':
      return (
        heading(s.title, 1.5, 2) +
        s.text
          .split('\n')
          .map((l, i) => `<p style="${before(i === 0 ? 1 : paraGap / L, L)}">${l === '' ? '&nbsp;' : esc(l)}</p>`)
          .join('')
      );
    case 'cast':
      return (
        heading(s.title, 1.5, 2) +
        castLines(s.text)
          .map((l, i) =>
            l.group
              ? `<p class="label" style="${before(i === 0 ? 1 : 1.4, L)}">${esc(l.name.toUpperCase())}</p>`
              : `<p style="${before(i === 0 ? 1 : 0.35, L)}"><b>${esc(l.name)}</b>${l.about !== '' ? ` — ${esc(l.about)}` : ''}</p>`,
          )
          .join('')
      );
    case 'chapter':
      return chapterHtml(book, s, prefs);
  }
}

/** A chapter: its label, its title, then the author's text. */
function chapterHtml(book: Book, s: Section, prefs: ReaderPrefs, body?: { notes: true }): string {
  const look = resolveLook(prefs);
  const L = prefs.leading;
  const paraGap = look.indented ? 0 : prefs.spacing * L;
  // Set as a printed chapter opens: lower on the page, the label in spaced capitals, the title in the display face, an
  // ornament under it; the first paragraph then opens with a drop cap and its first line in small capitals.
  const head = [
    '<div class="opening">',
    s.showsLabel ? `<p class="label">${esc(s.label.toUpperCase())}</p>` : '',
    `<h2 class="heading chapter-title">${esc(s.title)}</h2>`,
    '<div class="ornament" aria-hidden="true"><span></span><i></i><span></span></div>',
    '</div>',
  ].join('');
  let opened = false;
  const out: string[] = [];
  let first = true;
  let gapNext = 1.5; // In lines.
  for (const block of blocksOf(s)) {
    switch (block.type) {
      case 'divider':
        out.push(`<p class="break" style="${before(0.5, L)}">${book.sceneBreak.trim() === '' ? '&nbsp;' : esc(book.sceneBreak)}</p>`);
        first = true;
        gapNext = 0.5;
        break;
      case 'heading':
        out.push(`<p class="subheading" style="${before(1, L)}">${esc(block.text)}</p>`);
        first = true;
        gapNext = 0.5;
        break;
      case 'paragraph': {
        const indent = !first && look.indented && block.align === null && !block.quote;
        const align =
          block.align === 'center' ? 'center' : block.align === 'right' ? 'right' : block.align === 'justify' ? 'justify' : 'var(--align)';
        const style = [
          before(first ? gapNext : paraGap / L, L),
          `text-indent:${indent ? `${prefs.indent}em` : '0'};`,
          `text-align:${align};`,
          block.quote ? 'font-style:italic;padding-left:2em;' : '',
        ].join('');
        // The chapter's first paragraph of prose (not a quote, not centred) opens the chapter.
        const opens = !opened && block.runs.length > 0 && !block.quote && block.align !== 'center' && block.align !== 'right';
        if (opens) opened = true;
        out.push(`<p${opens ? ' class="opens"' : ''} style="${style}">${block.runs.length === 0 ? '&nbsp;' : runsHtml(block.runs)}</p>`);
        first = false;
        break;
      }
      case 'list':
        block.items.forEach((item, i) => {
          out.push(
            `<p class="list" style="${before(i === 0 ? 0.5 : 0, L)}">${esc(`${block.ordered ? `${i + 1}.` : '•'} ${item}`)}</p>`,
          );
        });
        first = false;
        break;
      case 'field':
        out.push(`<p style="${before(paraGap / L, L)}"><b>${esc(block.label)}: </b>${esc(block.text)}</p>`);
        first = false;
        break;
    }
  }
  if (!body) return head + out.join('');
  // A web serial: the author's notes before and after the text.
  const note = (text: string, label: string) =>
    text === '' ? '' : `<div class="note" role="note" aria-label="${esc(label)}">${esc(text).replace(/\n/g, '<br>')}</div>`;
  return head + note(s.noteBefore, 'Author’s note before the chapter') + out.join('') + note(s.noteAfter, 'Author’s note after the chapter');
}

/** The ebook's cover: the novel's picture when it is one, else its title and author on its colour. */
function coverHtml(book: Book): string {
  const cover = book.cover;
  if (cover && cover.startsWith('data:image/') && cover.includes(';base64,')) {
    return `<div class="cover"><img src="${esc(cover)}" alt="Cover of ${esc(book.title)}"></div>`;
  }
  const accent = /^#[0-9a-fA-F]{6}$/.test(book.accent) ? book.accent : '#B4532A';
  const n = parseInt(accent.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const ink = lum < 0.5 ? '#FFFFFF' : '#000000';
  return `<div class="cover" style="background:${accent};color:${ink}"><div style="font-size:2em;font-weight:600">${esc(
    book.title === '' ? 'Untitled' : book.title,
  )}</div>${book.author !== '' ? `<div style="margin-top:24px">${esc(book.author)}</div>` : ''}</div>`;
}

/** The ebook's contents page: every part and chapter, each one a link to it. */
function contentsHtml(book: Book, current: number): string {
  const entries = book.sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => ['part', 'chapter', 'cast', 'acknowledgements', 'about'].includes(s.kind));
  return `<h2 class="heading" style="font-size:1.5em">Contents</h2><nav class="contents" style="margin-top:16px">${entries
    .map(
      ({ s, i }) =>
        `<a href="#" data-jump="${i}" class="${i === current ? 'here' : ''}" style="padding-left:${16 * s.depth}px">${esc(
          s.showsLabel ? `${s.label}: ${s.title}` : s.title,
        )}</a>`,
    )
    .join('')}</nav>`;
}

/** The book's sections as the page shows them in `mode`: each set on its own, or (a web serial) only the chapters, one
 * at a time, each with its notes and the chapters either side. */
export function bookSections(book: Book, prefs: ReaderPrefs, mode: ReaderMode): ReaderSectionHtml[] {
  if (mode !== 'serial') return book.sections.map((s, i) => ({ id: s.id, html: sectionHtml(book, i, prefs) }));
  const chapters = book.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'chapter');
  return book.sections.map((s, i) => {
    if (s.kind !== 'chapter') return { id: s.id, html: '' };
    const at = chapters.findIndex((c) => c.i === i);
    const prev = chapters[at - 1];
    const next = chapters[at + 1];
    const nav = `<div class="nav"><a href="#" ${prev ? `data-jump="${prev.i}"` : 'class="off"'}>‹ ${esc(
      prev ? `Previous: ${prev.s.title}` : 'Previous',
    )}</a><a href="#" ${next ? `data-jump="${next.i}"` : 'class="off"'}>${esc(next ? `Next: ${next.s.title}` : 'Next')} ›</a></div>`;
    return { id: s.id, html: nav + chapterHtml(book, s, prefs, { notes: true }) + nav };
  });
}
