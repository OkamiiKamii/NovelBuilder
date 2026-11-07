import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type RefObject } from 'react';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { formatNumber } from '@/shared/format';
import type { ProjectManuscript } from '../service';
import { MAIN_DRAFT, type BranchInfo, type ChapterRevision, type RevisionInfo, type RevisionReason, type StoryNode } from '../types';
import type { EditorControl } from './ChapterEditor';
import { CompareDialog, type CompareSource } from './CompareDialog';
import { ReadOnlyDoc } from './ReadOnlyDoc';

const REASON_LABELS: Record<RevisionReason, string> = {
  auto: 'Autosaved',
  manual: 'Saved version',
  restore: 'Replaced by a restore',
  recovery: 'Replaced by recovered writing',
  conflict: 'Set aside in a conflict',
};
const when = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
/** Automatic snapshots are named by when they were current, e.g. "Version from October 10". */
const versionName = (revision: RevisionInfo) => revision.label || (revision.reason === 'auto' ? `Version from ${day(revision.savedAt)}` : REASON_LABELS[revision.reason]);

interface VersionsProps {
  node: StoryNode;
  ms: ProjectManuscript;
  control: RefObject<EditorControl | null>;
  onError: (error: unknown) => void;
}

/** Drafts and version history for one chapter or scene. */
export function Versions({ node, ms, control, onError }: VersionsProps) {
  const nodeId = node.id;
  const active = node.branchName ?? MAIN_DRAFT;
  const revisions = useLiveQuery(() => ms.revisions(nodeId), [ms, nodeId]) ?? [];
  const branches = useLiveQuery(() => ms.branches(nodeId), [ms, nodeId]) ?? [];
  const [label, setLabel] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftStart, setDraftStart] = useState<'copy' | 'blank'>('copy');
  const [viewing, setViewing] = useState<ChapterRevision | null>(null);
  const [comparing, setComparing] = useState<{ from: string; to: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string | null; name: string } | null>(null);
  const [deleting, setDeleting] = useState<BranchInfo | null>(null);
  const [busy, setBusy] = useState(false);

  /** Saves what is in the editor first, so every action here works on the latest text. */
  const act = (task: () => Promise<unknown>, reload = false) => {
    setBusy(true);
    void (async () => {
      await control.current?.flush();
      await task();
      if (reload) control.current?.reload();
    })()
      .catch(onError)
      .finally(() => setBusy(false));
  };

  const sources: CompareSource[] = [
    {
      id: 'current',
      label: `Current text (${active})`,
      load: async () => {
        await control.current?.flush();
        return ms.loadDoc(nodeId);
      },
    },
    ...branches.map((branch) => ({ id: `draft:${branch.id}`, label: `Draft: ${branch.name}`, load: async () => (await ms.getBranch(branch.id))?.doc ?? null })),
    ...revisions.map((revision) => ({
      id: `version:${revision.id}`,
      label: `${versionName(revision)} · ${when(revision.savedAt)}`,
      load: async () => (await ms.getRevision(revision.id))?.doc ?? null,
    })),
  ];

  const dialogs = (
    <>
      {comparing && <CompareDialog title={node.title} sources={sources} from={comparing.from} to={comparing.to} onClose={() => setComparing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete draft"
          confirmLabel="Delete draft"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const { id } = deleting;
            setDeleting(null);
            act(() => ms.deleteBranch(id));
          }}
        >
          <p>
            Delete the draft <strong>{deleting.name}</strong> ({formatNumber(deleting.wordCount)} words)? The text in your manuscript is not affected. This
            cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </>
  );

  if (viewing) {
    return (
      <>
        <div className="history-head">
          <button type="button" className="btn ghost" onClick={() => setViewing(null)}>
            ← All versions
          </button>
          <button type="button" className="btn" onClick={() => setComparing({ from: `version:${viewing.id}`, to: 'current' })}>
            Compare with current
          </button>
        </div>
        <p className="muted small">
          {when(viewing.savedAt)} · {formatNumber(viewing.wordCount)} words · {viewing.branchName ?? MAIN_DRAFT}
        </p>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await ms.restoreRevision(nodeId, viewing.id);
              setViewing(null);
            }, true)
          }
        >
          Restore this version
        </button>
        <p className="muted small">Your current text is saved as its own version first, so a restore can always be undone.</p>
        <ReadOnlyDoc key={viewing.id} doc={viewing.doc} />
        {dialogs}
      </>
    );
  }

  const renameForm = renaming && (
    <form
      className="history-save"
      onSubmit={(e) => {
        e.preventDefault();
        const { id, name } = renaming;
        setRenaming(null);
        act(() => ms.renameDraft(nodeId, id, name));
      }}
    >
      <input value={renaming.name} autoFocus aria-label="Draft name" onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
      <button type="submit" className="btn">
        Rename
      </button>
    </form>
  );

  return (
    <>
      <section className="drafts" aria-label="Drafts">
        <h3>Drafts</h3>
        <ul className="draft-list">
          <li className="active">
            <div>
              <strong>{active}</strong>
              <span className="muted small">In the manuscript · {formatNumber(node.wordCount)} words</span>
            </div>
            <button type="button" className="btn ghost" aria-label={`Rename ${active}`} onClick={() => setRenaming({ id: null, name: active })}>
              Rename
            </button>
          </li>
          {renaming?.id === null && <li>{renameForm}</li>}
          {branches.map((branch) => (
            <li key={branch.id}>
              {renaming?.id === branch.id ? (
                renameForm
              ) : (
                <>
                  <div>
                    <strong>{branch.name}</strong>
                    <span className="muted small">Set aside · {formatNumber(branch.wordCount)} words</span>
                  </div>
                  <details className="menu">
                    <summary aria-label={`Actions for ${branch.name}`}>⋯</summary>
                    <div className="menu-items" onClick={(e) => (e.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>
                      <button type="button" disabled={busy} onClick={() => act(() => ms.switchBranch(nodeId, branch.id), true)}>
                        Use in manuscript
                      </button>
                      <button type="button" onClick={() => setComparing({ from: `draft:${branch.id}`, to: 'current' })}>
                        Compare with current
                      </button>
                      <button type="button" onClick={() => setRenaming({ id: branch.id, name: branch.name })}>
                        Rename
                      </button>
                      <button type="button" className="danger-text" onClick={() => setDeleting(branch)}>
                        Delete…
                      </button>
                    </div>
                  </details>
                </>
              )}
            </li>
          ))}
        </ul>
        <form
          className="draft-new"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await ms.createBranch(nodeId, draftName, draftStart);
              setDraftName('');
            }, true);
          }}
        >
          <input value={draftName} placeholder="New draft, e.g. Alternate Ending A" aria-label="New draft name" onChange={(e) => setDraftName(e.target.value)} />
          <select value={draftStart} aria-label="Start the new draft from" onChange={(e) => setDraftStart(e.target.value as 'copy' | 'blank')}>
            <option value="copy">Start from a copy</option>
            <option value="blank">Start blank</option>
          </select>
          <button type="submit" className="btn" disabled={busy || !draftName.trim()}>
            Create draft
          </button>
        </form>
        <p className="muted small">The current text is kept as “{active}” and you carry on in the new draft. Word counts follow whichever draft is in the manuscript.</p>
      </section>

      <h3>Versions</h3>
      <form
        className="history-save"
        onSubmit={(e) => {
          e.preventDefault();
          act(async () => {
            await ms.saveVersion(nodeId, label);
            setLabel('');
          });
        }}
      >
        <input value={label} placeholder="Name this version (optional)" aria-label="Version name" onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" className="btn" disabled={busy}>
          Save version
        </button>
      </form>
      {revisions.length === 0 && <p className="muted small">Earlier versions appear here as you write: one is kept automatically every few minutes, plus any you save yourself.</p>}
      {revisions.length >= 2 && (
        <button type="button" className="btn ghost" onClick={() => setComparing({ from: `version:${revisions[1].id}`, to: `version:${revisions[0].id}` })}>
          Compare two versions…
        </button>
      )}
      <ol className="history-list">
        {revisions.map((revision) => (
          <li key={revision.id}>
            <button type="button" onClick={() => void ms.getRevision(revision.id).then((full) => full && setViewing(full), onError)}>
              <strong>{versionName(revision)}</strong>
              {revision.by && <span className="muted small"> · written by {revision.by.name}</span>}
              <span className="muted small">
                {when(revision.savedAt)} · {formatNumber(revision.wordCount)} words
                {revision.label || revision.reason === 'auto' ? ` · ${REASON_LABELS[revision.reason]}` : ''}
                {revision.branchName && revision.branchName !== active ? ` · ${revision.branchName}` : ''}
              </span>
            </button>
            <button type="button" className="btn ghost" aria-label={`Compare ${versionName(revision)} with current`} title="Compare with current text" onClick={() => setComparing({ from: `version:${revision.id}`, to: 'current' })}>
              Compare
            </button>
          </li>
        ))}
      </ol>
      {dialogs}
    </>
  );
}
