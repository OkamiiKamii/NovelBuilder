import { useState } from 'react';
import { Link } from 'react-router-dom';
import { continuity } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { decisionWord, INTENTIONAL_REASONS } from '@/modules/continuity/types';
import { can } from '@/modules/sync/access';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { useTimelineReview } from '../hooks';
import { REVIEW_RULES, RULE_TEXT, type ReviewFinding } from '../review';

/**
 * TIMELINE REVIEW
 * What the timeline's own records do not agree on: dates, ages, and where
 * characters are when. Each finding names its rule, what it rests on, and
 * the records to open. Nothing here changes the story or canon: the author
 * fixes a record (and the finding goes), or keeps a decision about it.
 */
export function TimelineReviewPage() {
  const project = useCurrentProject();
  const review = useTimelineReview(project.id);
  const api = continuity.forProject(project.id);
  const me = useMe(project.id);
  const writable = can(me.role, 'write');
  const [explaining, setExplaining] = useState<{ key: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!review) return null;
  const { model, open, decided, gone, findings } = review;
  const base = `/project/${project.id}`;
  const act = (task: Promise<unknown>) => void task.then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  const decide = (finding: ReviewFinding, kind: 'intentional' | 'dismissed', note = '') => act(api.resolve({ key: finding.key, message: finding.message, nodeId: '' }, kind, note));

  const records = (finding: ReviewFinding) => (
    <span className="small">
      {finding.eventIds.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <Link to={`${base}/timeline?event=${id}`}>Open “{model.events.get(id)?.name ?? 'an event'}”</Link>
        </span>
      ))}
      {finding.ruleId && (
        <>
          {', '}
          <Link to={`${base}/continuity?tab=tracked`}>the travel time</Link>
        </>
      )}
    </span>
  );

  return (
    <div className="stack timeline-review">
      <header className="page-header">
        <div>
          <h1>Timeline review</h1>
          <p className="muted" role="status">
            {open.length === 0 ? 'Nothing to look at' : `${open.length} to look at`} · {findings.length - open.length} decided · checked {model.events.size} {model.events.size === 1 ? 'event' : 'events'}
          </p>
        </div>
        <Link to={`${base}/timeline`} className="btn ghost">
          Back to the timeline
        </Link>
      </header>
      <p className="small">
        Each finding comes from one of the rules below, and is raised only when your records hold what the rule needs: no date, no place or no recorded travel time means no finding. Nothing here changes the story or canon. Fix the record and the finding goes, or keep a decision about it: mark it intentional (with why), or dismiss it. Decisions can be reopened.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {open.length === 0 && <p className="muted">The dates, ages and places in the timeline agree with each other and with the travel times you have recorded.</p>}
      {REVIEW_RULES.filter((rule) => open.some((f) => f.rule === rule)).map((rule) => (
        <section key={rule} className="panel stack" aria-label={RULE_TEXT[rule].title}>
          <h2>{RULE_TEXT[rule].title}</h2>
          <p className="small">
            <strong>The rule:</strong> {RULE_TEXT[rule].rule} <span className="muted">It needs: {RULE_TEXT[rule].needs}</span>
          </p>
          <ul className="threads" aria-label={`Findings: ${RULE_TEXT[rule].title}`}>
            {open
              .filter((f) => f.rule === rule)
              .map((finding) => (
                <li key={finding.key} className="thread issue">
                  <p className="issue-message">
                    <strong>{finding.message}</strong>
                  </p>
                  <p className="small">Because: {finding.because}</p>
                  <p>To resolve, fix the record: {records(finding)}.</p>
                  {writable &&
                    (explaining?.key === finding.key ? (
                      <form
                        className="stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          decide(finding, 'intentional', explaining.note);
                          setExplaining(null);
                        }}
                      >
                        <label className="field">
                          <span>Why is this intentional?</span>
                          <input value={explaining.note} list="review-reasons" aria-label="Why is this intentional?" autoFocus placeholder="A double, a portal, a lie in the record…" onChange={(e) => setExplaining({ key: finding.key, note: e.target.value })} />
                        </label>
                        <div className="actions start">
                          <button type="submit" className="btn primary">
                            Save as intentional
                          </button>
                          <button type="button" className="btn ghost" onClick={() => setExplaining(null)}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="actions start">
                        <button type="button" className="btn" aria-label={`Mark as intentional: ${finding.message}`} onClick={() => setExplaining({ key: finding.key, note: '' })}>
                          Mark as intentional…
                        </button>
                        <button type="button" className="btn ghost" aria-label={`Dismiss: ${finding.message}`} onClick={() => decide(finding, 'dismissed')}>
                          Dismiss
                        </button>
                      </div>
                    ))}
                </li>
              ))}
          </ul>
        </section>
      ))}
      <datalist id="review-reasons">
        {['A double or impostor', 'Magic or a portal', 'Time travel', 'The record is wrong in the story itself', ...INTENTIONAL_REASONS].map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      {(decided.length > 0 || gone.length > 0) && (
        <section className="panel stack" aria-label="Decided">
          <h2>Decided</h2>
          <p className="muted small">Findings you have marked intentional or dismissed. They stay decided while the records stay the same.</p>
          <ul className="threads" aria-label="Decided findings">
            {decided.map(({ finding, decision }) => (
              <li key={decision.id} className="thread issue reviewed">
                <p className="issue-message">
                  <span className="thread-status">{decisionWord(decision.kind)}</span> {finding.message}
                </p>
                <p className="small muted">The rule: {RULE_TEXT[finding.rule].rule}</p>
                {decision.note && <p className="small">Your note: {decision.note}</p>}
                {writable && (
                  <div className="actions start">
                    <button type="button" className="btn" aria-label={`Reopen: ${finding.message}`} onClick={() => act(api.reopen(decision.id))}>
                      Reopen
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {gone.length > 0 && (
            <>
              <h3 className="muted small">No longer raised: the records have changed since</h3>
              <ul className="threads">
                {gone.map((decision) => (
                  <li key={decision.id} className="thread issue reviewed">
                    <p className="issue-message muted">{decision.message}</p>
                    {writable && (
                      <button type="button" className="btn ghost" onClick={() => act(api.reopen(decision.id))}>
                        Remove this decision
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
