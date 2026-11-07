import { useEditorState, type Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { getSearch, replaceAll, replaceCurrent, setSearch, stepSearch } from '../editor/search';

export function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState(() => {
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, '\n');
    return selected && !selected.includes('\n') ? selected : getSearch(editor.state).query;
  });
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const { total, current } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const search = getSearch(e.state);
      return { total: search.matches.length, current: search.current };
    },
  });

  const reveal = () =>
    requestAnimationFrame(() => editor.view.dom.querySelector('.find-current')?.scrollIntoView({ block: 'center' }));

  useEffect(() => {
    setSearch(editor, { query, caseSensitive });
    reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, query, caseSensitive]);

  useEffect(() => {
    input.current?.select();
    return () => {
      if (!editor.isDestroyed) setSearch(editor, { query: '' });
    };
  }, [editor]);

  const step = (delta: 1 | -1) => {
    stepSearch(editor, delta);
    setMessage('');
    reveal();
  };

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  return (
    <div
      className="find-bar"
      role="search"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="find-row">
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Find"
          aria-label="Find"
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setMessage('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              step(e.shiftKey ? -1 : 1);
            }
          }}
        />
        <span className="find-count" aria-live="polite">
          {message || (query ? (total ? `${current + 1} of ${total}` : 'No results') : '')}
        </span>
        <button type="button" className={caseSensitive ? 'tool active' : 'tool'} aria-pressed={caseSensitive} aria-label="Match case" title="Match case" onClick={() => setCaseSensitive((v) => !v)}>
          Aa
        </button>
        <button type="button" className="tool" aria-label="Previous result" title="Previous (Shift+Enter)" disabled={!total} onClick={() => step(-1)}>
          ↑
        </button>
        <button type="button" className="tool" aria-label="Next result" title="Next (Enter)" disabled={!total} onClick={() => step(1)}>
          ↓
        </button>
        <button type="button" className="tool" aria-label="Close find" onClick={close}>
          ✕
        </button>
      </div>
      <div className="find-row">
        <input
          value={replacement}
          placeholder="Replace with"
          aria-label="Replace with"
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (replaceCurrent(editor, replacement)) reveal();
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!total}
          onClick={() => {
            if (replaceCurrent(editor, replacement)) reveal();
          }}
        >
          Replace
        </button>
        <button
          type="button"
          className="btn"
          disabled={!total}
          onClick={() => {
            const count = replaceAll(editor, replacement);
            setMessage(`Replaced ${count}`);
          }}
        >
          Replace all
        </button>
      </div>
    </div>
  );
}
