import { Extension, type Extensions } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { Fragment, Slice, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { Comments } from './comments';
import { EntityLink, References } from './references';
import { Search } from './search';

/** Tab types a real tab character, so first-line indents are the author's own. */
const TabCharacter = Extension.create({
  name: 'tabCharacter',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('listItem')) return false;
        return this.editor.commands.command(({ tr }) => {
          tr.insertText('\t');
          return true;
        });
      },
    };
  },
});

/**
 * NON-INVASIVE EDITING RULE
 * Nothing in this list may change the author's text on its own. That is why
 * auto-linking and the trailing-paragraph node are off, and why the editor is
 * created with input rules and paste rules disabled (no "smart" quotes, no
 * Markdown shortcuts). Anything that proposes a change, now or in a later
 * phase, must render as an overlay and apply only on an explicit action.
 */
export function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      trailingNode: false,
      heading: { levels: [1, 2, 3] },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TabCharacter,
    Search,
    EntityLink,
    References,
    Comments,
  ];
}

/**
 * Plain-text paste that keeps the text exactly: one paragraph per line, blank
 * lines kept as empty paragraphs, runs of spaces and tabs untouched. (The
 * default parser merges consecutive line breaks.)
 */
export function plainTextParser(text: string, $context: ResolvedPos, _plain: boolean, view: EditorView): Slice {
  const { schema } = view.state;
  const marks = $context.marks();
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line, marks) : null));
  return new Slice(Fragment.fromArray(paragraphs), 1, 1);
}

/** The text of each block, with soft line breaks as newlines. */
export function blockTexts(doc: PMNode): string[] {
  const blocks: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    blocks.push(node.textBetween(0, node.content.size, undefined, '\n'));
    return false;
  });
  return blocks;
}
