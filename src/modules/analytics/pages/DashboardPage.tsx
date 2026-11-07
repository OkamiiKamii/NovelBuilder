import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analytics } from '@/core';
import { DashboardBoard } from '@/modules/dashboard/DashboardBoard';
import { BarChart } from '@/modules/progress/components/BarChart';
import { parseDay } from '@/modules/progress/time';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { formatNumber } from '@/shared/format';
import type { Place } from '../compute';

const date = (day: string) => parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;

function Tile({ value, label, detail }: { value: React.ReactNode; label: string; detail?: React.ReactNode }) {
  return (
    <div className="tile" role="group" aria-label={label}>
      <strong>{value}</strong>
      <span>{label}</span>
      {detail && <span className="muted small">{detail}</span>}
    </div>
  );
}

/** One cell per chapter, filled where something is present: where in the book, at a glance. */
function Strip({ total, chapters, label }: { total: number; chapters: number[]; label: string }) {
  const filled = new Set(chapters);
  return (
    <span className="strip" role="img" aria-label={label} style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={filled.has(i + 1) ? 'on' : ''} title={`Chapter ${i + 1}`} />
      ))}
    </span>
  );
}

/** Parts of a whole as one bar, with every part named and counted beside it so colour is never the only cue. */
function Parts({ label, parts, palette }: { label: string; parts: { key: string; label: string; count: number }[]; palette: string }) {
  const total = parts.reduce((n, p) => n + p.count, 0);
  return (
    <div className={`parts ${palette}`}>
      <span className="parts-bar" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
        {parts.filter((p) => p.count > 0).map((p) => (
          <span key={p.key} className={`part part-${p.key}`} style={{ flexGrow: p.count }} title={`${p.label}: ${p.count}`} />
        ))}
        {total === 0 && <span className="part part-none" style={{ flexGrow: 1 }} />}
      </span>
      <ul className="parts-key">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`part-dot part-${p.key}`} aria-hidden="true" />
            {p.label} <strong>{p.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The project dashboard. It is worked out only while this page is open, from
 * what is already saved; the editor does no extra work for it.
 */
export function DashboardPage() {
  const project = useCurrentProject();
  const api = useMemo(() => analytics.forProject(project.id), [project.id]);
  const report = useLiveQuery(() => api.report(), [api]);
  const [allCast, setAllCast] = useState(false);
  if (!report) return null;
  const { output, sessions, structure, cast, threads, observations } = report;
  const base = `/project/${project.id}`;
  const chapterLink = (place: Place & { words: number }) => (
    <Link to={`${base}/manuscript/${place.nodeId}`}>
      {place.title} ({formatNumber(place.words)})
    </Link>
  );
  const most = Math.max(1, ...cast.rows.map((r) => r.chapters.length));
  const shown = allCast ? cast.rows : cast.rows.slice(0, 12);

  return (
    <div className="stack dashboard-page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted" role="status">
            {formatNumber(output.totalWords)} {output.totalWords === 1 ? 'word' : 'words'}
            {output.targetWords ? ` · ${output.percent}% of ${formatNumber(output.targetWords)}` : ''} · {structure.chapters} {structure.chapters === 1 ? 'chapter' : 'chapters'} · {cast.total} {cast.total === 1 ? 'character' : 'characters'} · {threads.total}{' '}
            {threads.total === 1 ? 'plot thread' : 'plot threads'}
          </p>
        </div>
      </header>

      <DashboardBoard projectId={project.id} />

      <section className="panel" aria-label="Observations">
        <h2>Observations</h2>
        {observations.length === 0 ? (
          <p className="muted">Nothing stands out in the numbers below.</p>
        ) : (
          <ul className="observations">
            {observations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <p className="muted small">These are counts taken from your project, stated as they are. Whether any of them is as you intend is yours to say.</p>
      </section>

      <section className="stack" aria-label="Writing output">
        <h2>Writing output</h2>
        <div className="tiles">
          <Tile value={formatNumber(output.totalWords)} label="Words in the manuscript" detail={output.targetWords ? `${output.percent}% of the ${formatNumber(output.targetWords)} target` : 'No target set'} />
          <Tile value={signed(output.today.net)} label="Words today" detail={`${output.today.sessions} ${output.today.sessions === 1 ? 'session' : 'sessions'}`} />
          <Tile value={signed(output.week.net)} label="This week" detail={`${days(output.week.activeDays)} with writing`} />
          <Tile value={signed(output.month.net)} label="This month" detail={`${days(output.month.activeDays)} with writing`} />
          <Tile value={signed(output.averagePerWritingDay)} label="Average per writing day" detail={`over ${days(sessions.writingDays)}`} />
          <Tile value={signed(output.averagePerDayLast30)} label="Average per day, last 30 days" />
        </div>
        <div className="grid-2">
          <BarChart title="Net words per day, last 30 days" periodLabel="On" points={output.days} labelEvery={5} />
          <BarChart title="Net words per week, last 8 weeks" periodLabel="Week of" points={output.weeks} />
        </div>
      </section>

      <section className="stack" aria-label="Sessions">
        <h2>Sessions</h2>
        <div className="tiles">
          <Tile value={sessions.count} label="Writing sessions" detail={`${minutes(sessions.totalMinutes)} in all`} />
          <Tile value={signed(sessions.averageWords)} label="Words per session" />
          <Tile value={minutes(sessions.averageMinutes)} label="Average session length" />
          <Tile value={sessions.longestByWords ? formatNumber(sessions.longestByWords.words) : '—'} label="Most words in a session" detail={sessions.longestByWords ? date(sessions.longestByWords.day) : undefined} />
          <Tile value={sessions.longestByTime ? minutes(sessions.longestByTime.minutes) : '—'} label="Longest session" detail={sessions.longestByTime ? date(sessions.longestByTime.day) : undefined} />
          <Tile value={days(sessions.currentStreak)} label="Current streak" detail={`longest: ${days(sessions.longestStreak)}`} />
        </div>
      </section>

      <section className="stack" aria-label="Manuscript structure">
        <h2>Manuscript structure</h2>
        <div className="tiles">
          <Tile value={structure.chapters} label="Chapters" />
          <Tile value={structure.scenes} label="Scenes" />
          <Tile value={formatNumber(structure.averageChapter)} label="Average chapter length" detail="words, chapters with text" />
          <Tile value={formatNumber(structure.averageScene)} label="Average scene length" detail="words, scenes with text" />
          <Tile value={structure.longest ? chapterLink(structure.longest) : '—'} label="Longest chapter" />
          <Tile value={structure.shortest ? chapterLink(structure.shortest) : '—'} label="Shortest chapter with text" />
        </div>
        <div className="panel">
          <h3>Chapters by stage</h3>
          <Parts label="Chapters by stage" parts={structure.pipeline} palette="pipeline" />
        </div>
        {structure.lengths.length > 0 && (
          <BarChart title="Words per chapter, in reading order" periodLabel="Chapter" points={structure.lengths.map((c) => ({ key: c.nodeId, label: `${c.number}`, net: c.words, current: false }))} labelEvery={Math.max(1, Math.ceil(structure.lengths.length / 12))} />
        )}
      </section>

      <section className="stack" aria-label="Characters">
        <h2>Characters</h2>
        <p className="muted small">
          {cast.total} {cast.total === 1 ? 'character' : 'characters'} · {cast.appearing} {cast.appearing === 1 ? 'appears' : 'appear'} in the manuscript. A chapter counts when the character is linked in it, listed in its plan or named in its text.
        </p>
        {cast.rows.length > 0 && (
          <div className="matrix-scroll">
            <table className="analytics-table" aria-label="Character appearances">
              <thead>
                <tr>
                  <th scope="col">Character</th>
                  <th scope="col">Chapters</th>
                  <th scope="col">Where in the book</th>
                  <th scope="col">First</th>
                  <th scope="col">Latest</th>
                  <th scope="col">Relationships</th>
                  <th scope="col">Snapshots</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} title={row.line}>
                    <th scope="row">
                      <Link to={`${base}/characters/${row.id}`}>{row.name}</Link>
                    </th>
                    <td>
                      <span className="count-bar">
                        <span style={{ width: `${(row.chapters.length / most) * 100}%` }} />
                      </span>
                      {row.chapters.length}
                    </td>
                    <td>
                      <Strip total={structure.chapters} chapters={row.chapters} label={row.chapters.length ? `${row.name} appears in chapters ${row.distribution}` : `${row.name} appears in no chapter`} />
                      <span className="muted small">{row.distribution || 'No appearances recorded'}</span>
                    </td>
                    <td>{row.first ? <Link to={`${base}/manuscript/${row.first.nodeId}`}>Ch. {row.first.number}</Link> : '—'}</td>
                    <td>{row.latest ? <Link to={`${base}/manuscript/${row.latest.nodeId}`}>Ch. {row.latest.number}</Link> : '—'}</td>
                    <td>{row.relationships}</td>
                    <td>{row.milestones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cast.rows.length > 12 && (
          <div className="actions start">
            <button type="button" className="btn" onClick={() => setAllCast(!allCast)}>
              {allCast ? 'Show the twelve who appear most' : `Show all ${cast.rows.length}`}
            </button>
          </div>
        )}
      </section>

      <section className="stack" aria-label="Plot threads">
        <h2>Plot threads</h2>
        <div className="tiles">
          <Tile value={threads.total} label="Plot threads" />
          <Tile value={threads.openMysteries} label="Open mysteries" />
          <Tile value={threads.characterArcs} label="Character arcs" />
        </div>
        <div className="panel">
          <h3>Threads by status</h3>
          <Parts label="Threads by status" parts={threads.groups} palette="thread-parts" />
        </div>
        {threads.rows.length > 0 && (
          <div className="matrix-scroll">
            <table className="analytics-table" aria-label="Thread activity">
              <thead>
                <tr>
                  <th scope="col">Thread</th>
                  <th scope="col">Status</th>
                  <th scope="col">Developments</th>
                  <th scope="col">Chapters touched</th>
                  <th scope="col">Where in the book</th>
                  <th scope="col">Written chapters since the latest</th>
                </tr>
              </thead>
              <tbody>
                {threads.rows.map((row) => (
                  <tr key={row.id} title={row.line}>
                    <th scope="row">
                      <Link to={`${base}/plot?thread=${row.id}`}>{row.title}</Link>
                      <span className="muted small"> {row.category}</span>
                    </th>
                    <td>
                      <span className={`thread-status st-${row.status}`}>{row.statusLabel}</span>
                    </td>
                    <td>{row.beats}</td>
                    <td>
                      {row.chapters.length} of {structure.chapters} ({Math.round(row.density * 100)}%)
                    </td>
                    <td>
                      <Strip total={structure.chapters} chapters={row.chapters} label={row.chapters.length ? `${row.title} develops in chapters ${row.chapters.join(', ')}` : `${row.title} has no placed developments`} />
                    </td>
                    <td>{row.quietFor === null ? '—' : row.quietFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
