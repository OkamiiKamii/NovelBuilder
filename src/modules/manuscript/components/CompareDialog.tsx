import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/shared/format';
import { diffDocs, type DiffBlock } from '../diff';
import type { DocJSON } from '../types';

export interface CompareSource {
  id: string;
  label: string;
  load: () => Promise<DocJSON | null>;
}

interface CompareDialogProps {
  title: string;
  sources: CompareSource[];
  /** The older side to start with, and the newer side. */
  from: string;
  to: string;
  onClose: () => void;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${formatNumber(Math.abs(n))}`;
/** Unchanged stretches longer than this are folded away so the changes stand out. */
const CONTEXT = 1;

function Block({ block }: { block: DiffBlock }) {
  if (block.kind === 'changed') {
    return (
      <p className="diff-changed">
        <span className="diff-tag">Edited</span>
        {block.parts.map((part, i) => (part.op === 'add' ? <ins key={i}>{part.text}</ins> : part.op === 'del' ? <del key={i}>{part.text}</del> : <span key={i}>{part.text}</span>))}
      </p>
    );
  }
  if (block.kind === 'added') {
    return (
      <p className="diff-added">
        <span className="diff-tag">Added</span>
        <ins>{block.text || ' '}</ins>
      </p>
    );
  }
  if (block.kind === 'removed') {
    return (
      <p className="diff-removed">
        <span className="diff-tag">Removed</span>
        <del>{block.text || ' '}</del>
      </p>
    );
  }
  if (block.kind === 'moved') {
    return (
      <p className={`diff-moved ${block.side}`}>
        <span className="diff-tag">{block.side === 'from' ? 'Moved from here' : 'Moved to here'}</span>
        {block.side === 'from' ? <del>{block.text}</del> : <span>{block.text}</span>}
      </p>
    );
  }
  return <p>{block.text || ' '}</p>;
}

/**
 * Compares any two versions of a chapter or scene: older on the left of the
 * pickers, newer on the right. Additions are green and underlined, removals
 * red and struck through, so the difference never depends on colour alone.
 * Read-only: nothing here changes any version.
 */
export function CompareDialog({ title, sources, from, to, onClose }: CompareDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fromId, setFromId] = useState(from);
  const [toId, setToId] = useState(to);
  const [docs, setDocs] = useState<{ key: string; before: DocJSON | null; after: DocJSON | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  const key = `${fromId}→${toId}`;
  useEffect(() => {
    let alive = true;
    const before = sources.find((s) => s.id === fromId);
    const after = sources.find((s) => s.id === toId);
    if (!before || !after) return;
    setFailed(false);
    setExpanded(new Set());
    Promise.all([before.load(), after.load()]).then(
      ([b, a]) => alive && setDocs({ key, before: b, after: a }),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const result = useMemo(() => (docs?.key === key ? diffDocs(docs.before, docs.after) : null), [docs, key]);

  // Fold long unchanged stretches, keeping a paragraph of context around each change.
  const rows = useMemo(() => {
    if (!result) return [];
    const { blocks } = result;
    const near = blocks.map((_, i) => blocks.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((b) => b.kind !== 'same'));
    const out: ({ block: DiffBlock; index: number } | { fold: number; count: number })[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (near[i]) {
        out.push({ block: blocks[i], index: i });
        continue;
      }
      let end = i;
      while (end + 1 < blocks.length && !near[end + 1]) end++;
      if (expanded.has(i) || end - i < 2) for (let k = i; k <= end; k++) out.push({ block: blocks[k], index: k });
      else out.push({ fold: i, count: end - i + 1 });
      i = end;
    }
    return out;
  }, [result, expanded]);

  const stats = result?.stats;
  const picker = (label: string, value: string, onChange: (id: string) => void) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <dialog ref={dialog} className="compare-dialog" aria-label="Compare versions" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <header className="compare-head">
        <div className="modal-header">
          <h2>Compare versions of {title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="compare-pickers">
          {picker('Older version', fromId, setFromId)}
          <button
            type="button"
            className="btn"
            aria-label="Swap sides"
            title="Swap sides"
            onClick={() => {
              setFromId(toId);
              setToId(fromId);
            }}
          >
            ⇄
          </button>
          {picker('Newer version', toId, setToId)}
        </div>
        {stats && (
          <p className="compare-stats" role="status">
            <span>
              <strong>{formatNumber(stats.wordsBefore)}</strong> → <strong>{formatNumber(stats.wordsAfter)}</strong> words ({signed(stats.wordsAfter - stats.wordsBefore)})
            </span>
            <span>
              <strong>{formatNumber(stats.charactersBefore)}</strong> → <strong>{formatNumber(stats.charactersAfter)}</strong> characters ({signed(stats.charactersAfter - stats.charactersBefore)})
            </span>
            <span>
              <ins>{formatNumber(stats.wordsAdded)} added</ins> · <del>{formatNumber(stats.wordsRemoved)} removed</del>
            </span>
            <span>
              {stats.paragraphsChanged} {stats.paragraphsChanged === 1 ? 'paragraph' : 'paragraphs'} changed
            </span>
          </p>
        )}
      </header>
      <div className="compare-body">
        {failed ? (
          <p className="muted">One of these versions could not be loaded.</p>
        ) : !result ? null : result.identical ? (
          <p className="compare-same muted">These two versions have the same text.</p>
        ) : (
          rows.map((row) =>
            'fold' in row ? (
              <button key={`fold-${row.fold}`} type="button" className="diff-fold" onClick={() => setExpanded(new Set([...expanded, row.fold]))}>
                {row.count} unchanged paragraphs — show
              </button>
            ) : (
              <Block key={row.index} block={row.block} />
            ),
          )
        )}
      </div>
    </dialog>
  );
}
