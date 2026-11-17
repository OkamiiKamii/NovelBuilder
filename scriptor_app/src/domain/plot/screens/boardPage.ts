// THE SCENE BOARD (Plan › Board): the chapters and scenes as cards, a column (or a lane) for each chapter and a card for
// each scene, grouped by the volumes, acts and arcs they sit in. Moving a card moves it in the manuscript (through the
// manuscript service's own move and status); each change can be undone while things are as the board left them
// (../board.ts BoardHistory). Moving is by drag and drop, or by the buttons on each card; it is off while the board is
// filtered. The pure parts of flutter_app/lib/features/plot/board_page.dart.

import { localeCompare } from '../../collation';
import { plural } from '../../desk/format';
import type { StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import { nodeStatuses } from '../../records/nodeStatus';
import type { NodeStatus, StoryNode } from '../../records/storyNode';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import {
  type BoardColumn,
  type BoardFilter,
  type BoardPart,
  type Place,
  boardOf,
  buildTree,
  bulkOf,
  filterBoard,
  isFiltered,
  kindName,
  moveError,
  pathLabel,
  pathTo,
  siblingsOf,
} from '../board';
import { type ThreadHere, placesOf, threadsByNode } from '../lanes';
import type { PlotChanges } from '../plotChanges';

/** A beat's role on a card's chip, in a word. */
export const roleWords: Readonly<Record<string, string>> = {
  introduction: 'introduced',
  development: 'develops',
  intersection: 'crosses',
  resolution: 'resolved',
  appears: 'appears',
};

/** A card's title: "Untitled" for none. */
export const cardTitle = (n: StoryNode): string => (n.title.length === 0 ? 'Untitled' : n.title);

/** Lanes (a row per chapter) by default on a narrow screen, columns on a wide one. */
export const lanesByDefault = (width: number): boolean => width < 700;

export type BoardFilters = { text: string; status: NodeStatus | null; threadId: string | null };
export const noBoardFilters: BoardFilters = { text: '', status: null, threadId: null };

export type BoardView = {
  title: string;
  subtitle: string;
  parts: BoardPart[];
  shown: BoardPart[];
  filtered: boolean;
  /** Moving cards on a partial board would put them where the author cannot see, so moving waits until the filter is
   * cleared. */
  movable: boolean;
  filteredNote: string | null;
  /** The volumes, acts and arcs have titles shown over their parts. */
  showTitles: boolean;
  /** The thread shown, and where it is recorded. */
  thread: { id: string; banner: string; lanes: string; edit: string } | null;
  statusChoices: { value: NodeStatus | null; label: string }[];
  threadChoices: { value: string; label: string }[] | null;
  empty: { title: string; message: string; action: string } | null;
  threadsHere: Map<string, ThreadHere[]>;
  all: StoryNode[];
  groups: StoryNode[];
  orderedChapters: StoryNode[];
};

export function boardView(model: StoryModel, filters: BoardFilters): BoardView {
  const all = [...model.nodes.values()];
  const parts = boardOf(all);
  const thread = filters.threadId === null ? null : (model.threads.get(filters.threadId) ?? null);
  const threadNodes = thread === null ? null : new Set(placesOf(thread, model).map((p) => p.nodeId));
  const filter: BoardFilter = { status: filters.status, text: filters.text, nodeIds: threadNodes };
  const shown = filterBoard(parts, filter);
  const filtered = isFiltered(filter);
  const chapters = all.filter((n) => n.kind === 'chapter').length;
  const scenes = all.filter((n) => n.kind === 'scene').length;
  const groups = all.filter((n) => n.kind === 'volume' || n.kind === 'act' || n.kind === 'arc');
  const words = buildTree(all).reduce((n, t) => n + t.totalWords, 0);
  const threads = stableSorted(model.threads.values(), (a, b) => localeCompare(a.title, b.title));
  return {
    title: 'Scene board',
    subtitle: `${plural(chapters, 'chapter')} · ${plural(scenes, 'scene')} · ${plural(words, 'word')}`,
    parts,
    shown,
    filtered,
    movable: !filtered,
    filteredNote: filtered ? 'Moving is off while the board is filtered, so nothing lands where you cannot see it.' : null,
    showTitles: groups.length > 0,
    thread:
      thread === null || threadNodes === null
        ? null
        : {
            id: thread.id,
            banner: `Showing where “${thread.title}” is recorded: ${plural(threadNodes.size, 'chapter or scene', 'chapters and scenes')}, from its developments and the events that belong to it.`,
            lanes: 'See it in the plot lanes',
            edit: 'Edit the thread',
          },
    statusChoices: [{ value: null, label: 'Every status' }, ...nodeStatuses.map((s) => ({ value: s.key as NodeStatus, label: s.label }))],
    threadChoices: threads.length === 0 ? null : [{ value: '', label: 'Every plot thread' }, ...threads.map((t) => ({ value: t.id, label: t.title }))],
    empty:
      chapters === 0 && groups.length === 0
        ? { title: 'No chapters yet', message: 'Each chapter becomes a column here, and each scene a card in it.', action: 'Add the first chapter' }
        : shown.length === 0
          ? { title: 'Nothing matches', message: 'Nothing on the board matches this filter.', action: 'Clear filter' }
          : null,
    threadsHere: threadsByNode(model),
    all,
    groups,
    orderedChapters: parts.flatMap((p) => p.columns.map((c) => c.chapter)),
  };
}

export const boardWords = {
  columns: 'Columns',
  lanes: 'Lanes',
  chapter: 'Chapter',
  search: 'Search cards',
  searchHint: 'Titles and summaries',
  status: 'Show status',
  thread: 'Show thread',
  clear: 'Clear filter',
  scene: 'Scene',
  noScenes: 'No scenes yet.',
  noMatchingScenes: 'No matching scenes.',
  dragTip: 'Drag to move',
  holdTip: 'Press and hold to move',
} as const;

/** A part's heading: the kind of what it sits in (in capitals) and its path; and what an empty one says. */
export function partHead(part: BoardPart, filtered: boolean): { kind: string | null; label: string; empty: string | null } {
  const last = part.path.length === 0 ? null : part.path[part.path.length - 1];
  return {
    kind: last === null ? null : dartToUpperCase(kindName(last)),
    label: part.path.length === 0 ? 'Not in a volume, act or arc' : pathLabel(part.path),
    empty: part.columns.length === 0 ? (filtered ? 'Nothing here matches.' : 'No chapters here yet.') : null,
  };
}

/** Where a chapter dropped at the end of a part lands, and what the drop zone says. */
export function partEnd(part: BoardPart): { place: Place; label: string } {
  const label = part.path.length === 0 ? 'Not in a volume, act or arc' : pathLabel(part.path);
  return {
    place: { parentId: part.parentId, beforeId: part.columns.length === 0 ? null : part.endBeforeId },
    label: `Drop here to move it to the end of ${part.path.length === 0 ? 'this run of chapters' : `“${label}”`}`,
  };
}

/** A chapter's head and the moves it offers. */
export function chapterCard(
  view: BoardView,
  column: BoardColumn,
): {
  name: string;
  meta: string;
  earlier: { tip: string; enabled: boolean };
  later: { tip: string; enabled: boolean };
  into: { tip: string; homes: { value: string | null; label: string }[] } | null;
  sceneEnd: { place: Place; label: string };
  addScene: string;
} {
  const all = view.all;
  const chapter = column.chapter;
  const siblings = siblingsOf(all, chapter.parentId);
  const at = siblings.findIndex((n) => n.id === chapter.id);
  const homes = [null, ...view.groups].filter((g) => (g?.id ?? null) !== chapter.parentId && moveError(all, chapter.id, g?.id ?? null) === null);
  const sceneCount = all.filter((n) => n.parentId === chapter.id && n.kind === 'scene').length;
  const name = cardTitle(chapter);
  return {
    name,
    meta: `${plural(column.words, 'word')} · ${plural(sceneCount, 'scene')}`,
    earlier: { tip: `Move ${name} earlier`, enabled: at > 0 },
    later: { tip: `Move ${name} later`, enabled: at !== siblings.length - 1 },
    into:
      view.groups.length > 0 && homes.length > 0
        ? {
            tip: `Move ${name} into`,
            homes: homes.map((g) => ({
              value: g?.id ?? null,
              label: g === null ? 'The top level' : `${g.kind === null ? 'Group' : kindName(g)}: ${pathLabel(pathTo(all, g.id))}`,
            })),
          }
        : null,
    sceneEnd: { place: { parentId: chapter.id, beforeId: null }, label: `Drop here to move it to the end of “${name}”` },
    addScene: `Add a scene to ${name}`,
  };
}

/** A scene's card and the moves it offers. */
export function sceneCard(
  view: BoardView,
  node: StoryNode,
  words: number,
): {
  name: string;
  meta: string;
  earlier: { tip: string; enabled: boolean };
  later: { tip: string; enabled: boolean };
  toChapter: { tip: string; chapters: { value: string; label: string }[] } | null;
} {
  const siblings = siblingsOf(view.all, node.parentId);
  const at = siblings.findIndex((n) => n.id === node.id);
  const name = cardTitle(node);
  const others = view.orderedChapters.filter((c) => c.id !== node.parentId);
  return {
    name,
    meta: plural(words, 'word'),
    earlier: { tip: `Move ${name} earlier`, enabled: at > 0 },
    later: { tip: `Move ${name} later`, enabled: at !== siblings.length - 1 },
    toChapter: others.length === 0 ? null : { tip: `Move ${name} to chapter`, chapters: others.map((c) => ({ value: c.id, label: cardTitle(c) })) },
  };
}

/** A card's title, plan and status controls. */
export function cardControls(node: StoryNode): { open: string; planTip: string; status: NodeStatus } {
  const name = cardTitle(node);
  return { open: `Open ${name}`, planTip: `Plan for ${name}`, status: node.status };
}

/** The plot threads recorded at a chapter or scene, as chips that open the thread, and a menu to add it to another.
 * Adding records only that the thread appears here: no development is made up. A chip can be taken off only when that
 * is all it records. Null when there are no threads at all. */
export function threadChips(
  view: BoardView,
  model: StoryModel,
  node: StoryNode,
): {
  chips: { threadId: string; label: string; tip: string; remove: { tip: string; change: (c: PlotChanges) => void } | null }[];
  add: { tip: string; label: string; threads: { value: string; label: string }[] } | null;
} | null {
  const here = view.threadsHere.get(node.id) ?? [];
  const addable = stableSorted(
    [...model.threads.values()].filter((t) => !here.some((h) => h.thread.id === t.id)),
    (a, b) => localeCompare(a.title, b.title),
  );
  if (here.length === 0 && addable.length === 0) return null;
  const name = cardTitle(node);
  return {
    chips: here.map((h) => ({
      threadId: h.thread.id,
      label: `${h.thread.title} · ${[...h.roles.map((r) => roleWords[r] ?? r), ...(h.events > 0 ? [plural(h.events, 'event')] : [])].join(', ')}`,
      tip: `Open ${h.thread.title}`,
      remove:
        h.plainIds.length > 0 && h.roles.length === 1 && h.events === 0
          ? {
              tip: `Take ${name} out of ${h.thread.title}`,
              change: (c: PlotChanges) => {
                for (const id of h.plainIds) c.removeBeat(h.thread.id, id);
              },
            }
          : null,
    })),
    add:
      addable.length === 0
        ? null
        : { tip: `Add ${name} to a plot thread`, label: 'Add to a thread', threads: addable.map((t) => ({ value: t.id, label: t.title })) },
  };
}

/** Adding a card to a thread: an appearance only. */
export const addToThread = (threadId: string, nodeId: string) => (c: PlotChanges) => c.addBeat(threadId, { nodeId, role: 'appears' });

/** Asked before a chapter is moved, with its scenes, into another volume, act or arc; null when no asking is needed. */
export function bulkDialog(
  nodes: readonly StoryNode[],
  node: StoryNode,
  drop: Place,
): { title: string; message: string; confirm: string; cancel: string } | null {
  const bulk = bulkOf(nodes, node.id, drop);
  if (bulk === null) return null;
  const where = drop.parentId === null ? 'to the top level' : `into “${nodes.find((n) => n.id === drop.parentId)?.title ?? ''}”`;
  return {
    title: 'Move a chapter with its scenes',
    message: `Move “${cardTitle(node)}” and its ${plural(bulk.scenes, 'scene')} (${plural(bulk.words, 'word')}) ${where}? Everything inside it goes with it, and you can undo this.`,
    confirm: 'Move them',
    cancel: 'Cancel',
  };
}

/** Said when an undo cannot be made. */
export const cannotUndo = (problem: string): string => `That cannot be undone: ${problem}`;
