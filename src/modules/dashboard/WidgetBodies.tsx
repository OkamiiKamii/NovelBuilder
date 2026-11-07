import { useLiveQuery } from 'dexie-react-hooks';
import { Component, useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { savedViews } from '@/core';
import { STATE_LABELS, type CellState } from '@/modules/characters/appearances';
import { SEVERITIES, SEVERITY_LABELS } from '@/modules/continuity/types';
import { isGroup } from '@/modules/manuscript/tree';
import { KIND_LABELS } from '@/modules/manuscript/types';
import { routeFor } from '@/modules/model/navigate';
import type { StoryModel } from '@/modules/model/types';
import { STATUS_LABELS, STATUS_ORDER } from '@/modules/plot/types';
import { useReview } from '@/modules/review/useReview';
import { REVEAL_LABELS } from '@/modules/timeline/types';
import { openSaved, type SavedView } from '@/modules/visualize/saved';
import { addressFor } from '@/modules/visualize/SavedViewsBar';
import { useLinkAllowed } from '@/modules/visualize/ViewLink';
import { VIEWS } from '@/modules/visualize/views';
import { formatNumber, formatRelative } from '@/shared/format';
import { MAX_COUNT, RECENT_TYPES, settingsOf, type RecentType, type Widget, type WidgetKind } from './layout';
import { appearanceSummary, recentRecords, savedRows, threadSummary, upcomingEvents, warningSummary, wordRows } from './widgets';

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const RECENT_LABELS: Record<RecentType, string> = { node: 'Chapters, scenes and parts', entry: 'Codex entries', event: 'Events', thread: 'Plot threads', relation: 'Relationships' };
const viewLabel = (key: string) => VIEWS.find((v) => v.key === key)?.label ?? key;

/** A note above a widget's list: something the author should know about what it shows. */
const Note = ({ children }: { children: ReactNode }) => <p className="dash-note">{children}</p>;
/** Nothing to show, and why; with where to go to change that. */
const Empty = ({ children, to, label }: { children: ReactNode; to?: string; label?: string }) => (
  <div className="dash-empty-body">
    <p className="muted">{children}</p>
    {to && label && <Link to={to}>{label}</Link>}
  </div>
);
const Shown = ({ shown, total }: { shown: number; total: number }) => (total > shown ? <p className="muted small dash-more">Showing {formatNumber(shown)} of {formatNumber(total)}. Show more in its settings.</p> : null);

interface BodyProps {
  widget: Widget;
  model: StoryModel;
  projectId: string;
}

function UpcomingBody({ widget, model, projectId }: BodyProps) {
  const base = `/project/${projectId}`;
  const settings = useMemo(() => settingsOf('upcoming', widget.config), [widget.config]);
  const data = useMemo(() => upcomingEvents(model, settings), [model, settings]);
  const filtered = Boolean(settings.threadId || settings.characterId);
  const following = [settings.threadId && model.threads.get(settings.threadId)?.title, settings.characterId && model.entries.get(settings.characterId)?.name].filter(Boolean).join(' and ');
  return (
    <>
      {data.missing.thread && <Note>The plot thread this widget follows no longer exists. Choose another in its settings.</Note>}
      {data.missing.character && <Note>The character this widget follows no longer exists. Choose another in its settings.</Note>}
      <p className="muted small">
        {settings.from === 'reading' ? 'Told in chapters and scenes with no words yet, in reading order.' : data.reached ? `Later in story time than “${data.reached.title}” (${data.reached.when}), the latest event a chapter with words tells as it happens.` : 'No chapter with words tells a dated event as it happens yet, so from the start of the story, by date.'}
        {following && ` Involving ${following}.`}
      </p>
      {model.events.size === 0 ? (
        <Empty to={`${base}/timeline`} label="Open the Timeline">No events on the timeline yet.</Empty>
      ) : data.rows.length === 0 ? (
        <Empty>{filtered && data.matching === 0 ? 'No event matches the thread and character chosen.' : settings.from === 'reading' ? 'No event is told in a chapter without words yet.' : 'No dated event happens after that point.'}</Empty>
      ) : (
        <ol className="dash-list">
          {data.rows.map((row) => (
            <li key={row.id}>
              <Link to={`${base}/timeline?event=${encodeURIComponent(row.id)}`}>{row.title}</Link>
              <span className="muted small">{row.when}</span>
              <span className="small">
                {settings.from === 'reading'
                  ? row.places.map((p) => `${REVEAL_LABELS[p.role]} ${p.label}`).join('; ')
                  : row.places.length
                    ? row.places.map((p) => `${REVEAL_LABELS[p.role]} ${p.label}${p.written ? ' (has words)' : ' (no words yet)'}`).join('; ')
                    : 'Not told in any chapter yet'}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Shown shown={data.rows.length} total={data.total} />
      {data.unplaced > 0 && <p className="muted small">{settings.from === 'reading' ? `${plural(data.unplaced, 'event')} ${data.unplaced === 1 ? 'is' : 'are'} told in no chapter yet, so not counted.` : `${plural(data.unplaced, 'event')} ${data.unplaced === 1 ? 'has' : 'have'} no date yet, so cannot be placed in story order.`}</p>}
    </>
  );
}

function ThreadsBody({ widget, model, projectId }: BodyProps) {
  const base = `/project/${projectId}`;
  const settings = useMemo(() => settingsOf('threads', widget.config), [widget.config]);
  const data = useMemo(() => threadSummary(model, settings), [model, settings]);
  if (data.all === 0) return <Empty to={`${base}/plot`} label="Open Plot threads">No plot threads yet.</Empty>;
  return (
    <>
      <ul className="dash-counts" aria-label="Threads by status">
        {data.groups.map((g) => (
          <li key={g.status}>
            <span className={`thread-status st-${g.status}`}>{g.label}</span> {formatNumber(g.count)}
          </li>
        ))}
      </ul>
      {data.rows.length === 0 ? (
        <Empty>No thread has the status chosen ({settings.statuses.map((s) => STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s).join(', ')}).</Empty>
      ) : (
        <ol className="dash-list">
          {data.rows.map((row) => (
            <li key={row.id}>
              <span>
                <Link to={`${base}/plot?thread=${encodeURIComponent(row.id)}`}>{row.title}</Link> <span className={`thread-status st-${row.status}`}>{row.statusLabel}</span>
              </span>
              <span className="muted small">
                {plural(row.developments, 'development')}
                {row.latest ? `, the latest in ${row.latest.label}` : row.developments ? ', none placed in a chapter yet' : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Shown shown={data.rows.length} total={data.total} />
    </>
  );
}

function RecentBody({ widget, model, projectId }: BodyProps) {
  const settings = useMemo(() => settingsOf('recent', widget.config), [widget.config]);
  const data = useMemo(() => recentRecords(model, settings), [model, settings]);
  if (!data.rows.length) return <Empty>Nothing of the kinds chosen has been saved in this novel yet.</Empty>;
  return (
    <>
      <ol className="dash-list">
        {data.rows.map((row) => {
          const to = routeFor(projectId, model, row.ref);
          return (
            <li key={`${row.ref.type}:${row.ref.id}`}>
              <span>
                {to ? (
                  <Link to={to.to} state={to.state}>
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}{' '}
                <span className="badge">{row.kind}</span>
              </span>
              <span className="muted small">
                Changed <time dateTime={new Date(row.updatedAt).toISOString()}>{formatRelative(row.updatedAt)}</time>
              </span>
            </li>
          );
        })}
      </ol>
      <Shown shown={data.rows.length} total={data.total} />
    </>
  );
}

function WordsBody({ widget, model, projectId }: BodyProps) {
  const base = `/project/${projectId}`;
  const settings = useMemo(() => settingsOf('words', widget.config), [widget.config]);
  const data = useMemo(() => wordRows(model, settings), [model, settings]);
  const unit = settings.grain === 'scenes' ? 'bar' : 'chapter';
  if (data.missingPart) return <Note>The part this widget keeps to no longer exists. Choose another in its settings.</Note>;
  if (model.order.chapters.length === 0) return <Empty to={`${base}/manuscript`} label="Open the Manuscript">No chapters yet.</Empty>;
  const part = settings.partId ? model.nodes.get(settings.partId) : null;
  return (
    <>
      <p className="muted small">
        {plural(data.words, 'word')} in {settings.grain === 'scenes' ? plural(data.bars, 'chapter or scene', 'chapters and scenes') : plural(data.bars, 'chapter')}
        {part ? ` of “${part.title.trim() || 'Untitled'}”` : ''}
        {data.empty ? `, ${formatNumber(data.empty)} with no words yet` : ''}. {settings.sort === 'reading' ? 'In reading order.' : settings.sort === 'longest' ? 'Longest first.' : 'Shortest first, of those with words.'}
      </p>
      {data.rows.length === 0 ? (
        <Empty>{settings.sort === 'shortest' ? `No ${unit} has any words yet.` : 'Nothing to show here.'}</Empty>
      ) : (
        <ol className="dash-list dash-bars">
          {data.rows.map((row) => (
            <li key={row.nodeId}>
              <Link to={`${base}/manuscript/${row.nodeId}`}>{row.label}</Link>
              <span className="dash-bar-row">
                <span className="dash-bar" aria-hidden="true">
                  <span style={{ width: `${data.most ? (row.words / data.most) * 100 : 0}%` }} />
                </span>
                <span className="dash-num">{formatNumber(row.words)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <Shown shown={data.rows.length} total={data.total} />
    </>
  );
}

const STATE_SHORT: Record<CellState, string> = { appears: 'Appears', mentioned: 'Mentioned', other: 'Other records', none: 'Not recorded' };

function AppearancesBody({ widget, model, projectId }: BodyProps) {
  const base = `/project/${projectId}`;
  const settings = useMemo(() => settingsOf('appearances', widget.config), [widget.config]);
  const data = useMemo(() => appearanceSummary(model, settings), [model, settings]);
  const caveat = <p className="muted small">From your appearance records and the other records that tie a character to a chapter. A chapter with nothing recorded is not proof of absence.</p>;
  if (data.mode === 'one') {
    if (data.missing) return <Note>The character this widget follows no longer exists, or is no longer a character. Choose another in its settings.</Note>;
    if (!data.chapters) return <Empty to={`${base}/manuscript`} label="Open the Manuscript">No chapters yet.</Empty>;
    const by = (state: CellState) => data.columns.filter((c) => c.state === state).map((c) => c.short);
    const words = (['appears', 'mentioned', 'other'] as const).filter((s) => by(s).length).map((s) => `${STATE_SHORT[s]} in ${by(s).length === 1 ? 'chapter' : 'chapters'} ${by(s).join(', ')}`);
    return (
      <>
        <p>
          <Link to={`${base}/characters/${settings.characterId}`}>{data.name}</Link>: appears in {formatNumber(data.appears)} of {plural(data.chapters, 'chapter')}
          {data.mentioned ? `, mentioned in ${formatNumber(data.mentioned)} more` : ''}
          {data.other ? `, and other records tie them to ${formatNumber(data.other)}` : ''}.
        </p>
        <span className="dash-strip" role="img" aria-label={words.length ? `${data.name}: ${words.join('; ')}` : `${data.name}: nothing recorded in any chapter`} style={{ gridTemplateColumns: `repeat(${Math.max(1, data.columns.length)}, minmax(0, 1fr))` }}>
          {data.columns.map((c) => (
            <span key={c.nodeId} className={`cell-${c.state}`} title={`${c.label}: ${STATE_LABELS[c.state]}`} />
          ))}
        </span>
        <ul className="dash-key" aria-label="What the strip shows">
          {(['appears', 'mentioned', 'other', 'none'] as const).map((s) => (
            <li key={s}>
              <span className={`dash-swatch cell-${s}`} aria-hidden="true" /> {STATE_SHORT[s]}
            </li>
          ))}
        </ul>
        <p className="small">{words.length ? `${words.join('. ')}.` : 'Nothing is recorded for them in any chapter yet.'}</p>
        {caveat}
      </>
    );
  }
  if (!data.characters) return <Empty to={`${base}/characters`} label="Open Characters">No characters yet.</Empty>;
  if (!data.rows.length) return <Empty>No record ties a character to a chapter yet.</Empty>;
  return (
    <>
      <ol className="dash-list">
        {data.rows.map((row) => (
          <li key={row.characterId}>
            <Link to={`${base}/characters/${row.characterId}`}>{row.name}</Link>
            <span className="muted small">
              Appears in {formatNumber(row.appears)} of {plural(data.chapters, 'chapter')}
              {row.mentioned ? `, mentioned in ${formatNumber(row.mentioned)}` : ''}
              {row.other ? `, other records in ${formatNumber(row.other)}` : ''}
            </span>
          </li>
        ))}
      </ol>
      <Shown shown={data.rows.length} total={data.total} />
      {caveat}
    </>
  );
}

function WarningsBody({ widget, projectId }: Omit<BodyProps, 'model'>) {
  const base = `/project/${projectId}`;
  const settings = useMemo(() => settingsOf('warnings', widget.config), [widget.config]);
  const review = useReview(projectId);
  const data = useMemo(() => (review ? warningSummary(review.items, settings) : null), [review, settings]);
  if (review === null) return <p className="muted">This novel’s records could not be found.</p>;
  if (review === undefined || !data) return <p className="muted">Running the checks…</p>;
  return (
    <>
      {review.manuscript.state === 'checking' && <Note>The manuscript is still being checked; its warnings will follow.</Note>}
      {review.manuscript.state === 'failed' && <Note>The manuscript check could not run: {review.manuscript.error}. The other checks are shown.</Note>}
      <ul className="dash-counts" aria-label="Warnings to look at, by severity">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <span className={`thread-status sev-${s}`}>{SEVERITY_LABELS[s]}</span> {formatNumber(data.bySeverity[s])}
          </li>
        ))}
      </ul>
      {data.todo === 0 ? (
        <Empty to={`${base}/review`} label="Open the review">No warning is waiting for you: the checks raise nothing you have not decided on.</Empty>
      ) : data.rows.length === 0 ? (
        <Empty>None of the severity chosen.</Empty>
      ) : (
        <ol className="dash-list">
          {data.rows.map((item) => (
            <li key={item.key}>
              <span>
                <span className={`thread-status sev-${item.severity}`}>{SEVERITY_LABELS[item.severity]}</span> <Link to={`${base}/review?q=${encodeURIComponent(item.title)}`}>{item.title}</Link>
              </span>
              <span className="muted small">{item.message}</span>
            </li>
          ))}
        </ol>
      )}
      <Shown shown={data.rows.length} total={data.total} />
    </>
  );
}

/** The page address a saved view opens at, as its own bar would set it. */
function savedLink(projectId: string, model: StoryModel, saved: SavedView): string {
  const address = addressFor({ filter: openSaved(model, saved).filter, mode: saved.mode, layout: saved.layout }, saved.id);
  const query = new URLSearchParams(Object.entries(address).filter((e): e is [string, string] => e[1] !== null)).toString();
  return `/project/${projectId}/visualize/${encodeURIComponent(saved.view)}${query ? `?${query}` : ''}`;
}

function SavedBody({ widget, model, projectId }: BodyProps) {
  const settings = useMemo(() => settingsOf('saved', widget.config), [widget.config]);
  const list = useLiveQuery(() => savedViews.forProject(projectId).list(), [projectId]);
  const data = useMemo(() => (list ? savedRows(list, settings) : null), [list, settings]);
  const allowed = useLinkAllowed();
  if (!data) return <p className="muted">Reading your saved views…</p>;
  if (!data.all) return <Empty {...(allowed(`/project/${projectId}/visualize`) ? { to: `/project/${projectId}/visualize`, label: 'Open Visualize' } : {})}>No saved views yet. Save one from any view’s Saved views bar.</Empty>;
  if (!data.rows.length) return <Empty>No saved views of {viewLabel(settings.view ?? '')} yet.</Empty>;
  return (
    <>
      <ol className="dash-list">
        {data.rows.map((s) => {
          const missing = openSaved(model, s).missing.length;
          const to = savedLink(projectId, model, s);
          // A view turned off keeps its saved views; they open again once it is on.
          const on = allowed(to);
          return (
            <li key={s.id}>
              {on ? <Link to={to}>{s.name}</Link> : <span>{s.name}</span>}
              <span className="muted small">
                {viewLabel(s.view)}
                {on ? '' : ' · that view is turned off in this novel'}
                {missing ? ` · ${plural(missing, 'record')} it names no longer ${missing === 1 ? 'exists' : 'exist'}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <Shown shown={data.rows.length} total={data.total} />
    </>
  );
}

/** What a widget shows, for its kind. */
export function WidgetBody({ widget, model, projectId }: { widget: Widget; model: StoryModel | undefined; projectId: string }) {
  if (widget.kind === 'warnings') return <WarningsBody widget={widget} projectId={projectId} />;
  if (!model) return <p className="muted">Reading your records…</p>;
  const props = { widget, model, projectId };
  switch (widget.kind as WidgetKind) {
    case 'upcoming':
      return <UpcomingBody {...props} />;
    case 'threads':
      return <ThreadsBody {...props} />;
    case 'recent':
      return <RecentBody {...props} />;
    case 'words':
      return <WordsBody {...props} />;
    case 'appearances':
      return <AppearancesBody {...props} />;
    case 'saved':
      return <SavedBody {...props} />;
    default:
      return <p className="muted">This widget was made by a newer version of the app, so this version cannot show it. It is kept as it is; you can remove it.</p>;
  }
}

/** One widget failing to draw shows as that, and leaves the rest of the dashboard (and every record) as it is. */
export class WidgetBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error) return <p className="dash-note" role="alert">This widget could not be shown ({this.state.error}). Your records are not affected; try changing its settings, or remove it.</p>;
    return this.props.children;
  }
}

type Change = (settings: Record<string, unknown>) => void;

function Count({ value, onChange, label = 'How many to show' }: { value: number; onChange: (n: number) => void; label?: string }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="number" min={1} max={MAX_COUNT} value={value} onChange={(e) => e.target.value && onChange(Number(e.target.value))} />
    </label>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checks<T extends string>({ legend, all, chosen, labels, onChange, none }: { legend: string; all: readonly T[]; chosen: string[]; labels: Record<T, string>; onChange: (chosen: T[]) => void; none: string }) {
  return (
    <fieldset className="field dash-checks">
      <legend>{legend}</legend>
      {all.map((key) => (
        <label key={key} className="check">
          <input type="checkbox" checked={chosen.includes(key)} onChange={(e) => onChange(all.filter((k) => (k === key ? e.target.checked : chosen.includes(k))))} /> {labels[key]}
        </label>
      ))}
      <span className="muted small">{none}</span>
    </fieldset>
  );
}

/** A record chosen by id, kept in the list even once deleted, so the setting shows what is stored. */
const withMissing = (options: { value: string; label: string }[], id: string | null) => (id && !options.some((o) => o.value === id) ? [...options, { value: id, label: 'A record that no longer exists' }] : options);
const byName = <T,>(items: T[], name: (t: T) => string) => [...items].sort((a, b) => name(a).localeCompare(name(b)));

/** A widget's own settings. Each change is kept at once. */
export function WidgetSettings({ widget, model, onChange }: { widget: Widget; model: StoryModel | undefined; onChange: Change }) {
  if (!model && widget.kind !== 'warnings' && widget.kind !== 'saved') return <p className="muted">Reading your records…</p>;
  const characters = model ? byName([...model.entries.values()].filter((e) => e.category === 'character'), (e) => e.name).map((e) => ({ value: e.id, label: e.name })) : [];
  switch (widget.kind as WidgetKind) {
    case 'upcoming': {
      const s = settingsOf('upcoming', widget.config);
      const threads = byName([...model!.threads.values()], (t) => t.title).map((t) => ({ value: t.id, label: t.title || 'Untitled thread' }));
      return (
        <>
          <Choice label="Upcoming by" value={s.from} options={[{ value: 'reading', label: 'Reading order: told in chapters with no words yet' }, { value: 'story', label: 'Story order: after the latest event told so far' }]} onChange={(from) => onChange({ from })} />
          <Choice label="Plot thread" value={s.threadId ?? ''} options={withMissing([{ value: '', label: 'Any thread, or none' }, ...threads], s.threadId)} onChange={(v) => onChange({ threadId: v || null })} />
          <Choice label="Involving character" value={s.characterId ?? ''} options={withMissing([{ value: '', label: 'Anyone, or no one' }, ...characters], s.characterId)} onChange={(v) => onChange({ characterId: v || null })} />
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    case 'threads': {
      const s = settingsOf('threads', widget.config);
      return (
        <>
          <Checks legend="Statuses to list" all={STATUS_ORDER} chosen={s.statuses} labels={STATUS_LABELS} onChange={(statuses) => onChange({ statuses })} none="None ticked lists every thread." />
          <Choice label="Order" value={s.sort} options={[{ value: 'status', label: 'By status, in play first' }, { value: 'title', label: 'By title' }, { value: 'changed', label: 'Most recently changed first' }]} onChange={(sort) => onChange({ sort })} />
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    case 'recent': {
      const s = settingsOf('recent', widget.config);
      return (
        <>
          <Checks legend="Kinds of record" all={RECENT_TYPES} chosen={s.types} labels={RECENT_LABELS} onChange={(types) => onChange({ types: types.length ? types : null })} none="None ticked lists every kind." />
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    case 'words': {
      const s = settingsOf('words', widget.config);
      const parts = [...model!.nodes.values()].filter((n) => isGroup(n.kind)).sort((a, b) => (model!.order.position.get(a.id) ?? 0) - (model!.order.position.get(b.id) ?? 0)).map((n) => ({ value: n.id, label: `${KIND_LABELS[n.kind]}: ${n.title.trim() || 'Untitled'}` }));
      return (
        <>
          <Choice label="Bars for" value={s.grain} options={[{ value: 'chapters', label: 'Chapters (with their scenes)' }, { value: 'scenes', label: 'Scenes' }]} onChange={(grain) => onChange({ grain })} />
          <Choice label="Order" value={s.sort} options={[{ value: 'reading', label: 'Reading order' }, { value: 'longest', label: 'Longest first' }, { value: 'shortest', label: 'Shortest first (of those with words)' }]} onChange={(sort) => onChange({ sort })} />
          {parts.length > 0 || s.partId ? <Choice label="Keep to" value={s.partId ?? ''} options={withMissing([{ value: '', label: 'The whole book' }, ...parts], s.partId)} onChange={(v) => onChange({ partId: v || null })} /> : null}
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    case 'appearances': {
      const s = settingsOf('appearances', widget.config);
      return (
        <>
          <Choice label="Character" value={s.characterId ?? ''} options={withMissing([{ value: '', label: 'The ones who appear most' }, ...characters], s.characterId)} onChange={(v) => onChange({ characterId: v || null })} />
          {!s.characterId && <Count value={s.count} onChange={(count) => onChange({ count })} label="How many characters" />}
        </>
      );
    }
    case 'warnings': {
      const s = settingsOf('warnings', widget.config);
      return (
        <>
          <Checks legend="Severities to list" all={SEVERITIES} chosen={s.severities} labels={SEVERITY_LABELS} onChange={(severities) => onChange({ severities })} none="None ticked lists every severity." />
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    case 'saved': {
      const s = settingsOf('saved', widget.config);
      return (
        <>
          <Choice label="Saved views of" value={s.view ?? ''} options={[{ value: '', label: 'Every view' }, ...VIEWS.map((v) => ({ value: v.key, label: v.label }))]} onChange={(v) => onChange({ view: v || null })} />
          <Count value={s.count} onChange={(count) => onChange({ count })} />
        </>
      );
    }
    default:
      return null;
  }
}
