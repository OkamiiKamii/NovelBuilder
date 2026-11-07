import type { StoryModel } from '@/modules/model/types';
import { spanOfEvent, timeContext, type TimeContext } from '@/modules/model/validity';
import { resolveChronology } from '@/modules/timeline/chronology';
import { nodeLabel } from '@/modules/timeline/narrative';
import { AWARENESS, AWARENESS_LABELS, KNOWLEDGE, type Awareness, type CharacterSecret, type KnowledgeNeed, type KnowledgeRecord } from './types';

/**
 * SECRETS AND KNOWLEDGE
 * What each character holds of a secret, read only from what the author has
 * recorded. Nothing is inferred: a character with no record is "not
 * recorded", never "unaware"; a record with no chapter is not assumed to be
 * in force at any chapter; learning something later says nothing about not
 * knowing it before. A character's records are kept in the order things
 * happen to them, and each may sit at a chapter or scene (where the reader
 * sees it) and at an event (when it happens in story time). The two are
 * read apart, as the rest of the app keeps reading order and story time
 * apart.
 */
export type Axis = 'reading' | 'story';
export const AXES: Axis[] = ['reading', 'story'];
export const AXIS_LABELS: Record<Axis, string> = { reading: 'As the reader goes (chapters and scenes)', story: 'In story time (events)' };

/** The Secrets and knowledge view's own settings in the page address, kept by saved views: which secret, and along which axis. */
export const KNOWLEDGE_PARAMS = ['ksecret', 'kaxis'] as const;
export const knowledgeLayout = (params: URLSearchParams): Record<string, string> => Object.fromEntries(KNOWLEDGE_PARAMS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])));

type Placed = { nodeId: string | null; eventId: string | null };
const placeOf = (item: Placed, axis: Axis): string | null => (axis === 'reading' ? item.nodeId : item.eventId);

/** Where something is, against a point on the same axis: at or before it, after it, not known, or not placed on this axis at all. */
export type Order = 'before' | 'after' | 'unknown' | 'unplaced';

/**
 * Compares a place with a point. In reading order, chapters and scenes are
 * simply in sequence. In story time, an event is before another only when
 * the dates say so for certain: two events on the same day, or one with no
 * date, are not known to be in either order.
 */
export function compareTo(placeId: string | null, pointId: string, axis: Axis, context: TimeContext): Order {
  if (!placeId) return 'unplaced';
  if (axis === 'reading') {
    const at = context.position.get(placeId);
    if (at === undefined) return 'unplaced';
    if (placeId === pointId) return 'before';
    const point = context.position.get(pointId);
    return point === undefined ? 'unknown' : at <= point ? 'before' : 'after';
  }
  if (!context.events.has(placeId)) return 'unplaced';
  if (placeId === pointId) return 'before';
  const [a, b] = [spanOfEvent(placeId, context), spanOfEvent(pointId, context)];
  if (!a || !b) return 'unknown';
  if (a.hi < b.lo) return 'before';
  if (a.lo > b.hi) return 'after';
  return 'unknown';
}

/** One character's records about a secret, in the order things happen to them. */
export const recordsOf = (secret: CharacterSecret, characterId: string): KnowledgeRecord[] => (secret.records ?? []).filter((r) => r.characterId === characterId);

export interface Standing {
  /** The record in force: their last one placed at or before the point. Null when none is. */
  record: KnowledgeRecord | null;
  /** No later record of theirs could already be in force there: none is unplaced on this axis or of uncertain time. Checks rely only on settled standings. */
  settled: boolean;
}

/** Where a character stands at a point, from their records alone. */
export function standingAt(records: KnowledgeRecord[], pointId: string, axis: Axis, context: TimeContext): Standing {
  const orders = records.map((r) => compareTo(placeOf(r, axis), pointId, axis, context));
  const last = orders.lastIndexOf('before');
  return { record: last < 0 ? null : records[last], settled: orders.slice(last + 1).every((o) => o === 'after') };
}

export interface Current {
  /** Null: nothing recorded about them. */
  state: Awareness | null;
  /** Their last record, when the state comes from their records. */
  record: KnowledgeRecord | null;
  /** From their records, or from the simple lists (and "Does … know?" for the secret's own character). */
  source: 'records' | 'summary' | null;
}

/** Where a character stands now, at the end of everything recorded. */
export function currentOf(secret: CharacterSecret, characterId: string): Current {
  const mine = recordsOf(secret, characterId);
  if (mine.length) return { state: mine[mine.length - 1].state, record: mine[mine.length - 1], source: 'records' };
  if (characterId === secret.entryId) return { state: secret.self, record: null, source: 'summary' };
  for (const k of KNOWLEDGE) if (secret[k].includes(characterId)) return { state: k, record: null, source: 'summary' };
  return { state: null, record: null, source: null };
}

/** Everyone a secret names: its own character first, then in the order they come into its records, then the simple lists. */
export function peopleOf(secret: CharacterSecret): string[] {
  const ids: (string | null)[] = [secret.entryId];
  for (const r of secret.records ?? []) ids.push(r.characterId, r.fromId);
  for (const n of secret.needs ?? []) ids.push(n.characterId);
  ids.push(...secret.knows, ...secret.suspects, ...secret.unaware);
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Who stands where now, by state in a fixed order; those named with nothing recorded come last. */
export function whoKnowsWhat(secret: CharacterSecret, ids: string[] = peopleOf(secret)): { state: Awareness | null; ids: string[] }[] {
  const now = new Map(ids.map((id) => [id, currentOf(secret, id).state]));
  return [...AWARENESS, null].map((state) => ({ state, ids: ids.filter((id) => now.get(id) === state) })).filter((g) => g.ids.length);
}

/** A state in a few words, to follow a name ("Mira is unaware"), with their version when there is one. */
export const stateWords = (record: Pick<KnowledgeRecord, 'state' | 'belief'>): string => `${record.state === 'unaware' ? 'is unaware' : AWARENESS_LABELS[record.state].toLowerCase()}${record.belief.trim() ? ` (“${record.belief.trim()}”)` : ''}`;

/** Where a record or mark is, in words: its chapter or scene and its event, as far as each is given. */
export function placeWords(item: Placed, model: StoryModel): string {
  const parts = [item.nodeId && model.nodes.has(item.nodeId) ? `in ${nodeLabel(model, item.nodeId)}` : null, item.eventId && model.events.has(item.eventId) ? `at “${model.events.get(item.eventId)!.name}”` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'with no chapter or event given';
}

/** A record read aloud: "Mira knows part of it (“…”) in Chapter 3, at “The feast”: overheard, from Kai." */
export function recordWords(record: KnowledgeRecord, model: StoryModel): string {
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
  const how = [record.how.trim(), record.fromId ? `from ${name(record.fromId)}` : ''].filter(Boolean).join(', ');
  return `${name(record.characterId)} ${stateWords(record)} ${placeWords(record, model)}${how ? `: ${how}` : ''}`;
}

// ---------------------------------------------------------------------------------------------------- the spread

export interface SpreadPoint {
  id: string;
  label: string;
  /** The secret first figures here, or comes out here. */
  marks: ('first' | 'reveal')[];
}
export interface SpreadCell {
  /** The record in force here (null: none yet). */
  record: KnowledgeRecord | null;
  /** Records placed at this very point. */
  here: KnowledgeRecord[];
  /** Marks that they act on it here. */
  needs: KnowledgeNeed[];
}
export interface SpreadRow {
  characterId: string;
  name: string;
  cells: SpreadCell[];
  now: Current;
  /** Their records with no place on this axis: in their history, but not at any point of it. */
  unplaced: KnowledgeRecord[];
}
export interface SpreadTelling {
  recordId: string;
  fromId: string;
  toId: string;
  /** Index of the point it happens at. */
  point: number;
}
export interface Spread {
  axis: Axis;
  points: SpreadPoint[];
  rows: SpreadRow[];
  tellings: SpreadTelling[];
}

/**
 * How knowledge of a secret spreads along one axis: a column for every
 * chapter or scene (or event) a record or mark is placed at, and where the
 * secret first figures and comes out; a row for everyone it names; in each
 * cell the record in force there. Who told whom is drawn where it happens.
 */
export function knowledgeSpread(secret: CharacterSecret, model: StoryModel, axis: Axis): Spread {
  const context = timeContext(model);
  const exists = (id: string | null): id is string => Boolean(id) && (axis === 'reading' ? model.nodes.has(id!) : model.events.has(id!));
  const records = secret.records ?? [];
  const needs = secret.needs ?? [];
  const marks = new Map<string, SpreadPoint['marks']>();
  for (const item of [...records, ...needs]) {
    const at = placeOf(item, axis);
    if (exists(at) && !marks.has(at)) marks.set(at, []);
  }
  const mark = (id: string | null, kind: 'first' | 'reveal') => {
    if (!exists(id)) return;
    marks.set(id, [...(marks.get(id) ?? []), kind]);
  };
  if (axis === 'reading') {
    mark(secret.firstNodeId, 'first');
    mark(secret.revealNodeId, 'reveal');
  } else mark(secret.revealEventId, 'reveal');
  const chronology = axis === 'story' ? new Map(resolveChronology([...model.events.values()], model.calendar).map((p, i) => [p.event.id, i])) : null;
  const rank = (id: string) => (chronology ? chronology.get(id) : context.position.get(id)) ?? Number.MAX_SAFE_INTEGER;
  const points = [...marks.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((id) => ({ id, label: axis === 'reading' ? nodeLabel(model, id) : model.events.get(id)!.name, marks: marks.get(id)! }));
  const index = new Map(points.map((p, i) => [p.id, i]));
  const people = peopleOf(secret).filter((id) => model.entries.has(id));
  const rows = people.map((id) => {
    const mine = recordsOf(secret, id);
    return {
      characterId: id,
      name: model.entries.get(id)!.name,
      cells: points.map((p) => ({ record: standingAt(mine, p.id, axis, context).record, here: mine.filter((r) => placeOf(r, axis) === p.id), needs: needs.filter((n) => n.characterId === id && placeOf(n, axis) === p.id) })),
      now: currentOf(secret, id),
      unplaced: mine.filter((r) => !exists(placeOf(r, axis))),
    };
  });
  const tellings = records.filter((r) => r.fromId && people.includes(r.fromId) && index.has(placeOf(r, axis) ?? '')).map((r) => ({ recordId: r.id, fromId: r.fromId!, toId: r.characterId, point: index.get(placeOf(r, axis)!)! }));
  return { axis, points, rows, tellings };
}

// ---------------------------------------------------------------------------------------------------- checks

/**
 * The only two things checked, each from a stated rule and only when the
 * author's records hold what it needs. A record placed at or before the
 * point is needed, and nothing of theirs later that could already be in
 * force there: when it cannot be told, there is no finding.
 */
export const KNOWLEDGE_RULES = ['needs', 'told'] as const;
export type KnowledgeRule = (typeof KNOWLEDGE_RULES)[number];
export const KNOWLEDGE_RULE_TEXT: Record<KnowledgeRule, { title: string; rule: string; needs: string }> = {
  needs: { title: 'Acts on it while not knowing it', rule: 'A character you mark as acting on a secret at a point must not be recorded there as unaware of it, or as believing something false instead.', needs: 'Your mark that they act on it, and a record of theirs at or before that point, with nothing of theirs later that could already be in force there.' },
  told: { title: 'Learns it from someone who did not know', rule: 'A character recorded as learning a secret from someone cannot learn it from a person recorded as unaware of it at that point.', needs: 'A record saying who they learned it from, placed at a chapter or event, and a record of the teller’s at or before it.' },
};

export interface KnowledgeFinding {
  /** The same for the same finding on every run, so a decision about it holds. */
  key: string;
  rule: KnowledgeRule;
  secretId: string;
  /** The character whose secret it is: where it is edited. */
  ownerId: string;
  message: string;
  /** The records it rests on, in words. */
  because: string;
  characterIds: string[];
}

const keyOf = (rule: KnowledgeRule, ...ids: string[]) => ['knowledge', rule, ...ids].join('|');

/** Every finding for a novel's secrets. Reads only: nothing about anyone's knowledge is changed. */
export function checkKnowledge(secrets: CharacterSecret[], model: StoryModel): KnowledgeFinding[] {
  const context = timeContext(model);
  const name = (id: string) => model.entries.get(id)?.name ?? 'Someone';
  const where = (id: string, axis: Axis) => (axis === 'reading' ? nodeLabel(model, id) : `“${model.events.get(id)?.name ?? 'an event'}”`);
  const exists = (id: string | null, axis: Axis): id is string => Boolean(id) && (axis === 'reading' ? model.nodes.has(id!) : model.events.has(id!));
  const findings: KnowledgeFinding[] = [];
  for (const secret of secrets) {
    const title = `“${secret.title}”`;
    for (const need of secret.needs ?? []) {
      // A character deleted from the Codex leaves nothing to check.
      if (!model.entries.has(need.characterId)) continue;
      for (const axis of AXES) {
        const at = placeOf(need, axis);
        if (!exists(at, axis)) continue;
        const { record, settled } = standingAt(recordsOf(secret, need.characterId), at, axis, context);
        if (!record || !settled || (record.state !== 'unaware' && record.state !== 'false')) continue;
        findings.push({
          key: keyOf('needs', secret.id, need.id, axis),
          rule: 'needs',
          secretId: secret.id,
          ownerId: secret.entryId,
          message: `${name(need.characterId)} acts on ${title} ${axis === 'reading' ? 'in' : 'at'} ${where(at, axis)}, but is recorded as ${record.state === 'unaware' ? 'unaware of it' : 'believing something false'} there.`,
          because: `Your mark: ${need.note.trim() ? `“${need.note.trim()}”` : 'acts on it'}, ${placeWords(need, model)}. Their record: ${recordWords(record, model)}. No later record of theirs is placed at or before it.`,
          characterIds: [need.characterId],
        });
      }
    }
    for (const learned of secret.records ?? []) {
      if (!learned.fromId || learned.state === 'unaware' || !model.entries.has(learned.characterId) || !model.entries.has(learned.fromId)) continue;
      for (const axis of AXES) {
        const at = placeOf(learned, axis);
        if (!exists(at, axis)) continue;
        const { record, settled } = standingAt(recordsOf(secret, learned.fromId), at, axis, context);
        if (!record || !settled || record.state !== 'unaware') continue;
        findings.push({
          key: keyOf('told', secret.id, learned.id, axis),
          rule: 'told',
          secretId: secret.id,
          ownerId: secret.entryId,
          message: `${name(learned.characterId)} learns ${title} from ${name(learned.fromId)} ${axis === 'reading' ? 'in' : 'at'} ${where(at, axis)}, but ${name(learned.fromId)} is recorded as unaware of it there.`,
          because: `Learning it: ${recordWords(learned, model)}. The teller’s record: ${recordWords(record, model)}. No later record of the teller’s is placed at or before it.`,
          characterIds: [learned.characterId, learned.fromId],
        });
      }
    }
  }
  return findings;
}
