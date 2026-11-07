import type { FieldType } from '@/modules/codex/types';

/**
 * WHERE A CHARACTER LIVES
 * A character is a codex entry of the Characters category: one record, with
 * one id, used by every feature that refers to a character (links in the
 * manuscript, relationships, timeline events, plot threads, system sheets,
 * progression, search, the story graph). Its name, summary, portrait, tags
 * and field values are that entry's.
 *
 * Everything here hangs off that entry by its id and adds what a character
 * profile needs on top: how the profile is laid out, the character's
 * secrets, the author's notes on them, and a record of changes. Nothing
 * here is a second copy of the character.
 */

/** Roles offered by default. A character may have several, and any text is accepted as a role of the author's own. */
export const ROLES = ['Protagonist', 'Antagonist', 'Supporting', 'Minor', 'Background'] as const;
export const STATUSES = ['Alive', 'Deceased', 'Missing', 'Unknown'] as const;

export const TABS = ['overview', 'system', 'progression', 'relationships', 'details', 'secrets', 'notes', 'history'] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', system: 'System', progression: 'Progression', relationships: 'Relationships', details: 'Details', secrets: 'Secrets', notes: 'Notes', history: 'History' };

/** A named group of fields on the profile. The fields themselves are the entry's own; a section only says which, and in what order. */
export interface Section {
  id: string;
  name: string;
  /** Which tab it sits on. */
  tab: 'overview' | 'details';
  hidden: boolean;
  /** Ids of the entry's fields, in display order. */
  fieldIds: string[];
}

export interface CharacterProfile {
  id: string;
  projectId: string;
  /** The codex entry this is the profile of. */
  entryId: string;
  /** A title or epithet: "The Oathbreaker". */
  epithet: string;
  aliases: string[];
  roles: string[];
  /** Alive, Deceased… or the author's own word. Empty when not recorded. */
  status: string;
  /** Put away: out of the library unless asked for, but nothing about it is removed and every reference to it still works. */
  archived: boolean;
  /** The point of the portrait to keep in view when it is cropped, as percentages from the left and top. */
  focal: { x: number; y: number };
  /** Place in the author's own ordering of the library. */
  order: number;
  sections: Section[];
  /** How each link to another entry stands (an affiliation that is Former, or Secret), by link id. */
  linkStatus: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export const KNOWLEDGE = ['knows', 'suspects', 'unaware'] as const;
export type Knowledge = (typeof KNOWLEDGE)[number];
export const KNOWLEDGE_LABELS: Record<Knowledge, string> = { knows: 'Knows', suspects: 'Suspects', unaware: 'Unaware' };
export const SECRET_STATUSES = ['Hidden', 'Hinted', 'Partly revealed', 'Revealed'] as const;

/**
 * Something true in the story that is not common knowledge. Four different
 * things are kept apart: what is true (`description`), whether the
 * character themself knows it (`self`), which other characters know or
 * suspect it, and what the reader knows and from where.
 */
export interface CharacterSecret {
  id: string;
  projectId: string;
  entryId: string;
  title: string;
  /** What is actually true. */
  description: string;
  status: string;
  /** Whether the character the secret is about knows it. (An unknown ancestry is a secret about someone who does not know it.) */
  self: Knowledge;
  /** Other characters, by entry id. A character is in at most one of the three. */
  knows: string[];
  suspects: string[];
  unaware: string[];
  reader: Knowledge;
  /** The chapter or scene from which the reader stands as `reader` says. */
  readerNodeId: string | null;
  /** Where it first figures in the manuscript, and where it comes out. */
  firstNodeId: string | null;
  revealNodeId: string | null;
  /** The timeline event at which it comes out. */
  revealEventId: string | null;
  nodeIds: string[];
  threadIds: string[];
  /** The author's own notes. */
  notes: string;
  /**
   * How knowledge of it spreads, if the author records it: what each
   * character holds, where and when, in the order it happens to them. A
   * character with records is kept here, not in `knows`/`suspects`/
   * `unaware`. Missing on older rows.
   */
  records?: KnowledgeRecord[];
  /** Where a character acts on knowing it, as the author marks: what the knowledge checks test. Missing on older rows. */
  needs?: KnowledgeNeed[];
  createdAt: number;
  updatedAt: number;
}

/**
 * What a character holds about a secret, kept apart from what is true (the
 * secret's own description). "Not recorded" is not one of these: it is the
 * absence of a record, and nothing is assumed from it.
 */
export const AWARENESS = ['knows', 'partial', 'believes', 'suspects', 'false', 'unaware'] as const;
export type Awareness = (typeof AWARENESS)[number];
export const AWARENESS_LABELS: Record<Awareness, string> = { knows: 'Knows', partial: 'Knows part of it', believes: 'Believes it, unconfirmed', suspects: 'Suspects', false: 'Believes something false', unaware: 'Unaware' };
/** States where what they hold is their own version, worth writing down. */
export const HAS_VERSION: readonly Awareness[] = ['partial', 'believes', 'suspects', 'false'];

/** One thing the author records about what one character holds of a secret, at one point. A change is a new record: earlier ones stay. */
export interface KnowledgeRecord {
  id: string;
  /** The character, by entry id. */
  characterId: string;
  state: Awareness;
  /** Their version: the part they know, what they suspect, or the false thing they believe instead. */
  belief: string;
  /** Where the reader sees it: a chapter or scene. */
  nodeId: string | null;
  /** When it happens in story time: a timeline event. */
  eventId: string | null;
  /** How they came by it, in the author's words: overheard, a letter, worked it out. */
  how: string;
  /** Who told or showed them, if someone did. */
  fromId: string | null;
}

/** The author's mark that a character acts on knowing the secret at a point. Only these let a check say someone's knowledge is out of place. */
export interface KnowledgeNeed {
  id: string;
  characterId: string;
  nodeId: string | null;
  eventId: string | null;
  /** What they do that needs it. */
  note: string;
}

/** A loose note about a character. It is not part of the character's established record until the author copies it there. */
export interface CharacterNote {
  id: string;
  projectId: string;
  entryId: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  /** Chapters and scenes it is about. */
  nodeIds: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * One line of a character's history. Two kinds, never mixed up:
 *  - `record`: something the author did to the record ("changed Occupation
 *    from Soldier to Commander"). Written by the app when it happens.
 *  - `story`: something that happens to the character in the story ("became
 *    commander"), which the author writes down and may tie to a chapter.
 */
export interface CharacterHistory {
  id: string;
  projectId: string;
  entryId: string;
  at: number;
  kind: 'record' | 'story';
  /** What was done, for a record line: `created`, `field`, `identity`, `section`, `archived`, `restored`, `portrait`, `template`, `note`. */
  action: string;
  /** The field or thing concerned. */
  label: string;
  from: string;
  to: string;
  /** A story line's own words. */
  text: string;
  nodeId: string | null;
}

/** A field a section suggests. It is only a suggestion: nothing is stored until the author adds it. */
export interface FieldSuggestion {
  name: string;
  type: FieldType;
  options?: string[];
}
export interface TemplateSection {
  name: string;
  tab: 'overview' | 'details';
  fields: FieldSuggestion[];
}
/** A starting layout for a profile: its sections, and the fields each one offers. */
export interface CharacterTemplate {
  id: string;
  /** Null for the ones that come with the app. */
  projectId: string | null;
  name: string;
  description: string;
  sections: TemplateSection[];
  createdAt: number;
}
