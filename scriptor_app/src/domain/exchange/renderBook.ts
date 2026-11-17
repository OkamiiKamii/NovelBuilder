// PUBLISHING OUTPUTS
// Files made from the book the reader shows (`reader/book.ts`): an EPUB ebook, and a web serial's chapters as a web
// page, Markdown or plain text. They read the book and nothing else; the stored manuscript is never touched, and the
// author's text goes out exactly as written (no quotes or dashes changed, nothing added to it). Pure TypeScript. A port
// of flutter_app/lib/shared/domain/exchange/render_book.dart (zips are made with fflate instead of package:archive).

import { type Zippable, strToU8, zipSync } from 'fflate';

import { type JsonMap, str } from '../json';
import { dartToLowerCase, dartTrim, dartTrimLeft, dartTrimRight } from '../text/dartString';
import { type Book, type Section, castLines } from '../reader/book';
import { type Block, DividerBlock, docToBlocks, type Run } from './compile';

/** The blocks of a section's text, with the author's scene breaks kept as breaks. */
export function blocksOf(section: Section): Block[] {
  const out: Block[] = [];
  for (const piece of section.pieces) {
    if (piece.type === 'break') out.push(new DividerBlock());
    else out.push(...docToBlocks({ type: 'doc', content: [piece.node] }, 3));
  }
  return out;
}

/** Something about an output the author should know: what was left out, and what to do about it. */
export type OutputNote = { readonly text: string };

/** A book that cannot be made, with what to do about it (`BookOutputException` in the Flutter app). */
export class BookOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookOutputError';
  }
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runsHtml(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      let t = xml(run.text).split('\n').join('<br/>');
      if (run.strike) t = `<s>${t}</s>`;
      if (run.underline) t = `<u>${t}</u>`;
      if (run.italic) t = `<em>${t}</em>`;
      if (run.bold) t = `<strong>${t}</strong>`;
      return t;
    })
    .join('');
}

function linesHtml(text: string, className?: string): string {
  return text
    .split('\n')
    .map((line) =>
      dartTrim(line).length === 0
        ? '<p class="blank">&#160;</p>'
        : `<p${className === undefined ? '' : ` class="${className}"`}>${xml(line)}</p>`,
    )
    .join('\n');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The story text of a section as XHTML: paragraphs, headings inside the text, quotes, lists and scene breaks. The
 * first paragraph after a heading or a break is marked so it is not indented, as printed books do. */
function bodyHtml(section: Section, sceneBreak: string): string {
  const out: string[] = [];
  let first = true;
  for (const block of blocksOf(section)) {
    switch (block.type) {
      case 'divider':
        out.push(
          dartTrim(sceneBreak).length === 0
            ? '<p class="break blank">&#160;</p>'
            : `<p class="break">${xml(sceneBreak)}</p>`,
        );
        first = true;
        break;
      case 'heading': {
        const level = clamp(block.level, 3, 6);
        out.push(`<h${level}>${xml(block.text)}</h${level}>`);
        first = true;
        break;
      }
      case 'paragraph': {
        const classes = [
          ...(first ? ['first'] : []),
          ...(block.quote ? ['quote'] : []),
          ...(block.align !== null && block.align !== 'left' ? [block.align] : []),
        ];
        out.push(`<p${classes.length === 0 ? '' : ` class="${classes.join(' ')}"`}>${runsHtml(block.runs)}</p>`);
        first = false;
        break;
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${block.items.map((item) => `<li>${xml(item)}</li>`).join('')}</${tag}>`);
        first = false;
        break;
      }
      case 'field':
        out.push(`<p><strong>${xml(block.label)}:</strong> ${xml(block.text)}</p>`);
        first = false;
        break;
    }
  }
  return out.join('\n');
}

function chapterHeading(section: Section, level = 2): string {
  return `<h${level} class="chapter">${section.showsLabel ? `<span class="label">${xml(section.label)}</span> ` : ''}${xml(section.title)}</h${level}>`;
}

const css = `body { margin: 0 5%; font-family: serif; line-height: 1.5; }
h1, h2 { text-align: center; font-weight: normal; margin: 2em 0 1.5em; page-break-before: always; }
h2 .label { display: block; font-size: 0.75em; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.5em; }
p { margin: 0; text-indent: 1.5em; }
p.first, p.break, p.center, p.right, p.blank, .matter p, .note p { text-indent: 0; }
p.break { text-align: center; margin: 1em 0; }
p.center { text-align: center; }
p.right { text-align: right; }
p.justify { text-align: justify; }
p.quote { margin: 0 2em; text-indent: 0; font-style: italic; }
.matter { text-align: center; margin-top: 20%; }
.matter p { margin: 0.4em 0; }
.epigraph .source { margin-top: 1em; font-style: italic; }
h3.cast-group { text-align: center; font-size: 0.8em; font-weight: normal; letter-spacing: 0.12em; text-transform: uppercase; margin: 1.6em 0 0.6em; }
p.cast { text-indent: 0; margin: 0.35em 0; }
.title h1 { font-size: 2em; page-break-before: auto; }
.title .subtitle { font-size: 1.2em; margin-bottom: 2em; }
.cover { text-align: center; margin: 0; }
.cover img { max-width: 100%; max-height: 100%; }
nav ol { list-style: none; padding-left: 1em; }
`;

function page(title: string, language: string, body: string, epubType?: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(language)}" lang="${xml(language)}">
<head>
<meta charset="utf-8"/>
<title>${xml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body${epubType === undefined ? '' : ` epub:type="${epubType}"`}>
${body}
</body>
</html>
`;
}

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64Value(c: string): number {
  if (c === '-') return 62;
  if (c === '_') return 63;
  return base64Alphabet.indexOf(c);
}

/** Dart's `base64Decode`: the standard or the URL alphabet, padding required (`=` or `%3D`), no white space, and no
 * stray bits before the padding. Null where Dart throws a FormatException. */
export function dartBase64Decode(text: string): Uint8Array | null {
  const values: number[] = [];
  let pad = 0;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === '=') {
      pad++;
      i++;
      continue;
    }
    if (c === '%' && text.substring(i + 1, i + 3).toUpperCase() === '3D') {
      pad++;
      i += 3;
      continue;
    }
    if (pad > 0) return null;
    const v = c.length === 1 && c !== '=' ? base64Value(c) : -1;
    if (v < 0) return null;
    values.push(v);
    i++;
  }
  if ((values.length + pad) % 4 !== 0) return null;
  const tail = values.length % 4;
  if (pad > 0 && !((tail === 2 && pad === 2) || (tail === 3 && pad === 1))) return null;
  if (tail === 1) return null;
  const bytes: number[] = [];
  let i = 0;
  for (; i + 4 <= values.length; i += 4) {
    const n = (values[i] << 18) | (values[i + 1] << 12) | (values[i + 2] << 6) | values[i + 3];
    bytes.push((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  }
  if (tail === 2) {
    if ((values[i + 1] & 0x0f) !== 0) return null;
    bytes.push(((values[i] << 2) | (values[i + 1] >> 4)) & 0xff);
  } else if (tail === 3) {
    if ((values[i + 2] & 0x03) !== 0) return null;
    const n = (values[i] << 10) | (values[i + 1] << 4) | (values[i + 2] >> 2);
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return Uint8Array.from(bytes);
}

type CoverImage = { bytes: Uint8Array; mediaType: string; extension: string };

/** A picture given as a `data:` address that an ebook can carry: JPEG, PNG, GIF or WebP, read by its first bytes. */
function coverImage(cover: string | null): CoverImage | null {
  if (cover === null || !cover.startsWith('data:')) return null;
  const comma = cover.indexOf(',');
  if (comma < 0 || !cover.substring(0, comma).endsWith(';base64')) return null;
  const bytes = dartBase64Decode(cover.substring(comma + 1));
  if (bytes === null) return null;
  const starts = (sig: number[]) => bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
  if (starts([0xff, 0xd8, 0xff])) return { bytes, mediaType: 'image/jpeg', extension: 'jpg' };
  if (starts([0x89, 0x50, 0x4e, 0x47])) return { bytes, mediaType: 'image/png', extension: 'png' };
  if (starts([0x47, 0x49, 0x46, 0x38])) return { bytes, mediaType: 'image/gif', extension: 'gif' };
  if (starts([0x52, 0x49, 0x46, 0x46]) && bytes.length > 12 && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    return { bytes, mediaType: 'image/webp', extension: 'webp' };
  }
  return null;
}

function utcStamp(when: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${when.getUTCFullYear()}-${two(when.getUTCMonth() + 1)}-${two(when.getUTCDate())}T${two(when.getUTCHours())}:${two(when.getUTCMinutes())}:${two(when.getUTCSeconds())}Z`;
}

/** An ebook and what the author should know about it. */
export type EpubResult = { readonly bytes: Uint8Array; readonly notes: readonly OutputNote[] };

/** The files of an EPUB, in the order they go into the zip, before zipping: what `renderEpub` packs. `mimetype` is
 * first; every other entry is text but the cover picture. */
export type EpubFiles = { readonly entries: readonly (readonly [string, string | Uint8Array])[]; readonly notes: readonly OutputNote[] };

/** The ebook's files, as `renderEpub` zips them. Exposed so their text can be checked and shown without unzipping. */
export function epubFiles(
  book: Book,
  args: { identifier: string; language: string; modified: Date },
): EpubFiles {
  if (book.sections.every((s) => s.kind !== 'chapter' || s.words === 0)) {
    throw new BookOutputError(
      'This novel has no chapter with text yet, so there is nothing to put in an ebook. Write a chapter, then try again.',
    );
  }
  const lang = dartTrim(args.language).length === 0 ? 'en' : dartTrim(args.language);
  const notes: OutputNote[] = [];
  const title = dartTrim(book.title).length === 0 ? 'Untitled' : dartTrim(book.title);
  const cover = coverImage(book.cover);
  if (book.cover !== null && book.cover.length > 0 && cover === null) {
    notes.push({
      text: book.cover.startsWith('data:')
        ? "The cover picture is not a JPEG, PNG, GIF or WebP, so the ebook has a title cover instead. Choose another picture under the novel's details to use it."
        : "The cover is a web address, which this app never fetches (it stays offline), so the ebook has a title cover instead. Choose a picture from this device under the novel's details to use it.",
    });
  }

  const files = new Map<string, string>();
  const spine: string[] = [];
  const toc: { file: string; title: string; depth: number }[] = [];
  let n = 0;
  let firstChapter: string | null = null;
  const fileFor = (s: Section) => (s.kind === 'contents' ? 'nav.xhtml' : `p${String(n++).padStart(3, '0')}.xhtml`);
  const hasAuthor = dartTrim(book.author).length > 0;

  const navBody = () => {
    let items = '';
    for (const e of toc) items += `<li style="margin-left:${e.depth}em"><a href="${e.file}">${xml(e.title)}</a></li>\n`;
    return (
      `<nav epub:type="toc" id="toc"><h1>Contents</h1>\n<ol>\n${items}</ol>\n</nav>\n` +
      '<nav epub:type="landmarks" hidden="hidden"><ol>' +
      '<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>' +
      `${firstChapter === null ? '' : `<li><a epub:type="bodymatter" href="${firstChapter}">Start reading</a></li>`}` +
      '</ol></nav>'
    );
  };

  for (const s of book.sections) {
    const file = fileFor(s);
    spine.push(file);
    switch (s.kind) {
      case 'cover':
        files.set(
          file,
          page(
            'Cover',
            lang,
            cover !== null
              ? `<div class="cover"><img src="cover.${cover.extension}" alt="${xml(title)}"/></div>`
              : `<div class="matter title"><h1>${xml(title)}</h1>${hasAuthor ? `<p>${xml(book.author)}</p>` : ''}</div>`,
            'cover',
          ),
        );
        break;
      case 'title':
        files.set(
          file,
          page(
            'Title page',
            lang,
            `<div class="matter title"><h1>${xml(title)}</h1>` +
              `${dartTrim(book.subtitle).length === 0 ? '' : `<p class="subtitle">${xml(book.subtitle)}</p>`}` +
              `${hasAuthor ? `<p>${xml(book.author)}</p>` : ''}</div>`,
            'titlepage',
          ),
        );
        break;
      case 'copyright':
      case 'dedication':
        files.set(file, page(s.title, lang, `<div class="matter">${linesHtml(s.text)}</div>`));
        break;
      case 'epigraph':
        files.set(
          file,
          page(
            s.title,
            lang,
            `<div class="matter epigraph">${linesHtml(s.text)}${s.source.length === 0 ? '' : `<p class="source">— ${xml(s.source)}</p>`}</div>`,
            'epigraph',
          ),
        );
        break;
      case 'contents':
        // Written below, once every entry is known.
        break;
      case 'part':
        toc.push({ file, title: s.title, depth: s.depth });
        files.set(
          file,
          page(
            s.title,
            lang,
            `<h1>${s.label.length > 0 && dartToLowerCase(s.label) !== dartToLowerCase(s.title) ? `<span class="label">${xml(s.label)}</span><br/>` : ''}${xml(s.title)}</h1>`,
            'part',
          ),
        );
        break;
      case 'chapter':
        firstChapter ??= file;
        toc.push({ file, title: s.showsLabel ? `${s.label}: ${s.title}` : s.title, depth: s.depth });
        files.set(file, page(s.title, lang, `${chapterHeading(s)}\n${bodyHtml(s, book.sceneBreak)}`, 'chapter'));
        break;
      case 'cast': {
        toc.push({ file, title: s.title, depth: 0 });
        const cast = castLines(s.text)
          .map((l) =>
            l.group
              ? `<h3 class="cast-group">${xml(l.name)}</h3>`
              : `<p class="cast"><b>${xml(l.name)}</b>${l.about.length === 0 ? '' : ` — ${xml(l.about)}`}</p>`,
          )
          .join('\n');
        files.set(file, page(s.title, lang, `<h2>${xml(s.title)}</h2>\n${cast}`, 'dramatis-personae'));
        break;
      }
      case 'acknowledgements':
      case 'about':
        toc.push({ file, title: s.title, depth: 0 });
        files.set(file, page(s.title, lang, `<h2>${xml(s.title)}</h2>\n${linesHtml(s.text)}`));
        break;
    }
  }
  if (!spine.includes('nav.xhtml')) spine.push('nav.xhtml');
  files.set('nav.xhtml', page('Contents', lang, navBody()));

  let manifest =
    '<item id="css" href="style.css" media-type="text/css"/>\n' +
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n';
  if (cover !== null) {
    manifest += `<item id="cover-image" href="cover.${cover.extension}" media-type="${cover.mediaType}" properties="cover-image"/>\n`;
  }
  for (const f of spine.filter((f) => f !== 'nav.xhtml')) {
    manifest += `<item id="${f.split('.')[0]}" href="${f}" media-type="application/xhtml+xml"/>\n`;
  }
  const itemrefs = spine.map((f) => `<itemref idref="${f === 'nav.xhtml' ? 'nav' : f.split('.')[0]}"/>`).join('\n');
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${xml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${xml(args.identifier)}</dc:identifier>
<dc:title>${xml(title)}</dc:title>
${hasAuthor ? `<dc:creator>${xml(dartTrim(book.author))}</dc:creator>\n` : ''}<dc:language>${xml(lang)}</dc:language>
<meta property="dcterms:modified">${utcStamp(args.modified)}</meta>
</metadata>
<manifest>
${manifest}</manifest>
<spine>
${itemrefs}
</spine>
</package>
`;
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

  const entries: [string, string | Uint8Array][] = [
    // The first entry, stored as it is: how a reader knows the file is an ebook.
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', dartTrimLeft(container)],
    ['OEBPS/content.opf', dartTrimLeft(opf)],
    ['OEBPS/style.css', css],
  ];
  if (cover !== null) entries.push([`OEBPS/cover.${cover.extension}`, cover.bytes]);
  for (const [name, text] of files) entries.push([`OEBPS/${name}`, dartTrimLeft(text)]);
  return { entries, notes };
}

/** Zips entries in order: the first one stored when [storeFirst] (an EPUB's mimetype), the rest compressed. */
function zipEntries(
  entries: readonly (readonly [string, string | Uint8Array])[],
  modified: Date,
  storeFirst: boolean,
): Uint8Array {
  const data: Zippable = {};
  entries.forEach(([name, content], i) => {
    const bytes = typeof content === 'string' ? strToU8(content) : content;
    data[name] = storeFirst && i === 0 ? [bytes, { level: 0 }] : bytes;
  });
  return zipSync(data, { level: 6, mtime: modified });
}

/** The book as an EPUB 3 file: the ebook format's pages in order (cover, title page, matter, contents, parts and
 * chapters), a contents list that readers can jump from, the novel's title, author and language, and the cover picture
 * when it is one an ebook can carry. Web addresses are never fetched: this app stays offline. The `mimetype` entry is
 * first and stored uncompressed, as EPUB requires. Throws BookOutputError when no chapter has text. */
export function renderEpub(book: Book, args: { identifier: string; language: string; modified: Date }): EpubResult {
  const { entries, notes } = epubFiles(book, args);
  return { bytes: zipEntries(entries, args.modified, true), notes };
}

/** The ways a web serial's chapter goes out. */
export type SerialFormat = 'html' | 'markdown' | 'text';
export const serialFormats: readonly { key: SerialFormat; label: string; extension: string }[] = [
  { key: 'html', label: 'Web page', extension: 'html' },
  { key: 'markdown', label: 'Markdown', extension: 'md' },
  { key: 'text', label: 'Plain text', extension: 'txt' },
];

export function serialExtension(format: SerialFormat): string {
  return serialFormats.find((f) => f.key === format)!.extension;
}

function mdEscape(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#|])/g, (_, c: string) => `\\${c}`);
}

function mdRuns(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      if (dartTrim(run.text).length === 0) return run.text.split('\n').join('  \n');
      // Emphasis around the words only, so a run's own spaces stay outside the marks.
      const match = /^(\s*)(.*?)(\s*)$/s.exec(run.text)!;
      let t = mdEscape(match[2]).split('\n').join('  \n');
      if (run.strike) t = `~~${t}~~`;
      if (run.italic) t = `*${t}*`;
      if (run.bold) t = `**${t}**`;
      return `${match[1]}${t}${match[3]}`;
    })
    .join('');
}

/** The heading a serial chapter goes out under: "Chapter 3: The Bell", or the title alone when it says the same. */
export function serialHeading(s: Section): string {
  return s.showsLabel ? `${s.label}: ${s.title}` : s.title;
}

/** One chapter as posted online: its heading, the author's note before, the text with the book's scene breaks, the
 * note after. The text is exactly as written. */
export function renderSerialChapter(book: Book, s: Section, format: SerialFormat): string {
  const blocks = blocksOf(s);
  const mark = dartTrim(book.sceneBreak);
  switch (format) {
    case 'html': {
      const note = (text: string, which: string) =>
        text.length === 0 ? '' : `<aside class="note ${which}">\n${linesHtml(text)}\n</aside>\n`;
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${xml(serialHeading(s))}</title>
<style>body{max-width:40em;margin:2em auto;padding:0 1em;font-family:Georgia,serif;line-height:1.6}p{margin:0 0 1em}p.break{text-align:center}.note{font-style:italic;border-left:3px solid #999;padding-left:1em;margin:1em 0}</style>
</head>
<body>
<h1>${xml(serialHeading(s))}</h1>
${note(s.noteBefore, 'before')}${bodyHtml(s, book.sceneBreak)}
${note(s.noteAfter, 'after')}</body>
</html>
`;
    }
    case 'markdown': {
      const out: string[] = [`# ${mdEscape(serialHeading(s))}`, ''];
      if (s.noteBefore.length > 0) out.push(...s.noteBefore.split('\n').map((line) => `> ${mdEscape(line)}`), '');
      for (const b of blocks) {
        switch (b.type) {
          case 'divider':
            out.push(mark.length === 0 ? '&nbsp;' : mdEscape(mark), '');
            break;
          case 'heading':
            out.push(`${'#'.repeat(clamp(b.level, 2, 6))} ${mdEscape(b.text)}`, '');
            break;
          case 'paragraph':
            if (dartTrim(b.text).length === 0) continue;
            out.push(`${b.quote ? '> ' : ''}${mdRuns(b.runs)}`, '');
            break;
          case 'list':
            out.push(...b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '-'} ${mdEscape(item)}`), '');
            break;
          case 'field':
            out.push(`**${mdEscape(b.label)}:** ${mdEscape(b.text)}`, '');
            break;
        }
      }
      if (s.noteAfter.length > 0) out.push(...s.noteAfter.split('\n').map((line) => `> ${mdEscape(line)}`), '');
      return `${dartTrimRight(out.join('\n'))}\n`;
    }
    case 'text': {
      const out: string[] = [serialHeading(s), ''];
      if (s.noteBefore.length > 0) out.push(s.noteBefore, '');
      for (const b of blocks) {
        switch (b.type) {
          case 'divider':
            out.push(mark, '');
            break;
          case 'heading':
            out.push(b.text, '');
            break;
          case 'paragraph':
            if (dartTrim(b.text).length === 0) continue;
            out.push(b.text, '');
            break;
          case 'list':
            out.push(...b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '-'} ${item}`), '');
            break;
          case 'field':
            out.push(`${b.label}: ${b.text}`, '');
            break;
        }
      }
      if (s.noteAfter.length > 0) out.push(s.noteAfter, '');
      return `${dartTrimRight(out.join('\n'))}\n`;
    }
  }
}

/** A file name for a serial chapter: its place in the book and its title, kept to safe characters. */
export function serialFileName(s: Section, index: number, format: SerialFormat): string {
  const slug = dartToLowerCase(s.title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${slug.length === 0 ? 'chapter' : slug}.${serialExtension(format)}`;
}

/** Every chapter of a web serial as the files `renderSerialZip` packs, in order: one file each. Throws BookOutputError
 * when no chapter has text. */
export function serialFiles(book: Book, format: SerialFormat): [string, string][] {
  const chapters = book.sections.filter((s) => s.kind === 'chapter');
  if (chapters.every((s) => s.words === 0)) {
    throw new BookOutputError(
      'This novel has no chapter with text yet, so there is nothing to post. Write a chapter, then try again.',
    );
  }
  return chapters.map((s, i) => [serialFileName(s, i, format), renderSerialChapter(book, s, format)]);
}

/** Every chapter of a web serial, one file each, in one zip. The files are dated [modified] (now, when not given). */
export function renderSerialZip(book: Book, format: SerialFormat, modified: Date = new Date()): Uint8Array {
  return zipEntries(serialFiles(book, format), modified, false);
}

/** The ebook's identifier: the novel's own id, so every export of the same novel is the same book to a reader app. */
export function epubIdentifier(project: JsonMap): string {
  return `urn:uuid:${str(project['id'])}`;
}
