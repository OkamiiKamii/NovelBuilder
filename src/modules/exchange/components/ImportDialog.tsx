import { useEffect, useMemo, useState } from 'react';
import { exchange } from '@/core';
import { isGroup, type TreeNode } from '@/modules/manuscript/tree';
import { KIND_LABELS } from '@/modules/manuscript/types';
import { formatNumber } from '@/shared/format';
import { Modal } from '@/shared/Modal';
import { buildStructure, metricsOf, summarise, type ImportNode } from '../import/structure';
import type { ImportBlock } from '../import/types';
import { parseFile } from '../service';

interface ImportDialogProps {
  projectId: string;
  file: File;
  /** Volumes, acts and arcs the import could go inside. */
  groups: TreeNode[];
  onClose: () => void;
  onImported: (createdIds: string[]) => void;
}

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;

function Preview({ nodes, depth = 0 }: { nodes: ImportNode[]; depth?: number }) {
  return (
    <>
      {nodes.map((node, i) => {
        const words = metricsOf(node.blocks).words;
        return (
          <div key={`${depth}-${i}`}>
            <div className="import-row" style={{ paddingLeft: depth * 18 }}>
              <span className={`kind kind-${node.kind}`}>{KIND_LABELS[node.kind]}</span>
              <span className="import-title">{node.title}</span>
              {words > 0 && <span className="muted small">{formatNumber(words)}</span>}
            </div>
            <Preview nodes={node.children} depth={depth + 1} />
          </div>
        );
      })}
    </>
  );
}

/** Shows what an imported file will become before anything is added, and lets the author adjust how it is split. */
export function ImportDialog({ projectId, file, groups, onClose, onImported }: ImportDialogProps) {
  const [blocks, setBlocks] = useState<ImportBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [splitChapters, setSplitChapters] = useState(true);
  const [splitScenes, setSplitScenes] = useState(true);
  const [parentId, setParentId] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    file.arrayBuffer().then(
      (buffer) => {
        if (!alive) return;
        try {
          setBlocks(parseFile(file.name, new Uint8Array(buffer)));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'This file could not be read.');
        }
      },
      () => alive && setError('This file could not be read.'),
    );
    return () => {
      alive = false;
    };
  }, [file]);

  const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
  const nodes = useMemo(() => (blocks ? buildStructure(blocks, { splitChapters, splitScenes, fallbackTitle }) : []), [blocks, splitChapters, splitScenes, fallbackTitle]);
  const summary = useMemo(() => summarise(nodes), [nodes]);
  const hasGroups = nodes.some((n) => isGroup(n.kind));

  const run = () => {
    setWorking(true);
    setError(null);
    exchange
      .forProject(projectId)
      .importNodes(hasGroups ? null : parentId || null, nodes)
      .then(onImported, (err) => {
        setError(err instanceof Error ? err.message : 'The import failed. Nothing was added.');
        setWorking(false);
      });
  };

  return (
    <Modal title={`Import ${file.name}`} onClose={onClose}>
      <div className="stack">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!blocks && !error && <p className="muted">Reading the file…</p>}
        {blocks && (
          <>
            <p role="status">
              {nodes.length === 0
                ? 'No text was found in this file.'
                : `Found ${[summary.volumes && plural(summary.volumes, 'volume'), plural(summary.chapters, 'chapter'), summary.scenes && plural(summary.scenes, 'scene')].filter(Boolean).join(', ')} · ${plural(summary.words, 'word')}.`}
            </p>
            <label className="switch">
              <input type="checkbox" checked={splitChapters} onChange={(e) => setSplitChapters(e.target.checked)} />
              <span>
                <strong>Split into chapters at headings</strong>
                <span className="muted small">Recognises heading styles and lines such as “Chapter 12”, “Prologue”, “Part Two”</span>
              </span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={splitScenes} onChange={(e) => setSplitScenes(e.target.checked)} />
              <span>
                <strong>Split scenes at scene breaks</strong>
                <span className="muted small">Lines such as * * *, # or ---. Off keeps them as dividers inside the chapter</span>
              </span>
            </label>
            {!hasGroups && groups.length > 0 && (
              <label className="field">
                <span>Add to</span>
                <select value={parentId} aria-label="Add to" onChange={(e) => setParentId(e.target.value)}>
                  <option value="">End of the manuscript</option>
                  {groups.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {'  '.repeat(depth) + node.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="import-preview" aria-label="What will be added">
              <Preview nodes={nodes} />
            </div>
            <p className="muted small">The text is added exactly as it is in the file, after everything already in this manuscript. Nothing existing is changed.</p>
          </>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!nodes.length || working} onClick={run}>
            {working ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
