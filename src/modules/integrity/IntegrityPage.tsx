import { useLiveQuery } from 'dexie-react-hooks';
import { DecisionNote } from '@/modules/continuity/components/DecisionNote';
import { closes } from '@/modules/continuity/types';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ViewLink } from '@/modules/visualize/ViewLink';
import { canon, continuity, db, integrity, structure } from '@/core';
import { checkRecords } from '@/modules/canon/checks';
import { useMe } from '@/modules/collab/identity';
import { deriveConnections } from '@/modules/model/connections';
import { useStoryModel } from '@/modules/model/hooks';
import { resolveRef } from '@/modules/model/model';
import { routeFor } from '@/modules/model/navigate';
import type { EntityRef } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { withDecisions } from '@/modules/timeline/review';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { brokenReferences, CONNECTION_STATUS_LABELS, duplicateCandidates, FIXABLE, GOES_WHOLE, statusOf, unfitEntries, unresolvedFields, unsuitedKinds, type BrokenReference, type DuplicatePair } from './rules';
import { RecordRules } from './RecordRules';
import { tableWords, type MergePlan } from './service';

/**
 * RECORD CHECK
 * How the novel's records point at one another, checked by stated rules:
 * references to records that no longer exist, reference fields that name
 * nothing, records that look like duplicates, connections marked disputed
 * or invalid, and the canon and continuity rules for structured records. Nothing changes until the author chooses a fix; a
 * merge is shown in full first, and every reference follows it.
 */
export function IntegrityPage() {
  const project = useCurrentProject();
  const model = useStoryModel(project.id);
  const markers = useLiveQuery(() => structure.forProject(project.id).list(), [project.id]);
  const decisions = useLiveQuery(() => continuity.forProject(project.id).resolutions(), [project.id]);
  const profiles = useLiveQuery(() => db.characterProfiles.where('projectId').equals(project.id).toArray(), [project.id]);
  const facts = useLiveQuery(() => canon.forProject(project.id).list(), [project.id]);
  const rules = useLiveQuery(() => continuity.forProject(project.id).rules(), [project.id]);
  const me = useMe(project.id);
  const writable = can(me.role, 'write');
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<{ pair: DuplicatePair; keepId: string; plan: MergePlan | null } | null>(null);
  const api = integrity.forProject(project.id);
  const base = `/project/${project.id}`;

  const found = useMemo(() => {
    if (!model || !markers || !profiles || !facts || !rules) return null;
    const aliases = new Map(profiles.map((p) => [p.entryId, p.aliases]));
    return {
      broken: brokenReferences(model, markers),
      unresolved: unresolvedFields(model),
      unfit: unfitEntries(model),
      unsuited: unsuitedKinds(model),
      duplicates: duplicateCandidates([...model.entries.values()], aliases),
      flagged: deriveConnections(model).connections.filter((c) => {
        const status = statusOf(c);
        return status === 'disputed' || status === 'invalid';
      }),
      records: checkRecords(model, { facts, rules }),
    };
  }, [model, markers, profiles, facts, rules]);
  if (!found || !decisions || !model) return null;
  const dup = withDecisions(found.duplicates, decisions, 'integrity|');
  const records = withDecisions(found.records, decisions, 'records|');
  const decision = (key: string) => decisions.find((d) => d.key === key);
  const stillOpen = (key: string) => !decision(key) || !closes(decision(key)!);
  const open = [...found.broken, ...found.unresolved, ...found.unfit, ...found.unsuited].filter((f) => stillOpen(f.key)).length + dup.open.length + records.open.length;
  const act = (task: Promise<unknown>) => void task.then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  const name = (ref: EntityRef) => {
    const r = resolveRef(model, ref);
    return r.found ? r.view.label : 'something deleted';
  };
  const go = (ref: EntityRef, label?: string) => {
    const route = routeFor(project.id, model, ref);
    return route ? (
      <Link to={route.to} state={route.state}>
        {label ?? name(ref)}
      </Link>
    ) : null;
  };
  /** Where a broken reference is kept, to open it there. */
  const where = (b: BrokenReference) => {
    const ref: EntityRef | null =
      b.table === 'timelineEvents' ? { type: 'event', id: b.rowId } : b.table === 'plotThreads' ? { type: 'thread', id: b.rowId } : b.table === 'chapterPlans' || b.table === 'chapters' ? { type: 'node', id: b.rowId } : b.table === 'loreEntries' ? { type: 'entry', id: b.rowId } : b.table === 'characterRelations' ? { type: 'relation', id: b.rowId } : null;
    if (b.table === 'structureMarkers') return <ViewLink to={`${base}/visualize/structure`} said>Open the structural markers</ViewLink>;
    if (b.table === 'journeys') return <ViewLink to={`${base}/visualize/journeys`} said>Open the journeys</ViewLink>;
    const owner = b.table === 'progressChanges' ? model.progress.find((c) => c.id === b.rowId)?.entryId : undefined;
    if (owner && model.entries.has(owner)) return <Link to={`${base}/characters/${owner}/progression`}>Open {model.entries.get(owner)!.name}’s progression</Link>;
    return ref && resolveRef(model, ref).found ? go(ref, `Open where it is kept: ${name(ref)}`) : null;
  };
  const startMerge = (pair: DuplicatePair, keepId: string) => {
    setMerging({ pair, keepId, plan: null });
    const mergeId = keepId === pair.a.id ? pair.b.id : pair.a.id;
    api.mergePlan(keepId, mergeId).then((plan) => setMerging({ pair, keepId, plan }), (e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="stack integrity-page">
      <header className="page-header">
        <div>
          <h1>Record check</h1>
          <p className="muted" role="status">
            {open === 0 ? 'Nothing to look at' : `${open} to look at`}
            {dup.decided.length + records.decided.length > 0 && ` · ${dup.decided.length + records.decided.length} decided`} · checked {model.entries.size} entries, {model.nodes.size} chapters and scenes, {model.events.size} events, {model.threads.size} plot threads
          </p>
        </div>
      </header>
      <p className="muted small">Each finding comes from one rule below and the records it rests on: the same records, the same findings. Nothing here changes a record until you choose a fix, and a merge is shown in full before it is made.</p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      <section className="panel stack" aria-label="References to records that no longer exist">
        <h2>References to records that no longer exist</h2>
        <p className="muted small">The rule: a reference must name a record that exists. Connections, relationships, fields, links in the text, plans and appearance records, events, plot threads, system sheets and structural markers are all checked.</p>
        {found.broken.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {found.broken.map((b) => (
              <li key={b.key} className="thread issue">
                <p className="issue-message">{b.says}.</p>
                <p className="small muted">Kept in {b.where}.</p>
                <DecisionNote decision={decision(b.key)} projectId={project.id} />
                <div className="actions start">
                  {where(b)}
                  {writable && FIXABLE.has(b.table) && (
                    <button type="button" className="btn" onClick={() => act(api.removeReference(b.table, b.rowId, b.missing.id))}>
                      {GOES_WHOLE.has(b.table) ? 'Remove this connection' : 'Take this reference out'}
                    </button>
                  )}
                  {!FIXABLE.has(b.table) && <span className="muted small">Change it where it is kept: text is never changed from here.</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack" aria-label="References that name nothing">
        <h2>References that name nothing</h2>
        <p className="muted small">The rule: a field that refers to an entry (“Leader”, “Owner”) must hold an entry, not words. Words are kept as they are until you point the field at an entry.</p>
        {found.unresolved.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {found.unresolved.map((u) => (
              <li key={u.key} className="thread issue">
                <p className="issue-message">
                  {go({ type: 'entry', id: u.entry.id })}: “{u.fieldName}” holds “{u.value}”, which names no entry.
                </p>
                <DecisionNote decision={decision(u.key)} projectId={project.id} />
                <div className="actions start">
                  {u.suggestions.length === 0 && <span className="muted small">No entry has that name.</span>}
                  {writable &&
                    u.suggestions.map((s) => (
                      <button key={s.id} type="button" className="btn" onClick={() => act(api.pointField(u.entry.id, u.fieldId, u.value, s.id))}>
                        Point it at {s.name}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack" aria-label="Values that do not fit their fields">
        <h2>Values that do not fit their fields</h2>
        <p className="muted small">The rule: each value fits its field as the category defines it: a required field is filled in, a number is a number in its range, a date is a date, a choice is one of the choices, a link names an entry of the kind it is limited to. Values are kept as written until you change them.</p>
        {found.unfit.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {found.unfit.map((u) => (
              <li key={u.key} className="thread issue">
                <p className="issue-message">{go({ type: 'entry', id: u.entry.id })}</p>
                <DecisionNote decision={decision(u.key)} projectId={project.id} />
                <ul className="small">
                  {u.issues.map((i) => (
                    <li key={i.defId}>{i.message}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack" aria-label="Views set up on fields that no longer suit">
        <h2>Views set up on fields that no longer suit</h2>
        <p className="muted small">The rule: a view a kind of record is set up for (a timeline, a map, a rank, who holds it, its label and links in the knowledge graph) names fields that can fill it: still there, not archived, of a type the view reads. Settings are kept as they are; change them in the Codex, under Categories &amp; fields → Visualizations.</p>
        {found.unsuited.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {found.unsuited.map((u) => (
              <li key={u.key} className="thread issue">
                <p className="issue-message">
                  <Link to={`${base}/codex`}>{u.category.name}</Link>
                </p>
                <DecisionNote decision={decision(u.key)} projectId={project.id} />
                <ul className="small">
                  {u.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack" aria-label="Records that look like duplicates">
        <h2>Records that look like duplicates</h2>
        <p className="muted small">The rules: two entries of the same category whose names are the same once capitals, accents, punctuation and a leading “The” are set aside; or one whose name is the other’s alias. Nothing is merged unless you say so.</p>
        {dup.open.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {dup.open.map((pair) => (
              <li key={pair.key} className="thread issue">
                <p className="issue-message">
                  {go({ type: 'entry', id: pair.a.id })} and {go({ type: 'entry', id: pair.b.id })}
                </p>
                <p className="small muted">{pair.because}</p>
                {writable && (
                  <div className="actions start">
                    <button type="button" className="btn" onClick={() => startMerge(pair, pair.a.id)}>
                      Merge…
                    </button>
                    <button type="button" className="btn ghost" aria-label={`Not duplicates: ${pair.a.name} and ${pair.b.name}`} onClick={() => act(continuity.forProject(project.id).resolve({ key: pair.key, message: `${pair.a.name} and ${pair.b.name} are not duplicates`, nodeId: '' }, 'dismissed'))}>
                      Not duplicates
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {dup.decided.length > 0 && (
          <>
            <h3 className="muted small">Decided: not duplicates</h3>
            <ul className="threads">
              {dup.decided.map(({ finding, decision }) => (
                <li key={decision.id} className="thread issue reviewed">
                  <p className="issue-message muted">
                    {finding.a.name} and {finding.b.name}
                  </p>
                  {writable && (
                    <button type="button" className="btn ghost" onClick={() => act(continuity.forProject(project.id).reopen(decision.id))}>
                      Reopen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="panel stack" aria-label="Connections marked disputed or invalid">
        <h2>Connections marked disputed or invalid</h2>
        <p className="muted small">Connections you recorded and marked Disputed, or Invalid (retconned, or not canon). They are kept as you marked them; this lists them so they are not forgotten.</p>
        {found.flagged.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <ul className="threads">
            {found.flagged.map((c) => (
              <li key={c.id} className="thread issue">
                <p className="issue-message">
                  {go(c.from)} {c.label.charAt(0).toLowerCase() + c.label.slice(1)} {go(c.to)} <span className="badge">{CONNECTION_STATUS_LABELS[c.canon ?? 'canon']}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecordRules projectId={project.id} findings={found.records} decisions={decisions} writable={writable} act={act} go={(ref) => go(ref, `Open ${name(ref)}`) ?? name(ref)} />

      {merging && (
        <ConfirmDialog
          title="Merge two entries"
          confirmLabel="Merge them"
          requireText={(merging.keepId === merging.pair.a.id ? merging.pair.b : merging.pair.a).name}
          onCancel={() => setMerging(null)}
          onConfirm={() => {
            const { pair, keepId } = merging;
            setMerging(null);
            act(api.merge(keepId, keepId === pair.a.id ? pair.b.id : pair.a.id));
          }}
        >
          <fieldset className="stack">
            <legend>Which one to keep</legend>
            {[merging.pair.a, merging.pair.b].map((e) => (
              <label key={e.id} className="check">
                <input type="radio" name="keep" checked={merging.keepId === e.id} onChange={() => startMerge(merging.pair, e.id)} />
                Keep “{e.name}”
              </label>
            ))}
          </fieldset>
          {!merging.plan ? (
            <p className="muted">Working out what would change…</p>
          ) : (
            <div className="stack merge-plan" aria-label="What merging would do">
              <p>
                “{merging.plan.merge.name}” is merged into “{merging.plan.keep.name}”, and then deleted. Everything that pointed at it will point at “{merging.plan.keep.name}”:
              </p>
              <ul className="small">
                {merging.plan.repointed.length === 0 ? <li>Nothing points at it.</li> : merging.plan.repointed.map((r) => <li key={r.table}>{tableWords(r.table)}: {r.rows}</li>)}
              </ul>
              <p>Added to “{merging.plan.keep.name}”:</p>
              <ul className="small">
                {merging.plan.combined.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {merging.plan.dropped.length > 0 && (
                <>
                  <p>Not kept:</p>
                  <ul className="small">
                    {merging.plan.dropped.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="small muted">This cannot be undone. To go ahead, type the name of the one merged away.</p>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
