import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import type { Undecided } from '@/modules/model/query';
import { ThreadLanes, lanesLegend } from '@/modules/plot/components/ThreadLanes';
import { chaptersWords, endsOf, gapWords, threadLanes, type Lane, type Lanes } from '@/modules/plot/lanes';
import { BEAT_ROLE_LABELS, categoryName, roleOf, statusName } from '@/modules/plot/types';
import { nodeLabel } from '@/modules/timeline/narrative';
import { Legend } from '@/modules/viz/components/Legend';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { VizState } from '@/modules/viz/components/VizState';
import { markWords, mergeMarks, type Overlay } from '@/modules/canon/overlay';
import { MarkText } from './CanonMarks';

interface PlotViewProps {
  model: StoryModel;
  projectId: string;
  /** Canon and continuity markers, when they are on. */
  marks?: Overlay | null;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
  /** The page's filters: which threads they leave in, and what they could not decide. */
  keep: (id: string) => boolean;
  undecided: Undecided[];
  clear: () => void;
}

/**
 * THE PLOT BOARD
 * Each plot thread as a lane across the chapters, from what the author
 * records: where it is introduced, develops, crosses another thread and is
 * resolved, and the events that belong to it. Chapters in between with
 * nothing recorded are shown, and counted, as just that. Nothing is made up
 * to fill them.
 */
export function PlotView({ model, projectId, marks, mode, setMode, pick, selectedId, keep, undecided, clear }: PlotViewProps) {
  const [chosen, setChosen] = useState<{ key: string; lane: number; col: number } | null>(null);
  const base = `/project/${projectId}`;
  if (!model.threads.size) return <VizState status={{ kind: 'empty', message: 'No plot threads yet. Start one on the Plot threads page, and record where it is introduced, develops and is resolved.' }} />;
  const ids = [...model.threads.values()].sort((a, b) => a.title.localeCompare(b.title)).map((t) => t.id).filter(keep);
  if (!ids.length) return <VizState status={{ kind: 'no-results', onClearFilters: clear }} undecided={undecided} />;
  const lanes = threadLanes(model, ids);
  const key = ids.join(',');
  const cell = chosen?.key === key ? chosen : null;
  const eventName = (id: string) => model.events.get(id)?.name ?? 'an event';
  /** A cell's marks: its events' and its chapters' and scenes'. */
  const cellMark = (lane: Lane, col: number) => (marks ? mergeMarks(lane.cells[col].places.flatMap((p) => [marks.get(`node:${p.nodeId}`), ...p.eventIds.map((id) => marks.get(`event:${id}`))])) : null);

  /** What is recorded in a chapter of a lane, in words. */
  const words = (lane: Lane, col: number) => {
    const c = lane.cells[col];
    const where = (nodeId: string, chapterId: string) => (nodeId === chapterId ? '' : ` in “${model.nodes.get(nodeId)?.title ?? 'a scene'}”`);
    const parts = c.places.flatMap((p) => [...p.beats.map((b) => `${BEAT_ROLE_LABELS[roleOf(b)].toLowerCase()}${b.title.trim() ? ` “${b.title.trim()}”` : ''}${where(p.nodeId, p.chapterId)}`), ...p.eventIds.map((id) => `event “${eventName(id)}”${where(p.nodeId, p.chapterId)}`)]);
    const gap = lane.gaps.find((g) => col >= g.from && col <= g.to);
    const crossedBy = lanes.lanes.filter((o) => o.crossings.some((x) => x.column === col && x.otherId === lane.thread.id)).map((o) => o.thread.title);
    const what = parts.length ? parts.join('; ') : gap ? `nothing recorded (${chaptersWords(lanes, gap.from, gap.to)}: ${gap.chapters} ${gap.chapters === 1 ? 'chapter' : 'chapters'} with nothing recorded)` : 'nothing recorded';
    return `${lane.thread.title}, Ch ${lanes.chapters[col].number}: ${what}${crossedBy.length ? `; crossed by ${crossedBy.join(', ')}` : ''}${markWords(cellMark(lane, col)) ? `. ${markWords(cellMark(lane, col))}` : ''}`;
  };

  /** A chapter's record for a lane: each chapter or scene, with its beats and events, to open or select. */
  const places = (lane: Lane, col: number) => (
    <ul className="pl-places">
      {lane.cells[col].places.map((p) => (
        <li key={p.nodeId}>
          <Link to={`${base}/manuscript/${p.nodeId}`}>{nodeLabel(model, p.nodeId)}</Link>{' '}
          <button type="button" className="link small" onClick={() => pick({ type: 'node', id: p.nodeId })}>
            Show details
          </button>
          {marks && <MarkText mark={marks.get(`node:${p.nodeId}`)} />}
          <ul>
            {p.beats.map((b) => (
              <li key={b.id}>
                <span className="badge">{BEAT_ROLE_LABELS[roleOf(b)]}</span> {b.title.trim() || <span className="muted">No title</span>}
                {b.note.trim() && <span className="muted small"> · {b.note.trim()}</span>}
                {roleOf(b) === 'intersection' && (b.withThreadIds ?? []).some((id) => model.threads.has(id)) && <span className="small"> · crosses {(b.withThreadIds ?? []).flatMap((id) => model.threads.get(id)?.title ?? []).join(', ')}</span>}
              </li>
            ))}
            {p.eventIds.map((id) => (
              <li key={id}>
                <span className="badge">Event</span>{' '}
                <button type="button" className="link" onClick={() => pick({ type: 'event', id })}>
                  {eventName(id)}
                </button>
                {marks && <> <MarkText mark={marks.get(`event:${id}`)} /></>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

  /** A thread from start to end: each chapter with something recorded, and the gaps between, in reading order. */
  const sequence = (lane: Lane, all: Lanes) => {
    const ends = endsOf(lane, all);
    const items: { key: string; node: ReactNode }[] = [];
    lane.cells.forEach((c, col) => {
      if (c.places.length)
        items.push({
          key: `c${col}`,
          node: (
            <li key={`c${col}`}>
              <strong>Ch {all.chapters[col].number}</strong>
              {places(lane, col)}
            </li>
          ),
        });
      const gap = lane.gaps.find((g) => g.from === col);
      if (gap)
        items.push({
          key: `g${col}`,
          node: (
            <li key={`g${col}`} className="pl-gap-item muted">
              {gapWords(all, gap)}
            </li>
          ),
        });
    });
    return (
      <section key={lane.thread.id} className="stack pl-sequence" aria-label={`Thread: ${lane.thread.title}`}>
        <h3>
          <button type="button" className="link" aria-pressed={selectedId === lane.thread.id} onClick={() => pick({ type: 'thread', id: lane.thread.id })}>
            {lane.thread.title}
          </button>{' '}
          <span className={`thread-status st-${lane.thread.status}`}>{statusName(lane.thread)}</span> <span className="muted small">{categoryName(lane.thread)}</span>
        </h3>
        <p className="small">
          Introduced: {ends.introduced} · Resolved: {ends.resolved} · <Link to={`${base}/board?thread=${lane.thread.id}`}>Its chapters and scenes on the scene board →</Link>
        </p>
        {items.length ? <ol className="pl-steps">{items.map((i) => i.node)}</ol> : <p className="muted small">Nothing placed in a chapter yet.</p>}
        {lane.unplaced.length > 0 && <p className="muted small">Not placed in a chapter: {lane.unplaced.map((b) => `${BEAT_ROLE_LABELS[roleOf(b)].toLowerCase()}${b.title.trim() ? ` “${b.title.trim()}”` : ''}`).join('; ')}.</p>}
        {lane.untold.length > 0 && <p className="muted small">Its events told in no chapter: {lane.untold.map(eventName).join(', ')}.</p>}
      </section>
    );
  };

  const selectedLane = lanes.lanes.find((l) => l.thread.id === selectedId);
  return (
    <div className="stack plot-view">
      <div className="viz-toolbar">
        <ViewSwitch mode={mode} onChange={setMode} visualLabel="Lanes" />
      </div>
      <p className="muted small">What you record on the Plot threads page and the Timeline, chapter by chapter. A dashed stretch counts chapters with nothing recorded for that thread: a fact to look at, not a judgement, and nothing is filled in.</p>
      {lanes.chapters.length === 0 ? (
        <VizState status={{ kind: 'empty', message: 'No chapters yet, so there is nothing to lay the threads along. Add chapters in the Organizer.' }} />
      ) : mode === 'visual' ? (
        <VizState status={{ kind: 'ready' }} undecided={undecided}>
          <ThreadLanes lanes={lanes} selectedThreadId={selectedId} chosen={cell} onChoose={(lane, col) => setChosen({ key, lane, col })} onSelectThread={(id) => pick({ type: 'thread', id })} words={words} cellMark={marks ? cellMark : undefined} />
          <Legend title="What the lanes show" items={lanesLegend()} />
          <div className="kn-detail" aria-live="polite">
            {cell ? (
              <>
                <p>
                  <strong>{words(lanes.lanes[cell.lane], cell.col)}</strong>
                </p>
                {places(lanes.lanes[cell.lane], cell.col)}
              </>
            ) : (
              <p className="muted small">Choose a cell to see what is recorded there, or a thread’s name to select it.</p>
            )}
          </div>
          {selectedLane && sequence(selectedLane, lanes)}
        </VizState>
      ) : (
        <VizState status={{ kind: 'ready' }} undecided={undecided}>
          {lanes.lanes.map((lane) => sequence(lane, lanes))}
        </VizState>
      )}
    </div>
  );
}
