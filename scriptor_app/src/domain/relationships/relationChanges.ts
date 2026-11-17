// Relationship changes, as the original app's relationship service makes them. A port of
// flutter_app/lib/shared/domain/relationships/relation_changes.dart.
//
// A relationship is its own record between two characters, with a history of stages: a change adds a stage and never
// alters another. As every change here, it builds a new snapshot (`snapshot`), which the caller saves against what was
// read (NovelStore.saveChanges(before, changes.snapshot)); a change that cannot be made throws ChangeRefused.
//
// As in the Flutter app, RelationChanges extends CharacterChanges (characters/characterChanges.ts), so the first tie
// can make its characters (`create`) in the same change.

import { ChangeRefused } from '../codex/codexChanges';
import { CharacterChanges } from '../characters/characterChanges';
import { type JsonMap, deepCopy, mapOrNull, str } from '../json';
import { Calendar } from '../records/calendar';
import { Link } from '../records/link';
import { CharacterRelation, RelationStage } from '../records/relation';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { normalizeDate } from '../timeline/dates';
import {
  type Affinity,
  type RelationCategory,
  type RelationPreset,
  RelationSettings,
  RelationType,
  TrackedAttribute,
  attributeMax,
  relationPresets,
  suggestedAttributes,
  typeFor,
  typePrefix,
} from './relationTypes';

const same = (a: string, b: string) => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));

/** One tracked attribute's change on a stage: each way a value from 0 to 10, or null for "not said"; only a side whose
 * `set…` is true changes. */
export type AttributeInput = { from: number | null; to: number | null; setFrom: boolean; setTo: boolean };

/** Changes to a stage. Only what is given changes; `attributes` may give one way at a time. A field given as
 * `{ value }` can be set to null (`{ value: null }`), which is not the same as leaving it out. */
export type StageInput = {
  preset?: string;
  label?: string;
  fromRole?: string;
  toRole?: string;
  directional?: boolean;
  category?: RelationCategory;
  title?: string;
  affinity?: Affinity;
  /** What happened to bring it about, in the author's words. */
  event?: string;
  notes?: string;
  /** By attribute key. */
  attributes?: ReadonlyMap<string, AttributeInput>;
  /** Where the reader meets it: a volume, arc or chapter (`{ value: null }` = the start of the story). */
  start?: { value: string | null };
  /** True: where the reader meets it is not said. False: it is. */
  startUnknown?: boolean;
  /** When it changes in story time: at an event (`{ value: null }` = not said). */
  storyEventId?: { value: string | null };
  /** When it changes in story time, as a date as rough as the author knows it; an undated one clears it. */
  storyDate?: { value: JsonMap | null };
  /** What brought it about (an event), and where it is shown (a chapter or scene): only what the author names. */
  causeEventId?: { value: string | null };
  causeNodeId?: { value: string | null };
};

export class RelationChanges extends CharacterChanges {
  private get settingsRow(): JsonMap | null {
    return this.rows('relationSettings')[0] ?? null;
  }

  get settings(): RelationSettings {
    return new RelationSettings(this.settingsRow);
  }

  private saveSettings(changes: JsonMap): void {
    const row = this.settingsRow;
    this.put('relationSettings', {
      types: [],
      hidden: [],
      attributes: [],
      ...(row ?? {}),
      id: row?.['id'] ?? this.newId(),
      projectId: this.projectId,
      ...changes,
      updatedAt: this.now,
    });
  }

  relationOf(relationId: string): CharacterRelation {
    const row = this.row('characterRelations', relationId);
    if (row === null) throw new ChangeRefused('That relationship is no longer in this novel.');
    return new CharacterRelation(row);
  }

  private saveStages(relation: CharacterRelation, stages: readonly JsonMap[]): void {
    this.put('characterRelations', relation.merged({ stages, updatedAt: this.now }));
  }

  private validStart(nodeId: string | null | undefined): string | null {
    return nodeId !== null && nodeId !== undefined && this.row('chapters', nodeId) !== null ? nodeId : null;
  }

  private ownEvent(id: string | null | undefined): string | null {
    return id !== null && id !== undefined && this.row('timelineEvents', id) !== null ? id : null;
  }

  private typeOf(key: string): RelationPreset {
    const types = this.settings.types;
    if (key.startsWith(typePrefix) && !types.some((t) => t.key === key)) {
      throw new ChangeRefused('That relationship type no longer exists.');
    }
    return typeFor(key, types);
  }

  private wording(p: RelationPreset): JsonMap {
    return {
      preset: p.key,
      category: p.category,
      label: p.label,
      fromRole: p.fromRole,
      toRole: p.toRole,
      directional: p.directional,
    };
  }

  private newStage(preset: RelationPreset, startNodeId: string | null): JsonMap {
    return {
      id: this.newId(),
      startNodeId,
      ...this.wording(preset),
      label: preset.key === 'custom' ? '' : preset.label,
      title: '',
      affinity: 'neutral',
      event: '',
      notes: '',
    };
  }

  /** Every stage of every relationship using a type, given new wording. */
  private restage(key: string, wording: JsonMap): void {
    for (const r of this.rows('characterRelations')) {
      const relation = new CharacterRelation(r);
      if (!relation.stages.some((s) => s.preset === key)) continue;
      this.saveStages(
        relation,
        relation.stages.map((s) => (s.preset === key ? { ...s.raw, ...wording } : s.raw)),
      );
    }
  }

  // ------------------------------------------------------------------------------------------------------ settings

  /** Makes (`typeId` null) or changes a type of the novel's own. Its name must be new; a one-way type needs both
   * roles. Changing a type re-words every stage that uses it. */
  saveType(args: {
    label?: string | null;
    category?: RelationCategory | null;
    directional?: boolean | null;
    fromRole?: string | null;
    toRole?: string | null;
    typeId?: string | null;
  }): RelationType {
    const typeId = args.typeId ?? null;
    const current = this.settings;
    const was = typeId === null ? null : (current.types.find((t) => t.id === typeId) ?? null);
    if (typeId !== null && was === null) throw new ChangeRefused('That relationship type no longer exists.');
    const name = dartTrim(args.label ?? was?.label ?? '');
    if (name.length === 0) throw new ChangeRefused('Give the type a name.');
    if (
      relationPresets.some((p) => p.key !== 'custom' && same(p.label, name)) ||
      current.types.some((t) => t.id !== typeId && same(t.label, name))
    ) {
      throw new ChangeRefused(`There is already a type called “${name}”.`);
    }
    const oneWay = args.directional ?? was?.directional ?? false;
    const first = dartTrim(args.fromRole ?? was?.fromRole ?? '');
    const second = dartTrim(args.toRole ?? was?.toRole ?? '');
    if (oneWay && (first.length === 0 || second.length === 0)) {
      throw new ChangeRefused('A one-way type needs both roles: what the first character is, and what the second is.');
    }
    const type: JsonMap = {
      id: was?.id ?? this.newId(),
      label: name,
      category: args.category ?? was?.category ?? 'custom',
      directional: oneWay,
      fromRole: first.length > 0 ? first : name,
      toRole: oneWay ? second : first.length > 0 ? first : name,
    };
    this.saveSettings({
      types:
        was === null
          ? [...current.types.map((t) => t.raw), type]
          : current.types.map((t) => (t.id === was.id ? type : t.raw)),
    });
    const made = new RelationType(type);
    if (was !== null) this.restage(made.key, this.wording(typeFor(made.key, [made])));
    return made;
  }

  /** Deletes a type of the novel's own. Relationships that used it keep their wording, as Custom. */
  removeType(typeId: string): void {
    const current = this.settings;
    if (!current.types.some((t) => t.id === typeId)) return;
    this.saveSettings({ types: current.types.filter((t) => t.id !== typeId).map((t) => t.raw) });
    this.restage(`${typePrefix}${typeId}`, { preset: 'custom' });
  }

  /** Whether a built-in type is offered when choosing a type. Hiding one changes no relationship that uses it. */
  offerBuiltIn(presetKey: string, args: { offered: boolean }): void {
    if (presetKey === 'custom' || !relationPresets.some((p) => p.key === presetKey)) return;
    const hidden = this.settings.hidden;
    this.saveSettings({
      hidden: args.offered ? hidden.filter((k) => k !== presetKey) : [...new Set([...hidden, presetKey])],
    });
  }

  /** Starts tracking an attribute: a suggested one by its key or name, or one of the author's own by its name. */
  trackAttribute(keyOrLabel: string): TrackedAttribute {
    const current = this.settings;
    const suggested = suggestedAttributes.find((a) => a.key === keyOrLabel || same(a.label, keyOrLabel)) ?? null;
    const label = suggested?.label ?? dartTrim(keyOrLabel);
    if (label.length === 0) throw new ChangeRefused('Give the attribute a name.');
    const existing = current.attributes.find((a) => same(a.label, label)) ?? null;
    if (existing !== null) throw new ChangeRefused(`“${existing.label}” is already tracked.`);
    const attribute = suggested ?? new TrackedAttribute(`own-${this.newId()}`, label);
    this.saveSettings({ attributes: [...current.attributes.map((a) => a.toJson()), attribute.toJson()] });
    return attribute;
  }

  /** Stops tracking an attribute. Values already given stay in the stages. */
  untrackAttribute(key: string): void {
    this.saveSettings({
      attributes: this.settings.attributes.filter((a) => a.key !== key).map((a) => a.toJson()),
    });
  }

  // -------------------------------------------------------------------------------------------------- relationships

  /** Links two characters. For a one-way type, the first is the first-named role (the Parent, the Mentor). */
  createRelation(fromId: string, toId: string, presetKey = 'friends'): CharacterRelation {
    if (fromId === toId) throw new ChangeRefused('Pick two different characters.');
    for (const id of [fromId, toId]) {
      const entry = this.row('loreEntries', id);
      if (entry === null) throw new ChangeRefused('That character no longer exists.');
      if (entry['category'] !== 'character') throw new ChangeRefused(`${str(entry['name'])} is not a character.`);
    }
    const existing = this.rows('characterRelations').some(
      (r) => (r['fromId'] === fromId && r['toId'] === toId) || (r['fromId'] === toId && r['toId'] === fromId),
    );
    if (existing) {
      throw new ChangeRefused(
        'These two characters already have a relationship. Add a stage to it to record a change.',
      );
    }
    const id = this.newId();
    const relation: JsonMap = {
      id,
      projectId: this.projectId,
      fromId,
      toId,
      stages: [this.newStage(this.typeOf(presetKey), null)],
      createdAt: this.now,
      updatedAt: this.now,
    };
    this.put('characterRelations', relation);
    return new CharacterRelation(relation);
  }

  private appendStage(relation: CharacterRelation, startNodeId: string | null, unknown: boolean): JsonMap {
    const stages = relation.stages;
    const previous = stages.length === 0 ? null : stages[stages.length - 1];
    const stage: JsonMap = {
      ...this.newStage(
        typeFor(previous?.preset ?? 'friends', this.settings.types),
        unknown ? null : this.validStart(startNodeId),
      ),
    };
    if (previous !== null) {
      stage['preset'] = previous.preset;
      stage['category'] = previous.category;
      stage['label'] = previous.label;
      stage['fromRole'] = previous.fromRole;
      stage['toRole'] = previous.toRole;
      stage['directional'] = previous.directional;
      stage['affinity'] = previous.affinity;
      if (previous.raw['attributes'] !== null && previous.raw['attributes'] !== undefined) {
        stage['attributes'] = deepCopy(previous.raw['attributes']);
      }
    }
    if (unknown) stage['startUnknown'] = true;
    this.saveStages(relation, [...stages.map((s) => s.raw), stage]);
    return stage;
  }

  /** A new stage: how things stand from `startNodeId` onward (or from a point not said), beginning as things stood. */
  addStage(relationId: string, startNodeId: string | null, args: { unknown?: boolean } = {}): RelationStage {
    return new RelationStage(this.appendStage(this.relationOf(relationId), startNodeId, args.unknown ?? false));
  }

  /** Records a change: a new stage holding the changes given. Every earlier stage is kept exactly as it was. */
  recordChange(
    relationId: string,
    args: { nodeId?: string | null; unknown?: boolean; changes?: StageInput } = {},
  ): RelationStage {
    const stage = this.appendStage(this.relationOf(relationId), args.nodeId ?? null, args.unknown ?? false);
    this.updateStage(relationId, str(stage['id']), args.changes ?? {});
    return this.relationOf(relationId).stages.find((s) => s.id === stage['id'])!;
  }

  /** A correction to one stage; every field checked, the others exactly as they were. */
  updateStage(relationId: string, stageId: string, c: StageInput): void {
    const relation = this.relationOf(relationId);
    if (!relation.stages.some((s) => s.id === stageId)) throw new ChangeRefused('That stage is no longer there.');
    const chosen = c.preset === undefined ? null : this.typeOf(c.preset);
    const tracked = this.settings.attributes;
    for (const [key, value] of c.attributes ?? new Map<string, AttributeInput>()) {
      const attribute = tracked.find((a) => a.key === key);
      if (attribute === undefined) {
        throw new ChangeRefused('That attribute is not tracked. Choose to track it first.');
      }
      for (const v of [...(value.setFrom ? [value.from] : []), ...(value.setTo ? [value.to] : [])]) {
        // Dart types the value as a whole number; one with a fraction is refused the same way.
        if (v !== null && (v < 0 || v > attributeMax || !Number.isInteger(v))) {
          throw new ChangeRefused(`${attribute.label} is given as a whole number from 0 to ${attributeMax}.`);
        }
      }
    }
    const storyEvent = c.storyEventId;
    if (storyEvent !== undefined && storyEvent.value !== null && this.ownEvent(storyEvent.value) === null) {
      throw new ChangeRefused('That event is not in this novel’s timeline.');
    }
    // A date is checked against the novel's calendar, as an event's is; one given from an event points at one of
    // this novel's, and an undated one says nothing.
    let storyDate: JsonMap | null = null;
    if (c.storyDate !== undefined && c.storyDate.value !== null) {
      const when = normalizeDate(c.storyDate.value, Calendar.fromJson(this.rows('storyCalendars')[0] ?? null));
      if (
        when['precision'] === 'relative' &&
        when['anchorId'] !== null &&
        when['anchorId'] !== undefined &&
        this.ownEvent(when['anchorId'] as string) === null
      ) {
        when['anchorId'] = null;
      }
      storyDate = when['precision'] === 'unknown' ? null : { kind: 'date', when };
    }
    const datePoint = c.storyDate !== undefined;
    const cause = c.causeEventId;
    if (cause !== undefined && cause.value !== null && this.ownEvent(cause.value) === null) {
      throw new ChangeRefused('That event is not in this novel’s timeline.');
    }
    const shown = c.causeNodeId;
    if (shown !== undefined && shown.value !== null && this.validStart(shown.value) === null) {
      throw new ChangeRefused('That chapter or scene is not in this novel.');
    }
    this.saveStages(
      relation,
      relation.stages.map((stage) => {
        if (stage.id !== stageId) return stage.raw;
        const next: JsonMap = { ...deepCopy(stage.raw) };
        if (chosen !== null && chosen.key !== stage.preset) {
          // Choosing a type sets its wording; switching to Custom keeps the wording to edit.
          next['preset'] = chosen.key;
          next['category'] = chosen.category;
          if (chosen.key !== 'custom') Object.assign(next, this.wording(chosen));
        }
        const attrs = c.attributes;
        if (attrs !== undefined) {
          const all: JsonMap = { ...stage.attributes };
          for (const [key, value] of attrs) {
            const was = stage.attribute(key);
            const from = value.setFrom ? value.from : was.from;
            const to = value.setTo ? value.to : was.to;
            if (from === null && to === null) {
              delete all[key];
            } else {
              all[key] = { from, to };
            }
          }
          next['attributes'] = all;
        }
        if (next['preset'] === 'custom') {
          if (c.label !== undefined) next['label'] = dartTrim(c.label);
          if (c.fromRole !== undefined) next['fromRole'] = dartTrim(c.fromRole);
          if (c.toRole !== undefined) next['toRole'] = dartTrim(c.toRole);
          if (c.directional !== undefined) next['directional'] = c.directional;
          if (c.category !== undefined) next['category'] = c.category;
        }
        if (c.title !== undefined) next['title'] = dartTrim(c.title);
        if (c.event !== undefined) next['event'] = c.event;
        if (c.notes !== undefined) next['notes'] = c.notes;
        if (c.affinity !== undefined) next['affinity'] = c.affinity;
        // A chapter given makes the reader's point known; "not said" clears the chapter.
        if (c.start !== undefined) {
          next['startNodeId'] = this.validStart(c.start.value);
          delete next['startUnknown'];
        }
        if (c.startUnknown === true) {
          next['startNodeId'] = null;
          next['startUnknown'] = true;
        }
        if (c.startUnknown === false) delete next['startUnknown'];
        if (storyEvent !== undefined) {
          next['storyAt'] = storyEvent.value === null ? null : { kind: 'event', eventId: storyEvent.value };
        }
        if (datePoint) next['storyAt'] = storyDate;
        if (cause !== undefined) next['causeEventId'] = cause.value;
        if (shown !== undefined) next['causeNodeId'] = shown.value;
        return next;
      }),
    );
  }

  /** Moves a stage whose chapter is not said earlier or later among the others; a stage at a chapter keeps its place. */
  moveStage(relationId: string, stageId: string, by: number): void {
    const relation = this.relationOf(relationId);
    const stages = relation.stages.map((s) => s.raw);
    const i = stages.findIndex((s) => s['id'] === stageId);
    const j = i + by;
    if (i < 0 || j < 0 || j >= stages.length || stages[i]['startUnknown'] !== true) return;
    const moving = stages[i];
    stages[i] = stages[j];
    stages[j] = moving;
    this.saveStages(relation, stages);
  }

  /** Removes one stage. The last remaining one cannot be removed; delete the relationship instead. */
  removeStage(relationId: string, stageId: string): void {
    const relation = this.relationOf(relationId);
    if (relation.stages.length <= 1) {
      throw new ChangeRefused('A relationship needs at least one stage. Delete the relationship instead.');
    }
    this.saveStages(
      relation,
      relation.stages.filter((s) => s.id !== stageId).map((s) => s.raw),
    );
  }

  /** Swaps who is who (the Mentor becomes the Student), across the whole history. */
  reverse(relationId: string): void {
    const relation = this.relationOf(relationId);
    this.put(
      'characterRelations',
      relation.merged({ fromId: relation.toId, toId: relation.fromId, updatedAt: this.now }),
    );
  }

  /** Deletes a relationship, with the connections recorded on it. The two characters are not touched. */
  removeRelation(relationId: string): void {
    this.relationOf(relationId);
    this.remove('characterRelations', relationId);
    this.snapshot = this.snapshot.withRows(
      'loreLinks',
      this.rows('loreLinks').filter((l) => l['fromId'] !== relationId && l['toId'] !== relationId),
    );
  }

  // ------------------------------------------------------------------------------------ connections over story time

  /** Records that a connection changed at a point in the story, keeping what was true before: this one stops there,
   * and a new one, with the changes (another record at either end, another type or wording), starts there. Returns the
   * new connection's id. */
  changeConnection(
    linkId: string,
    at: JsonMap,
    args: {
      fromId?: string | null;
      toId?: string | null;
      type?: string | null;
      label?: string | null;
      how?: string | null;
    } = {},
  ): string {
    this.checkPoint(at);
    const link = this.row('loreLinks', linkId);
    if (link === null) throw new ChangeRefused('That connection is not in this novel.');
    const validity = mapOrNull(link['validity']);
    this.put('loreLinks', {
      ...link,
      validity: { from: validity?.['from'] ?? null, until: at },
      updatedAt: this.now,
    });
    const fromId = args.fromId ?? null;
    const toId = args.toId ?? null;
    const how = args.how ?? null;
    const next: JsonMap = {
      ...link,
      id: this.newId(),
      fromId: fromId ?? link['fromId'] ?? null,
      toId: toId ?? link['toId'] ?? null,
      type: args.type ?? link['type'] ?? 'related',
      fromLabel: dartTrim(args.label ?? str(link['fromLabel'])),
      validity: { from: at, until: validity?.['until'] ?? null },
      createdAt: this.now,
      updatedAt: this.now,
    };
    delete next['endHow'];
    // How the new holding began ("stolen", "given"), when the author says; the old one's words are not carried over.
    if (how !== null) {
      delete next['how'];
      const words = dartTrim(how);
      if (words.length > 0) next['how'] = words.length > 80 ? words.substring(0, 80) : words;
    }
    if (toId !== null && !this.recordExists(new Link(next).to)) {
      throw new ChangeRefused('That record is not in this novel.');
    }
    if (fromId !== null && !this.recordExists(new Link(next).from)) {
      throw new ChangeRefused('That record is not in this novel.');
    }
    this.put('loreLinks', next);
    return str(next['id']);
  }

  /** Records where in the story a connection begins to hold (a new holder from a chapter or an event). Where it ends,
   * if anywhere, is kept. */
  startConnectionAt(linkId: string, at: JsonMap): void {
    this.checkPoint(at);
    const link = this.row('loreLinks', linkId);
    if (link === null) throw new ChangeRefused('That connection is not in this novel.');
    const validity = mapOrNull(link['validity']);
    this.put('loreLinks', {
      ...link,
      validity: { from: at, until: validity?.['until'] ?? null },
      updatedAt: this.now,
    });
  }

  /** Records that a connection stopped holding at a point in the story, and how, when the author says. It stays, as
   * history. */
  endConnection(linkId: string, at: JsonMap, args: { endHow?: string } = {}): void {
    this.checkPoint(at);
    const link = this.row('loreLinks', linkId);
    if (link === null) throw new ChangeRefused('That connection is not in this novel.');
    const validity = mapOrNull(link['validity']);
    const endHow = dartTrim(args.endHow ?? '');
    const how = endHow.length > 80 ? endHow.substring(0, 80) : endHow;
    this.put('loreLinks', {
      ...link,
      validity: { from: validity?.['from'] ?? null, until: at },
      ...(how.length > 0 ? { endHow: how } : {}),
      updatedAt: this.now,
    });
  }
}
