import type { CanonStatus } from '@/modules/canon/types';
import type { Category, LoreEntry, LoreLink } from '@/modules/codex/types';
import type { ChapterPlan, StoryNode } from '@/modules/manuscript/types';
import type { PlotThread } from '@/modules/plot/types';
import type { ProgressCategory, ProgressChange } from '@/modules/progression/track';
import type { Journey } from '@/modules/travel/types';
import type { Project } from '@/modules/projects/types';
import type { StoryOrder } from '@/modules/relationships/timeline';
import type { CharacterRelation } from '@/modules/relationships/types';
import type { SysItem, SystemBlueprint, SystemSheet } from '@/modules/systems/types';
import type { Calendar } from '@/modules/timeline/calendar';
import type { TimelineEvent } from '@/modules/timeline/types';
import type { Validity } from './validity';
import type { TimelineRecord } from '@/modules/branching/types';

/**
 * SHARED RECORD CONTRACTS
 * What the visual views read. These are not new records: every entity is a
 * row the app already stores, named by its stable id, and every connection
 * is read from the place where the author made it. Nothing here is written
 * back; a view edits a record through that record's own service.
 *
 *  node      a volume, act, arc, chapter or scene (`chapters` table)
 *  entry     a codex entry: character, location, faction, item, power, lore
 *            or any category the author made (`loreEntries`)
 *  event     a timeline event (`timelineEvents`)
 *  thread    a plot thread (`plotThreads`)
 *  relation  a relationship between two characters (`characterRelations`)
 *  ability   a class, skill, title… inside a system blueprint (`systems`),
 *            named `<systemId>/<itemId>` because it is not a row of its own
 */
export const ENTITY_TYPES = ['node', 'entry', 'event', 'thread', 'relation', 'ability'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** A record, by its stable id. Never by its name, title or position. */
export interface EntityRef {
  type: EntityType;
  id: string;
}

/** What a view shows for any record: its name as it is now, and what kind of thing it is. */
export interface EntityView {
  ref: EntityRef;
  label: string;
  /** The node kind (`chapter`, `scene`…), the codex category key (`character`, `location`, `custom-…`), or the entity type. */
  kind: string;
}

/**
 * The ways records are connected today, each read from one place:
 *  part-of        node → node              a node's `parentId`
 *  link           any → any               a stored connection (`loreLinks`): the codex's related
 *                                          entries, or a typed one ("member-of", "owns", the author's own)
 *  relationship   entry → entry            a character relationship, as its latest stage describes it
 *  field          entry → entry            a reference field ("Leader", "Owner")
 *  mentioned      entry → node             linked in the chapter's text (`StoryNode.mentions`)
 *  present        entry → node             listed in the chapter's plan (`ChapterPlan.entityIds`)
 *  appearance     entry → node             the author's appearance record: on the page, or only mentioned (`appearIds`, `mentionIds`); whose point of view (`povIds`)
 *  participant    entry → event            a character at an event
 *  involved       entry → event            another entry involved in an event
 *  occurs-at      event → entry            where an event takes place
 *  told-in        event → node             where an event is told (reading order, not chronology),
 *                                          as a flashback, foreshadowing… when the author says so
 *  in-thread      event → thread           a plot thread the event belongs to
 *  follows        event → event            "comes after"
 *  dated-from     event → event            a relative date's anchor
 *  thread-entry   thread → entry           a thread's characters and places
 *  beat           thread → node            a recorded development, in its chapter or scene
 *  resolves-in    thread → node            where the thread is meant to resolve
 *  holds          entry → ability          on the entry's system sheet
 *  branches-from  ability → ability        an item's `parentId` within its blueprint
 *  progress       entry → node | event     a progression change, at the chapter, scene or event it happens at
 *                 entry → entry            …and the codex entry it gains, loses or names
 *  travel         entry → entry, node, event   a journey: where a traveller leaves from, goes to and by way of;
 *                                          when they set out and arrive; the events it is part of
 */
export const CONNECTION_KINDS = ['part-of', 'link', 'relationship', 'field', 'mentioned', 'present', 'appearance', 'participant', 'involved', 'occurs-at', 'told-in', 'follows', 'dated-from', 'in-thread', 'thread-entry', 'beat', 'resolves-in', 'holds', 'branches-from', 'progress', 'travel'] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

/** Which kinds of record each connection may join, as [from, to]. A typed `link` may join any two. */
export const ENDPOINTS: Record<ConnectionKind, [EntityType, EntityType] | null> = {
  'part-of': ['node', 'node'],
  link: null,
  relationship: ['entry', 'entry'],
  field: ['entry', 'entry'],
  mentioned: ['entry', 'node'],
  present: ['entry', 'node'],
  appearance: ['entry', 'node'],
  participant: ['entry', 'event'],
  involved: ['entry', 'event'],
  'occurs-at': ['event', 'entry'],
  'told-in': ['event', 'node'],
  follows: ['event', 'event'],
  'dated-from': ['event', 'event'],
  'in-thread': ['event', 'thread'],
  'thread-entry': ['thread', 'entry'],
  beat: ['thread', 'node'],
  'resolves-in': ['thread', 'node'],
  holds: ['entry', 'ability'],
  'branches-from': ['ability', 'ability'],
  progress: null,
  travel: null,
};

/** Where a connection is stored: the record to open, or to change through its service. */
export interface ConnectionSource {
  table: string;
  id: string;
  /** For a field of an entry: the field (its id on the entry). */
  field?: string;
}

/**
 * One connection between two records. It holds their ids, never copies of
 * them. `from` → `to` is the direction the meaning reads in; `directed`
 * says whether that direction matters ("Mentor → Student") or the
 * connection reads the same both ways.
 */
export interface Connection {
  /** Stable while the connection exists: built from where it is stored, so a selection survives a reload. */
  id: string;
  kind: ConnectionKind;
  from: EntityRef;
  to: EntityRef;
  /** How the `from` side describes it, in the author's words when they gave some. */
  label: string;
  /** How the `to` side describes it, when that differs. Never invented: absent when the author gave none. */
  reverseLabel?: string;
  directed: boolean;
  source: ConnectionSource;
  /** For a stored `link`: its kind (`related`, `owns`, or the author's own word), notes, canon status and when it holds. */
  type?: string;
  notes?: string;
  canon?: CanonStatus;
  validity?: Validity;
}

/** A connection one of whose ends no longer exists. Reported, never silently dropped. */
export interface DanglingConnection {
  connection: Connection;
  missing: EntityRef[];
}

/** An ability as a record: the blueprint item, the system it belongs to, and its group's name. */
export interface AbilityRecord {
  system: SystemBlueprint;
  item: SysItem;
  group: string;
}

/**
 * One project's records, read once and indexed by id. Older rows are
 * brought to the current shape on the way in (missing lists become empty),
 * so a view never meets `undefined` where a list belongs.
 */
export interface StoryModel {
  project: Project;
  nodes: Map<string, StoryNode>;
  /** Reading order: where each node sits, and chapter numbers. */
  order: StoryOrder;
  plans: Map<string, ChapterPlan>;
  entries: Map<string, LoreEntry>;
  categories: Map<string, Category>;
  links: LoreLink[];
  relations: Map<string, CharacterRelation>;
  events: Map<string, TimelineEvent>;
  threads: Map<string, PlotThread>;
  systems: Map<string, SystemBlueprint>;
  abilities: Map<string, AbilityRecord>;
  sheets: SystemSheet[];
  /** Where this project sits among its alternate timelines (main canon, an alternate…); null when it has never been forked. */
  timeline: TimelineRecord | null;
  /** The calendar the novel's dates are read in: the standard one unless it has its own. */
  calendar: Calendar;
  /** What the novel tracks about how its characters change, and each change recorded. */
  progressCategories: Map<string, ProgressCategory>;
  progress: ProgressChange[];
  /** Journeys: who travels from where to where, and when. */
  journeys: Journey[];
}
