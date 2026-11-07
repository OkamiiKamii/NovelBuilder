import { useState } from 'react';
import { tracker } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import { useMe } from '@/modules/collab/identity';
import { isDocument } from '@/modules/manuscript/tree';
import { useStoryModel } from '@/modules/model/hooks';
import type { StoryModel } from '@/modules/model/types';
import { can } from '@/modules/sync/access';
import { nodeLabel } from '@/modules/timeline/narrative';
import { decodeAnchor, encodeAnchor } from '@/modules/viz/params';
import { timelineRows } from '@/modules/visualize/summaries';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { ACTION_LABELS, appliesTo, changeLog, changeWords, isUnknownTime, progressAt, UNKNOWN_TIME, whenWords, type ProgressAction, type ProgressChange } from '../track';
import type { ChangeInput } from '../trackService';
import { TrackedCategories } from './TrackedCategories';

/** The points a change can be at, as menu options: not known, before the story, each chapter and scene in reading order, each event in story order. */
function WhenOptions({ model }: { model: StoryModel }) {
  const documents = [...model.nodes.values()].filter((n) => isDocument(n.kind) && model.order.position.has(n.id)).sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  const events = timelineRows(model);
  return (
    <>
      {documents.length > 0 && (
        <optgroup label="At a chapter or scene">
          {documents.map((n) => (
            <option key={n.id} value={encodeAnchor({ kind: 'node', nodeId: n.id })}>
              {nodeLabel(model, n.id)}
            </option>
          ))}
        </optgroup>
      )}
      {events.length > 0 && (
        <optgroup label="At an event">
          {events.map((e) => (
            <option key={e.id} value={encodeAnchor({ kind: 'event', eventId: e.id })}>
              {e.title}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

/** A change's time as a menu value, and back. */
const whenValue = (at: ProgressChange['at']): string => (at === null ? 'start' : isUnknownTime(at) ? '' : encodeAnchor(at));
const atOf = (value: string): ProgressChange['at'] => (value === 'start' ? null : value ? (decodeAnchor(value) ?? UNKNOWN_TIME) : UNKNOWN_TIME);

/** Recording a change, or changing one: the fields its category's shape asks for, and when it happens. */
function ChangeForm({ model, entryId, initial, onDone, onCancel }: { model: StoryModel; entryId: string; initial?: ProgressChange; onDone: (text: string) => void; onCancel?: () => void }) {
  const api = tracker.forProject(model.project.id);
  const offered = [...model.progressCategories.values()].filter((c) => appliesTo(c, entryId) || c.id === initial?.categoryId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? offered[0]?.id ?? '');
  const category = model.progressCategories.get(categoryId);
  const [action, setAction] = useState<ProgressAction>(initial?.action ?? 'set');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [value, setValue] = useState(initial?.value ?? '');
  const [refId, setRefId] = useState(initial?.refId ?? '');
  const [abilityId, setAbilityId] = useState(initial?.abilityId ?? '');
  const [when, setWhen] = useState(initial ? whenValue(initial.at) : '');
  const [cost, setCost] = useState(initial?.cost ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  if (!category) return null;
  const shape = category.shape;
  const actionNow: ProgressAction = shape === 'held' ? (action === 'lose' ? 'lose' : 'gain') : shape === 'moment' ? 'happen' : 'set';
  const listId = `progress-subjects-${categoryId}`;
  const subjects = [...new Set(model.progress.filter((c) => c.categoryId === categoryId && c.entryId === entryId && c.subject).map((c) => c.subject))];
  const others = [...model.entries.values()].filter((e) => e.id !== entryId);
  const input: ChangeInput = { entryId, categoryId, action: actionNow, subject, value, refId: refId || null, abilityId: abilityId || null, at: atOf(when), cost, note };

  return (
    <form
      className="stack tight progress-form"
      aria-label={initial ? 'Change the recorded change' : 'Record a change'}
      onSubmit={(e) => {
        e.preventDefault();
        void (initial ? api.update(initial.id, input) : api.record(input)).then(
          (saved) => {
            setError(null);
            if (!initial) {
              setSubject('');
              setValue('');
              setRefId('');
              setAbilityId('');
              setCost('');
              setNote('');
            }
            onDone(`${initial ? 'Saved' : 'Recorded'}: ${changeWords(saved, category, model)}.`);
          },
          (err) => setError(err instanceof Error ? err.message : String(err)),
        );
      }}
    >
      <div className="grid-2 tight">
        <label className="field">
          <span>What changes</span>
          <select aria-label="What changes" value={categoryId} disabled={Boolean(initial)} onChange={(e) => setCategoryId(e.target.value)}>
            {offered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>When</span>
          <select aria-label="When" value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">When is not known</option>
            <option value="start">Before the story</option>
            <WhenOptions model={model} />
          </select>
        </label>
        {shape === 'held' && (
          <label className="field">
            <span>Gained or lost</span>
            <select aria-label="Gained or lost" value={actionNow} onChange={(e) => setAction(e.target.value as ProgressAction)}>
              <option value="gain">{ACTION_LABELS.gain}</option>
              <option value="lose">{ACTION_LABELS.lose}</option>
            </select>
          </label>
        )}
        {shape !== 'value' && (
          <label className="field">
            <span>{shape === 'named' ? 'Which' : shape === 'held' ? 'What' : 'What happened'}</span>
            <input aria-label={shape === 'named' ? 'Which' : shape === 'held' ? 'What' : 'What happened'} list={listId} value={subject} placeholder={shape === 'named' ? 'Strength, Standing with the guild…' : shape === 'held' ? 'Fire Lance, the Ember Crown, Wolf form…' : 'First kill, Oath sworn…'} onChange={(e) => setSubject(e.target.value)} />
            <datalist id={listId}>
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        )}
        {(shape === 'value' || shape === 'named') && (
          <label className="field">
            <span>Set to</span>
            <input aria-label="Set to" list={`${listId}-ladder`} value={value} onChange={(e) => setValue(e.target.value)} />
            <datalist id={`${listId}-ladder`}>
              {category.ladder.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
        )}
        {(shape === 'held' || shape === 'moment') && (
          <label className="field">
            <span>Its codex entry (optional)</span>
            <select aria-label="Its codex entry" value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">None</option>
              <EntryOptions entries={others} />
            </select>
          </label>
        )}
        {(shape === 'held' || shape === 'moment') && model.abilities.size > 0 && (
          <label className="field">
            <span>Its ability in a system (optional)</span>
            <select aria-label="Its ability in a system" value={abilityId} onChange={(e) => setAbilityId(e.target.value)}>
              <option value="">None</option>
              {[...model.systems.values()].map((system) => (
                <optgroup key={system.id} label={system.name}>
                  {system.items.map((item) => (
                    <option key={item.id} value={`${system.id}/${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Cost (optional)</span>
          <input aria-label="Cost" value={cost} placeholder="What it cost, if anything" onChange={(e) => setCost(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Note (optional)</span>
        <textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions start">
        <button type="submit" className="btn primary">
          {initial ? 'Save the change' : 'Record the change'}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * ONE CHARACTER'S PROGRESSION
 * What they are like at a point (the end of the story, a chapter, an event),
 * the changes in order, and recording a new one. Only what is recorded is
 * shown: a character with nothing recorded has no level, no statistics, no
 * empty rows.
 */
export function ProgressTracker({ projectId, entryId }: { projectId: string; entryId: string }) {
  const model = useStoryModel(projectId);
  const me = useMe(projectId);
  const writes = can(me.role, 'write');
  const [asOf, setAsOf] = useState('end');
  const [editing, setEditing] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [removing, setRemoving] = useState<ProgressChange | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  if (model === undefined) return <p className="muted">Loading…</p>;
  const entry = model?.entries.get(entryId);
  if (!model || !entry) return null;
  const categories = [...model.progressCategories.values()];
  const offered = categories.filter((c) => appliesTo(c, entryId));
  const log = changeLog(model, entryId);
  const point = asOf === 'end' ? 'end' : (decodeAnchor(asOf) ?? 'end');
  const state = progressAt(model, entryId, point);
  const pointWords = point === 'end' ? 'the end of the story' : whenWords(point, model);
  const words = (c: ProgressChange) => log.find((l) => l.change.id === c.id)?.words ?? '';

  return (
    <section className="stack progress-tracker" aria-label={`${entry.name}’s progression`}>
      <div className="page-header">
        <div>
          <h3>Progression</h3>
          <p className="muted small">How {entry.name} changes over the story: only what you record, each change at the chapter, scene or event it happens at, when that is known.</p>
        </div>
        {writes && (
          <button type="button" className="btn ghost" onClick={() => setSetup(true)}>
            What is tracked…
          </button>
        )}
      </div>
      {notice && (
        <p className={notice.error ? 'error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {categories.length === 0 ? (
        <div className="empty-state stack tight">
          <p>This novel tracks nothing about how characters change yet.</p>
          <p className="muted small">Choose what to track (levels, ranks, titles, attributes, abilities, equipment, transformations, a class or job, milestones, restrictions, costs, or your own) and record each change as it happens. Nothing is assumed: {entry.name} shows only what you record.</p>
          {writes && (
            <button type="button" className="btn" onClick={() => setSetup(true)}>
              Choose what to track…
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="panel stack tight progress-state">
            <label className="field inline">
              <span>As of</span>
              <select aria-label="Progression as of" value={asOf} onChange={(e) => setAsOf(e.target.value)}>
                <option value="end">The end of the story</option>
                <WhenOptions model={model} />
              </select>
            </label>
            {log.length === 0 ? (
              <p className="muted">Nothing recorded for {entry.name} yet.</p>
            ) : state.categories.length === 0 ? (
              <p className="muted">Nothing recorded for {entry.name} can be placed at or before {pointWords}.</p>
            ) : (
              <dl className="progress-now" aria-label={`${entry.name} as of ${pointWords}`}>
                {state.categories.map(({ category, lines, moments, lost }) => (
                  <div key={category.id}>
                    <dt>{category.name}</dt>
                    <dd>
                      {lines.length > 0 && (
                        <ul>
                          {lines.map((l) => (
                            <li key={`${l.subject}|${l.change.id}`}>
                              {category.shape === 'named' ? (
                                <>
                                  {l.subject}: <strong>{l.value}</strong>
                                </>
                              ) : (
                                <strong>{l.value}</strong>
                              )}
                              {l.step && <span className="muted small"> ({l.step})</span>}
                              {l.uncertain.length > 0 && <span className="field-issue small"> · or {l.uncertain.map((u) => `${words(u)} (${whenWords(u.at, model)})`).join(', ')}: which comes later cannot be told</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {moments.length > 0 && <span>{moments.map((m) => m.subject).join(', ')}</span>}
                      {lost.length > 0 && <span className="muted small"> Once held: {lost.join(', ')}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {state.unplaced.length > 0 && (
              <div className="small" role="note">
                <span className="muted">Not placed against {pointWords} (recorded in story time against reading order, or with no time known): </span>
                {state.unplaced.map((c) => `${words(c)} (${whenWords(c.at, model)})`).join('; ')}.
              </div>
            )}
            {state.untracked.length > 0 && (
              <p className="muted small">
                Also tracked in this novel, nothing recorded for {entry.name}: {state.untracked.map((c) => c.name).join(', ')}.
              </p>
            )}
          </div>

          {log.length > 0 && (
            <section className="stack tight" aria-label="Changes in order">
              <h4>Changes, in order</h4>
              <ol className="viz-list progress-log">
                {log.map((l) =>
                  editing === l.change.id ? (
                    <li key={l.change.id}>
                      <ChangeForm model={model} entryId={entryId} initial={l.change} onDone={(text) => (setEditing(null), setNotice({ text }))} onCancel={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li key={l.change.id}>
                      <span className="muted small">{l.when}</span> <strong>{l.words}</strong>
                      {l.before !== null && <span className="muted"> (was {l.before})</span>} <span className="badge">{l.category?.name ?? 'A category that was removed'}</span>
                      {l.change.cost && <span className="small"> · cost: {l.change.cost}</span>}
                      {l.change.note && <div className="muted small">{l.change.note}</div>}
                      {writes && (
                        <span className="progress-actions">
                          <button type="button" className="link" aria-label={`Edit “${l.words}”`} onClick={() => setEditing(l.change.id)}>
                            Edit
                          </button>
                          <button type="button" className="link" aria-label={`Delete “${l.words}”`} onClick={() => setRemoving(l.change)}>
                            Delete
                          </button>
                        </span>
                      )}
                    </li>
                  ),
                )}
              </ol>
            </section>
          )}

          {writes &&
            (offered.length > 0 ? (
              <section className="stack tight" aria-label="Record a change">
                <h4>Record a change</h4>
                <ChangeForm model={model} entryId={entryId} onDone={(text) => setNotice({ text })} />
              </section>
            ) : (
              <p className="muted small">None of what this novel tracks applies to {entry.name}. Change that under “What is tracked…”.</p>
            ))}
        </>
      )}

      {setup && <TrackedCategories model={model} onClose={() => setSetup(false)} />}
      {removing && (
        <ConfirmDialog
          title="Delete this change"
          confirmLabel="Delete the change"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const gone = removing;
            setRemoving(null);
            void tracker
              .forProject(projectId)
              .remove(gone.id)
              .then(
                () => setNotice({ text: `Deleted: ${words(gone)}.` }),
                (e) => setNotice({ text: e instanceof Error ? e.message : String(e), error: true }),
              );
          }}
        >
          <p>
            Delete “{words(removing)}” ({whenWords(removing.at, model)})? Nothing else about {entry.name} changes. This cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
