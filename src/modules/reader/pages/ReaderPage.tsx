import { useLiveQuery } from 'dexie-react-hooks';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { reader } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { formatNumber } from '@/shared/format';
import { FORMATS, FORMAT_HINTS, FORMAT_LABELS, buildBook, progressAt, readingMinutes, showsLabel, type Book, type Format, type Section } from '../book';
import { DEVICES, FONTS, RANGES, SCHEMES, contrast, contrastVerdict, readBookmark, readerPrefs, resolve, useReaderPrefs, writeBookmark, type DeviceKey, type FontKey, type ReaderPrefs, type SchemeKey } from '../prefs';
import { Lines, Prose } from '../Prose';

/** A place in the book that survives a change of format: the section by its id, and how far through it. */
interface At {
  id: string;
  fraction: number;
}

const GAP = 56;

interface PagerHandle {
  turn: (by: 1 | -1) => void;
}

/**
 * One section, a page at a time. The text is laid out by the browser in
 * columns exactly one page wide and the view is moved along them, so what
 * falls on each page is the browser's own typesetting: line breaks, widows
 * and all.
 */
const Pager = forwardRef<PagerHandle, { layoutKey: string; fraction: number; onPage: (fraction: number, page: number, pages: number) => void; onEdge: (by: 1 | -1) => void; children: ReactNode }>(function Pager({ layoutKey, fraction, onPage, onEdge, children }, ref) {
  const frame = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);
  // Where in the section to be: the place asked for at first, and from then on wherever the reader has turned to.
  const wanted = useRef(fraction);
  const now = useRef({ page: 0, pages: 1 });

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Count the pages whenever the text, the type or the page size changes, and stay at the same place in the text.
  useLayoutEffect(() => {
    if (!flow.current || !size.width) return;
    const count = Math.max(1, Math.round((flow.current.scrollWidth + GAP) / (size.width + GAP)));
    const here = Math.min(count - 1, Math.round(wanted.current * (count - 1)));
    now.current = { page: here, pages: count };
    setPages(count);
    setPage(here);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, size.width, size.height]);

  const report = useRef(onPage);
  report.current = onPage;
  useEffect(() => {
    if (pages > 1) wanted.current = page / (pages - 1);
    report.current(pages > 1 ? page / (pages - 1) : 0, page, pages);
  }, [page, pages]);

  useImperativeHandle(ref, () => ({
    // Worked out from where the reader is this instant, not as of the last time the screen was drawn, so that keys
    // pressed in quick succession each turn a page.
    turn(by) {
      const next = now.current.page + by;
      if (next < 0 || next >= now.current.pages) return onEdge(by);
      now.current.page = next;
      setPage(next);
    },
  }));

  return (
    <div className="pager" ref={frame}>
      <div className="pager-flow" ref={flow} style={{ columnWidth: size.width || undefined, columnGap: GAP, transform: `translateX(-${page * (size.width + GAP)}px)` }}>
        {children}
      </div>
    </div>
  );
});

function Opener({ section }: { section: Section }) {
  return (
    <header className="opener">
      {showsLabel(section) && <p className="opener-label">{section.label}</p>}
      <h2>{section.title}</h2>
    </header>
  );
}

/** One section of the book, as its kind is set in print. */
function SectionView({ book, section, onJump }: { book: Book; section: Section; onJump: (id: string) => void }) {
  switch (section.kind) {
    case 'cover':
      return (
        <div className="book-cover" style={{ '--accent': book.accent } as CSSProperties} aria-label="Cover">
          {book.cover ? (
            <img src={book.cover} alt={`Cover of ${book.title}`} referrerPolicy="no-referrer" />
          ) : (
            <div className="book-cover-made">
              <p className="book-cover-title">{book.title}</p>
              {book.subtitle && <p className="book-cover-sub">{book.subtitle}</p>}
              {book.author && <p className="book-cover-author">{book.author}</p>}
            </div>
          )}
        </div>
      );
    case 'title':
      return (
        <div className="title-page">
          <h1>{book.title}</h1>
          {book.subtitle && <p className="title-sub">{book.subtitle}</p>}
          {book.author && <p className="title-author">{book.author}</p>}
        </div>
      );
    case 'dedication':
      return (
        <div className="matter dedication">
          <Lines text={section.text} />
        </div>
      );
    case 'epigraph':
      return (
        <div className="matter epigraph">
          <Lines text={section.text} />
          {section.source && <p className="epigraph-source">— {section.source}</p>}
        </div>
      );
    case 'copyright':
      return (
        <div className="matter copyright">
          <Lines text={section.text} />
        </div>
      );
    case 'contents':
      return (
        <nav className="matter contents-page" aria-label="Contents page">
          <h2>Contents</h2>
          <ol>
            {book.sections.filter((s) => s.kind === 'part' || s.kind === 'chapter' || s.kind === 'acknowledgements' || s.kind === 'about').map((s) => (
              <li key={s.id} className={`depth-${Math.min(2, s.depth)} is-${s.kind}`}>
                <button type="button" onClick={() => onJump(s.id)}>
                  {showsLabel(s) ? `${s.label}: ${s.title}` : s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      );
    case 'part':
      return (
        <div className="part-page">
          {showsLabel(section) && <p className="opener-label">{section.label}</p>}
          <h2>{section.title}</h2>
        </div>
      );
    case 'acknowledgements':
    case 'about':
      return (
        <div className="matter back-matter">
          <h2>{section.title}</h2>
          <Lines text={section.text} />
        </div>
      );
    default:
      return (
        <article className="chapter" aria-label={showsLabel(section) ? `${section.label}: ${section.title}` : section.title}>
          <Opener section={section} />
          {section.pieces.length ? <Prose pieces={section.pieces} sceneBreak={book.sceneBreak} /> : <p className="nothing-yet">This chapter has no text yet.</p>}
        </article>
      );
  }
}

const Range = ({ label, value, range, unit = '', onChange }: { label: string; value: number; range: { min: number; max: number; step: number }; unit?: string; onChange: (value: number) => void }) => (
  <label className="field reader-range">
    <span>
      {label} <span className="reader-value" aria-hidden="true">{Math.round(value * 100) / 100}{unit}</span>
    </span>
    <input type="range" min={range.min} max={range.max} step={range.step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
);

/** How the page looks. Every control here changes the reader's settings on this device and nothing in the project. */
function Appearance({ prefs, onClose }: { prefs: ReaderPrefs; onClose: () => void }) {
  const set = readerPrefs.set;
  const look = resolve(prefs);
  const ratio = contrast(look.bg, look.text);
  return (
    <aside className="reader-drawer reader-drawer-right" aria-label="Appearance">
      <header className="reader-drawer-head">
        <h2>Appearance</h2>
        <button type="button" className="reader-tool" aria-label="Close appearance" onClick={onClose}>
          ✕
        </button>
      </header>
      <fieldset className="reader-set">
        <legend>Turning pages</legend>
        <div className="reader-choices" role="radiogroup" aria-label="Page turn or scroll">
          {(['paged', 'scroll'] as const).map((flow) => (
            <button key={flow} type="button" role="radio" aria-checked={look.flow === flow} disabled={prefs.format === 'serial'} className={look.flow === flow ? 'active' : ''} onClick={() => set({ flow })}>
              {flow === 'paged' ? 'Page turn' : 'Continuous scroll'}
            </button>
          ))}
        </div>
        {prefs.format === 'serial' && <p className="reader-hint">A web serial is read by scrolling.</p>}
      </fieldset>
      <fieldset className="reader-set">
        <legend>Type</legend>
        <label className="field">
          <span>Typeface</span>
          <select value={prefs.font} aria-label="Typeface" onChange={(e) => set({ font: e.target.value as FontKey })}>
            <optgroup label="Serif">
              {(['book', 'garamond', 'charter', 'georgia'] as const).map((key) => (
                <option key={key} value={key}>
                  {FONTS[key].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sans-serif">
              {(['sans', 'humanist'] as const).map((key) => (
                <option key={key} value={key}>
                  {FONTS[key].label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <Range label="Font size" value={prefs.size} range={RANGES.size} unit="px" onChange={(size) => set({ size })} />
        <Range label="Line height" value={prefs.leading} range={RANGES.leading} onChange={(leading) => set({ leading })} />
        <Range label="Reading width" value={prefs.measure} range={RANGES.measure} unit=" characters" onChange={(measure) => set({ measure })} />
        {prefs.format === 'ebook' && <p className="reader-hint">On an ebook the text also reflows to the device chosen below.</p>}
      </fieldset>
      <fieldset className="reader-set">
        <legend>Paragraphs</legend>
        <label className="field">
          <span>Style</span>
          <select value={prefs.paragraphs} aria-label="Paragraph style" onChange={(e) => set({ paragraphs: e.target.value as ReaderPrefs['paragraphs'] })}>
            <option value="auto">As the format does it</option>
            <option value="indent">Indented first lines</option>
            <option value="spaced">Space between paragraphs</option>
          </select>
        </label>
        {look.indented ? <Range label="Indent" value={prefs.indent} range={RANGES.indent} unit=" em" onChange={(indent) => set({ indent })} /> : <Range label="Paragraph spacing" value={prefs.spacing} range={RANGES.spacing} unit=" lines" onChange={(spacing) => set({ spacing })} />}
        <label className="check">
          <input type="checkbox" checked={prefs.justify} disabled={prefs.format === 'serial'} onChange={(e) => set({ justify: e.target.checked })} />
          Justify both margins
        </label>
      </fieldset>
      <fieldset className="reader-set">
        <legend>Colours</legend>
        <div className="reader-swatches" role="radiogroup" aria-label="Colour scheme">
          {(Object.keys(SCHEMES) as SchemeKey[]).map((key) => {
            const colours = key === 'custom' ? { bg: prefs.customBg, text: prefs.customText } : SCHEMES[key];
            return (
              <button key={key} type="button" role="radio" aria-checked={prefs.scheme === key} className={prefs.scheme === key ? 'active' : ''} style={{ background: colours.bg, color: colours.text }} onClick={() => set({ scheme: key })}>
                {SCHEMES[key].label}
              </button>
            );
          })}
        </div>
        {prefs.scheme === 'custom' && (
          <div className="reader-custom">
            <label className="inline">
              Page
              <input type="color" value={prefs.customBg} aria-label="Custom page colour" onChange={(e) => set({ customBg: e.target.value })} />
            </label>
            <label className="inline">
              Text
              <input type="color" value={prefs.customText} aria-label="Custom text colour" onChange={(e) => set({ customText: e.target.value })} />
            </label>
          </div>
        )}
        <p className="reader-hint" role="status" aria-label="Contrast">
          Contrast {ratio}:1, {contrastVerdict(ratio)}.
        </p>
      </fieldset>
      {prefs.format === 'ebook' && (
        <fieldset className="reader-set">
          <legend>Device</legend>
          <div className="reader-choices" role="radiogroup" aria-label="Device to simulate">
            {(Object.keys(DEVICES) as DeviceKey[]).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={prefs.device === key} className={prefs.device === key ? 'active' : ''} onClick={() => set({ device: key })}>
                {DEVICES[key].label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <p className="reader-hint">These settings are for previewing on this device. They change nothing in the manuscript, and are not exported with it.</p>
    </aside>
  );
}

/** The reader's table of contents: where everything is, how far through the reader is, and a way to jump. */
function Contents({ book, index, progress, furthest, onJump, onClose }: { book: Book; index: number; progress: number; furthest: number; onJump: (id: string) => void; onClose: () => void }) {
  let before = 0;
  return (
    <aside className="reader-drawer reader-drawer-left" aria-label="Table of contents">
      <header className="reader-drawer-head">
        <h2>Contents</h2>
        <button type="button" className="reader-tool" aria-label="Close contents" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="reader-progress-box" role="status" aria-label="Reading progress">
        <strong>{Math.round(progress * 100)}% read</strong>
        <span>
          {formatNumber(Math.round(progress * book.words))} of {formatNumber(book.words)} words · about {readingMinutes(Math.round((1 - progress) * book.words))} min left
        </span>
        <span className="reader-bar" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </span>
        {furthest > progress + 0.005 && <span>Furthest read: {Math.round(furthest * 100)}%</span>}
      </div>
      <ol className="reader-toc">
        {book.sections.map((section, i) => {
          const share = book.words ? before / book.words : 0;
          before += section.words;
          return (
            <li key={section.id} className={`depth-${Math.min(2, section.depth)} is-${section.kind}${i === index ? ' current' : i < index ? ' read' : ''}`}>
              <button type="button" aria-current={i === index ? 'location' : undefined} onClick={() => onJump(section.id)}>
                <span className="toc-name">
                  {showsLabel(section) && <span className="toc-label">{section.label}</span>}
                  {section.title}
                </span>
                {section.kind === 'chapter' && <span className="toc-at">{Math.round(share * 100)}%</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** The whole book in one column, for reading by scrolling. */
function Scroller({ book, target, onPlace, onJump }: { book: Book; target: { at: At; key: number }; onPlace: (at: At) => void; onJump: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const settle = useRef(0);
  // Go where asked (an opening position, a jump from the contents). Scrolling by hand is not "asked".
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-section="${CSS.escape(target.at.id)}"]`);
    if (!box.current || !el) return;
    settle.current = Date.now() + 250;
    box.current.scrollTop = el.offsetTop + target.at.fraction * Math.max(0, el.offsetHeight - box.current.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key, book.sections.length]);
  const later = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(later.current), []);
  const onScroll = () => {
    const root = box.current;
    if (!root) return;
    // The scroll that a jump itself causes is not the reader moving; but anything they do straight after it still counts.
    if (Date.now() < settle.current) {
      window.clearTimeout(later.current);
      later.current = window.setTimeout(onScroll, settle.current - Date.now() + 10);
      return;
    }
    const parts = [...root.querySelectorAll<HTMLElement>('[data-section]')];
    const line = root.scrollTop + root.clientHeight * 0.35;
    // At the very bottom the reader has reached the end, however short the last page is.
    const ended = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
    const here = ended ? parts[parts.length - 1] : (parts.filter((part) => part.offsetTop <= line).pop() ?? parts[0]);
    if (!here) return;
    if (ended) return onPlace({ id: here.dataset.section!, fraction: 1 });
    onPlace({ id: here.dataset.section!, fraction: Math.min(1, Math.max(0, (line - here.offsetTop) / Math.max(1, here.offsetHeight))) });
  };
  return (
    <div className="reader-scroll" ref={box} onScroll={onScroll} tabIndex={0} aria-label="Book, continuous">
      <div className="scroll-column">
        {book.sections.map((section) => (
          <section key={section.id} data-section={section.id} className={`scroll-section is-${section.kind}`}>
            <SectionView book={book} section={section} onJump={onJump} />
          </section>
        ))}
      </div>
    </div>
  );
}

/** One chapter as a web serial posts it: header, the author's note, the chapter, the closing note, and the way on. */
function Serial({ book, index, target, onPlace, onJump }: { book: Book; index: number; target: { at: At; key: number }; onPlace: (at: At) => void; onJump: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const section = book.sections[index];
  const [previous, next] = [book.sections[index - 1], book.sections[index + 1]];
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = target.at.fraction * (box.current.scrollHeight - box.current.clientHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key, section?.id]);
  if (!section) return <p className="nothing-yet reader-empty">There are no chapters to post yet.</p>;
  const nav = (where: string) => (
    <nav className="serial-nav" aria-label={`Chapter navigation, ${where}`}>
      <button type="button" disabled={!previous} onClick={() => previous && onJump(previous.id)}>
        ← Previous
      </button>
      <select value={section.id} aria-label={`Jump to a chapter, ${where}`} onChange={(e) => onJump(e.target.value)}>
        {book.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {showsLabel(s) ? `${s.label}: ${s.title}` : s.title}
          </option>
        ))}
      </select>
      <button type="button" disabled={!next} onClick={() => next && onJump(next.id)}>
        Next →
      </button>
    </nav>
  );
  return (
    <div
      className="reader-scroll serial"
      ref={box}
      tabIndex={0}
      aria-label="Web serial chapter"
      onScroll={() => box.current && onPlace({ id: section.id, fraction: Math.min(1, box.current.scrollTop / Math.max(1, box.current.scrollHeight - box.current.clientHeight)) })}
    >
      <article className="serial-page" aria-label={showsLabel(section) ? `${section.label}: ${section.title}` : section.title}>
        <p className="serial-site">
          {book.title}
          {book.author ? ` · by ${book.author}` : ''}
        </p>
        {nav('top')}
        <header className="serial-head">
          {section.number !== null && <p className="serial-number">Chapter {section.number}</p>}
          <h1>{section.title}</h1>
          <p className="serial-meta">
            {formatNumber(section.words)} words · {readingMinutes(section.words)} min read
          </p>
        </header>
        {section.noteBefore && (
          <aside className="author-note" aria-label="Author’s note before the chapter">
            <strong>Author’s note</strong>
            <Lines text={section.noteBefore} />
          </aside>
        )}
        {section.pieces.length ? <Prose pieces={section.pieces} sceneBreak={book.sceneBreak} /> : <p className="nothing-yet">This chapter has no text yet.</p>}
        {section.noteAfter && (
          <aside className="author-note" aria-label="Author’s note after the chapter">
            <strong>Author’s note</strong>
            <Lines text={section.noteAfter} />
          </aside>
        )}
        {nav('bottom')}
      </article>
    </div>
  );
}

/**
 * READER PREVIEW
 * The manuscript as a reader would meet it, full screen, with none of the
 * tools for writing it. Everything on this page is drawn from a read-only
 * load of what is saved; its own controls change how the preview looks and
 * where the reader is in it, both kept on this device, and nothing else.
 */
export function ReaderPage() {
  const project = useCurrentProject();
  const prefs = useReaderPrefs();
  const look = resolve(prefs);
  const [params] = useSearchParams();
  const source = useLiveQuery(() => reader.forProject(project.id).load(), [project.id]);
  const book = useMemo(() => (source ? buildBook(source, prefs.format) : null), [source, prefs.format]);
  const [at, setAt] = useState<At | null>(null);
  const [target, setTarget] = useState({ at: { id: '', fraction: 0 }, key: 0 });
  const [drawer, setDrawer] = useState<'contents' | 'appearance' | null>(null);
  const [chrome, setChrome] = useState(true);
  const [pageInfo, setPageInfo] = useState({ page: 0, pages: 1 });
  const [furthest, setFurthest] = useState(() => readBookmark(project.id)?.furthest ?? 0);
  const pager = useRef<PagerHandle>(null);

  const go = useCallback((next: At) => {
    setAt(next);
    setTarget((was) => ({ at: next, key: was.key + 1 }));
  }, []);

  // Where to open: at the chapter the author came from, or where they last were, or the beginning.
  const opened = useRef(false);
  useEffect(() => {
    if (!book || !source || opened.current) return;
    opened.current = true;
    const from = params.get('at');
    const node = from ? source.nodes.find((n) => n.id === from) : undefined;
    const chapterId = node?.kind === 'scene' ? node.parentId : node?.id;
    const mark = readBookmark(project.id);
    const start = book.sections.find((s) => s.id === chapterId) ?? book.sections.find((s) => s.id === mark?.sectionId);
    go(start ? { id: start.id, fraction: start.id === mark?.sectionId && !chapterId ? mark.fraction : 0 } : { id: book.sections[0]?.id ?? '', fraction: 0 });
  }, [book, source, params, project.id, go]);

  // A change of format can remove the page the reader was on (a serial has no cover): go to the nearest chapter instead.
  const index = book && at ? book.sections.findIndex((s) => s.id === at.id) : -1;
  useEffect(() => {
    if (!book || !at || index >= 0) return;
    const fallback = book.sections.find((s) => s.kind === 'chapter') ?? book.sections[0];
    if (fallback) go({ id: fallback.id, fraction: 0 });
  }, [book, at, index, go]);

  const progress = book && index >= 0 ? progressAt(book, { index, fraction: at!.fraction }) : 0;
  useEffect(() => {
    if (!at || index < 0) return;
    const reached = Math.max(furthest, progress);
    if (reached !== furthest) setFurthest(reached);
    writeBookmark(project.id, { sectionId: at.id, fraction: at.fraction, furthest: reached });
  }, [at, index, progress, furthest, project.id]);

  const jump = useCallback((id: string) => {
    go({ id, fraction: 0 });
    setDrawer(null);
  }, [go]);
  const step = useCallback((by: 1 | -1) => {
    if (!book || index < 0) return;
    const next = book.sections[index + by];
    if (next) go({ id: next.id, fraction: by < 0 && look.flow === 'paged' ? 1 : 0 });
  }, [book, index, go, look.flow]);
  const turn = useCallback((by: 1 | -1) => (look.flow === 'paged' ? pager.current?.turn(by) : step(by)), [look.flow, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const on = e.target as HTMLElement;
      // Keys typed into a control are the control's; a focused button keeps Space and Enter for itself.
      if (on.closest('input, select, textarea') || (on.closest('button, a') && (e.key === ' ' || e.key === 'Enter'))) return;
      if (e.key === 'Escape') return drawer ? setDrawer(null) : setChrome(true);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const paged = look.flow === 'paged';
      if (e.key === 'ArrowRight' || (paged && (e.key === 'PageDown' || e.key === ' '))) turn(1);
      else if (e.key === 'ArrowLeft' || (paged && e.key === 'PageUp')) turn(-1);
      else if (e.key.toLowerCase() === 't') setDrawer((d) => (d === 'contents' ? null : 'contents'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, drawer, look.flow]);

  const style = {
    '--r-bg': look.bg, '--r-text': look.text, '--r-font': FONTS[prefs.font].stack, '--r-size': `${prefs.size}px`, '--r-leading': prefs.leading, '--r-measure': `${prefs.measure}ch`,
    '--r-indent': look.indented ? `${prefs.indent}em` : '0', '--r-gap': look.indented ? '0' : `${prefs.spacing * prefs.leading}em`, '--r-align': look.justify ? 'justify' : 'start',
    '--device-w': `${DEVICES[prefs.device].width}px`, '--device-h': `${DEVICES[prefs.device].height}px`,
  } as CSSProperties;

  const section = book && index >= 0 ? book.sections[index] : null;
  const layoutKey = `${section?.id}|${prefs.format}|${prefs.font}|${prefs.size}|${prefs.leading}|${prefs.measure}|${prefs.paragraphs}|${prefs.indent}|${prefs.spacing}|${prefs.justify}|${prefs.device}|${book?.sceneBreak}|${section?.words}`;
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // A click on the page turns it (the outer thirds) or shows and hides the controls (the middle). Selecting words is not a click.
  const onPageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, select, input')) return;
    if (!window.getSelection()?.isCollapsed) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    if (x < 0.3) turn(-1);
    else if (x > 0.7) turn(1);
    else setChrome((shown) => !shown);
  };

  const exit = `/project/${project.id}/manuscript${section?.nodeId && section.kind === 'chapter' ? `/${section.nodeId}` : ''}`;

  return (
    <div className="reader" data-format={prefs.format} data-flow={look.flow} data-scheme={prefs.scheme} data-chrome={chrome || undefined} style={style}>
      <div className="reader-progress" role="progressbar" aria-label="Progress through the book" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      {chrome ? (
        <header className="reader-bar-top">
          <Link to={exit} className="reader-tool reader-exit" aria-label="Exit the reader preview">
            ← Exit preview
          </Link>
          <button type="button" className="reader-tool" aria-expanded={drawer === 'contents'} onClick={() => setDrawer(drawer === 'contents' ? null : 'contents')}>
            ☰ Contents
          </button>
          <span className="reader-where" role="status" aria-label="Where you are">
            <strong>{book?.title ?? project.title}</strong>
            {section && section.kind === 'chapter' ? ` · ${showsLabel(section) ? `${section.label}: ` : ''}${section.title}` : section ? ` · ${section.title}` : ''}
            <span className="reader-percent"> · {Math.round(progress * 100)}%</span>
          </span>
          <div className="reader-choices reader-formats" role="radiogroup" aria-label="Format">
            {FORMATS.map((format: Format) => (
              <button key={format} type="button" role="radio" aria-checked={prefs.format === format} className={prefs.format === format ? 'active' : ''} title={FORMAT_HINTS[format]} onClick={() => readerPrefs.set({ format })}>
                {FORMAT_LABELS[format]}
              </button>
            ))}
          </div>
          <button type="button" className="reader-tool" aria-expanded={drawer === 'appearance'} aria-label="Appearance" onClick={() => setDrawer(drawer === 'appearance' ? null : 'appearance')}>
            Aa
          </button>
          <button type="button" className="reader-tool" aria-label="Hide the controls" title="Hide the controls (Esc brings them back)" onClick={() => setChrome(false)}>
            ⤢
          </button>
        </header>
      ) : (
        <button type="button" className="reader-tool reader-unhide" aria-label="Show the controls" onClick={() => setChrome(true)}>
          ☰
        </button>
      )}

      <main className="reader-stage" aria-label="Reader preview">
        {!book || !section ? (
          book && book.sections.length === 0 ? <p className="nothing-yet reader-empty">There is nothing to read yet.</p> : null
        ) : prefs.format === 'serial' ? (
          <Serial book={book} index={index} target={target} onPlace={setAt} onJump={jump} />
        ) : look.flow === 'scroll' ? (
          <div className={prefs.format === 'ebook' ? 'device' : 'sheet sheet-long'}>
            <Scroller book={book} target={target} onPlace={setAt} onJump={jump} />
          </div>
        ) : (
          <div className="turner">
            <button type="button" className="reader-turn" aria-label="Previous page" disabled={index === 0 && pageInfo.page === 0} onClick={() => turn(-1)}>
              ‹
            </button>
            <div
              className={prefs.format === 'ebook' ? 'device' : 'sheet'}
              onClick={onPageClick}
              onTouchStart={(e) => (swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
              onTouchEnd={(e) => {
                const from = swipe.current;
                swipe.current = null;
                const dx = from ? e.changedTouches[0].clientX - from.x : 0;
                if (from && Math.abs(dx) > 50 && Math.abs(e.changedTouches[0].clientY - from.y) < Math.abs(dx)) turn(dx < 0 ? 1 : -1);
              }}
            >
              {prefs.format === 'novel' && section.kind !== 'title' && section.kind !== 'part' && (
                <p className="running-head" aria-hidden="true">
                  <span>{book.author || book.title}</span>
                  <span>{section.kind === 'chapter' ? section.title : book.title}</span>
                </p>
              )}
              <Pager ref={pager} layoutKey={layoutKey} fraction={target.at.id === section.id ? target.at.fraction : 0} key={`${section.id}-${target.key}`} onEdge={step} onPage={(fraction, page, pages) => {
                setPageInfo({ page, pages });
                setAt((was) => (was && was.id === section.id && was.fraction === fraction ? was : { id: section.id, fraction }));
              }}>
                <SectionView book={book} section={section} onJump={jump} />
              </Pager>
              <p className="folio" role="status" aria-label="Page">
                Page {pageInfo.page + 1} of {pageInfo.pages}
              </p>
            </div>
            <button type="button" className="reader-turn" aria-label="Next page" disabled={index === book.sections.length - 1 && pageInfo.page >= pageInfo.pages - 1} onClick={() => turn(1)}>
              ›
            </button>
          </div>
        )}
      </main>

      {drawer && <div className="reader-backdrop" onClick={() => setDrawer(null)} />}
      {drawer === 'contents' && book && <Contents book={book} index={index} progress={progress} furthest={furthest} onJump={jump} onClose={() => setDrawer(null)} />}
      {drawer === 'appearance' && <Appearance prefs={prefs} onClose={() => setDrawer(null)} />}
    </div>
  );
}
