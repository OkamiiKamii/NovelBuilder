import { useEffect, useState, type RefObject } from 'react';
import { ReadOnlyScope } from '@/modules/collab/components/ReadOnly';
import { QuickReference } from '@/modules/codex/components/QuickReference';
import { PANEL_TABS, setPrefs, type WritingPrefs } from '../preferences';
import type { ProjectManuscript } from '../service';
import { flatten, isDocument, type TreeNode } from '../tree';
import type { DocJSON, StoryNode } from '../types';
import type { EditorControl } from './ChapterEditor';
import { NodeDetails } from './NodeDetails';
import { ReadOnlyDoc } from './ReadOnlyDoc';
import { Versions } from './Versions';

function Reference({ tree, currentId, ms }: { tree: TreeNode[]; currentId: string | undefined; ms: ProjectManuscript }) {
  const others = flatten(tree).filter((t) => isDocument(t.node.kind) && t.node.id !== currentId);
  const [selected, setSelected] = useState('');
  const [doc, setDoc] = useState<{ id: string; doc: DocJSON | null } | null>(null);
  const referenceId = others.some((t) => t.node.id === selected) ? selected : '';

  useEffect(() => {
    if (!referenceId) return setDoc(null);
    let alive = true;
    ms.loadDoc(referenceId).then(
      (loaded) => alive && setDoc({ id: referenceId, doc: loaded }),
      () => alive && setDoc(null),
    );
    return () => {
      alive = false;
    };
  }, [referenceId, ms]);

  if (!others.length) return <p className="muted small">Other chapters and scenes will appear here so you can read them while you write.</p>;
  return (
    <>
      <select value={referenceId} onChange={(e) => setSelected(e.target.value)} aria-label="Chapter or scene to reference">
        <option value="">Choose something to read…</option>
        {others.map(({ node, depth }) => (
          <option key={node.id} value={node.id}>
            {'  '.repeat(depth) + node.title}
          </option>
        ))}
      </select>
      {doc && doc.id === referenceId && <ReadOnlyDoc key={doc.id} doc={doc.doc} />}
    </>
  );
}

const TAB_LABELS = { notes: 'Plan', reference: 'Chapters', history: 'History', codex: 'Codex' };

interface SidePanelProps {
  projectId: string;
  prefs: WritingPrefs;
  nodes: StoryNode[];
  tree: TreeNode[];
  nodeId: string | undefined;
  ms: ProjectManuscript;
  control: RefObject<EditorControl | null>;
  /** The codex entry shown on the Codex tab, and how to change it. */
  codexEntry: string | null;
  onCodexEntry: (entryId: string | null) => void;
  onClose: () => void;
  /** For someone who may read the plan and history but not change them. The tabs still switch. */
  readOnly?: boolean;
}

export function SidePanel({ projectId, prefs, nodes, tree, nodeId, ms, control, codexEntry, onCodexEntry: setCodexEntry, onClose, readOnly = false }: SidePanelProps) {
  const [error, setError] = useState<string | null>(null);
  const current = flatten(tree).find((t) => t.node.id === nodeId);

  return (
    <>
      <div className="ms-nav-head">
        <div className="segmented" role="tablist">
          {PANEL_TABS.map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={prefs.panelTab === tab} className={prefs.panelTab === tab ? 'active' : ''} onClick={() => setPrefs({ panelTab: tab })}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <button type="button" className="tool" aria-label="Hide panel" onClick={onClose}>
          ✕
        </button>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      <ReadOnlyScope active={readOnly && prefs.panelTab !== 'codex' && prefs.panelTab !== 'reference'} className="panel-scope">
      {prefs.panelTab === 'codex' ? (
        <QuickReference projectId={projectId} openId={codexEntry} onOpen={setCodexEntry} />
      ) : prefs.panelTab === 'reference' ? (
        <Reference tree={tree} currentId={nodeId} ms={ms} />
      ) : prefs.panelTab === 'history' ? (
        current ? (
          <Versions key={current.node.id} node={current.node} ms={ms} control={control} onError={(err) => setError(err instanceof Error ? err.message : 'Something went wrong.')} />
        ) : (
          <p className="muted small">Open a chapter or scene to see its drafts and earlier versions.</p>
        )
      ) : current ? (
        <NodeDetails
          key={current.node.id}
          node={current.node}
          nodes={nodes}
          totalWords={current.totalWords}
          ms={ms}
          mode="compact"
          onOpenEntry={(entryId) => {
            setCodexEntry(entryId);
            setPrefs({ panelTab: 'codex' });
          }}
          onError={(err) => setError(err instanceof Error ? err.message : 'Could not save.')}
        />
      ) : (
        <p className="muted small">Open a chapter or scene to see its plan here.</p>
      )}
      </ReadOnlyScope>
    </>
  );
}
