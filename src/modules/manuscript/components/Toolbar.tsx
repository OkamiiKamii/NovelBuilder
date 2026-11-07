import { useEditorState, type Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { getReferences, linkedEntryAt } from '../editor/references';

type Align = 'left' | 'center' | 'right' | 'justify';
const ALIGNMENTS: { value: Align; label: string; icon: string }[] = [
  { value: 'left', label: 'Align left', icon: 'M3 5h18M3 10h12M3 15h18M3 20h12' },
  { value: 'center', label: 'Align centre', icon: 'M3 5h18M6 10h12M3 15h18M6 20h12' },
  { value: 'right', label: 'Align right', icon: 'M3 5h18M9 10h12M3 15h18M9 20h12' },
  { value: 'justify', label: 'Justify', icon: 'M3 5h18M3 10h18M3 15h18M3 20h18' },
];

interface ToolButtonProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Keeps focus (and the mobile keyboard) in the editor while a toolbar button is pressed. */
export function ToolButton({ label, shortcut, active, disabled, onClick, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={active ? 'tool active' : 'tool'}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

interface ToolbarProps {
  editor: Editor;
  onFind: () => void;
  onLink: () => void;
  suggesting: boolean;
  onToggleSuggestions: () => void;
}

export function Toolbar({ editor, onFind, onLink, suggesting, onToggleSuggestions }: ToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      quote: e.isActive('blockquote'),
      block: ([1, 2, 3] as const).find((level) => e.isActive('heading', { level })) ?? 0,
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? ('left' as Align),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      linked: linkedEntryAt(e.state) !== null,
      suggestions: getReferences(e.state).suggestions.length,
    }),
  });
  const run = () => editor.chain().focus();

  return (
    <div className="toolbar-tools" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" shortcut={`${mod}Z`} disabled={!state.canUndo} onClick={() => run().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton label="Redo" shortcut={mod === '⌘' ? '⇧⌘Z' : 'Ctrl+Y'} disabled={!state.canRedo} onClick={() => run().redo().run()}>
        ↷
      </ToolButton>
      <span className="tool-sep" />
      <select
        className="tool-select"
        aria-label="Text style"
        value={state.block}
        onChange={(e) => {
          const level = Number(e.target.value) as 0 | 1 | 2 | 3;
          if (level === 0) run().setParagraph().run();
          else run().setHeading({ level }).run();
        }}
      >
        <option value={0}>Paragraph</option>
        <option value={1}>Heading 1</option>
        <option value={2}>Heading 2</option>
        <option value={3}>Heading 3</option>
      </select>
      <span className="tool-sep" />
      <ToolButton label="Bold" shortcut={`${mod}B`} active={state.bold} onClick={() => run().toggleBold().run()}>
        <b>B</b>
      </ToolButton>
      <ToolButton label="Italic" shortcut={`${mod}I`} active={state.italic} onClick={() => run().toggleItalic().run()}>
        <i>I</i>
      </ToolButton>
      <ToolButton label="Underline" shortcut={`${mod}U`} active={state.underline} onClick={() => run().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => run().toggleStrike().run()}>
        <s>S</s>
      </ToolButton>
      <ToolButton label="Blockquote" active={state.quote} onClick={() => run().toggleBlockquote().run()}>
        ❝
      </ToolButton>
      <span className="tool-sep" />
      {ALIGNMENTS.map(({ value, label, icon }) => (
        <ToolButton
          key={value}
          label={label}
          active={state.align === value}
          onClick={() => (value === 'left' ? run().unsetTextAlign().run() : run().setTextAlign(value).run())}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={icon} />
          </svg>
        </ToolButton>
      ))}
      <span className="tool-sep" />
      <ToolButton label="Link to a codex entry" active={state.linked} onClick={onLink}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      </ToolButton>
      <button
        type="button"
        className={suggesting ? 'tool active suggest-toggle' : 'tool suggest-toggle'}
        aria-pressed={suggesting}
        title="Underline codex names in the text as link suggestions. Nothing is linked until you confirm it."
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleSuggestions}
      >
        Suggest links{suggesting && state.suggestions > 0 ? ` (${state.suggestions})` : ''}
      </button>
      <span className="tool-sep" />
      <ToolButton label="Find and replace" shortcut={`${mod}F`} onClick={onFind}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
      </ToolButton>
    </div>
  );
}
