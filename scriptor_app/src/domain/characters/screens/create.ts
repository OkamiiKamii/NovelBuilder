// THE CASTING CALL: a new character starts as their portrait card, as it will hang on the cast wall, and fills in
// while the author types: the monogram on the colour they will keep (their id is decided now, so it is theirs from the
// first letter), the name, the epithet, the roles and a line about them. "Add to the cast" makes them and opens their
// profile. The pure parts of flutter_app/lib/features/characters/new_character_dialog.dart and of `newCharacter` and
// the addresses in character_actions.dart.

import { newId } from '../../ids';
import { type Entry } from '../../records/entry';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';
import { type CharacterTemplate, characterRoles } from '../characterRecords';
import { recordFromLine } from '../fromLine';
import { type CastMember, type LineTie, type OneLine, readOneLine } from '../oneLine';
import { typeFor } from '../../relationships/relationTypes';

/** Where a character's profile is. */
export function characterPath(entryId: string, options: { tab?: string | null } = {}): string {
  const tab = options.tab ?? null;
  return `/organize/character/${entryId}${tab === null ? '' : `?tab=${tab}`}`;
}

/** Where an entry of the world is: a character's profile, or its page under World. */
export function entryPath(entryId: string, options: { character: boolean }): string {
  return options.character ? characterPath(entryId) : `/organize/world/entry/${entryId}`;
}

/** What the casting call gives: who to make, and what their line said. */
export type NewCharacter = {
  id: string;
  name: string;
  epithet: string;
  roles: string[];
  summary: string;
  templateId: string;
  /** What the line said that the profile records as fields: Age, Gender, Species, Occupation, Place of Origin. */
  fields: Map<string, string>;
  /** Ties the line named to characters already in the cast. */
  ties: LineTie[];
};

export const castingCallWords = {
  title: 'A new character',
  line: 'Write them in a line',
  lineHint: 'Mira Vance, 34, a smuggler from Glass River, Kai’s sister',
  lineHelper: 'Name first, then whatever you know; or fill in the fields below.',
  alsoRecorded: 'Also recorded:',
  name: 'Name *',
  nameError: 'Give the character a name.',
  forgeName: 'Forge a name',
  epithet: 'Title or epithet',
  epithetHint: 'The Last Heir',
  roles: 'Narrative role (one or several)',
  summary: 'Summary',
  summaryHint: 'Who they are, in a line or two',
  layout: 'Profile layout',
  cancel: 'Cancel',
  add: 'Add to the cast',
  /** On the card while no name is written. */
  noName: 'Their name',
} as const;

/** The casting call's state: what is typed, the line as read, and what "Add to the cast" gives. Every setter is what a
 * field's change does; the line fills in the name, epithet, role and summary as it is typed, and they can still be
 * changed by hand. */
export class CastingCall {
  /** The new character's id, decided now: the card is drawn in the colour it gives (castTone). */
  readonly id: string;
  name = '';
  epithet = '';
  summary = '';
  line = '';
  readonly roles = new Set<string>();
  templateId: string;
  /** "Add to the cast" was pressed: a missing name is said from then on. */
  tried = false;
  /** What the line says, read as it is typed. */
  read: OneLine | null = null;

  constructor(
    readonly templates: readonly CharacterTemplate[],
    readonly cast: readonly CastMember[] = [],
    options: {
      /** What the line begins with, the name still to be written in front of it (", Wren's rival", from an empty
       * chair). */
      line?: string | null;
      id?: string;
    } = {},
  ) {
    this.id = options.id ?? newId();
    this.templateId = templates[0].id;
    const line = options.line ?? null;
    // Begun from an empty chair: the line says who they are to the lead, and the cursor waits for their name.
    if (line !== null && dartTrim(line).length > 0) {
      this.line = line;
      // Read as if a name stood in front, so what follows is read as what it is (a tie, a role) and not taken for the
      // name; the name is left for the author.
      this.apply(readOneLine(`Someone${line}`, { cast }));
      this.name = '';
    }
  }

  /** The line typed: what it says fills in the rest. */
  lineChanged(text: string): void {
    this.line = text;
    this.apply(dartTrim(text).length === 0 ? null : readOneLine(text, { cast: this.cast }));
  }

  private apply(read: OneLine | null): void {
    this.read = read;
    if (read === null) return;
    this.name = read.name;
    if (read.epithet.length > 0) this.epithet = read.epithet;
    if (read.role.length > 0) this.roles.add(read.role);
    if (read.summary.length > 0) this.summary = read.summary;
  }

  /** A role chip pressed. */
  setRole(role: string, on: boolean): void {
    if (on) this.roles.add(role);
    else this.roles.delete(role);
  }

  /** The roles chosen, in the default roles' order (the only ones offered). */
  get chosenRoles(): string[] {
    return characterRoles.filter((r) => this.roles.has(r));
  }

  /** What the line said that becomes fields, in this order. */
  get fields(): Map<string, string> {
    const r = this.read;
    const out = new Map<string, string>();
    if (r === null) return out;
    if (r.age.length > 0) out.set('Age', r.age);
    if (r.gender.length > 0) out.set('Gender', r.gender);
    if (r.species.length > 0) out.set('Species', r.species);
    if (r.occupation.length > 0) out.set('Occupation', r.occupation);
    if (r.origin.length > 0) out.set('Place of Origin', r.origin);
    return out;
  }

  /** "Also recorded:" chips: each field (Place of Origin said "From") and each tie (its kind and who), as
   * [what, value]. */
  get also(): [string, string][] {
    return [
      ...[...this.fields].map(([key, value]): [string, string] => [key === 'Place of Origin' ? 'From' : key, value]),
      ...(this.read?.ties ?? []).map((t): [string, string] => [typeFor(t.preset).label, t.otherName]),
    ];
  }

  /** The layout chosen (its description is the field's helper). */
  get template(): CharacterTemplate {
    return this.templates.find((t) => t.id === this.templateId)!;
  }

  /** Under the name: the error, once Add was pressed with none. */
  get nameError(): string | null {
    return this.tried && dartTrim(this.name).length === 0 ? castingCallWords.nameError : null;
  }

  /** The card as drawn from what is typed so far. */
  get preview(): { id: string; name: string; named: boolean; epithet: string; summary: string; roles: string | null } {
    const name = dartTrim(this.name);
    const roles = this.chosenRoles;
    return {
      id: this.id,
      name: name.length === 0 ? castingCallWords.noName : name,
      named: name.length > 0,
      epithet: dartTrim(this.epithet),
      summary: dartTrim(this.summary),
      roles: roles.length === 0 ? null : dartToUpperCase(roles.join(' · ')),
    };
  }

  /** "Add to the cast": the character to make, or null (and the name's error shown) while there is no name. */
  submit(): NewCharacter | null {
    this.tried = true;
    if (dartTrim(this.name).length === 0) return null;
    return {
      id: this.id,
      name: dartTrim(this.name),
      epithet: dartTrim(this.epithet),
      roles: this.chosenRoles,
      summary: dartTrim(this.summary),
      templateId: this.templateId,
      fields: this.fields,
      ties: this.read?.ties ?? [],
    };
  }
}

/** Makes the character the casting call gave, in one change: the character (with the id the card was drawn with, so
 * they keep its colour), what their line said as fields, and the ties it named. In a novel with systems they begin
 * with a sheet on each. Then open their page (characterPath). Run inside CharacterService.change. */
export function makeNewCharacter(c: CharacterChanges, made: NewCharacter): Entry {
  const entry = c.create({
    name: made.name,
    epithet: made.epithet,
    roles: made.roles,
    summary: made.summary,
    templateId: made.templateId,
    id: made.id,
  });
  recordFromLine(c, entry.id, made.fields, made.ties);
  return entry;
}
