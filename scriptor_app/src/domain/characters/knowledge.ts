// SECRETS AND KNOWLEDGE (as in the original app). A port of flutter_app/lib/shared/domain/characters/knowledge.dart.
//
// What each character holds of a secret, read only from what the author has recorded. Nothing is inferred: a
// character with no record is "not recorded", never "unaware"; learning something later says nothing about not knowing
// it before. A character's records are kept in the order things happen to them, each at a chapter or scene (where the
// reader sees it) and at an event (when it happens in story time), read apart.

import { dartSort } from '../manuscript/dartSort';
import { type StoryModel } from '../model/storyModel';
import { type TimeContext, spanOfEvent } from '../model/validity';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { resolveChronology } from '../timeline/chronology';
import { nodeLabel } from '../timeline/narrative';
import {
  type Awareness,
  type CharacterSecret,
  type Knowledge,
  type KnowledgeNeed,
  type KnowledgeRecord,
  awarenessLabel,
  awarenesses,
  knowledges,
} from './characterRecords';

/** One character's records about a secret, in the order things happen to them. */
export function recordsOf(secret: CharacterSecret, characterId: string): KnowledgeRecord[] {
  return secret.records.filter((r) => r.characterId === characterId);
}

/** From their records, or from the simple lists (and "Does … know?" for the secret's own character). */
export type CurrentSource = 'records' | 'summary';

/** Where a character stands now, at the end of everything recorded. */
export class Current {
  constructor(
    /** Null: nothing recorded about them (or a state this version does not know). */
    readonly state: Awareness | null,
    /** Their last record, when the state comes from their records. */
    readonly record: KnowledgeRecord | null,
    /** Null when nothing is recorded. */
    readonly source: CurrentSource | null,
  ) {}
}

function awarenessFrom(k: Knowledge): Awareness {
  return k;
}

export function currentOf(secret: CharacterSecret, characterId: string): Current {
  const mine = recordsOf(secret, characterId);
  if (mine.length > 0) {
    const last = mine[mine.length - 1];
    return new Current(last.state, last, 'records');
  }
  if (characterId === secret.entryId) return new Current(awarenessFrom(secret.self), null, 'summary');
  for (const k of knowledges) {
    if (secret.listed(k).includes(characterId)) return new Current(awarenessFrom(k), null, 'summary');
  }
  return new Current(null, null, null);
}

/** Everyone a secret names: its own character first, then in the order they come into its records, then the simple
 * lists. */
export function peopleOf(secret: CharacterSecret): string[] {
  const ids: (string | null)[] = [
    secret.entryId,
    ...secret.records.flatMap((r) => [r.characterId, r.fromId]),
    ...secret.needs.map((n) => n.characterId),
    ...secret.knows,
    ...secret.suspects,
    ...secret.unaware,
  ];
  const out = new Set<string>();
  for (const id of ids) if (id !== null && id.length > 0) out.add(id);
  return [...out];
}

/** Who stands where now, by state in a fixed order; those named with nothing recorded come last. */
export function whoKnowsWhat(
  secret: CharacterSecret,
  ids?: readonly string[] | null,
): { state: Awareness | null; ids: string[] }[] {
  const people = ids ?? peopleOf(secret);
  const now = new Map<string, Awareness | null>();
  for (const id of people) now.set(id, currentOf(secret, id).state);
  const out: { state: Awareness | null; ids: string[] }[] = [];
  for (const state of [...awarenesses, null]) {
    const group = people.filter((id) => now.get(id) === state);
    if (group.length > 0) out.push({ state, ids: group });
  }
  return out;
}

/** A state in a few words, to follow a name ("Mira is unaware"), with their version when there is one. */
export function stateWords(state: Awareness, belief: string): string {
  return (
    `${state === 'unaware' ? 'is unaware' : dartToLowerCase(awarenessLabel[state])}` +
    `${dartTrim(belief).length > 0 ? ` (“${dartTrim(belief)}”)` : ''}`
  );
}

// ---------------------------------------------------------------------------------------------------- along an axis

/** Reading order (chapters and scenes) or story time (events): read apart, as the rest of the app keeps them. */
export type KnowledgeAxis = 'reading' | 'story';
export const knowledgeAxes: readonly KnowledgeAxis[] = ['reading', 'story'];
export const knowledgeAxisLabel: Readonly<Record<KnowledgeAxis, string>> = {
  reading: 'As the reader goes (chapters and scenes)',
  story: 'In story time (events)',
};

function placeOf(nodeId: string | null, eventId: string | null, axis: KnowledgeAxis): string | null {
  return axis === 'reading' ? nodeId : eventId;
}

/** Where something is, against a point on the same axis: at or before it, after it, not known, or not placed on this
 * axis at all. */
export type PointOrder = 'before' | 'after' | 'unknown' | 'unplaced';

/** Compares a place with a point. In reading order, chapters and scenes are simply in sequence. In story time, an
 * event is before another only when the dates say so for certain: two events on the same day, or one with no date,
 * are not known to be in either order. */
export function compareTo(
  placeId: string | null,
  pointId: string,
  axis: KnowledgeAxis,
  context: TimeContext,
): PointOrder {
  if (placeId === null) return 'unplaced';
  if (axis === 'reading') {
    const at = context.position.get(placeId);
    if (at === undefined) return 'unplaced';
    if (placeId === pointId) return 'before';
    const point = context.position.get(pointId);
    return point === undefined ? 'unknown' : at <= point ? 'before' : 'after';
  }
  if (!context.events.has(placeId)) return 'unplaced';
  if (placeId === pointId) return 'before';
  const a = spanOfEvent(placeId, context);
  const b = spanOfEvent(pointId, context);
  if (a === null || b === null) return 'unknown';
  if (a.hi < b.lo) return 'before';
  if (a.lo > b.hi) return 'after';
  return 'unknown';
}

/** Where a character stands at a point, from their records alone: the record in force (their last one placed at or
 * before the point), and whether that is `settled` (no later record of theirs could already be in force there). */
export function standingAt(
  records: readonly KnowledgeRecord[],
  pointId: string,
  axis: KnowledgeAxis,
  context: TimeContext,
): { record: KnowledgeRecord | null; settled: boolean } {
  const orders = records.map((r) => compareTo(placeOf(r.nodeId, r.eventId, axis), pointId, axis, context));
  const last = orders.lastIndexOf('before');
  return {
    record: last < 0 ? null : records[last],
    settled: orders.slice(last + 1).every((o) => o === 'after'),
  };
}

/** Where a record or mark is, in words: its chapter or scene and its event, as far as each is given. */
export function placeWords(nodeId: string | null, eventId: string | null, model: StoryModel): string {
  const parts: string[] = [];
  if (nodeId !== null && model.nodes.has(nodeId)) parts.push(`in ${nodeLabel(model, nodeId)}`);
  if (eventId !== null && model.events.has(eventId)) parts.push(`at “${model.events.get(eventId)!.name}”`);
  return parts.length === 0 ? 'with no chapter or event given' : parts.join(', ');
}

/** A record read aloud: "Mira knows part of it (“…”) in Chapter 3, at “The feast”: overheard, from Kai." */
export function recordWords(record: KnowledgeRecord, model: StoryModel): string {
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
  const how = [
    ...(dartTrim(record.how).length > 0 ? [dartTrim(record.how)] : []),
    ...(record.fromId !== null ? [`from ${name(record.fromId)}`] : []),
  ].join(', ');
  const state = record.state;
  const words = state === null ? 'is recorded' : stateWords(state, record.belief);
  return (
    `${name(record.characterId)} ${words} ${placeWords(record.nodeId, record.eventId, model)}` +
    `${how.length > 0 ? `: ${how}` : ''}`
  );
}

// ---------------------------------------------------------------------------------------------------- the spread

export class SpreadPoint {
  constructor(
    readonly id: string,
    readonly label: string,
    /** The secret first figures here (`first`), or comes out here (`reveal`). */
    readonly marks: readonly string[],
  ) {}
}

export class SpreadCell {
  constructor(
    /** The record in force here (null: none yet). */
    readonly record: KnowledgeRecord | null,
    /** Records placed at this very point. */
    readonly here: readonly KnowledgeRecord[],
    /** Marks that they act on it here. */
    readonly needs: readonly KnowledgeNeed[],
  ) {}
}

export class SpreadRow {
  constructor(
    readonly characterId: string,
    readonly name: string,
    readonly cells: readonly SpreadCell[],
    readonly now: Current,
    /** Their records with no place on this axis: in their history, but not at any point of it. */
    readonly unplaced: readonly KnowledgeRecord[],
  ) {}
}

export type Telling = { recordId: string; fromId: string; toId: string; point: number };

export class Spread {
  constructor(
    readonly axis: KnowledgeAxis,
    readonly points: readonly SpreadPoint[],
    readonly rows: readonly SpreadRow[],
    /** Who told whom, and at which point (an index into `points`). */
    readonly tellings: readonly Telling[],
  ) {}
}

/** How knowledge of a secret spreads along one axis: a column for every chapter or scene (or event) a record or mark
 * is placed at, and where the secret first figures and comes out; a row for everyone it names; in each cell the record
 * in force there. Who told whom is drawn where it happens. */
export function knowledgeSpread(secret: CharacterSecret, model: StoryModel, axis: KnowledgeAxis): Spread {
  const context = model.timeContext;
  const exists = (id: string | null): id is string =>
    id !== null && (axis === 'reading' ? model.nodes.has(id) : model.events.has(id));
  const records = secret.records;
  const needs = secret.needs;
  const marks = new Map<string, string[]>();
  for (const [nodeId, eventId] of [
    ...records.map((r) => [r.nodeId, r.eventId] as const),
    ...needs.map((n) => [n.nodeId, n.eventId] as const),
  ]) {
    const at = placeOf(nodeId, eventId, axis);
    if (exists(at) && !marks.has(at)) marks.set(at, []);
  }
  const mark = (id: string | null, kind: string) => {
    if (!exists(id)) return;
    let list = marks.get(id);
    if (list === undefined) marks.set(id, (list = []));
    list.push(kind);
  };
  if (axis === 'reading') {
    mark(secret.firstNodeId, 'first');
    mark(secret.revealNodeId, 'reveal');
  } else {
    mark(secret.revealEventId, 'reveal');
  }
  let chronology: Map<string, number> | null = null;
  if (axis === 'story') {
    chronology = new Map();
    resolveChronology(model.events.values(), model.calendar).forEach((p, i) => chronology!.set(p.event.id, i));
  }
  const rank = (id: string): number =>
    (chronology !== null ? chronology.get(id) : context.position.get(id)) ?? 2 ** 53;
  const ids = dartSort([...marks.keys()], (a, b) => {
    const c = rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0;
    return c !== 0 ? c : a < b ? -1 : a > b ? 1 : 0;
  });
  const points = ids.map(
    (id) => new SpreadPoint(id, axis === 'reading' ? nodeLabel(model, id) : model.events.get(id)!.name, marks.get(id)!),
  );
  const index = new Map<string, number>();
  points.forEach((p, i) => index.set(p.id, i));
  const people = peopleOf(secret).filter((id) => model.entries.has(id));
  const rows = people.map((id) => {
    const mine = recordsOf(secret, id);
    return new SpreadRow(
      id,
      model.entries.get(id)!.name,
      points.map(
        (p) =>
          new SpreadCell(
            standingAt(mine, p.id, axis, context).record,
            mine.filter((r) => placeOf(r.nodeId, r.eventId, axis) === p.id),
            needs.filter((n) => n.characterId === id && placeOf(n.nodeId, n.eventId, axis) === p.id),
          ),
      ),
      currentOf(secret, id),
      mine.filter((r) => !exists(placeOf(r.nodeId, r.eventId, axis))),
    );
  });
  const tellings: Telling[] = [];
  for (const r of records) {
    const at = placeOf(r.nodeId, r.eventId, axis);
    if (r.fromId !== null && people.includes(r.fromId) && index.has(at ?? '')) {
      tellings.push({ recordId: r.id, fromId: r.fromId, toId: r.characterId, point: index.get(at!)! });
    }
  }
  return new Spread(axis, points, rows, tellings);
}

// ---------------------------------------------------------------------------------------------------- checks

/** The only two things checked, each from a stated rule and only when the author's records hold what it needs. A
 * record placed at or before the point is needed, and nothing of theirs later that could already be in force there:
 * when it cannot be told, there is no finding. */
export type KnowledgeRule = 'needs' | 'told';
export const knowledgeRules: readonly KnowledgeRule[] = ['needs', 'told'];

export const knowledgeRuleWords: Readonly<
  Record<KnowledgeRule, { title: string; rule: string; /** What the records must hold for it to be checked. */ requires: string }>
> = {
  needs: {
    title: 'Acts on it while not knowing it',
    rule:
      'A character you mark as acting on a secret at a point must not be recorded there as unaware of it, or as ' +
      'believing something false instead.',
    requires:
      'Your mark that they act on it, and a record of theirs at or before that point, with nothing of theirs later that ' +
      'could already be in force there.',
  },
  told: {
    title: 'Learns it from someone who did not know',
    rule:
      'A character recorded as learning a secret from someone cannot learn it from a person recorded as unaware of it ' +
      'at that point.',
    requires:
      'A record saying who they learned it from, placed at a chapter or event, and a record of the teller’s at or ' +
      'before it.',
  },
};

export class KnowledgeFinding {
  /** The same for the same finding on every run, so a decision about it holds. */
  readonly key: string;
  readonly rule: KnowledgeRule;
  readonly secretId: string;
  /** The character whose secret it is: where it is edited. */
  readonly ownerId: string;
  readonly message: string;
  readonly because: string;
  readonly characterIds: readonly string[];

  constructor(args: {
    key: string;
    rule: KnowledgeRule;
    secretId: string;
    ownerId: string;
    message: string;
    because: string;
    characterIds: readonly string[];
  }) {
    this.key = args.key;
    this.rule = args.rule;
    this.secretId = args.secretId;
    this.ownerId = args.ownerId;
    this.message = args.message;
    this.because = args.because;
    this.characterIds = args.characterIds;
  }
}

/** Every finding for a novel's secrets. Reads only: nothing about anyone's knowledge is changed. */
export function checkKnowledge(secrets: readonly CharacterSecret[], model: StoryModel): KnowledgeFinding[] {
  const context = model.timeContext;
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
  const where = (id: string, axis: KnowledgeAxis) =>
    axis === 'reading' ? nodeLabel(model, id) : `“${model.events.get(id)?.name ?? 'an event'}”`;
  const exists = (id: string | null, axis: KnowledgeAxis): id is string =>
    id !== null && (axis === 'reading' ? model.nodes.has(id) : model.events.has(id));
  const findings: KnowledgeFinding[] = [];
  for (const secret of secrets) {
    const title = `“${secret.title}”`;
    for (const need of secret.needs) {
      // A character deleted from the Codex leaves nothing to check.
      if (!model.entries.has(need.characterId)) continue;
      for (const axis of knowledgeAxes) {
        const at = placeOf(need.nodeId, need.eventId, axis);
        if (!exists(at, axis)) continue;
        const { record, settled } = standingAt(recordsOf(secret, need.characterId), at, axis, context);
        if (record === null || !settled || (record.state !== 'unaware' && record.state !== 'falseBelief')) continue;
        findings.push(
          new KnowledgeFinding({
            key: ['knowledge', 'needs', secret.id, need.id, axis].join('|'),
            rule: 'needs',
            secretId: secret.id,
            ownerId: secret.entryId,
            message:
              `${name(need.characterId)} acts on ${title} ${axis === 'reading' ? 'in' : 'at'} ` +
              `${where(at, axis)}, but is recorded as ` +
              `${record.state === 'unaware' ? 'unaware of it' : 'believing something false'} there.`,
            because:
              `Your mark: ${dartTrim(need.note).length > 0 ? `“${dartTrim(need.note)}”` : 'acts on it'}, ` +
              `${placeWords(need.nodeId, need.eventId, model)}. Their record: ${recordWords(record, model)}. No later ` +
              'record of theirs is placed at or before it.',
            characterIds: [need.characterId],
          }),
        );
      }
    }
    for (const learned of secret.records) {
      const fromId = learned.fromId;
      if (
        fromId === null ||
        learned.state === 'unaware' ||
        !model.entries.has(learned.characterId) ||
        !model.entries.has(fromId)
      ) {
        continue;
      }
      for (const axis of knowledgeAxes) {
        const at = placeOf(learned.nodeId, learned.eventId, axis);
        if (!exists(at, axis)) continue;
        const { record, settled } = standingAt(recordsOf(secret, fromId), at, axis, context);
        if (record === null || !settled || record.state !== 'unaware') continue;
        findings.push(
          new KnowledgeFinding({
            key: ['knowledge', 'told', secret.id, learned.id, axis].join('|'),
            rule: 'told',
            secretId: secret.id,
            ownerId: secret.entryId,
            message:
              `${name(learned.characterId)} learns ${title} from ${name(fromId)} ` +
              `${axis === 'reading' ? 'in' : 'at'} ${where(at, axis)}, but ${name(fromId)} is recorded as ` +
              'unaware of it there.',
            because:
              `Learning it: ${recordWords(learned, model)}. The teller’s record: ${recordWords(record, model)}. No later ` +
              'record of the teller’s is placed at or before it.',
            characterIds: [learned.characterId, fromId],
          }),
        );
      }
    }
  }
  return findings;
}
