import { Extension, Mark, mergeAttributes, type Editor } from '@tiptap/core';
import type { MarkType, Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * A link from a stretch of manuscript text to a codex entry. It is formatting,
 * like bold: the words themselves are never changed by adding or removing it.
 * It stores only the entry's permanent id, so renaming the entry needs no
 * change here, and a link whose entry has been deleted simply stops behaving
 * as a link (see the plugin below) without touching the text.
 */
export const EntityLink = Mark.create({
  name: 'entityLink',
  inclusive: false,
  addAttributes() {
    return {
      entryId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity'),
        renderHTML: (attributes) => ({ 'data-entity': attributes.entryId as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-entity]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'entity-link' }, HTMLAttributes), 0];
  },
});

export interface KnownEntity {
  id: string;
  name: string;
}

export interface Suggestion {
  from: number;
  to: number;
  entryId: string;
  text: string;
}

interface ReferenceState {
  entities: KnownEntity[];
  detect: boolean;
  suggestions: Suggestion[];
  decorations: DecorationSet;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds places where a known entity's name appears in the text and is not
 * linked yet. Matching is exact and case-sensitive on whole words, so a
 * character called "Will" is not offered for "will". These are only
 * suggestions: nothing here links anything.
 */
export function findSuggestions(doc: PMNode, entities: KnownEntity[], linkType: MarkType): Suggestion[] {
  const named = entities.filter((e) => e.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  if (!named.length) return [];
  const byName = new Map<string, string>();
  for (const entity of named) if (!byName.has(entity.name.trim())) byName.set(entity.name.trim(), entity.id);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...byName.keys()].map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  const suggestions: Suggestion[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    node.forEach((child) => (text += child.isText ? child.text : '￼'.repeat(child.nodeSize)));
    for (const match of text.matchAll(pattern)) {
      const from = pos + 1 + match.index;
      const to = from + match[0].length;
      if (!doc.rangeHasMark(from, to, linkType)) suggestions.push({ from, to, entryId: byName.get(match[0])!, text: match[0] });
    }
    return false;
  });
  return suggestions;
}

/** The codex entry ids linked anywhere in a saved document. */
export function mentionsIn(doc: unknown): string[] {
  const ids = new Set<string>();
  const walk = (node: { marks?: { type: string; attrs?: { entryId?: unknown } }[]; content?: unknown[] } | null | undefined) => {
    if (!node || typeof node !== 'object') return;
    for (const mark of node.marks ?? []) if (mark.type === 'entityLink' && typeof mark.attrs?.entryId === 'string') ids.add(mark.attrs.entryId);
    for (const child of node.content ?? []) walk(child as never);
  };
  walk(doc as never);
  return [...ids];
}

/** Re-points every in-text link in a saved document (used when a project is copied or imported). */
export function remapLinks<T>(doc: T, mapId: (id: string) => string): T {
  const walk = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    const { marks, content, ...rest } = node as { marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] };
    return {
      ...rest,
      ...(marks ? { marks: marks.map((m) => (m.type === 'entityLink' && typeof m.attrs?.entryId === 'string' ? { ...m, attrs: { ...m.attrs, entryId: mapId(m.attrs.entryId) } } : m)) } : {}),
      ...(content ? { content: content.map(walk) } : {}),
    };
  };
  return walk(doc) as T;
}

export const referencesKey = new PluginKey<ReferenceState>('references');

function build(doc: PMNode, entities: KnownEntity[], detect: boolean, linkType: MarkType): Pick<ReferenceState, 'suggestions' | 'decorations'> {
  const known = new Set(entities.map((e) => e.id));
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const link = node.marks.find((m) => m.type === linkType);
    // Only links whose entry still exists are drawn and clickable; the rest are left as plain text.
    if (link && known.has(link.attrs.entryId as string)) decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: 'ref-live' }));
    return false;
  });
  const suggestions = detect ? findSuggestions(doc, entities, linkType) : [];
  for (const s of suggestions) decorations.push(Decoration.inline(s.from, s.to, { class: 'ref-suggest', 'data-suggest': s.entryId }));
  return { suggestions, decorations: DecorationSet.create(doc, decorations) };
}

/**
 * Draws live links and, when the author has switched detection on, underlines
 * unlinked names as suggestions. Everything it does is an overlay; it never
 * changes the document.
 */
export const References = Extension.create({
  name: 'references',
  addProseMirrorPlugins() {
    const linkType = this.editor.schema.marks.entityLink;
    return [
      new Plugin<ReferenceState>({
        key: referencesKey,
        state: {
          init: (_, state) => ({ entities: [], detect: false, ...build(state.doc, [], false, linkType) }),
          apply(tr, prev) {
            const meta = tr.getMeta(referencesKey) as Partial<Pick<ReferenceState, 'entities' | 'detect'>> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const entities = meta?.entities ?? prev.entities;
            const detect = meta?.detect ?? prev.detect;
            return { entities, detect, ...build(tr.doc, entities, detect, linkType) };
          },
        },
        props: { decorations: (state) => referencesKey.getState(state)?.decorations },
      }),
    ];
  },
});

export const getReferences = (state: EditorState): ReferenceState => referencesKey.getState(state)!;

/** Tells the editor which entries exist and whether to suggest links. */
export function setReferences(editor: Editor, meta: { entities?: KnownEntity[]; detect?: boolean }): void {
  editor.view.dispatch(editor.state.tr.setMeta(referencesKey, meta));
}

/** The entry linked at the cursor or anywhere in the selection, if any. */
export function linkedEntryAt(state: EditorState): string | null {
  const type = state.schema.marks.entityLink;
  const { from, to, empty, $from } = state.selection;
  if (empty) return (($from.marks().find((m) => m.type === type)?.attrs.entryId as string | undefined) ?? null);
  let found: string | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    const mark = node.marks.find((m) => m.type === type);
    if (mark && !found) found = mark.attrs.entryId as string;
  });
  return found;
}

/** Links the given ranges to an entry in one undo step. Only ever called from an explicit author action. */
export function linkRanges(editor: Editor, ranges: { from: number; to: number }[], entryId: string): void {
  const type = editor.schema.marks.entityLink;
  const tr = editor.state.tr;
  for (const { from, to } of ranges) tr.addMark(from, to, type.create({ entryId }));
  editor.view.dispatch(tr);
}

/** The first place an entry is linked in the document, for jumping to it. */
export function firstLinkTo(doc: PMNode, entryId: string, linkType: MarkType): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.marks.some((m) => m.type === linkType && m.attrs.entryId === entryId)) range = { from: pos, to: pos + node.nodeSize };
    return true;
  });
  return range;
}
