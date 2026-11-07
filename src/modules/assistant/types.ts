export const MODES = ['plot', 'character', 'worldbuilding', 'conflict', 'what-if', 'problem'] as const;
export type BrainstormMode = (typeof MODES)[number];
export const MODE_LABELS: Record<BrainstormMode, string> = { plot: 'Plot', character: 'Character', worldbuilding: 'Worldbuilding', conflict: 'Conflict', 'what-if': 'What-if', problem: 'Problem-solving' };
export const MODE_HINTS: Record<BrainstormMode, string> = {
  plot: 'Narrative beats, chapter turns and what could happen next.',
  character: 'Motivations, hidden flaws, lines of dialogue and friction between people.',
  worldbuilding: 'Lore, faction histories, uses of technology or magic, places.',
  conflict: 'Obstacles, schemes, bottlenecks and people who want the opposite.',
  'what-if': 'What would follow if someone chose differently.',
  problem: 'Ways out of a plot hole, a dead end or a thread that will not resolve.',
};
/** What the assistant is asked for in each mode. */
export const MODE_BRIEFS: Record<BrainstormMode, string> = {
  plot: 'Propose narrative beats, chapter turns and event progressions that could come next or fill the gap described.',
  character: 'Explore internal motivations, secret flaws, possible lines of dialogue and sources of friction between the people involved.',
  worldbuilding: 'Expand the lore: faction histories, applications of the magic or technology, geography, customs, consequences of the rules already set.',
  conflict: 'Generate external obstacles, schemes by opponents, physical or practical bottlenecks, and motives that oppose the protagonists.',
  'what-if': 'Speculate on how the story would branch if a key choice went differently. Treat every outcome as hypothetical.',
  problem: 'Propose distinct ways to resolve the plot hole, dead end or unresolved thread described. Prefer solutions that use what is already established.',
};

/** Where a fact given to the assistant came from in the project. */
export type FactSource =
  | { type: 'entry'; id: string }
  | { type: 'relation'; id: string }
  | { type: 'thread'; id: string }
  | { type: 'event'; id: string }
  | { type: 'canon'; id: string }
  | { type: 'sheet'; id: string }
  | { type: 'chapter'; id: string };

/**
 * One thing the project says, as handed to the assistant. Facts are the only
 * thing that can ever be shown as Established: they are built from the
 * project's own records, numbered, and the assistant can only point at them.
 */
export interface Fact {
  /** `F1`, `F2`… within one brainstorm. */
  id: string;
  /** "Alex · Character", "Plot thread", "Canon". */
  label: string;
  text: string;
  source: FactSource;
}

export interface Attachments {
  /** Codex entries. */
  entryIds: string[];
  threadIds: string[];
  /** Chapters and scenes: their summary and plan, never their text. */
  nodeIds: string[];
}

/**
 * STRICT EPISTEMIC CLASSIFICATION
 * `established`  a fact from the project, quoted from the project itself.
 *                The assistant only supplies which fact; the words shown are
 *                the project's own.
 * `suggestion`   a new idea from the assistant.
 * `assumption`   something the assistant took for granted to get there. Also
 *                anything it presented as established that the project does
 *                not actually say.
 */
export type ItemKind = 'established' | 'suggestion' | 'assumption';
export const KIND_LABELS: Record<ItemKind, string> = { established: 'Established', suggestion: 'Suggested', assumption: 'Assumption' };
export const KIND_HINTS: Record<ItemKind, string> = {
  established: 'From your project, in its own words.',
  suggestion: 'A new idea from the assistant. Not part of your story unless you add it.',
  assumption: 'Something the assistant took for granted. Check it before relying on it.',
};

export type RouteKind = 'ideas' | 'thread' | 'world' | 'character';
export const ROUTE_LABELS: Record<RouteKind, string> = { ideas: 'Add to Notes / Ideas', thread: 'Add to Plot Thread', world: 'Add to Worldbuilding', character: 'Add to Character Notes' };

export interface BrainstormItem {
  id: string;
  kind: ItemKind;
  /** For a suggestion, a few words naming it. */
  title: string;
  text: string;
  /** For an established item: the fact it is. For a suggestion: the facts it builds on. */
  factIds: string[];
  /** Why an item was moved to Assumption by the app rather than by the assistant. */
  note: string;
  /** Where the assistant thinks a suggestion belongs. Only a hint for which button to offer first. */
  fits: RouteKind | null;
  status: 'open' | 'added' | 'discarded';
  /** Where it was added, in words, and where to find it. */
  added: { label: string; to: string } | null;
}

/** One question to the assistant and what came back. Kept so the author can return to it. */
export interface Brainstorm {
  id: string;
  projectId: string;
  mode: BrainstormMode;
  prompt: string;
  entryIds: string[];
  threadIds: string[];
  nodeIds: string[];
  /** The facts as they were sent, so an Established item still reads as it did. */
  facts: Fact[];
  items: BrainstormItem[];
  /** Which assistant answered: a model name, or "pasted". */
  model: string;
  createdAt: number;
  updatedAt: number;
}

/** A note kept from a brainstorm, or written by hand. Not part of the manuscript or the Codex. */
export interface Idea {
  id: string;
  projectId: string;
  text: string;
  /** The brainstorm it came from, when it came from one. */
  brainstormId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Where an approved suggestion goes. `new` creates the thread or entry; otherwise it is added to an existing one. */
export type RouteTarget =
  | { kind: 'ideas' }
  | { kind: 'thread'; threadId: string }
  | { kind: 'thread'; newTitle: string }
  | { kind: 'world' | 'character'; entryId: string }
  | { kind: 'world' | 'character'; newName: string; category: string };
