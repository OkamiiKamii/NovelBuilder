import { entryPath } from '@/modules/characters/hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ViewLink } from '@/modules/visualize/ViewLink';
import { EntryOptions } from '@/modules/codex/categories';
import type { LoreEntry } from '@/modules/codex/types';
import { buildTree, flatten, isDocument } from '@/modules/manuscript/tree';
import { storyOrder } from '@/modules/relationships/timeline';
import type { StoryNode } from '@/modules/manuscript/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { plot } from '@/core';
import { LabelPicker, useLabelSuggestions } from '@/modules/structure/components/LabelPicker';
import { CANON_STATUSES, STATUS_LABELS as CANON_LABELS, type CanonStatus } from '@/modules/canon/types';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import { daysIn, monthName, yearName, type Calendar } from '../calendar';
import { birthDateOf, lifePath } from '../ages';
import type { Placed } from '../chronology';
import type { ReviewFinding } from '../review';
import type { ProjectTimeline } from '../service';
import { EVENT_STATUS_LABELS, EVENT_STATUSES, IMPORTANCE, IMPORTANCE_LABELS, PRECISION_LABELS, type EventStatus, REVEAL_CHOICES, REVEAL_ROLES, type RevealRole, PRECISIONS, SEASON_LABELS, SEASONS, TIME_UNITS, type EventChanges, type EventDate, type Importance, type Precision, type Season, type TimeUnit, type TimelineEvent } from '../types';
import { AllConnections } from '@/modules/crossref/components/AllConnections';

/** A number field that saves when the author leaves it or presses Enter. */
function NumberField({ label, value, onCommit, min, placeholder, disabled }: { label: string; value: number | null; onCommit: (value: number | null) => void; min?: number; placeholder?: string; disabled?: boolean }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const next = text.trim() === '' || !Number.isFinite(Number(text)) ? null : Number(text);
    if (next !== value) onCommit(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={min} step={1} value={text} disabled={disabled} placeholder={placeholder} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  );
}

const yearOf = (when: EventDate) => ('year' in when ? when.year : null);

type Exact = Extract<EventDate, { precision: 'exact' }>;
type Approximate = Extract<EventDate, { precision: 'approximate' }>;
type Relative = Extract<EventDate, { precision: 'relative' }>;

/** The months to choose from, in the novel's calendar, and a month a stored date has that the calendar does not (kept, and said to be outside it). */
function MonthOptions({ calendar, month, value }: { calendar: Calendar; month: number | null; value: (m: number) => string }) {
  return (
    <>
      {calendar.months.map((name, i) => (
        <option key={`${i}-${name}`} value={value(i + 1)}>
          {name}
        </option>
      ))}
      {month !== null && month > calendar.months.length && <option value={value(month)}>{monthName(month, calendar)} (not in this calendar)</option>}
    </>
  );
}

/**
 * Edits are passed up as functions of the date as it is stored, not of the
 * date this component last rendered, so typing a year and picking a month in
 * quick succession cannot undo one another. Months, days and hours are the
 * novel's calendar's. `prefix` names a second date's fields apart ("End
 * year"), so both dates can be on screen at once.
 */
function DateEditor({ when, others, onChange, calendar, legend = 'When', prefix = '', precisions = PRECISIONS }: { when: EventDate; others: Placed[]; onChange: (edit: (stored: EventDate) => EventDate) => void; calendar: Calendar; legend?: string; prefix?: string; precisions?: readonly Precision[] }) {
  const named = (text: string) => (prefix ? `${prefix} ${text.toLowerCase()}` : text);
  const setPrecision = (precision: Precision) =>
    onChange((stored) => {
      const year = yearOf(stored) ?? 1;
      const month = 'month' in stored ? stored.month : null;
      if (precision === 'exact') return { precision, year, month, day: null, hour: null, minute: null };
      if (precision === 'approximate') return { precision, year, month, season: null };
      if (precision === 'relative') return { precision, anchorId: others[0]?.event.id ?? null, amount: 1, unit: 'years', direction: 'before' };
      return { precision };
    });
  const exact = (patch: Partial<Exact>) => onChange((stored) => (stored.precision === 'exact' ? { ...stored, ...patch } : stored));
  const approximate = (patch: Partial<Approximate>) => onChange((stored) => (stored.precision === 'approximate' ? { ...stored, ...patch } : stored));
  const relative = (patch: Partial<Relative>) => onChange((stored) => (stored.precision === 'relative' ? { ...stored, ...patch } : stored));
  // In a calendar with eras, the year is said the way the story says it.
  // A value the calendar does not have is said, not saved: the date stays as it was.
  const [problem, setProblem] = useState<string | null>(null);
  const ok = (task: () => void) => (setProblem(null), task());
  const era = (year: number) => (calendar.eras.length ? <span className="muted small date-era">{yearName(year, calendar)}</span> : null);

  return (
    <fieldset className="plan-group">
      <legend>{legend}</legend>
      <div className="segmented" role="radiogroup" aria-label={named('Date precision')}>
        {precisions.map((precision) => (
          <button key={precision} type="button" role="radio" aria-checked={when.precision === precision} className={when.precision === precision ? 'active' : ''} onClick={() => when.precision !== precision && setPrecision(precision)}>
            {PRECISION_LABELS[precision]}
          </button>
        ))}
      </div>

      {when.precision === 'exact' && (
        <div className="grid-2 tight">
          <div>
            <NumberField label={named('Year')} value={when.year} onCommit={(year) => (year === null ? setProblem('Give the year as a whole number; it was not changed.') : ok(() => exact({ year })))} />
            {era(when.year)}
          </div>
          <label className="field">
            <span>{named('Month')}</span>
            <select value={when.month ?? ''} aria-label={named('Month')} onChange={(e) => exact({ month: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Not set</option>
              <MonthOptions calendar={calendar} month={when.month} value={String} />
            </select>
          </label>
          <NumberField label={named('Day')} min={1} value={when.day} disabled={!when.month} placeholder={when.month ? `1–${daysIn(when.month, calendar)}` : undefined} onCommit={(day) => (day !== null && when.month && (day < 1 || day > daysIn(when.month, calendar)) ? setProblem(`${monthName(when.month, calendar)} has ${daysIn(when.month, calendar)} days: day ${day} was not saved.`) : ok(() => exact({ day })))} />
          {calendar.hoursPerDay === 24 ? (
            <label className="field">
              <span>{named('Time')}</span>
              <input
                type="time"
                aria-label={named('Time')}
                disabled={!when.day}
                value={when.hour === null ? '' : `${String(when.hour).padStart(2, '0')}:${String(when.minute ?? 0).padStart(2, '0')}`}
                onChange={(e) => {
                  const [hour, minute] = e.target.value.split(':').map(Number);
                  exact(e.target.value ? { hour, minute } : { hour: null, minute: null });
                }}
              />
            </label>
          ) : (
            // A day of another length than 24 hours: the hour and minute as numbers.
            <div className="grid-2 tight">
              <NumberField label={named('Hour')} min={0} value={when.hour} disabled={!when.day} placeholder={`0–${calendar.hoursPerDay - 1}`} onCommit={(hour) => (hour !== null && (hour < 0 || hour >= calendar.hoursPerDay) ? setProblem(`A day has ${calendar.hoursPerDay} hours, from 0 to ${calendar.hoursPerDay - 1}: hour ${hour} was not saved.`) : ok(() => exact(hour === null ? { hour: null, minute: null } : { hour, minute: when.minute ?? 0 })))} />
              <NumberField label={named('Minute')} min={0} value={when.minute} disabled={when.hour === null} placeholder="0–59" onCommit={(minute) => exact({ minute: minute ?? 0 })} />
            </div>
          )}
        </div>
      )}

      {when.precision === 'approximate' && (
        <div className="grid-2 tight">
          <div>
            <NumberField label={named('Year')} value={when.year} onCommit={(year) => year !== null && approximate({ year })} />
            {era(when.year)}
          </div>
          <label className="field">
            <span>{named('Part of the year')}</span>
            <select
              value={when.month ? `m${when.month}` : (when.season ?? '')}
              aria-label={named('Part of the year')}
              onChange={(e) => {
                const value = e.target.value;
                approximate({ month: value.startsWith('m') ? Number(value.slice(1)) : null, season: SEASONS.includes(value as Season) ? (value as Season) : null });
              }}
            >
              <option value="">Sometime that year</option>
              <optgroup label="Season">
                {SEASONS.map((season) => (
                  <option key={season} value={season}>
                    {SEASON_LABELS[season]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Month">
                <MonthOptions calendar={calendar} month={when.month} value={(m) => `m${m}`} />
              </optgroup>
            </select>
          </label>
        </div>
      )}

      {when.precision === 'relative' && (
        <>
          <div className="relative-date">
            <span>About</span>
            <NumberField label={named('Amount')} min={0} value={when.amount} onCommit={(amount) => relative({ amount: amount ?? 0 })} />
            <select value={when.unit} aria-label={named('Unit')} onChange={(e) => relative({ unit: e.target.value as TimeUnit })}>
              {TIME_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <select value={when.direction} aria-label={named('Before or after')} onChange={(e) => relative({ direction: e.target.value as 'before' | 'after' })}>
              <option value="before">before</option>
              <option value="after">after</option>
            </select>
          </div>
          <select value={when.anchorId ?? ''} aria-label={named('Relative to')} onChange={(e) => relative({ anchorId: e.target.value || null })}>
            <option value="">Choose an event…</option>
            {others.map(({ event }) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </>
      )}
      {when.precision === 'unknown' && <p className="muted small">No date. Set “Comes after” below to give it a place in the order.</p>}
      {problem && (
        <p className="error small" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

type EndMode = '' | 'date' | 'unknown' | 'ongoing';
const endModeOf = (event: TimelineEvent): EndMode => (event.ongoing ? 'ongoing' : event.end ? (event.end.precision === 'unknown' ? 'unknown' : 'date') : '');

/**
 * How an event ends: when its length runs out (or at once, for a moment), on
 * a date of its own (which can be as rough as "Spring of Year 14"), at a time
 * nobody has given, or not within the story at all. One way at a time; the
 * timeline draws each differently.
 */
function EventEnd({ event, others, calendar, update }: { event: TimelineEvent; others: Placed[]; calendar: Calendar; update: (changes: EventChanges | ((stored: TimelineEvent) => EventChanges)) => void }) {
  const mode = endModeOf(event);
  const choose = (next: EndMode) =>
    update((stored): EventChanges => {
      if (next === 'ongoing') return { ongoing: true };
      if (next === 'unknown') return { end: { precision: 'unknown' } };
      if (next === 'date') {
        // Starts from the date it already has, or the day it begins, for the author to move on.
        const from = stored.end && stored.end.precision !== 'unknown' ? stored.end : stored.when.precision === 'exact' || stored.when.precision === 'approximate' ? stored.when : null;
        return { end: from ?? { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } };
      }
      return { end: null, ongoing: false };
    });
  return (
    <>
      <label className="field">
        <span>Ends</span>
        <select value={mode} aria-label="Ends" onChange={(e) => choose(e.target.value as EndMode)}>
          <option value="">{event.duration ? 'When the time it lasts is over' : 'At once: it is a moment'}</option>
          <option value="date">On a date…</option>
          <option value="unknown">At a time not given</option>
          <option value="ongoing">Still going on</option>
        </select>
      </label>
      {mode === 'unknown' && <p className="muted small">It lasts a while, but its end is not given yet. The timeline draws it fading out after it begins, and never says it is over.</p>}
      {mode === 'ongoing' && <p className="muted small">Still going on when the story ends: the timeline draws it to the edge, with an arrow.</p>}
      {mode === 'date' && event.end && (
        <DateEditor when={event.end} others={others} calendar={calendar} legend="Ends on" prefix="End" precisions={['exact', 'approximate', 'relative']} onChange={(edit) => update((stored) => (stored.end ? { end: edit(stored.end) } : {}))} />
      )}
    </>
  );
}

interface EventDetailsProps {
  placed: Placed;
  all: Placed[];
  entries: LoreEntry[];
  nodes: StoryNode[];
  api: ProjectTimeline;
  projectId: string;
  /** The novel's calendar, for its months, days and hours. */
  calendar: Calendar;
  /** Review findings about this event that its own checks do not raise (travel, two places at once, an end before the start). */
  findings?: ReviewFinding[];
  onClose: () => void;
  onError: (error: unknown) => void;
}

/** One event: when, where, who, what it links to, and where it sits in the order. */
export function EventDetails({ placed, all, entries, nodes, api, projectId, calendar, findings = [], onClose, onError }: EventDetailsProps) {
  const { event } = placed;
  const threads = useLiveQuery(() => plot.forProject(projectId).list(), [projectId]) ?? [];
  const labelSuggestions = useLabelSuggestions(projectId);
  const [confirming, setConfirming] = useState(false);
  /** Pass a function for any change that builds on the event's current lists or date. */
  const update = (changes: EventChanges | ((stored: TimelineEvent) => EventChanges)) => void api.update(event.id, changes).catch(onError);
  const others = all.filter((p) => p.event.id !== event.id);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byName = (a: LoreEntry, b: LoreEntry) => a.name.localeCompare(b.name);

  const cast = event.characters.flatMap((c) => (byId.has(c.id) ? [{ ...c, entry: byId.get(c.id)! }] : []));
  const availableCast = entries.filter((e) => e.category === 'character' && !event.characters.some((c) => c.id === e.id)).sort(byName);
  const locations = entries.filter((e) => e.category === 'location').sort(byName);
  const lore = event.entryIds.flatMap((id) => byId.get(id) ?? []);
  const availableLore = entries.filter((e) => e.category !== 'character' && !event.entryIds.includes(e.id)).sort(byName);
  const documents = flatten(buildTree(nodes)).filter((t) => isDocument(t.node.kind));
  // In reading order: the order the reader meets them, whatever order they were linked in.
  const linkedNodes = documents.filter((t) => event.nodeIds.includes(t.node.id));
  const order = storyOrder(nodes);
  const roleIn = (nodeId: string): RevealRole => event.reveals?.find((r) => r.nodeId === nodeId)?.role ?? 'told';
  const setRole = (nodeId: string, role: RevealRole) => update((stored) => ({ reveals: [...(stored.reveals ?? []).filter((r) => r.nodeId !== nodeId), ...(role === 'told' ? [] : [{ nodeId, role }])] }));
  const followers = others.filter((p) => p.event.afterId === event.id);
  const ageHint = (characterId: string) => {
    const step = lifePath(all, characterId, calendar, birthDateOf(byId.get(characterId))).find((s) => s.placed.event.id === event.id);
    // The age worked out from the other records, as a hint: "≈ 26", or "≈ 25–26" when the dates allow no closer.
    return step && !step.stated && (step.ageAt.kind === 'known' || step.ageAt.kind === 'range') ? `≈ ${step.label.replace('Age ', '')}` : 'Age';
  };
  const ageIssues = cast.flatMap((c) => lifePath(all, c.id, calendar, birthDateOf(c.entry)).find((s) => s.placed.event.id === event.id)?.issue?.replace(/^Stated/, `${c.entry.name} is stated`).replace(/^Takes part/, `${c.entry.name} takes part`) ?? []);
  const issues = [...placed.issues, ...ageIssues, ...findings.map((f) => f.message)];
  const myThreads = threads.filter((t) => (event.threadIds ?? []).includes(t.id)).sort((a, b) => a.title.localeCompare(b.title));
  const otherThreads = threads.filter((t) => !(event.threadIds ?? []).includes(t.id)).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="stack event-details">
      <div className="details-head">
        <span className={`imp imp-${event.importance}`}>{IMPORTANCE_LABELS[event.importance]}</span>
        <span className="muted small grow-text">{placed.label}</span>
        <button type="button" className="btn ghost icon" aria-label="Close details" onClick={onClose}>
          ✕
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="event-issues" aria-label="Things to check">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {findings.length > 0 && (
        <p className="small">
          <Link to={`/project/${projectId}/timeline/review`}>The rule behind each, and what you can do: Timeline review</Link>
        </p>
      )}

      <SavedText label="Event name" value={event.name} onSave={(name) => update({ name })} />
      <DateEditor when={event.when} others={others} calendar={calendar} onChange={(edit) => update((stored) => ({ when: edit(stored.when) }))} />

      <div className="grid-2 tight">
        <label className="field">
          <span>Importance</span>
          <select value={event.importance} aria-label="Importance" onChange={(e) => update({ importance: e.target.value as Importance })}>
            {IMPORTANCE.map((importance) => (
              <option key={importance} value={importance}>
                {IMPORTANCE_LABELS[importance]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <select value={byId.has(event.locationId ?? '') ? event.locationId! : ''} aria-label="Location" onChange={(e) => update({ locationId: e.target.value || null })}>
            <option value="">{locations.length ? 'Not set' : 'No locations in the Codex yet'}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Lasts" min={0} value={event.duration?.amount ?? null} placeholder="—" disabled={Boolean(event.end) || event.ongoing} onCommit={(amount) => update((stored) => ({ duration: amount ? { amount, unit: stored.duration?.unit ?? 'days' } : null }))} />
        <label className="field">
          <span>Unit</span>
          <select value={event.duration?.unit ?? 'days'} aria-label="Duration unit" disabled={!event.duration} onChange={(e) => {
              // Read before the change is queued: by the time it runs, the select may show its old value again.
              const unit = e.target.value as TimeUnit;
              update((stored) => (stored.duration ? { duration: { ...stored.duration, unit } } : {}));
            }}>
            {TIME_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      </div>
      <EventEnd event={event} others={others} calendar={calendar} update={update} />

      <div className="grid-2 tight">
        <label className="field">
          <span>Planning status</span>
          <select value={event.status ?? 'confirmed'} aria-label="Planning status" onChange={(e) => update({ status: e.target.value as EventStatus })}>
            {EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {EVENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Canon status</span>
          <select value={event.canon ?? 'canon'} aria-label="Canon status of this event" onChange={(e) => update({ canon: e.target.value as CanonStatus })}>
            {CANON_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CANON_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Plot threads</span>
        {myThreads.length > 0 && (
          <ul className="entity-chips" aria-label="Plot threads it belongs to">
            {myThreads.map((thread) => (
              <li key={thread.id} className="cat-lore">
                <Link to={`/project/${projectId}/plot`} className="chip-name">
                  {thread.title}
                </Link>
                <button type="button" aria-label={`Take out of ${thread.title}`} onClick={() => update((stored) => ({ threadIds: (stored.threadIds ?? []).filter((id) => id !== thread.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {otherThreads.length > 0 ? (
          <select value="" aria-label="Add to a plot thread" onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ threadIds: [...(stored.threadIds ?? []), id] }));
          }}>
            <option value="">Add to a plot thread…</option>
            {otherThreads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
        ) : (
          !threads.length && <span className="muted small">No plot threads yet.</span>
        )}
      </div>
      <LabelPicker of="this event" labels={event.labels ?? []} suggestions={labelSuggestions} onChange={(labels) => update({ labels })} />
      <AllConnections projectId={projectId} of={{ type: 'event', id: event.id }} />

      <div className="field">
        <span>Characters involved</span>
        {cast.length > 0 && (
          <ul className="event-cast">
            {cast.map((c) => (
              <li key={c.id}>
                <Link to={`/project/${projectId}/characters/${c.id}`}>{c.entry.name}</Link>
                <input
                  key={`${c.id}-${c.age}`}
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={c.age ?? ''}
                  placeholder={ageHint(c.id)}
                  aria-label={`${c.entry.name}'s age at this event`}
                  title="Age at this event (0 for their birth). Leave empty to have it worked out from other events."
                  onBlur={(e) => {
                    const age = e.target.value.trim() === '' ? null : Number(e.target.value);
                    if (age !== c.age) update((stored) => ({ characters: stored.characters.map((x) => (x.id === c.id ? { ...x, age } : x)) }));
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <button type="button" className="btn ghost icon" aria-label={`Remove ${c.entry.name}`} onClick={() => update((stored) => ({ characters: stored.characters.filter((x) => x.id !== c.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {availableCast.length > 0 && (
          <select value="" aria-label="Add a character" onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ characters: [...stored.characters, { id, age: null }] }));
          }}>
            <option value="">Add a character…</option>
            {availableCast.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="field">
        <span>Chapters &amp; scenes where this is told</span>
        <span className="muted small">
          In reading order, each with how it tells it. Where it is told never changes when it happens, and no chapter is moved. <ViewLink to={`/project/${projectId}/visualize/order`}>Compare the two orders</ViewLink>
        </span>
        {linkedNodes.length > 0 && (
          <ul className="event-tellings" aria-label="Where the reader meets it, in reading order">
            {linkedNodes.map(({ node }) => (
              <li key={node.id}>
                {node.kind === 'chapter' || node.kind === 'scene' ? <span className="muted small">Ch {order.chapterNumber.get(node.id)}</span> : null}
                <Link to={`/project/${projectId}/manuscript/${node.id}`}>{node.title}</Link>
                <select value={roleIn(node.id)} aria-label={`How ${node.title} tells it`} onChange={(e) => setRole(node.id, e.target.value as RevealRole)}>
                  {REVEAL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {REVEAL_CHOICES[role]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn ghost icon" aria-label={`Unlink ${node.title}`} onClick={() => update((stored) => ({ nodeIds: stored.nodeIds.filter((id) => id !== node.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {documents.length > linkedNodes.length && (
          <select value="" aria-label="Link a chapter or scene" onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ nodeIds: [...stored.nodeIds, id] }));
          }}>
            <option value="">Link a chapter or scene…</option>
            {documents.filter((t) => !event.nodeIds.includes(t.node.id)).map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="field">
        <span>Factions, items &amp; lore involved</span>
        {lore.length > 0 && (
          <ul className="entity-chips">
            {lore.map((entry) => (
              <li key={entry.id} className={`cat-${entry.category}`}>
                <Link to={entryPath(projectId, entry)} className="chip-name">
                  {entry.name}
                </Link>
                <button type="button" aria-label={`Unlink ${entry.name}`} onClick={() => update((stored) => ({ entryIds: stored.entryIds.filter((id) => id !== entry.id) }))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {availableLore.length > 0 && (
          <select value="" aria-label="Link a codex entry" onChange={(e) => {
            const id = e.target.value;
            if (id) update((stored) => ({ entryIds: [...stored.entryIds, id] }));
          }}>
            <option value="">Link an entry…</option>
            <EntryOptions entries={availableLore} />
          </select>
        )}
      </div>

      <label className="field">
        <span>Comes after (previous event)</span>
        <select value={others.some((p) => p.event.id === event.afterId) ? event.afterId! : ''} aria-label="Comes after" onChange={(e) => update({ afterId: e.target.value || null })}>
          <option value="">Not set</option>
          {others.map(({ event: other }) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </select>
      </label>
      {followers.length > 0 && <p className="muted small">Followed by: {followers.map((p) => p.event.name).join(', ')}</p>}

      <SavedText label="Description" multiline rows={5} value={event.description} onSave={(description) => update({ description })} />

      <div className="entry-foot">
        <span className="muted small">
          Changing chapters never changes this date. <Link to={`/project/${projectId}/consequences?event=${event.id}`}>What depends on this event?</Link>
        </span>
        <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
          Delete event…
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete event"
          confirmLabel="Delete event"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void api.remove(event.id).then(onClose, onError);
          }}
        >
          <p>
            Delete <strong>{event.name}</strong>? Chapters, scenes and codex entries it links to are not changed.
            {followers.length > 0 && ' Events set to follow it will be flagged so you can re-place them.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
