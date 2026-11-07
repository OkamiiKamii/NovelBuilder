/** ProseMirror document JSON. Opaque to the data layer. */
export type DocJSON = Record<string, unknown>;

export const GROUP_KINDS = ['volume', 'act', 'arc'] as const;
export const NODE_KINDS = [...GROUP_KINDS, 'chapter', 'scene'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** The workflow pipeline, in order. */
export const NODE_STATUSES = ['idea', 'planned', 'drafting', 'draft-complete', 'revising', 'final', 'published'] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const KIND_LABELS: Record<NodeKind, string> = { volume: 'Volume', act: 'Act', arc: 'Arc', chapter: 'Chapter', scene: 'Scene' };
export const STATUS_LABELS: Record<NodeStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  drafting: 'Drafting',
  'draft-complete': 'Draft Complete',
  revising: 'Revising',
  final: 'Final',
  published: 'Published',
};

/**
 * Maps the earlier two-field scheme (a five-step progress plus a separate
 * planned/written/published tag) onto the single pipeline. Used by the
 * database upgrade and when importing older backup files.
 */
export function upgradeStatus(status: unknown, publication?: unknown): NodeStatus {
  if (publication === 'published') return 'published';
  if (NODE_STATUSES.includes(status as NodeStatus)) return status as NodeStatus;
  const legacy: Record<string, NodeStatus> = { outlining: 'planned', editing: 'revising', complete: 'final' };
  return legacy[String(status)] ?? 'idea';
}

/**
 * One node of the story tree: a volume/act/arc, a chapter or a scene.
 *
 * STABLE ID RULE: `id` is a UUID assigned once and never changed or reused.
 * Structure is expressed only as `parentId` + `order`; text, notes and every
 * other link hang off `id`. Reordering or moving a node rewrites `parentId`
 * and `order` and nothing else, so it cannot detach or mix up content.
 */
export interface StoryNode {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  /** Position among siblings. Never used to identify a node. */
  order: number;
  summary: string;
  notes: string;
  /** The author's words to readers before and after a chapter, as posted with a web serial. Not private: they are shown in the reader preview. */
  noteBefore?: string;
  noteAfter?: string;
  status: NodeStatus;
  /** Codex entries linked inside this node's text, kept up to date on every save so backlinks need not read the text. */
  mentions?: string[];
  /** Name of the draft currently in the manuscript, when this chapter or scene has alternates. */
  branchName?: string;
  /** Words in this node's own text. Totals including children are derived, never stored. */
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * The text of a chapter or scene, stored apart from its metadata so listing
 * the tree never loads manuscript text. `id` is the node's id.
 */
export interface ChapterContent {
  id: string;
  projectId: string;
  doc: DocJSON;
  /**
   * Incremented on every save. A save states which revision it was based on;
   * if the stored one has moved on, the save is refused instead of silently
   * overwriting newer text. This is also the hook a future sync layer uses to
   * detect conflicts, without changing how local saving works.
   */
  rev?: number;
  savedAt?: number;
}

/** The text in the editor moments ago, kept until a full save supersedes it. `id` is the node's id. */
export interface ChapterDraft {
  id: string;
  projectId: string;
  doc: DocJSON;
  /** The saved revision this draft was typed on top of. */
  baseRev: number;
  updatedAt: number;
}

export const REVISION_REASONS = ['auto', 'manual', 'restore', 'recovery', 'conflict'] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number];

/** An earlier saved state of a chapter or scene. */
export interface ChapterRevision {
  id: string;
  projectId: string;
  nodeId: string;
  doc: DocJSON;
  wordCount: number;
  charCount: number;
  /** When this text was the saved version. */
  savedAt: number;
  capturedAt: number;
  /** `rev` of the content this was copied from, to avoid storing the same state twice. */
  sourceRev: number;
  reason: RevisionReason;
  label: string;
  /** Whose text this version was, when the project is shared. */
  by?: { id: string; name: string };
  /** Which draft this was a version of. */
  branchName?: string;
}

export type RevisionInfo = Omit<ChapterRevision, 'doc'>;

export const MAIN_DRAFT = 'Main draft';

/**
 * An alternate draft of a chapter or scene that is NOT currently in the
 * manuscript. The draft that is in the manuscript lives in `chapterContents`
 * like any other text, which is why word counts, search and (later) export
 * only ever see one draft per chapter. Making an alternate active swaps the
 * two: the outgoing text is stored here under its own name, so switching
 * never destroys anything.
 */
export interface ChapterBranch {
  id: string;
  projectId: string;
  nodeId: string;
  name: string;
  doc: DocJSON | null;
  wordCount: number;
  charCount: number;
  createdAt: number;
  updatedAt: number;
}

export type BranchInfo = Omit<ChapterBranch, 'doc'>;

export interface PlanBeat {
  id: string;
  text: string;
}

/**
 * PLANNING vs. MANUSCRIPT SEPARATION RULE
 * The plan for a chapter or scene (`id` is the node's id). It lives in its
 * own table, apart from the manuscript text in `chapterContents`. No code
 * copies anything from a plan into the text: a plan is something the author
 * reads while writing, and the story changes only when the author types.
 * (Summary and private notes are part of the planning layer too; they are
 * stored on the node itself because the organizer lists them.)
 */
export interface ChapterPlan {
  id: string;
  projectId: string;
  objective: string;
  /** Key events and plot beats, in order. */
  beats: PlanBeat[];
  /** Codex entries present in this chapter or scene, by their permanent ids. */
  entityIds: string[];
  /** The author's labels for this chapter or scene (action, dialogue, a quiet moment…). Missing on older plans. */
  labels?: string[];
  /** Characters the author records as appearing here, on the page. A character is in this list or `mentionIds`, not both. Missing on older plans. */
  appearIds?: string[];
  /** Characters the author records as mentioned here but not on the page. */
  mentionIds?: string[];
  /** Whose point of view the chapter or scene is told from, as the author records it: characters, by id. Missing on older plans. */
  povIds?: string[];
  conflict: string;
  emotionalArc: string;
  dialogue: string;
  foreshadowing: string;
  reveals: string;
  openQuestions: string;
  ending: string;
  updatedAt: number;
}

export const PLAN_TEXT_FIELDS = ['objective', 'conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions', 'ending'] as const;
export type PlanTextField = (typeof PLAN_TEXT_FIELDS)[number];

export const PLAN_LABELS: Record<PlanTextField, string> = {
  objective: 'Objective',
  conflict: 'Main conflict',
  emotionalArc: 'Emotional arc',
  dialogue: 'Key dialogue',
  foreshadowing: 'Foreshadowing',
  reveals: 'Information revealed',
  openQuestions: 'Open questions',
  ending: 'Ending target',
};

export type PlanChanges = Partial<Pick<ChapterPlan, PlanTextField | 'beats' | 'entityIds' | 'labels' | 'appearIds' | 'mentionIds' | 'povIds'>>;

export const emptyPlan = (id: string, projectId: string): ChapterPlan => ({
  id, projectId, objective: '', beats: [], entityIds: [], conflict: '', emotionalArc: '', dialogue: '', foreshadowing: '', reveals: '', openQuestions: '', ending: '', updatedAt: 0,
});

/** One node of a structure being imported from a file. */
export interface ImportItem {
  kind: NodeKind;
  title: string;
  doc: DocJSON | null;
  words: number;
  characters: number;
  children: ImportItem[];
}

export interface TextMetrics {
  words: number;
  characters: number;
  paragraphs: number;
  readingMinutes: number;
}
