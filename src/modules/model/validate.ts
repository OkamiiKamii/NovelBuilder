import { NODE_KINDS } from '@/modules/manuscript/types';
import { PRECISIONS } from '@/modules/timeline/types';
import { resolveRef } from './model';
import { anchorIds } from './validity';
import { CONNECTION_KINDS, ENDPOINTS, ENTITY_TYPES, type Connection, type EntityType, type StoryModel } from './types';

type FieldRule = 'string' | 'number' | 'id' | 'id|null' | 'object';

/**
 * What every record of each type must have. Everything else is optional:
 * lists a record may lack (rows from earlier versions) are read as empty by
 * `buildModel`, and fields a later version adds are simply absent here.
 * An empty title is allowed; an id is never empty.
 */
export const REQUIRED: Record<EntityType, Record<string, FieldRule>> = {
  node: { id: 'id', projectId: 'id', kind: 'string', title: 'string', parentId: 'id|null', order: 'number' },
  entry: { id: 'id', projectId: 'id', category: 'string', name: 'string' },
  event: { id: 'id', projectId: 'id', name: 'string', when: 'object' },
  thread: { id: 'id', projectId: 'id', title: 'string', status: 'string' },
  relation: { id: 'id', projectId: 'id', fromId: 'id', toId: 'id' },
  ability: { id: 'id', groupId: 'string', name: 'string' },
};

const isId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function fits(rule: FieldRule, value: unknown): boolean {
  switch (rule) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'id':
      return isId(value);
    case 'id|null':
      return value === null || isId(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

/** What is wrong with a stored record, in words. Empty when it fits its contract. Never changes the record. */
export function validateRecord(type: EntityType, row: unknown): string[] {
  if (typeof row !== 'object' || row === null) return ['is not a record'];
  const record = row as Record<string, unknown>;
  const problems = Object.entries(REQUIRED[type]).flatMap(([field, rule]) => (fits(rule, record[field]) ? [] : [`${field} is missing or not ${rule === 'id|null' ? 'an id or empty' : rule === 'id' ? 'an id' : `a ${rule}`}`]));
  if (type === 'node' && typeof record.kind === 'string' && !NODE_KINDS.includes(record.kind as never)) problems.push(`kind “${record.kind}” is not one of ${NODE_KINDS.join(', ')}`);
  if (type === 'event' && fits('object', record.when) && !PRECISIONS.includes((record.when as { precision?: never }).precision as never)) problems.push('when has no known precision');
  if (type === 'relation' && isId(record.fromId) && record.fromId === record.toId) problems.push('a relationship joins a character to themself');
  return problems;
}

/** What is wrong with a ref's shape. Empty when it is a well-formed ref (whether or not the record exists). */
export function validateRef(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return ['is not a ref'];
  const { type, id } = value as { type?: unknown; id?: unknown };
  const problems: string[] = [];
  if (!ENTITY_TYPES.includes(type as EntityType)) problems.push(`type “${String(type)}” is not one of ${ENTITY_TYPES.join(', ')}`);
  if (!isId(id)) problems.push('id is missing');
  else if (type === 'ability' && !/^[^/]+\/[^/]+$/.test(id)) problems.push('an ability id is “<systemId>/<itemId>”');
  return problems;
}

/** What is wrong with a connection against the project: unknown kind, ends of the wrong type, a record linked to itself, or ends that no longer exist. */
export function validateConnection(model: StoryModel, connection: Connection): string[] {
  if (!CONNECTION_KINDS.includes(connection.kind)) return [`kind “${connection.kind}” is not known`];
  const problems = [...validateRef(connection.from).map((p) => `from: ${p}`), ...validateRef(connection.to).map((p) => `to: ${p}`)];
  if (problems.length) return problems;
  const ends = ENDPOINTS[connection.kind];
  if (ends && connection.from.type !== ends[0]) problems.push(`“${connection.kind}” starts from: ${ends[0]} (here: ${connection.from.type})`);
  if (ends && connection.to.type !== ends[1]) problems.push(`“${connection.kind}” leads to: ${ends[1]} (here: ${connection.to.type})`);
  if (connection.from.type === connection.to.type && connection.from.id === connection.to.id) problems.push('joins a record to itself');
  for (const [side, end] of [['from', connection.from], ['to', connection.to]] as const) if (!resolveRef(model, end).found) problems.push(`${side}: ${end.type} ${end.id} does not exist`);
  // When it holds may name a chapter or event that has since been deleted: it then holds at an unknown time.
  for (const id of anchorIds(connection.validity)) if (!model.nodes.has(id) && !model.events.has(id)) problems.push(`when it holds: ${id} does not exist`);
  return problems;
}
