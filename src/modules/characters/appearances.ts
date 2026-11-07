import { isDocument } from '@/modules/manuscript/tree';
import type { NodeStatus, StoryNode } from '@/modules/manuscript/types';
import type { StoryModel } from '@/modules/model/types';
import { placesOf } from '@/modules/plot/lanes';

/**
 * WHO APPEARS WHERE
 * Characters against chapters (or scenes), from what is recorded and from
 * nothing else: no text is searched for names. The author's appearance
 * records say a character appears on the page, or is only mentioned; the
 * other records that tie a character to a chapter (a link in the text, the
 * plan's "Entities involved", an event they take part in that the chapter
 * tells) are shown for what they are, and are not taken as an appearance. A
 * chapter with no record for a character is "not recorded", never "absent".
 */
/** The matrix's own settings in the page address, kept by saved views: scenes or chapters, a status, everyone. (The cell chosen, `acell`, is not kept.) */
export const APPEARANCE_PARAMS = ['agrain', 'astatus', 'aall'] as const;
export const appearanceLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(APPEARANCE_PARAMS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));

export type AppearanceInput = Pick<StoryModel, 'nodes' | 'order' | 'plans' | 'events' | 'entries' | 'threads'>;

/** What a record says ties a character to a chapter or scene. */
export type Evidence = 'appears' | 'mentioned' | 'linked' | 'involved' | 'event';
export const EVIDENCE_LABELS: Record<Evidence, string> = {
  appears: 'Appears (your appearance record)',
  mentioned: 'Mentioned, not on the page (your appearance record)',
  linked: 'Linked in the text',
  involved: 'Listed under “Entities involved” in the plan',
  event: 'Takes part in an event told here',
};

/** A cell as drawn: the author's appearance record, if any; else whether anything else is recorded; else nothing. */
export type CellState = 'appears' | 'mentioned' | 'other' | 'none';
export const STATE_LABELS: Record<CellState, string> = { appears: 'Appears', mentioned: 'Mentioned', other: 'Other records', none: 'Not recorded' };

export interface CellEvidence {
  kind: Evidence;
  /** The chapter or scene the record is on. */
  nodeId: string;
  /** For `event`: which event. */
  eventId?: string;
}
export interface MatrixCell {
  state: CellState;
  evidence: CellEvidence[];
}
export interface MatrixColumn {
  nodeId: string;
  chapterId: string;
  chapterNumber: number;
  /** "Ch 3: The Seal", "Ch 3, scene: The vault". */
  label: string;
  /** "3", or "3.2" for a chapter's second scene. */
  short: string;
  status: NodeStatus;
}
export interface MatrixRow {
  characterId: string;
  name: string;
  cells: MatrixCell[];
  /** Cells with anything recorded. */
  recorded: number;
}

export interface MatrixFilter {
  grain: 'chapters' | 'scenes';
  /** Only these characters (the page's "Involving character"). */
  characterIds?: string[];
  /** Words in the character's name. */
  text?: string;
  /** A range of chapters, by node id, both included; either end may be open. */
  from?: string | null;
  to?: string | null;
  /** Only chapters and scenes where this thread is recorded. */
  threadId?: string | null;
  /** Only chapters and scenes this place is recorded at. */
  placeId?: string | null;
  /** Only chapters and scenes with this status. */
  status?: NodeStatus | null;
  /** Show characters with nothing recorded in the columns shown, too. */
  all?: boolean;
}

/** Every record tying a character to one chapter or scene, by character. */
function recordsAt(node: StoryNode, input: AppearanceInput): Map<string, CellEvidence[]> {
  const out = new Map<string, CellEvidence[]>();
  const add = (id: string, item: CellEvidence) => {
    if (input.entries.get(id)?.category !== 'character') return;
    out.set(id, [...(out.get(id) ?? []), item]);
  };
  const plan = input.plans.get(node.id);
  for (const id of plan?.appearIds ?? []) add(id, { kind: 'appears', nodeId: node.id });
  for (const id of plan?.mentionIds ?? []) add(id, { kind: 'mentioned', nodeId: node.id });
  for (const id of node.mentions ?? []) add(id, { kind: 'linked', nodeId: node.id });
  for (const id of plan?.entityIds ?? []) add(id, { kind: 'involved', nodeId: node.id });
  for (const event of input.events.values()) if ((event.nodeIds ?? []).includes(node.id)) for (const c of event.characters) add(c.id, { kind: 'event', nodeId: node.id, eventId: event.id });
  return out;
}

/** Whether a place is recorded at a chapter or scene: in its plan, linked in its text, or as where an event it tells happens. */
function placeAt(node: StoryNode, placeId: string, input: AppearanceInput): boolean {
  return Boolean(input.plans.get(node.id)?.entityIds.includes(placeId) || node.mentions?.includes(placeId) || [...input.events.values()].some((e) => e.locationId === placeId && (e.nodeIds ?? []).includes(node.id)));
}

/** The cell's state: the author's appearance record first; any other record is "other"; nothing at all is "not recorded". */
export function stateOf(evidence: CellEvidence[]): CellState {
  if (evidence.some((e) => e.kind === 'appears')) return 'appears';
  if (evidence.some((e) => e.kind === 'mentioned')) return 'mentioned';
  return evidence.length ? 'other' : 'none';
}

/**
 * The matrix. Columns are chapters in reading order (or, by scene, each
 * scene, and a chapter with no scenes as itself; a chapter's own column
 * beside its scenes when anything is recorded on the chapter itself). A
 * chapter's cell gathers the records on it and on its scenes.
 */
export function appearanceMatrix(input: AppearanceInput, filter: MatrixFilter) {
  const chapters = input.order.chapters;
  const index = (id: string | null | undefined) => (id ? chapters.findIndex((c) => c.id === id || input.nodes.get(id)?.parentId === c.id) : -1);
  const [lo, hi] = [filter.from ? index(filter.from) : 0, filter.to ? index(filter.to) : chapters.length - 1];
  const scenesOf = (chapter: StoryNode) => [...input.nodes.values()].filter((n) => n.parentId === chapter.id && n.kind === 'scene').sort((a, b) => (input.order.position.get(a.id) ?? 0) - (input.order.position.get(b.id) ?? 0));
  const records = new Map<string, Map<string, CellEvidence[]>>();
  const at = (node: StoryNode) => records.get(node.id) ?? records.set(node.id, recordsAt(node, input)).get(node.id)!;
  const threadNodes = filter.threadId && input.threads.has(filter.threadId) ? new Set(placesOf(input.threads.get(filter.threadId)!, input).map((p) => p.nodeId)) : null;

  // Each column, and the chapters and scenes whose records it gathers.
  const candidates: { column: MatrixColumn; nodes: StoryNode[] }[] = [];
  chapters.forEach((chapter, i) => {
    if (i < Math.max(0, lo) || i > (hi < 0 ? chapters.length - 1 : hi)) return;
    const number = i + 1;
    const scenes = scenesOf(chapter);
    const title = (n: StoryNode) => n.title.trim() || (n.kind === 'scene' ? 'Untitled scene' : 'Untitled chapter');
    const column = (node: StoryNode, short: string, label: string) => ({ nodeId: node.id, chapterId: chapter.id, chapterNumber: number, label, short, status: node.status });
    if (filter.grain === 'chapters' || !scenes.length) {
      candidates.push({ column: column(chapter, `${number}`, `Ch ${number}: ${title(chapter)}`), nodes: [chapter, ...scenes] });
      return;
    }
    if (at(chapter).size || chapter.wordCount > 0) candidates.push({ column: column(chapter, `${number}`, `Ch ${number}: ${title(chapter)} (the chapter itself)`), nodes: [chapter] });
    scenes.forEach((scene, k) => candidates.push({ column: column(scene, `${number}.${k + 1}`, `Ch ${number}, scene: ${title(scene)}`), nodes: [scene] }));
  });
  const columns = candidates.filter(({ column, nodes }) => {
    if (filter.status && column.status !== filter.status) return false;
    if (threadNodes && !nodes.some((n) => threadNodes.has(n.id))) return false;
    if (filter.placeId && !nodes.some((n) => placeAt(n, filter.placeId!, input))) return false;
    return true;
  });

  const text = filter.text?.trim().toLowerCase();
  const people = [...input.entries.values()]
    .filter((e) => e.category === 'character' && (!filter.characterIds?.length || filter.characterIds.includes(e.id)) && (!text || e.name.toLowerCase().includes(text)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const all = people.map((person): MatrixRow => {
    const cells = columns.map(({ nodes }) => {
      const evidence = nodes.flatMap((n) => at(n).get(person.id) ?? []);
      return { state: stateOf(evidence), evidence };
    });
    return { characterId: person.id, name: person.name, cells, recorded: cells.filter((c) => c.state !== 'none').length };
  });
  const rows = filter.all ? all : all.filter((r) => r.recorded > 0);
  return { columns: columns.map((c) => c.column), rows, hidden: all.length - rows.length, characters: people.length };
}

/** A cell's records in words, each saying where it is. */
export function evidenceWords(evidence: CellEvidence[], input: Pick<StoryModel, 'nodes' | 'events'>, columnNodeId: string): string[] {
  return evidence.map((e) => {
    const where = e.nodeId === columnNodeId ? '' : ` (in “${input.nodes.get(e.nodeId)?.title ?? 'a scene'}”)`;
    return e.kind === 'event' ? `Takes part in “${input.events.get(e.eventId!)?.name ?? 'an event'}”, told here${where}` : `${EVIDENCE_LABELS[e.kind]}${where}`;
  });
}

/** The chapters and scenes of the novel, for choosing a range. */
export const documentsOf = (input: Pick<StoryModel, 'nodes' | 'order'>) => [...input.nodes.values()].filter((n) => isDocument(n.kind)).sort((a, b) => (input.order.position.get(a.id) ?? 0) - (input.order.position.get(b.id) ?? 0));
