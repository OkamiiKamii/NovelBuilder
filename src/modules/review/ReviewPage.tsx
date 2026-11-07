import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { continuity } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { DECISION_HINTS, DECISION_KINDS, DECISION_LABELS, INTENTIONAL_REASONS, SEVERITIES, SEVERITY_LABELS, type DecisionKind, type Severity } from '@/modules/continuity/types';
import { resolveRef } from '@/modules/model/model';
import { routeFor } from '@/modules/model/navigate';
import type { EntityRef } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { useLinkAllowed, ViewLink } from '@/modules/visualize/ViewLink';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { CATEGORY_TEXT, CERTAINTY_TEXT, REVIEW_CATEGORIES, REVIEW_SOURCES, SOURCE_TEXT, type Certainty, type ReviewCategory, type ReviewItem, type ReviewSource, type ReviewStatus } from './collect';
import { useReview } from './useReview';

/** What the list shows: what is still to do (open, or needing review), what is decided, or everything. */
const SHOWS = { todo: 'To look at', decided: 'Decided', all: 'Everything' } as const;
type Show = keyof typeof SHOWS;
const STATUS_WORDS: Record<ReviewStatus, string> = { open: 'Open', ...DECISION_LABELS };

/**
 * CONTINUITY REVIEW
 * Every warning the app's deterministic checks raise, in one place,
 * organised by severity and category. Each says whether it is a confirmed
 * data error or a possible inconsistency, its rule, the data it rests on,
 * the records it is about, and where to see it in context. The author
 * marks it resolved, intentional, ignored or needing review, with a note if
 * they like. Nothing is changed but that decision: no record, no canon, no
 * word of the manuscript.
 */
export function ReviewPage() {
  const project = useCurrentProject();
  const review = useReview(project.id);
  // A view this novel has turned off is not offered; where a check lives in one, it says so.
  const allowed = useLinkAllowed();
  const me = useMe(project.id);
  const writable = can(me.role, 'write');
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<{ key: string; kind: ReviewStatus; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/project/${project.id}`;
  const api = continuity.forProject(project.id);

  const show: Show = (params.get('show') as Show) in SHOWS ? (params.get('show') as Show) : 'todo';
  const by = params.get('by') === 'category' ? 'category' : 'severity';
  const pick = <T extends string>(key: string, values: readonly T[]): T | null => (values.includes(params.get(key) as T) ? (params.get(key) as T) : null);
  const certainty = pick<Certainty>('cert', ['error', 'possible']);
  const severity = pick<Severity>('sev', SEVERITIES);
  const category = pick<ReviewCategory>('cat', REVIEW_CATEGORIES);
  const source = pick<ReviewSource>('src', REVIEW_SOURCES);
  const text = (params.get('q') ?? '').trim().toLowerCase();
  const set = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  const filtered = Boolean(certainty || severity || category || source || text);

  if (review === undefined) return <p className="muted" role="status">Gathering warnings from every check…</p>;
  if (review === null) return <p className="error">This novel could not be found.</p>;
  const { model, items, gone, bySource, manuscript } = review;

  const todo = items.filter((i) => i.status === 'open' || i.status === 'review');
  const decided = items.filter((i) => i.status !== 'open' && i.status !== 'review');
  const listed = (show === 'todo' ? todo : show === 'decided' ? decided : items).filter(
    (i) => (!certainty || i.certainty === certainty) && (!severity || i.severity === severity) && (!category || i.category === category) && (!source || i.source === source) && (!text || `${i.title} ${i.message} ${i.because}`.toLowerCase().includes(text)),
  );
  const count = (list: ReviewItem[], c: Certainty) => list.filter((i) => i.certainty === c).length;
  const act = (task: Promise<unknown>) => void task.then(() => (setError(null), setEditing(null)), (e) => setError(e instanceof Error ? e.message : String(e)));
  const decide = (item: ReviewItem, kind: ReviewStatus, note: string) => {
    if (kind === 'open') return item.decision ? act(api.reopen(item.decision.id)) : setEditing(null);
    act(api.resolve({ key: item.key, message: item.message, nodeId: item.source === 'continuity' ? (item.refs.find((r) => r.type === 'node')?.id ?? '') : '' }, kind, note));
  };
  const name = (ref: EntityRef) => {
    const found = resolveRef(model, ref);
    return found.found ? found.view.label : 'something deleted';
  };

  const card = (item: ReviewItem) => (
    <li key={item.key} className={`thread issue rv-item sev-${item.severity}${item.status !== 'open' && item.status !== 'review' ? ' reviewed' : ''}`}>
      <p className="rv-tags">
        <span className={`thread-status sev-${item.severity}`}>{SEVERITY_LABELS[item.severity]}</span> <span className={`rv-cert rv-${item.certainty}`} title={CERTAINTY_TEXT[item.certainty].hint}>{CERTAINTY_TEXT[item.certainty].label}</span> <span className="badge">{SOURCE_TEXT[item.source].label}</span>
        {item.status !== 'open' && <span className="thread-status rv-status"> {STATUS_WORDS[item.status]}</span>}
      </p>
      <p className="issue-message">
        <strong>{item.title}.</strong> {item.message}
      </p>
      <p className="small">
        <strong>The rule:</strong> {item.rule}
      </p>
      <p className="small">
        <strong>Because:</strong> {item.because}
      </p>
      {item.decision?.note && <p className="small">Your note: {item.decision.note}</p>}
      <p className="small rv-links">
        {item.refs.length > 0 && <span>Records: </span>}
        {item.refs.map((ref, i) => {
          const route = routeFor(project.id, model, ref);
          return (
            <span key={`${ref.type}:${ref.id}`}>
              {i > 0 && ', '}
              {route ? (
                <Link to={route.to} state={route.state}>
                  {name(ref)}
                </Link>
              ) : (
                name(ref)
              )}
            </span>
          );
        })}
        {[...item.links, ...(item.context ? [item.context] : [])].filter((l) => allowed(l.to)).map((l) => (
          <span key={l.label}>
            {' · '}
            <Link to={l.to} state={'state' in l ? l.state : undefined}>
              {l.label}
            </Link>
          </span>
        ))}
        <span>
          {' · '}
          <ViewLink to={`${base}/${SOURCE_TEXT[item.source].page}`} said>{`Where it is checked: ${SOURCE_TEXT[item.source].label}`}</ViewLink>
        </span>
      </p>
      {writable &&
        (editing?.key === item.key ? (
          <form
            className="stack tight rv-decide"
            aria-label={`Status of: ${item.message}`}
            onSubmit={(e) => {
              e.preventDefault();
              decide(item, editing.kind, editing.note);
            }}
          >
            <fieldset className="rv-choices" role="radiogroup" aria-label="Status">
              {(['open', ...DECISION_KINDS] as ReviewStatus[]).map((kind) => (
                <label key={kind} className="check" title={kind === 'open' ? 'No decision: it stays on the list to look at.' : DECISION_HINTS[kind as DecisionKind]}>
                  <input type="radio" name={`status-${item.key}`} checked={editing.kind === kind} onChange={() => setEditing({ ...editing, kind })} /> {STATUS_WORDS[kind]}
                </label>
              ))}
            </fieldset>
            <p className="muted small">{editing.kind === 'open' ? 'No decision: it stays on the list to look at.' : DECISION_HINTS[editing.kind as DecisionKind]}</p>
            {editing.kind !== 'open' && (
              <label className="field">
                <span>Note (optional)</span>
                <input value={editing.note} list="review-notes" aria-label="Note (optional)" placeholder="Why, or what was done" onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
              </label>
            )}
            <div className="actions start">
              <button type="submit" className="btn primary">
                Save the status
              </button>
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="actions start">
            <button type="button" className="btn" aria-label={`Set the status of: ${item.message}`} onClick={() => setEditing({ key: item.key, kind: item.status, note: item.decision?.note ?? '' })}>
              Set the status…
            </button>
          </div>
        ))}
    </li>
  );

  // Grouped by severity and then category, or the other way round.
  const outer = by === 'severity' ? SEVERITIES.filter((s) => listed.some((i) => i.severity === s)) : REVIEW_CATEGORIES.filter((c) => listed.some((i) => i.category === c));
  const outerOf = (i: ReviewItem): string => (by === 'severity' ? i.severity : i.category);
  const innerOf = (i: ReviewItem): string => (by === 'severity' ? i.category : i.severity);
  const innerKeys: readonly string[] = by === 'severity' ? REVIEW_CATEGORIES : SEVERITIES;
  const words = (key: string) => (by === 'severity' ? { outer: SEVERITY_LABELS[key as Severity], inner: CATEGORY_TEXT } : { outer: CATEGORY_TEXT[key as ReviewCategory], inner: SEVERITY_LABELS });

  return (
    <div className="stack review-page">
      <header className="page-header">
        <div>
          <h1>Continuity review</h1>
          <p className="muted" role="status">
            {todo.length === 0 ? 'Nothing to look at' : `${todo.length} to look at: ${count(todo, 'error')} confirmed data ${count(todo, 'error') === 1 ? 'error' : 'errors'}, ${count(todo, 'possible')} possible ${count(todo, 'possible') === 1 ? 'inconsistency' : 'inconsistencies'}`} · {items.filter((i) => i.status === 'review').length} need review · {decided.length} decided
          </p>
        </div>
      </header>
      <p className="small">Every warning comes from one of the checks below, each with its own stated rule, and is raised only when your records hold what that rule needs: no date, no place, no tracked rule means no warning, never a guess. Nothing here changes a record, canon or the manuscript; only your decision about each warning is kept.</p>
      <dl className="rv-certainty small">
        {(['error', 'possible'] as Certainty[]).map((c) => (
          <div key={c}>
            <dt>
              <span className={`rv-cert rv-${c}`}>{CERTAINTY_TEXT[c].label}</span>
            </dt>
            <dd>{CERTAINTY_TEXT[c].hint}</dd>
          </div>
        ))}
      </dl>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {manuscript.state === 'failed' && (
        <p className="notice" role="alert">
          The manuscript could not be checked ({manuscript.error}). Its warnings are left out; everything else is here.
        </p>
      )}

      <details className="rv-sources">
        <summary>What was checked</summary>
        <ul className="small">
          {REVIEW_SOURCES.map((s) => (
            <li key={s}>
              <ViewLink to={`${base}/${SOURCE_TEXT[s].page}`} said>{SOURCE_TEXT[s].label}</ViewLink>: {SOURCE_TEXT[s].what}.{' '}
              {s === 'continuity' && manuscript.state === 'checking' ? 'Checking the manuscript…' : s === 'continuity' && manuscript.state === 'failed' ? 'Not checked.' : `${bySource.get(s) ?? 0} raised.`}
              {s === 'continuity' && manuscript.result && ` ${manuscript.result.scanned.documents} chapters and scenes, ${manuscript.result.scanned.rules} tracked rules.`}
            </li>
          ))}
          <li>Not gathered here: plot threads’ notes about pacing (a thread quiet for a while, a resolution overdue), which are about pace, not about records that disagree. They are on the Plot threads page.</li>
        </ul>
        {manuscript.state !== 'checking' && (
          <button type="button" className="btn ghost small" onClick={manuscript.recheck}>
            Check the manuscript again
          </button>
        )}
      </details>

      <div className="rv-filters" role="group" aria-label="Which warnings">
        <div className="segmented" role="radiogroup" aria-label="Show">
          {(Object.keys(SHOWS) as Show[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={show === s} className={show === s ? 'active' : ''} onClick={() => set({ show: s === 'todo' ? null : s })}>
              {SHOWS[s]} ({s === 'todo' ? todo.length : s === 'decided' ? decided.length : items.length})
            </button>
          ))}
        </div>
        <label className="field">
          <span>Group by</span>
          <select aria-label="Group by" value={by} onChange={(e) => set({ by: e.target.value === 'category' ? 'category' : null })}>
            <option value="severity">Severity, then category</option>
            <option value="category">Category, then severity</option>
          </select>
        </label>
        <label className="field">
          <span>Certainty</span>
          <select aria-label="Certainty" value={certainty ?? ''} onChange={(e) => set({ cert: e.target.value || null })}>
            <option value="">Both</option>
            <option value="error">{CERTAINTY_TEXT.error.label}s</option>
            <option value="possible">Possible inconsistencies</option>
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select aria-label="Severity" value={severity ?? ''} onChange={(e) => set({ sev: e.target.value || null })}>
            <option value="">Any</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select aria-label="Category" value={category ?? ''} onChange={(e) => set({ cat: e.target.value || null })}>
            <option value="">Any</option>
            {REVIEW_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_TEXT[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Check</span>
          <select aria-label="Check" value={source ?? ''} onChange={(e) => set({ src: e.target.value || null })}>
            <option value="">Any</option>
            {REVIEW_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_TEXT[s].label}
              </option>
            ))}
          </select>
        </label>
        <input type="search" aria-label="Search the warnings" placeholder="Search the warnings" value={params.get('q') ?? ''} onChange={(e) => set({ q: e.target.value || null })} />
        {filtered && (
          <button type="button" className="btn ghost" onClick={() => set({ cert: null, sev: null, cat: null, src: null, q: null })}>
            Clear filters
          </button>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="empty-state">
          <p>{filtered ? 'Nothing matches these filters.' : show === 'todo' ? (items.length ? 'Nothing to look at: every warning has a decision.' : 'No check has found anything. Your records agree with each other, as far as each rule can tell from what is recorded.') : show === 'decided' ? 'Nothing decided yet.' : 'No check has found anything.'}</p>
          {filtered && (
            <button type="button" className="btn" onClick={() => set({ cert: null, sev: null, cat: null, src: null, q: null })}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        outer.map((o) => {
          const here = listed.filter((i) => outerOf(i) === o);
          const w = words(o);
          return (
            <section key={o} className="panel stack" aria-label={`${w.outer} (${here.length})`}>
              <h2>
                {w.outer} <span className="muted">({here.length})</span>
              </h2>
              {innerKeys
                .filter((k) => here.some((i) => innerOf(i) === k))
                .map((k) => {
                  const inner = here.filter((i) => innerOf(i) === k);
                  const label = (w.inner as Record<string, string>)[k];
                  return (
                    <section key={k} className="stack tight" aria-label={`${w.outer}: ${label}`}>
                      <h3>
                        {label} <span className="muted">({inner.length})</span>
                      </h3>
                      <ul className="threads">{inner.map(card)}</ul>
                    </section>
                  );
                })}
            </section>
          );
        })
      )}

      {gone.length > 0 && (
        <details className="panel stack">
          <summary>No longer raised ({gone.length})</summary>
          <p className="muted small">Decisions about warnings the checks no longer raise: the records changed since. They are kept until you remove them.</p>
          <ul className="threads" aria-label="Decisions about warnings no longer raised">
            {gone.map((d) => (
              <li key={d.id} className="thread issue reviewed">
                <p className="issue-message muted">
                  <span className="thread-status">{DECISION_LABELS[d.kind]}</span> {d.message}
                </p>
                {d.note && <p className="small">Your note: {d.note}</p>}
                {writable && (
                  <button type="button" className="btn ghost" onClick={() => act(api.reopen(d.id))}>
                    Remove this decision
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <datalist id="review-notes">
        {['Fixed in the draft', 'Flashback', 'A double or impostor', 'To discuss with my editor', ...INTENTIONAL_REASONS].map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
