import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { continuity, db } from '@/core';
import { KnowledgeChart, knowledgeLegend } from '@/modules/characters/components/KnowledgeChart';
import { AXIS_LABELS, KNOWLEDGE_RULE_TEXT, checkKnowledge, knowledgeSpread, recordWords, stateWords, whoKnowsWhat, type Axis, type KnowledgeFinding, type SpreadRow } from '@/modules/characters/knowledge';
import { AWARENESS_LABELS } from '@/modules/characters/types';
import { useMe } from '@/modules/collab/identity';
import { decisionWord } from '@/modules/continuity/types';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { withDecisions } from '@/modules/timeline/review';
import { Legend } from '@/modules/viz/components/Legend';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';

interface KnowledgeViewProps {
  model: StoryModel;
  projectId: string;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
}

/**
 * SECRETS AND KNOWLEDGE
 * One secret at a time: what is true, who holds what of it now, and how
 * that spread across the chapters and scenes (or the events of story
 * time), all read from the records the author keeps on each character's
 * Secrets tab. Checks run only from a stated rule and the author's own
 * marks; nothing is inferred and nothing is changed.
 */
export function KnowledgeView({ model, projectId, params, setParams, mode, setMode, pick }: KnowledgeViewProps) {
  const secrets = useLiveQuery(() => db.characterSecrets.where('projectId').equals(projectId).toArray(), [projectId]);
  const decisions = useLiveQuery(() => continuity.forProject(projectId).resolutions(), [projectId]);
  const me = useMe(projectId);
  const [chosen, setChosen] = useState<{ key: string; row: number; col: number } | null>(null);
  const [explaining, setExplaining] = useState<{ key: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!secrets || !decisions) return <VizState status={{ kind: 'loading' }} />;
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
  const owned = secrets.filter((s) => model.entries.has(s.entryId)).sort((a, b) => name(a.entryId).localeCompare(name(b.entryId)) || a.createdAt - b.createdAt);
  if (!owned.length) return <VizState status={{ kind: 'empty', message: 'No secrets yet. Add one on a character’s Secrets tab, then record there who knows it, where and how.' }} />;
  const secret = owned.find((s) => s.id === params.get('ksecret')) ?? owned[0];
  const axis: Axis = params.get('kaxis') === 'story' ? 'story' : 'reading';
  const other: Axis = axis === 'reading' ? 'story' : 'reading';
  const spread = knowledgeSpread(secret, model, axis);
  const elsewhere = knowledgeSpread(secret, model, other).points.length;
  const review = withDecisions(checkKnowledge([secret], model), decisions, 'knowledge|');
  const key = `${secret.id}|${axis}`;
  const cell = chosen?.key === key && chosen.row < spread.rows.length && chosen.col <= spread.points.length ? chosen : null;
  const writable = can(me.role, 'write');
  const owner = name(secret.entryId);
  const tab = `/project/${projectId}/characters/${secret.entryId}/secrets`;
  const act = (task: Promise<unknown>) => void task.then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  const decide = (f: KnowledgeFinding, kind: 'intentional' | 'dismissed', note = '') => act(continuity.forProject(projectId).resolve({ key: f.key, message: f.message, nodeId: '' }, kind, note));

  // A cell in words: the record in force, and what happens there.
  const words = (row: SpreadRow, col: number) => {
    if (col === spread.points.length) return `${row.name}, now: ${row.now.state ? `${AWARENESS_LABELS[row.now.state].toLowerCase()}${row.now.source === 'summary' ? ', from the simple lists, with no recorded history' : ''}` : 'nothing recorded'}`;
    const c = row.cells[col];
    const point = spread.points[col].label;
    const told = spread.tellings.filter((t) => t.point === col && t.toId === row.characterId).map((t) => `learns it from ${name(t.fromId)} here`);
    return [`${row.name}, ${point}: ${c.record ? stateWords(c.record) : 'nothing recorded yet'}`, c.here.length ? `${c.here.length === 1 ? 'a record' : `${c.here.length} records`} made here` : '', c.needs.length ? 'acts on it here' : '', ...told].filter(Boolean).join('; ');
  };

  const controls = (
    <div className="viz-toolbar kn-controls">
      <label className="field">
        <span>Which secret</span>
        <select aria-label="Which secret" value={secret.id} onChange={(e) => setParams({ ksecret: e.target.value })}>
          {owned.map((s) => (
            <option key={s.id} value={s.id}>
              {name(s.entryId)}: {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Along</span>
        <select aria-label="Along" value={axis} onChange={(e) => setParams({ kaxis: e.target.value === 'story' ? 'story' : null })}>
          <option value="reading">{AXIS_LABELS.reading}</option>
          <option value="story">{AXIS_LABELS.story}</option>
        </select>
      </label>
      <ViewSwitch mode={mode} onChange={setMode} visualLabel="Chart" />
    </div>
  );

  const detail = cell && (() => {
    const row = spread.rows[cell.row];
    if (cell.col === spread.points.length) {
      return (
        <>
          <p>
            <strong>{row.name}, now:</strong> {row.now.state ? AWARENESS_LABELS[row.now.state] : 'Nothing recorded'}
            {row.now.source === 'summary' && ' (from the simple lists: no recorded history)'}
          </p>
          {row.now.record && <p className="small">Their last record: {recordWords(row.now.record, model)}.</p>}
          {row.unplaced.length > 0 && <p className="small muted">Also in their history, with no {axis === 'reading' ? 'chapter or scene' : 'event'}: {row.unplaced.map((r) => recordWords(r, model)).join('; ')}.</p>}
        </>
      );
    }
    const c = row.cells[cell.col];
    const point = spread.points[cell.col];
    return (
      <>
        <p>
          <strong>
            {row.name}, {point.label}:
          </strong>{' '}
          {c.record ? AWARENESS_LABELS[c.record.state] : 'Nothing recorded yet'}
          {c.record?.belief && ` (“${c.record.belief}”)`}
        </p>
        {c.record && <p className="small">In force from: {recordWords(c.record, model)}.</p>}
        {c.here.length > 0 && c.here.some((r) => r !== c.record) && <p className="small">Recorded here: {c.here.map((r) => recordWords(r, model)).join('; ')}.</p>}
        {c.needs.map((n) => (
          <p key={n.id} className="small">
            You marked that {row.name} acts on it here{n.note && `: “${n.note}”`}.
          </p>
        ))}
        <div className="actions start">
          <button type="button" className="btn ghost" onClick={() => pick({ type: 'entry', id: row.characterId })}>
            Show {row.name}
          </button>
          <button type="button" className="btn ghost" onClick={() => pick(axis === 'reading' ? { type: 'node', id: point.id } : { type: 'event', id: point.id })}>
            Show {axis === 'reading' ? 'the chapter' : 'the event'}
          </button>
        </div>
      </>
    );
  })();

  const unplaced = spread.rows.flatMap((r) => r.unplaced);
  return (
    <div className="stack knowledge-view">
      {controls}
      <section className="stack" aria-label="The secret">
        <p>
          <strong>What is true:</strong> {secret.description.trim() || <span className="muted">Not written yet.</span>}
        </p>
        <p className="muted small">
          {owner}’s secret · {secret.status} · <Link to={tab}>Record who knows it on {owner}’s Secrets tab →</Link>
        </p>
        <h3>Who knows what now</h3>
        <ul className="kn-now" aria-label="Who knows what now">
          {whoKnowsWhat(secret, spread.rows.map((r) => r.characterId)).map((g) => (
            <li key={g.state ?? 'none'}>
              <span className={`kn-state kn-${g.state ?? 'none'}`}>{g.state ? AWARENESS_LABELS[g.state] : 'Nothing recorded'}</span>{' '}
              {g.ids
                .map((id) => {
                  const row = spread.rows.find((r) => r.characterId === id)!;
                  return `${row.name}${row.now.record?.belief ? ` (“${row.now.record.belief}”)` : ''}${row.now.source === 'summary' ? ' (no history)' : ''}`;
                })
                .join(', ')}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="stack" aria-label="How it spreads">
        <h3>How it spreads, {axis === 'reading' ? 'as the reader goes' : 'in story time'}</h3>
        {spread.points.length === 0 ? (
          <VizState
            status={{
              kind: 'empty',
              message: elsewhere ? `Nothing about this secret is placed ${axis === 'reading' ? 'in a chapter or scene' : 'at an event'}; ${elsewhere} ${elsewhere === 1 ? 'point is' : 'points are'} placed ${axis === 'reading' ? 'at events' : 'in chapters or scenes'}.` : `Nothing about this secret is placed at a chapter, scene or event yet. Record who learns it, and where, on ${owner}’s Secrets tab.`,
              action: elsewhere ? (
                <button type="button" className="btn" onClick={() => setParams({ kaxis: other === 'story' ? 'story' : null })}>
                  Show it {other === 'story' ? 'in story time' : 'as the reader goes'}
                </button>
              ) : (
                <Link to={tab} className="btn">
                  Open {owner}’s Secrets tab
                </Link>
              ),
            }}
          />
        ) : mode === 'visual' ? (
          <>
            <KnowledgeChart spread={spread} chosen={cell} onChoose={(row, col) => setChosen({ key, row, col })} words={words} />
            <Legend title="What the chart shows" items={knowledgeLegend()} />
            <div className="kn-detail" aria-live="polite">
              {detail ?? <p className="muted small">Choose a cell to see the record it rests on.</p>}
            </div>
          </>
        ) : (
          <ol className="viz-list kn-points" aria-label={`Who holds what, ${axis === 'reading' ? 'chapter by chapter' : 'event by event'}`}>
            {spread.points.map((p, col) => (
              <li key={p.id}>
                <strong>{p.label}</strong>
                {p.marks.length > 0 && <span className="badge">{p.marks.map((m) => (m === 'first' ? 'First figures here' : 'Revealed here')).join(' · ')}</span>}
                <ul>
                  {spread.rows.filter((r) => r.cells[col].record || r.cells[col].needs.length).map((r) => (
                    <li key={r.characterId}>{words(r, col)}</li>
                  ))}
                </ul>
              </li>
            ))}
            <li>
              <strong>Now</strong>
              <ul>
                {spread.rows.map((r) => (
                  <li key={r.characterId}>{words(r, spread.points.length)}</li>
                ))}
              </ul>
            </li>
          </ol>
        )}
        {unplaced.length > 0 && (
          <p className="muted small">
            With no {axis === 'reading' ? 'chapter or scene' : 'event'}, so in each history but at no point here: {unplaced.map((r) => recordWords(r, model)).join('; ')}.
          </p>
        )}
      </section>

      <section className="stack" aria-label="Checks">
        <h3>Checks</h3>
        <p className="muted small" role="status">
          {review.open.length === 0 ? 'Nothing to look at' : `${review.open.length} to look at`}
          {review.decided.length > 0 && ` · ${review.decided.length} decided`}
        </p>
        <details className="small">
          <summary>The rules, and what each needs</summary>
          <ul>
            {Object.values(KNOWLEDGE_RULE_TEXT).map((r) => (
              <li key={r.title}>
                <strong>{r.title}.</strong> {r.rule} <span className="muted">Needs: {r.needs}</span>
              </li>
            ))}
          </ul>
          <p className="muted">Nothing else is checked, and nothing is changed: someone with no record, or a record with no chapter or event, is never taken to know or not know.</p>
        </details>
        {review.open.length > 0 && (
          <ul className="threads" aria-label="To look at">
            {review.open.map((f) => (
              <li key={f.key} className="thread issue">
                <p className="issue-message">{f.message}</p>
                <p className="small muted">
                  The rule: {KNOWLEDGE_RULE_TEXT[f.rule].rule} {f.because}
                </p>
                {writable &&
                  (explaining?.key === f.key ? (
                    <form
                      className="actions start"
                      onSubmit={(e) => {
                        e.preventDefault();
                        decide(f, 'intentional', explaining.note);
                        setExplaining(null);
                      }}
                    >
                      <label className="field">
                        <span>Why is this intentional?</span>
                        <input value={explaining.note} aria-label="Why is this intentional?" autoFocus placeholder="A bluff, a lucky guess, a lie in the record…" onChange={(e) => setExplaining({ key: f.key, note: e.target.value })} />
                      </label>
                      <button type="submit" className="btn primary">
                        Save as intentional
                      </button>
                    </form>
                  ) : (
                    <div className="actions start">
                      <button type="button" className="btn" aria-label={`Mark as intentional: ${f.message}`} onClick={() => setExplaining({ key: f.key, note: '' })}>
                        Mark as intentional…
                      </button>
                      <button type="button" className="btn ghost" aria-label={`Dismiss: ${f.message}`} onClick={() => decide(f, 'dismissed')}>
                        Dismiss
                      </button>
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        )}
        {review.decided.length > 0 && (
          <ul className="threads" aria-label="Decided">
            {review.decided.map(({ finding, decision }) => (
              <li key={decision.id} className="thread issue reviewed">
                <p className="issue-message">
                  <span className="thread-status">{decisionWord(decision.kind)}</span> {finding.message}
                </p>
                {decision.note && <p className="small">Your note: {decision.note}</p>}
                {writable && (
                  <button type="button" className="btn ghost" aria-label={`Reopen: ${finding.message}`} onClick={() => act(continuity.forProject(projectId).reopen(decision.id))}>
                    Reopen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
