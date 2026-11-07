import { useState } from 'react';
import { arrange, moveTrack, toggle, type Track, type TrackPrefs } from '../tracks';

interface TrackPanelProps {
  /** The current way of splitting the timeline (`none`, `thread`, `category:<key>`). */
  grouping: string;
  options: { value: string; label: string }[];
  onGrouping: (value: string) => void;
  tracks: Track[];
  prefs: TrackPrefs;
  onPrefs: (prefs: TrackPrefs) => void;
}

/**
 * Choosing how the timeline is split into tracks, and arranging them: show or
 * hide each, move it up or down, fold it to one line, or look at it alone.
 * Every control is an ordinary button or checkbox named for its track, so
 * nothing here needs a mouse or a drag.
 */
export function TrackPanel({ grouping, options, onGrouping, tracks, prefs, onPrefs }: TrackPanelProps) {
  // The arrangement lives in the page address, which updates a moment after a click: show the change at once,
  // so a checkbox never flicks back, and follow the address whenever it changes another way (Back, a saved view).
  const key = JSON.stringify(prefs);
  const [local, setLocal] = useState({ from: key, prefs });
  if (local.from !== key) setLocal({ from: key, prefs });
  const now = local.from === key ? local.prefs : prefs;
  const change = (next: TrackPrefs) => {
    setLocal({ from: key, prefs: next });
    onPrefs(next);
  };
  // Every track in the author's order, hidden ones too, so they can be shown again.
  const ordered = arrange(tracks, { ...now, hidden: [], focus: null }).shown;
  const ids = ordered.map((t) => t.id);
  const focused = now.focus ? tracks.find((t) => t.id === now.focus) : undefined;
  // Open from the start when something is hidden or focused (a saved view, a shared link); after that the author opens and closes it.
  const [open, setOpen] = useState(() => Boolean(prefs.focus) || prefs.hidden.length > 0);
  return (
    <div className="stack tl-tracks">
      <label className="tl-group">
        <span>Tracks by</span>
        <select value={grouping} onChange={(e) => onGrouping(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {grouping !== 'none' && ordered.length > 0 && (
        <details className="tl-track-list" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary>
            Arrange tracks ({ordered.length - now.hidden.filter((id) => ids.includes(id)).length} of {ordered.length} shown)
          </summary>
          {focused && (
            <p className="small">
              Showing only “{focused.label}”.{' '}
              <button type="button" className="link" onClick={() => change({ ...now, focus: null })}>
                Show all tracks
              </button>
            </p>
          )}
          <ol aria-label="Tracks, in the order they are drawn">
            {ordered.map((t, i) => {
              const hidden = now.hidden.includes(t.id);
              const folded = now.folded.includes(t.id);
              return (
                <li key={t.id} className={hidden ? 'muted' : ''}>
                  <label className="check">
                    <input type="checkbox" checked={!hidden} onChange={() => change({ ...now, hidden: toggle(now.hidden, t.id) })} />
                    {t.label} <span className="muted small">({t.eventIds.length})</span>
                  </label>
                  <span className="tl-track-actions">
                    <button type="button" className="btn ghost icon" aria-label={`Move ${t.label} up`} disabled={i === 0} onClick={() => change({ ...now, order: moveTrack(ids, t.id, -1) })}>
                      ↑
                    </button>
                    <button type="button" className="btn ghost icon" aria-label={`Move ${t.label} down`} disabled={i === ordered.length - 1} onClick={() => change({ ...now, order: moveTrack(ids, t.id, 1) })}>
                      ↓
                    </button>
                    <button type="button" className="btn ghost" aria-pressed={folded} aria-label={`${folded ? 'Unfold' : 'Fold'} ${t.label}`} onClick={() => change({ ...now, folded: toggle(now.folded, t.id) })}>
                      {folded ? 'Unfold' : 'Fold'}
                    </button>
                    <button type="button" className="btn ghost" aria-pressed={now.focus === t.id} aria-label={`Show only ${t.label}`} onClick={() => change({ ...now, focus: now.focus === t.id ? null : t.id })}>
                      Only this
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </div>
  );
}
