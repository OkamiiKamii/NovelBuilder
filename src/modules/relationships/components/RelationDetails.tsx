import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import type { StoryNode } from '@/modules/manuscript/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import { STANDARD_CALENDAR } from '@/modules/timeline/calendar';
import { formatDate } from '@/modules/timeline/chronology';
import { DateFields } from '@/modules/timeline/components/DateFields';
import { useCalendar } from '@/modules/timeline/hooks';
import type { ProjectRelationships, StageInput } from '../service';
import { stageDifferences, timelineOf, type StoryOrder } from '../timeline';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core';
import { connectionType, wordingOf } from '@/modules/connections/types';
import { ATTRIBUTE_MAX, AFFINITIES, AFFINITY_LABELS, RELATION_CATEGORIES, RELATION_CATEGORY_LABELS, type Affinity, type CharacterRelation, type RelationCategory, type RelationSettings, type RelationStage, NO_SETTINGS } from '../types';
import { TypeOptions } from './RelationSettings';

interface RelationDetailsProps {
  relation: CharacterRelation;
  /** The novel's own types and the attributes it tracks; read here when not given. */
  settings?: RelationSettings;
  entries: LoreEntry[];
  nodes: StoryNode[];
  order: StoryOrder;
  api: ProjectRelationships;
  projectId: string;
  onClose: () => void;
  onError: (error: unknown) => void;
}

/** Everything about one relationship: who, and how it stands at each stage of the story. */
export function RelationDetails({ relation, settings: given, entries, nodes, order, api, projectId, onClose, onError }: RelationDetailsProps) {
  const loaded = useLiveQuery(() => (given ? undefined : api.settings()), [api, given]);
  const settings: RelationSettings = given ?? loaded ?? { id: '', projectId, updatedAt: 0, ...NO_SETTINGS };
  // Other connections recorded between the same two characters ("Mira distrusts Orrin"): shared records of their own, shown here, kept where they are.
  const between = useLiveQuery(() => db.loreLinks.where('projectId').equals(projectId).filter((l) => l.type !== undefined && ((l.fromId === relation.fromId && l.toId === relation.toId) || (l.fromId === relation.toId && l.toId === relation.fromId))).toArray(), [projectId, relation.fromId, relation.toId]) ?? [];
  const [confirming, setConfirming] = useState(false);
  const [newStart, setNewStart] = useState('');
  const from = entries.find((e) => e.id === relation.fromId);
  const to = entries.find((e) => e.id === relation.toId);
  const timeline = timelineOf(relation, order);
  const points = flatten(buildTree(nodes)).filter((t) => t.node.kind !== 'scene');
  const run = (task: Promise<unknown>) => void task.catch(onError);
  const fromName = from?.name ?? 'Unknown';
  const toName = to?.name ?? 'Unknown';
  const events = useLiveQuery(() => db.timelineEvents.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const calendar = useCalendar(projectId) ?? STANDARD_CALENDAR;
  const eventName = (id: string) => events.find((e) => e.id === id)?.name;
  const documents = flatten(buildTree(nodes));
  const nodeTitle = (id: string) => documents.find((t) => t.node.id === id)?.node.title;
  /** When it changed in story time, in words, or null when not said. */
  const storyWords = (point: RelationStage['storyAt']): string | null => {
    if (!point) return null;
    if (point.kind === 'event') {
      const event = events.find((e) => e.id === point.eventId);
      return event ? `at “${event.name}” (${formatDate(event.when, eventName, calendar)})` : 'at an event since deleted';
    }
    return formatDate(point.when, eventName, calendar);
  };
  /** What brought it about, in words, only as the author has said it. */
  const causeWords = (stage: RelationStage): string | null => {
    const parts = [stage.causeEventId ? `“${eventName(stage.causeEventId) ?? 'an event since deleted'}”` : '', stage.causeNodeId ? `shown in ${nodeTitle(stage.causeNodeId) ?? 'a chapter since deleted'}` : ''].filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  };
  const UNKNOWN = '__unknown';

  const startOptions = (
    <>
      <option value="">Start of the story</option>
      <option value={UNKNOWN}>Not said</option>
      {points.map(({ node, depth }) => (
        <option key={node.id} value={node.id}>
          {'  '.repeat(depth) + (node.kind === 'chapter' ? `${order.chapterNumber.get(node.id)}. ` : '') + node.title}
        </option>
      ))}
    </>
  );

  return (
    <div className="stack rel-details">
      <div className="details-head">
        <h2>
          <Link to={`/project/${projectId}/characters/${relation.fromId}`}>{fromName}</Link> &amp; <Link to={`/project/${projectId}/characters/${relation.toId}`}>{toName}</Link>
        </h2>
        <button type="button" className="btn ghost icon" aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>

      <section className="stack" aria-label="How it evolved">
        <h3>How it evolved</h3>
        <ol className="small rel-evolved">
          {timeline.map(({ stage, range }, i) => {
            const changes = stageDifferences(timeline[i - 1]?.stage ?? null, stage, { from: fromName, to: toName }, settings.attributes);
            const when = storyWords(stage.storyAt);
            const cause = causeWords(stage);
            return (
              <li key={stage.id}>
                <strong>{range}</strong>
                {when && <span className="muted"> · in story time {when}</span>}: {stage.label || 'Related'} · {AFFINITY_LABELS[stage.affinity]}
                {stage.title && ` · “${stage.title}”`}
                {i > 0 && <span> · {changes.length ? `changed ${changes.join('; ')}` : 'recorded again, unchanged'}</span>}
                {cause && <span> · brought about by {cause}</span>}
              </li>
            );
          })}
        </ol>
        <p className="muted small">Each change is a stage of its own: recording a change never alters how things stood before. Causes are only what you name; none is assumed.</p>
      </section>

      <ol className="rel-timeline" aria-label="History">
        {timeline.map(({ stage, range, orphaned }) => {
          const update = (changes: StageInput) => run(api.updateStage(relation.id, stage.id, changes));
          const at = relation.stages.findIndex((s) => s.id === stage.id);
          return (
            <li key={stage.id} className={`aff-border aff-${stage.affinity}`}>
              <div className="rel-stage-head">
                <strong>{range}</strong>
                <span className="muted small">
                  {stage.label || 'Related'} · {AFFINITY_LABELS[stage.affinity]}
                </span>
                {stage.startUnknown && (
                  <>
                    <button type="button" className="btn ghost icon" aria-label={`Move ${range} earlier`} disabled={at === 0} onClick={() => run(api.moveStage(relation.id, stage.id, -1))}>
                      ↑
                    </button>
                    <button type="button" className="btn ghost icon" aria-label={`Move ${range} later`} disabled={at === relation.stages.length - 1} onClick={() => run(api.moveStage(relation.id, stage.id, 1))}>
                      ↓
                    </button>
                  </>
                )}
                {relation.stages.length > 1 && (
                  <button type="button" className="btn ghost" aria-label={`Remove stage ${range}`} onClick={() => run(api.removeStage(relation.id, stage.id))}>
                    Remove
                  </button>
                )}
              </div>
              {orphaned && <p className="error small">The chapter this stage started at no longer exists. Pick where it starts.</p>}
              <div className="grid-2 tight">
                <label className="field">
                  <span>Starts at</span>
                  <select value={stage.startUnknown ? UNKNOWN : orphaned ? '' : (stage.startNodeId ?? '')} aria-label={`${range} starts at`} onChange={(e) => update(e.target.value === UNKNOWN ? { startUnknown: true } : { startNodeId: e.target.value || null })}>
                    {startOptions}
                  </select>
                </label>
                <label className="field">
                  <span>In story time</span>
                  <select
                    value={stage.storyAt?.kind === 'event' ? `event:${stage.storyAt.eventId}` : stage.storyAt?.kind === 'date' ? 'date' : ''}
                    aria-label={`${range} in story time`}
                    onChange={(e) => {
                      const value = e.target.value;
                      update({ storyAt: value.startsWith('event:') ? { kind: 'event', eventId: value.slice(6) } : value === 'date' ? { kind: 'date', when: { precision: 'approximate', year: 1, month: null, season: null } } : null });
                    }}
                  >
                    <option value="">Not said</option>
                    <option value="date">On a date…</option>
                    {events.length > 0 && (
                      <optgroup label="At an event">
                        {[...events].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                          <option key={e.id} value={`event:${e.id}`}>
                            {e.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
              </div>
              {stage.storyAt?.kind === 'date' && <DateFields when={stage.storyAt.when} calendar={calendar} onChange={(when) => update({ storyAt: { kind: 'date', when } })} />}
              <div className="grid-2 tight">
                <label className="field">
                  <span>Brought about by</span>
                  <select value={stage.causeEventId ?? ''} aria-label={`${range} brought about by`} onChange={(e) => update({ causeEventId: e.target.value || null })}>
                    <option value="">No event named</option>
                    {[...events].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Shown in</span>
                  <select value={stage.causeNodeId ?? ''} aria-label={`${range} shown in`} onChange={(e) => update({ causeNodeId: e.target.value || null })}>
                    <option value="">No chapter or scene named</option>
                    {documents.map(({ node, depth }) => (
                      <option key={node.id} value={node.id}>
                        {'  '.repeat(depth) + node.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!stage.causeEventId && !stage.causeNodeId && <p className="muted small">No cause recorded. None is assumed from when it happened.</p>}
              <div className="grid-2 tight">
                <label className="field">
                  <span>Type</span>
                  <select value={stage.preset} aria-label={`${range} type`} onChange={(e) => update({ preset: e.target.value })}>
                    <TypeOptions settings={settings} current={stage.preset} />
                  </select>
                </label>
                <label className="field">
                  <span>Affinity</span>
                  <select value={stage.affinity} aria-label={`${range} affinity`} onChange={(e) => update({ affinity: e.target.value as Affinity })}>
                    {AFFINITIES.map((affinity) => (
                      <option key={affinity} value={affinity}>
                        {AFFINITY_LABELS[affinity]}
                      </option>
                    ))}
                  </select>
                </label>
                {stage.preset === 'custom' && (
                  <label className="field">
                    <span>Group</span>
                    <select value={stage.category} aria-label={`${range} group`} onChange={(e) => update({ category: e.target.value as RelationCategory })}>
                      {RELATION_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {RELATION_CATEGORY_LABELS[category]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {stage.preset === 'custom' && (
                <>
                  <SavedText key={`${stage.id}-label`} label="Custom type" value={stage.label} placeholder="e.g. Blood oath" onSave={(label) => update({ label })} />
                  <div className="grid-2 tight">
                    <SavedText key={`${stage.id}-from`} label={`${fromName} is the…`} value={stage.fromRole} placeholder="Oath-holder" onSave={(fromRole) => update({ fromRole })} />
                    <SavedText key={`${stage.id}-to`} label={`${toName} is the…`} value={stage.toRole} placeholder="Sworn" onSave={(toRole) => update({ toRole })} />
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={stage.directional} onChange={(e) => update({ directional: e.target.checked })} />
                    One-way (draw an arrow from {fromName} to {toName})
                  </label>
                </>
              )}
              {stage.directional && (
                <p className="muted small">
                  {fromName} is the {stage.fromRole || 'first'}; {toName} is the {stage.toRole || 'second'}.
                </p>
              )}
              {settings.attributes.length > 0 && (
                <fieldset className="plan-group rel-attributes">
                  <legend>How they feel, 0 to {ATTRIBUTE_MAX}</legend>
                  {settings.attributes.map((attribute) => (
                    <div key={attribute.key} className="grid-2 tight">
                      <AttributeField label={`${fromName}’s ${attribute.label.toLowerCase()} toward ${toName}`} value={stage.attributes?.[attribute.key]?.from ?? null} onCommit={(from) => update({ attributes: { [attribute.key]: { from } } })} />
                      <AttributeField label={`${toName}’s ${attribute.label.toLowerCase()} toward ${fromName}`} value={stage.attributes?.[attribute.key]?.to ?? null} onCommit={(to) => update({ attributes: { [attribute.key]: { to } } })} />
                    </div>
                  ))}
                  <p className="muted small">Leave one empty when it is not said. Each way is its own: trust need not be returned.</p>
                </fieldset>
              )}
              <SavedText key={`${stage.id}-title`} label="Relationship title" value={stage.title} placeholder="e.g. Rivalry over the Royal Tournament" onSave={(title) => update({ title })} />
              <SavedText key={`${stage.id}-event`} label="Origin: what brought this about" multiline rows={2} value={stage.event} onSave={(event) => update({ event })} />
              <SavedText key={`${stage.id}-notes`} label="Reason / notes" multiline rows={3} value={stage.notes} onSave={(notes) => update({ notes })} />
            </li>
          );
        })}
      </ol>

      <div className="field">
        <span>Record a change in this relationship</span>
        <div className="history-save">
          <select value={newStart} aria-label="New stage starts at" onChange={(e) => setNewStart(e.target.value)}>
            {startOptions}
          </select>
          <button type="button" className="btn" onClick={() => run(api.addStage(relation.id, newStart === UNKNOWN ? null : newStart || null, { unknown: newStart === UNKNOWN }))}>
            Add stage
          </button>
        </div>
      </div>

      {between.length > 0 && (
        <section className="stack" aria-label="Also recorded between them">
          <h3>Also recorded between them</h3>
          <ul className="small">
            {between.map((link) => {
              const forward = link.fromId === relation.fromId;
              const words = wordingOf(link).forward || connectionType(link.type).label;
              return (
                <li key={link.id}>
                  {forward ? fromName : toName} — {words.toLowerCase()} — {forward ? toName : fromName}
                </li>
              );
            })}
          </ul>
          <p className="muted small">Connections of their own, made on the characters’ pages or in the codex. They are kept there, and read here.</p>
        </section>
      )}

      <div className="entry-foot">
        <button type="button" className="btn" onClick={() => run(api.reverse(relation.id))}>
          Swap who is who
        </button>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete relationship…
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete relationship"
          confirmLabel="Delete relationship"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void api.remove(relation.id).then(onClose, onError);
          }}
        >
          <p>
            Delete the relationship between <strong>{fromName}</strong> and <strong>{toName}</strong>, with its whole history? Both characters stay in your codex.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** A number from 0 to the maximum, or empty for "not said"; saved when the author leaves the field. A value off the scale is refused by the service, which says why. */
function AttributeField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const next = text.trim() === '' ? null : Number(text);
    if (next !== value) onCommit(next === null || Number.isFinite(next) ? next : NaN);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={0} max={ATTRIBUTE_MAX} step={1} value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  );
}
