import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IfViewOn, ViewLink } from '@/modules/visualize/ViewLink';
import { timeline } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { Modal } from '@/shared/Modal';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { describeCalendar, yearName } from '../calendar';
import { birthDateOf, lifePath, lifeSummary } from '../ages';
import { formatDate, formatDuration, type Placed } from '../chronology';
import { EventDetails } from '../components/EventDetails';
import { useTimeline, useTimelineReview } from '../hooks';
import { IMPORTANCE_LABELS, PRECISION_LABELS, PRECISIONS, REVEAL_CHOICES, type Importance, type Precision } from '../types';

const RANK: Record<Importance, number> = { minor: 0, major: 1, climax: 2 };

export function TimelinePage() {
  const project = useCurrentProject();
  const api = useMemo(() => timeline.forProject(project.id), [project.id]);
  const { placed, entries, nodes, calendar, loading } = useTimeline(project.id);
  const isMobile = useMediaQuery('(max-width: 1100px)');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [minimum, setMinimum] = useState<Importance>('minor');
  const [locationId, setLocationId] = useState('');
  const [precision, setPrecision] = useState<Precision | ''>('');
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const characters = useMemo(() => entries.filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name)), [entries]);
  const locations = useMemo(() => entries.filter((e) => e.category === 'location').sort((a, b) => a.name.localeCompare(b.name)), [entries]);
  const characterId = characters.some((c) => c.id === params.get('character')) ? params.get('character')! : '';
  const selected = placed.find((p) => p.event.id === params.get('event')) ?? null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');

  const birthDate = birthDateOf(byId.get(characterId));
  const life = useMemo(() => (characterId ? lifePath(placed, characterId, calendar, birthDate) : []), [placed, characterId, calendar, birthDate]);
  const ages = useMemo(() => new Map(life.map((step) => [step.placed.event.id, step])), [life]);
  const needle = query.trim().toLowerCase();
  const visible = placed.filter(({ event }) => {
    if (characterId && !event.characters.some((c) => c.id === characterId)) return false;
    if (RANK[event.importance] < RANK[minimum]) return false;
    if (locationId && event.locationId !== locationId) return false;
    if (precision && event.when.precision !== precision) return false;
    return !needle || [event.name, event.description].some((text) => text.toLowerCase().includes(needle));
  });

  // Group by year for headings; undated events come last under their own heading.
  const groups: { key: string; heading: string; items: Placed[] }[] = [];
  for (const item of visible) {
    const last = groups[groups.length - 1];
    // An undated event that follows another sits with it, under the same year.
    const key = item.year !== null ? String(item.year) : item.anchored && last ? last.key : 'undated';
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, heading: key === 'undated' ? 'Not yet placed in time' : yearName(Number(key), calendar), items: [item] });
  }
  const toCheck = placed.filter((p) => p.issues.length).length + (characterId ? life.filter((s) => s.issue).length : 0);
  // Review findings the event editor shows beside an event's own: those its other checks do not already raise.
  const review = useTimelineReview(project.id);
  const reviewOf = (eventId: string) => (review?.open ?? []).filter((f) => f.eventIds.includes(eventId) && (f.rule === 'dates' || f.rule === 'travel' || f.rule === 'two-places'));
  const filtered = visible.length !== placed.length;

  const details = selected && (
    <EventDetails key={selected.event.id} placed={selected} all={placed} calendar={calendar} findings={reviewOf(selected.event.id)} entries={entries} nodes={nodes} api={api} projectId={project.id} onClose={() => setParam('event', null)} onError={fail} />
  );

  if (loading) return null;
  return (
    <div className="stack timeline-page">
      <header className="page-header">
        <div>
          <h1>Timeline</h1>
          <p className="muted">
            {placed.length} {placed.length === 1 ? 'event' : 'events'} in the order they happened
            {toCheck > 0 && ` · ${toCheck} to check`}
          </p>
          <p className="small timeline-calendar">
            Dates use {calendar.standard ? 'the standard calendar' : describeCalendar(calendar)}. <Link to={`/project/${project.id}/settings#calendar`}>Change the calendar</Link> · <Link to={`/project/${project.id}/histories`}>Alternate histories</Link> · <Link to={`/project/${project.id}/timeline/review`}>{review && review.open.length ? `Review: ${review.open.length} to look at` : 'Review'}</Link>
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() =>
            api.create().then(async (event) => {
              // A new event made while looking at a character's life belongs to that life.
              if (characterId) await api.update(event.id, { characters: [{ id: characterId, age: null }] });
              setError(null);
              setParam('event', event.id);
            }, fail)
          }
        >
          New event
        </button>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <div className="toolbar">
        <input type="search" value={query} placeholder="Search events…" aria-label="Search events" onChange={(e) => setQuery(e.target.value)} />
        <select value={characterId} aria-label="Life path of" onChange={(e) => setParam('character', e.target.value || null)}>
          <option value="">Everyone</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}'s life
            </option>
          ))}
        </select>
        <select value={minimum} aria-label="Importance" onChange={(e) => setMinimum(e.target.value as Importance)}>
          <option value="minor">All importance</option>
          <option value="major">Major and climax</option>
          <option value="climax">Climax only</option>
        </select>
        <select value={locationId} aria-label="Location" onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Anywhere</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={precision} aria-label="Date precision" onChange={(e) => setPrecision(e.target.value as Precision | '')}>
          <option value="">Any date</option>
          {PRECISIONS.map((p) => (
            <option key={p} value={p}>
              {PRECISION_LABELS[p]} dates
            </option>
          ))}
        </select>
      </div>

      {characterId && (
        <section className="panel life-path" aria-label="Life path">
          <h2>{byId.get(characterId)?.name}'s life</h2>
          {life.length === 0 ? (
            <p className="muted">No events involve {byId.get(characterId)?.name} yet. Add them to an event, or create one now.</p>
          ) : (
            <>
              <p className="life-summary">{lifeSummary(life)}</p>
              {!life.some((s) => s.label) && <p className="muted small">To see ages, give {byId.get(characterId)?.name} a date of birth on their profile, or an age in any dated event (0 for their birth); the rest are worked out from the dates, as exactly as they allow.</p>}
              {life.some((s) => s.ageAt.kind === 'range') && <p className="muted small">An age like 25–26 means the dates are not exact enough to say which: born some time in a year, someone may not have had their birthday yet.</p>}
              <IfViewOn view="history">
                <p className="small">
                  <ViewLink to={`/project/${project.id}/visualize/history?who=${characterId}`}>{byId.get(characterId)?.name}'s whole life history</ViewLink>
                </p>
              </IfViewOn>
            </>
          )}
        </section>
      )}

      <div className={`rel-body${selected && !isMobile ? ' with-details' : ''}`}>
        <div>
          {placed.length === 0 ? (
            <div className="empty">
              <h2>What happened, and when</h2>
              <p className="muted">
                The timeline is the story's own chronology, separate from the order chapters are told in. Record events with an exact date, a rough one, or just
                “about twenty years before the Siege”.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="muted">No events match these filters.</p>
          ) : (
            <ol className="chronology" aria-label="Events in chronological order">
              {groups.map((group) => (
                <li key={group.key}>
                  <h2 className={group.key === 'undated' ? 'undated' : ''}>{group.heading}</h2>
                  <ol>
                    {group.items.map((item) => {
                      const { event } = item;
                      const step = ages.get(event.id);
                      const cast = event.characters.flatMap((c) => byId.get(c.id)?.name ?? []);
                      // How a chapter tells it, when not plainly: "Told in Chapter 4 (as a flashback)".
                      const told = event.nodeIds.flatMap((id) => {
                        const title = nodes.find((n) => n.id === id)?.title;
                        const role = event.reveals?.find((r) => r.nodeId === id)?.role;
                        return title === undefined ? [] : role && role !== 'told' ? [`${title} (${REVEAL_CHOICES[role].toLowerCase()})`] : [title];
                      });
                      const problems = item.issues.length + (step?.issue ? 1 : 0) + reviewOf(event.id).length;
                      return (
                        <li key={event.id} className={`event imp-${event.importance}${event.id === selected?.event.id ? ' selected' : ''}`}>
                          <span className="event-marker" aria-hidden="true" />
                          <button type="button" className="event-card" onClick={() => setParam('event', event.id)}>
                            <span className="event-when">
                              {step?.label && <strong className="event-age">{step.label}</strong>}
                              {item.label}
                              {event.duration && ` · lasts ${formatDuration(event.duration)}`}
                              {event.ongoing && ' · still going on'}
                              {event.end && (event.end.precision === 'unknown' ? ' · end not known' : ` · until ${formatDate(event.end, (id) => placed.find((p) => p.event.id === id)?.event.name, calendar)}`)}
                            </span>
                            <strong className="event-name">
                              {event.name}
                              {event.importance !== 'minor' && <span className={`imp imp-${event.importance}`}>{IMPORTANCE_LABELS[event.importance]}</span>}
                            </strong>
                            {(event.locationId && byId.has(event.locationId)) || cast.length > 0 || told.length > 0 ? (
                              <span className="muted small">
                                {[event.locationId ? byId.get(event.locationId)?.name : null, cast.join(', ') || null, told.length ? `Told in ${told.join(', ')}` : null].filter(Boolean).join(' · ')}
                              </span>
                            ) : null}
                            {problems > 0 && (
                              <span className="event-flag small">
                                {problems} {problems === 1 ? 'thing' : 'things'} to check
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
          )}
          {filtered && placed.length > 0 && (
            <p className="muted small">
              Showing {visible.length} of {placed.length} events.
            </p>
          )}
        </div>
        {!isMobile && selected && (
          <aside className="panel rel-drawer" aria-label="Event details">
            {details}
          </aside>
        )}
      </div>

      {isMobile && selected && (
        <Modal title="Event" onClose={() => setParam('event', null)}>
          {details}
        </Modal>
      )}
    </div>
  );
}
