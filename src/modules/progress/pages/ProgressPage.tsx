import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { manuscript, progress as progressService } from '@/core';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import { NODE_STATUSES, STATUS_LABELS } from '@/modules/manuscript/types';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { formatDate, formatNumber } from '@/shared/format';
import { computeProgress, sessionMinutes, type DeadlineProgress, type PeriodTotals, type TargetProgress } from '../analytics';
import { BarChart } from '../components/BarChart';
import { GoalForm } from '../components/GoalForm';
import { parseDay } from '../time';
import { TASK_LABELS, type Goal } from '../types';

const plural = (n: number, word: string) => `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;
const duration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}

/** A period's words, described plainly. Cutting is shown as cutting, not as a shortfall. */
function PeriodTile({ label, totals, target, empty }: { label: string; totals: PeriodTotals; target?: TargetProgress | null; empty: string }) {
  return (
    <div className="tile">
      <span>{label}</span>
      <strong>{totals.sessions === 0 ? '0' : signed(totals.net)}</strong>
      <span>
        {totals.sessions === 0
          ? empty
          : totals.removed > 0
            ? `${formatNumber(totals.added)} written, ${formatNumber(totals.removed)} trimmed`
            : `words in ${plural(totals.sessions, 'session')}`}
      </span>
      {target && (
        <>
          <Meter percent={target.percent} label={`${label} target`} />
          <span>
            {target.percent >= 100 ? 'Target reached' : `${target.percent}% of ${formatNumber(target.target)}`}
          </span>
        </>
      )}
    </div>
  );
}

function NumberTarget({ label, value, onCommit }: { label: string; value: number | null; onCommit: (value: number | null) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => setText(value ? String(value) : ''), [value]);
  const commit = () => {
    const next = text.trim() ? Math.max(0, Math.round(Number(text))) || null : null;
    if (next !== value) onCommit(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" min={0} step={1} value={text} placeholder="No target" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  );
}

function deadlineText(d: DeadlineProgress): string {
  const when = d.daysLeft > 0 ? `${plural(d.daysLeft, 'day')} to go` : d.daysLeft === 0 ? 'Due today' : `${plural(-d.daysLeft, 'day')} past the date`;
  if (!d.target) return when;
  const count = `${formatNumber(d.words)} / ${formatNumber(d.target)} words`;
  if (d.reached) return `${count} · reached`;
  return `${count} · ${when}${d.perDay ? ` · about ${formatNumber(d.perDay)} a day gets there` : ''}`;
}

export function ProgressPage() {
  const project = useCurrentProject();
  const ms = useMemo(() => manuscript.forProject(project.id), [project.id]);
  const goalsApi = useMemo(() => progressService.forProject(project.id), [project.id]);
  const nodes = useLiveQuery(() => ms.list(), [ms]);
  const sessions = useLiveQuery(() => goalsApi.sessions(), [goalsApi]);
  const goals = useLiveQuery(() => goalsApi.goals(), [goalsApi]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = useMemo(
    () => (nodes && sessions && goals ? computeProgress({ targetWordCount: project.targetWordCount, nodes, sessions, goals }) : null),
    [nodes, sessions, goals, project.targetWordCount],
  );
  const scopes = useMemo(() => flatten(buildTree(nodes ?? [])).filter((t) => t.node.kind !== 'scene'), [nodes]);
  if (!report || !sessions || !goals) return null;

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const run = (task: Promise<unknown>) => void task.then(() => setError(null), fail);
  const tasks = goals.filter((g) => g.kind === 'task').sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);
  const recent = [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 12);

  const health = [
    report.targetWords ? `${formatNumber(report.totalWords)} / ${formatNumber(report.targetWords)} words` : plural(report.totalWords, 'word'),
    report.percent !== null ? `${report.percent}% complete` : null,
    report.chapters.total ? `${report.chapters.completed} / ${report.chapters.total} chapters complete` : null,
    `${formatNumber(Math.max(0, report.week.net))} words this week`,
  ].filter(Boolean);

  const row = (goal: Goal, body: React.ReactNode) => (
    <li key={goal.id} className={goal.done ? 'goal done' : 'goal'}>
      {editing === goal.id ? (
        <GoalForm
          kind={goal.kind as 'deadline' | 'task'}
          initial={goal}
          scopes={scopes}
          onCancel={() => setEditing(null)}
          onSubmit={(input) => goalsApi.updateGoal(goal.id, input).then(() => setEditing(null))}
        />
      ) : (
        <>
          <input type="checkbox" checked={goal.done} aria-label={`${goal.title} done`} onChange={(e) => run(goalsApi.setDone(goal.id, e.target.checked))} />
          <div className="goal-body">{body}</div>
          <button type="button" className="btn ghost" aria-label={`Edit ${goal.title}`} onClick={() => setEditing(goal.id)}>
            Edit
          </button>
          <button type="button" className="btn ghost icon" aria-label={`Delete ${goal.title}`} onClick={() => run(goalsApi.removeGoal(goal.id))}>
            ✕
          </button>
        </>
      )}
    </li>
  );

  return (
    <div className="stack progress">
      <header>
        <h1>Progress</h1>
        <p className="health">{health.join(' • ')}</p>
      </header>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="tiles" aria-label="Words">
        <div className="tile">
          <span>Manuscript</span>
          <strong>{formatNumber(report.totalWords)}</strong>
          <span>{report.targetWords ? `of ${formatNumber(report.targetWords)} words` : 'words so far'}</span>
          {report.percent !== null && <Meter percent={report.percent} label="Manuscript target" />}
        </div>
        <PeriodTile label="Today" totals={report.today} target={report.daily} empty="Nothing logged yet today" />
        <PeriodTile label="This week" totals={report.week} target={report.weekly} empty="Nothing logged yet this week" />
        <PeriodTile label="This month" totals={report.month} empty="Nothing logged yet this month" />
      </section>

      <section className="charts">
        <BarChart title="Net words per week, last 8 weeks" periodLabel="Week of" points={report.weeks} />
        <BarChart title="Net words per day, last 14 days" periodLabel="" points={report.days} labelEvery={3} />
      </section>

      <section className="tiles" aria-label="Structure and pace">
        <div className="tile">
          <span>Chapters complete</span>
          <strong>
            {report.chapters.completed} / {report.chapters.total}
          </strong>
          <span>Draft Complete or later</span>
        </div>
        <div className="tile">
          <span>Scenes complete</span>
          <strong>
            {report.scenes.completed} / {report.scenes.total}
          </strong>
          <span>Draft Complete or later</span>
        </div>
        <div className="tile">
          <span>Average chapter</span>
          <strong>{formatNumber(report.averageChapterWords)}</strong>
          <span>words, scenes included</span>
        </div>
        <div className="tile">
          <span>Writing sessions</span>
          <strong>{formatNumber(report.sessionCount)}</strong>
          <span>{report.sessionCount ? `${duration(report.totalMinutes)} in all` : 'Logged as you write'}</span>
        </div>
        <div className="tile">
          <span>Average session</span>
          <strong>{formatNumber(Math.max(0, report.averageWordsPerSession))}</strong>
          <span>net words</span>
        </div>
        <div className="tile">
          <span>Days written</span>
          <strong>{report.daysWrittenLast30}</strong>
          <span>
            of the last 30
            {report.currentRun >= 2 ? ` · ${report.currentRun} in a row` : report.lastWritingDay && report.currentRun === 0 ? ` · last on ${formatDate(report.lastWritingDay)}` : ''}
          </span>
        </div>
      </section>

      <section className="panel">
        <h2>Where the manuscript stands</h2>
        <ul className="status-bars">
          {NODE_STATUSES.map((status) => {
            const count = report.statusCounts[status];
            const total = report.chapters.total + report.scenes.total;
            return (
              <li key={status}>
                <span>{STATUS_LABELS[status]}</span>
                <span className="status-track">
                  <span style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
                </span>
                <strong>{count}</strong>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Chapters and scenes at each stage. Set a stage from the Plan tab or the Organizer.</p>
      </section>

      <div className="goal-columns">
        <section className="panel">
          <h2>Word targets</h2>
          <p className="muted small">Optional. They are a yardstick, not a quota: days spent planning, revising or resting are part of writing a book.</p>
          <div className="grid-2 tight">
            <NumberTarget label="Words per day" value={report.daily?.target ?? null} onCommit={(value) => run(goalsApi.setTarget('daily', value))} />
            <NumberTarget label="Words per week" value={report.weekly?.target ?? null} onCommit={(value) => run(goalsApi.setTarget('weekly', value))} />
          </div>
          <p className="muted small">
            Manuscript target: {project.targetWordCount ? `${formatNumber(project.targetWordCount)} words` : 'none'}
            {project.deadline && ` by ${formatDate(project.deadline)}`}. <Link to="../settings">Change in Settings</Link>
          </p>

          <h2>Deadlines</h2>
          <ul className="goals">
            {report.deadlines.map((d) =>
              row(
                d.goal,
                <>
                  <strong>{d.goal.title}</strong>
                  <span className="muted small">
                    {formatDate(d.goal.dueDate!)}
                    {d.scope ? ` · ${d.scope}` : d.goal.nodeId ? '' : ' · whole manuscript'}
                  </span>
                  {d.percent !== null && <Meter percent={d.percent} label={`${d.goal.title} progress`} />}
                  <span className="small">{deadlineText(d)}</span>
                </>,
              ),
            )}
          </ul>
          <GoalForm kind="deadline" scopes={scopes} onSubmit={(input) => goalsApi.addGoal('deadline', input)} />
        </section>

        <section className="panel">
          <div className="page-header">
            <h2>Tasks &amp; milestones</h2>
            {report.tasks.total > 0 && (
              <span className="muted small">
                {report.tasks.done} of {report.tasks.total} done
              </span>
            )}
          </div>
          <p className="muted small">For the work that word counts miss: worldbuilding, outlining, revising.</p>
          <ul className="goals">
            {tasks.map((task) =>
              row(
                task,
                <>
                  <strong>{task.title}</strong>
                  <span className="muted small">
                    {TASK_LABELS[task.category ?? 'other']}
                    {task.dueDate && ` · ${formatDate(task.dueDate)}`}
                    {task.done && task.doneAt && ` · done ${new Date(task.doneAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </span>
                </>,
              ),
            )}
          </ul>
          <GoalForm kind="task" scopes={scopes} onSubmit={(input) => goalsApi.addGoal('task', input)} />
        </section>
      </div>

      <section className="panel">
        <h2>Recent sessions</h2>
        {recent.length === 0 ? (
          <p className="muted">Sessions are logged automatically while you write or revise. A break of half an hour starts a new one.</p>
        ) : (
          <div className="table-scroll">
            <table className="sessions">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Started</th>
                  <th scope="col">Length</th>
                  <th scope="col">Words</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((session) => (
                  <tr key={session.id}>
                    <td>{parseDay(session.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td>{new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</td>
                    <td>{duration(sessionMinutes(session))}</td>
                    <td>
                      {signed(session.netWords)}
                      {session.netWords <= 0 && <span className="muted"> · revising</span>}
                    </td>
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
