// WHERE A CHARACTER LIVES (as in the original app). A port of
// flutter_app/lib/shared/domain/characters/character_records.dart.
//
// A character is a codex entry of the Characters category: one record, with one id, used by every feature that refers
// to a character (links in the manuscript, relationships, events, plot threads, sheets, progression, search). Its
// name, summary, portrait, tags and field values are that entry's.
//
// Everything here hangs off that entry by its id and adds what a profile needs on top: how the profile is laid out,
// the character's secrets, the author's notes on them, and a record of changes. Nothing here is a second copy of the
// character.

import { type JsonMap, deepCopy, idOrNull, mapOrNull, numOrNull, str, strOrNull } from '../json';
import { type FieldType, fieldTypeOf } from '../records/category';
import { JsonRecord, boolOf, freezeMap, maps, strings } from '../records/jsonRecord';

/** Roles offered by default. A character may have several, and any text is accepted as a role of the author's own. */
export const characterRoles: readonly string[] = ['Protagonist', 'Antagonist', 'Supporting', 'Minor', 'Background'];
export const characterStatuses: readonly string[] = ['Alive', 'Deceased', 'Missing', 'Unknown'];

/** Dart's `ProfileTab`: which tab of the profile a section is on. */
export type ProfileTab = 'overview' | 'details';
export const profileTabs: readonly ProfileTab[] = ['overview', 'details'];
export const profileTabLabel: Readonly<Record<ProfileTab, string>> = { overview: 'Overview', details: 'Details' };

/** Anything but `details` is the overview, as the original reads it. */
export function profileTabOf(value: unknown): ProfileTab {
  return value === 'details' ? 'details' : 'overview';
}

/** A named group of fields on a profile. The fields are the entry's own; a section only says which, and in what
 * order. */
export class ProfileSection {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get tab(): ProfileTab {
    return profileTabOf(this.raw['tab']);
  }
  get hidden(): boolean {
    return boolOf(this.raw['hidden']);
  }
  /** Ids of the entry's fields, in display order. */
  get fieldIds(): string[] {
    return strings(this.raw['fieldIds']);
  }

  toJson(): JsonMap {
    return deepCopy(this.raw);
  }

  merged(changes: JsonMap): ProfileSection {
    return new ProfileSection({ ...this.toJson(), ...deepCopy(changes) });
  }
}

/** The point of the portrait to keep in view when it is cropped, as percentages from the left and top. */
export type Focal = { x: number; y: number };

export class CharacterProfile extends JsonRecord {
  /** The codex entry this is the profile of. */
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  /** A title or epithet: "The Oathbreaker". */
  get epithet(): string {
    return str(this.raw['epithet']);
  }
  get aliases(): string[] {
    return strings(this.raw['aliases']);
  }
  get roles(): string[] {
    return strings(this.raw['roles']);
  }
  /** Alive, Deceased… or the author's own word. Empty when not recorded. */
  get status(): string {
    return str(this.raw['status']);
  }
  /** Put away: out of the library unless asked for, but nothing about it is removed and every reference still
   * works. */
  get archived(): boolean {
    return boolOf(this.raw['archived']);
  }
  get focal(): Focal {
    const f = mapOrNull(this.raw['focal']) ?? {};
    return { x: numOrNull(f['x']) ?? 50, y: numOrNull(f['y']) ?? 30 };
  }
  /** Place in the author's own ordering of the library. */
  get order(): number {
    return numOrNull(this.raw['order']) ?? 0;
  }
  get sections(): ProfileSection[] {
    return maps(this.raw['sections']).map((s) => new ProfileSection(s));
  }
  /** How each link to another entry stands (an affiliation that is Former, or Secret), by link id. */
  get linkStatus(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [k, v] of Object.entries(mapOrNull(this.raw['linkStatus']) ?? {})) {
      if (typeof v === 'string') out.set(k, v);
    }
    return out;
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }

  withFields(changes: JsonMap): CharacterProfile {
    return new CharacterProfile(this.merged(changes));
  }
}

/** Dart's `Knowledge`: whether someone knows a secret, in the simple form a secret keeps for the character and the
 * reader. */
export type Knowledge = 'knows' | 'suspects' | 'unaware';
export const knowledges: readonly Knowledge[] = ['knows', 'suspects', 'unaware'];
export const knowledgeLabel: Readonly<Record<Knowledge, string>> = {
  knows: 'Knows',
  suspects: 'Suspects',
  unaware: 'Unaware',
};

export function knowledgeOf(value: unknown): Knowledge | null {
  return knowledges.find((k) => k === value) ?? null;
}

export const secretStatuses: readonly string[] = ['Hidden', 'Hinted', 'Partly revealed', 'Revealed'];

/** Dart's `Awareness`: what a character holds about a secret, kept apart from what is true. "Not recorded" is not one
 * of these: it is the absence of a record, and nothing is assumed from it. The values are the Dart names; the stored
 * word is `awarenessKey` (`false` for `falseBelief`). */
export type Awareness = 'knows' | 'partial' | 'believes' | 'suspects' | 'falseBelief' | 'unaware';
export const awarenesses: readonly Awareness[] = ['knows', 'partial', 'believes', 'suspects', 'falseBelief', 'unaware'];
export const awarenessLabel: Readonly<Record<Awareness, string>> = {
  knows: 'Knows',
  partial: 'Knows part of it',
  believes: 'Believes it, unconfirmed',
  suspects: 'Suspects',
  falseBelief: 'Believes something false',
  unaware: 'Unaware',
};

/** The stored word (`false` for falseBelief). */
export function awarenessKey(a: Awareness): string {
  return a === 'falseBelief' ? 'false' : a;
}

/** From the stored word. */
export function awarenessOf(value: unknown): Awareness | null {
  return awarenesses.find((a) => awarenessKey(a) === value) ?? null;
}

/** One thing the author records about what one character holds of a secret, at one point. A change is a new record:
 * earlier ones stay. */
export class KnowledgeRecord {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get characterId(): string {
    return str(this.raw['characterId']);
  }
  /** Null for a state this version does not know; the record is kept as stored. */
  get state(): Awareness | null {
    return awarenessOf(this.raw['state']);
  }
  /** Their version: the part they know, what they suspect, or the false thing they believe instead. */
  get belief(): string {
    return str(this.raw['belief']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get eventId(): string | null {
    return idOrNull(this.raw['eventId']);
  }
  get how(): string {
    return str(this.raw['how']);
  }
  get fromId(): string | null {
    return idOrNull(this.raw['fromId']);
  }
}

/** The author's mark that a character acts on knowing the secret at a point. */
export class KnowledgeNeed {
  readonly raw: JsonMap;
  constructor(raw: JsonMap) {
    this.raw = freezeMap(raw);
  }

  get id(): string {
    return str(this.raw['id']);
  }
  get characterId(): string {
    return str(this.raw['characterId']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
  get eventId(): string | null {
    return idOrNull(this.raw['eventId']);
  }
  get note(): string {
    return str(this.raw['note']);
  }
}

/** Something true in the story that is not common knowledge. Kept apart: what is true (`description`), whether the
 * character themself knows it (`self`), which other characters know or suspect it, and what the reader knows. */
export class CharacterSecret extends JsonRecord {
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  get status(): string {
    return str(this.raw['status'], 'Hidden');
  }
  get self(): Knowledge {
    return knowledgeOf(this.raw['self']) ?? 'knows';
  }
  get knows(): string[] {
    return strings(this.raw['knows']);
  }
  get suspects(): string[] {
    return strings(this.raw['suspects']);
  }
  get unaware(): string[] {
    return strings(this.raw['unaware']);
  }
  listed(k: Knowledge): string[] {
    switch (k) {
      case 'knows':
        return this.knows;
      case 'suspects':
        return this.suspects;
      case 'unaware':
        return this.unaware;
    }
  }
  get reader(): Knowledge {
    return knowledgeOf(this.raw['reader']) ?? 'unaware';
  }
  get readerNodeId(): string | null {
    return idOrNull(this.raw['readerNodeId']);
  }
  get firstNodeId(): string | null {
    return idOrNull(this.raw['firstNodeId']);
  }
  get revealNodeId(): string | null {
    return idOrNull(this.raw['revealNodeId']);
  }
  get revealEventId(): string | null {
    return idOrNull(this.raw['revealEventId']);
  }
  get nodeIds(): string[] {
    return strings(this.raw['nodeIds']);
  }
  get threadIds(): string[] {
    return strings(this.raw['threadIds']);
  }
  get notes(): string {
    return str(this.raw['notes']);
  }
  /** How knowledge of it spreads, when the author records it. Missing on older rows. */
  get records(): KnowledgeRecord[] {
    return maps(this.raw['records']).map((r) => new KnowledgeRecord(r));
  }
  get needs(): KnowledgeNeed[] {
    return maps(this.raw['needs']).map((n) => new KnowledgeNeed(n));
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }

  withFields(changes: JsonMap): CharacterSecret {
    return new CharacterSecret(this.merged(changes));
  }
}

/** A loose note about a character. It is not part of the character's established record until the author copies it
 * there. */
export class CharacterNote extends JsonRecord {
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get title(): string {
    return str(this.raw['title']);
  }
  get content(): string {
    return str(this.raw['content']);
  }
  get tags(): string[] {
    return strings(this.raw['tags']);
  }
  get pinned(): boolean {
    return boolOf(this.raw['pinned']);
  }
  /** Chapters and scenes it is about. */
  get nodeIds(): string[] {
    return strings(this.raw['nodeIds']);
  }
  get createdAt(): number {
    return numOrNull(this.raw['createdAt']) ?? 0;
  }
  get updatedAt(): number {
    return numOrNull(this.raw['updatedAt']) ?? 0;
  }
}

/** One line of a character's history. Two kinds, never mixed up:
 *  - `record`: something the author did to the record ("changed Occupation from Soldier to Commander"), written by the
 *    app when it happens;
 *  - `story`: something that happens to the character in the story ("became commander"), which the author writes down
 *    and may tie to a chapter. */
export class CharacterHistoryLine extends JsonRecord {
  get entryId(): string {
    return str(this.raw['entryId']);
  }
  get at(): number {
    return numOrNull(this.raw['at']) ?? 0;
  }
  get isStory(): boolean {
    return this.raw['kind'] === 'story';
  }
  get kind(): string {
    return str(this.raw['kind'], 'record');
  }
  /** For a record line: `created`, `field`, `identity`, `section`, `archived`, `restored`, `portrait`, `template`,
   * `note`. */
  get action(): string {
    return str(this.raw['action']);
  }
  get label(): string {
    return str(this.raw['label']);
  }
  get from(): string {
    return str(this.raw['from']);
  }
  get to(): string {
    return str(this.raw['to']);
  }
  /** A story line's own words. */
  get text(): string {
    return str(this.raw['text']);
  }
  get nodeId(): string | null {
    return idOrNull(this.raw['nodeId']);
  }
}

/** A field a section suggests. Only a suggestion: nothing is stored until the author adds it. */
export class FieldSuggestion {
  constructor(
    readonly name: string,
    readonly type: FieldType = 'text',
    readonly options: readonly string[] = [],
  ) {}

  static fromJson(json: JsonMap): FieldSuggestion {
    return new FieldSuggestion(str(json['name']), fieldTypeOf(json['type']) ?? 'text', strings(json['options']));
  }

  toJson(): JsonMap {
    return { name: this.name, type: this.type, ...(this.options.length > 0 ? { options: [...this.options] } : {}) };
  }
}

export class TemplateSection {
  constructor(
    readonly name: string,
    readonly tab: ProfileTab,
    readonly fields: readonly FieldSuggestion[],
  ) {}

  static fromJson(json: JsonMap): TemplateSection {
    return new TemplateSection(
      str(json['name']),
      profileTabOf(json['tab']),
      maps(json['fields']).map((f) => FieldSuggestion.fromJson(f)),
    );
  }

  toJson(): JsonMap {
    return { name: this.name, tab: this.tab, fields: this.fields.map((f) => f.toJson()) };
  }
}

/** A starting layout for a profile: its sections, and the fields each one offers. The built-in ones have no
 * project. */
export class CharacterTemplate {
  readonly id: string;
  /** Null for the ones that come with the app. */
  readonly projectId: string | null;
  readonly name: string;
  readonly description: string;
  readonly sections: readonly TemplateSection[];
  readonly createdAt: number;
  /** The stored row, for a saved one. */
  readonly raw: JsonMap | null;

  constructor(args: {
    id: string;
    projectId: string | null;
    name: string;
    description: string;
    sections: readonly TemplateSection[];
    createdAt?: number;
    raw?: JsonMap | null;
  }) {
    this.id = args.id;
    this.projectId = args.projectId;
    this.name = args.name;
    this.description = args.description;
    this.sections = args.sections;
    this.createdAt = args.createdAt ?? 0;
    this.raw = args.raw ?? null;
  }

  /** A project's saved layout (a row of `characterTemplates`). */
  static fromJson(json: JsonMap): CharacterTemplate {
    return new CharacterTemplate({
      id: str(json['id']),
      projectId: strOrNull(json['projectId']),
      name: str(json['name']),
      description: str(json['description']),
      sections: maps(json['sections']).map((s) => TemplateSection.fromJson(s)),
      createdAt: numOrNull(json['createdAt']) ?? 0,
      raw: freezeMap(json),
    });
  }

  get builtin(): boolean {
    return this.projectId === null;
  }
}
