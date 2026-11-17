// THE LENSES: marks laid over the text, never stored and never changing it (FEATURES.md #103 red pencil, #104 voices,
// #111 gaps, #98 scene breaks). They are worked out here, in the page, from the same text checks the app's tests run
// (src/domain/text/), a moment after typing stops; the counts go to the app for its bars.

import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

import { isSceneBreak } from '../src/domain/text/bookSetting';
import { gapsIn } from '../src/domain/text/gaps';
import { type PencilMark, redPencil } from '../src/domain/text/redPencil';
import { voicesOf } from '../src/domain/text/voices';

export type Lens = 'none' | 'pencil' | 'voices';

export type LensSummary = {
  lens: Lens;
  pencil: { echo: number; long: number; filler: number; leanedOn: { word: string; count: number }[] } | null;
  voices: { dialoguePercent: number; speakers: { speaker: string | null; words: number; lines: number }[] } | null;
};

type Block = { pos: number; text: string };

/** The paragraphs and headings in reading order with where each starts, as `docBlocks` reads a document: a hard line
 * break is a "\n", one position wide, so an offset in the text is the same offset in the document. */
export function blocksOf(doc: PMNode): Block[] {
  const out: Block[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      out.push({ pos: pos + 1, text: node.textBetween(0, node.content.size, '', '\n') });
      return false;
    }
    return true;
  });
  return out;
}

type LensState = {
  lens: Lens;
  names: Record<string, string[]>;
  colours: Record<string, string>;
  decorations: DecorationSet;
  /** Where each mark is, for "go to the next one": by pencil kind, or by speaker id ('' for nobody named). */
  places: Map<string, { from: number; to: number }[]>;
};

export const lensKey = new PluginKey<LensState>('scriptorLens');

function compute(state: EditorState, lens: Lens, names: Record<string, string[]>, colours: Record<string, string>) {
  const blocks = blocksOf(state.doc);
  const decorations: Decoration[] = [];
  const places = new Map<string, { from: number; to: number }[]>();
  const place = (key: string, from: number, to: number) => {
    const list = places.get(key) ?? [];
    list.push({ from, to });
    places.set(key, list);
  };
  let summary: LensSummary = { lens, pencil: null, voices: null };

  // Gaps and scene breaks are always shown (display only).
  for (const b of blocks) {
    for (const g of gapsIn(b.text)) decorations.push(Decoration.inline(b.pos + g.start, b.pos + g.end, { class: 'gap' }));
    if (isSceneBreak(b.text)) decorations.push(Decoration.node(b.pos - 1, b.pos - 1 + b.text.length + 2, { class: 'scene-break' }));
  }

  if (lens === 'pencil') {
    const report = redPencil(blocks.map((b) => b.text));
    for (const f of report.findings) {
      const from = blocks[f.block].pos + f.start;
      const to = blocks[f.block].pos + f.end;
      decorations.push(Decoration.inline(from, to, { class: `pencil-${f.kind}` }));
      place(f.kind, from, to);
    }
    const count = (k: PencilMark) => report.findings.filter((f) => f.kind === k).length;
    summary = { ...summary, pencil: { echo: count('echo'), long: count('long'), filler: count('filler'), leanedOn: report.leanedOn } };
  } else if (lens === 'voices') {
    const report = voicesOf(blocks.map((b) => b.text), names);
    for (const l of report.lines) {
      const from = blocks[l.block].pos + l.start;
      const to = blocks[l.block].pos + l.end;
      const colour = l.speaker ? colours[l.speaker] : null;
      decorations.push(
        Decoration.inline(from, to, colour ? { class: 'voice-line', style: `color: ${colour}` } : { class: 'voice-line voice-unknown' }),
      );
      place(l.speaker ?? '', from, to);
    }
    summary = {
      ...summary,
      voices: {
        dialoguePercent: report.chapterWords ? Math.round((report.dialogueWords / report.chapterWords) * 100) : 0,
        speakers: report.speakers,
      },
    };
  }
  return { decorations: DecorationSet.create(state.doc, decorations), places, summary };
}

/** The lens plugin. `onSummary` hears the counts each time they are worked out. */
export function lensPlugin(onSummary: (s: LensSummary) => void): Plugin<LensState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Plugin<LensState>({
    key: lensKey,
    state: {
      init: (_, state) => {
        const c = compute(state, 'none', {}, {});
        return { lens: 'none', names: {}, colours: {}, decorations: c.decorations, places: c.places };
      },
      apply: (tr, value, _old, state) => {
        const meta = tr.getMeta(lensKey) as Partial<LensState> | 'recompute' | undefined;
        if (meta) {
          const next = { ...value, ...(meta === 'recompute' ? {} : meta) };
          const c = compute(state, next.lens, next.names, next.colours);
          setTimeout(() => onSummary(c.summary), 0);
          return { ...next, decorations: c.decorations, places: c.places };
        }
        // While typing, the marks move with the text; they are worked out again once typing stops.
        return tr.docChanged ? { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
      },
    },
    view: () => ({
      update: (view: EditorView, prev: EditorState) => {
        if (view.state.doc === prev.doc) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => view.dispatch(view.state.tr.setMeta(lensKey, 'recompute').setMeta('addToHistory', false)), 400);
      },
    }),
    props: {
      decorations: (state) => lensKey.getState(state)!.decorations,
      attributes: (state): Record<string, string> => {
        const lens = lensKey.getState(state)!.lens;
        return lens === 'voices' ? { class: 'lens-voices' } : lens === 'pencil' ? { class: 'lens-pencil' } : {};
      },
    },
  });
}

/** Selects the next mark of a kind (a pencil mark, or a speaker's line) after the caret, round to the first. */
export function selectNext(view: EditorView, key: string): void {
  const places = lensKey.getState(view.state)?.places.get(key) ?? [];
  if (places.length === 0) return;
  const at = view.state.selection.to;
  const next = places.find((p) => p.from >= at) ?? places[0];
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, next.from, next.to)).scrollIntoView());
}
