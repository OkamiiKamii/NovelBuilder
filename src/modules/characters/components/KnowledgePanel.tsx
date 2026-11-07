import { useState, type FormEvent } from 'react';
import { IfViewOn, ViewLink } from '@/modules/visualize/ViewLink';
import { characters } from '@/core';
import type { StoryNode } from '@/modules/manuscript/types';
import type { StoryOrder } from '@/modules/relationships/timeline';
import type { TimelineEvent } from '@/modules/timeline/types';
import { currentOf, peopleOf, recordsOf } from '../knowledge';
import { AWARENESS, AWARENESS_LABELS, HAS_VERSION, type Awareness, type CharacterSecret, type KnowledgeNeed, type KnowledgeRecord } from '../types';
import { ChapterOptions } from './ChapterOptions';

interface KnowledgePanelProps {
  projectId: string;
  secret: CharacterSecret;
  /** Every character of the novel, the secret's own among them. */
  people: { id: string; name: string }[];
  nodes: StoryNode[];
  order: StoryOrder;
  events: TimelineEvent[];
  onError: (error: unknown) => void;
}

interface Draft {
  characterId: string;
  state: Awareness;
  belief: string;
  nodeId: string;
  eventId: string;
  how: string;
  fromId: string;
}
const BLANK: Draft = { characterId: '', state: 'knows', belief: '', nodeId: '', eventId: '', how: '', fromId: '' };
const draftOf = (r: KnowledgeRecord): Draft => ({ characterId: r.characterId, state: r.state, belief: r.belief, nodeId: r.nodeId ?? '', eventId: r.eventId ?? '', how: r.how, fromId: r.fromId ?? '' });
const changesOf = (d: Draft) => ({ characterId: d.characterId, state: d.state, belief: d.belief, nodeId: d.nodeId || null, eventId: d.eventId || null, how: d.how, fromId: d.fromId || null });

/**
 * How knowledge of a secret spreads, as the author records it: for each
 * character, what they hold at each point, in the order it happens to them,
 * and where they act on it. Nothing is worked out here: what is shown is
 * what was recorded.
 */
export function KnowledgePanel({ projectId, secret, people, nodes, order, events, onError }: KnowledgePanelProps) {
  const api = characters.forProject(projectId);
  const [editing, setEditing] = useState<string | null>(null);
  const records = secret.records ?? [];
  const needs = secret.needs ?? [];
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? 'Someone') : '');
  const nodeName = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.title : undefined);
  const eventName = (id: string | null) => (id ? events.find((e) => e.id === id)?.name : undefined);
  const where = (item: { nodeId: string | null; eventId: string | null }) => [nodeName(item.nodeId), eventName(item.eventId) && `at “${eventName(item.eventId)}”`].filter(Boolean).join(', ') || 'No chapter or event given';
  const run = (task: Promise<unknown>) => task.then(() => undefined, (e) => { onError(e); throw e; });
  const holders = peopleOf(secret).filter((id) => recordsOf(secret, id).length);

  return (
    <details className="secret-knowledge" open={records.length > 0 || needs.length > 0 || undefined}>
      <summary>
        How knowledge spreads{records.length > 0 && ` · ${records.length} ${records.length === 1 ? 'record' : 'records'}`}
        {needs.length > 0 && ` · ${needs.length} ${needs.length === 1 ? 'mark' : 'marks'}`}
      </summary>
      <div className="stack">
        <p className="muted small">
          Record what a character holds of this secret, and where: in a chapter or scene, at an event, or both. When what they know changes, add a record: the earlier ones stay. Nothing is worked out for you: someone with no record is “not recorded”, never assumed unaware.
        </p>
        {holders.map((id) => {
          const mine = recordsOf(secret, id);
          const name = nameOf(id);
          return (
            <section key={id} className="kn-holder" aria-label={`What ${name} holds`}>
              <h4>
                {name} <span className="muted small">now: {AWARENESS_LABELS[currentOf(secret, id).state!]}</span>
              </h4>
              <ol className="kn-records">
                {mine.map((r, i) => {
                  const label = `${name}’s record ${i + 1}`;
                  return editing === r.id ? (
                    <li key={r.id}>
                      <KnowledgeForm label={`Change ${label}`} submitLabel="Save" initial={draftOf(r)} fixed={name} people={people} nodes={nodes} order={order} events={events} onSubmit={(d) => run(api.saveRecord(secret.entryId, secret.id, r.id, changesOf(d))).then(() => setEditing(null))} onCancel={() => setEditing(null)} />
                    </li>
                  ) : (
                    <li key={r.id} className="kn-record" aria-label={label}>
                      <span className={`kn-state kn-${r.state}`}>{AWARENESS_LABELS[r.state]}</span>
                      {r.belief && <span> “{r.belief}”</span>}
                      <span className="muted small">
                        {' '}
                        · {where(r)}
                        {r.how && ` · ${r.how}`}
                        {r.fromId && ` · from ${nameOf(r.fromId)}`}
                      </span>
                      <span className="kn-actions">
                        <button type="button" className="btn ghost icon" aria-label={`Change ${label}`} onClick={() => setEditing(r.id)}>
                          ✎
                        </button>
                        <button type="button" className="btn ghost icon" aria-label={`Move ${label} earlier`} disabled={i === 0} onClick={() => void run(api.moveRecord(secret.entryId, secret.id, r.id, -1)).catch(() => undefined)}>
                          ↑
                        </button>
                        <button type="button" className="btn ghost icon" aria-label={`Move ${label} later`} disabled={i === mine.length - 1} onClick={() => void run(api.moveRecord(secret.entryId, secret.id, r.id, 1)).catch(() => undefined)}>
                          ↓
                        </button>
                        <button type="button" className="btn ghost icon" aria-label={`Remove ${label}`} onClick={() => void run(api.removeRecord(secret.entryId, secret.id, r.id)).catch(() => undefined)}>
                          ✕
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <KnowledgeForm label="Record what someone knows" submitLabel="Record it" initial={BLANK} people={people} nodes={nodes} order={order} events={events} onSubmit={(d) => run(api.saveRecord(secret.entryId, secret.id, null, changesOf(d)))} />

        <section className="stack" aria-label="Where someone acts on it">
          <h4>Where someone acts on it</h4>
          <p className="muted small">Mark where a character does something that needs this knowledge. These marks are what the checks in Visualize test, against the records above; without a mark, nothing is checked.</p>
          {needs.length > 0 && (
            <ul className="kn-records">
              {needs.map((n: KnowledgeNeed) => (
                <li key={n.id} className="kn-record">
                  <strong>{nameOf(n.characterId)}</strong> acts on it <span className="muted small">· {where(n)}</span>
                  {n.note && <span> · “{n.note}”</span>}
                  <span className="kn-actions">
                    <button type="button" className="btn ghost icon" aria-label={`Remove the mark: ${nameOf(n.characterId)}, ${where(n)}`} onClick={() => void run(api.removeNeed(secret.entryId, secret.id, n.id)).catch(() => undefined)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <NeedForm people={people} nodes={nodes} order={order} events={events} onSubmit={(d) => run(api.saveNeed(secret.entryId, secret.id, null, { characterId: d.characterId, nodeId: d.nodeId || null, eventId: d.eventId || null, note: d.note }))} />
        </section>
        <IfViewOn view="knowledge">
          <p className="small">
            <ViewLink to={`/project/${projectId}/visualize/knowledge?ksecret=${secret.id}`}>See how it spreads, and the checks →</ViewLink>
          </p>
        </IfViewOn>
      </div>
    </details>
  );
}

interface PlaceProps {
  nodes: StoryNode[];
  order: StoryOrder;
  events: TimelineEvent[];
  nodeId: string;
  eventId: string;
  onChange: (place: { nodeId?: string; eventId?: string }) => void;
}

/** Where something happens: a chapter or scene (where the reader sees it), and an event (when it happens in story time). */
function PlaceFields({ nodes, order, events, nodeId, eventId, onChange }: PlaceProps) {
  return (
    <>
      <label className="field">
        <span>Chapter or scene</span>
        <select value={nodeId} aria-label="Chapter or scene" onChange={(e) => onChange({ nodeId: e.target.value })}>
          <option value="">Not said</option>
          <ChapterOptions nodes={nodes} order={order} />
        </select>
      </label>
      {events.length > 0 && (
        <label className="field">
          <span>Event</span>
          <select value={eventId} aria-label="Event" onChange={(e) => onChange({ eventId: e.target.value })}>
            <option value="">Not said</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

interface KnowledgeFormProps {
  label: string;
  submitLabel: string;
  initial: Draft;
  /** The character's name, when changing one of their records: who it is about does not change. */
  fixed?: string;
  people: { id: string; name: string }[];
  nodes: StoryNode[];
  order: StoryOrder;
  events: TimelineEvent[];
  onSubmit: (draft: Draft) => Promise<unknown>;
  onCancel?: () => void;
}

function KnowledgeForm({ label, submitLabel, initial, fixed, people, nodes, order, events, onSubmit, onCancel }: KnowledgeFormProps) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const change = (changes: Partial<Draft>) => setDraft((d) => ({ ...d, ...changes }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.characterId || busy) return;
    // A new record clears the form as it is sent, so the next can be started at once; if saving fails, what was sent comes back.
    const sent = draft;
    setBusy(true);
    if (!fixed) setDraft(BLANK);
    onSubmit(sent).then(
      () => setBusy(false),
      () => {
        setBusy(false);
        if (!fixed) setDraft((d) => (d === BLANK ? sent : d));
      },
    );
  };
  return (
    <form className="kn-form" aria-label={label} onSubmit={submit}>
      {!fixed && <p className="kn-form-title small">{label}</p>}
      <div className="kn-form-grid">
        {fixed ? (
          <p className="field">
            <span>Character</span>
            <strong>{fixed}</strong>
          </p>
        ) : (
          <label className="field">
            <span>Character</span>
            <select value={draft.characterId} aria-label="Character" onChange={(e) => change({ characterId: e.target.value, fromId: e.target.value === draft.fromId ? '' : draft.fromId })}>
              <option value="">Choose…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>What they hold</span>
          <select value={draft.state} aria-label="What they hold" onChange={(e) => change({ state: e.target.value as Awareness })}>
            {AWARENESS.map((s) => (
              <option key={s} value={s}>
                {AWARENESS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {HAS_VERSION.includes(draft.state) && (
          <label className="field kn-wide">
            <span>{draft.state === 'false' ? 'What they believe instead' : draft.state === 'partial' ? 'The part they know' : 'What they think'}</span>
            <input value={draft.belief} aria-label={draft.state === 'false' ? 'What they believe instead' : draft.state === 'partial' ? 'The part they know' : 'What they think'} placeholder={draft.state === 'false' ? 'e.g. that he is a foundling from the docks' : 'In their words'} onChange={(e) => change({ belief: e.target.value })} />
          </label>
        )}
        <PlaceFields nodes={nodes} order={order} events={events} nodeId={draft.nodeId} eventId={draft.eventId} onChange={change} />
        <label className="field">
          <span>How they came by it</span>
          <input value={draft.how} aria-label="How they came by it" placeholder="Overheard, a letter, worked it out…" onChange={(e) => change({ how: e.target.value })} />
        </label>
        <label className="field">
          <span>From whom</span>
          <select value={draft.fromId} aria-label="From whom" onChange={(e) => change({ fromId: e.target.value })}>
            <option value="">No one, or not said</option>
            {people.filter((p) => p.id !== draft.characterId).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions start">
        <button type="submit" className="btn primary" disabled={!draft.characterId || busy}>
          {submitLabel}
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

function NeedForm({ people, nodes, order, events, onSubmit }: Pick<KnowledgeFormProps, 'people' | 'nodes' | 'order' | 'events'> & { onSubmit: (draft: { characterId: string; nodeId: string; eventId: string; note: string }) => Promise<unknown> }) {
  const blank = { characterId: '', nodeId: '', eventId: '', note: '' };
  const [draft, setDraft] = useState(blank);
  const ready = Boolean(draft.characterId && (draft.nodeId || draft.eventId));
  return (
    <form
      className="kn-form"
      aria-label="Mark where someone acts on it"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        const sent = draft;
        setDraft(blank);
        void onSubmit(sent).catch(() => setDraft((d) => (d.characterId ? d : sent)));
      }}
    >
      <div className="kn-form-grid">
        <label className="field">
          <span>Character</span>
          <select value={draft.characterId} aria-label="Character" onChange={(e) => setDraft({ ...draft, characterId: e.target.value })}>
            <option value="">Choose…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <PlaceFields nodes={nodes} order={order} events={events} nodeId={draft.nodeId} eventId={draft.eventId} onChange={(place) => setDraft({ ...draft, ...place })} />
        <label className="field kn-wide">
          <span>What they do with it</span>
          <input value={draft.note} aria-label="What they do with it" placeholder="e.g. blackmails the steward" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </label>
      </div>
      <div className="actions start">
        <button type="submit" className="btn" disabled={!ready}>
          Mark it
        </button>
      </div>
    </form>
  );
}
