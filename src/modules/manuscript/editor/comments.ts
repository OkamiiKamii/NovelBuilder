import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Where a conversation about a stretch of text was started: the words, the paragraph they were in, and how far into it. */
export interface TextAnchor {
  threadId: string;
  quote: string;
  block: number;
  offset: number;
  resolved: boolean;
}

interface State {
  anchors: TextAnchor[];
  decorations: DecorationSet;
}

const key = new PluginKey<State>('comments');

const blocksOf = (doc: PMNode): { pos: number; text: string }[] => {
  const blocks: { pos: number; text: string }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => (text += child.isText ? child.text : '￼'.repeat(child.nodeSize)));
    blocks.push({ pos, text });
    return false;
  });
  return blocks;
};

/**
 * Finds the commented words in the text as it is now. The paragraph they
 * were in is tried first (at the same place, then anywhere in it), then the
 * rest of the chapter; if the words themselves have been rewritten the
 * conversation stays in the list but nothing is marked in the text.
 */
export function locateAnchor(doc: PMNode, anchor: Pick<TextAnchor, 'quote' | 'block' | 'offset'>): { from: number; to: number } | null {
  if (!anchor.quote) return null;
  const blocks = blocksOf(doc);
  const at = (index: number, from: number): { from: number; to: number } | null => {
    const block = blocks[index];
    if (!block) return null;
    const found = block.text.startsWith(anchor.quote, from) ? from : block.text.indexOf(anchor.quote);
    return found < 0 ? null : { from: block.pos + 1 + found, to: block.pos + 1 + found + anchor.quote.length };
  };
  const here = at(anchor.block, anchor.offset);
  if (here) return here;
  for (let index = 0; index < blocks.length; index++) {
    const elsewhere = index === anchor.block ? null : at(index, 0);
    if (elsewhere) return elsewhere;
  }
  return null;
}

/** The current selection as an anchor: the selected words, kept to the paragraph the selection starts in. Null when nothing is selected. */
export function anchorFromSelection(editor: Editor): Pick<TextAnchor, 'quote' | 'block' | 'offset'> | null {
  let { from, to } = editor.state.selection;
  if (from === to) {
    // Text that cannot be edited can still be selected, but only the browser knows about it.
    const picked = typeof window === 'undefined' ? null : window.getSelection();
    if (!picked || picked.isCollapsed || !picked.rangeCount || !editor.view.dom.contains(picked.anchorNode) || !editor.view.dom.contains(picked.focusNode)) return null;
    const range = picked.getRangeAt(0);
    try {
      [from, to] = [editor.view.posAtDOM(range.startContainer, range.startOffset), editor.view.posAtDOM(range.endContainer, range.endOffset)];
    } catch {
      return null;
    }
    if (from >= to) return null;
  }
  const blocks = blocksOf(editor.state.doc);
  const index = blocks.findIndex((block) => from >= block.pos + 1 && from <= block.pos + 1 + block.text.length);
  if (index < 0) return null;
  const start = from - blocks[index].pos - 1;
  const found = quoteIn(blocks[index].text, start, to - blocks[index].pos - 1);
  return found ? { ...found, block: index } : null;
}

/**
 * The selected words of a paragraph, without the spaces around them.
 * Double-clicking a word on Windows also selects the space after it; the
 * conversation is about the word. Null when only spaces were selected.
 */
export function quoteIn(text: string, start: number, end: number): { quote: string; offset: number } | null {
  const raw = text.slice(start, Math.min(end, text.length));
  const quote = raw.trim();
  return quote ? { quote, offset: start + raw.length - raw.trimStart().length } : null;
}

const build = (doc: PMNode, anchors: TextAnchor[]): DecorationSet =>
  DecorationSet.create(
    doc,
    anchors.flatMap((anchor) => {
      const range = locateAnchor(doc, anchor);
      return range ? [Decoration.inline(range.from, range.to, { class: anchor.resolved ? 'cmt cmt-resolved' : 'cmt', 'data-thread': anchor.threadId })] : [];
    }),
  );

/** Marks commented passages in the text. Like every overlay here it only draws: the document is never changed by it. */
export const Comments = Extension.create({
  name: 'comments',
  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key,
        state: {
          init: (_, state) => ({ anchors: [], decorations: build(state.doc, []) }),
          apply(tr, prev) {
            const anchors = tr.getMeta(key) as TextAnchor[] | undefined;
            if (!anchors && !tr.docChanged) return prev;
            const next = anchors ?? prev.anchors;
            return { anchors: next, decorations: build(tr.doc, next) };
          },
        },
        props: { decorations: (state) => key.getState(state)?.decorations },
      }),
    ];
  },
});

export const setCommentAnchors = (editor: Editor, anchors: TextAnchor[]): void => {
  editor.view.dispatch(editor.state.tr.setMeta(key, anchors));
};
