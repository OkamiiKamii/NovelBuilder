import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { progression } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { CompareView } from '../components/CompareView';
import { SnapshotEditor } from '../components/SnapshotEditor';
import { StateView } from '../components/StateView';
import { ProgressTracker } from '../components/ProgressTracker';
import { useProgression } from '../hooks';
import { inStoryOrder, placeOf, resolveSystem, stateAt } from '../state';
import type { ProgressSnapshot } from '../types';

const VIEWS = { inspect: 'State at a chapter', edit: 'Edit snapshot', compare: 'Compare' } as const;
type View = keyof typeof VIEWS;

export function ProgressionPage() {
  const project = useCurrentProject();
  const api = useMemo(() => progression.forProject(project.id), [project.id]);
  const { snapshots, blueprints, entries, nodes, loading } = useProgression(project.id);
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [label, setLabel] = useState('');

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const go = (next: Record<string, string | null>) =>
    setParams(
      (current) => {
        const merged = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) value ? merged.set(key, value) : merged.delete(key);
        return merged;
      },
      { replace: true },
    );

  if (loading) return null;
  const tracked = new Set(snapshots.map((s) => s.entryId));
  const characters = entries.filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  // Open on the character asked for; otherwise one already being tracked; otherwise the first character.
  const entry = entries.find((e) => e.id === params.get('entry')) ?? entries.find((e) => tracked.has(e.id)) ?? characters[0] ?? null;
  const mine = entry ? inStoryOrder(snapshots, nodes, entry.id) : [];
  const view: View = (params.get('view') as View) in VIEWS ? (params.get('view') as View) : 'inspect';
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));
  const chapterOptions = (prefix = '') =>
    documents.map(({ node, depth }) => (
      <option key={node.id} value={node.id}>
        {'  '.repeat(depth) + prefix + node.title}
      </option>
    ));
  const title = (snapshot: ProgressSnapshot) => `${placeOf(snapshot, nodes)}${snapshot.label ? `: ${snapshot.label}` : ''}`;
  const summary = (snapshot: ProgressSnapshot) =>
    blueprints.filter((s) => snapshot.systems[s.id]).flatMap((s) => resolveSystem(s, snapshot.systems[s.id]).tracks.map((t) => `${t.track.name} ${t.label.replace(/ of \d+$/, '')}`)).join(' · ');

  const selected = mine.find((s) => s.id === params.get('snap')) ?? mine.at(-1) ?? null;
  const asOf = documents.some((t) => t.node.id === params.get('at')) ? params.get('at') : null;
  const found = entry ? stateAt(snapshots, nodes, entry.id, asOf) : null;
  const from = mine.find((s) => s.id === params.get('from')) ?? mine.at(-2) ?? null;
  const to = mine.find((s) => s.id === params.get('to')) ?? mine.at(-1) ?? null;

  return (
    <div className="stack progression-page">
      <header className="page-header">
        <div>
          <h1>Character progression</h1>
          <p className="muted" role="status">
            {!entry ? 'How your characters change through the story' : mine.length === 0 ? `No snapshots of ${entry.name} yet` : `${mine.length} ${mine.length === 1 ? 'snapshot' : 'snapshots'} of ${entry.name}`}
          </p>
        </div>
        {entry?.category === 'character' && (
          <Link to={`/project/${project.id}/characters/${entry.id}`} className="btn">
            Open character profile
          </Link>
        )}
        {entries.length > 0 && (
          <select value={entry?.id ?? ''} aria-label="Character" onChange={(e) => go({ entry: e.target.value, snap: null, from: null, to: null })}>
            <EntryOptions entries={entries} />
          </select>
        )}
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {!entry ? (
        <div className="empty">
          <h2>Who they were, chapter by chapter</h2>
          <p className="muted">Create a character, then log what they are like at the points where they change: level, skills, gear, injuries, what they know.</p>
          <Link to={`/project/${project.id}/characters`} className="btn primary">
            Open Characters
          </Link>
        </div>
      ) : (
        <>
          <ProgressTracker projectId={project.id} entryId={entry.id} />
          <div>
            <h2>System snapshots</h2>
            <p className="muted small">For a novel with a worked-out system: {entry.name}’s whole state against your system blueprints (levels, attributes, skills), gear and condition, logged at a chapter.</p>
          </div>
          <form
            className="toolbar snapshot-new"
            onSubmit={(e) => {
              e.preventDefault();
              void api.create(entry.id, { nodeId: at || null, label }).then((made) => {
                setLabel('');
                setError(null);
                go({ entry: entry.id, snap: made.id, view: 'edit' });
              }, fail);
            }}
          >
            <select value={documents.some((t) => t.node.id === at) ? at : ''} aria-label="Snapshot is true from" onChange={(e) => setAt(e.target.value)}>
              <option value="">Before the story</option>
              {chapterOptions()}
            </select>
            <input value={label} aria-label="Label for the new snapshot" placeholder="Label, e.g. After the evolution" onChange={(e) => setLabel(e.target.value)} />
            <button type="submit" className="btn primary">
              Log snapshot
            </button>
          </form>
          <p className="muted small">A new snapshot starts as a copy of {entry.name}'s state at that point, so you only enter what changed.</p>

          {mine.length > 0 && (
            <ol className="snapshot-line" aria-label={`Snapshots of ${entry.name}`}>
              {mine.map((snapshot) => (
                <li key={snapshot.id} className={snapshot.id === selected?.id && view === 'edit' ? 'selected' : ''}>
                  <button type="button" onClick={() => go({ entry: entry.id, snap: snapshot.id, view: 'edit' })}>
                    <strong>{placeOf(snapshot, nodes)}</strong>
                    {snapshot.label && <span>{snapshot.label}</span>}
                    <span className="muted small">{summary(snapshot)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}

          {mine.length > 0 && (
            <div className="segmented wrap" role="tablist" aria-label="Views">
              {(Object.keys(VIEWS) as View[]).map((key) => (
                <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => go({ entry: entry.id, view: key === 'inspect' ? null : key })}>
                  {VIEWS[key]}
                </button>
              ))}
            </div>
          )}

          {mine.length > 0 && view === 'inspect' && (
            <section className="stack" aria-label="State at a chapter">
              <div className="toolbar">
                <select value={asOf ?? ''} aria-label="As of" onChange={(e) => go({ entry: entry.id, at: e.target.value || null })}>
                  <option value="">As of the end of the story</option>
                  {chapterOptions('As of ')}
                </select>
              </div>
              {found ? (
                <div className="panel sheet-card" aria-label={`${entry.name}'s state`}>
                  <p className="muted small state-source">
                    {entry.name} as of {asOf ? nodes.find((n) => n.id === asOf)?.title : 'the end of the story'}, from the snapshot at {title(found)}.{' '}
                    <button type="button" className="link" onClick={() => go({ entry: entry.id, snap: found.id, view: 'edit' })}>
                      Edit it
                    </button>
                  </p>
                  <StateView snapshot={found} systems={blueprints} entries={entries} projectId={project.id} />
                </div>
              ) : (
                <p className="muted">Nothing has been logged for {entry.name} by that point. The first snapshot is at {placeOf(mine[0], nodes)}.</p>
              )}
            </section>
          )}

          {mine.length > 0 && view === 'edit' && selected && (
            <div className="sheet-editor">
              <SnapshotEditor key={selected.id} snapshot={selected} name={entry.name} systems={blueprints} entries={entries} nodes={nodes} api={api} onDeleted={() => go({ entry: entry.id, snap: null, view: null })} onError={fail} />
              <div className="panel sheet-card" aria-label="Snapshot as it stands">
                <h3>{title(selected)}</h3>
                <StateView snapshot={selected} systems={blueprints} entries={entries} projectId={project.id} />
              </div>
            </div>
          )}

          {mine.length > 0 && view === 'compare' && (
            <section className="stack" aria-label="Compare">
              {mine.length < 2 || !from || !to ? (
                <p className="muted">Log a second snapshot to compare two points in {entry.name}'s story.</p>
              ) : (
                <>
                  <div className="toolbar">
                    <select value={from.id} aria-label="Compare from" onChange={(e) => go({ entry: entry.id, from: e.target.value })}>
                      {mine.map((s) => (
                        <option key={s.id} value={s.id}>
                          {title(s)}
                        </option>
                      ))}
                    </select>
                    <span className="muted">→</span>
                    <select value={to.id} aria-label="Compare to" onChange={(e) => go({ entry: entry.id, to: e.target.value })}>
                      {mine.map((s) => (
                        <option key={s.id} value={s.id}>
                          {title(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <CompareView from={from} to={to} systems={blueprints} entries={entries} nodes={nodes} projectId={project.id} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
