// Character changes, as the original app's character service makes them. A port of
// flutter_app/lib/shared/domain/characters/character_changes.dart.
//
// A character is a codex entry in Characters; its profile, secrets, notes and history hang off it by its id. A change
// starts from what was read (a NovelSnapshot holding at least `characterCollections`); operations are applied in
// order, each building on the ones before; `snapshot` is then the novel as it would be. Nothing is stored here: the
// caller saves it against what was read (NovelStore.saveChanges(before, changes.snapshot), as CharacterService.change
// does). A change that cannot be made throws ChangeRefused and the caller stores nothing.

import { ChangeRefused, CodexChanges, cleanList } from '../codex/codexChanges';
import { displayValue } from '../codex/fieldValues';
import { type JsonMap, isMap, listOf, numOrNull, str } from '../json';
import { type DeleteOutcome, planDelete } from '../model/deletePolicy';
import { EntityRef } from '../model/entityRef';
import { stableSorted } from '../reader/stableSort';
import { type FieldType } from '../records/category';
import { type Entry, EntryField } from '../records/entry';
import { maps, strings } from '../records/jsonRecord';
import { Link } from '../records/link';
import { blankSheet, isSystemOn } from '../records/system';
import type { NovelSnapshot } from '../snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import {
  CharacterHistoryLine,
  CharacterNote,
  CharacterProfile,
  CharacterSecret,
  CharacterTemplate,
  type FieldSuggestion,
  type Focal,
  type Knowledge,
  ProfileSection,
  type ProfileTab,
  knowledgeOf,
} from './characterRecords';
import { kindOf, settled } from './fieldKinds';
import { peopleOf } from './knowledge';
import { builtinTemplates, sectionsOf } from './templates';

/** The collections a character change reads and writes (everything but deleting, which reaches further). A change can
 * be made from a snapshot holding only these, so a long book's text and history are not loaded for each edit. */
export const characterCollections: ReadonlySet<string> = new Set([
  'loreEntries',
  'loreSchemas',
  'loreLinks',
  'characterProfiles',
  'characterSecrets',
  'characterNotes',
  'characterHistory',
  'characterTemplates',
  'chapters',
  'timelineEvents',
  // For connections: their ends must exist.
  'plotThreads',
  'characterRelations',
  'systems',
  // A character made in a novel with systems begins with a sheet on each (`create`).
  'systemSheets',
  // The novel's own relationship types and tracked attributes.
  'relationSettings',
  // Dates in story time (a relationship stage's) are read in the novel's calendar.
  'storyCalendars',
]);

/** Changes to who a character is. Only what is given changes. `image` is a box so a portrait can be removed
 * (`{ value: null }`). */
export type IdentityChanges = {
  name?: string;
  summary?: string;
  epithet?: string;
  aliases?: readonly string[];
  roles?: readonly string[];
  status?: string;
  image?: { value: string | null };
  focal?: Focal;
  tags?: readonly string[];
};

/** What refers to a character, for telling the author before they delete one. */
export class CharacterReferences {
  constructor(
    /** By kind, in the order they are told: chapters, relationships, events, threads, links, sheets, snapshots,
     * secrets, inSecrets, notes. */
    readonly counts: ReadonlyMap<string, number>,
  ) {}

  /** Dart's `operator []`: the count of one kind, 0 when none. */
  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  get any(): boolean {
    return [...this.counts.values()].some((n) => n > 0);
  }
}

/** Edits to the same thing within this long are one line of history, from the first value to the last. */
export const sameEditMs = 10 * 60 * 1000;

const knowledgeKeys: readonly Knowledge[] = ['knows', 'suspects', 'unaware'];

function short(text: string): string {
  return (text.length > 90 ? `${text.substring(0, 89)}…` : text).replace(/\s+/g, ' ');
}

/** JavaScript's `Math.round`: halves go up, also below zero (Dart's `_round`). */
function round(n: number): number {
  return Math.floor(n + 0.5);
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const byId = (a: JsonMap, b: JsonMap) => {
  const x = str(a['id']);
  const y = str(b['id']);
  return x < y ? -1 : x > y ? 1 : 0;
};
const cmp = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

/** Character changes, as the original app's character service makes them. */
export class CharacterChanges extends CodexChanges {
  /** The character, or a refusal: only an entry of the Characters category is one. */
  character(entryId: string): Entry {
    const row = this.row('loreEntries', entryId);
    if (row === null || row['category'] !== 'character') throw new ChangeRefused('That character is not in this novel.');
    return this.owned(entryId);
  }

  /** The profile stored for a character (the one with the lowest id, when there are several), or null. */
  stored(entryId: string): CharacterProfile | null {
    const found = stableSorted(
      this.rows('characterProfiles').filter((p) => p['entryId'] === entryId),
      byId,
    );
    return found.length === 0 ? null : new CharacterProfile(found[0]);
  }

  /** The profile of a character that has none stored yet (one made before profiles existed, or in the Codex): the
   * general layout, empty. Nothing is written by asking. */
  fresh(entry: Entry, template?: CharacterTemplate | null): CharacterProfile {
    return freshProfile(entry, this.projectId, template ?? builtinTemplates[0]);
  }

  profileOf(entry: Entry): CharacterProfile {
    return this.stored(entry.id) ?? this.fresh(entry);
  }

  private save(profile: JsonMap): void {
    this.put('characterProfiles', { ...profile, updatedAt: this.now });
  }

  private saveProfile(profile: CharacterProfile, changes: JsonMap = {}): void {
    this.save(profile.merged(changes));
  }

  /** The built-in layouts, then the novel's own, oldest first. */
  templates(): CharacterTemplate[] {
    return [
      ...builtinTemplates,
      ...stableSorted(
        this.rows('characterTemplates')
          .filter((r) => r['projectId'] === this.projectId)
          .map((r) => CharacterTemplate.fromJson(r)),
        (a, b) => cmp(a.createdAt, b.createdAt),
      ),
    ];
  }

  /** Notes a change to the record. Typing in a field is many small saves: they are folded into one line, from the
   * first value to the last, and dropped when the value ends where it began. */
  record(entryId: string, action: string, label: string, from = '', to = ''): void {
    if (action === 'field' || action === 'identity') {
      const mine = this.rows('characterHistory')
        .filter((h) => h['entryId'] === entryId && h['kind'] === 'record' && h['action'] === action && h['label'] === label)
        .map((h) => new CharacterHistoryLine(h));
      const last = stableSorted(mine, (a, b) => cmp(b.at, a.at))[0] ?? null;
      if (last !== null && this.now - last.at < sameEditMs) {
        if (last.from === short(to)) {
          this.remove('characterHistory', last.id);
        } else {
          this.put('characterHistory', last.merged({ to: short(to), at: this.now }));
        }
        return;
      }
      if (short(from) === short(to)) return;
    }
    this.put('characterHistory', {
      id: this.newId(),
      projectId: this.projectId,
      entryId,
      at: this.now,
      kind: 'record',
      action,
      label,
      from: short(from),
      to: short(to),
      text: '',
      nodeId: null,
    });
  }

  /** Changes a profile as it is stored right now, and saves it. */
  private edit(entryId: string, change: (profile: CharacterProfile, entry: Entry) => JsonMap): CharacterProfile {
    const entry = this.character(entryId);
    const next = change(this.profileOf(entry), entry);
    this.save(next);
    return new CharacterProfile({ ...next, updatedAt: this.now });
  }

  private section(profile: CharacterProfile, sectionId: string): ProfileSection {
    const found = profile.sections.find((s) => s.id === sectionId);
    if (found === undefined) throw new ChangeRefused('That section is no longer on the profile.');
    return found;
  }

  private sectionsWith(
    profile: CharacterProfile,
    sectionId: string,
    change: (s: ProfileSection) => JsonMap,
  ): JsonMap[] {
    return profile.sections.map((s) => (s.id === sectionId ? change(s) : s.toJson()));
  }

  private putFields(entry: Entry, fields: unknown[]): void {
    this.putEntry(entry, { fields });
  }

  // ------------------------------------------------------------------------------------------------------ the record

  /** Creates a character: a codex entry in Characters, and its profile. Only a name is needed. `id`, when given, is
   * the new character's permanent id (decided while the casting call was drawn, so they keep its colour). */
  create(args: {
    name: string;
    epithet?: string;
    roles?: readonly string[];
    summary?: string;
    templateId?: string | null;
    id?: string | null;
  }): Entry {
    const { name } = args;
    const epithet = args.epithet ?? '';
    const roles = args.roles ?? [];
    const summary = args.summary ?? '';
    if (dartTrim(name).length === 0) throw new ChangeRefused('Give the character a name.');
    let entry = this.createEntry('character', dartTrim(name), args.id ?? null);
    if (dartTrim(summary).length > 0) {
      this.updateEntry(entry.id, { summary: dartTrim(summary) });
      entry = this.owned(entry.id);
    }
    const template = this.templates().find((t) => t.id === args.templateId) ?? builtinTemplates[0];
    const last = this.rows('characterProfiles').reduce((m, p) => Math.max(m, numOrNull(p['order']) ?? 0), 0);
    this.save(
      this.fresh(entry, template).merged({
        id: this.newId(),
        epithet: dartTrim(epithet),
        roles: cleanList(roles),
        order: Math.max(last + 1, entry.createdAt),
      }),
    );
    this.record(entry.id, 'created', dartTrim(name));
    // In a novel with systems, a character begins with a sheet on each: their status is there in the vault from the
    // start, every number read from the blueprint until the author gives them their own.
    if (Object.prototype.hasOwnProperty.call(this.snapshot.collections, 'systemSheets')) {
      for (const system of this.rows('systems')) {
        if (!isSystemOn(system)) continue;
        const systemId = str(system['id']);
        if (this.rows('systemSheets').some((s) => s['systemId'] === systemId && s['entryId'] === entry.id)) continue;
        this.put(
          'systemSheets',
          blankSheet({ id: this.newId(), projectId: this.projectId, systemId, entryId: entry.id, now: this.now }),
        );
      }
    }
    return this.owned(entry.id);
  }

  /** Changes who the character is: name, summary, portrait and tags on the entry; epithet, aliases, roles, status and
   * portrait focus on the profile. Each change is noted in the character's history. */
  identity(entryId: string, changes: IdentityChanges): void {
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    if (
      changes.name !== undefined ||
      changes.summary !== undefined ||
      changes.image !== undefined ||
      changes.tags !== undefined
    ) {
      const onEntry: { name?: string; summary?: string; image?: { value: string | null }; tags?: readonly string[] } =
        {};
      if (changes.name !== undefined) onEntry.name = changes.name;
      if (changes.summary !== undefined) onEntry.summary = changes.summary;
      if (changes.image !== undefined) onEntry.image = changes.image;
      if (changes.tags !== undefined) onEntry.tags = changes.tags;
      this.updateEntry(entryId, onEntry);
    }
    const focal = changes.focal;
    const onProfile: JsonMap = {};
    if (changes.epithet !== undefined) onProfile['epithet'] = dartTrim(changes.epithet);
    if (changes.aliases !== undefined) onProfile['aliases'] = cleanList(changes.aliases);
    if (changes.roles !== undefined) onProfile['roles'] = cleanList(changes.roles);
    if (changes.status !== undefined) onProfile['status'] = dartTrim(changes.status);
    if (focal !== undefined) onProfile['focal'] = { x: clamp(round(focal.x), 0, 100), y: clamp(round(focal.y), 0, 100) };
    const next = new CharacterProfile(profile.merged(onProfile));
    this.saveProfile(next);
    const said: [string, string, string][] = [];
    if (changes.name !== undefined && dartTrim(changes.name) !== entry.name) {
      said.push(['Name', entry.name, dartTrim(changes.name)]);
    }
    if (changes.summary !== undefined && changes.summary !== entry.summary) {
      said.push(['Summary', entry.summary, changes.summary]);
    }
    if (changes.epithet !== undefined && next.epithet !== profile.epithet) {
      said.push(['Title', profile.epithet, next.epithet]);
    }
    if (changes.aliases !== undefined && next.aliases.join(',') !== profile.aliases.join(',')) {
      said.push(['Aliases', profile.aliases.join(', '), next.aliases.join(', ')]);
    }
    if (changes.roles !== undefined && next.roles.join(',') !== profile.roles.join(',')) {
      said.push(['Role', profile.roles.join(', '), next.roles.join(', ')]);
    }
    if (changes.status !== undefined && next.status !== profile.status) {
      said.push(['Status', profile.status, next.status]);
    }
    for (const [label, from, to] of said) this.record(entryId, 'identity', label, from, to);
    const image = changes.image;
    if (image !== undefined && image.value !== entry.image) {
      this.record(entryId, 'portrait', image.value !== null ? (entry.image !== null ? 'replaced' : 'added') : 'removed');
    }
  }

  /** Puts a character away, or brings it back. Nothing is removed and nothing that refers to it changes. */
  setArchived(entryId: string, archived: boolean): void {
    this.edit(entryId, (profile) => {
      if (profile.archived !== archived) this.record(entryId, archived ? 'archived' : 'restored', '');
      return profile.merged({ archived });
    });
  }

  /** Sets the author's own order of the library. */
  reorder(entryIds: readonly string[]): void {
    entryIds.forEach((entryId, index) => {
      this.saveProfile(this.profileOf(this.character(entryId)), { order: index + 1 });
    });
  }

  // ------------------------------------------------------------------------------------------------------- sections

  addSection(entryId: string, name: string, tab: ProfileTab = 'overview'): void {
    this.edit(entryId, (profile) => {
      if (dartTrim(name).length === 0) throw new ChangeRefused('Give the section a name.');
      this.record(entryId, 'section', dartTrim(name), '', 'added');
      return profile.merged({
        sections: [
          ...profile.sections.map((s) => s.toJson()),
          { id: this.newId(), name: dartTrim(name), tab, hidden: false, fieldIds: [] },
        ],
      });
    });
  }

  updateSection(entryId: string, sectionId: string, changes: { name?: string; hidden?: boolean; tab?: ProfileTab }): void {
    this.edit(entryId, (profile) => {
      this.section(profile, sectionId);
      if (changes.name !== undefined && dartTrim(changes.name).length === 0) {
        throw new ChangeRefused('Give the section a name.');
      }
      return profile.merged({
        sections: this.sectionsWith(profile, sectionId, (s) => {
          const edits: JsonMap = {};
          if (changes.name !== undefined) edits['name'] = dartTrim(changes.name);
          if (changes.hidden !== undefined) edits['hidden'] = changes.hidden;
          if (changes.tab !== undefined) edits['tab'] = changes.tab;
          return s.merged(edits).toJson();
        }),
      });
    });
  }

  /** Moves a section one place earlier (-1) or later (+1) among the sections of its tab. */
  moveSection(entryId: string, sectionId: string, by: number): void {
    this.edit(entryId, (profile) => {
      const sections = profile.sections;
      const here = this.section(profile, sectionId);
      const peers = sections.filter((s) => s.tab === here.tab).map((s) => s.id);
      const at = peers.indexOf(here.id) + by;
      if (at < 0 || at >= peers.length) return profile.toJson();
      const otherId = peers[at];
      const byIdMap = new Map(sections.map((s) => [s.id, s]));
      return profile.merged({
        sections: sections.map((s) => (s.id === here.id ? byIdMap.get(otherId)! : s.id === otherId ? here : s).toJson()),
      });
    });
  }

  /** A copy of a section with the same fields, all empty. */
  duplicateSection(entryId: string, sectionId: string): ProfileSection {
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    const source = this.section(profile, sectionId);
    const fields = entry.fields;
    const copies: JsonMap[] = [];
    for (const id of source.fieldIds) {
      const field = fields.find((f) => f.id === id);
      if (field === undefined) continue;
      const copy: JsonMap = { id: this.newId(), key: field.key, value: '' };
      if (field.raw['type'] !== null && field.raw['type'] !== undefined) copy['type'] = field.raw['type'];
      if (field.options.length > 0) copy['options'] = field.raw['options'];
      copies.push(copy);
    }
    // An empty field is kept by its name; the entry stores it like any other.
    this.putFields(entry, [...listOf(entry.raw['fields']), ...copies]);
    const copy: JsonMap = {
      id: this.newId(),
      name: `${source.name} (copy)`,
      tab: source.tab,
      hidden: false,
      fieldIds: copies.map((c) => c['id']),
    };
    const at = profile.sections.findIndex((s) => s.id === sectionId) + 1;
    const sections = profile.sections.map((s) => s.toJson());
    sections.splice(at, 0, copy);
    this.saveProfile(profile, { sections });
    return new ProfileSection(copy);
  }

  /** Takes a section off the profile. With `deleteFields` its fields and what was written in them go too; without,
   * they stay on the character and are listed under the fields that have no section. */
  removeSection(entryId: string, sectionId: string, options: { deleteFields?: boolean } = {}): void {
    const deleteFields = options.deleteFields ?? false;
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    const gone = this.section(profile, sectionId);
    if (deleteFields) {
      this.putFields(
        entry,
        listOf(entry.raw['fields']).filter((f) => !(isMap(f) && gone.fieldIds.includes(f['id'] as string))),
      );
    }
    this.saveProfile(profile, {
      sections: profile.sections.filter((s) => s.id !== sectionId).map((s) => s.toJson()),
    });
    this.record(entryId, 'section', gone.name, '', deleteFields ? 'removed with its fields' : 'removed');
  }

  /** Adds the sections of a template that the profile does not have yet (matched by name). Nothing already there is
   * changed or removed. */
  applyTemplate(entryId: string, templateId: string): void {
    this.edit(entryId, (profile) => {
      const template = this.templates().find((t) => t.id === templateId);
      if (template === undefined) throw new ChangeRefused('That template is no longer there.');
      const have = new Set(profile.sections.map((s) => dartToLowerCase(dartTrim(s.name))));
      const added = sectionsOf(template)
        .filter((s) => !have.has(dartToLowerCase(dartTrim(str(s['name'])))))
        .map((s) => ({ ...s, id: this.newId() }));
      this.record(
        entryId,
        'template',
        template.name,
        '',
        `${added.length} ${added.length === 1 ? 'section' : 'sections'} added`,
      );
      return profile.merged({ sections: [...profile.sections.map((s) => s.toJson()), ...added] });
    });
  }

  /** Saves this profile's layout (its sections and the names and types of their fields, not what is written in them)
   * for use on the novel's other characters. */
  saveTemplate(entryId: string, name: string): CharacterTemplate {
    if (dartTrim(name).length === 0) throw new ChangeRefused('Give the template a name.');
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    const fields = entry.fields;
    const template: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      name: dartTrim(name),
      description: `Saved from ${entry.name}.`,
      createdAt: this.now,
      sections: profile.sections.map((s) => ({
        name: s.name,
        tab: s.tab,
        fields: s.fieldIds.flatMap((id) => {
          const f = fields.find((x) => x.id === id);
          if (f === undefined || dartTrim(f.key).length === 0) return [];
          return [
            {
              name: f.key,
              type: f.raw['type'] ?? 'text',
              ...(f.options.length > 0 ? { options: f.raw['options'] } : {}),
            },
          ];
        }),
      })),
    };
    this.put('characterTemplates', template);
    return CharacterTemplate.fromJson(template);
  }

  removeTemplate(templateId: string): void {
    const template = this.row('characterTemplates', templateId);
    if (template !== null && template['projectId'] === this.projectId) this.remove('characterTemplates', templateId);
  }

  // ------------------------------------------------------------------- fields (on the entry, where the Codex shows them)

  /** Adds a field to a section, with its first value. Returns the field as stored. */
  addField(entryId: string, sectionId: string, field: FieldSuggestion, options: { value?: string } = {}): JsonMap {
    const value = options.value ?? '';
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    this.section(profile, sectionId);
    if (dartTrim(field.name).length === 0) throw new ChangeRefused('Give the field a name.');
    // A field whose answer has a known shape (a Gender is chosen, an Age a number: fieldKinds.ts) is made that way when
    // nothing else is asked for, and its value read as its choice.
    const kind = field.type === 'text' ? kindOf(field.name) : null;
    const type = kind?.type ?? field.type;
    const choices = field.options.length > 0 ? field.options : (kind?.options ?? []);
    const made: JsonMap = { id: this.newId(), key: dartTrim(field.name), value: settled(kind, value) };
    if (type !== 'text') made['type'] = type;
    if (choices.length > 0) made['options'] = cleanList(choices);
    this.putFields(entry, [...listOf(entry.raw['fields']), made]);
    this.saveProfile(profile, {
      sections: this.sectionsWith(profile, sectionId, (s) => s.merged({ fieldIds: [...s.fieldIds, made['id']] }).toJson()),
    });
    return made;
  }

  /** Changes a field's name, type, choices or value. A change of value is noted in the character's history, as a
   * reader would read it (a linked entry by its name). */
  updateField(
    entryId: string,
    fieldId: string,
    changes: { key?: string; value?: string; type?: FieldType | null; options?: readonly string[] | null },
  ): void {
    const entry = this.character(entryId);
    const field = entry.fields.find((f) => f.id === fieldId);
    if (field === undefined) throw new ChangeRefused('That field is no longer on the character.');
    const { key, value } = changes;
    const type = changes.type ?? null;
    const options = changes.options ?? null;
    if (key !== undefined && dartTrim(key).length === 0 && field.defId === null) {
      throw new ChangeRefused('Give the field a name.');
    }
    const next: JsonMap = { ...field.raw };
    if (key !== undefined && field.defId === null) next['key'] = dartTrim(key);
    if (value !== undefined) next['value'] = value;
    if (type !== null) next['type'] = type;
    if (options !== null) next['options'] = cleanList(options);
    this.putFields(
      entry,
      listOf(entry.raw['fields']).map((f) => (isMap(f) && f['id'] === fieldId ? next : f)),
    );
    if (value !== undefined && value !== field.value) {
      const names = new Map<string, string>();
      for (const e of this.rows('loreEntries')) names.set(str(e['id']), str(e['name']));
      const shown = (v: string) => displayValue(new EntryField(next).type, v, (id) => names.get(id) ?? null);
      const label = str(next['key']);
      this.record(entryId, 'field', label.length > 0 ? label : 'A field', shown(field.value), shown(value));
    }
  }

  /** Moves a field one place within its section (`by` -1 or +1), or to the end of another section (`toSection`). */
  moveField(entryId: string, fieldId: string, move: { by?: number; toSection?: string }): void {
    this.edit(entryId, (profile) => {
      if (move.by !== undefined) {
        const from = profile.sections.find((s) => s.fieldIds.includes(fieldId));
        if (from === undefined) return profile.toJson();
        const ids = [...from.fieldIds];
        const at = ids.indexOf(fieldId);
        const swap = at + move.by;
        if (swap < 0 || swap >= ids.length) return profile.toJson();
        const moving = ids[at];
        ids[at] = ids[swap];
        ids[swap] = moving;
        return profile.merged({
          sections: this.sectionsWith(profile, from.id, (s) => s.merged({ fieldIds: ids }).toJson()),
        });
      }
      const toSection = move.toSection;
      // Dart's `toSection!`: one of the two must be given.
      if (toSection === undefined) throw new TypeError('Null check operator used on a null value');
      this.section(profile, toSection);
      return profile.merged({
        sections: profile.sections.map((s) =>
          s
            .merged({
              fieldIds: [...s.fieldIds.filter((id) => id !== fieldId), ...(s.id === toSection ? [fieldId] : [])],
            })
            .toJson(),
        ),
      });
    });
  }

  removeField(entryId: string, fieldId: string): void {
    const entry = this.character(entryId);
    const profile = this.profileOf(entry);
    const field = entry.fields.find((f) => f.id === fieldId) ?? null;
    this.putFields(
      entry,
      listOf(entry.raw['fields']).filter((f) => !(isMap(f) && f['id'] === fieldId)),
    );
    this.saveProfile(profile, {
      sections: profile.sections.map((s) => s.merged({ fieldIds: s.fieldIds.filter((id) => id !== fieldId) }).toJson()),
    });
    if (field !== null && dartTrim(field.value).length > 0) {
      this.record(entryId, 'field', field.key.length > 0 ? field.key : 'A field', short(field.value), 'removed');
    }
  }

  /** Records how a link to another entry stands (Active, Former, Secret…). The link itself belongs to the Codex. */
  setLinkStatus(entryId: string, linkId: string, status: string): void {
    this.edit(entryId, (profile) => {
      const linkStatus: JsonMap = {};
      for (const [k, v] of profile.linkStatus) linkStatus[k] = v;
      linkStatus[linkId] = dartTrim(status);
      return profile.merged({ linkStatus });
    });
  }

  // -------------------------------------------------------------------------------------------------------- secrets

  /** A character's secrets, oldest first. */
  secrets(entryId: string): CharacterSecret[] {
    return stableSorted(
      this.rows('characterSecrets')
        .filter((r) => r['entryId'] === entryId)
        .map((r) => new CharacterSecret(r)),
      (a, b) => cmp(a.createdAt, b.createdAt),
    );
  }

  /** Creates (`secretId` null) or changes a secret. `changes` holds only what changes, by its stored name. A character
   * knows, suspects or is unaware: the list changed last wins, the secret's own character is in none of them, and
   * someone whose knowledge has a recorded history is kept in it. */
  saveSecret(entryId: string, secretId: string | null, changes: JsonMap): CharacterSecret {
    this.character(entryId);
    const was = secretId === null ? null : this.row('characterSecrets', secretId);
    if (secretId !== null && (was === null || was['entryId'] !== entryId)) {
      throw new ChangeRefused('That secret is no longer there.');
    }
    const base: JsonMap = was ?? {
      id: this.newId(),
      projectId: this.projectId,
      entryId,
      title: '',
      description: '',
      status: 'Hidden',
      self: 'knows',
      knows: [],
      suspects: [],
      unaware: [],
      reader: 'unaware',
      readerNodeId: null,
      firstNodeId: null,
      revealNodeId: null,
      revealEventId: null,
      nodeIds: [],
      threadIds: [],
      notes: '',
      records: [],
      needs: [],
      createdAt: this.now,
      updatedAt: this.now,
    };
    const next: JsonMap = { ...base, ...changes, updatedAt: this.now };
    const title = dartTrim(str(next['title']));
    if (title.length === 0) throw new ChangeRefused('Give the secret a title.');
    const lists = new Map<Knowledge, string[]>();
    for (const k of knowledgeKeys) lists.set(k, cleanList(listOf(next[k])));
    for (const moved of knowledgeKeys.filter((k) => Object.prototype.hasOwnProperty.call(changes, k))) {
      for (const other of knowledgeKeys.filter((k) => k !== moved)) {
        lists.set(
          other,
          lists.get(other)!.filter((id) => !lists.get(moved)!.includes(id)),
        );
      }
    }
    const recorded = new Set(maps(next['records']).map((r) => str(r['characterId'])));
    const added = knowledgeKeys.flatMap((k) =>
      strings(changes[k]).filter((id) => recorded.has(id) && !strings(base[k]).includes(id)),
    );
    if (added.length > 0) {
      throw new ChangeRefused('That character’s knowledge has a recorded history: add a record to it instead.');
    }
    const knowledge = (value: unknown, fallback: string) => knowledgeOf(value) ?? fallback;
    const tidy: JsonMap = { ...next, title };
    for (const k of knowledgeKeys) tidy[k] = lists.get(k)!.filter((id) => id !== entryId && !recorded.has(id));
    tidy['self'] = knowledge(next['self'], 'knows');
    tidy['reader'] = knowledge(next['reader'], 'unaware');
    tidy['nodeIds'] = cleanList(listOf(next['nodeIds']));
    tidy['threadIds'] = cleanList(listOf(next['threadIds']));
    this.put('characterSecrets', tidy);
    return new CharacterSecret(tidy);
  }

  removeSecret(secretId: string): void {
    if (this.row('characterSecrets', secretId) !== null) this.remove('characterSecrets', secretId);
  }

  // ---------------------------------------------------------------------------------------------------------- notes

  /** Pinned first, then the most recently changed. */
  notes(entryId: string): CharacterNote[] {
    return stableSorted(
      this.rows('characterNotes')
        .filter((r) => r['entryId'] === entryId)
        .map((r) => new CharacterNote(r)),
      (a, b) => {
        const pinned = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return pinned !== 0 ? pinned : cmp(b.updatedAt, a.updatedAt);
      },
    );
  }

  /** Creates (`noteId` null) or changes a note. Only what is given changes. */
  saveNote(
    entryId: string,
    noteId: string | null,
    changes: {
      title?: string;
      content?: string;
      tags?: readonly string[];
      pinned?: boolean;
      nodeIds?: readonly string[];
    } = {},
  ): CharacterNote {
    this.character(entryId);
    const was = noteId === null ? null : this.row('characterNotes', noteId);
    if (noteId !== null && (was === null || was['entryId'] !== entryId)) {
      throw new ChangeRefused('That note is no longer there.');
    }
    const next: JsonMap = {
      ...(was ?? {
        id: this.newId(),
        projectId: this.projectId,
        entryId,
        title: '',
        content: '',
        tags: [],
        pinned: false,
        nodeIds: [],
        createdAt: this.now,
        updatedAt: this.now,
      }),
    };
    if (changes.title !== undefined) next['title'] = changes.title;
    if (changes.content !== undefined) next['content'] = changes.content;
    if (changes.tags !== undefined) next['tags'] = [...changes.tags];
    if (changes.pinned !== undefined) next['pinned'] = changes.pinned;
    if (changes.nodeIds !== undefined) next['nodeIds'] = [...changes.nodeIds];
    next['updatedAt'] = this.now;
    const theTitle = dartTrim(str(next['title']));
    const theContent = dartTrim(str(next['content']));
    if (theTitle.length === 0 && theContent.length === 0) throw new ChangeRefused('Write the note first.');
    const firstLine = theContent.split('\n')[0];
    const tidy: JsonMap = {
      ...next,
      title: theTitle.length > 0 ? theTitle : firstLine.length > 60 ? firstLine.substring(0, 60) : firstLine,
      tags: cleanList(listOf(next['tags'])),
      nodeIds: cleanList(listOf(next['nodeIds'])),
    };
    this.put('characterNotes', tidy);
    return new CharacterNote(tidy);
  }

  removeNote(noteId: string): void {
    if (this.row('characterNotes', noteId) !== null) this.remove('characterNotes', noteId);
  }

  /** Copies a note into the character's record, as a long-text field. The only way a note becomes part of what is
   * established about a character, and only when the author asks. The note itself is kept. Returns the field. */
  promoteNote(noteId: string, sectionId: string, fieldName: string): JsonMap {
    const noteRow = this.row('characterNotes', noteId);
    if (noteRow === null) throw new ChangeRefused('That note is no longer there.');
    const note = new CharacterNote(noteRow);
    const entry = this.character(note.entryId);
    const profile = this.profileOf(entry);
    this.section(profile, sectionId);
    if (dartTrim(fieldName).length === 0) throw new ChangeRefused('Say which field it goes into.');
    const made: JsonMap = {
      id: this.newId(),
      key: dartTrim(fieldName),
      value: dartTrim(note.content),
      type: 'longtext',
    };
    this.putFields(entry, [...listOf(entry.raw['fields']), made]);
    this.saveProfile(profile, {
      sections: this.sectionsWith(profile, sectionId, (s) => s.merged({ fieldIds: [...s.fieldIds, made['id']] }).toJson()),
    });
    this.record(entry.id, 'note', dartTrim(fieldName), '', `copied from the note “${note.title}”`);
    return made;
  }

  // -------------------------------------------------------------------------------------------------------- history

  /** Newest first. */
  history(entryId: string): CharacterHistoryLine[] {
    return stableSorted(
      this.rows('characterHistory')
        .filter((r) => r['entryId'] === entryId)
        .map((r) => new CharacterHistoryLine(r)),
      (a, b) => cmp(b.at, a.at),
    );
  }

  /** Writes down something that happens to the character in the story, optionally at a chapter. */
  addMilestone(entryId: string, text: string, nodeId: string | null = null): CharacterHistoryLine {
    this.character(entryId);
    if (dartTrim(text).length === 0) throw new ChangeRefused('Say what happens.');
    const line: JsonMap = {
      id: this.newId(),
      projectId: this.projectId,
      entryId,
      at: this.now,
      kind: 'story',
      action: 'milestone',
      label: '',
      from: '',
      to: '',
      text: dartTrim(text),
      nodeId: nodeId !== null && this.row('chapters', nodeId) !== null ? nodeId : null,
    };
    this.put('characterHistory', line);
    return new CharacterHistoryLine(line);
  }

  /** Only the author's own story lines can be removed; the record of changes cannot. */
  removeMilestone(historyId: string): void {
    const line = this.row('characterHistory', historyId);
    if (line !== null && line['kind'] === 'story') this.remove('characterHistory', historyId);
  }
}

/** The empty profile of `entry` in `template`'s layout, as the original app makes one for a character without a
 * stored profile. Its id is worked out from the entry's, so asking twice gives the same profile. */
export function freshProfile(entry: Entry, projectId: string, template: CharacterTemplate): CharacterProfile {
  return new CharacterProfile({
    id: `profile-${entry.id}`,
    projectId,
    entryId: entry.id,
    epithet: '',
    aliases: [],
    roles: [],
    status: '',
    archived: false,
    focal: { x: 50, y: 30 },
    order: entry.createdAt,
    sections: sectionsOf(template),
    linkStatus: {},
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
  });
}

/** Everything in the novel that refers to this character. Reads only. `s` must hold the whole novel. */
export function referencesTo(s: NovelSnapshot, entryId: string): CharacterReferences {
  const count = (collection: string, test: (row: JsonMap) => boolean) => s.rows(collection).filter(test).length;
  const secrets = s.rows('characterSecrets').map((r) => new CharacterSecret(r));
  return new CharacterReferences(
    new Map([
      ['chapters', count('chapters', (n) => strings(n['mentions']).includes(entryId))],
      ['relationships', count('characterRelations', (r) => r['fromId'] === entryId || r['toId'] === entryId)],
      [
        'events',
        count(
          'timelineEvents',
          (e) => maps(e['characters']).some((c) => c['id'] === entryId) || strings(e['entryIds']).includes(entryId),
        ),
      ],
      ['threads', count('plotThreads', (t) => strings(t['characterIds']).includes(entryId))],
      [
        'links',
        s
          .rows('loreLinks')
          .map((r) => new Link(r))
          .filter((l) => l.isEntryLink && (l.fromId === entryId || l.toId === entryId)).length,
      ],
      ['sheets', count('systemSheets', (r) => r['entryId'] === entryId)],
      ['snapshots', count('progressSnapshots', (r) => r['entryId'] === entryId)],
      ['secrets', secrets.filter((x) => x.entryId === entryId).length],
      ['inSecrets', secrets.filter((x) => x.entryId !== entryId && peopleOf(x).includes(entryId)).length],
      ['notes', count('characterNotes', (r) => r['entryId'] === entryId)],
    ]),
  );
}

/** Deleting a character for good, as the original app does it: other characters' secrets drop the character from who
 * knows or suspects, and their knowledge records and marks (a record of someone learning it from them keeps
 * everything but who it was from); then the entry goes the way every entry does (planDelete): with its links,
 * relationships, profile, secrets, notes and history. The manuscript's words are not touched; a linked name stays,
 * pointing at nothing. `s` must hold the whole novel. Store `.snapshot` with NovelStore.saveChanges(s, …), after
 * keeping a restore point (CharacterService.delete does both). */
export function planCharacterDelete(s: NovelSnapshot, entryId: string): DeleteOutcome {
  const entry = s.rows('loreEntries').find((r) => r['id'] === entryId);
  if (entry === undefined || entry['category'] !== 'character') {
    throw new ChangeRefused('That character is not in this novel.');
  }
  const secrets = s.rows('characterSecrets').map((r) => {
    const secret = new CharacterSecret(r);
    if (secret.entryId === entryId || !peopleOf(secret).includes(entryId)) return r;
    const changes: JsonMap = {};
    for (const k of knowledgeKeys) changes[k] = secret.listed(k).filter((id) => id !== entryId);
    changes['records'] = maps(r['records'])
      .filter((rec) => rec['characterId'] !== entryId)
      .map((rec) => (rec['fromId'] === entryId ? { ...rec, fromId: null } : rec));
    changes['needs'] = maps(r['needs']).filter((n) => n['characterId'] !== entryId);
    return secret.merged(changes);
  });
  return planDelete(s.withRows('characterSecrets', secrets), new EntityRef('entry', entryId));
}
