// ONE THREAD (Plan › Plot threads › a thread): what it is, who and where it involves, where it is meant to resolve, and
// its developments chapter by chapter. Nothing here ever changes a status on the author's behalf, or the manuscript.
// The pure parts of flutter_app/lib/features/plot/thread_page.dart: what is shown, the choices, and each press as a
// change (`(c: PlotChanges) => …`, run inside PlotService.change; typing through autosave under `threadSaveKey`).

import { localeCompare } from '../../collation';
import { type JsonMap, str } from '../../json';
import type { StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import type { StoryNode } from '../../records/storyNode';
import type { PlotThread } from '../../records/thread';
import { nodeLabel } from '../../timeline/narrative';
import { dartTrim } from '../../text/dartString';
import { type TreeItem, buildTree, flattenTree } from '../board';
import { type PlacedBeat, type ThreadReport, beatPlace, diagnose, threadStatusLabels } from '../diagnostics';
import { beatRoleKeys, beatRoleLabels, roleKey } from '../lanes';
import { type PlotChanges, categoryName, threadCategories, threadCategoryLabels, threadStatusKeys } from '../plotChanges';
import { boardPath, threadsPath } from '../plotService';
import { threadStatusName } from './threads';

export type Choice = { value: string; label: string };

/** A chapter or scene (or volume, act, arc) in a chooser, indented by its depth. */
const indent = (t: TreeItem) => `${'  '.repeat(t.depth)}${t.node.title.length === 0 ? 'Untitled' : t.node.title}`;

/** The marker of a beat whose chapter was removed, in the chooser (never saved). */
export const goneChoice = '\u0000gone';

export type BeatEditorView = {
  beatId: string;
  number: number;
  /** "development 2": what each control is called for a screen reader. */
  name: string;
  place: string;
  struck: boolean;
  node: { label: string; value: string; choices: Choice[] };
  role: { label: string; value: string; choices: Choice[] };
  /** For an intersection: the threads it crosses. Null for any other role. */
  crosses: { label: string; chosen: string[]; options: Choice[] } | null;
  title: { label: string; value: string };
  note: { label: string; hint: string; value: string };
  /** "Open Ch 1: The Gate", when its chapter or scene is still there. */
  open: { label: string; nodeId: string } | null;
  consequencesTip: string;
  removeTip: string;
};

export type ThreadPageView =
  | { missing: true; title: string; message: string; action: string; actionPath: string }
  | {
      missing: false;
      thread: PlotThread;
      report: ThreadReport;
      title: string;
      subtitle: string;
      back: { label: string; path: string };
      checks: { title: string; lines: string[] } | null;
      category: { label: string; value: string; choices: Choice[] };
      status: { label: string; value: string; choices: Choice[] };
      customStatus: { label: string; hint: string; value: string } | null;
      customCategory: { label: string; hint: string; value: string } | null;
      premise: { label: string; hint: string; value: string };
      characters: { label: string; chosen: string[]; options: Choice[] };
      locations: { label: string; chosen: string[]; options: Choice[] };
      target: { title: string; label: string; value: string; choices: Choice[]; note: { label: string; hint: string; value: string } };
      developments: { title: string; caption: string | null; beats: BeatEditorView[] };
      newBeat: { node: { label: string; choices: Choice[] }; role: { label: string; choices: Choice[] }; titleLabel: string; add: string };
      links: { lanes: string; board: { label: string; path: string } };
      notes: { label: string; hint: string; value: string };
      muted: { label: string; value: boolean };
      delete: string;
    };

/** The page for `threadId`, or why there is none. */
export function threadPage(model: StoryModel, threadId: string): ThreadPageView {
  const thread = model.threads.get(threadId);
  if (thread === undefined) {
    return {
      missing: true,
      title: 'This thread is not here',
      message: 'It may have been deleted. Plot threads lists every thread the novel has.',
      action: 'Open Plot threads',
      actionPath: threadsPath,
    };
  }
  const id = thread.id;
  const report = diagnose([thread], [...model.nodes.values()]).reports[0];
  const others = stableSorted(
    [...model.threads.values()].filter((t) => t.id !== id),
    (a, b) => localeCompare(a.title, b.title),
  );
  const tree = flattenTree(buildTree([...model.nodes.values()]));
  const documents = tree.filter((t) => t.node.kind === 'chapter' || t.node.kind === 'scene');
  const status = thread.statusKey;
  const characters = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const locations = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'location'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const documentChoices = documents.map((t) => ({ value: t.node.id, label: indent(t) }));
  return {
    missing: false,
    thread,
    report,
    title: thread.title.length === 0 ? 'Untitled thread' : thread.title,
    subtitle: `${threadStatusName(thread) ?? status} · ${categoryName(thread)}`,
    back: { label: 'Plot threads', path: threadsPath },
    checks: report.issues.length === 0 ? null : { title: 'Things to check', lines: report.issues.map((i) => `• ${i.message}`) },
    category: {
      label: 'Category',
      value: threadCategories.includes(thread.category) ? thread.category : 'subplot',
      choices: threadCategories.map((c) => ({ value: c, label: threadCategoryLabels[c] })),
    },
    status: {
      label: 'Status',
      value: threadStatusKeys.includes(status) ? status : 'planned',
      choices: threadStatusKeys.map((s) => ({ value: s, label: threadStatusLabels[s] })),
    },
    customStatus: status === 'custom' ? { label: 'Status name', hint: 'e.g. Dormant, Waiting on book two', value: thread.customStatus ?? '' } : null,
    customCategory:
      thread.category === 'custom' ? { label: 'Category name', hint: 'e.g. Prophecy, Heist, Rivalry', value: str(thread.raw['customCategory']) } : null,
    premise: { label: 'Objective or premise', hint: 'The question this thread raises, or the promise it makes to the reader.', value: thread.premise },
    characters: { label: 'Characters involved', chosen: thread.characterIds, options: characters.map((c) => ({ value: c.id, label: c.name })) },
    locations: { label: 'Key locations', chosen: thread.locationIds, options: locations.map((e) => ({ value: e.id, label: e.name })) },
    target: {
      title: 'Target resolution',
      label: 'Meant to resolve in',
      value: thread.targetNodeId !== null && model.nodes.has(thread.targetNodeId) ? thread.targetNodeId : '',
      choices: [{ value: '', label: 'Not decided' }, ...tree.map((t) => ({ value: t.node.id, label: indent(t) }))],
      note: { label: 'Or in your own words', hint: 'The midpoint · the end of book two · the final battle', value: str(thread.raw['targetNote']) },
    },
    developments: {
      title: 'Developments, in reading order',
      caption:
        report.beats.length === 0
          ? 'Record each step this thread takes and the chapter it happens in: a setup, a clue, a reversal, the payoff.'
          : null,
      beats: report.beats.map((placed, i) => beatEditor(model, placed, i + 1, documentChoices, others)),
    },
    newBeat: {
      node: { label: 'Chapter or scene', choices: [{ value: '', label: documents.length === 0 ? 'No chapters yet' : 'Not placed yet' }, ...documentChoices] },
      role: { label: 'Role', choices: beatRoleKeys.map((r) => ({ value: r, label: beatRoleLabels[r] })) },
      titleLabel: 'New development',
      add: 'Add development',
    },
    links: { lanes: 'See it in the plot lanes', board: { label: 'Its chapters and scenes on the scene board', path: boardPath(id) } },
    notes: { label: 'Notes', hint: 'Loose ends, alternatives, how it should pay off.', value: str(thread.raw['notes']) },
    muted: {
      label: `Don’t flag this thread${report.silenced > 0 ? ` (${report.silenced} held back)` : ''}`,
      value: thread.raw['muted'] === true,
    },
    delete: 'Delete thread…',
  };
}

function beatEditor(model: StoryModel, placed: PlacedBeat, number: number, documents: Choice[], others: PlotThread[]): BeatEditorView {
  const beat = placed.beat;
  const name = `development ${number}`;
  const role = roleKey(beat);
  return {
    beatId: beat.id,
    number,
    name,
    place: beatPlace(placed),
    struck: placed.missing,
    node: {
      label: `Chapter for ${name}`,
      value: placed.missing ? goneChoice : (beat.nodeId ?? ''),
      choices: [
        { value: '', label: 'Not placed yet' },
        ...(placed.missing ? [{ value: goneChoice, label: 'A chapter that was removed' }] : []),
        ...documents,
      ],
    },
    role: {
      label: `Role of ${name}`,
      value: beatRoleKeys.includes(role) ? role : 'development',
      choices: beatRoleKeys.map((r) => ({ value: r, label: beatRoleLabels[r] })),
    },
    crosses:
      role === 'intersection'
        ? {
            label: 'Crosses',
            chosen: beat.withThreadIds.filter((id) => model.threads.has(id)),
            options: others.map((t) => ({ value: t.id, label: t.title })),
          }
        : null,
    title: { label: `Title of ${name}`, value: beat.title },
    note: { label: `Note for ${name}`, hint: 'What changes for this thread here?', value: beat.note },
    open: placed.node === null ? null : { label: `Open ${nodeLabel(model, placed.node.id)}`, nodeId: placed.node.id },
    consequencesTip: `What depends on ${name}?`,
    removeTip: `Remove ${name}`,
  };
}

/** The new development's hint, by the role chosen. */
export const newBeatHint = (role: string): string => (role === 'appears' ? 'Optional: what it is doing here' : 'What happens? e.g. Symbol discovered');

/** Whether the new development can be added: a title, or only an appearance. */
export const canAddBeat = (title: string, role: string): boolean => dartTrim(title).length > 0 || role === 'appears';

/** The autosave key of a typed change on the thread page (`plot:<novel>:<this>`). */
export const threadSaveKey = (threadId: string, key: string): string => `${threadId}:${key}`;
export const beatSaveKey = (threadId: string, beatId: string, key: string): string => `${threadId}:${beatId}:${key}`;

/** The changes the thread page makes, each a function to run inside PlotService.change. */
export const threadChanges = {
  /** A field of the thread itself: `{title}`, `{status}`, `{characterIds}`… as updateThread takes them. */
  update: (threadId: string, fields: JsonMap) => (c: PlotChanges) => c.updateThread(threadId, () => fields),
  /** The target chooser: '' for not decided. */
  target: (threadId: string, value: string) => (c: PlotChanges) => c.updateThread(threadId, () => ({ targetNodeId: value.length === 0 ? null : value })),
  /** Add development: null when there is nothing to add (no title and not an appearance). */
  addBeat: (threadId: string, form: { title: string; nodeId: string; role: string }) =>
    canAddBeat(form.title, form.role)
      ? (c: PlotChanges) => c.addBeat(threadId, { title: form.title, nodeId: form.nodeId.length === 0 ? null : form.nodeId, role: form.role })
      : null,
  /** A beat's chapter chosen: '' for not placed; the removed chapter's marker changes nothing (null). */
  beatNode: (threadId: string, beatId: string, value: string) =>
    value === goneChoice ? null : (c: PlotChanges) => c.updateBeat(threadId, beatId, { nodeId: value.length === 0 ? null : value }),
  beat: (threadId: string, beatId: string, changes: JsonMap) => (c: PlotChanges) => c.updateBeat(threadId, beatId, changes),
  removeBeat: (threadId: string, beatId: string) => (c: PlotChanges) => c.removeBeat(threadId, beatId),
};

/** Asked before a thread is deleted. */
export function deleteThreadDialog(thread: PlotThread): { title: string; message: string; confirm: string; cancel: string; name: string } {
  const name = thread.title.length === 0 ? 'Untitled thread' : thread.title;
  const beats = thread.beats.length;
  return {
    name,
    title: `Delete ${name}?`,
    message: `It and its ${beats} ${beats === 1 ? 'development' : 'developments'} go. Chapters, scenes and entries are not changed; events stop belonging to it. You can undo this.`,
    confirm: 'Delete',
    cancel: 'Cancel',
  };
}

/** Said once a thread is deleted, with Undo. */
export const deletedMessage = (name: string): { message: string; action: string } => ({ message: `Deleted ${name}.`, action: 'Undo' });

/** The documents a beat can be placed in, for a chooser elsewhere (the board's menus). */
export function documentChoices(nodes: readonly StoryNode[]): Choice[] {
  return flattenTree(buildTree(nodes))
    .filter((t) => t.node.kind === 'chapter' || t.node.kind === 'scene')
    .map((t) => ({ value: t.node.id, label: indent(t) }));
}
