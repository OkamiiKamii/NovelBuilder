// THE CHAPTER EDITOR PAGE: TipTap (the original web app's editor, with its schema) running inside a WebView in Scriptor.
// Bundled into the app by tool/build-editor.mjs; it never loads anything from a network.
//
// Scriptor sends it messages (window.scriptor.receive) and it answers with window.ReactNativeWebView.postMessage. The
// app keeps everything else: saving, history, crash copies, counts. This page only edits.
//
// A chapter opens for editing only when the editor gives back the same document it was given (allowing only defaults
// ProseMirror fills in: src/domain/prose.ts normalizeProse). Anything else opens read-only, with the reason, so no
// formatting is ever lost by opening and saving.

import { Editor, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import { Node as PMNode, Slice, Fragment } from '@tiptap/pm/model';

import { manuscriptExtensions } from './extensions';
import { jsonEquals, type JsonMap } from '../src/domain/json';
import { normalizeProse } from '../src/domain/prose';

type Outgoing =
  | { type: 'ready' }
  | { type: 'loaded'; editable: boolean; reason: string | null }
  | { type: 'change'; doc: JSONContent }
  | { type: 'state'; state: EditorUiState }
  | { type: 'find'; count: number; index: number }
  | { type: 'split'; ok: boolean; head?: JSONContent; tail?: JSONContent; reason?: string }
  | { type: 'error'; message: string };

export type EditorUiState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  block: 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote';
  bullet: boolean;
  ordered: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  canUndo: boolean;
  canRedo: boolean;
  selectionEmpty: boolean;
  /** The entry the caret's words are linked to. */
  linkedEntry: string | null;
  focused: boolean;
};

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    scriptor: { receive(message: string): void };
  }
}

function send(message: Outgoing): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

// ------------------------------------------------------------------------------------------------- find and replace

type FindState = { query: string; matchCase: boolean; wholeWords: boolean; index: number };
const findKey = new PluginKey<{ ranges: { from: number; to: number }[]; index: number }>('scriptorFind');
let find: FindState = { query: '', matchCase: false, wholeWords: false, index: 0 };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every match of the search in the document, as positions, block by block (a match never crosses a paragraph). */
function findRanges(doc: PMNode, f: FindState): { from: number; to: number }[] {
  if (!f.query) return [];
  const body = escapeRegExp(f.query);
  const re = new RegExp(f.wholeWords ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body, f.matchCase ? 'gu' : 'giu');
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // The block's text with a map from each character to its document position.
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) {
          text += child.text![i];
          at.push(pos + 1 + offset + i);
        }
      } else {
        text += '￼';
        at.push(pos + 1 + offset);
      }
    });
    for (const m of text.matchAll(re)) {
      if (m[0].length === 0) continue;
      const start = m.index!;
      ranges.push({ from: at[start], to: at[start + m[0].length - 1] + 1 });
    }
    return false;
  });
  return ranges;
}

const FindHighlight = Extension.create({
  name: 'scriptorFind',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init: () => ({ ranges: [], index: 0 }),
          apply: (tr, value) => {
            const meta = tr.getMeta(findKey);
            if (meta) return meta;
            if (!tr.docChanged || !find.query) return value;
            return { ranges: findRanges(tr.doc, find), index: value.index };
          },
        },
        props: {
          decorations(state) {
            const { ranges, index } = findKey.getState(state)!;
            if (ranges.length === 0) return DecorationSet.empty;
            return DecorationSet.create(
              state.doc,
              ranges.map((r, i) => Decoration.inline(r.from, r.to, { class: i === index ? 'find-current' : 'find-match' })),
            );
          },
        },
      }),
    ];
  },
});

// ------------------------------------------------------------------------------------------------------- the editor

/** Plain-text paste that keeps the text exactly: one paragraph per line, blank lines kept as empty paragraphs, runs of
 * spaces and tabs untouched (as the original editor's plainTextParser). */
function plainTextParser(text: string, $context: { marks(): readonly import('@tiptap/pm/model').Mark[] }): Slice {
  const schema = editor.schema;
  const marks = $context.marks();
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line, marks) : null));
  return new Slice(Fragment.from(paragraphs), 1, 1);
}

const root = document.getElementById('editor')!;
let applying = false;
let changeTimer: ReturnType<typeof setTimeout> | null = null;
let focused = false;

const editor = new Editor({
  element: root,
  extensions: [...manuscriptExtensions(), FindHighlight],
  // NON-INVASIVE EDITING RULE: no smart quotes, no Markdown shortcuts, nothing that changes text on its own.
  enableInputRules: false,
  enablePasteRules: false,
  content: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] },
  editorProps: {
    clipboardTextParser: (text, $context) => plainTextParser(text, $context),
    attributes: { spellcheck: 'true', autocapitalize: 'sentences', autocorrect: 'on' },
  },
  onUpdate: ({ transaction }) => {
    if (applying || !transaction.docChanged) return;
    // The document as JSON, at most every 150 ms while typing: the app saves it, and keeps crash copies.
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      changeTimer = null;
      send({ type: 'change', doc: editor.getJSON() });
    }, 150);
  },
  onSelectionUpdate: () => sendState(),
  onTransaction: () => sendState(),
  onFocus: () => {
    focused = true;
    sendState();
  },
  onBlur: () => {
    focused = false;
    flushChange();
    sendState();
  },
});

function flushChange(): void {
  if (changeTimer) {
    clearTimeout(changeTimer);
    changeTimer = null;
    send({ type: 'change', doc: editor.getJSON() });
  }
}

let lastState = '';
function sendState(): void {
  const e = editor;
  const block: EditorUiState['block'] = e.isActive('heading', { level: 1 })
    ? 'h1'
    : e.isActive('heading', { level: 2 })
      ? 'h2'
      : e.isActive('heading', { level: 3 })
        ? 'h3'
        : e.isActive('blockquote')
          ? 'quote'
          : 'paragraph';
  const align = (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left';
  const link = e.getAttributes('entityLink')['entryId'];
  const state: EditorUiState = {
    bold: e.isActive('bold'),
    italic: e.isActive('italic'),
    underline: e.isActive('underline'),
    strike: e.isActive('strike'),
    block,
    bullet: e.isActive('bulletList'),
    ordered: e.isActive('orderedList'),
    align,
    canUndo: e.can().undo(),
    canRedo: e.can().redo(),
    selectionEmpty: e.state.selection.empty,
    linkedEntry: typeof link === 'string' ? link : null,
    focused,
  };
  const key = JSON.stringify(state);
  if (key === lastState) return;
  lastState = key;
  send({ type: 'state', state });
}

// --------------------------------------------------------------------------------------------------- loading a text

function load(doc: JsonMap | null, readOnlyReason: string | null): void {
  const stored = doc ?? { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] };
  let reason = readOnlyReason;
  applying = true;
  try {
    let node: PMNode | null = null;
    try {
      node = PMNode.fromJSON(editor.schema, stored);
    } catch (e) {
      reason ??= `This chapter has formatting this editor does not know (${e instanceof Error ? e.message : String(e)}).`;
    }
    if (node && !reason && !jsonEquals(normalizeProse(node.toJSON()), normalizeProse(stored))) {
      reason = 'This chapter has formatting the editor cannot reproduce exactly yet.';
    }
    if (node) {
      editor.commands.setContent(node.toJSON(), { emitUpdate: false });
    } else {
      // Shown as plain paragraphs so it can still be read; never saved from here.
      editor.commands.setContent(plainCopy(stored), { emitUpdate: false });
    }
    // A fresh history: undo never goes back into the previous chapter.
    const { state } = editor.view;
    editor.view.updateState(
      (state.constructor as typeof import('@tiptap/pm/state').EditorState).create({
        doc: state.doc,
        plugins: state.plugins,
        selection: TextSelection.atStart(state.doc),
      }),
    );
    editor.setEditable(reason === null);
  } finally {
    applying = false;
  }
  send({ type: 'loaded', editable: reason === null, reason });
  sendState();
}

/** The words of a document the schema cannot read, as plain paragraphs. */
function plainCopy(doc: unknown): JSONContent {
  const paragraphs: JSONContent[] = [];
  const walk = (n: unknown): string => {
    if (!n || typeof n !== 'object') return '';
    const node = n as { type?: string; text?: string; content?: unknown[] };
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    return (node.content ?? []).map(walk).join('');
  };
  const blocks = (n: unknown): void => {
    const node = n as { type?: string; content?: unknown[] };
    if (node?.type === 'paragraph' || node?.type === 'heading') {
      const text = walk(node);
      paragraphs.push({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
    } else (node?.content ?? []).forEach(blocks);
  };
  blocks(doc);
  return { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
}

// ------------------------------------------------------------------------------------------------------- commands

function runFind(next: Partial<FindState>, select = true): void {
  find = { ...find, ...next };
  const ranges = findRanges(editor.state.doc, find);
  const index = ranges.length === 0 ? 0 : ((find.index % ranges.length) + ranges.length) % ranges.length;
  find.index = index;
  const tr = editor.state.tr.setMeta(findKey, { ranges, index }).setMeta('addToHistory', false);
  if (select && ranges[index]) {
    tr.setSelection(TextSelection.create(tr.doc, ranges[index].from, ranges[index].to));
    tr.scrollIntoView();
  }
  editor.view.dispatch(tr);
  send({ type: 'find', count: ranges.length, index });
}

function replaceCurrent(withText: string): void {
  const { ranges, index } = findKey.getState(editor.state)!;
  const r = ranges[index];
  if (!r) return;
  // Inserted with the formatting of the match's first letter, as the Flutter app does.
  editor.view.dispatch(editor.state.tr.insertText(withText, r.from, r.to));
  runFind({ index });
}

function replaceAll(withText: string): number {
  const { ranges } = findKey.getState(editor.state)!;
  if (ranges.length === 0) return 0;
  // From the end, so earlier positions stay right. One step for Undo.
  let tr = editor.state.tr;
  for (const r of [...ranges].reverse()) tr = tr.insertText(withText, r.from, r.to);
  editor.view.dispatch(tr);
  runFind({ index: 0 }, false);
  return ranges.length;
}

/** Everything from the caret's paragraph on goes to a new chapter; refused in the first paragraph. */
function splitAtCaret(): void {
  const { state } = editor;
  const $from = state.selection.$from;
  const blockIndex = $from.index(0);
  if (blockIndex === 0) {
    send({ type: 'split', ok: false, reason: 'Put the caret in a later paragraph: everything from it on becomes the new part.' });
    return;
  }
  const doc = editor.getJSON();
  const content = doc.content ?? [];
  send({
    type: 'split',
    ok: true,
    head: { ...doc, content: content.slice(0, blockIndex) },
    tail: { ...doc, content: content.slice(blockIndex) },
  });
}

type Incoming =
  | { type: 'load'; doc: JsonMap | null; readOnlyReason?: string | null }
  | { type: 'style'; css: string }
  | { type: 'command'; name: string; value?: string }
  | { type: 'link'; entryId: string }
  | { type: 'unlink' }
  | { type: 'find'; query: string; matchCase: boolean; wholeWords: boolean; index?: number }
  | { type: 'findStep'; delta: number }
  | { type: 'clearFind' }
  | { type: 'replace'; with: string }
  | { type: 'replaceAll'; with: string }
  | { type: 'split' }
  | { type: 'flush' }
  | { type: 'focus'; end?: boolean }
  | { type: 'blur' }
  | { type: 'selectText'; paragraph: number; text: string };

function command(name: string, value?: string): void {
  const c = editor.chain().focus();
  switch (name) {
    case 'bold':
      c.toggleBold().run();
      break;
    case 'italic':
      c.toggleItalic().run();
      break;
    case 'underline':
      c.toggleUnderline().run();
      break;
    case 'strike':
      c.toggleStrike().run();
      break;
    case 'undo':
      c.undo().run();
      break;
    case 'redo':
      c.redo().run();
      break;
    case 'paragraph':
      c.setParagraph().run();
      break;
    case 'h1':
    case 'h2':
    case 'h3':
      c.setHeading({ level: Number(name[1]) as 1 | 2 | 3 }).run();
      break;
    case 'quote':
      c.toggleBlockquote().run();
      break;
    case 'bullet':
      c.toggleBulletList().run();
      break;
    case 'ordered':
      c.toggleOrderedList().run();
      break;
    case 'align':
      if (value === 'left') c.unsetTextAlign().run();
      else c.setTextAlign(value ?? 'left').run();
      break;
  }
}

function receive(raw: string): void {
  let m: Incoming;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    switch (m.type) {
      case 'load':
        load(m.doc, m.readOnlyReason ?? null);
        break;
      case 'style':
        document.getElementById('dynamic-style')!.textContent = m.css;
        break;
      case 'command':
        command(m.name, m.value);
        break;
      case 'link':
        if (!editor.state.selection.empty) editor.chain().focus().setMark('entityLink', { entryId: m.entryId }).run();
        break;
      case 'unlink':
        editor.chain().focus().extendMarkRange('entityLink').unsetMark('entityLink').run();
        break;
      case 'find':
        runFind({ query: m.query, matchCase: m.matchCase, wholeWords: m.wholeWords, index: m.index ?? 0 });
        break;
      case 'findStep':
        runFind({ index: find.index + m.delta });
        break;
      case 'clearFind':
        find = { ...find, query: '' };
        editor.view.dispatch(editor.state.tr.setMeta(findKey, { ranges: [], index: 0 }).setMeta('addToHistory', false));
        break;
      case 'replace':
        replaceCurrent(m.with);
        break;
      case 'replaceAll':
        replaceAll(m.with);
        break;
      case 'split':
        splitAtCaret();
        break;
      case 'flush':
        flushChange();
        break;
      case 'focus':
        if (m.end) editor.commands.focus('end');
        else editor.commands.focus();
        break;
      case 'blur':
        editor.commands.blur();
        break;
      case 'selectText':
        runFind({ query: m.text, matchCase: true, wholeWords: false, index: 0 });
        break;
    }
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

// When the page gets shorter (the keyboard coming up), the line being typed stays in sight.
window.addEventListener('resize', () => {
  if (editor.isFocused) setTimeout(() => editor.commands.scrollIntoView(), 50);
});

window.scriptor = { receive };
send({ type: 'ready' });
