import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { calendars, timeline } from '@/core';
import { calendarFrom, calendarProblems, dateProblem, describeCalendar, LIMITS, type CalendarSettings } from '../calendar';
import { formatDate } from '../chronology';
import { SEASON_LABELS, SEASONS, type Season, type TimelineEvent } from '../types';

/** A number field's value as typed: empty while the author clears it, so the check can say what is missing. */
const numberOf = (text: string): number => (text.trim() === '' ? NaN : Number(text));
const shown = (n: number): number | '' => (Number.isFinite(n) ? n : '');

/** Events whose start or end date the calendar does not have, with why. */
function misfits(events: TimelineEvent[], settings: CalendarSettings) {
  const calendar = calendarFrom(settings);
  return events.flatMap((e) => {
    const problem = dateProblem(e.when, calendar) ?? (e.end ? dateProblem(e.end, calendar) : null);
    return problem ? [{ id: e.id, name: e.name, problem }] : [];
  });
}

/**
 * How this novel counts time: the standard calendar, or one of its own with
 * its own months, days, weeks, eras and seasons. Changes are a draft until
 * saved, so the author sees what they will do first: how dates will read,
 * and which events have dates the calendar does not have. Saving never
 * changes an event.
 */
export function CalendarForm({ projectId }: { projectId: string }) {
  const api = calendars.forProject(projectId);
  const saved = useLiveQuery(() => api.settings(), [projectId]);
  const events = useLiveQuery(() => timeline.forProject(projectId).list(), [projectId]);
  const [draft, setDraft] = useState<CalendarSettings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!saved || !events) return null;

  const current = draft ?? saved;
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = calendarProblems(current);
  const preview = calendarFrom(current);
  const away = problems.length ? [] : misfits(events, current);
  const set = (patch: Partial<CalendarSettings>) => {
    setDraft({ ...current, ...patch });
    setStatus(null);
    setError(null);
  };
  const months = current.months;
  const setMonth = (i: number, patch: Partial<CalendarSettings['months'][number]>) => set({ months: months.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const moveMonth = (i: number, by: number) => {
    const next = [...months];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set({ months: next });
  };
  const monthLabel = (i: number) => months[i].name.trim() || `month ${i + 1}`;
  const eras = current.eras;
  const setEra = (i: number, patch: Partial<CalendarSettings['eras'][number]>) => set({ eras: eras.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const custom = current.kind === 'custom';
  // A date as it will read: in the latest era, if there is one.
  const sampleYear = preview.eras.length ? preview.eras[preview.eras.length - 1].startYear + 3 : 10;
  const sample = formatDate({ precision: 'exact', year: sampleYear, month: 1, day: 1, hour: null, minute: null }, undefined, preview);

  const save = () =>
    void api.save(current).then(
      () => {
        setDraft(null);
        setStatus(`Calendar saved. Every date in the novel is now read in the ${custom ? `“${current.name.trim()}” calendar` : 'standard calendar'}.`);
      },
      (err) => setError(err instanceof Error ? err.message : 'Could not save the calendar.'),
    );

  return (
    <section className="panel stack calendar-form" id="calendar" aria-labelledby="calendar-title">
      <h2 id="calendar-title">Story calendar</h2>
      <p className="muted small">
        How this novel counts time: its months, how long they and its days are, and its eras. Changing it never changes an event’s date: every date is read in the calendar in use, so switching back is always safe. Dates are drawn on the{' '}
        <Link to={`/project/${projectId}/timeline`}>Timeline</Link>.
      </p>
      <div className="stack" role="radiogroup" aria-label="Which calendar">
        <label className="check wrap">
          <input type="radio" name="calendar-kind" checked={!custom} onChange={() => set({ kind: 'standard' })} />
          <span>
            Standard calendar <span className="muted small">— twelve months, 24-hour days, years as “Year 10”</span>
          </span>
        </label>
        <label className="check wrap">
          <input type="radio" name="calendar-kind" checked={custom} onChange={() => set({ kind: 'custom' })} />
          <span>
            A calendar of this novel’s own <span className="muted small">— months, days, weeks and eras of your choosing</span>
          </span>
        </label>
      </div>

      {custom && (
        <>
          <label className="field">
            <span>Calendar name</span>
            <input value={current.name} aria-label="Calendar name" onChange={(e) => set({ name: e.target.value })} />
          </label>

          <fieldset className="plan-group">
            <legend>Months</legend>
            <ol className="cal-rows" aria-label="Months, in order">
              {months.map((m, i) => (
                <li key={i}>
                  <input value={m.name} aria-label={`Name of month ${i + 1}`} onChange={(e) => setMonth(i, { name: e.target.value })} />
                  <label className="cal-days">
                    <input type="number" min={1} max={LIMITS.days} step={1} value={shown(m.days)} aria-label={`Days in ${monthLabel(i)}`} onChange={(e) => setMonth(i, { days: numberOf(e.target.value) })} />
                    <span className="muted small">days</span>
                  </label>
                  <span className="cal-actions">
                    <button type="button" className="btn ghost icon" aria-label={`Move ${monthLabel(i)} up`} disabled={i === 0} onClick={() => moveMonth(i, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn ghost icon" aria-label={`Move ${monthLabel(i)} down`} disabled={i === months.length - 1} onClick={() => moveMonth(i, 1)}>
                      ↓
                    </button>
                    <button type="button" className="btn ghost icon" aria-label={`Remove ${monthLabel(i)}`} disabled={months.length === 1} onClick={() => set({ months: months.filter((_, j) => j !== i), seasons: Object.fromEntries(SEASONS.map((s) => [s, Math.min(months.length - 1, current.seasons[s] > i + 1 ? current.seasons[s] - 1 : current.seasons[s]) || 1])) as CalendarSettings['seasons'] })}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="btn" disabled={months.length >= LIMITS.months} onClick={() => set({ months: [...months, { name: '', days: 30 }] })}>
              + Add a month
            </button>
          </fieldset>

          <div className="grid-2 tight">
            <label className="field">
              <span>Hours in a day</span>
              <input type="number" min={1} max={LIMITS.hours} step={1} value={shown(current.hoursPerDay)} aria-label="Hours in a day" onChange={(e) => set({ hoursPerDay: numberOf(e.target.value) })} />
            </label>
            <label className="field">
              <span>Days in a week</span>
              <input type="number" min={1} max={LIMITS.week} step={1} value={shown(current.daysPerWeek)} aria-label="Days in a week" onChange={(e) => set({ daysPerWeek: numberOf(e.target.value) })} />
            </label>
          </div>

          <fieldset className="plan-group">
            <legend>Eras</legend>
            <p className="muted small">Optional. Years from an era’s first year on are counted in it: an era “Second Age” beginning in year 1000 makes year 1003 “Second Age 4”. Years before the first era stay “Year N”. Dates are still typed as plain years.</p>
            {eras.length > 0 && (
              <ol className="cal-rows" aria-label="Eras">
                {eras.map((era, i) => (
                  <li key={i}>
                    <input value={era.name} aria-label={`Name of era ${i + 1}`} onChange={(e) => setEra(i, { name: e.target.value })} />
                    <label className="cal-days">
                      <span className="muted small">from year</span>
                      <input type="number" step={1} value={shown(era.startYear)} aria-label={`First year of ${era.name.trim() || `era ${i + 1}`}`} onChange={(e) => setEra(i, { startYear: numberOf(e.target.value) })} />
                    </label>
                    <span className="cal-actions">
                      <button type="button" className="btn ghost icon" aria-label={`Remove ${era.name.trim() || `era ${i + 1}`}`} onClick={() => set({ eras: eras.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <button type="button" className="btn" disabled={eras.length >= LIMITS.eras} onClick={() => set({ eras: [...eras, { name: '', startYear: eras.length ? Math.max(...eras.map((e) => (Number.isFinite(e.startYear) ? e.startYear : 0))) + 1000 : 1 }] })}>
              + Add an era
            </button>
          </fieldset>

          <fieldset className="plan-group">
            <legend>Seasons</legend>
            <p className="muted small">The month each season begins in, for dates given as “Summer of Year 10”. A season lasts until the next begins.</p>
            <div className="grid-2 tight">
              {SEASONS.map((season: Season) => (
                <label key={season} className="field">
                  <span>{SEASON_LABELS[season]} begins in</span>
                  <select value={current.seasons[season]} aria-label={`${SEASON_LABELS[season]} begins in`} onChange={(e) => set({ seasons: { ...current.seasons, [season]: Number(e.target.value) } })}>
                    {months.map((m, i) => (
                      <option key={i} value={i + 1}>
                        {m.name.trim() || `Month ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      {problems.length > 0 ? (
        <ul className="error small" role="alert" aria-label="To fix before saving">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="small" aria-live="polite">
          {describeCalendar(preview)}. Dates read like “{sample}”.
        </p>
      )}

      {away.length > 0 && (
        <div className="notice" role="status">
          <p>
            {away.length} {away.length === 1 ? 'event has a date' : 'events have dates'} this calendar does not have. {changed ? 'Saving keeps them as they are:' : 'They are kept as they are:'} the timeline lists them apart, saying why, until the date or the calendar changes.
          </p>
          <ul className="small">
            {away.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link to={`/project/${projectId}/timeline?event=${m.id}`}>{m.name}</Link>: {m.problem}
              </li>
            ))}
            {away.length > 8 && <li>…and {away.length - 8} more.</li>}
          </ul>
        </div>
      )}

      <div className="actions start wrap">
        <button type="button" className="btn primary" disabled={!changed || problems.length > 0} onClick={save}>
          Save calendar
        </button>
        <button type="button" className="btn ghost" disabled={!changed} onClick={() => (setDraft(null), setError(null))}>
          Discard changes
        </button>
      </div>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
