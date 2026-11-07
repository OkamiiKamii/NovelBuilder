import { entryPath } from '@/modules/characters/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { codex, continuity, manuscript } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { Modal } from '@/shared/Modal';
import type { AuditResult } from '../audit';
import { describeRule, RuleForm } from '../components/RuleForm';
import { CATEGORIES, CATEGORY_LABELS, decisionWord, INTENTIONAL_REASONS, KIND_LABELS, RULE_KINDS, SEVERITIES, SEVERITY_HINTS, SEVERITY_LABELS, type ContinuityRule, type Issue, type IssueCategory, type RuleKind, type Severity } from '../types';

const TABS = { issues: 'Issues', reviewed: 'Reviewed', tracked: 'What is tracked' } as const;
type Tab = keyof typeof TABS;

/** The passage with the words the finding rests on picked out. */
function Excerpt({ issue }: { issue: Pick<Issue, 'excerpt' | 'match'> }) {
  const at = issue.match ? issue.excerpt.indexOf(issue.match) : -1;
  return (
    <blockquote className="issue-excerpt">
      {at === -1 ? issue.excerpt : (
        <>
          {issue.excerpt.slice(0, at)}
          <mark>{issue.match}</mark>
          {issue.excerpt.slice(at + issue.match.length)}
        </>
      )}
    </blockquote>
  );
}

export function ContinuityPage() {
  const project = useCurrentProject();
  const api = useMemo(() => continuity.forProject(project.id), [project.id]);
  const rules = useLiveQuery(() => api.rules(), [api]);
  const decisions = useLiveQuery(() => api.resolutions(), [api]);
  const entries = useLiveQuery(() => codex.forProject(project.id).list(), [project.id]);
  const nodes = useLiveQuery(() => manuscript.forProject(project.id).list(), [project.id]);
  const [params, setParams] = useSearchParams();
  const tab: Tab = (params.get('tab') as Tab) in TABS ? (params.get('tab') as Tab) : 'issues';
  const [result, setResult] = useState<AuditResult | null>(null);
  const [runs, setRuns] = useState(0);
  const [running, setRunning] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [category, setCategory] = useState<IssueCategory | ''>('');
  const [nodeId, setNodeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: RuleKind; rule?: ContinuityRule } | null>(null);
  const [confirming, setConfirming] = useState<Issue | null>(null);
  const [deleting, setDeleting] = useState<ContinuityRule | null>(null);
  const [explaining, setExplaining] = useState<{ key: string; note: string } | null>(null);

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const check = useCallback(async () => {
    setRunning(true);
    try {
      setResult(await api.run());
      setCheckedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be run.');
    } finally {
      setRunning(false);
      setRuns((n) => n + 1);
    }
  }, [api]);

  // Checked when the page opens, and again whenever a rule, a decision, the Codex or the chapter list changes. Reading only.
  useEffect(() => {
    if (rules && decisions && entries && nodes) void check();
  }, [rules, decisions, entries, nodes, check]);

  const setTab = (next: Tab) => setParams(next === 'issues' ? {} : { tab: next }, { replace: true });
  const act = (task: Promise<unknown>) => void task.catch(fail);

  if (!rules || !decisions || !entries || !nodes || !result) return null;
  const { open, resolved, stale, scanned } = result;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((i) => i.severity === s).length])) as Record<Severity, number>;
  const chapter = open.some((i) => i.nodeId === nodeId) ? nodeId : '';
  const visible = open.filter((i) => (!severity || i.severity === severity) && (!category || i.category === category) && (!chapter || i.nodeId === chapter));
  const places = [...new Map(open.map((i) => [i.nodeId, i.nodeTitle])).entries()];
  const base = `/project/${project.id}`;
  const entryLinks = (issue: Issue) => issue.entryIds.flatMap((id) => entries.find((e) => e.id === id) ?? []);
  const ruleOf = (issue: Issue) => rules.find((r) => r.id === issue.ruleId);

  return (
    <div className="stack continuity-page" data-runs={runs}>
      <header className="page-header">
        <div>
          <h1>Continuity</h1>
          <p className="muted" role="status" aria-busy={running}>
            {open.length === 0 ? 'No open issues' : `${open.length} open ${open.length === 1 ? 'issue' : 'issues'} · ${counts.critical} critical · ${counts.warning} ${counts.warning === 1 ? 'warning' : 'warnings'} · ${counts.info} info`}
          </p>
        </div>
        <button type="button" className="btn primary" disabled={running} onClick={() => void check()}>
          {running ? 'Checking…' : 'Run continuity check'}
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

      <p className="muted small check-summary">
        Read {scanned.paragraphs} {scanned.paragraphs === 1 ? 'paragraph' : 'paragraphs'} in {scanned.documents} {scanned.documents === 1 ? 'chapter or scene' : 'chapters and scenes'} against {scanned.rules} tracked {scanned.rules === 1 ? 'rule' : 'rules'} and
        the character profiles{checkedAt ? `, at ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}. A check only reads: it never changes your text or your canon.
      </p>

      <div className="toolbar">
        <span className="segmented" role="tablist" aria-label="Continuity views">
          {(Object.keys(TABS) as Tab[]).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {TABS[key]} ({key === 'issues' ? open.length : key === 'reviewed' ? resolved.length + stale.length : rules.length})
            </button>
          ))}
        </span>
        {tab === 'issues' && open.length > 0 && (
          <>
            <select value={severity} aria-label="Filter by severity" onChange={(e) => setSeverity(e.target.value as Severity | '')}>
              <option value="">Every severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]} ({counts[s]})
                </option>
              ))}
            </select>
            <select value={category} aria-label="Filter by kind of check" onChange={(e) => setCategory(e.target.value as IssueCategory | '')}>
              <option value="">Every kind of check</option>
              {CATEGORIES.filter((c) => open.some((i) => i.category === c)).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select value={chapter} aria-label="Filter by chapter" onChange={(e) => setNodeId(e.target.value)}>
              <option value="">Whole manuscript</option>
              {places.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {tab === 'issues' &&
        (open.length === 0 ? (
          <div className="empty">
            <h2>{rules.length === 0 && resolved.length === 0 ? 'Tell the checker what must stay true' : 'Nothing to review'}</h2>
            <p className="muted">
              {rules.length === 0
                ? 'Record who has died, what has been lost, how far apart places are and what your magic cannot do. Every check then reads the manuscript against those, and against the ages and colours in your character profiles.'
                : 'The manuscript agrees with everything you are tracking, as far as a word-by-word reading can tell.'}
            </p>
            {rules.length === 0 && (
              <button type="button" className="btn primary" onClick={() => setTab('tracked')}>
                Choose what to track
              </button>
            )}
          </div>
        ) : visible.length === 0 ? (
          <p className="muted">No issues match these filters.</p>
        ) : (
          SEVERITIES.filter((s) => visible.some((i) => i.severity === s)).map((s) => (
            <section key={s} className="thread-group" aria-label={SEVERITY_LABELS[s]}>
              <h2 title={SEVERITY_HINTS[s]}>
                {SEVERITY_LABELS[s]} <span className="muted">{visible.filter((i) => i.severity === s).length}</span>
              </h2>
              <ul className="threads">
                {visible.filter((i) => i.severity === s).map((issue) => (
                  <li key={issue.key} className={`thread issue sev-${issue.severity}`}>
                    <div className="thread-top">
                      <span className={`thread-status sev-${issue.severity}`}>{SEVERITY_LABELS[issue.severity]}</span>
                      <span className="badge">{CATEGORY_LABELS[issue.category]}</span>
                      <span className="muted small issue-where">
                        {issue.nodeTitle} · paragraph {issue.block + 1}
                      </span>
                    </div>
                    <p className="issue-message">{issue.message}</p>
                    <Excerpt issue={issue} />
                    <p className="small issue-links">
                      {entryLinks(issue).map((entry) => (
                        <Link key={entry.id} to={entryPath(project.id, entry)}>
                          {entry.name}
                        </Link>
                      ))}
                      {ruleOf(issue) && (
                        <button type="button" className="link" onClick={() => setEditing({ kind: ruleOf(issue)!.kind, rule: ruleOf(issue) })}>
                          What is tracked
                        </button>
                      )}
                    </p>
                    <div className="actions start wrap">
                      <Link className="btn" to={`${base}/manuscript/${issue.nodeId}`} state={{ jump: { term: issue.match, block: issue.block } }}>
                        Fix manuscript
                      </Link>
                      {issue.fix && (
                        <button type="button" className="btn" onClick={() => setConfirming(issue)}>
                          Update canon…
                        </button>
                      )}
                      <button type="button" className="btn" aria-expanded={explaining?.key === issue.key} onClick={() => setExplaining(explaining?.key === issue.key ? null : { key: issue.key, note: '' })}>
                        Mark as intentional…
                      </button>
                      <button type="button" className="btn ghost" onClick={() => act(api.resolve(issue, 'dismissed'))}>
                        Dismiss
                      </button>
                    </div>
                    {explaining?.key === issue.key && (
                      <form
                        className="plan-group"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void api.resolve(issue, 'intentional', explaining.note).then(() => setExplaining(null), fail);
                        }}
                      >
                        <label className="field">
                          <span>Why is this intentional?</span>
                          <input value={explaining.note} aria-label="Why is this intentional?" autoFocus placeholder="A note for your future self" onChange={(e) => setExplaining({ key: issue.key, note: e.target.value })} />
                        </label>
                        <div className="actions start wrap">
                          {INTENTIONAL_REASONS.map((reason) => (
                            <button key={reason} type="button" className="badge reason" onClick={() => setExplaining({ key: issue.key, note: reason })}>
                              {reason}
                            </button>
                          ))}
                        </div>
                        <div className="actions">
                          <button type="button" className="btn" onClick={() => setExplaining(null)}>
                            Cancel
                          </button>
                          <button type="submit" className="btn primary">
                            Save as intentional
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        ))}

      {tab === 'reviewed' &&
        (resolved.length + stale.length === 0 ? (
          <p className="muted">Issues you mark as intentional or dismiss are kept here, so you can change your mind.</p>
        ) : (
          <>
            <ul className="threads" aria-label="Reviewed issues">
              {resolved.map(({ issue, resolution }) => (
                <li key={resolution.id} className="thread issue reviewed">
                  <div className="thread-top">
                    <span className="thread-status">{decisionWord(resolution.kind)}</span>
                    <span className="badge">{CATEGORY_LABELS[issue.category]}</span>
                    <span className="muted small issue-where">
                      {issue.nodeTitle} · paragraph {issue.block + 1}
                    </span>
                  </div>
                  <p className="issue-message">{issue.message}</p>
                  {resolution.note && <p className="small">Your note: {resolution.note}</p>}
                  <Excerpt issue={issue} />
                  <div className="actions start">
                    <button type="button" className="btn" onClick={() => act(api.reopen(resolution.id))}>
                      Reopen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {stale.length > 0 && (
              <section className="stack" aria-label="No longer raised">
                <h2 className="muted small">No longer raised: the text or what is tracked has changed since</h2>
                <ul className="threads">
                  {stale.map((resolution) => (
                    <li key={resolution.id} className="thread issue reviewed">
                      <p className="issue-message muted">{resolution.message}</p>
                      {resolution.note && <p className="small">Your note: {resolution.note}</p>}
                      <div className="actions start">
                        <button type="button" className="btn ghost" onClick={() => act(api.reopen(resolution.id))}>
                          Remove this decision
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ))}

      {tab === 'tracked' && (
        <>
          <div className="actions start wrap">
            {RULE_KINDS.map((kind) => (
              <button key={kind} type="button" className="btn" onClick={() => setEditing({ kind })}>
                + {KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          {rules.length === 0 ? (
            <p className="muted">Nothing is tracked yet. Ages, eye colours and hair colours in character profiles are checked without any setup.</p>
          ) : (
            RULE_KINDS.filter((kind) => rules.some((r) => r.kind === kind)).map((kind) => (
              <section key={kind} className="thread-group" aria-label={KIND_LABELS[kind]}>
                <h2>{KIND_LABELS[kind]}</h2>
                <ul className="threads">
                  {rules.filter((r) => r.kind === kind).sort((a, b) => a.createdAt - b.createdAt).map((rule) => {
                    const { subject, detail, broken } = describeRule(rule, entries, nodes);
                    return (
                      <li key={rule.id} className="thread tracked">
                        <div className="thread-top">
                          <strong className="thread-title as-text">{subject}</strong>
                          <button type="button" className="btn" aria-label={`Edit ${subject}`} onClick={() => setEditing({ kind, rule })}>
                            Edit
                          </button>
                          <button type="button" className="btn ghost" aria-label={`Stop tracking ${subject}`} onClick={() => setDeleting(rule)}>
                            Remove
                          </button>
                        </div>
                        <p>{detail}</p>
                        {rule.aliases.length > 0 && <p className="muted small">Also written as: {rule.aliases.join(', ')}</p>}
                        {broken && <p className="event-flag small">This cannot be checked as it stands: something it needs is missing.</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      {editing && (
        <Modal title={editing.rule ? `Edit: ${KIND_LABELS[editing.kind]}` : `Track: ${KIND_LABELS[editing.kind]}`} onClose={() => setEditing(null)}>
          <RuleForm
            key={editing.rule?.id ?? editing.kind}
            kind={editing.kind}
            rule={editing.rule}
            entries={entries}
            nodes={nodes}
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await (editing.rule ? api.updateRule(editing.rule.id, input) : api.createRule(editing.kind, input));
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {confirming && (
        <ConfirmDialog
          title="Update canon"
          confirmLabel="Update canon"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { fix } = confirming;
            setConfirming(null);
            if (fix) act(api.applyFix(fix));
          }}
        >
          <p>{confirming.fixSummary}</p>
          <p className="muted small">This changes what is recorded so that it agrees with the passage. Your manuscript is not touched.</p>
        </ConfirmDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="Stop tracking"
          confirmLabel="Stop tracking"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const rule = deleting;
            setDeleting(null);
            act(api.removeRule(rule.id));
          }}
        >
          <p>
            Stop checking the manuscript against <strong>{describeRule(deleting, entries, nodes).subject}</strong>? The Codex entry and your text are not changed.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
