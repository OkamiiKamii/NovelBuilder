// What a stored record or ref must hold, in words. A port of the record and ref parts of
// flutter_app/lib/shared/domain/model/validate.dart (validateConnection is not needed yet).

import { isMap, mapOrNull } from '../json';
import { nodeKindOf, nodeKinds } from '../records/storyNode';
import { dartTrim } from '../text/dartString';
import { type EntityType, entityTypeOf, entityTypes } from './entityRef';

type Rule = 'string' | 'number' | 'id' | 'idOrNull' | 'object';

/** What every record of each type must have. Everything else is optional: lists older rows lack read as empty, and
 * fields a later version adds are simply absent here. An empty title is allowed; an id is never empty. */
const required: Readonly<Record<EntityType, readonly (readonly [string, Rule])[]>> = {
  node: [
    ['id', 'id'],
    ['projectId', 'id'],
    ['kind', 'string'],
    ['title', 'string'],
    ['parentId', 'idOrNull'],
    ['order', 'number'],
  ],
  entry: [
    ['id', 'id'],
    ['projectId', 'id'],
    ['category', 'string'],
    ['name', 'string'],
  ],
  event: [
    ['id', 'id'],
    ['projectId', 'id'],
    ['name', 'string'],
    ['when', 'object'],
  ],
  thread: [
    ['id', 'id'],
    ['projectId', 'id'],
    ['title', 'string'],
    ['status', 'string'],
  ],
  relation: [
    ['id', 'id'],
    ['projectId', 'id'],
    ['fromId', 'id'],
    ['toId', 'id'],
  ],
  ability: [
    ['id', 'id'],
    ['groupId', 'string'],
    ['name', 'string'],
  ],
};

/** An id is a string that is not only spaces (Dart's `trim`). */
const isId = (v: unknown): boolean => typeof v === 'string' && dartTrim(v).length > 0;

function fits(rule: Rule, value: unknown): boolean {
  switch (rule) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'id':
      return isId(value);
    case 'idOrNull':
      return value === null || value === undefined || isId(value);
    case 'object':
      return isMap(value);
  }
}

const describe: Readonly<Record<Rule, string>> = {
  idOrNull: 'an id or empty',
  id: 'an id',
  string: 'a string',
  number: 'a number',
  object: 'a object',
};

const precisions = ['exact', 'approximate', 'relative', 'unknown'];

/** What is wrong with a stored record, in words. Empty when it fits its contract. Never changes the record. */
export function validateRecord(type: EntityType, row: unknown): string[] {
  if (!isMap(row)) return ['is not a record'];
  const problems = required[type]
    .filter(([key, rule]) => !fits(rule, row[key]))
    .map(([key, rule]) => `${key} is missing or not ${describe[rule]}`);
  const kind = row['kind'];
  if (type === 'node' && typeof kind === 'string' && nodeKindOf(kind) === null) {
    problems.push(`kind “${kind}” is not one of ${nodeKinds.join(', ')}`);
  }
  const when = row['when'];
  if (type === 'event' && isMap(when) && !precisions.includes(when['precision'] as string)) {
    problems.push('when has no known precision');
  }
  if (type === 'relation' && isId(row['fromId']) && row['fromId'] === row['toId']) {
    problems.push('a relationship joins a character to themself');
  }
  return problems;
}

/** What is wrong with a ref's shape. Empty when it is well formed (whether or not the record exists). */
export function validateRef(value: unknown): string[] {
  const m = mapOrNull(value);
  if (m === null) return ['is not a ref'];
  const problems: string[] = [];
  const type = entityTypeOf(m['type']);
  if (type === null) problems.push(`type “${String(m['type'])}” is not one of ${entityTypes.join(', ')}`);
  const id = m['id'];
  if (!isId(id)) {
    problems.push('id is missing');
  } else if (type === 'ability' && !/^[^/]+\/[^/]+$/.test(id as string)) {
    problems.push('an ability id is “<systemId>/<itemId>”');
  }
  return problems;
}
