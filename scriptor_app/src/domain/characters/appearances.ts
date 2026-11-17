// WHO APPEARS WHERE (as in the original app). A port of flutter_app/lib/shared/domain/characters/appearances.dart.
//
// Characters against chapters (or scenes), from what is recorded and from nothing else: no text is searched for names.
// The author's appearance records say a character appears on the page, or is only mentioned; the other records that
// tie a character to a chapter (a link in the text, the plan's "Entities involved", an event they take part in that the
// chapter tells) are shown for what they are, and are not taken as an appearance. A chapter with no record for a
// character is "not recorded", never "absent".

import { localeCompare } from '../collation';
import { type StoryModel } from '../model/storyModel';
import { stableSorted } from '../reader/stableSort';
import { type NodeStatus, type StoryNode } from '../records/storyNode';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { placesOf } from './threadPlaces';

/** What a record says ties a character to a chapter or scene. */
export type Evidence = 'appears' | 'mentioned' | 'linked' | 'involved' | 'event';
export const evidences: readonly Evidence[] = ['appears', 'mentioned', 'linked', 'involved', 'event'];
export const evidenceLabel: Readonly<Record<Evidence, string>> = {
  appears: 'Appears (your appearance record)',
  mentioned: 'Mentioned, not on the page (your appearance record)',
  linked: 'Linked in the text',
  involved: 'Listed under “Entities involved” in the plan',
  event: 'Takes part in an event told here',
};

/** A cell as drawn: the author's appearance record, if any; else whether anything else is recorded; else nothing. */
export type CellState = 'appears' | 'mentioned' | 'other' | 'none';
export const cellStates: readonly CellState[] = ['appears', 'mentioned', 'other', 'none'];
export const cellStateLabel: Readonly<Record<CellState, string>> = {
  appears: 'Appears',
  mentioned: 'Mentioned',
  other: 'Other records',
  none: 'Not recorded',
};

export class CellEvidence {
  constructor(
    readonly kind: Evidence,
    /** The chapter or scene the record is on. */
    readonly nodeId: string,
    /** For `event`: which event. */
    readonly eventId: string | null = null,
  ) {}
}

export class MatrixCell {
  constructor(
    readonly state: CellState,
    readonly evidence: readonly CellEvidence[],
  ) {}
}

export class MatrixColumn {
  readonly nodeId: string;
  readonly chapterId: string;
  readonly chapterNumber: number;
  /** "Ch 3: The Seal", "Ch 3, scene: The vault". */
  readonly label: string;
  /** "3", or "3.2" for a chapter's second scene. */
  readonly short: string;
  readonly status: NodeStatus;

  constructor(args: {
    nodeId: string;
    chapterId: string;
    chapterNumber: number;
    label: string;
    short: string;
    status: NodeStatus;
  }) {
    this.nodeId = args.nodeId;
    this.chapterId = args.chapterId;
    this.chapterNumber = args.chapterNumber;
    this.label = args.label;
    this.short = args.short;
    this.status = args.status;
  }
}

export class MatrixRow {
  constructor(
    readonly characterId: string,
    readonly name: string,
    readonly cells: readonly MatrixCell[],
  ) {}

  /** Cells with anything recorded. */
  get recorded(): number {
    return this.cells.filter((c) => c.state !== 'none').length;
  }
}

export type Grain = 'chapters' | 'scenes';

export type MatrixFilter = {
  grain?: Grain;
  /** Only these characters. */
  characterIds?: readonly string[];
  /** Words in the character's name. */
  text?: string;
  /** A range of chapters, by node id, both included; either end may be open. */
  from?: string | null;
  to?: string | null;
  /** Only chapters and scenes this place is recorded at. */
  placeId?: string | null;
  /** Only chapters and scenes where this plot thread is recorded (its beats, and the events that belong to it). */
  threadId?: string | null;
  /** Only chapters and scenes with this status. */
  status?: NodeStatus | null;
  /** Show characters with nothing recorded in the columns shown, too. */
  all?: boolean;
};

export class AppearanceMatrix {
  constructor(
    readonly columns: readonly MatrixColumn[],
    readonly rows: readonly MatrixRow[],
    /** Characters left out because nothing is recorded for them in the columns shown. */
    readonly hidden: number,
    readonly characters: number,
  ) {}
}

/** Every record tying a character to one chapter or scene, by character. */
function recordsAt(node: StoryNode, model: StoryModel): Map<string, CellEvidence[]> {
  const out = new Map<string, CellEvidence[]>();
  const add = (id: string, item: CellEvidence) => {
    if (model.entries.get(id)?.category !== 'character') return;
    let list = out.get(id);
    if (list === undefined) out.set(id, (list = []));
    list.push(item);
  };
  const plan = model.plans.get(node.id);
  for (const id of plan?.appearIds ?? []) add(id, new CellEvidence('appears', node.id));
  for (const id of plan?.mentionIds ?? []) add(id, new CellEvidence('mentioned', node.id));
  for (const id of node.mentions) add(id, new CellEvidence('linked', node.id));
  for (const id of plan?.entityIds ?? []) add(id, new CellEvidence('involved', node.id));
  for (const event of model.events.values()) {
    if (!event.nodeIds.includes(node.id)) continue;
    for (const c of event.characters) add(c.id, new CellEvidence('event', node.id, event.id));
  }
  return out;
}

/** Whether a place is recorded at a chapter or scene: in its plan, linked in its text, or as where an event it tells
 * happens. */
function placeAt(node: StoryNode, placeId: string, model: StoryModel): boolean {
  return (
    (model.plans.get(node.id)?.entityIds.includes(placeId) ?? false) ||
    node.mentions.includes(placeId) ||
    [...model.events.values()].some((e) => e.locationId === placeId && e.nodeIds.includes(node.id))
  );
}

/** The cell's state: the author's appearance record first; any other record is "other"; nothing at all is "not
 * recorded". */
export function stateOf(evidence: readonly CellEvidence[]): CellState {
  if (evidence.some((e) => e.kind === 'appears')) return 'appears';
  if (evidence.some((e) => e.kind === 'mentioned')) return 'mentioned';
  return evidence.length === 0 ? 'none' : 'other';
}

/** The matrix. Columns are chapters in reading order (or, by scene, each scene, and a chapter with no scenes as
 * itself; a chapter's own column beside its scenes when anything is recorded on the chapter itself). A chapter's cell
 * gathers the records on it and on its scenes. As the original app's `appearanceMatrix`. */
export function appearanceMatrix(model: StoryModel, filter: MatrixFilter = {}): AppearanceMatrix {
  const grain = filter.grain ?? 'chapters';
  const characterIds = filter.characterIds ?? [];
  const chapters = model.order.chapters;
  const index = (id: string | null | undefined) =>
    id === null || id === undefined
      ? -1
      : chapters.findIndex((c) => c.id === id || model.nodes.get(id)?.parentId === c.id);
  const lo = filter.from != null ? index(filter.from) : 0;
  const hi = filter.to != null ? index(filter.to) : chapters.length - 1;
  const scenesOf = (chapter: StoryNode) =>
    stableSorted(
      [...model.nodes.values()].filter((n) => n.parentId === chapter.id && n.kind === 'scene'),
      (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
    );
  const thread = filter.threadId == null ? null : (model.threads.get(filter.threadId) ?? null);
  const threadNodes = thread === null ? null : new Set(placesOf(thread, model).map((p) => p.nodeId));
  const records = new Map<string, Map<string, CellEvidence[]>>();
  const at = (node: StoryNode) => {
    let found = records.get(node.id);
    if (found === undefined) records.set(node.id, (found = recordsAt(node, model)));
    return found;
  };

  const candidates: { column: MatrixColumn; nodes: StoryNode[] }[] = [];
  chapters.forEach((chapter, i) => {
    if (i < (lo < 0 ? 0 : lo) || i > (hi < 0 ? chapters.length - 1 : hi)) return;
    const number = i + 1;
    const scenes = scenesOf(chapter);
    const title = (n: StoryNode) =>
      dartTrim(n.title).length > 0 ? dartTrim(n.title) : n.kind === 'scene' ? 'Untitled scene' : 'Untitled chapter';
    const column = (node: StoryNode, short: string, label: string) =>
      new MatrixColumn({ nodeId: node.id, chapterId: chapter.id, chapterNumber: number, label, short, status: node.status });
    if (grain === 'chapters' || scenes.length === 0) {
      candidates.push({ column: column(chapter, `${number}`, `Ch ${number}: ${title(chapter)}`), nodes: [chapter, ...scenes] });
      return;
    }
    if (at(chapter).size > 0 || chapter.wordCount > 0) {
      candidates.push({
        column: column(chapter, `${number}`, `Ch ${number}: ${title(chapter)} (the chapter itself)`),
        nodes: [chapter],
      });
    }
    scenes.forEach((scene, k) => {
      candidates.push({ column: column(scene, `${number}.${k + 1}`, `Ch ${number}, scene: ${title(scene)}`), nodes: [scene] });
    });
  });
  const columns = candidates.filter(
    (c) =>
      (filter.status == null || c.column.status === filter.status) &&
      (threadNodes === null || c.nodes.some((n) => threadNodes.has(n.id))) &&
      (filter.placeId == null || c.nodes.some((n) => placeAt(n, filter.placeId!, model))),
  );

  const text = dartToLowerCase(dartTrim(filter.text ?? ''));
  const people = stableSorted(
    [...model.entries.values()].filter(
      (e) =>
        e.category === 'character' &&
        (characterIds.length === 0 || characterIds.includes(e.id)) &&
        (text.length === 0 || dartToLowerCase(e.name).includes(text)),
    ),
    (a, b) => localeCompare(a.name, b.name),
  );
  const all = people.map(
    (person) =>
      new MatrixRow(
        person.id,
        person.name,
        columns.map((c) => {
          const evidence = c.nodes.flatMap((n) => at(n).get(person.id) ?? []);
          return new MatrixCell(stateOf(evidence), evidence);
        }),
      ),
  );
  const rows = filter.all === true ? all : all.filter((r) => r.recorded > 0);
  return new AppearanceMatrix(
    columns.map((c) => c.column),
    rows,
    all.length - rows.length,
    people.length,
  );
}

/** A cell's records in words, each saying where it is. */
export function evidenceWords(evidence: readonly CellEvidence[], model: StoryModel, columnNodeId: string): string[] {
  return evidence.map((e) => {
    const where = e.nodeId === columnNodeId ? '' : ` (in “${model.nodes.get(e.nodeId)?.title ?? 'a scene'}”)`;
    return e.kind === 'event'
      ? `Takes part in “${(e.eventId === null ? undefined : model.events.get(e.eventId))?.name ?? 'an event'}”, told here${where}`
      : `${evidenceLabel[e.kind]}${where}`;
  });
}
