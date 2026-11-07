import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';
import { createExtensions } from '../editor/extensions';
import type { DocJSON } from '../types';

/** Shows a saved document with its formatting, without allowing edits. Key it to the document. */
export function ReadOnlyDoc({ doc }: { doc: DocJSON | null }) {
  const extensions = useMemo(createExtensions, []);
  const editor = useEditor({ extensions, content: doc ?? '', editable: false, enableInputRules: false, enablePasteRules: false });
  return <EditorContent editor={editor} className="reference-doc" />;
}
