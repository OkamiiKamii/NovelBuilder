import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface Match {
  from: number;
  to: number;
}

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  current: number;
  decorations: DecorationSet;
}

type SearchMeta = Partial<Pick<SearchState, 'query' | 'caseSensitive' | 'current'>>;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds every occurrence of `query` within single blocks, across formatting boundaries. */
export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu');
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    // Non-text inline nodes (line breaks) become placeholders so offsets stay aligned.
    node.forEach((child) => (text += child.isText ? child.text : '￼'.repeat(child.nodeSize)));
    for (const match of text.matchAll(pattern)) {
      const from = pos + 1 + match.index;
      matches.push({ from, to: from + match[0].length });
    }
    return false;
  });
  return matches;
}

export const searchKey = new PluginKey<SearchState>('search');

function decorate(doc: PMNode, matches: Match[], current: number): DecorationSet {
  if (!matches.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'find-match find-current' : 'find-match' })),
  );
}

/** Highlights search results. It only draws overlays; the text changes solely through the replace functions below. */
export const Search = Extension.create({
  name: 'search',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, matches: [], current: 0, decorations: DecorationSet.empty }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const caseSensitive = meta?.caseSensitive ?? prev.caseSensitive;
            const researched = tr.docChanged || query !== prev.query || caseSensitive !== prev.caseSensitive;
            const matches = researched ? findMatches(tr.doc, query, caseSensitive) : prev.matches;

            let current = meta?.current ?? prev.current;
            if (meta && meta.current === undefined && (query !== prev.query || caseSensitive !== prev.caseSensitive)) {
              // New search: start from the first result at or after the cursor.
              const after = matches.findIndex((m) => m.from >= tr.selection.from);
              current = after === -1 ? 0 : after;
            }
            current = matches.length ? ((current % matches.length) + matches.length) % matches.length : 0;
            return { query, caseSensitive, matches, current, decorations: decorate(tr.doc, matches, current) };
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

export const getSearch = (state: EditorState): SearchState => searchKey.getState(state)!;

export function setSearch(editor: Editor, meta: SearchMeta): void {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, meta));
}

export function stepSearch(editor: Editor, delta: 1 | -1): void {
  const { matches, current } = getSearch(editor.state);
  if (matches.length) setSearch(editor, { current: current + delta });
}

/** Replaces the highlighted result. One undo step. */
export function replaceCurrent(editor: Editor, replacement: string): boolean {
  const { matches, current } = getSearch(editor.state);
  const match = matches[current];
  if (!match) return false;
  editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to).setMeta(searchKey, { current }));
  return true;
}

/** Replaces every result. One undo step. Returns how many were replaced. */
export function replaceAll(editor: Editor, replacement: string): number {
  const { matches } = getSearch(editor.state);
  if (!matches.length) return 0;
  const tr = editor.state.tr;
  for (let i = matches.length - 1; i >= 0; i--) tr.insertText(replacement, matches[i].from, matches[i].to);
  editor.view.dispatch(tr);
  return matches.length;
}
