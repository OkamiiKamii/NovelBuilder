import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { ViewLink } from '@/modules/visualize/ViewLink';
import { db, manuscript, plot } from '@/core';
import { placesOf, threadsByNode, type LaneInput } from '@/modules/plot/lanes';
import type { BeatRole } from '@/modules/plot/types';
import { storyOrder } from '@/modules/relationships/timeline';
import { useMe } from '@/modules/collab/identity';
import { can } from '@/modules/sync/access';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ConfirmDialog } from '@/shared/ConfirmDialog';
import { formatNumber } from '@/shared/format';
import { useMediaQuery } from '@/shared/useMediaQuery';
import { boardOf, bulkOf, changeWords, dropOf, filterBoard, isFiltered, NO_BOARD_FILTER, placeOf, undoProblem, type BoardChange, type BoardColumn, type BoardFilter, type BoardPart, type Place } from '../board';
import { StatusSelect } from '../components/NodeDetails';
import { useStory } from '../hooks';
import { isGroup, moveError, pathTo, siblingsOf } from '../tree';
import { KIND_LABELS, NODE_STATUSES, STATUS_LABELS, type NodeStatus, type StoryNode } from '../types';

/** A beat's role on a card's chip, in a word. */
const ROLE_WORDS: Record<BeatRole, string> = { introduction: 'introduced', development: 'develops', intersection: 'crosses', resolution: 'resolved', appears: 'appears' };

const plural = (n: number, word: string, many = `${word}s`) => `${formatNumber(n)} ${n === 1 ? word : many}`;
/** How many changes the board can take back, newest first. */
const UNDO_LIMIT = 20;

type Drag = { id: string; kind: 'chapter' | 'scene' };
type Hint = { id: string; side: 'before' | 'after' | 'end' };

/** A volume, act or arc in words, with what it sits in: "Volume One › Act II". */
const pathLabel = (path: StoryNode[]) => path.map((n) => n.title).join(' › ');

/**
 * THE SCENE BOARD
 * The chapters and scenes as cards beside the writing editor: a column (or
 * a lane) for each chapter, a card for each scene, grouped by the volumes,
 * acts and arcs they sit in. Cards are the manuscript's own chapters and
 * scenes, read live, so the editor, the Organizer and the board always show
 * the same book. Moving a card moves it through the manuscript's own
 * `move`; each change can be undone while things are as the board left them.
 * Moving is by drag and drop, or by the buttons on each card.
 */
/** Scenes above which the cards' "Move to…" menus are filled only when opened. */
const LAZY_MENUS_ABOVE = 150;

/**
 * A card's "Move to…" menu. On a large board its chapters are put in when it
 * takes focus or is pressed, before it opens, so the keyboard and the mouse
 * find them there; on a small board they are always there.
 */
function MoveToSelect({ label, lazy, options, onMove }: { label: string; lazy: boolean; options: { id: string; title: string }[]; onMove: (chapterId: string) => void }) {
  const [filled, setFilled] = useState(!lazy);
  const fill = () => !filled && flushSync(() => setFilled(true));
  return (
    <select aria-label={label} value="" onFocus={fill} onPointerDown={fill} onChange={(e) => e.target.value && onMove(e.target.value)}>
      <option value="">Move to…</option>
      {(filled || !lazy) &&
        options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
    </select>
  );
}

export function BoardPage() {
  const project = useCurrentProject();
  const ms = useMemo(() => manuscript.forProject(project.id), [project.id]);
  const { nodes, tree } = useStory(ms);
  const me = useMe(project.id);
  const writable = can(me.role, 'write');
  const narrow = useMediaQuery('(max-width: 700px)');
  const [params, setParams] = useSearchParams();
  const layout = params.get('layout') === 'lanes' || (params.get('layout') !== 'columns' && narrow) ? 'lanes' : 'columns';
  const [filter, setFilter] = useState<BoardFilter>(NO_BOARD_FILTER);
  const [history, setHistory] = useState<BoardChange[]>([]);
  const [said, setSaid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [asking, setAsking] = useState<{ node: StoryNode; to: Place; scenes: number; words: number } | null>(null);
  const all = useMemo(() => nodes ?? [], [nodes]);
  const parts = useMemo(() => boardOf(all), [all]);
  // Plot threads, and their events, for the thread filter and the chips on each card: read live, as the Plot threads page and the timeline keep them.
  const threads = useLiveQuery(() => plot.forProject(project.id).list(), [project.id]);
  const events = useLiveQuery(() => db.timelineEvents.where('projectId').equals(project.id).toArray(), [project.id]);
  const lanesInput = useMemo<LaneInput>(() => ({ nodes: new Map(all.map((n) => [n.id, n])), order: storyOrder(all), events: new Map((events ?? []).map((e) => [e.id, e])), threads: new Map((threads ?? []).map((t) => [t.id, t])) }), [all, events, threads]);
  const threadsHere = useMemo(() => threadsByNode(lanesInput), [lanesInput]);
  const threadId = params.get('thread');
  const thread = threadId ? lanesInput.threads.get(threadId) : undefined;
  const threadNodes = useMemo(() => (thread ? new Set(placesOf(thread, lanesInput).map((p) => p.nodeId)) : null), [thread, lanesInput]);
  const effective = useMemo(() => ({ ...filter, nodeIds: threadNodes }), [filter, threadNodes]);
  const shown = useMemo(() => filterBoard(parts, effective), [parts, effective]);
  const filtered = isFiltered(effective);
  const setThread = (id: string | null) => setParams((p) => { const next = new URLSearchParams(p); if (id) next.set('thread', id); else next.delete('thread'); return next; }, { replace: true });
  const clearFilters = () => {
    setFilter(NO_BOARD_FILTER);
    setThread(null);
  };
  // Moving cards on a partial board would put them where the author cannot see, so moving waits until the filter is cleared.
  const movable = writable && !filtered;
  const groups = all.filter((n) => isGroup(n.kind));
  const chapters = all.filter((n) => n.kind === 'chapter');
  const scenes = all.filter((n) => n.kind === 'scene');
  const totalWords = tree.reduce((n, t) => n + t.totalWords, 0);
  const editorHref = (id: string) => `/project/${project.id}/manuscript/${id}`;
  const chapterTitle = (id: string | null) => (id ? (all.find((n) => n.id === id)?.title ?? '') : '');
  const orderedChapters = parts.flatMap((p) => p.columns.map((c) => c.chapter));

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  const run = (task: () => Promise<unknown>) => task().then(() => setError(null), fail);
  const remember = (change: BoardChange) => {
    setHistory((h) => [...h, change].slice(-UNDO_LIMIT));
    setSaid(changeWords(change, all));
  };

  /** Moves a card, asking first when it would carry a chapter's scenes into another volume, act or arc. */
  const moveTo = (node: StoryNode, to: Place, confirmed = false) => {
    const drop = dropOf(all, node.id, to);
    if (!drop) return;
    const bulk = bulkOf(all, node.id, drop);
    if (bulk && !confirmed) {
      setAsking({ node, to: drop, ...bulk });
      return;
    }
    const from = placeOf(all, node.id)!;
    void run(async () => {
      await ms.move(node.id, drop.parentId, drop.beforeId);
      remember({ kind: 'move', nodeId: node.id, title: node.title, from, to: drop });
    });
  };
  /** One place earlier or later among the same siblings. */
  const nudge = (node: StoryNode, by: -1 | 1) => {
    const siblings = siblingsOf(all, node.parentId);
    const at = siblings.findIndex((n) => n.id === node.id);
    const before = by === -1 ? siblings[at - 1] : siblings[at + 2];
    if (by === -1 && !before) return;
    if (by === 1 && at === siblings.length - 1) return;
    moveTo(node, { parentId: node.parentId, beforeId: before?.id ?? null });
  };
  const setStatus = (node: StoryNode, status: NodeStatus) => {
    if (status === node.status) return;
    void run(async () => {
      await ms.update(node.id, { status });
      remember({ kind: 'status', nodeId: node.id, title: node.title, from: node.status, to: status });
    });
  };
  const undo = () => {
    const change = history.at(-1);
    if (!change) return;
    setHistory((h) => h.slice(0, -1));
    const problem = undoProblem(all, change);
    if (problem) {
      setError(`That cannot be undone: ${problem}`);
      return;
    }
    void run(async () => {
      if (change.kind === 'move') await ms.move(change.nodeId, change.from.parentId, change.from.beforeId);
      else await ms.update(change.nodeId, { status: change.from });
      setSaid(`Undone: ${changeWords(change, all)}`);
    });
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  // Ctrl+Z (or ⌘Z) undoes the board's last change, unless the author is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
      e.preventDefault();
      undoRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const add = (kind: 'chapter' | 'scene', parentId: string | null) => run(() => ms.create(kind, parentId));

  // ------------------------------------------------------------ drag and drop
  const endDrag = () => {
    setDrag(null);
    setHint(null);
  };
  const dragFrom = (node: StoryNode, kind: Drag['kind']) => ({
    draggable: movable,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', node.id);
      e.dataTransfer.effectAllowed = 'move';
      setDrag({ id: node.id, kind });
    },
    onDragEnd: endDrag,
  });
  /** A drop zone: shows where the card would land, and moves it there on drop. */
  const dropAt = (kind: Drag['kind'], key: Hint['id'], where: (e: DragEvent) => { place: Place; side: Hint['side'] }) => ({
    onDragOver: (e: DragEvent) => {
      if (!drag || drag.kind !== kind) return;
      e.stopPropagation();
      const { place, side } = where(e);
      if (!dropOf(all, drag.id, place)) {
        if (hint?.id === key) setHint(null);
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (hint?.id !== key || hint.side !== side) setHint({ id: key, side });
    },
    onDrop: (e: DragEvent) => {
      if (!drag || drag.kind !== kind) return;
      e.preventDefault();
      e.stopPropagation();
      const node = all.find((n) => n.id === drag.id);
      if (node) moveTo(node, where(e).place);
      endDrag();
    },
  });
  /** Before or after a card, by which half of it the pointer is over: across in columns of chapters, along in lanes. */
  const half = (e: DragEvent, across: boolean) => {
    const box = e.currentTarget.getBoundingClientRect();
    return across ? e.clientX - box.left < box.width / 2 : e.clientY - box.top < box.height / 2;
  };
  const after = (node: StoryNode) => {
    const siblings = siblingsOf(all, node.parentId);
    return siblings[siblings.findIndex((n) => n.id === node.id) + 1]?.id ?? null;
  };
  const hintClass = (id: string) => (hint?.id === id ? ` drop-${hint.side}` : '');

  /**
   * The plot threads recorded at a chapter or scene, as chips that open the
   * thread, and a menu to add it to another. Adding records only that the
   * thread appears here: no development is made up. A chip can be taken off
   * only when that is all it records.
   */
  const threadChips = (node: StoryNode) => {
    const here = threadsHere.get(node.id) ?? [];
    const addable = (threads ?? []).filter((t) => !here.some((h) => h.thread.id === t.id)).sort((a, b) => a.title.localeCompare(b.title));
    if (!here.length && (!writable || !addable.length)) return null;
    const api = plot.forProject(project.id);
    return (
      <div className="board-threads">
        {here.length > 0 && (
          <ul aria-label={`Plot threads in ${node.title}`}>
            {here.map((h) => (
              <li key={h.thread.id} className={`board-thread st-${h.thread.status}`}>
                <Link to={`/project/${project.id}/plot?thread=${h.thread.id}`} draggable={false}>
                  {h.thread.title}
                </Link>
                <span className="muted"> · {[...h.roles.map((r) => ROLE_WORDS[r]), ...(h.events ? [plural(h.events, 'event')] : [])].join(', ')}</span>
                {writable && h.plainIds.length > 0 && h.roles.length === 1 && h.events === 0 && (
                  <button type="button" aria-label={`Take ${node.title} out of ${h.thread.title}`} onClick={() => void run(async () => { for (const id of h.plainIds) await api.removeBeat(h.thread.id, id); })}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {writable && addable.length > 0 && (
          <select aria-label={`Add ${node.title} to a plot thread`} value="" onChange={(e) => e.target.value && void run(() => api.addBeat(e.target.value, { nodeId: node.id, role: 'appears' }))}>
            <option value="">Add to a thread…</option>
            {addable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  const scenesMoveOptions = orderedChapters;
  // On a large board, each card's "Move to…" menu is filled when it is opened: hundreds of cards with a hundred chapters each are a great many options to draw at once.
  const lazyMenus = all.filter((n) => n.kind === 'scene').length > LAZY_MENUS_ABOVE;
  const chapterHomes = (chapter: StoryNode) => [null, ...groups].filter((g) => moveError(all, chapter.id, g?.id ?? null) === null);

  const sceneCard = (column: BoardColumn, index: number) => {
    const { node, words } = column.scenes[index];
    const siblings = siblingsOf(all, node.parentId);
    const at = siblings.findIndex((n) => n.id === node.id);
    return (
      <li key={node.id} className={`board-card status-${node.status}${drag?.id === node.id ? ' dragging' : ''}${hintClass(node.id)}`} aria-label={`Scene: ${node.title}`} {...dragFrom(node, 'scene')} {...dropAt('scene', node.id, (e) => (half(e, layout === 'lanes') ? { place: { parentId: column.chapter.id, beforeId: node.id }, side: 'before' } : { place: { parentId: column.chapter.id, beforeId: after(node) }, side: 'after' }))}>
        <div className="board-card-head">
          {movable && (
            <span className="grip" aria-hidden="true" title="Drag to move">
              ⠿
            </span>
          )}
          <Link to={editorHref(node.id)} className="board-card-title" draggable={false}>
            {node.title}
          </Link>
        </div>
        {node.summary && <p className="board-card-summary small muted">{node.summary}</p>}
        <div className="board-card-meta">
          {writable ? <StatusSelect node={node} compact onChange={(c) => c.status && setStatus(node, c.status)} /> : <span className={`chip status-${node.status}`}>{STATUS_LABELS[node.status]}</span>}
          <span className="small muted">{plural(words, 'word')}</span>
        </div>
        {threadChips(node)}
        {movable && (
          <div className="board-moves">
            <button type="button" className="btn ghost icon" aria-label={`Move ${node.title} earlier`} disabled={at <= 0} onClick={() => nudge(node, -1)}>
              {layout === 'lanes' ? '←' : '↑'}
            </button>
            <button type="button" className="btn ghost icon" aria-label={`Move ${node.title} later`} disabled={at === siblings.length - 1} onClick={() => nudge(node, 1)}>
              {layout === 'lanes' ? '→' : '↓'}
            </button>
            <MoveToSelect label={`Move ${node.title} to chapter`} lazy={lazyMenus} options={scenesMoveOptions.filter((c) => c.id !== node.parentId)} onMove={(parentId) => moveTo(node, { parentId, beforeId: null })} />
          </div>
        )}
      </li>
    );
  };

  const chapterColumn = (column: BoardColumn) => {
    const { chapter, words } = column;
    const siblings = siblingsOf(all, chapter.parentId);
    const at = siblings.findIndex((n) => n.id === chapter.id);
    const homes = chapterHomes(chapter);
    return (
      <section
        key={chapter.id}
        className={`board-col${drag?.id === chapter.id ? ' dragging' : ''}${hintClass(chapter.id)}${drag?.kind === 'scene' && hint?.id === `end:${chapter.id}` ? ' drop-end' : ''}`}
        aria-label={`Chapter: ${chapter.title}`}
        {...(drag?.kind === 'scene'
          ? dropAt('scene', `end:${chapter.id}`, () => ({ place: { parentId: chapter.id, beforeId: null }, side: 'end' }))
          : dropAt('chapter', chapter.id, (e) => (half(e, layout === 'columns') ? { place: { parentId: chapter.parentId, beforeId: chapter.id }, side: 'before' } : { place: { parentId: chapter.parentId, beforeId: after(chapter) }, side: 'after' })))}
      >
        <header className={`board-col-head status-${chapter.status}`} {...dragFrom(chapter, 'chapter')}>
          <div className="board-card-head">
            {movable && (
              <span className="grip" aria-hidden="true" title="Drag to move">
                ⠿
              </span>
            )}
            <Link to={editorHref(chapter.id)} className="board-col-title" draggable={false}>
              {chapter.title}
            </Link>
          </div>
          {chapter.summary && <p className="board-card-summary small muted">{chapter.summary}</p>}
          <div className="board-card-meta">
            {writable ? <StatusSelect node={chapter} compact onChange={(c) => c.status && setStatus(chapter, c.status)} /> : <span className={`chip status-${chapter.status}`}>{STATUS_LABELS[chapter.status]}</span>}
            <span className="small muted">
              {plural(words, 'word')} · {plural(all.filter((n) => n.parentId === chapter.id && n.kind === 'scene').length, 'scene')}
            </span>
          </div>
          {threadChips(chapter)}
          {movable && (
            <div className="board-moves">
              <button type="button" className="btn ghost icon" aria-label={`Move ${chapter.title} earlier`} disabled={at <= 0} onClick={() => nudge(chapter, -1)}>
                {layout === 'lanes' ? '↑' : '←'}
              </button>
              <button type="button" className="btn ghost icon" aria-label={`Move ${chapter.title} later`} disabled={at === siblings.length - 1} onClick={() => nudge(chapter, 1)}>
                {layout === 'lanes' ? '↓' : '→'}
              </button>
              {groups.length > 0 && (
                <select aria-label={`Move ${chapter.title} into`} value="" onChange={(e) => e.target.value && moveTo(chapter, { parentId: e.target.value === 'top' ? null : e.target.value, beforeId: null })}>
                  <option value="">Move into…</option>
                  {homes.filter((g) => (g?.id ?? null) !== chapter.parentId).map((g) => (
                    <option key={g?.id ?? 'top'} value={g?.id ?? 'top'}>
                      {g ? `${KIND_LABELS[g.kind]}: ${pathLabel(pathTo(all, g.id))}` : 'The top level'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </header>
        {column.scenes.length > 0 ? (
          <ol className="board-cards" aria-label={`Scenes in ${chapter.title}`}>
            {column.scenes.map((_, i) => sceneCard(column, i))}
          </ol>
        ) : (
          <p className="muted small board-none">{filtered ? 'No matching scenes.' : 'No scenes yet.'}</p>
        )}
        {drag?.kind === 'scene' && <p className="board-drop-zone small">Drop here to move it to the end of “{chapter.title}”</p>}
        {writable && !filtered && (
          <button type="button" className="btn ghost board-add" aria-label={`Add a scene to ${chapter.title}`} onClick={() => void add('scene', chapter.id)}>
            + Scene
          </button>
        )}
      </section>
    );
  };

  const partView = (part: BoardPart) => {
    const label = part.path.length ? pathLabel(part.path) : 'Not in a volume, act or arc';
    const endKey = `part:${part.key}`;
    return (
      <section key={part.key} className="board-part" aria-label={groups.length ? label : 'Chapters'}>
        {groups.length > 0 && (
          <h2 className="board-part-title">
            {part.path.length > 0 && <span className="kind">{KIND_LABELS[part.path.at(-1)!.kind]}</span>} {label}
          </h2>
        )}
        <div className={`board-cols ${layout}`}>
          {part.columns.map(chapterColumn)}
          {part.columns.length === 0 && <p className="muted small board-none">{filtered ? 'Nothing here matches.' : 'No chapters here yet.'}</p>}
          {drag?.kind === 'chapter' && (
            <p className={`board-drop-zone small${hint?.id === endKey ? ' drop-end' : ''}`} {...dropAt('chapter', endKey, () => ({ place: { parentId: part.parentId, beforeId: part.columns.length ? part.endBeforeId : null }, side: 'end' }))}>
              Drop here to move it to the end of {part.path.length ? `“${label}”` : 'this run of chapters'}
            </p>
          )}
        </div>
      </section>
    );
  };

  const last = history.at(-1);
  return (
    <div className="stack scene-board">
      <header className="page-header">
        <div>
          <h1>Scene board</h1>
          <p className="muted" role="status">
            {plural(chapters.length, 'chapter')} · {plural(scenes.length, 'scene')} · {plural(totalWords, 'word')}
          </p>
        </div>
        <div className="actions wrap">
          <div className="segmented" role="group" aria-label="Lay out as">
            {(['columns', 'lanes'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={layout === l} className={layout === l ? 'active' : ''} onClick={() => setParams((p) => ({ ...Object.fromEntries(p), layout: l }), { replace: true })}>
                {l === 'columns' ? 'Columns' : 'Lanes'}
              </button>
            ))}
          </div>
          <Link to={`/project/${project.id}/organizer`} className="btn ghost">
            Organizer
          </Link>
          {writable && (
            <button type="button" className="btn primary" onClick={() => void add('chapter', null)}>
              + Chapter
            </button>
          )}
        </div>
      </header>
      <p className="muted small">The chapters and scenes of your manuscript as cards. Moving a card here moves it in the manuscript and the Organizer too; open a card to write it.</p>

      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {thread && threadNodes && (
        <p className="notice board-thread-note" role="status">
          Showing where “{thread.title}” is recorded: {plural(threadNodes.size, 'chapter or scene', 'chapters and scenes')}, from its beats and the events that belong to it.{' '}
          <ViewLink to={`/project/${project.id}/visualize/plot?select=thread:${thread.id}`}>See it in the plot lanes →</ViewLink> <Link to={`/project/${project.id}/plot?thread=${thread.id}`}>Edit the thread →</Link>
        </p>
      )}
      <div className="board-undo" aria-live="polite">
        {said && <span className="small">{said}</span>}
        {last && (
          <button type="button" className="btn" onClick={undo} title="Ctrl+Z">
            Undo {last.kind === 'move' ? 'move' : 'status'} of “{last.title}”
          </button>
        )}
      </div>

      {all.length > 0 && (
        <div className="board-filters" role="search" aria-label="Filter the board">
          <input type="search" aria-label="Search cards" placeholder="Search titles and summaries" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          <select aria-label="Show status" value={filter.status ?? ''} onChange={(e) => setFilter({ ...filter, status: (e.target.value || null) as NodeStatus | null })}>
            <option value="">Every status</option>
            {NODE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {(threads ?? []).length > 0 && (
            <select aria-label="Show thread" value={thread?.id ?? ''} onChange={(e) => setThread(e.target.value || null)}>
              <option value="">Every plot thread</option>
              {[...(threads ?? [])].sort((a, b) => a.title.localeCompare(b.title)).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          {filtered && (
            <>
              <span className="muted small">Moving is off while the board is filtered, so nothing lands where you cannot see it.</span>
              <button type="button" className="btn ghost" onClick={clearFilters}>
                Clear filter
              </button>
            </>
          )}
        </div>
      )}

      {nodes === undefined ? null : chapters.length === 0 && groups.length === 0 ? (
        <div className="empty">
          <h2>No chapters yet</h2>
          <p className="muted">Each chapter becomes a column here, and each scene a card in it.</p>
          {writable && (
            <button type="button" className="btn primary" onClick={() => void add('chapter', null)}>
              Add the first chapter
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <p className="muted">Nothing on the board matches this filter.</p>
          <button type="button" className="btn" onClick={clearFilters}>
            Clear filter
          </button>
        </div>
      ) : (
        <div className={`board-parts ${layout}`}>{shown.map(partView)}</div>
      )}

      {asking && (
        <ConfirmDialog
          title="Move a chapter with its scenes"
          confirmLabel="Move them"
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const { node, to } = asking;
            setAsking(null);
            moveTo(node, to, true);
          }}
        >
          <p>
            Move <strong>{asking.node.title}</strong> and its {plural(asking.scenes, 'scene')} ({plural(asking.words, 'word')}) {asking.to.parentId ? `into “${chapterTitle(asking.to.parentId)}”` : 'to the top level'}? Everything inside it goes with it, and you can undo this.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
