import type { Calendar } from '../calendar';
import type { EventDate } from '../types';

/** A date as the change form edits it: exact (year, month, day), around a year, or none. */
export function DateFields({ when, calendar, onChange }: { when: EventDate; calendar: Calendar; onChange: (when: EventDate) => void }) {
  const precision = when.precision === 'exact' || when.precision === 'approximate' ? when.precision : 'unknown';
  const year = 'year' in when ? when.year : 1;
  const month = when.precision === 'exact' ? when.month : null;
  const day = when.precision === 'exact' ? when.day : null;
  const exact = (patch: { year?: number; month?: number | null; day?: number | null }) => onChange({ precision: 'exact', year, month, day, hour: null, minute: null, ...patch });
  return (
    <div className="grid-2 tight">
      <label className="field">
        <span>Date</span>
        <select value={precision} aria-label="How exact the date is" onChange={(e) => onChange(e.target.value === 'exact' ? { precision: 'exact', year, month: null, day: null, hour: null, minute: null } : e.target.value === 'approximate' ? { precision: 'approximate', year, month: null, season: null } : { precision: 'unknown' })}>
          <option value="exact">Exact</option>
          <option value="approximate">Around a year</option>
          <option value="unknown">No date</option>
        </select>
      </label>
      {precision !== 'unknown' && (
        <label className="field">
          <span>Year</span>
          <input type="number" step={1} value={year} aria-label="Year" onChange={(e) => (precision === 'exact' ? exact({ year: Number(e.target.value) || 0 }) : onChange({ precision: 'approximate', year: Number(e.target.value) || 0, month: null, season: null }))} />
        </label>
      )}
      {precision === 'exact' && (
        <>
          <label className="field">
            <span>Month</span>
            <select value={month ?? ''} aria-label="Month" onChange={(e) => exact({ month: e.target.value ? Number(e.target.value) : null, day: null })}>
              <option value="">Not set</option>
              {calendar.months.map((name, i) => (
                <option key={`${i}-${name}`} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Day</span>
            <input type="number" min={1} step={1} value={day ?? ''} disabled={!month} aria-label="Day" onChange={(e) => exact({ day: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </>
      )}
    </div>
  );
}
