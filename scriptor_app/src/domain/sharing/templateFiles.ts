// TEMPLATE FILES. Templates shared as files the author chooses to send: never through the app, never published.
//
// A template is plain data (names, colours, field types, options, the words of a system's rules), rebuilt here from a
// short list of known parts: anything else in a file is left out and counted. Nothing in it is ever run as code (a
// system's formulas are read by the app's own small arithmetic language, which can only compute numbers and compare
// them). An exported template is built from definitions alone, never from a novel's entries, text, notes or records, so
// it cannot carry a manuscript. A file that breaks a limit is refused whole, and nothing changes. A port of
// flutter_app/lib/shared/domain/sharing/template_files.dart (the file format is the Flutter app's: files move between
// the two apps).

import { cleanUses } from '../codex/capabilities';
import { cleanDefs } from '../codex/codexChanges';
import { type TemplateLicense, templateLicenseOf } from '../codex/templates';
import { type JsonMap, listOf, mapOrNull, numOrNull, str } from '../json';
import { builtinCategoryKeys, fieldTypeLabel, fieldTypeOf } from '../records/category';
import { maps } from '../records/jsonRecord';
import { tidyBlueprint } from '../systems/blueprints';
import { dartTrim } from '../text/dartString';

export const templateFormat = 'novel-builder/template';
export const templateFormatVersion = 1;

export type TemplateKind = 'categories' | 'profileLayout' | 'system';
export const templateKinds: readonly TemplateKind[] = ['categories', 'profileLayout', 'system'];
export const templateKindLabel: Readonly<Record<TemplateKind, string>> = {
  categories: 'Categories & fields',
  profileLayout: 'Profile layout',
  system: 'Progression system',
};
export const templateKindHint: Readonly<Record<TemplateKind, string>> = {
  categories: 'Kinds of record and the fields each has, for the codex.',
  profileLayout: 'The sections of a character profile and the fields each offers.',
  system: 'A system’s attributes, levels or stages, ranks, groups, items and tables.',
};
/** The key a file names its kind by. */
export const templateKindKey: Readonly<Record<TemplateKind, string>> = {
  categories: 'categories',
  profileLayout: 'profile-layout',
  system: 'system',
};
export function templateKindOf(key: unknown): TemplateKind | null {
  return templateKinds.find((k) => templateKindKey[k] === key) ?? null;
}

/** What a template file may hold at most. A file over any of these is refused whole. */
export const templateLimits = {
  fileBytes: 1000000,
  categories: 100,
  fieldsPerCategory: 200,
  options: 500,
  sections: 50,
  systemParts: 500,
  tableCells: 10000,
  text: 2000,
  name: 200,
} as const;

/** A template file that cannot be taken in. The message is fit to show the person. */
export class TemplateFileException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateFileException';
  }
}

const ifEmpty = (text: string, other: string) => (text.length === 0 ? other : text);

/** One template, as a file carries it: what it is, who made it, under what terms, which version, and its content. */
export class SharedTemplate {
  constructor(
    readonly kind: TemplateKind,
    /** The same on every version of one template, so a newer version is recognised as such. */
    readonly id: string,
    readonly version: number,
    readonly name: string,
    readonly description: string,
    readonly author: string,
    readonly license: TemplateLicense,
    readonly madeAt: number,
    /** Categories: `{categories: [...]}`. Profile layout: `{sections: [...]}`. System: a blueprint. */
    readonly content: JsonMap,
    /** Parts of the file that were not template data and were left out on reading it. */
    readonly leftOut: number = 0,
  ) {}

  /** What it holds, in words. */
  get summary(): string[] {
    const c = this.content;
    switch (this.kind) {
      case 'categories':
        return maps(c['categories']).map(
          (cat) =>
            `${str(cat['name'])}: ${ifEmpty(
              maps(cat['fields'])
                .map((f) => {
                  const type = fieldTypeOf(f['type']);
                  return `${str(f['name'])} (${type !== null ? fieldTypeLabel[type] : 'text'})`;
                })
                .join(', '),
              'no fields',
            )}`,
        );
      case 'profileLayout':
        return maps(c['sections']).map(
          (s) => `${str(s['name'])}: ${ifEmpty(maps(s['fields']).map((f) => str(f['name'])).join(', '), 'no fields')}`,
        );
      case 'system': {
        const out: string[] = [];
        const names = (part: string) => maps(c[part]).map((x) => str(x['name'])).join(', ');
        if (maps(c['variables']).length > 0) out.push(`Attributes: ${names('variables')}`);
        if (maps(c['tracks']).length > 0) out.push(`Levels and stages: ${names('tracks')}`);
        if (maps(c['ranks']).length > 0) out.push(`Ranks: ${names('ranks')}`);
        for (const g of maps(c['groups'])) {
          out.push(
            `${str(g['name'])}: ${ifEmpty(
              maps(c['items'])
                .filter((i) => i['groupId'] === g['id'])
                .map((i) => str(i['name']))
                .join(', '),
              'none yet',
            )}`,
          );
        }
        if (maps(c['matrices']).length > 0) out.push(`Tables: ${names('matrices')}`);
        return out;
      }
    }
  }

  toJson(): JsonMap {
    return {
      format: templateFormat,
      version: templateFormatVersion,
      kind: templateKindKey[this.kind],
      id: this.id,
      templateVersion: this.version,
      name: this.name,
      description: this.description,
      author: this.author,
      license: this.license,
      madeAt: this.madeAt,
      content: this.content,
    };
  }

  /** The file's text, indented two spaces as the Flutter app writes it. */
  toFileText(): string {
    return JSON.stringify(this.toJson(), null, 2);
  }
}

// ------------------------------------------------------------------------------------------------------- cleaning

class Reading {
  leftOut = 0;

  text(value: unknown, limit: number = templateLimits.text, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    if (typeof value !== 'string') {
      this.leftOut++;
      return fallback;
    }
    if (value.length > limit) throw new TemplateFileException(`A piece of text in it is longer than ${limit} characters.`);
    return value;
  }

  list(value: unknown, limit: number, what: string): unknown[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      this.leftOut++;
      return [];
    }
    if (value.length > limit) throw new TemplateFileException(`It holds more than ${limit} ${what}.`);
    return value;
  }

  /** Keeps only `keys` of `map`, counting what else there was. */
  only(map: JsonMap, keys: ReadonlySet<string>): JsonMap {
    const out: JsonMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (keys.has(k)) out[k] = v;
      else this.leftOut++;
    }
    return out;
  }
}

const fieldKeys = new Set(['id', 'name', 'type', 'options', 'required', 'help', 'min', 'max', 'target']);
const categoryKeys = new Set(['key', 'name', 'singular', 'color', 'builtin', 'fields', 'uses']);

function categoriesContent(content: unknown, r: Reading, newId: () => string): JsonMap {
  const c = mapOrNull(content) ?? {};
  const categories: JsonMap[] = [];
  for (const raw of r.list(c['categories'], templateLimits.categories, 'categories')) {
    const given = mapOrNull(raw);
    if (given === null) {
      r.leftOut++;
      continue;
    }
    const cat = r.only(given, categoryKeys);
    const fields: JsonMap[] = [];
    for (const f of r.list(cat['fields'], templateLimits.fieldsPerCategory, 'fields in one category')) {
      const def = mapOrNull(f);
      if (def === null) {
        r.leftOut++;
        continue;
      }
      if (def['type'] != null && fieldTypeOf(def['type']) === null) {
        throw new TemplateFileException(`It has a field of a kind this app does not know (“${String(def['type'])}”).`);
      }
      r.list(def['options'], templateLimits.options, 'choices in one field');
      for (const o of listOf(def['options'])) r.text(o, templateLimits.name);
      r.text(def['name'], templateLimits.name);
      r.text(def['help']);
      if (def['archived'] === true) continue;
      fields.push(r.only(def, fieldKeys));
    }
    const cleaned = cleanDefs(fields, newId).map((d) => r.only(d, fieldKeys));
    const name = dartTrim(r.text(cat['name'], templateLimits.name));
    const key = dartTrim(r.text(cat['key'], 64));
    const builtin = cat['builtin'] === true && builtinCategoryKeys.includes(key);
    const color = dartTrim(r.text(cat['color'], 16));
    const uses = cleanUses(cat['uses'], cleaned.map((d) => str(d['id'])));
    categories.push({
      key: builtin ? key : /^[a-z0-9-]{1,64}$/.test(key) ? key : `custom-${newId()}`,
      name: name.length === 0 ? 'Untitled category' : name,
      singular: dartTrim(r.text(cat['singular'], templateLimits.name)),
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#5c6370',
      builtin,
      fields: cleaned,
      ...(uses !== null ? { uses } : {}),
    });
  }
  return { categories };
}

function layoutContent_(content: unknown, r: Reading): JsonMap {
  const c = mapOrNull(content) ?? {};
  const sections: JsonMap[] = [];
  for (const raw of r.list(c['sections'], templateLimits.sections, 'sections')) {
    const s = mapOrNull(raw);
    if (s === null) continue;
    const section = r.only(s, new Set(['name', 'tab', 'fields']));
    const name = ifEmpty(dartTrim(r.text(section['name'], templateLimits.name)), 'Untitled section');
    const tab = section['tab'] === 'details' ? 'details' : 'overview';
    const fields: JsonMap[] = [];
    for (const f of r.list(section['fields'], templateLimits.fieldsPerCategory, 'fields in one section')) {
      const field = mapOrNull(f);
      if (field === null) continue;
      const kept = r.only(field, new Set(['name', 'type', 'options']));
      const type = kept['type'] ?? 'text';
      if (fieldTypeOf(type) === null) throw new TemplateFileException(`It has a field of a kind this app does not know (“${String(type)}”).`);
      const options: string[] = [];
      for (const o of r.list(kept['options'], templateLimits.options, 'choices in one field')) {
        const t = dartTrim(r.text(o, templateLimits.name));
        if (t.length > 0) options.push(t);
      }
      fields.push({
        name: ifEmpty(dartTrim(r.text(kept['name'], templateLimits.name)), 'Untitled field'),
        type,
        ...(options.length > 0 ? { options } : {}),
      });
    }
    sections.push({ name, tab, fields });
  }
  return { sections };
}

function systemContent_(content: unknown, r: Reading, newId: () => string): JsonMap {
  const c = mapOrNull(content) ?? {};
  for (const part of ['variables', 'tracks', 'ranks', 'groups', 'items', 'matrices']) {
    r.list(c[part], templateLimits.systemParts, 'parts of one kind');
  }
  // Every piece of text is checked against the limit before the blueprint is tidied (which keeps only known parts).
  const texts = (value: unknown, depth: number) => {
    if (depth > 8) throw new TemplateFileException('It is nested more deeply than a template ever is.');
    if (typeof value === 'string') {
      r.text(value);
    } else if (Array.isArray(value)) {
      if (value.length > templateLimits.tableCells) throw new TemplateFileException('It holds too many parts.');
      for (const v of value) texts(v, depth + 1);
    } else if (value !== null && typeof value === 'object') {
      const values = Object.values(value as JsonMap);
      if (values.length > templateLimits.tableCells) throw new TemplateFileException('It holds too many parts.');
      for (const v of values) texts(v, depth + 1);
    }
  };
  texts(c, 0);
  const tidy = tidyBlueprint(c, newId);
  // Ranks and table rows and columns are kept as names and ids only.
  const named = (raw: unknown): JsonMap => {
    const m = mapOrNull(raw) ?? {};
    return { id: ifEmpty(str(m['id']), newId()), name: ifEmpty(dartTrim(str(m['name'])), 'Unnamed') };
  };
  const before = JSON.stringify(c).length;
  const result: JsonMap = {
    ...tidy,
    ranks: maps(tidy['ranks']).map(named),
    matrices: maps(tidy['matrices']).map((m) => ({
      ...m,
      rows: listOf(m['rows']).map(named),
      columns: listOf(m['columns']).map(named),
    })),
  };
  if (JSON.stringify(result).length < before) r.leftOut++;
  return result;
}

const knownFileKeys = new Set(['format', 'version', 'kind', 'id', 'templateVersion', 'name', 'description', 'author', 'license', 'madeAt', 'content']);

/** Reads a template file, keeping only template data. Throws TemplateFileException with the reason when it cannot be
 * taken in; nothing is written either way. */
export function readTemplateFile(text: string, newId: () => string): SharedTemplate {
  if (text.length > templateLimits.fileBytes) throw new TemplateFileException('The file is larger than any template is (over 1 MB).');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new TemplateFileException('It is not a template file: it could not be read.');
  }
  const file = mapOrNull(data);
  if (file === null || file['format'] !== templateFormat) throw new TemplateFileException('It is not a Novel Builder template file.');
  if ((numOrNull(file['version']) ?? 0) > templateFormatVersion) throw new TemplateFileException('It was made by a newer version of Novel Builder.');
  const kind = templateKindOf(file['kind']);
  if (kind === null) throw new TemplateFileException(`It holds a kind of template this app does not know (“${String(file['kind'])}”).`);
  const r = new Reading();
  const content =
    kind === 'categories'
      ? categoriesContent(file['content'], r, newId)
      : kind === 'profileLayout'
        ? layoutContent_(file['content'], r)
        : systemContent_(file['content'], r, newId);
  const empty = kind === 'categories' ? maps(content['categories']).length === 0 : kind === 'profileLayout' ? maps(content['sections']).length === 0 : false;
  if (empty) throw new TemplateFileException('It holds nothing to use.');
  r.leftOut += Object.keys(file).filter((k) => !knownFileKeys.has(k)).length;
  const version = numOrNull(file['templateVersion']);
  // The same order the Dart reads these parts in (its constructor's arguments), so a refusal names the same part.
  const id = ifEmpty(dartTrim(r.text(file['id'], 100)), newId());
  const name = ifEmpty(dartTrim(r.text(file['name'], templateLimits.name)), 'Untitled template');
  const description = dartTrim(r.text(file['description']));
  const author = dartTrim(r.text(file['author'], templateLimits.name));
  return new SharedTemplate(
    kind,
    id,
    version === null || version < 1 || version > 100000 ? 1 : Math.trunc(version),
    name,
    description,
    author,
    templateLicenseOf(file['license']),
    numOrNull(file['madeAt']) ?? 0,
    content,
    r.leftOut,
  );
}

/** A template to share, built from definitions only, and read back through the same checks a received file gets, so
 * what is sent is exactly what would be taken in. */
export function makeSharedTemplate(args: {
  kind: TemplateKind;
  id: string;
  version: number;
  name: string;
  description: string;
  author: string;
  license: TemplateLicense;
  now: number;
  content: JsonMap;
  newId: () => string;
}): SharedTemplate {
  const draft = new SharedTemplate(args.kind, args.id, args.version, args.name, args.description, args.author, args.license, args.now, args.content);
  const read = readTemplateFile(JSON.stringify(draft.toJson()), args.newId);
  return new SharedTemplate(read.kind, read.id, read.version, read.name, read.description, read.author, read.license, read.madeAt, read.content);
}

/** The content of a profile layout to share: its sections and the names, kinds and choices of their fields. */
export function layoutContent(layout: JsonMap): JsonMap {
  return {
    sections: maps(layout['sections']).map((s) => ({
      name: s['name'] ?? null,
      tab: s['tab'] ?? null,
      fields: maps(s['fields']).map((f) => ({
        name: f['name'] ?? null,
        type: f['type'] ?? 'text',
        ...(f['options'] != null ? { options: f['options'] } : {}),
      })),
    })),
  };
}

/** The content of a system to share: its blueprint, without what belongs to the novel (its id, dates and any sheets). */
export function systemContent(system: JsonMap): JsonMap {
  const out: JsonMap = {};
  for (const key of ['name', 'description', 'variables', 'tracks', 'ranks', 'groups', 'items', 'matrices']) out[key] = system[key] ?? null;
  return out;
}

/** Where a received template stands against the ones already here with the same id. */
export type TemplateStanding = 'added' | 'newer' | 'sameOrOlder';

export function standingOf(incoming: SharedTemplate, held: Iterable<{ id: string; version: number }>): TemplateStanding {
  const same: number[] = [];
  for (const h of held) if (h.id === incoming.id) same.push(h.version);
  if (same.length === 0) return 'added';
  const best = same.reduce((a, b) => (a > b ? a : b));
  return incoming.version > best ? 'newer' : 'sameOrOlder';
}
