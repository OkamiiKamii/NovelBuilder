// The page's quieter companions (FEATURES.md #108 atmosphere, #110 the chapter spine, and selecting a stretch of text for
// Rhythm and the other tools). Display only: none of it is stored or changes the text.

import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

import { freshParagraphs } from '../src/domain/desk/freshInk';

import { blocksOf } from './lenses';

// ------------------------------------------------------------------------------------------------- selecting text

/** Selects `start`–`end` in paragraph `block` (paragraphs and headings in reading order) and brings it into view. */
export function selectInBlock(editor: Editor, block: number, start: number, end: number): void {
  const b = blocksOf(editor.state.doc)[block];
  if (!b) return;
  const from = b.pos + start;
  const to = b.pos + end;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)).scrollIntoView());
  editor.view.focus();
}

// ---------------------------------------------------------------------------------------------------- atmosphere

export type Atmosphere = 'none' | 'rain' | 'snow' | 'fireflies' | 'candle' | 'stars';

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-hidden', 'true');
canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
document.body.prepend(canvas);
const ctx = canvas.getContext('2d')!;
let weather: Atmosphere = 'none';
let particles: { x: number; y: number; vx: number; vy: number; r: number; phase: number }[] = [];
let raf = 0;
let last = 0;
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();

function seed(kind: Atmosphere): void {
  const count = { none: 0, rain: 70, snow: 50, fireflies: 18, candle: 1, stars: 60 }[kind];
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    vx: kind === 'fireflies' ? (Math.random() - 0.5) * 0.4 : kind === 'snow' ? (Math.random() - 0.5) * 0.3 : -0.6,
    vy: kind === 'rain' ? 7 + Math.random() * 4 : kind === 'snow' ? 0.5 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.4,
    r: kind === 'stars' ? Math.random() * 1.4 + 0.3 : kind === 'snow' ? Math.random() * 2 + 1 : 1.5,
    phase: Math.random() * Math.PI * 2,
  }));
}

function draw(t: number): void {
  raf = requestAnimationFrame(draw);
  if (t - last < 33) return; // At most 30 frames a second: weather, not a game.
  last = t;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of particles) {
    if (!reduceMotion) {
      p.x += p.vx;
      p.y += p.vy;
      p.phase += 0.03;
      if (p.y > innerHeight + 10) p.y = -10;
      if (p.y < -10) p.y = innerHeight + 10;
      if (p.x < -10) p.x = innerWidth + 10;
      if (p.x > innerWidth + 10) p.x = -10;
    }
    switch (weather) {
      case 'rain':
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 1.5, p.y + 12);
        ctx.stroke();
        break;
      case 'snow':
        ctx.fillStyle = 'rgba(248, 250, 252, 0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'fireflies': {
        const a = 0.25 + 0.35 * Math.max(0, Math.sin(p.phase));
        ctx.fillStyle = `rgba(243, 182, 58, ${a})`;
        ctx.shadowColor = 'rgba(243, 182, 58, 0.8)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'candle': {
        const flicker = 0.1 + 0.03 * Math.sin(p.phase * 3) + 0.02 * Math.sin(p.phase * 7);
        const g = ctx.createRadialGradient(innerWidth / 2, innerHeight, 0, innerWidth / 2, innerHeight, innerHeight * 0.9);
        g.addColorStop(0, `rgba(243, 160, 58, ${flicker})`);
        g.addColorStop(1, 'rgba(243, 160, 58, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, innerWidth, innerHeight);
        break;
      }
      case 'stars': {
        const a = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(p.phase));
        ctx.fillStyle = `rgba(248, 250, 252, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
}

export function setAtmosphere(kind: Atmosphere): void {
  if (kind === weather) return;
  weather = kind;
  cancelAnimationFrame(raf);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  seed(kind);
  if (kind !== 'none') raf = requestAnimationFrame(draw);
}

// ------------------------------------------------------------------------------------------------ the chapter spine

/** A thin map of the chapter down the right edge: one mark per paragraph as long as it, headings in gold, and a lit
 * window for what is in view. Tap or drag it to go there. Shown for chapters of 12 paragraphs or more that are taller
 * than two screens. */
const spine = document.createElement('div');
spine.setAttribute('aria-hidden', 'true');
spine.style.cssText =
  'position:fixed;top:8px;bottom:8px;right:2px;width:16px;z-index:2;display:none;touch-action:none;';
const marks = document.createElement('div');
marks.style.cssText = 'position:absolute;inset:0;';
const windowBox = document.createElement('div');
windowBox.style.cssText =
  'position:absolute;left:0;right:0;border:1px solid rgba(243,182,58,0.7);border-radius:3px;background:rgba(243,182,58,0.12);';
spine.append(marks, windowBox);
document.body.append(spine);

let spineOn = true;
let spineEditor: Editor | null = null;

export function setSpine(on: boolean): void {
  spineOn = on;
  refreshSpine();
}

export function refreshSpine(editor?: Editor): void {
  if (editor) spineEditor = editor;
  const e = spineEditor;
  const docHeight = document.documentElement.scrollHeight;
  if (!e || !spineOn) {
    spine.style.display = 'none';
    return;
  }
  const blocks = [...e.view.dom.children] as HTMLElement[];
  const filled = blocks.filter((b) => (b.textContent ?? '').trim()).length;
  if (filled < 12 || docHeight < innerHeight * 2) {
    spine.style.display = 'none';
    return;
  }
  spine.style.display = 'block';
  const h = spine.clientHeight;
  marks.innerHTML = '';
  for (const b of blocks) {
    const text = (b.textContent ?? '').trim();
    if (!text) continue;
    const m = document.createElement('div');
    const top = (b.offsetTop / docHeight) * h;
    const width = Math.max(3, Math.min(14, text.length / 40));
    const heading = /^H[1-3]$/.test(b.tagName);
    m.style.cssText = `position:absolute;top:${top}px;right:1px;height:2px;width:${width}px;border-radius:1px;background:${
      heading ? '#F3B63A' : b.classList.contains('fresh-ink') ? '#38BDF8' : 'rgba(148,163,184,0.55)'
    };`;
    marks.append(m);
  }
  placeWindow();
}

function placeWindow(): void {
  const docHeight = document.documentElement.scrollHeight;
  const h = spine.clientHeight;
  windowBox.style.top = `${(scrollY / docHeight) * h}px`;
  windowBox.style.height = `${Math.max(12, (innerHeight / docHeight) * h)}px`;
}
addEventListener('scroll', () => spine.style.display === 'block' && placeWindow(), { passive: true });

function jump(clientY: number): void {
  const rect = spine.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  scrollTo({ top: f * document.documentElement.scrollHeight - innerHeight / 2 });
}
spine.addEventListener('pointerdown', (ev) => {
  spine.setPointerCapture(ev.pointerId);
  jump(ev.clientY);
});
spine.addEventListener('pointermove', (ev) => {
  if (spine.hasPointerCapture(ev.pointerId)) jump(ev.clientY);
});

// ------------------------------------------------------------------------------------------------- today's ink

/** TODAY'S INK (#110): a stroke in the margin beside every paragraph written or changed today, read against the chapter
 * as it stood when the day began (`before`; null when that cannot be known: then nothing is marked). Worked out again a
 * moment after each pause in typing, so a new paragraph inks up as it is written. */
type InkState = { before: string[] | null; on: boolean; decorations: DecorationSet };
export const inkKey = new PluginKey<InkState>('scriptorInk');

function inkDecorations(doc: PMNode, before: string[] | null, on: boolean): DecorationSet {
  if (!on || before === null) return DecorationSet.empty;
  const blocks: { from: number; to: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      blocks.push({ from: pos, to: pos + node.nodeSize, text: node.textBetween(0, node.content.size, '', '\n') });
      return false;
    }
    return true;
  });
  const fresh = freshParagraphs(
    blocks.map((b) => b.text),
    before,
  );
  return DecorationSet.create(
    doc,
    [...fresh].map((i) => Decoration.node(blocks[i].from, blocks[i].to, { class: 'fresh-ink' })),
  );
}

export function inkPlugin(): Plugin<InkState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Plugin<InkState>({
    key: inkKey,
    state: {
      init: (): InkState => ({ before: null, on: false, decorations: DecorationSet.empty }),
      apply(tr, value, _old, state) {
        const meta = tr.getMeta(inkKey) as { before?: string[] | null; on?: boolean; refresh?: boolean } | undefined;
        if (meta) {
          const before = meta.before !== undefined ? meta.before : value.before;
          const on = meta.on ?? value.on;
          return { before, on, decorations: inkDecorations(state.doc, before, on) };
        }
        return tr.docChanged ? { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
      },
    },
    view: (view) => ({
      update(v, prev) {
        if (v.state.doc === prev.doc) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          view.dispatch(view.state.tr.setMeta(inkKey, { refresh: true }).setMeta('addToHistory', false));
          refreshSpine();
        }, 350);
      },
      destroy() {
        if (timer) clearTimeout(timer);
      },
    }),
    props: { decorations: (state) => inkKey.getState(state)?.decorations },
  });
}

// ------------------------------------------------------------------------------------------------- the chapter's end

export type ChapterEndInfo = {
  kicker: string;
  title: string;
  note: string;
  button: string;
  author: string;
  /** Under the last line: the note left for next time, or the offer to leave one (#116). */
  slip: { kind: 'pinned'; text: string } | { kind: 'offer' } | null;
};

export type ChapterEndAction = 'next' | 'note' | 'noteDone';

/** CHAPTER END (#115): below the last line, the printer's end mark, the author's name at the end of the book, and what
 * comes next with the button to go there. */
const end = document.createElement('section');
end.className = 'chapter-end';
end.style.display = 'none';
let onEndTap: (action: ChapterEndAction) => void = () => {};

export function setChapterEnd(info: ChapterEndInfo | null, tap: (action: ChapterEndAction) => void): void {
  onEndTap = tap;
  if (!info) {
    end.style.display = 'none';
    return;
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const slip =
    info.slip?.kind === 'pinned'
      ? `<div class="end-slip"><div class="slip-label">NEXT TIME</div><div class="slip-text">${esc(info.slip.text)}</div><div class="slip-buttons"><button type="button" data-act="note">Change</button><button type="button" data-act="noteDone">Done with it</button></div></div>`
      : info.slip?.kind === 'offer'
        ? `<div class="end-slip offer"><button type="button" data-act="note">Leave a note for next time</button></div>`
        : '';
  end.innerHTML = `${slip}<div class="end-mark"><span></span><b>◆ ◆ ◆</b><span></span></div>${
    info.author ? `<div class="end-author">${esc(info.author)}</div>` : ''
  }<div class="end-kicker">${esc(info.kicker)}</div><div class="end-title">${esc(info.title)}</div>${
    info.note ? `<div class="end-note">${esc(info.note)}</div>` : ''
  }<button type="button" class="end-button" data-act="next">${esc(info.button)}</button>`;
  for (const b of end.querySelectorAll('button')) {
    b.addEventListener('click', () => onEndTap(b.dataset.act as ChapterEndAction));
  }
  end.style.display = 'block';
}

/** Puts the end after the editor (once the editor is on the page). */
export function placeChapterEnd(editorElement: HTMLElement): void {
  editorElement.after(end);
}
