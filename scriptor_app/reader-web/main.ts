// THE READER'S PAGE (FEATURES.md #126–#130): the book, already set as HTML by the app (src/reader/bookHtml.ts), shown
// a page at a time (CSS columns, measured with this device's own fonts), as one scrolling column, or as a web serial
// (one chapter, scrolling). It reads only: nothing here is stored, and it changes nothing in the novel. It tells the
// app where the reader is; the app keeps the bookmark.
//
// Built into src/reader/readerPage.generated.ts by tool/build-reader.mjs (`npm run build:pages`).

type Section = { id: string; html: string };
type Mode = 'paged' | 'scroll' | 'serial';

type Incoming =
  | { type: 'book'; sections: Section[]; mode: Mode; section: number; fraction: number }
  | { type: 'style'; css: string }
  | { type: 'go'; section: number; fraction?: number }
  | { type: 'turn'; delta: number };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    scriptorReader?: { receive(message: string): void };
  }
}

function send(message: object): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

const root = document.getElementById('book')!;
let sections: Section[] = [];
let mode: Mode = 'paged';
let at = 0; // The section shown (paged, serial) or reached (scroll).
let page = 0;
let pages = 1;

// ------------------------------------------------------------------------------------------------------ paged

/** One section in columns as wide as the screen: its pages side by side, one shown at a time. */
function showPaged(section: number, fraction: number): void {
  at = Math.max(0, Math.min(sections.length - 1, section));
  root.className = 'paged';
  root.innerHTML = `<div class="columns" id="columns">${sections[at]?.html ?? ''}</div>`;
  measure();
  page = pages <= 1 ? 0 : Math.round(fraction * (pages - 1));
  place();
}

function measure(): void {
  const columns = document.getElementById('columns');
  if (!columns) return;
  const width = window.innerWidth;
  pages = Math.max(1, Math.round(columns.scrollWidth / width));
}

function place(): void {
  const columns = document.getElementById('columns');
  if (columns) columns.style.transform = `translateX(${-page * window.innerWidth}px)`;
  report();
}

function report(): void {
  send({ type: 'place', section: at, page, pages, fraction: pages <= 1 ? 0 : page / (pages - 1) });
}

/** A page on, or back: into the next or previous section at its ends. */
function turn(delta: number): void {
  if (mode === 'paged') {
    const next = page + delta;
    if (next >= 0 && next < pages) {
      page = next;
      place();
    } else if (delta > 0 && at < sections.length - 1) {
      showPaged(at + 1, 0);
    } else if (delta < 0 && at > 0) {
      showPaged(at - 1, 1);
    }
  } else {
    window.scrollBy({ top: delta * window.innerHeight * 0.9, behavior: 'smooth' });
  }
}

// ------------------------------------------------------------------------------------------------------ scroll

/** Every section in one column. */
function showScroll(section: number, fraction: number): void {
  root.className = 'scroll';
  root.innerHTML = sections.map((s, i) => `<section class="section" data-i="${i}">${s.html}</section>`).join('');
  goScroll(section, fraction);
}

function goScroll(section: number, fraction: number): void {
  const el = root.querySelector<HTMLElement>(`section[data-i="${section}"]`);
  if (!el) return;
  window.scrollTo({ top: el.offsetTop + fraction * Math.max(0, el.offsetHeight - window.innerHeight * 0.5) });
  readScroll();
}

let scrollTimer: ReturnType<typeof setTimeout> | null = null;
function readScroll(): void {
  const els = [...root.querySelectorAll<HTMLElement>('section.section')];
  const y = window.scrollY + window.innerHeight * 0.3;
  let i = 0;
  for (let j = 0; j < els.length; j++) if (els[j].offsetTop <= y) i = j;
  const el = els[i];
  if (!el) return;
  at = i;
  const span = Math.max(1, el.offsetHeight - window.innerHeight * 0.5);
  const fraction = Math.max(0, Math.min(1, (window.scrollY - el.offsetTop) / span));
  send({ type: 'place', section: i, page: 0, pages: 1, fraction });
}

// ------------------------------------------------------------------------------------------------------ serial

/** One chapter, scrolling, with the notes and the links either side set by the app. */
function showSerial(section: number, fraction: number): void {
  at = Math.max(0, Math.min(sections.length - 1, section));
  root.className = 'serial';
  root.innerHTML = sections[at]?.html ?? '';
  const span = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: fraction * span });
  readSerial();
}

function readSerial(): void {
  const span = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  send({ type: 'place', section: at, page: 0, pages: 1, fraction: Math.max(0, Math.min(1, window.scrollY / span)) });
}

// ------------------------------------------------------------------------------------------------------ input

addEventListener(
  'scroll',
  () => {
    if (mode === 'paged') return;
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(mode === 'scroll' ? readScroll : readSerial, 120);
  },
  { passive: true },
);

// Pages turn with a swipe, or a tap at either edge; a tap in the middle shows or hides the app's bars.
let touch: { x: number; y: number; t: number } | null = null;
addEventListener(
  'touchstart',
  (e) => {
    const t = e.touches[0];
    touch = { x: t.clientX, y: t.clientY, t: Date.now() };
  },
  { passive: true },
);
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x;
  const dy = t.clientY - touch.y;
  const quick = Date.now() - touch.t < 600;
  const start = touch;
  touch = null;
  const target = e.target as HTMLElement | null;
  if (target?.closest('[data-jump]')) return; // A link in the book: handled by click.
  if (mode === 'paged' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && quick) {
    turn(dx < 0 ? 1 : -1);
    return;
  }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
    const w = window.innerWidth;
    if (mode === 'paged' && start.x < w * 0.25) turn(-1);
    else if (mode === 'paged' && start.x > w * 0.75) turn(1);
    else send({ type: 'tap' });
  }
});

// Links in the book (the contents page, the serial's chapters either side) go to their section.
document.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-jump]');
  if (!link) return;
  e.preventDefault();
  const i = Number(link.dataset.jump);
  send({ type: 'jump', section: i });
});

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    turn(1);
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    turn(-1);
  }
});

// A new size (rotation, the frame on a tablet): the pages are measured again, at the same place.
addEventListener('resize', () => {
  if (mode !== 'paged') return;
  const fraction = pages <= 1 ? 0 : page / (pages - 1);
  measure();
  page = pages <= 1 ? 0 : Math.round(fraction * (pages - 1));
  place();
});

// ------------------------------------------------------------------------------------------------------ messages

function show(section: number, fraction: number): void {
  if (mode === 'paged') showPaged(section, fraction);
  else if (mode === 'scroll') showScroll(section, fraction);
  else showSerial(section, fraction);
}

function receive(raw: string): void {
  let m: Incoming;
  try {
    m = JSON.parse(raw) as Incoming;
  } catch {
    return;
  }
  try {
    switch (m.type) {
      case 'style': {
        document.getElementById('dynamic-style')!.textContent = m.css;
        if (sections.length) {
          // The look changed: measured again, at the same place.
          const fraction = mode === 'paged' ? (pages <= 1 ? 0 : page / (pages - 1)) : 0;
          if (mode === 'paged') show(at, fraction);
        }
        break;
      }
      case 'book':
        sections = m.sections;
        mode = m.mode;
        // Fonts first, so pages are measured with the face they are drawn in.
        void document.fonts.ready.then(() => show(m.section, m.fraction));
        break;
      case 'go':
        if (mode === 'scroll') goScroll(m.section, m.fraction ?? 0);
        else show(m.section, m.fraction ?? 0);
        break;
      case 'turn':
        turn(m.delta);
        break;
    }
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

window.scriptorReader = { receive };
send({ type: 'ready' });

export {};
