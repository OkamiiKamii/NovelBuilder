import type { LoreCategory } from '@/modules/codex/types';
import type { NodeKind } from '@/modules/manuscript/types';

export type SearchEntityType = 'node' | 'entry';
export type SearchField = 'title' | 'heading' | 'body' | 'summary' | 'notes' | 'plan' | 'name' | 'description' | 'tags' | 'attribute';

/** How results are grouped on screen. Codex entries are grouped by their category. */
export type SearchGroup = 'manuscript' | LoreCategory | 'notes';
export type SearchScope = 'all' | 'manuscript' | 'codex' | 'notes';

/**
 * The unit of search: one block of text with a precise address.
 *
 * ARCHITECTURE NOTE (future natural-language / semantic search)
 * Every searchable thing in a project is flattened into these records:
 * a stable block id, the entity it belongs to (by its permanent UUID), which
 * field it came from, its position, and the plain text. Keyword search reads
 * `text`. A semantic engine needs nothing more from the schema: it stores one
 * embedding per block id in its own table, ranks blocks by similarity, and
 * returns the same `GroupResult[]` through the same `SearchEngine` interface.
 * Relationship questions ("chapters where X uses Y") join block hits to
 * entities via `entityId` and to the codex link table. None of that changes
 * the manuscript or codex tables, which stay the single source of truth; this
 * index is derived data that can be rebuilt from them at any time.
 */
export interface SearchBlock {
  /** `${entityId}:${field}:${index}`: stable for as long as the block exists. */
  id: string;
  projectId: string;
  entityType: SearchEntityType;
  entityId: string;
  /** Denormalised for display, so results render without further lookups. */
  entityTitle: string;
  entityKind: NodeKind | LoreCategory;
  group: SearchGroup;
  field: SearchField;
  /** Custom attribute name (`attribute`) or planning field name (`plan`). */
  label: string;
  /** Position within the entity: paragraph number for body text, line or row number otherwise. */
  index: number;
  text: string;
}

/** What the index last saw of an entity, to detect when it needs re-reading. */
export interface SearchState {
  /** The entity's id. */
  id: string;
  projectId: string;
  stamp: string;
}

export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface Snippet {
  blockId: string;
  field: SearchField;
  label: string;
  /** Block position, for jumping to the exact paragraph. */
  index: number;
  /** Tail of the preceding paragraph and head of the following one, for context. */
  before: string;
  parts: SnippetPart[];
  after: string;
  /** The matched text as written, used to highlight it at the destination. */
  term: string;
}

export interface EntityResult {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  kind: NodeKind | LoreCategory;
  group: SearchGroup;
  matchCount: number;
  snippets: Snippet[];
}

export interface GroupResult {
  group: SearchGroup;
  /** Total matching passages in this group. */
  matchCount: number;
  items: EntityResult[];
}

/** Anything that can answer a query for a project. Keyword search is the first implementation. */
export interface SearchEngine {
  search(query: string, scope: SearchScope): GroupResult[];
}
