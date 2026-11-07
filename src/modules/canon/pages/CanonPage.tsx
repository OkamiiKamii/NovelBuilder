import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { canon } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { FactDetails } from '../components/FactDetails';
import { sourceLink, useCanon } from '../hooks';
import { FACT_KINDS, KIND_LABELS, STATUS_HINTS, STATUS_LABELS, STATUS_ORDER, type CanonStatus, type FactKind } from '../types';

export function CanonPage() {
  const project = useCurrentProject();
  const api = useMemo(() => canon.forProject(project.id), [project.id]);
  const data = useCanon(project.id);
  const { reviews, pairs, entries, cite, loading } = data;
  const isMobile = useMediaQuery('(max-width: 1100px)');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CanonStatus | ''>('');
  const [kind, setKind] = useState<FactKind | ''>('');
  const [entryId, setEntryId] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = reviews.find((r) => r.fact.id === params.get('fact')) ?? null;
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
  const open = (factId: string | null) => setParam('fact', factId);
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  const needle = query.trim().toLowerCase();
  const about = entries.some((e) => e.id === entryId) ? entryId : '';
  const visible = reviews
    .filter(({ fact, flags }) => {
      if (status && fact.status !== status) return false;
      if (kind && fact.kind !== kind) return false;
      if (about && !fact.entryIds.includes(about)) return false;
      if (onlyFlagged && flags.length === 0) return false;
      return !needle || [fact.subject, fact.statement, fact.notes, ...fact.history.map((c) => c.statement), ...fact.sources.map((s) => s.quote)].some((text) => text.toLowerCase().includes(needle));
    })
    .sort((a, b) => a.fact.subject.localeCompare(b.fact.subject) || a.fact.createdAt - b.fact.createdAt);
  const count = (s: CanonStatus) => reviews.filter((r) => r.fact.status === s).length;
  const flagged = reviews.filter((r) => r.flags.length).sort((a, b) => a.fact.subject.localeCompare(b.fact.subject));
  const usedEntries = entries.filter((e) => reviews.some((r) => r.fact.entryIds.includes(e.id)));

  const details = selected && <FactDetails key={selected.fact.id} review={selected} data={data} api={api} projectId={project.id} onOpen={open} onClose={() => open(null)} onError={fail} />;

  if (loading) return null;
  return (
    <div className="stack canon-page">
      <header className="page-header">
        <div>
          <h1>Canon</h1>
          <p className="muted" role="status">
            {reviews.length} {reviews.length === 1 ? 'fact' : 'facts'}
            {reviews.length > 0 && ` · ${count('canon')} canon`}
            {flagged.length > 0 && ` · ${flagged.length} to review`}
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            api.create().then((fact) => {
              setError(null);
              open(fact.id);
            }, fail)
          }
        >
          New fact
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
        <section className="panel plot-alerts" aria-label="Possible contradictions">
          <h2>Possible contradictions</h2>
          <ul>
            {pairs.map(({ a, b }) => (
              <li key={`${a.id}-${b.id}`}>
                <button type="button" className="link" onClick={() => open(a.id)}>
                  {a.subject}
                </button>
                <span>
                  “{a.statement}” ({STATUS_LABELS[a.status]}) and “{b.statement}” ({STATUS_LABELS[b.status]}) appear to conflict.{' '}
                  <button type="button" className="link" onClick={() => open(b.id)}>
                    Open the second
                  </button>
                </span>
              </li>
            ))}
            {flagged.flatMap((r) =>
              r.flags
                .filter((flag) => flag.kind !== 'fact')
                .map((flag) => (
                  <li key={`${r.fact.id}-${flag.key}`}>
                    <button type="button" className="link" onClick={() => open(r.fact.id)}>
                      {r.fact.subject}
                    </button>
                    <span>{flag.message}</span>
                  </li>
                )),
            )}
          </ul>
          <p className="muted small">These are observations, not rulings. Confirm, retcon, mark as Conflicting, set aside or ignore them: nothing changes until you change it.</p>
        </section>
      )}

      {reviews.length > 0 && (
        <div className="toolbar">
          <input type="search" value={query} placeholder="Search facts, past wordings and quotes…" aria-label="Search facts" onChange={(e) => setQuery(e.target.value)} />
          <select value={status} aria-label="Filter by canon status" onChange={(e) => setStatus(e.target.value as CanonStatus | '')}>
            <option value="">Every status ({reviews.length})</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} ({count(s)})
              </option>
            ))}
          </select>
          <select value={kind} aria-label="Filter by kind" onChange={(e) => setKind(e.target.value as FactKind | '')}>
            <option value="">Every kind</option>
            {FACT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          {usedEntries.length > 0 && (
            <select value={about} aria-label="Filter by codex entry" onChange={(e) => setEntryId(e.target.value)}>
              <option value="">About anything</option>
              <EntryOptions entries={usedEntries} />
            </select>
          )}
          <label className="check">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            To review only
          </label>
        </div>
      )}

      <div className={`rel-body${selected && !isMobile ? ' with-details' : ''}`}>
        <div className="stack">
          {reviews.length === 0 ? (
            <div className="empty">
              <h2>What is true in your world</h2>
              <p className="muted">
                Record the facts your story depends on, where each one is established, and how sure you are of it. When you change your mind, the earlier version is
                kept, so you can always see what was true and when.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">No facts match these filters.</p>
          ) : (
            STATUS_ORDER.filter((s) => visible.some((r) => r.fact.status === s)).map((s) => {
              const items = visible.filter((r) => r.fact.status === s);
              return (
                <section key={s} className="thread-group" aria-label={STATUS_LABELS[s]}>
                  <h2 title={STATUS_HINTS[s]}>
                    {STATUS_LABELS[s]} <span className="muted">{items.length}</span>
                  </h2>
                  <ul className="threads">
                    {items.map(({ fact, flags }) => {
                      const aboutNames = fact.entryIds.flatMap((id) => entries.find((e) => e.id === id)?.name ?? []);
                      const retcons = fact.history.filter((c) => c.kind === 'retcon').length;
                      return (
                        <li key={fact.id} className={`thread fact cs-${fact.status}${fact.id === selected?.fact.id ? ' selected' : ''}`}>
                          <div className="thread-top">
                            <button type="button" className="thread-title" onClick={() => open(fact.id)}>
                              {fact.subject}
                            </button>
                            <span className="badge">{KIND_LABELS[fact.kind]}</span>
                            <span className={`thread-status cs-${fact.status}`}>{STATUS_LABELS[fact.status]}</span>
                          </div>
                          <p className="fact-statement">{fact.statement.trim() || <span className="muted">No statement yet</span>}</p>
                          {(aboutNames.length > 0 || retcons > 0) && (
                            <p className="muted small">{[aboutNames.length ? `About ${aboutNames.join(', ')}` : '', retcons ? `Revised ${retcons === 1 ? 'once' : `${retcons} times`}` : ''].filter(Boolean).join(' · ')}</p>
                          )}
                          {fact.sources.length > 0 ? (
                            <ul className="fact-sources" aria-label={`Sources of ${fact.subject}`}>
                              {fact.sources.map((item) => {
                                const view = cite(item);
                                const link = sourceLink(project.id, view);
                                return (
                                  <li key={item.id} className={view.missing ? 'missing' : ''}>
                                    {link ? (
                                      <Link to={link.to} state={link.state}>
                                        {view.label}
                                      </Link>
                                    ) : (
                                      view.label
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            fact.status === 'canon' && <p className="muted small">No source recorded yet.</p>
                          )}
                          {flags.map((flag) => (
                            <p key={flag.key} className="event-flag small">
                              {flag.message}
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
          {reviews.length > 0 && visible.length !== reviews.length && (
            <p className="muted small">
              Showing {visible.length} of {reviews.length} facts.
            </p>
          )}
        </div>
        {!isMobile && selected && (
          <aside className="panel rel-drawer" aria-label="Fact details">
            {details}
          </aside>
        )}
      </div>

      {isMobile && selected && (
        <Modal title="Canon fact" onClose={() => open(null)}>
          {details}
        </Modal>
      )}
    </div>
  );
}
