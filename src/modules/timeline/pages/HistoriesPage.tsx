import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { histories as historyService } from '@/core';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { SavedText } from '@/shared/SavedText';
import type { Calendar } from '../calendar';
import { formatDate, resolveChronology } from '../chronology';
import { compareTimelines, comparisonSummary, HISTORY_KIND_LABELS, HISTORY_KINDS, HISTORY_STATUS_LABELS, HISTORY_STATUSES, historyEvents, MAIN_TIMELINE, originWords, staleChanges, type AlternateHistory, type EventChange, type HistoryKind, type HistoryStatus } from '../histories';
import { DateFields } from '../components/DateFields';
import { useTimeline } from '../hooks';
import type { TimelineEvent } from '../types';

const CANON_WORDS: Record<HistoryStatus, string> = {
  alternate: 'Alternate canon: an official second course of events. The main timeline stays as it is.',
  'non-canon': 'Not canon. The main timeline is the novel’s canon and stays as it is.',
  experimental: 'An experiment, not canon. The main timeline stays as it is.',
  abandoned: 'Set aside, not canon. The main timeline stays as it is.',
};

/** How an event goes in this history: its name, date, place, whether it is still going on, and what happens. Only what is edited is kept as a difference. */
function ChangeForm({ event, calendar, places, onSave, onCancel }: { event: TimelineEvent; calendar: Calendar; places: { id: string; name: string }[]; onSave: (change: EventChange) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<EventChange>({ name: event.name, when: event.when, locationId: event.locationId, ongoing: event.ongoing === true, description: event.description });
  const set = (patch: EventChange) => setDraft((d) => ({ ...d, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(draft);
  };
  return (
    <form className="stack history-change" onSubmit={submit} aria-label={`How “${event.name}” goes in this history`}>
      <label className="field">
        <span>Name</span>
        <input value={draft.name ?? ''} aria-label="Event name in this history" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <DateFields when={draft.when ?? event.when} calendar={calendar} onChange={(when) => set({ when })} />
      <label className="field">
        <span>Where</span>
        <select value={draft.locationId ?? ''} aria-label="Where it happens in this history" onChange={(e) => set({ locationId: e.target.value || null })}>
          <option value="">Not set</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={draft.ongoing === true} onChange={(e) => set({ ongoing: e.target.checked })} /> Still going on when the story ends
      </label>
      <label className="field">
        <span>What happens</span>
        <textarea rows={3} value={draft.description ?? ''} aria-label="What happens in this history" onChange={(e) => set({ description: e.target.value })} />
      </label>
      <div className="actions start">
        <button type="submit" className="btn primary">
          Save for this history
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * ALTERNATE HISTORIES
 * Other courses of events for this novel, kept apart from its main timeline:
 * each holds only what is different, and the rest is the main timeline's own
 * events. Nothing here changes the main timeline, merges into it, or changes
 * a history's canon status by itself.
 */
export function HistoriesPage() {
  const project = useCurrentProject();
  const { placed, entries, calendar, loading } = useTimeline(project.id);
  const api = historyService.forProject(project.id);
  const list = useLiveQuery(() => api.list(), [project.id]);
  const me = useMe(project.id);
  const writable = can(me.role, 'write');
  const [params, setParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState<{ name: string; kind: HistoryKind; status: HistoryStatus; baseId: string; originEventId: string; causeEventId: string; note: string }>({ name: '', kind: 'hypothetical', status: 'experimental', baseId: '', originEventId: '', causeEventId: '', note: '' });
  const [newEvent, setNewEvent] = useState('');
  const [showSame, setShowSame] = useState(false);
  if (loading || !list) return null;

  const run = (task: () => Promise<unknown>) => void task().then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  const setParam = (key: string, value: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  const main = new Map(placed.map((p) => [p.event.id, p.event]));
  const byId = new Map(list.map((h) => [h.id, h]));
  const selected = byId.get(params.get('history') ?? '') ?? null;
  const places = entries.filter((e) => e.category === 'location').sort((a, b) => a.name.localeCompare(b.name));
  const timelineName = (id: string | null) => (id ? `“${byId.get(id)?.name ?? 'a deleted history'}”` : MAIN_TIMELINE);
  const inOrder = (events: Map<string, TimelineEvent>) => resolveChronology([...events.values()], calendar);
  const when = (e: TimelineEvent, events: Map<string, TimelineEvent>) => formatDate(e.when, (id) => events.get(id)?.name, calendar);
  const counts = (h: AlternateHistory) => [Object.keys(h.changed).length ? `${Object.keys(h.changed).length} changed` : '', h.removed.length ? `${h.removed.length} not happening` : '', h.added.length ? `${h.added.length} only here` : ''].filter(Boolean).join(' · ') || 'No differences yet';
  const draftBase = historyEvents(main, byId, draft.baseId || null);

  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const made = await api.create({ name: draft.name, kind: draft.kind, status: draft.status, baseId: draft.baseId || null, originEventId: draft.originEventId || null, causeEventId: draft.kind === 'time-travel' ? draft.causeEventId || null : null, note: draft.note });
      setDraft((d) => ({ ...d, name: '', note: '', originEventId: '', causeEventId: '' }));
      setParam('history', made.id);
    });
  };

  // The selected history: its events, its base's, and what it changes.
  const base = selected ? historyEvents(main, byId, selected.baseId) : main;
  const mine = selected ? historyEvents(main, byId, selected.id) : main;
  const stale = selected ? staleChanges(main, byId, selected) : [];
  const origin = selected?.originEventId ? inOrder(base).find((p) => p.event.id === selected.originEventId) : null;
  const before = selected && origin?.value != null ? Object.keys(selected.changed).filter((id) => { const p = inOrder(base).find((x) => x.event.id === id); return p?.value != null && p.value < origin.value!; }) : [];
  const cause = selected?.causeEventId ? inOrder(base).find((p) => p.event.id === selected.causeEventId) : null;

  // Comparing: any two timelines, by default the selected history against what it branches from.
  // In the address, the main timeline is 'main'; a history, its id.
  const pick = (key: string, fallback: string | null) => (params.has(key) ? (params.get(key) === 'main' ? null : byId.has(params.get(key)!) ? params.get(key) : fallback) : fallback);
  const compareA = pick('a', selected?.baseId ?? null);
  const compareB = pick('b', selected?.id ?? list[0]?.id ?? null);
  const diffs = compareTimelines(historyEvents(main, byId, compareA), historyEvents(main, byId, compareB), calendar);
  const timelineOptions = (
    <>
      <option value="">{MAIN_TIMELINE} (canon)</option>
      {list.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name} ({HISTORY_STATUS_LABELS[h.status]})
        </option>
      ))}
    </>
  );

  const compareOptions = (
    <>
      <option value="main">{MAIN_TIMELINE} (canon)</option>
      {list.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name} ({HISTORY_STATUS_LABELS[h.status]})
        </option>
      ))}
    </>
  );

  return (
    <div className="stack histories-page">
      <header className="page-header">
        <div>
          <h1>Alternate histories</h1>
          <p className="muted">Other courses of events for this novel (alternate histories, what-ifs, changed futures, time-travel branches), kept apart from its main timeline.</p>
        </div>
        <Link to={`/project/${project.id}/timeline`} className="btn ghost">
          Back to the timeline
        </Link>
      </header>
      <p className="small">
        Each history keeps only what is different: events that go differently, events that do not happen, and events that happen only there. Every other event is the main timeline’s own record, so nothing is copied. The main timeline is the novel’s canon, and nothing here ever changes it or merges into it. To copy the whole novel and write it differently from a chapter on, use <Link to={`/project/${project.id}/branches`}>Story branches</Link>.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="panel stack" aria-label="Alternate histories of this novel">
        <h2>Histories</h2>
        {list.length === 0 ? (
          <p className="muted">No alternate histories yet. Start one below: it reads exactly as the timeline it branches from until you change something.</p>
        ) : (
          <ul className="history-cards">
            {list.map((h) => (
              <li key={h.id} className={h.id === selected?.id ? 'selected' : ''}>
                <button type="button" className="link" aria-pressed={h.id === selected?.id} onClick={() => (setParam('history', h.id), setEditing(null))}>
                  {h.name}
                </button>{' '}
                <span className="badge">{HISTORY_STATUS_LABELS[h.status]}</span> <span className="badge">{HISTORY_KIND_LABELS[h.kind]}</span>
                <div className="muted small">{originWords(h, historyEvents(main, byId, h.baseId), byId, calendar)}</div>
                <div className="small">{counts(h)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {writable && (
        <section className="panel stack" aria-label="Start an alternate history">
          <h2>Start an alternate history</h2>
          <form className="stack" onSubmit={create}>
            <div className="grid-2 tight">
              <label className="field">
                <span>Name</span>
                <input value={draft.name} aria-label="Name of the alternate history" placeholder="If the Keep had held" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Kind</span>
                <select value={draft.kind} aria-label="Kind of history" onChange={(e) => setDraft({ ...draft, kind: e.target.value as HistoryKind })}>
                  {HISTORY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {HISTORY_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Canon status</span>
                <select value={draft.status} aria-label="Canon status of the history" onChange={(e) => setDraft({ ...draft, status: e.target.value as HistoryStatus })}>
                  {HISTORY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {HISTORY_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Branches from</span>
                <select value={draft.baseId} aria-label="Branches from" onChange={(e) => setDraft({ ...draft, baseId: e.target.value, originEventId: '', causeEventId: '' })}>
                  {timelineOptions}
                </select>
              </label>
              <label className="field">
                <span>Departs at</span>
                <select value={draft.originEventId} aria-label="Departs at" onChange={(e) => setDraft({ ...draft, originEventId: e.target.value })}>
                  <option value="">Across the whole timeline</option>
                  {inOrder(draftBase).map((p) => (
                    <option key={p.event.id} value={p.event.id}>
                      {p.event.name} ({p.label})
                    </option>
                  ))}
                </select>
              </label>
              {draft.kind === 'time-travel' && (
                <label className="field">
                  <span>Caused by</span>
                  <select value={draft.causeEventId} aria-label="Caused by" onChange={(e) => setDraft({ ...draft, causeEventId: e.target.value })}>
                    <option value="">Not said</option>
                    {inOrder(draftBase).map((p) => (
                      <option key={p.event.id} value={p.event.id}>
                        {p.event.name} ({p.label})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="field">
              <span>What it explores</span>
              <input value={draft.note} aria-label="What the history explores" placeholder="Optional" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
            <div className="actions start">
              <button type="submit" className="btn primary">
                Start the history
              </button>
            </div>
          </form>
        </section>
      )}

      {selected && (
        <section className="panel stack" aria-label="This alternate history">
          <h2>{selected.name}</h2>
          <p role="status">
            <strong>{HISTORY_STATUS_LABELS[selected.status]}</strong> · {HISTORY_KIND_LABELS[selected.kind]}. {CANON_WORDS[selected.status]}
          </p>
          <p className="small">{originWords(selected, base, byId, calendar)}</p>
          {cause && (
            <p className="small">
              Caused by “{cause.event.name}” ({cause.label}){origin && cause.value != null && origin.value != null && cause.value > origin.value ? ', which comes later in story time than where this history departs: the change reaches back.' : '.'}
            </p>
          )}
          {selected.note && <p className="muted small">{selected.note}</p>}
          {writable && (
            <div className="grid-2 tight">
              <SavedText label="Name" value={selected.name} onSave={(name) => run(() => api.update(selected.id, { name }))} />
              <label className="field">
                <span>Canon status</span>
                <select value={selected.status} aria-label="Canon status of this history" onChange={(e) => run(() => api.update(selected.id, { status: e.target.value as HistoryStatus }))}>
                  {HISTORY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {HISTORY_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Kind</span>
                <select value={selected.kind} aria-label="Kind of this history" onChange={(e) => run(() => api.update(selected.id, { kind: e.target.value as HistoryKind }))}>
                  {HISTORY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {HISTORY_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Departs at</span>
                <select value={selected.originEventId ?? ''} aria-label="Where this history departs" onChange={(e) => run(() => api.update(selected.id, { originEventId: e.target.value || null }))}>
                  <option value="">Across the whole timeline</option>
                  {inOrder(base).map((p) => (
                    <option key={p.event.id} value={p.event.id}>
                      {p.event.name} ({p.label})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {(stale.length > 0 || before.length > 0) && (
            <div className="notice-stack" aria-label="Worth a look">
              {stale.length > 0 && (
                <p className="notice">
                  {stale.length === 1 ? '1 change points' : `${stale.length} changes point`} at events no longer in {timelineName(selected.baseId)}. They are not applied.{' '}
                  {writable && (
                    <button type="button" className="btn ghost" onClick={() => run(() => api.forgetStale(selected.id))}>
                      Forget them
                    </button>
                  )}
                </p>
              )}
              {before.length > 0 && <p className="notice">{before.map((id) => `“${base.get(id)?.name}”`).join(', ')} {before.length === 1 ? 'is' : 'are'} changed, though {before.length === 1 ? 'it comes' : 'they come'} before where this history departs. That may be what you mean (a time-travel branch reaches back), or a slip.</p>}
            </div>
          )}

          <h3>Events in this history</h3>
          <ol className="viz-list history-events" aria-label="Events in this history, in story order">
            {inOrder(mine).map((p) => {
              const e = p.event;
              const added = selected.added.some((a) => a.id === e.id);
              const changed = selected.changed[e.id];
              const fields = changed ? compareTimelines(new Map([[e.id, base.get(e.id)!]]), new Map([[e.id, e]]), calendar)[0]?.fields ?? [] : [];
              return (
                <li key={e.id} className="viz-row">
                  <span className="muted small history-when">{p.label}</span> <strong>{e.name}</strong> {added && <span className="badge">Only in this history</span>}
                  {changed && <span className="badge">Changed here{fields.length ? `: ${fields.join(', ')}` : ''}</span>}
                  {writable && (
                    <span className="history-actions">
                      <button type="button" className="btn ghost" aria-label={`Change how “${e.name}” goes here`} onClick={() => setEditing(e.id)}>
                        Change
                      </button>
                      {changed && (
                        <button type="button" className="btn ghost" aria-label={`Restore “${e.name}” as ${timelineName(selected.baseId)} has it`} onClick={() => run(() => api.restoreEvent(selected.id, e.id))}>
                          Restore
                        </button>
                      )}
                      {added ? (
                        <button type="button" className="btn ghost danger" aria-label={`Delete “${e.name}”`} onClick={() => run(() => api.deleteAdded(selected.id, e.id))}>
                          Delete
                        </button>
                      ) : (
                        <button type="button" className="btn ghost" aria-label={`“${e.name}” does not happen here`} onClick={() => run(() => api.removeEvent(selected.id, e.id))}>
                          Does not happen here
                        </button>
                      )}
                    </span>
                  )}
                  {editing === e.id && (
                    <ChangeForm
                      event={e}
                      calendar={calendar}
                      places={places}
                      onCancel={() => setEditing(null)}
                      onSave={(change) => {
                        setEditing(null);
                        run(() => (added ? api.updateAdded(selected.id, e.id, change) : api.changeEvent(selected.id, e.id, change)));
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {selected.removed.length > 0 && (
            <>
              <h3>Do not happen in this history</h3>
              <ul className="viz-list" aria-label="Events that do not happen in this history">
                {selected.removed.filter((id) => base.has(id)).map((id) => (
                  <li key={id} className="viz-row">
                    <span className="muted small history-when">{when(base.get(id)!, base)}</span> <s>{base.get(id)!.name}</s>{' '}
                    {writable && (
                      <button type="button" className="btn ghost" aria-label={`Restore “${base.get(id)!.name}” as ${timelineName(selected.baseId)} has it`} onClick={() => run(() => api.restoreEvent(selected.id, id))}>
                        Restore
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {writable && (
            <form className="actions start wrap" onSubmit={(e) => (e.preventDefault(), run(async () => { const made = await api.addEvent(selected.id, newEvent); setNewEvent(''); setEditing(made.id); }))}>
              <input value={newEvent} aria-label="Name of an event only in this history" placeholder="The parley at the gate" onChange={(e) => setNewEvent(e.target.value)} />
              <button type="submit" className="btn">
                Add an event only here
              </button>
            </form>
          )}
          {writable && (
            <div className="actions start">
              <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
                Delete this history…
              </button>
            </div>
          )}
          {deleting && (
            <ConfirmDialog title="Delete this alternate history?" confirmLabel="Delete history" onCancel={() => setDeleting(false)} onConfirm={() => (setDeleting(false), setParam('history', null), run(() => api.remove(selected.id)))}>
              <p>“{selected.name}” and its differences are deleted. The main timeline and its events are not touched. Histories based on this one are based on {timelineName(selected.baseId)} instead, keeping their own differences.</p>
            </ConfirmDialog>
          )}
        </section>
      )}

      {list.length > 0 && (
        <section className="panel stack" aria-label="Compare timelines">
          <h2>Compare</h2>
          <div className="grid-2 tight">
            <label className="field">
              <span>Compare</span>
              <select value={compareA ?? 'main'} aria-label="First timeline to compare" onChange={(e) => setParam('a', e.target.value)}>
                {compareOptions}
              </select>
            </label>
            <label className="field">
              <span>with</span>
              <select value={compareB ?? 'main'} aria-label="Second timeline to compare" onChange={(e) => setParam('b', e.target.value)}>
                {compareOptions}
              </select>
            </label>
          </div>
          <p role="status">{comparisonSummary(diffs, timelineName(compareA), timelineName(compareB))}</p>
          <label className="check">
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> Show the events that are the same too
          </label>
          <div className="table-scroll">
            <table className="sessions" aria-label="Differences between the two timelines">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">In {timelineName(compareA)}</th>
                  <th scope="col">In {timelineName(compareB)}</th>
                  <th scope="col">Difference</th>
                </tr>
              </thead>
              <tbody>
                {diffs
                  .filter((d) => showSame || d.difference !== 'same')
                  .map((d) => (
                    <tr key={d.id}>
                      <td>{(d.b ?? d.a)!.name}</td>
                      <td>{d.a ? `${d.a.name === (d.b ?? d.a).name ? '' : `${d.a.name}: `}${d.whenA}` : 'Does not happen'}</td>
                      <td>{d.b ? d.whenB : 'Does not happen'}</td>
                      <td>{d.difference === 'same' ? 'The same' : d.difference === 'changed' ? `Changed: ${d.fields.join(', ')}` : d.difference === 'moved' ? `Moved ${d.direction ?? ''}: its date depends on one that changed` : d.difference === 'only-a' ? `Only in ${timelineName(compareA)}` : `Only in ${timelineName(compareB)}`}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Comparing changes nothing. Nothing is ever merged into the main timeline, and no history’s canon status changes, unless you change it yourself.</p>
        </section>
      )}
    </div>
  );
}
