// Every connection in a novel, each read from the one place the author recorded it. A port of
// flutter_app/lib/shared/domain/model/connections.dart.

import { type JsonMap, idOrNull, mapOrNull, str, strOrNull } from '../json';
import { type FieldDef } from '../records/category';
import { type RevealRole, revealRoleLabel } from '../records/event';
import { maps } from '../records/jsonRecord';
import { wordingOf } from '../records/link';
import { type ProgressCategory, type ProgressChange } from '../records/progress';
import { dartTrim } from '../text/dartString';
import { EntityRef, type EntityType, abilityId } from './entityRef';
import { type StoryModel } from './storyModel';
import { stageAt } from './storyOrder';
import { EventAnchor, NodeAnchor, type Validity } from './validity';

/** The ways records are connected, each read from one place where the author recorded it. The values are the Dart
 * enum's keys (`part-of`, `occurs-at`…). */
export type ConnectionKind =
  | 'part-of'
  | 'link'
  | 'relationship'
  | 'field'
  | 'mentioned'
  | 'present'
  | 'appearance'
  | 'participant'
  | 'involved'
  | 'occurs-at'
  | 'told-in'
  | 'follows'
  | 'dated-from'
  | 'in-thread'
  | 'thread-entry'
  | 'beat'
  | 'resolves-in'
  | 'holds'
  | 'branches-from'
  | 'progress'
  | 'travel';

/** Which kinds of record each kind may join, as [from, to], in the Dart enum's order. Null: any two. */
export const connectionKinds: ReadonlyMap<ConnectionKind, readonly [EntityType, EntityType] | null> = new Map<
  ConnectionKind,
  readonly [EntityType, EntityType] | null
>([
  ['part-of', ['node', 'node']],
  ['link', null],
  ['relationship', ['entry', 'entry']],
  ['field', ['entry', 'entry']],
  ['mentioned', ['entry', 'node']],
  ['present', ['entry', 'node']],
  ['appearance', ['entry', 'node']],
  ['participant', ['entry', 'event']],
  ['involved', ['entry', 'event']],
  ['occurs-at', ['event', 'entry']],
  ['told-in', ['event', 'node']],
  ['follows', ['event', 'event']],
  ['dated-from', ['event', 'event']],
  ['in-thread', ['event', 'thread']],
  ['thread-entry', ['thread', 'entry']],
  ['beat', ['thread', 'node']],
  ['resolves-in', ['thread', 'node']],
  ['holds', ['entry', 'ability']],
  ['branches-from', ['ability', 'ability']],
  ['progress', null],
  ['travel', null],
]);

/** Dart's `ConnectionKind.of`. */
export function connectionKindOf(key: string): ConnectionKind | null {
  return connectionKinds.has(key as ConnectionKind) ? (key as ConnectionKind) : null;
}

/** Where a connection is stored: the record to open, or to change through its changes. */
export class ConnectionSource {
  constructor(
    readonly collection: string,
    readonly id: string,
    /** For a field of an entry: the field's id on the entry. */
    readonly field: string | null = null,
  ) {}

  toJson(): JsonMap {
    return { table: this.collection, id: this.id, ...(this.field !== null ? { field: this.field } : {}) };
  }
}

/** One connection between two records. It holds their ids, never copies of them. from → to is the direction the
 * meaning reads in; `directed` says whether that matters ("Mentor → Student") or it reads the same both ways. */
export class Connection {
  /** Stable while the connection exists: built from where it is stored, so a selection survives a reload. */
  readonly id: string;
  readonly kind: ConnectionKind;
  readonly from: EntityRef;
  readonly to: EntityRef;
  /** How the from side describes it. */
  readonly label: string;
  /** How the to side describes it, when that differs. Never invented: null when the author gave none. */
  readonly reverseLabel: string | null;
  readonly directed: boolean;
  readonly source: ConnectionSource;
  /** For a stored link: its own kind, notes, canon status and when it holds. */
  readonly type: string | null;
  readonly notes: string | null;
  readonly canon: string | null;
  readonly validity: Validity | null;
  readonly validityJson: JsonMap | null;

  constructor(args: {
    id: string;
    kind: ConnectionKind;
    from: EntityRef;
    to: EntityRef;
    label: string;
    directed: boolean;
    source: ConnectionSource;
    reverseLabel?: string | null;
    type?: string | null;
    notes?: string | null;
    canon?: string | null;
    validity?: Validity | null;
    validityJson?: JsonMap | null;
  }) {
    this.id = args.id;
    this.kind = args.kind;
    this.from = args.from;
    this.to = args.to;
    this.label = args.label;
    this.directed = args.directed;
    this.source = args.source;
    this.reverseLabel = args.reverseLabel ?? null;
    this.type = args.type ?? null;
    this.notes = args.notes ?? null;
    this.canon = args.canon ?? null;
    this.validity = args.validity ?? null;
    this.validityJson = args.validityJson ?? null;
  }

  toJson(): JsonMap {
    return {
      id: this.id,
      kind: this.kind,
      from: this.from.toJson(),
      to: this.to.toJson(),
      label: this.label,
      ...(this.reverseLabel !== null ? { reverseLabel: this.reverseLabel } : {}),
      directed: this.directed,
      source: this.source.toJson(),
      ...(this.type !== null ? { type: this.type } : {}),
      ...(this.notes !== null ? { notes: this.notes } : {}),
      ...(this.canon !== null ? { canon: this.canon } : {}),
      ...(this.validityJson !== null ? { validity: this.validityJson } : {}),
    };
  }
}

/** A connection one of whose ends no longer exists. Reported, never silently dropped. */
export class DanglingConnection {
  constructor(
    readonly connection: Connection,
    readonly missing: readonly EntityRef[],
  ) {}
}

/** What a progression change says, in words: "Level set to 4", "Gained Fire Lance". */
export function changeWords(change: ProgressChange, category: ProgressCategory | null, model: StoryModel): string {
  const subject = dartTrim(change.subject);
  const refName = change.refId === null ? '' : (model.entries.get(change.refId)?.name ?? '');
  const abilityName = change.abilityId === null ? '' : (model.abilities.get(change.abilityId)?.item.name ?? '');
  const thing = [subject, refName, abilityName, category?.name ?? ''].find((s) => s.length > 0) ?? 'Something';
  const value = change.value.length === 0 ? '—' : change.value;
  switch (change.action) {
    case 'set':
      return category?.shape === 'named' ? `${thing} set to ${value}` : `${category?.name ?? 'Value'} set to ${value}`;
    case 'gain':
      return `Gained ${thing}`;
    case 'lose':
      return `Lost ${thing}`;
    default:
      return thing;
  }
}

/** Every connection in the novel, read from where each was made, at full detail. Connections whose end no longer
 * exists come back in `dangling` with what is missing, so a view can say so instead of quietly showing less. */
export function deriveConnections(model: StoryModel): {
  connections: Connection[];
  dangling: DanglingConnection[];
} {
  const all = new Map<string, Connection>();
  const ref = (type: EntityType, id: string) => new EntityRef(type, id);
  const add = (
    id: string,
    kind: ConnectionKind,
    from: EntityRef,
    to: EntityRef,
    label: string,
    source: ConnectionSource,
    options: { directed?: boolean; reverseLabel?: string | null } = {},
  ) => {
    if (from.id.length === 0 || to.id.length === 0 || all.has(id)) return;
    const reverseLabel = options.reverseLabel ?? null;
    all.set(
      id,
      new Connection({
        id,
        kind,
        from,
        to,
        label,
        reverseLabel: reverseLabel === null || reverseLabel.length === 0 ? null : reverseLabel,
        directed: options.directed ?? true,
        source,
      }),
    );
  };

  for (const node of model.nodes.values()) {
    const source = new ConnectionSource('chapters', node.id);
    if (node.parentId !== null) {
      add(`part-of:${node.id}`, 'part-of', ref('node', node.id), ref('node', node.parentId), 'Part of', source);
    }
    for (const entryId of node.mentions) {
      add(
        `mentioned:${node.id}:${entryId}`,
        'mentioned',
        ref('entry', entryId),
        ref('node', node.id),
        'Mentioned in',
        source,
      );
    }
  }
  for (const plan of model.plans.values()) {
    const source = new ConnectionSource('chapterPlans', plan.id);
    const here = ref('node', plan.id);
    for (const e of plan.entityIds) {
      add(`present:${plan.id}:${e}`, 'present', ref('entry', e), here, 'Present in', source);
    }
    for (const e of plan.appearIds) {
      add(`appearance:${plan.id}:${e}`, 'appearance', ref('entry', e), here, 'Appears in', source);
    }
    for (const e of plan.povIds) {
      add(`pov:${plan.id}:${e}`, 'appearance', ref('entry', e), here, 'Point of view in', source);
    }
    for (const e of plan.mentionIds) {
      add(`appearance:${plan.id}:${e}`, 'appearance', ref('entry', e), here, 'Mentioned in, not on the page', source);
    }
  }

  // One row serves both directions, each side with its own wording: the author's, or the kind's converse.
  for (const link of model.links) {
    const w = wordingOf(link);
    const canon = strOrNull(link.raw['canon']);
    const notes = link.notes;
    all.set(
      `link:${link.id}`,
      new Connection({
        id: `link:${link.id}`,
        kind: 'link',
        from: link.from,
        to: link.to,
        label: w.forward.length > 0 ? w.forward : link.type !== null ? '' : 'Related',
        reverseLabel: w.backward.length === 0 ? null : w.backward,
        directed: !w.reciprocal,
        source: new ConnectionSource('loreLinks', link.id),
        type: link.type,
        notes: notes === null || notes.length === 0 ? null : notes,
        canon: canon === null || canon.length === 0 ? null : canon,
        validity: link.validity,
        validityJson: mapOrNull(link.raw['validity']),
      }),
    );
  }

  // Progression changes: at the chapter, scene or event they happen at, and with the entry they name.
  for (const change of model.progress) {
    const words = changeWords(change, model.progressCategories.get(change.categoryId) ?? null, model);
    const source = new ConnectionSource('progressChanges', change.id);
    const who = ref('entry', change.entryId);
    const at = change.at;
    if (at instanceof NodeAnchor) {
      add(`progress:${change.id}`, 'progress', who, ref('node', at.nodeId), `Changes (${words}) in`, source);
    } else if (at instanceof EventAnchor) {
      add(`progress:${change.id}`, 'progress', who, ref('event', at.eventId), `Changes (${words}) at`, source);
    }
    const verb = change.action === 'gain' ? 'Gained' : change.action === 'lose' ? 'Lost' : `Changes (${words}) with`;
    if (change.refId !== null) {
      add(`progress-ref:${change.id}`, 'progress', who, ref('entry', change.refId), verb, source);
    }
    if (change.abilityId !== null) {
      add(`progress-ability:${change.id}`, 'progress', who, ref('ability', change.abilityId), verb, source);
    }
  }

  // Journeys: where each traveller leaves from, goes to and by way of; when they set out and arrive; their events.
  for (const journey of model.journeys) {
    const source = new ConnectionSource('journeys', journey.id);
    for (const t of journey.travellerIds) {
      const from = ref('entry', t);
      if (journey.fromId !== null) {
        add(`travel-from:${journey.id}:${t}`, 'travel', from, ref('entry', journey.fromId), 'Leaves from', source);
      }
      if (journey.toId !== null) {
        add(`travel-to:${journey.id}:${t}`, 'travel', from, ref('entry', journey.toId), 'Travels to', source);
      }
      journey.via.forEach((v, i) => {
        add(`travel-via:${journey.id}:${t}:${i}`, 'travel', from, ref('entry', v), 'Travels by way of', source);
      });
      for (const e of journey.eventIds) {
        add(`travel-event:${journey.id}:${t}:${e}`, 'travel', from, ref('event', e), 'Travels as part of', source);
      }
      for (const [which, at] of [
        ['leaves', journey.departure],
        ['arrives', journey.arrival],
      ] as const) {
        const leaves = which === 'leaves';
        if (at instanceof NodeAnchor) {
          add(
            `travel-${which}:${journey.id}:${t}`,
            'travel',
            from,
            ref('node', at.nodeId),
            leaves ? 'Sets out in' : 'Arrives in',
            source,
          );
        } else if (at instanceof EventAnchor) {
          add(
            `travel-${which}:${journey.id}:${t}`,
            'travel',
            from,
            ref('event', at.eventId),
            leaves ? 'Sets out at' : 'Arrives at',
            source,
          );
        }
      }
    }
  }

  for (const relation of model.relations.values()) {
    const stage = stageAt(relation, null, model.order);
    const directed = stage?.directional ?? false;
    const candidates = [...(directed ? [stage!.fromRole] : []), stage?.title ?? '', stage?.label ?? ''];
    const label = candidates.find((s) => s.length > 0) ?? 'Related';
    add(
      `relationship:${relation.id}`,
      'relationship',
      ref('entry', relation.fromId),
      ref('entry', relation.toId),
      label,
      new ConnectionSource('characterRelations', relation.id),
      { directed, reverseLabel: directed ? stage!.toRole : null },
    );
  }

  for (const entry of model.entries.values()) {
    const defs = new Map<string, FieldDef>();
    for (const d of model.categoryOf(entry.category).fields) defs.set(d.id, d);
    for (const field of entry.fields) {
      const def = field.defId === null ? undefined : defs.get(field.defId);
      const type = def !== undefined ? def.type : field.type;
      if (type !== 'reference' && type !== 'references') continue;
      const name = [def?.name ?? '', field.key].find((s) => s.length > 0) ?? 'Linked';
      const targets = type === 'reference' ? [field.value] : field.value.split('\n');
      for (const target of targets.map((t) => dartTrim(t)).filter((t) => t.length > 0)) {
        add(
          `field:${entry.id}:${field.id}:${target}`,
          'field',
          ref('entry', entry.id),
          ref('entry', target),
          name,
          new ConnectionSource('loreEntries', entry.id, field.id),
        );
      }
    }
  }

  for (const event of model.events.values()) {
    const source = new ConnectionSource('timelineEvents', event.id);
    const here = ref('event', event.id);
    // The original reads every character row; a row without an id makes no connection (as `add` skips empty ids).
    for (const c of maps(event.raw['characters'])) {
      add(
        `participant:${event.id}:${str(c['id'])}`,
        'participant',
        ref('entry', str(c['id'])),
        here,
        'Takes part in',
        source,
      );
    }
    for (const e of event.entryIds) {
      add(`involved:${event.id}:${e}`, 'involved', ref('entry', e), here, 'Involved in', source);
    }
    if (event.locationId !== null) {
      add(`occurs-at:${event.id}`, 'occurs-at', here, ref('entry', event.locationId), 'Takes place at', source);
    }
    const roles = event.reveals;
    for (const n of event.nodeIds) {
      const role: RevealRole = roles.get(n) ?? 'told';
      add(`told-in:${event.id}:${n}`, 'told-in', here, ref('node', n), revealRoleLabel[role], source);
    }
    for (const t of event.threadIds) {
      add(`in-thread:${event.id}:${t}`, 'in-thread', here, ref('thread', t), 'Part of', source);
    }
    if (event.afterId !== null) {
      add(`follows:${event.id}`, 'follows', here, ref('event', event.afterId), 'Comes after', source);
    }
    // Read from the stored date itself: a relative date with a damaged offset still names its anchor.
    const when = mapOrNull(event.raw['when']);
    const anchorId = idOrNull(when?.['anchorId']);
    if (when?.['precision'] === 'relative' && anchorId !== null) {
      add(`dated-from:${event.id}`, 'dated-from', here, ref('event', anchorId), 'Dated from', source);
    }
  }

  for (const thread of model.threads.values()) {
    const source = new ConnectionSource('plotThreads', thread.id);
    const here = ref('thread', thread.id);
    for (const e of [...thread.characterIds, ...thread.locationIds]) {
      add(`thread-entry:${thread.id}:${e}`, 'thread-entry', here, ref('entry', e), 'Involves', source);
    }
    for (const beat of thread.beats) {
      if (beat.nodeId !== null) {
        add(
          `beat:${thread.id}:${beat.id}`,
          'beat',
          here,
          ref('node', beat.nodeId),
          beat.title.length === 0 ? 'Develops in' : beat.title,
          source,
        );
      }
    }
    if (thread.targetNodeId !== null) {
      add(
        `resolves-in:${thread.id}`,
        'resolves-in',
        here,
        ref('node', thread.targetNodeId),
        'Meant to resolve in',
        source,
      );
    }
  }

  for (const sheet of model.sheets) {
    for (const itemId of sheet.itemIds) {
      add(
        `holds:${sheet.id}:${itemId}`,
        'holds',
        ref('entry', sheet.entryId),
        ref('ability', abilityId(sheet.systemId, itemId)),
        'Has',
        new ConnectionSource('systemSheets', sheet.id),
      );
    }
  }
  for (const a of model.abilities.values()) {
    const parent = a.item.parentId;
    if (parent !== null) {
      add(
        `branches-from:${a.system.id}/${a.item.id}`,
        'branches-from',
        ref('ability', abilityId(a.system.id, a.item.id)),
        ref('ability', abilityId(a.system.id, parent)),
        'Branches from',
        new ConnectionSource('systems', a.system.id),
      );
    }
  }

  const connections: Connection[] = [];
  const dangling: DanglingConnection[] = [];
  // An end on an off system's ability is hidden quietly: not shown, and not broken (the ability still resolves).
  const hidden = (end: EntityRef) => end.type === 'ability' && !model.systems.has(model.abilities.get(end.id)?.system.id ?? '') && model.abilities.has(end.id);
  for (const c of all.values()) {
    if (hidden(c.from) || hidden(c.to)) continue;
    const missing = [c.from, c.to].filter((end) => !model.exists(end));
    if (missing.length === 0) connections.push(c);
    else dangling.push(new DanglingConnection(c, missing));
  }
  return { connections, dangling };
}

/** A connection as one of its ends sees it. Each side keeps its own wording: one side's label is never shown as the
 * other's, so "Orrin considers Mira a rival" does not read as Mira thinking the same. */
export class SeenConnection {
  constructor(
    readonly connection: Connection,
    readonly other: EntityRef,
    readonly label: string,
    readonly theirLabel: string,
    readonly outgoing: boolean,
  ) {}
}

export function connectionsOf(connections: readonly Connection[], self: EntityRef): SeenConnection[] {
  const out: SeenConnection[] = [];
  for (const c of connections) {
    if (c.from.equals(self)) out.push(new SeenConnection(c, c.to, c.label, c.reverseLabel ?? '', true));
    if (c.to.equals(self)) out.push(new SeenConnection(c, c.from, c.reverseLabel ?? '', c.label, false));
  }
  return out;
}
