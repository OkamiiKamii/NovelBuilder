import type { CanonStatus } from '@/modules/canon/types';
import type { EntityType } from '@/modules/model/types';
import type { Validity } from '@/modules/model/validity';

/** The categories every project starts with. Their keys are fixed; their names, colours and field sets can be changed. */
export const LORE_CATEGORIES = ['character', 'location', 'faction', 'item', 'power', 'lore'] as const;
export type BuiltinCategory = (typeof LORE_CATEGORIES)[number];
/** A category key: one of the built-ins, or the key of a category the author created. */
export type LoreCategory = string;

export const CATEGORY_LABELS: Record<string, string> = {
  character: 'Characters',
  location: 'Locations',
  faction: 'Factions & Species',
  item: 'Items & Artifacts',
  power: 'Power Systems & Rules',
  lore: 'Lore & History',
};

export const CATEGORY_SINGULAR: Record<string, string> = {
  character: 'Character',
  location: 'Location',
  faction: 'Faction / Species',
  item: 'Item / Artifact',
  power: 'Power System / Rule',
  lore: 'Lore / History',
};

export const CATEGORY_COLORS: Record<string, string> = { character: '#b4532a', location: '#3f7d4e', faction: '#3d5fa8', item: '#8a6d1f', power: '#7a4fa3', lore: '#5c6370' };
export const CUSTOM_COLORS = ['#2b7a8c', '#a8436b', '#6b7a2b', '#a3622b', '#4f5fa3', '#8c2b5a', '#2b8c6b', '#7a5c3d'];

/** The starting field set of each built-in category. Only a default: every project can change it. */
export const SUGGESTED_FIELDS: Record<string, string[]> = {
  // Characters are shaped by their profile's sections; nothing is shared by all of them until the author or a genre module adds it.
  character: [],
  location: ['Type', 'Region', 'Notable features'],
  faction: ['Type', 'Leader', 'Goals'],
  item: ['Type', 'Owner', 'Abilities'],
  power: ['Rules', 'Costs & limits', 'Tiers'],
  lore: ['When', 'Who was involved', 'Consequences'],
};

export const COMMON_FIELD_KEYS = ['Affixes', 'Power Rank', 'Element', 'Owner', 'Age', 'Status', 'Allegiance', 'Weakness'];

export const FIELD_TYPES = ['text', 'longtext', 'number', 'select', 'multiselect', 'tags', 'toggle', 'date', 'reference', 'references'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  longtext: 'Long text',
  number: 'Number',
  select: 'Choice (one)',
  multiselect: 'Choice (several)',
  tags: 'Tags / list',
  toggle: 'Yes / No',
  date: 'Date',
  reference: 'Link to an entry',
  references: 'Links to several entries',
};

/** One field of a category's field set. */
export interface FieldDef {
  /** Permanent id: entries store their value against it, so the field can be renamed or retyped freely. */
  id: string;
  name: string;
  type: FieldType;
  /** The choices, for the two choice types. */
  options: string[];
  /**
   * NON-DESTRUCTIVE SCHEMA RULE: a field is never deleted from a category,
   * only archived. Archiving hides it from forms; every value entries hold for
   * it stays stored and can be seen and restored.
   */
  archived?: boolean;
  /** Every entry of the category should fill it in. Checked and shown, never enforced: an entry can be saved half-done. */
  required?: boolean;
  /** A line of help shown with the field. */
  help?: string;
  /** For a number: the lowest and highest values that fit. */
  min?: number;
  max?: number;
  /** For a link: the category the linked entries should be (its key); any category when absent. */
  target?: string;
}

/** Limits that keep custom fields from swelling past what the app can show and check well. */
export const FIELD_LIMITS = { fields: 60, options: 100, name: 60, help: 200 } as const;

/**
 * Which of a category's fields the views read, and for what: set by the
 * author, field by field, never worked out from field names. Each names
 * fields by id, so renaming, retyping or reordering a field keeps it; a
 * setting whose field no longer suits is kept and said, not dropped.
 */
export interface KindUses {
  /** When each record is, on the story's calendar: a Number (a year) or a Date; and, optionally, when it ends. */
  timeline?: { start?: string; end?: string };
  /** Where each record is on a map: two Numbers, across and up. */
  map?: { x?: string; y?: string };
  /** Where each record sits on a ladder: a Number, or a Choice (one) whose choices run from lowest to highest. */
  rank?: string;
  /** Who holds each record over the story: the connection type that means holding it (from the holder to the record), and optionally a link field naming who holds it now. */
  ownership?: { type?: string; field?: string };
  /** The field whose value labels each record in the knowledge graph, in place of its name. */
  graphLabel?: string;
  /** The link fields drawn as connections in the knowledge graph. All of them when absent. */
  graphLinks?: string[];
  /** Its records are abilities, skills, classes and the like: shown in the ability tree, with the paths between them. */
  tree?: boolean;
}

/** A category of the codex with its field set, as used by the app (built-in defaults merged with the project's changes). */
export interface Category {
  key: string;
  name: string;
  singular: string;
  color: string;
  builtin: boolean;
  order: number;
  /** Hidden from "new entry", but its entries are kept and shown. */
  archived?: boolean;
  /** False: its entries are left out of the knowledge graph (they stay everywhere else). Shown when absent. */
  graph?: boolean;
  fields: FieldDef[];
  /** The views this category takes part in, and the fields they read. */
  uses?: KindUses;
}

/** A project's stored version of a category: a changed built-in, or one the author created. */
export interface CategorySchema extends Category {
  id: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
}

/** The categories and field sets of a project, without any entries: what a template is made of. */
export interface TemplateData {
  categories: Pick<Category, 'key' | 'name' | 'singular' | 'color' | 'builtin' | 'fields' | 'uses'>[];
}

/** A reusable set of categories and fields the author has saved. Templates belong to the author, not to one project. */
export interface Template extends TemplateData {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

/**
 * One attribute of an entry. Values are always stored as text, whatever the
 * type, so changing a field's type can never destroy what was written:
 *   number → "42"; toggle → "yes" / "no"; date → "yyyy-mm-dd";
 *   choice (several) and tags → one per line; link → the linked entry's id;
 *   links to several → their ids, one per line.
 * `defId` ties the value to a field of the entry's category; without it the
 * field belongs to this entry alone.
 */
export interface LoreField {
  id: string;
  key: string;
  value: string;
  type?: FieldType;
  options?: string[];
  defId?: string;
}

export interface LoreEntry {
  id: string;
  projectId: string;
  category: LoreCategory;
  name: string;
  summary: string;
  description: string;
  /** An http(s) image URL, or an uploaded image stored as a data URL. */
  image: string | null;
  /** Private to the author. */
  notes: string;
  tags: string[];
  fields: LoreField[];
  /** For a place: its level in the novel's place hierarchy (a level id from its place settings). */
  placeLevel?: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * A connection between two records. One row serves both directions: each
 * side sees the other, with its own optional wording (`fromLabel` is how the
 * `from` side describes it, `toLabel` the other). Records never store their
 * connections themselves, so removing one cannot leave the other broken.
 *
 * The codex's "Related entries" are the rows between two entries with no
 * type. A typed connection says what kind of connection it is ("member-of",
 * "owns", or any word of the author's), may join other kinds of record (an
 * event, a chapter, a plot thread, an ability), and reads from `from` to
 * `to`: "Mira member-of The Wardens". The fields after `createdAt` were
 * added later; a row without them is an untyped link between two entries.
 */
export interface LoreLink {
  id: string;
  projectId: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  createdAt: number;
  /** What `fromId` is; `entry` when absent. */
  fromType?: EntityType;
  /** What `toId` is; `entry` when absent. */
  toType?: EntityType;
  /** The kind of connection: a known key (see `connections/types.ts`) or the author's own word, kept as written. Absent: a plain related-entries link. */
  type?: string;
  notes?: string;
  canon?: CanonStatus;
  /** When in the story it holds (see `model/validity.ts`). Absent: always, as far as anyone has said. */
  validity?: Validity;
  /** How it began, in the author's words: "stolen", "inherited", "joined", "elected". */
  how?: string;
  /** How it ended, when it ended without anything taking its place: "lost", "destroyed", "expelled", "dissolved". */
  endHow?: string;
  updatedAt?: number;
}

/** Whether a row is a link between two codex entries: what the codex, the profiles and the exports list as related entries. */
export const isEntryLink = (link: Pick<LoreLink, 'fromType' | 'toType'>): boolean => (link.fromType ?? 'entry') === 'entry' && (link.toType ?? 'entry') === 'entry';

/** A link as seen from one entry. */
export interface RelatedEntry {
  linkId: string;
  entry: LoreEntry;
  /** This side's wording of the relationship. */
  label: string;
  /** The other side's wording. */
  theirLabel: string;
}
