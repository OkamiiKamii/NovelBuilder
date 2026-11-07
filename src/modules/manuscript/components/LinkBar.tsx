import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import { CategoryBadge } from '@/modules/codex/components/EntryBits';
import { matchesEntry } from '@/modules/codex/hooks';
import type { LoreEntry } from '@/modules/codex/types';
import { linkedEntryAt } from '../editor/references';

/**
 * Binds the selected words to a codex entry, or removes that link. Linking is
 * always something the author does here, by choosing an entry.
 */
export function LinkBar({ editor, entries, onClose }: { editor: Editor; entries: LoreEntry[]; onClose: () => void }) {
  const { from, to, empty } = editor.state.selection;
  const selected = editor.state.doc.textBetween(from, to, ' ');
  const currentId = linkedEntryAt(editor.state);
  const current = entries.find((e) => e.id === currentId);
  const [query, setQuery] = useState(selected.length <= 60 ? selected : '');
  const matches = entries.filter((e) => matchesEntry(e, query)).sort((a, b) => a.name.localeCompare(b.name));
  // Entries whose name is what was selected come first.
  const ranked = [...matches.filter((e) => e.name.toLowerCase() === selected.trim().toLowerCase()), ...matches.filter((e) => e.name.toLowerCase() !== selected.trim().toLowerCase())].slice(0, 8);

  const close = () => {
    onClose();
    editor.commands.focus();
  };
  const link = (entryId: string) => {
    const chain = editor.chain().focus();
    (empty ? chain.extendMarkRange('entityLink') : chain).setMark('entityLink', { entryId }).run();
    onClose();
  };
  const unlink = () => {
    const chain = editor.chain().focus();
    (empty ? chain.extendMarkRange('entityLink') : chain).unsetMark('entityLink').run();
    onClose();
  };

  return (
    <div
      className="find-bar link-bar"
      role="dialog"
      aria-label="Link to a codex entry"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="find-row">
        <span className="muted small link-what">
          {empty && !current ? 'Select the words to link first.' : current ? <>Linked to <strong>{current.name}</strong></> : <>Link “{selected.length > 40 ? `${selected.slice(0, 39)}…` : selected}” to…</>}
        </span>
        {currentId && (
          <button type="button" className="btn" onClick={unlink}>
            Remove link
          </button>
        )}
        <button type="button" className="tool" aria-label="Close link bar" onClick={close}>
          ✕
        </button>
      </div>
      {(!empty || current) && (
        <>
          <input type="search" value={query} autoFocus placeholder="Search the codex…" aria-label="Find an entry to link" onChange={(e) => setQuery(e.target.value)} />
          <ul className="link-results">
            {ranked.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => link(entry.id)}>
                  <strong>{entry.name}</strong>
                  <CategoryBadge category={entry.category} />
                  {entry.summary && <span className="muted small">{entry.summary}</span>}
                </button>
              </li>
            ))}
            {entries.length === 0 ? <li className="muted small">Your codex is empty. Add entries there to link to them.</li> : ranked.length === 0 && <li className="muted small">No entry matches.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
