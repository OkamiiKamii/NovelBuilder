// THE MANUSCRIPT FORMAT STAYS AS IT IS. The editor's schema: the original web app's TipTap set-up
// (src/modules/manuscript/editor/extensions.ts and references.ts), which the Flutter app reads and writes too. Same
// extensions, same options, so a chapter's ProseMirror JSON is the same in all three apps.
//
// NON-INVASIVE EDITING RULE (as in the original): nothing here may change the writer's text on its own. Auto-linking
// and the trailing paragraph are off, and the editor is created with input and paste rules disabled (no "smart" quotes,
// no Markdown shortcuts).
//
// Used by the editor page bundled into the app (editor-web/main.ts) and by the tests (test/editorSchema.test.ts).

import { Extension, type Extensions, Mark, mergeAttributes } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';

/** A link from a stretch of text to a codex entry (a character, a place…), by the entry's permanent id. It is
 * formatting, like bold: the words are never changed by adding or removing it. */
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

/** Tab types a real tab character, so first-line indents are the writer's own. */
export const TabCharacter = Extension.create({
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

export function manuscriptExtensions(): Extensions {
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
    EntityLink,
  ];
}
