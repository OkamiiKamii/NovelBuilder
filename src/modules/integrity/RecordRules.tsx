import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { continuity } from '@/core';
import { RECORD_RULES, RECORD_RULE_TEXT, type RecordFinding } from '@/modules/canon/checks';
import { decisionWord, INTENTIONAL_REASONS, SEVERITY_LABELS, type Resolution } from '@/modules/continuity/types';
import type { EntityRef } from '@/modules/model/types';
import { withDecisions } from '@/modules/timeline/review';

interface RecordRulesProps {
  projectId: string;
  findings: RecordFinding[];
  decisions: Resolution[];
  writable: boolean;
  act: (task: Promise<unknown>) => void;
  /** A link that opens a record where it is kept. */
  go: (ref: EntityRef) => ReactNode;
}

/**
 * The record check's canon and continuity rules (`canon/checks.ts`): each
 * rule in words with what it needs, each finding with the data it rests on
 * and the records to open. Nothing is changed here. The author fixes a
 * record, and the finding goes; or keeps a decision about it (intentional,
 * with why, or dismissed), stored with the continuity decisions.
 */
export function RecordRules({ projectId, findings, decisions, writable, act, go }: RecordRulesProps) {
  const { open, decided, gone } = withDecisions(findings, decisions, 'records|');
  const [explaining, setExplaining] = useState<{ key: string; note: string } | null>(null);
  const api = continuity.forProject(projectId);
  const base = `/project/${projectId}`;
  const decide = (finding: RecordFinding, kind: Resolution['kind'], note = '') => act(api.resolve({ key: finding.key, message: finding.message, nodeId: '' }, kind, note));
  const facts = (finding: RecordFinding) => finding.on.filter((k) => k.startsWith('fact:')).map((k) => k.slice(5));

  return (
    <section className="panel stack" aria-label="Canon and continuity rules">
      <h2>Canon and continuity rules</h2>
      <p className="muted small">What the structured records say about each other: canon statuses, tracked continuity, connections and when they hold, canon statements. The manuscript’s text is not read here. Fix the record and the finding goes, or keep a decision about it: mark it intentional (with why), or dismiss it.</p>
      {open.length === 0 && <p className="muted">None.</p>}
      {RECORD_RULES.filter((rule) => open.some((f) => f.rule === rule)).map((rule) => (
        <section key={rule} className="stack" aria-label={RECORD_RULE_TEXT[rule].title}>
          <h3>{RECORD_RULE_TEXT[rule].title}</h3>
          <p className="small">
            <strong>The rule:</strong> {RECORD_RULE_TEXT[rule].rule} <span className="muted">It needs: {RECORD_RULE_TEXT[rule].needs}</span>
          </p>
          <ul className="threads" aria-label={`Findings: ${RECORD_RULE_TEXT[rule].title}`}>
            {open
              .filter((f) => f.rule === rule)
              .map((finding) => (
                <li key={finding.key} className="thread issue">
                  <p className="issue-message">
                    <span className={`thread-status sev-${finding.severity}`}>{SEVERITY_LABELS[finding.severity]}</span> <strong>{finding.message}</strong>
                  </p>
                  <p className="small">Because: {finding.because}</p>
                  <p className="small">
                    To resolve, fix the record:{' '}
                    {[...finding.refs.map((ref) => <span key={`${ref.type}:${ref.id}`}>{go(ref)}</span>), ...facts(finding).map((id) => <Link key={id} to={`${base}/canon?fact=${id}`}>the canon statement</Link>), ...(rule === 'after-death' ? [<Link key="tracked" to={`${base}/continuity?tab=tracked`}>the tracked status</Link>] : [])].flatMap((link, i) => (i ? [', ', link] : [link]))}
                    .
                  </p>
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
                          <input value={explaining.note} list="record-reasons" aria-label="Why is this intentional?" autoFocus placeholder="A flashback, a ghost, a record kept on purpose…" onChange={(e) => setExplaining({ key: finding.key, note: e.target.value })} />
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
      <datalist id="record-reasons">
        {INTENTIONAL_REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {(decided.length > 0 || gone.length > 0) && (
        <details className="stack">
          <summary>Decided ({decided.length + gone.length})</summary>
          <ul className="threads" aria-label="Decided canon and continuity findings">
            {decided.map(({ finding, decision }) => (
              <li key={decision.id} className="thread issue reviewed">
                <p className="issue-message">
                  <span className="thread-status">{decisionWord(decision.kind)}</span> {finding.message}
                </p>
                <p className="small muted">The rule: {RECORD_RULE_TEXT[finding.rule].rule}</p>
                {decision.note && <p className="small">Your note: {decision.note}</p>}
                {writable && (
                  <button type="button" className="btn" aria-label={`Reopen: ${finding.message}`} onClick={() => act(api.reopen(decision.id))}>
                    Reopen
                  </button>
                )}
              </li>
            ))}
            {gone.map((decision) => (
              <li key={decision.id} className="thread issue reviewed">
                <p className="issue-message muted">No longer raised, the records have changed since: {decision.message}</p>
                {writable && (
                  <button type="button" className="btn ghost" onClick={() => act(api.reopen(decision.id))}>
                    Remove this decision
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
