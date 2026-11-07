import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { plot } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { ThreadDetails } from '../components/ThreadDetails';
import { beatPlace, diagnose, type ThreadReport } from '../diagnostics';
import { usePlot } from '../hooks';
import { CATEGORY_LABELS, DEFAULT_QUIET_AFTER, QUIET_CHOICES, STATUS_LABELS, STATUS_ORDER, THREAD_CATEGORIES, categoryName, statusName, type ThreadCategory, type ThreadStatus } from '../types';

type Grouping = 'status' | 'category' | 'character';
const GROUPINGS: Record<Grouping, string> = { status: 'Status', category: 'Category', character: 'Character' };

/** Small per-device preferences: how the dashboard is grouped, and how long a thread may lie quiet in each project. */
const remembered = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit only.
  }
};

export function PlotPage() {
  const project = useCurrentProject();
  const api = useMemo(() => plot.forProject(project.id), [project.id]);
  const { threads, entries, nodes, loading } = usePlot(project.id);
  const isMobile = useMediaQuery('(max-width: 1100px)');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<Grouping>(() => (remembered('nb:plot:group') as Grouping) in GROUPINGS ? (remembered('nb:plot:group') as Grouping) : 'status');
  const [category, setCategory] = useState<ThreadCategory | ''>('');
  const [status, setStatus] = useState<ThreadStatus | ''>('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [quietAfter, setQuietAfter] = useState(() => Number(remembered(`nb:plot:quiet:${project.id}`)) || DEFAULT_QUIET_AFTER);
  const [error, setError] = useState<string | null>(null);

  const { reports, frontier, chapterCount } = useMemo(() => diagnose(threads, nodes, quietAfter), [threads, nodes, quietAfter]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const selected = reports.find((r) => r.thread.id === params.get('thread')) ?? null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  const needle = query.trim().toLowerCase();
  const visible = reports
    .filter(({ thread, issues }) => {
      if (category && thread.category !== category) return false;
      if (status && thread.status !== status) return false;
      if (onlyFlagged && issues.length === 0) return false;
      return !needle || [thread.title, thread.premise, categoryName(thread), ...thread.beats.map((b) => b.title)].some((text) => text.toLowerCase().includes(needle));
    })
    .sort((a, b) => a.thread.title.localeCompare(b.thread.title));

  const groups: { key: string; heading: string; items: ThreadReport[] }[] = [];
  if (grouping === 'status') {
    for (const key of STATUS_ORDER) groups.push({ key, heading: STATUS_LABELS[key], items: visible.filter((r) => r.thread.status === key) });
  } else if (grouping === 'category') {
    const names = [...new Set(visible.map((r) => categoryName(r.thread)))];
    // Built-in categories in their usual order, then the author's own names.
    const rank = (name: string) => {
      const i = THREAD_CATEGORIES.findIndex((c) => CATEGORY_LABELS[c] === name);
      return i === -1 ? THREAD_CATEGORIES.length : i;
    };
    for (const name of names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) groups.push({ key: name, heading: name, items: visible.filter((r) => categoryName(r.thread) === name) });
  } else {
    const cast = [...new Set(visible.flatMap((r) => r.thread.characterIds))].flatMap((id) => byId.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const character of cast) groups.push({ key: character.id, heading: character.name, items: visible.filter((r) => r.thread.characterIds.includes(character.id)) });
    groups.push({ key: 'nobody', heading: 'No character attached', items: visible.filter((r) => !r.thread.characterIds.some((id) => byId.has(id))) });
  }

  const flagged = reports.filter((r) => r.issues.length).sort((a, b) => a.thread.title.localeCompare(b.thread.title));
  const active = reports.filter((r) => r.thread.status === 'active').length;
  const usedCategories = THREAD_CATEGORIES.filter((c) => reports.some((r) => r.thread.category === c));

  const details = selected && <ThreadDetails key={selected.thread.id} report={selected} threads={threads} entries={entries} nodes={nodes} api={api} projectId={project.id} onClose={() => setParam('thread', null)} onError={fail} />;

  if (loading) return null;
  return (
    <div className="stack plot-page">
      <header className="page-header">
        <div>
          <h1>Plot threads</h1>
          <p className="muted" role="status">
            {reports.length} {reports.length === 1 ? 'thread' : 'threads'}
            {reports.length > 0 && ` · ${active} active`}
            {flagged.length > 0 && ` · ${flagged.length} to check`}
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            api.create().then((thread) => {
              setError(null);
              setParam('thread', thread.id);
            }, fail)
          }
        >
          New thread
        </button>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {flagged.length > 0 && (
        <section className="panel plot-alerts" aria-label="Threads to check">
          <h2>Worth a look</h2>
          <ul>
            {flagged.flatMap((r) =>
              r.issues.map((issue) => (
                <li key={`${r.thread.id}-${issue.kind}`}>
                  <button type="button" className="link" onClick={() => setParam('thread', r.thread.id)}>
                    {r.thread.title}
                  </button>
                  <span>{issue.message}</span>
                </li>
              )),
            )}
          </ul>
          <p className="muted small">These are reminders, not rulings. A thread stays exactly as you marked it until you change it yourself.</p>
        </section>
      )}

      {reports.length > 0 && (
        <div className="toolbar">
          <input type="search" value={query} placeholder="Search threads…" aria-label="Search threads" onChange={(e) => setQuery(e.target.value)} />
          <span className="segmented" role="radiogroup" aria-label="Group by">
            {(Object.keys(GROUPINGS) as Grouping[]).map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={grouping === key}
                className={grouping === key ? 'active' : ''}
                onClick={() => {
                  setGrouping(key);
                  remember('nb:plot:group', key);
                }}
              >
                {GROUPINGS[key]}
              </button>
            ))}
          </span>
          <select value={status} aria-label="Filter by status" onChange={(e) => setStatus(e.target.value as ThreadStatus | '')}>
            <option value="">Any status</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={category} aria-label="Filter by category" onChange={(e) => setCategory(e.target.value as ThreadCategory | '')}>
            <option value="">Any category</option>
            {usedCategories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={quietAfter}
            aria-label="Flag quiet threads after"
            title="How many chapters an active thread may go without a development before it is flagged"
            onChange={(e) => {
              setQuietAfter(Number(e.target.value));
              remember(`nb:plot:quiet:${project.id}`, e.target.value);
            }}
          >
            {QUIET_CHOICES.map((n) => (
              <option key={n} value={n}>
                Flag after {n} quiet chapters
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            To check only
          </label>
        </div>
      )}

      <div className={`rel-body${selected && !isMobile ? ' with-details' : ''}`}>
        <div className="stack">
          {reports.length === 0 ? (
            <div className="empty">
              <h2>Keep every promise you make</h2>
              <p className="muted">
                A thread is anything the reader will expect you to follow up: the main plot, a mystery, a romance, a line of foreshadowing. Record where each one
                develops, and you will be told when one has gone quiet for a long time.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">No threads match these filters.</p>
          ) : (
            groups
              .filter((group) => group.items.length)
              .map((group) => (
                <section key={group.key} className="thread-group" aria-label={group.heading}>
                  <h2>
                    {group.heading} <span className="muted">{group.items.length}</span>
                  </h2>
                  <ul className="threads">
                    {group.items.map((report) => {
                      const { thread, beats, issues } = report;
                      const cast = thread.characterIds.flatMap((id) => byId.get(id)?.name ?? []);
                      const target = nodes.find((n) => n.id === thread.targetNodeId)?.title || thread.targetNote.trim();
                      return (
                        <li key={thread.id} className={`thread st-${thread.status}${thread.id === selected?.thread.id ? ' selected' : ''}`}>
                          <div className="thread-top">
                            <button type="button" className="thread-title" onClick={() => setParam('thread', thread.id)}>
                              {thread.title}
                            </button>
                            <span className="badge">{categoryName(thread)}</span>
                            <span className={`thread-status st-${thread.status}`}>{statusName(thread)}</span>
                          </div>
                          {thread.premise.trim() && <p className="thread-premise">{thread.premise}</p>}
                          {(cast.length > 0 || target) && <p className="muted small">{[cast.join(', '), target ? `Resolves: ${target}` : ''].filter(Boolean).join(' · ')}</p>}
                          {beats.length > 0 ? (
                            <ol className="thread-track" aria-label={`Developments of ${thread.title}`}>
                              {beats.map((placed) => (
                                <li key={placed.beat.id} className={placed.missing ? 'missing' : ''}>
                                  {placed.node ? (
                                    <Link to={`/project/${project.id}/manuscript/${placed.node.id}`} title={`Open ${placed.node.title}`}>
                                      <span className="beat-at">{beatPlace(placed)}</span>
                                      {placed.beat.title}
                                    </Link>
                                  ) : (
                                    <span>
                                      <span className="beat-at">{beatPlace(placed)}</span>
                                      {placed.beat.title}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="muted small">No developments recorded yet.</p>
                          )}
                          {issues.map((issue) => (
                            <p key={issue.kind} className="event-flag small">
                              {issue.message}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
          )}
          {reports.length > 0 && (
            <p className="muted small">
              {frontier > 0 ? `The manuscript has words up to chapter ${frontier} of ${chapterCount}; quiet threads are measured against that.` : 'Quiet threads are measured against the last chapter that has words. Nothing is written yet, so only gaps between developments are flagged.'}
              {visible.length !== reports.length && ` Showing ${visible.length} of ${reports.length} threads.`}
            </p>
          )}
        </div>
        {!isMobile && selected && (
          <aside className="panel rel-drawer" aria-label="Thread details">
            {details}
          </aside>
        )}
      </div>

      {isMobile && selected && (
        <Modal title="Plot thread" onClose={() => setParam('thread', null)}>
          {details}
        </Modal>
      )}
    </div>
  );
}
