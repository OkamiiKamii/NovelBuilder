import { useState } from 'react';
import { travel } from '@/core';
import { EntryOptions } from '@/modules/codex/categories';
import type { StoryModel } from '@/modules/model/types';
import type { Anchor } from '@/modules/model/validity';
import { nodeLabel } from '@/modules/timeline/narrative';
import { TIME_UNITS, type TimeUnit } from '@/modules/timeline/types';
import { timelineRows } from '@/modules/visualize/summaries';
import { Modal } from '@/shared/Modal';
import { journeyRecord } from '../routes';
import type { JourneyInput } from '../service';
import { PER_LABELS, type Journey, type TravelSettings } from '../types';

/** When something happens: not known, at a chapter or scene, at an event, or on a date (exact, or approximately a year). */
export function WhenPicker({ label, value, onChange, model }: { label: string; value: Anchor | null; onChange: (value: Anchor | null) => void; model: StoryModel }) {
  const kind = value ? (value.kind === 'date' ? 'date' : value.kind) : '';
  const date = value?.kind === 'date' && (value.when.precision === 'exact' || value.when.precision === 'approximate') ? value.when : null;
  const approximately = value?.kind === 'date' && value.when.precision === 'approximate';
  const chapters = [...model.nodes.values()].filter((n) => model.order.position.has(n.id)).sort((a, b) => model.order.position.get(a.id)! - model.order.position.get(b.id)!);
  const setDate = (patch: { year?: number; month?: number | null; day?: number | null; approx?: boolean }) => {
    const year = patch.year ?? date?.year ?? 1;
    const month = patch.month !== undefined ? patch.month : (date?.month ?? null);
    const day = patch.day !== undefined ? patch.day : date && 'day' in date ? date.day : null;
    const approx = patch.approx ?? approximately;
    onChange({ kind: 'date', when: approx ? { precision: 'approximate', year, month, season: null } : { precision: 'exact', year, month, day: month ? day : null, hour: null, minute: null } });
  };
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return (
    <fieldset className="when-picker">
      <legend>{label}</legend>
      <select
        aria-label={`${label}: when`}
        value={kind}
        onChange={(e) => {
          const k = e.target.value;
          if (!k) onChange(null);
          else if (k === 'node') onChange(chapters[0] ? { kind: 'node', nodeId: chapters[0].id } : null);
          else if (k === 'event') {
            const first = timelineRows(model)[0];
            onChange(first ? { kind: 'event', eventId: first.id } : null);
          } else onChange({ kind: 'date', when: { precision: 'exact', year: 1, month: null, day: null, hour: null, minute: null } });
        }}
      >
        <option value="">When is not known</option>
        {chapters.length > 0 && <option value="node">At a chapter or scene</option>}
        {model.events.size > 0 && <option value="event">At an event</option>}
        <option value="date">On a date</option>
      </select>
      {value?.kind === 'node' && (
        <select aria-label={`${label}: chapter or scene`} value={value.nodeId} onChange={(e) => onChange({ kind: 'node', nodeId: e.target.value })}>
          {chapters.map((n) => (
            <option key={n.id} value={n.id}>
              {nodeLabel(model, n.id)}
            </option>
          ))}
        </select>
      )}
      {value?.kind === 'event' && (
        <select aria-label={`${label}: event`} value={value.eventId} onChange={(e) => onChange({ kind: 'event', eventId: e.target.value })}>
          {timelineRows(model).map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      )}
      {value?.kind === 'date' && (
        <span className="when-date">
          <input type="number" step={1} aria-label={`${label}: year`} defaultValue={date?.year ?? ''} placeholder="Year" onBlur={(e) => e.target.value.trim() && setDate({ year: Number(e.target.value) })} />
          <input type="number" min={1} step={1} aria-label={`${label}: month`} defaultValue={date?.month ?? ''} placeholder="Month" onBlur={(e) => setDate({ month: num(e.target.value) })} />
          {!approximately && <input type="number" min={1} step={1} aria-label={`${label}: day`} defaultValue={date && 'day' in date ? (date.day ?? '') : ''} placeholder="Day" onBlur={(e) => setDate({ day: num(e.target.value) })} />}
          <label className="check">
            <input type="checkbox" aria-label={`${label}: approximately`} checked={approximately} onChange={(e) => setDate({ approx: e.target.checked })} />
            approximately
          </label>
        </span>
      )}
    </fieldset>
  );
}

/** Recording a journey, or changing one: only who travels is needed; everything else as far as the author knows it. */
export function JourneyForm({ model, settings, journeys, initial, defaultTraveller, onClose }: { model: StoryModel; settings: TravelSettings | null; journeys: Journey[]; initial?: Journey; defaultTraveller?: string | null; onClose: () => void }) {
  const api = travel.forProject(model.project.id);
  const [draft, setDraft] = useState<JourneyInput>(() =>
    initial
      ? { ...initial }
      : { travellerIds: defaultTraveller ? [defaultTraveller] : [], fromId: null, toId: null, via: [], departure: null, arrival: null, afterId: null, method: '', methodId: null, duration: null, distance: null, distanceUnit: '', eventIds: [], note: '' },
  );
  const [ownMethod, setOwnMethod] = useState(Boolean(initial?.method && !initial.methodId));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<JourneyInput>) => setDraft((d) => ({ ...d, ...patch }));
  const travellers = [...model.entries.values()].filter((e) => e.category !== 'location').sort((a, b) => a.name.localeCompare(b.name));
  const placesList = [...model.entries.values()].filter((e) => e.category === 'location');
  const events = timelineRows(model);
  const others = journeys.filter((j) => j.id !== initial?.id);
  return (
    <Modal title={initial ? 'Change the journey' : 'Record a journey'} onClose={onClose}>
      <form
        className="stack journey-form"
        onSubmit={(e) => {
          e.preventDefault();
          void api.saveJourney(initial?.id ?? null, { ...draft, method: ownMethod ? draft.method : '', methodId: ownMethod ? null : draft.methodId }).then(onClose, (err) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        <fieldset>
          <legend>Who travels</legend>
          <div className="journey-who" role="group" aria-label="Who travels">
            {travellers.map((t) => (
              <label key={t.id} className="check">
                <input type="checkbox" aria-label={`${t.name} travels`} checked={draft.travellerIds!.includes(t.id)} onChange={(e) => set({ travellerIds: e.target.checked ? [...draft.travellerIds!, t.id] : draft.travellerIds!.filter((id) => id !== t.id) })} />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid-2 tight">
          <label className="field">
            <span>From</span>
            <select aria-label="From" value={draft.fromId ?? ''} onChange={(e) => set({ fromId: e.target.value || null })}>
              <option value="">Not recorded</option>
              <EntryOptions entries={placesList} />
            </select>
          </label>
          <label className="field">
            <span>To</span>
            <select aria-label="To" value={draft.toId ?? ''} onChange={(e) => set({ toId: e.target.value || null })}>
              <option value="">Not recorded</option>
              <EntryOptions entries={placesList} />
            </select>
          </label>
        </div>
        <div className="field">
          <span>By way of</span>
          <span className="chips">
            {draft.via!.map((id, i) => (
              <span key={`${id}:${i}`} className="chip">
                {model.entries.get(id)?.name}
                <button type="button" className="chip-x" aria-label={`Remove ${model.entries.get(id)?.name} from the way`} onClick={() => set({ via: draft.via!.filter((_, k) => k !== i) })}>
                  ✕
                </button>
              </span>
            ))}
            <select aria-label="Add a place on the way" value="" onChange={(e) => e.target.value && set({ via: [...draft.via!, e.target.value] })}>
              <option value="">Add a place on the way…</option>
              <EntryOptions entries={placesList} />
            </select>
          </span>
        </div>
        <div className="grid-2 tight">
          <WhenPicker label="Leaves" value={draft.departure ?? null} onChange={(departure) => set({ departure })} model={model} />
          <WhenPicker label="Arrives" value={draft.arrival ?? null} onChange={(arrival) => set({ arrival })} model={model} />
        </div>
        {others.length > 0 && (
          <label className="field">
            <span>Comes after (when only the order is known)</span>
            <select aria-label="Comes after" value={draft.afterId ?? ''} onChange={(e) => set({ afterId: e.target.value || null })}>
              <option value="">No journey in particular</option>
              {others.map((j) => (
                <option key={j.id} value={j.id}>
                  {journeyRecord(model, j, settings).words}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid-2 tight">
          <label className="field">
            <span>How they travel</span>
            <select
              aria-label="Travel method"
              value={ownMethod ? 'own' : (draft.methodId ?? '')}
              onChange={(e) => {
                setOwnMethod(e.target.value === 'own');
                set({ methodId: e.target.value && e.target.value !== 'own' ? e.target.value : null });
              }}
            >
              <option value="">Not said</option>
              {settings?.methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.speed ? ` (${m.speed} ${m.distanceUnit} ${PER_LABELS[m.per]})` : ''}
                </option>
              ))}
              <option value="own">In your own words…</option>
            </select>
          </label>
          {ownMethod && (
            <label className="field">
              <span>In your own words</span>
              <input aria-label="Travel method, in your own words" value={draft.method} placeholder="on foot, by airship…" onChange={(e) => set({ method: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>Duration (optional)</span>
            <span className="toolbar">
              <input type="number" min={0} step="any" aria-label="Duration" value={draft.duration?.amount ?? ''} onChange={(e) => set({ duration: e.target.value === '' ? null : { amount: Number(e.target.value), unit: draft.duration?.unit ?? 'days' } })} />
              <select aria-label="Duration unit" value={draft.duration?.unit ?? 'days'} onChange={(e) => set({ duration: draft.duration ? { ...draft.duration, unit: e.target.value as TimeUnit } : null })}>
                {TIME_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="field">
            <span>Distance (optional)</span>
            <span className="toolbar">
              <input type="number" min={0} step="any" aria-label="Distance" value={draft.distance ?? ''} onChange={(e) => set({ distance: e.target.value === '' ? null : Number(e.target.value) })} />
              <input aria-label="Distance unit" value={draft.distanceUnit} placeholder="leagues, km…" onChange={(e) => set({ distanceUnit: e.target.value })} />
            </span>
          </label>
        </div>
        {events.length > 0 && (
          <fieldset>
            <legend>Part of these events (optional)</legend>
            <div className="journey-events">
              {events.map((ev) => (
                <label key={ev.id} className="check">
                  <input type="checkbox" aria-label={`Part of ${ev.title}`} checked={draft.eventIds!.includes(ev.id)} onChange={(e) => set({ eventIds: e.target.checked ? [...draft.eventIds!, ev.id] : draft.eventIds!.filter((id) => id !== ev.id) })} />
                  {ev.title}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="field">
          <span>Note (optional)</span>
          <textarea aria-label="Note" rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions start">
          <button type="submit" className="btn primary">
            Save the journey
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The novel's ways of travelling. A speed is only ever the author's: none is assumed, and a method with none is never used to judge a journey. */
export function MethodsDialog({ model, settings, onClose }: { model: StoryModel; settings: TravelSettings | null; onClose: () => void }) {
  const api = travel.forProject(model.project.id);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [name, setName] = useState('');
  const methods = settings?.methods ?? [];
  const act = (task: Promise<unknown>) => void task.then(() => setNotice(null), (e) => setNotice({ text: e instanceof Error ? e.message : String(e), error: true }));
  const save = (id: string, patch: Partial<(typeof methods)[number]>) => act(api.setMethods(methods.map((m) => (m.id === id ? { ...m, ...patch } : m))));
  return (
    <Modal title="Travel methods" onClose={onClose}>
      <div className="stack travel-methods">
        <p className="muted small">How people get about in this novel. A speed is yours to give: none is assumed, not even for walking. With a speed, a distance in the same unit and both dates of a journey, a journey too fast for its dates is flagged; without, nothing is.</p>
        {notice && (
          <p className={notice.error ? 'error' : 'notice'} role={notice.error ? 'alert' : 'status'}>
            {notice.text}
          </p>
        )}
        {methods.length === 0 ? (
          <p className="muted">No travel methods yet.</p>
        ) : (
          <ul className="travel-method-list" aria-label="Travel methods">
            {methods.map((m) => (
              <li key={m.id} className="toolbar">
                <input key={m.name} defaultValue={m.name} aria-label={`Name of ${m.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== m.name && save(m.id, { name: e.target.value })} />
                <input key={`s${m.speed}`} type="number" min={0} step="any" defaultValue={m.speed ?? ''} placeholder="No speed" aria-label={`Speed of ${m.name}`} onBlur={(e) => save(m.id, { speed: e.target.value === '' ? null : Number(e.target.value) })} />
                <input key={`u${m.distanceUnit}`} defaultValue={m.distanceUnit} placeholder="leagues" aria-label={`Distance unit of ${m.name}`} onBlur={(e) => e.target.value.trim() !== m.distanceUnit && save(m.id, { distanceUnit: e.target.value })} />
                <select aria-label={`${m.name}: per`} value={m.per} onChange={(e) => save(m.id, { per: e.target.value as TimeUnit })}>
                  {TIME_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {PER_LABELS[u]}
                    </option>
                  ))}
                </select>
                <button type="button" className="tool" aria-label={`Remove ${m.name}`} onClick={() => act(api.setMethods(methods.filter((x) => x.id !== m.id)))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            act(api.setMethods([...methods, { name, speed: null, distanceUnit: '', per: 'days' }]).then(() => setName('')));
          }}
        >
          <input value={name} placeholder="A way of travelling, e.g. By horse" aria-label="New travel method" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={!name.trim()}>
            Add
          </button>
        </form>
      </div>
    </Modal>
  );
}
