// GENRE MODULES, as the original app's `src/modules/extensions`. A module is described, not coded: the codex categories
// and fields it brings, an optional starter system, and descriptions of tools ("a board of Suspects grouped by
// Status") that the app's generic tools draw. Categories and fields are named, not referenced by id, so a module works
// in any novel and can be written to a file and shared. A port of flutter_app/lib/shared/domain/modules/module_defs.dart.
//
// CLEAN CORE RULE: a module adds to a novel and never takes away. Turning it on merges its categories and fields into
// the codex (what is there stays as it is) and shows its tools; it creates no records. Turning it off hides its tools
// and tucks away the categories it introduced when they are empty and no other module that is on uses them; nothing
// written is deleted, and the core never depends on a module being on.

import { type JsonMap, mapOrNull, numOrNull, str, strOrNull, listOf } from '../json';
import { type StoryOrder, stageAt } from '../model/storyOrder';
import { Category, type FieldDef, builtinCategoryKeys, fieldTypeOf } from '../records/category';
import { maps, strings } from '../records/jsonRecord';
import { type CharacterRelation } from '../records/relation';
import { tidyBlueprint } from '../systems/blueprints';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { dartSort } from '../manuscript/dartSort';
import { builtinModulesJson } from './builtinModules';

/** Core pages a module can send the author to, rather than rebuild. */
export const corePages: readonly string[] = [
  'systems',
  'progression',
  'graph',
  'timeline',
  'relationships',
  'plot',
  'canon',
  'characters',
  'branches',
  'continuity',
];

export const moduleFileFormat = 'novel-builder-module';

const text = (v: unknown): string => (typeof v === 'string' ? dartTrim(v) : '');
const textList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => text(x).length > 0).map(text) : []);
const number = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** Dart's `num.round()`: halves away from zero. */
const dartRound = (n: number): number => (n < 0 ? -Math.round(-n) : Math.round(n));

/** One tool, as a module describes it (`type` and what that kind of tool needs). Null when it is not one this app
 * knows, or it lacks what it needs: the rest of the module still works. */
export function parseTool(raw: unknown, index: number): JsonMap | null {
  const t = mapOrNull(raw) ?? {};
  const base: JsonMap = {
    id: text(t['id']).length > 0 ? text(t['id']) : `tool-${index + 1}`,
    title: text(t['title']).length > 0 ? text(t['title']) : 'Untitled tool',
  };
  if (text(t['hint']).length > 0) base['hint'] = text(t['hint']);
  switch (t['type']) {
    case 'registry': {
      if (text(t['category']).length === 0) return null;
      const out: JsonMap = { ...base, type: 'registry', category: text(t['category']) };
      if (text(t['groupBy']).length > 0) out['groupBy'] = text(t['groupBy']);
      if (textList(t['summary']).length > 0) out['summary'] = textList(t['summary']);
      return out;
    }
    case 'lineage':
      return { ...base, type: 'lineage' };
    case 'board': {
      if (text(t['category']).length === 0 || text(t['groupBy']).length === 0) return null;
      const out: JsonMap = { ...base, type: 'board', category: text(t['category']), groupBy: text(t['groupBy']) };
      if (textList(t['show']).length > 0) out['show'] = textList(t['show']);
      return out;
    }
    case 'table':
      return text(t['category']).length === 0 || textList(t['fields']).length === 0
        ? null
        : { ...base, type: 'table', category: text(t['category']), fields: textList(t['fields']) };
    case 'matrix': {
      if (text(t['rows']).length === 0 || text(t['columns']).length === 0) return null;
      const out: JsonMap = { ...base, type: 'matrix', rows: text(t['rows']), columns: text(t['columns']) };
      if (textList(t['values']).length > 0) out['values'] = textList(t['values']);
      return out;
    }
    case 'meters':
      return text(t['category']).length === 0 || textList(t['fields']).length === 0
        ? null
        : {
            ...base,
            type: 'meters',
            category: text(t['category']),
            fields: textList(t['fields']),
            max: number(t['max'], 10) < 1 ? 1 : number(t['max'], 10),
          };
    case 'log': {
      const v = mapOrNull(t['value']);
      const out: JsonMap = { ...base, type: 'log' };
      if (textList(t['states']).length > 0) out['states'] = textList(t['states']);
      if (text(t['about']).length > 0) out['about'] = text(t['about']);
      if (text(t['second']).length > 0) out['second'] = text(t['second']);
      if (t['checklist'] === true) out['checklist'] = true;
      if (textList(t['suggestions']).length > 0) out['suggestions'] = textList(t['suggestions']);
      if (v !== null) {
        out['value'] = {
          label: text(v['label']).length > 0 ? text(v['label']) : 'Value',
          min: number(v['min'], 0),
          max: number(v['max'], 10),
        };
      }
      return out;
    }
    case 'calculator': {
      const inputs = maps(t['inputs'])
        .filter((i) => text(i['key']).length > 0)
        .map((i) => ({
          key: text(i['key']),
          label: text(i['label']).length > 0 ? text(i['label']) : text(i['key']),
          unit: text(i['unit']),
          value: number(i['value'], 0),
        }));
      const outputs = maps(t['outputs'])
        .filter((o) => text(o['formula']).length > 0)
        .map((o) => ({
          label: text(o['label']).length > 0 ? text(o['label']) : 'Result',
          formula: text(o['formula']),
          unit: text(o['unit']),
        }));
      return inputs.length === 0 || outputs.length === 0 ? null : { ...base, type: 'calculator', inputs, outputs };
    }
    case 'ranks':
    case 'inventory':
      return { ...base, type: t['type'] };
    case 'page':
      return corePages.includes(t['to'] as string) ? { ...base, type: 'page', to: t['to'] } : null;
    default:
      return null;
  }
}

/** A module: its card, the categories and fields it brings, its starter system and its tools. */
export class ModuleDefinition {
  constructor(readonly raw: JsonMap) {}

  get id(): string {
    return str(this.raw['id']);
  }
  get name(): string {
    return str(this.raw['name']);
  }
  get genre(): string {
    return str(this.raw['genre']);
  }
  get description(): string {
    return str(this.raw['description']);
  }
  /** What its workspace is called; its name when absent. */
  get nav(): string {
    return str(this.raw['nav'], this.name);
  }
  get icon(): string {
    return str(this.raw['icon']);
  }
  get features(): string[] {
    return strings(this.raw['features']);
  }
  get integrates(): string[] {
    return strings(this.raw['integrates']);
  }
  get version(): number {
    return Math.trunc(numOrNull(this.raw['version']) ?? 1);
  }
  get builtin(): boolean {
    return this.raw['builtin'] === true;
  }
  /** The categories it brings: `{key, name, singular, color, builtin, fields: [{id, name, type, options}]}`. */
  get categories(): JsonMap[] {
    return maps(mapOrNull(this.raw['schema'])?.['categories']);
  }
  get system(): JsonMap | null {
    return mapOrNull(this.raw['system']);
  }
  get tools(): JsonMap[] {
    return maps(this.raw['tools']);
  }
}

/** Thrown for something that is not a module at all (Dart's FormatException). */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}

/** The first `n` characters (code points) of `s`, as Dart's `runes.take(n)`. */
const firstRunes = (s: string, n: number): string => [...s].slice(0, n).join('');

/** Reads a module from anywhere (a file, another novel) without trusting it. Throws FormatError when it is not a
 * module at all. */
export function parseDefinition(raw: unknown, args: { newId: () => string }): ModuleDefinition {
  const d = mapOrNull(raw);
  if (d === null || text(d['name']).length === 0) throw new FormatError('That is not a module.');
  const schema = mapOrNull(d['schema']) ?? {};
  const categories = maps(schema['categories'])
    .filter((c) => text(c['name']).length > 0 || c['builtin'] === true)
    .map((c) => ({
      key: text(c['key']),
      name: text(c['name']),
      singular: text(c['singular']).length > 0 ? text(c['singular']) : text(c['name']),
      color: /^#[0-9a-f]{6}$/i.test(text(c['color'])) ? text(c['color']) : '',
      builtin: c['builtin'] === true,
      fields: maps(c['fields'])
        .filter((f) => text(f['name']).length > 0)
        .map((f, i) => ({
          id: `module-${i}`,
          name: text(f['name']),
          type: fieldTypeOf(f['type']) !== null ? f['type'] : 'text',
          options: textList(f['options']),
        })),
    }));
  const system = mapOrNull(d['system']) === null ? null : tidyBlueprint(mapOrNull(d['system'])!, args.newId);
  const tools: JsonMap[] = [];
  listOf(d['tools']).forEach((t, i) => {
    const tool = parseTool(t, i);
    if (tool !== null) tools.push(tool);
  });
  const name = text(d['name']);
  const nav = text(d['nav']);
  const icon = text(d['icon']);
  const out: JsonMap = {
    id: text(d['id']).length > 0 ? text(d['id']) : `custom-${args.newId()}`,
    name: name.length > 80 ? name.substring(0, 80) : name,
    genre: text(d['genre']),
    description: text(d['description']),
  };
  if (nav.length > 0) out['nav'] = nav.length > 40 ? nav.substring(0, 40) : nav;
  if (icon.length > 0) out['icon'] = firstRunes(icon, 2);
  if (textList(d['features']).length > 0) out['features'] = textList(d['features']).slice(0, 12);
  if (textList(d['integrates']).length > 0) out['integrates'] = textList(d['integrates']).slice(0, 16);
  const version = dartRound(number(d['version'], 1));
  out['version'] = version < 1 ? 1 : version;
  out['builtin'] = false;
  out['schema'] = { categories };
  out['system'] = system;
  out['tools'] = tools;
  out['unlocks'] = system !== null ? ['systems', 'progression'] : [];
  return new ModuleDefinition(out);
}

/** The ten genre modules that come with the app. */
export const builtinModules: readonly ModuleDefinition[] = builtinModulesJson.map((m) => new ModuleDefinition(m as JsonMap));

/** Tools worked out from a module's categories, for modules made from a novel: a table for each, a board where there
 * is a choice to group by, meters where there are numbers. */
export function deriveTools(categories: readonly JsonMap[], hasSystem: boolean): JsonMap[] {
  const tools: JsonMap[] = [];
  for (const category of categories.filter((c) => c['builtin'] !== true && maps(c['fields']).length > 0)) {
    const name = str(category['name']);
    const fields = maps(category['fields']);
    const slug = dartToLowerCase(name).replace(/[^a-z0-9]+/g, '-');
    const choice = fields.find((f) => f['type'] === 'select') ?? null;
    const numbers = fields.filter((f) => f['type'] === 'number');
    if (choice !== null) {
      tools.push({
        id: `${slug}-board`,
        type: 'board',
        title: `${name} by ${dartToLowerCase(str(choice['name']))}`,
        category: name,
        groupBy: choice['name'],
        show: fields
          .filter((f) => f !== choice)
          .slice(0, 2)
          .map((f) => f['name']),
      });
    }
    tools.push({
      id: `${slug}-table`,
      type: 'table',
      title: name,
      category: name,
      fields: fields.slice(0, 5).map((f) => f['name']),
    });
    if (numbers.length > 0) {
      tools.push({
        id: `${slug}-meters`,
        type: 'meters',
        title: `${name}: ${numbers.map((f) => dartToLowerCase(str(f['name']))).join(', ')}`,
        category: name,
        fields: numbers.slice(0, 4).map((f) => f['name']),
        max: 10,
      });
    }
  }
  if (hasSystem) {
    tools.push({ id: 'system', type: 'page', title: 'Systems', to: 'systems' });
    tools.push({ id: 'progression', type: 'page', title: 'Character progression', to: 'progression' });
  }
  return tools;
}

const lower = (v: string): string => dartToLowerCase(dartTrim(v));

/** Which of a novel's categories and fields a module's own names stand for (`{categories: {name: key}, fields:
 * {"category/field": fieldId}}`), noted when it is turned on. */
export type Bindings = { categories: Map<string, string>; fields: Map<string, string> };

export function bindingsOf(raw: unknown): Bindings {
  const m = mapOrNull(raw);
  return {
    categories: new Map(Object.entries(mapOrNull(m?.['categories']) ?? {}).map(([k, v]) => [k, str(v)])),
    fields: new Map(Object.entries(mapOrNull(m?.['fields']) ?? {}).map(([k, v]) => [k, str(v)])),
  };
}

export function bindingsJson(b: Bindings): JsonMap {
  return { categories: Object.fromEntries(b.categories), fields: Object.fromEntries(b.fields) };
}

/** The novel's category a module means by one of its names: the one bound when it was turned on, or failing that the
 * one of that name. */
export function resolveCategory(name: string, categories: readonly Category[], bindings?: Bindings | null): Category | null {
  const bound = bindings?.categories.get(lower(name));
  return categories.find((c) => c.key === bound) ?? categories.find((c) => lower(c.name) === lower(name)) ?? null;
}

/** A category's field a module means by one of its names, the same way. A field the author archived is not found. */
export function resolveField(
  categoryName: string,
  category: Category | null,
  name: string,
  bindings?: Bindings | null,
): FieldDef | null {
  if (category === null) return null;
  const bound = bindings?.fields.get(`${lower(categoryName)}/${lower(name)}`);
  const fields = category.fields;
  return fields.find((f) => !f.archived && f.id === bound) ?? fields.find((f) => !f.archived && lower(f.name) === lower(name)) ?? null;
}

/** The name a built-in category goes by in a module: its original name, whatever the author has since called it. */
export const builtinCategoryLabel = (key: string): string => Category.builtin(key).name;

/** Notes which categories and fields of the novel a module's names stand for. What was noted before is kept, so a
 * renamed category or field stays the one the module uses; only names not yet bound are added. */
export function bind(definition: ModuleDefinition, categories: readonly Category[], before?: Bindings | null): Bindings {
  const cats = new Map(before?.categories ?? []);
  const fields = new Map(before?.fields ?? []);
  for (const incoming of definition.categories) {
    const builtin = incoming['builtin'] === true;
    const key = str(incoming['key']);
    const name = builtin ? (builtinCategoryKeys.includes(key) ? builtinCategoryLabel(key) : key) : str(incoming['name']);
    const known = categories.find((c) => c.key === cats.get(lower(name))) ?? null;
    const category =
      known ??
      (builtin
        ? (categories.find((c) => c.key === key) ?? null)
        : (categories.find((c) => lower(c.name) === lower(str(incoming['name']))) ?? null));
    if (category === null) continue;
    cats.set(lower(name), category.key);
    const defs = category.fields;
    for (const field of maps(incoming['fields'])) {
      const id = `${lower(name)}/${lower(str(field['name']))}`;
      if (defs.some((f) => f.id === fields.get(id))) continue;
      const def = defs.find((f) => lower(f.name) === lower(str(field['name'])));
      if (def !== undefined) fields.set(id, def.id);
    }
  }
  return { categories: cats, fields };
}

/** The author's arrangement of a module in one novel: tools hidden, their order, their names, a log's own stages, the
 * workspace's name. */
export type ModuleSettings = {
  hidden: string[];
  order: string[];
  titles: Map<string, string>;
  states: Map<string, string[]>;
  nav: string | null;
};

export function settingsOf(raw: unknown): ModuleSettings {
  const m = mapOrNull(raw);
  return {
    hidden: strings(m?.['hidden']),
    order: strings(m?.['order']),
    titles: new Map(Object.entries(mapOrNull(m?.['titles']) ?? {}).map(([k, v]) => [k, str(v)])),
    states: new Map(Object.entries(mapOrNull(m?.['states']) ?? {}).map(([k, v]) => [k, strings(v)])),
    nav: strOrNull(m?.['nav']),
  };
}

/** A module's tools as the author has arranged them here: hidden ones left out, in their order, under their names. */
export function arrangedTools(module: ModuleDefinition, settingsRaw?: unknown): JsonMap[] {
  const s = settingsOf(settingsRaw);
  const tools = module.tools;
  const ids = tools.map((t) => str(t['id']));
  const at = (id: string) => (s.order.includes(id) ? s.order.indexOf(id) : s.order.length + ids.indexOf(id));
  const shown = tools.filter((t) => !s.hidden.includes(t['id'] as string));
  const indexed: (readonly [number, JsonMap])[] = shown.map((t, i) => [i, t] as const);
  dartSort(indexed, (a, b) => {
    const c = at(str(a[1]['id'])) - at(str(b[1]['id']));
    return c !== 0 ? c : a[0] - b[0];
  });
  return indexed.map(([, tool]) => {
    const title = s.titles.get(tool['id'] as string) ?? '';
    const out: JsonMap = { ...tool, title: title.length > 0 ? title : tool['title'] };
    const states = s.states.get(tool['id'] as string);
    if (tool['type'] === 'log' && (states?.length ?? 0) > 0) out['states'] = states;
    return out;
  });
}

/** One person in a family tree, and their family as recorded. */
export class Kin {
  readonly parents: string[] = [];
  readonly children: string[] = [];
  readonly partners: string[] = [];
  readonly siblings: string[] = [];
  readonly relatives: string[] = [];
  constructor(readonly id: string) {}
}

const parentish = (role: string) => ['parent', 'mother', 'father', 'ancestor', 'grandparent'].includes(role);
const childish = (role: string) => ['child', 'son', 'daughter', 'descendant', 'heir', 'grandchild'].includes(role);

/** A family tree read off the relationships: every family relationship as it stands at the end of the story, in
 * generations. It keeps nothing of its own, so changing a relationship changes the tree. A child sits one below the
 * lowest of their parents; partners and siblings share a row. */
export function buildLineage(
  relations: readonly CharacterRelation[],
  order: StoryOrder,
  known: (id: string) => boolean,
): Kin[][] {
  const people = new Map<string, Kin>();
  const kin = (id: string): Kin => {
    let k = people.get(id);
    if (k === undefined) people.set(id, (k = new Kin(id)));
    return k;
  };
  const add = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id);
  };
  for (const relation of relations) {
    if (!known(relation.fromId) || !known(relation.toId) || relation.fromId === relation.toId) continue;
    const stage = stageAt(relation, null, order);
    if (stage === null || stage.category !== 'family') continue;
    const a = kin(relation.fromId);
    const b = kin(relation.toId);
    const from = dartToLowerCase(dartTrim(stage.fromRole));
    const to = dartToLowerCase(dartTrim(stage.toRole));
    if (stage.preset === 'parent-child' || (parentish(from) && !parentish(to)) || (childish(to) && !childish(from))) {
      add(a.children, b.id);
      add(b.parents, a.id);
    } else if (parentish(to) || childish(from)) {
      add(b.children, a.id);
      add(a.parents, b.id);
    } else if (stage.preset === 'spouses' || ['spouse', 'husband', 'wife', 'consort'].includes(from)) {
      add(a.partners, b.id);
      add(b.partners, a.id);
    } else if (stage.preset === 'siblings' || ['sibling', 'brother', 'sister'].includes(from)) {
      add(a.siblings, b.id);
      add(b.siblings, a.id);
    } else {
      add(a.relatives, b.id);
      add(b.relatives, a.id);
    }
  }
  const depth = new Map<string, number>([...people.keys()].map((id) => [id, 0]));
  for (let round = 0; round < people.size + 2; round++) {
    let moved = false;
    const raise = (id: string, to: number) => {
      if (to > depth.get(id)! && to <= people.size) {
        depth.set(id, to);
        moved = true;
      }
    };
    for (const person of people.values()) {
      for (const child of person.children) raise(child, depth.get(person.id)! + 1);
      for (const other of [...person.partners, ...person.siblings]) raise(other, depth.get(person.id)!);
    }
    if (!moved) break;
  }
  const rows = new Map<number, Kin[]>();
  for (const person of people.values()) {
    const d = depth.get(person.id)!;
    let row = rows.get(d);
    if (row === undefined) rows.set(d, (row = []));
    row.push(person);
  }
  return [...rows.keys()].sort((x, y) => x - y).map((d) => rows.get(d)!);
}
