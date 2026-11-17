// Scriptor's outputs for the characters domain, keyed and shaped exactly as dump.dart makes the Flutter app's (see
// there). Hashes are of the same canonical JSON (keys sorted, whole numbers without a fraction, strings with only `"`
// and `\` escaped), FNV-1a over UTF-16 code units, in both languages.

import { appearanceMatrix } from '../../../src/domain/characters/appearances';
import {
  CastFilters,
  type Listed,
  castSorts,
  countMentions,
  facetsOf,
  listCharacters,
  matchesQuery,
  passesFilters,
  sortCharacters,
} from '../../../src/domain/characters/cast';
import { CharacterChanges, planCharacterDelete, referencesTo } from '../../../src/domain/characters/characterChanges';
import {
  type CharacterHistoryLine,
  CharacterProfile,
  CharacterSecret,
  FieldSuggestion,
  awarenessKey,
  profileTabOf,
} from '../../../src/domain/characters/characterRecords';
import { kindNote, kindOf, settled } from '../../../src/domain/characters/fieldKinds';
import { recordFromLine } from '../../../src/domain/characters/fromLine';
import {
  type Spread,
  checkKnowledge,
  knowledgeSpread,
  recordWords,
  whoKnowsWhat,
} from '../../../src/domain/characters/knowledge';
import { inSentence, loglineOf, loglineText, pronounsFor, whoFields } from '../../../src/domain/characters/logline';
import { namedIn, namedInJob, namesToFind, sightings } from '../../../src/domain/characters/namedIn';
import { readOneLine } from '../../../src/domain/characters/oneLine';
import { recordIn, recordStake } from '../../../src/domain/characters/recordLook';
import { recordWords as historyWords } from '../../../src/domain/characters/screens/history';
import { castTone, monogram } from '../../../src/domain/characters/screens/library';
import { identityFacts } from '../../../src/domain/characters/screens/vault';
import { CastData } from '../../../src/domain/characters/castData';
import { type Stake, collisions, stakesOf } from '../../../src/domain/characters/stakes';
import { builtinTemplates, slug, suggestionsFor } from '../../../src/domain/characters/templates';
import { ChangeRefused, categoriesOf } from '../../../src/domain/codex/codexChanges';
import { type JsonMap, str } from '../../../src/domain/json';
import { StateError } from '../../../src/domain/model/deletePolicy';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { blockTexts, docBlocks } from '../../../src/domain/prose';
import { stableSorted } from '../../../src/domain/reader/stableSort';
import { Category, fieldTypeOf } from '../../../src/domain/records/category';
import { Entry } from '../../../src/domain/records/entry';
import { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../../../src/domain/text/dartString';
import { dartToUpperCase } from '../../../src/domain/exchange/dartUpperCase';

// ---------------------------------------------------------------------------------------------------- hashing

export function canonical(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return `${v}`;
  if (typeof v === 'number') {
    if (Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) < 9007199254740992) return `${v === 0 ? 0 : v}`;
    return `${v}`;
  }
  if (typeof v === 'string') return `"${v.replace(/["\\]/g, '\\$&')}"`;
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v instanceof Map) return canonical(Object.fromEntries(v));
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // As Dart's `List.sort` of strings: by code units.
    const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${canonical(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return canonical(String(v));
}

export function hashOf(v: unknown): string {
  let h = 0x811c9dc5;
  const s = canonical(v);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------------------------------- reads

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function reads(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const read = new CharacterChanges(s, {
    now: 0,
    createId: () => {
      throw new StateError('reading');
    },
  });
  const cast0 = new CastData('novel', s);
  const entries = cast0.entries;
  const profiles = cast0.profiles;
  const links = cast0.links;
  const names = namesToFind(entries, profiles);
  const named = namedInJob(
    s.rows('chapterContents').map((r) => JSON.stringify(r)),
    names,
  )();
  const listOf = (n: ReadonlyMap<string, readonly string[]>) =>
    listCharacters(entries, profiles, links, model.nodes.values(), model.order.position, (e) => read.fresh(e), {
      named: n,
    });
  const plain = listOf(new Map());
  const list = listOf(named);
  const nameOf = (id: string) => model.entries.get(id)?.name ?? null;
  const ids = (l: Iterable<Listed>) => [...l].map((x) => x.entry.id);
  const listedJson = (l: Listed) => ({
    id: l.entry.id,
    profile: l.profile.raw,
    linkedIn: l.linkedIn,
    namedIn: l.namedIn,
    seenIn: l.seenIn,
    first: l.first,
    latest: l.latest,
    factions: l.factions,
  });
  const facets = facetsOf(list);
  const queries = [
    ...new Set([
      '',
      'the',
      'a',
      'zzz',
      'é',
      'MIRA kai',
      ...list.flatMap((l) => [
        ...(l.entry.name.length >= 3 ? [l.entry.name.substring(0, 3)] : []),
        dartToUpperCase(l.entry.name),
        ...l.entry.tags,
        ...l.profile.roles,
        ...l.factions,
        l.profile.epithet,
      ]),
    ]),
  ];
  const filters = new Map<string, CastFilters>([
    ['none', CastFilters.none],
    ['archived', new CastFilters({ archived: true })],
  ]);
  for (const r of facets.roles) {
    filters.set(`role:${r}`, new CastFilters({ role: r }));
    filters.set(`role-lower:${r}`, new CastFilters({ role: dartToLowerCase(r) }));
  }
  for (const v of facets.statuses) filters.set(`status:${v}`, new CastFilters({ status: dartToUpperCase(v) }));
  for (const v of facets.tags) filters.set(`tag:${v}`, new CastFilters({ tag: v }));
  for (const v of facets.species) filters.set(`species:${v}`, new CastFilters({ species: v }));
  for (const v of facets.occupations) filters.set(`occupation:${v}`, new CastFilters({ occupation: v }));
  for (const v of facets.factions) filters.set(`faction:${v}`, new CastFilters({ faction: v }));
  for (const c of model.order.chapters) {
    filters.set(`firstBy:${c.id}`, new CastFilters({ firstBy: model.order.position.get(c.id) ?? null }));
  }
  const texts = s.rows('chapterContents').flatMap((c) => docBlocks(c['doc']).map((b) => b.text));
  const pages = new Map<string, string[]>();
  for (const r of s.rows('chapterContents')) pages.set(str(r['id']), blockTexts(r['doc']));
  const documents = stableSorted(
    [...model.nodes.values()].filter((n) => n.kind === 'chapter' || n.kind === 'scene'),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  ).map((n) => n.id);
  const secrets = s.rows('characterSecrets').map((r) => new CharacterSecret(r));
  const spreadJson = (sp: Spread) => ({
    points: sp.points.map((p) => ({ id: p.id, label: p.label, marks: p.marks })),
    rows: sp.rows.map((r) => ({
      id: r.characterId,
      name: r.name,
      cells: r.cells.map((c) => ({ record: c.record?.id ?? null, here: c.here.map((x) => x.id), needs: c.needs.map((x) => x.id) })),
      now: r.now.state === null ? null : awarenessKey(r.now.state),
      unplaced: r.unplaced.map((x) => x.id),
    })),
    tellings: sp.tellings.map((t) => [t.recordId, t.fromId, t.toId, t.point]),
  });
  const cast = entries.filter((e) => e.category === 'character');
  const firstPlace = [...model.entries.values()].find((e) => e.category === 'location')?.name ?? 'Nowhere';
  const castLine = cast.map((e) => ({ id: e.id, name: e.name }));
  const characterCategory = categoriesOf(s).get('character') ?? Category.builtin('character');
  const fieldsOf = (e: Entry) => {
    const out = new Map<string, string>();
    for (const f of e.fields) out.set(dartToLowerCase(dartTrim(f.key)), f.value);
    return out;
  };
  const factsCast = { characterCategory, nameOf } as unknown as CastData;
  const firstThread = model.threads.keys().next();
  return {
    listedPlain: plain.map(listedJson),
    listed: list.map(listedJson),
    sorts: Object.fromEntries(castSorts.map((so) => [so, ids(sortCharacters(list, so))])),
    facets: [facets.roles, facets.statuses, facets.tags, facets.species, facets.occupations, facets.factions],
    queries: Object.fromEntries(queries.map((q) => [q, ids(list.filter((l) => matchesQuery(l, q, nameOf)))])),
    filters: Object.fromEntries([...filters].map(([key, value]) => [key, ids(list.filter((l) => passesFilters(l, value)))])),
    mentions: Object.fromEntries(
      list.map((l) => [l.entry.id, countMentions(texts, [l.entry.name, l.profile.epithet, ...l.profile.aliases])]),
    ),
    names,
    named,
    sightings: Object.fromEntries(
      entries.map((e) => [
        e.id,
        sightings(pages, documents, names[e.id] ?? []).map((x) => [x.nodeId, x.block, x.before, x.name, x.after]),
      ]),
    ),
    secrets: secrets.map((sc) => ({
      id: sc.id,
      groups: whoKnowsWhat(sc).map((g) => [g.state === null ? null : awarenessKey(g.state), g.ids]),
      reading: spreadJson(knowledgeSpread(sc, model, 'reading')),
      story: spreadJson(knowledgeSpread(sc, model, 'story')),
      words: sc.records.map((r) => recordWords(r, model)),
    })),
    checks: checkKnowledge(secrets, model).map((f) => [f.key, f.rule, f.secretId, f.ownerId, f.message, f.because, f.characterIds]),
    matrix: Object.fromEntries(
      (
        [
          ['chapters', { all: true }],
          ['scenes', { grain: 'scenes' }],
          ['thread', { grain: 'scenes', threadId: firstThread.done ? null : firstThread.value, all: true }],
        ] as const
      ).map(([key, filter]) => {
        const m = appearanceMatrix(model, filter);
        return [
          key,
          {
            columns: m.columns.map((c) => [c.nodeId, c.chapterId, c.chapterNumber, c.label, c.short, c.status]),
            rows: m.rows.map((r) => [r.characterId, r.name, r.recorded, r.cells.map((c) => [c.state, c.evidence.length])]),
            hidden: m.hidden,
            characters: m.characters,
          },
        ];
      }),
    ),
    refs: Object.fromEntries(cast.map((e) => [e.id, referencesTo(s, e.id).counts])),
    templates: read.templates().map((t) => [t.id, t.name, t.sections.length]),
    characters: Object.fromEntries(
      cast.map((e) => {
        const profile = read.profileOf(e);
        const fields = fieldsOf(e);
        const who = whoFields.map((n) => dartTrim(fields.get(n) ?? '')).find((v) => v.length > 0) ?? '';
        const pieces = loglineOf({
          name: e.name,
          age: fields.get('age') ?? '',
          gender: fields.get('gender') ?? fields.get('sex') ?? '',
          who: who.length > 0 ? who : profile.epithet,
          stakes: stakesOf(fields),
        });
        const other = cast.find((c) => c.id !== e.id);
        const first = other === undefined ? 'Nobody' : other.name.split(' ')[0];
        const o = readOneLine(`${e.name}, 34, a smuggler from ${firstPlace}, ${first}’s sister, hates the sea`, {
          cast: castLine,
        });
        return [
          e.id,
          {
            profile: profile.raw,
            secrets: read.secrets(e.id).map((x) => x.id),
            notes: read.notes(e.id).map((x) => x.id),
            history: read.history(e.id).map((x: CharacterHistoryLine) => [x.id, historyWords(x)]),
            facts: identityFacts(factsCast, e, profile).map((f) => [f.name, f.value]),
            tone: castTone(e.id),
            monogram: monogram(e.name),
            line: oneLineJson(o),
            logline: [pieces.map((p) => [p.text, p.part, p.gap]), loglineText(pieces), e.fields.map((f) => inSentence(f.value))],
          },
        ];
      }),
    ),
    collisions: collisions(
      cast.map((e) => ({ id: e.id, name: e.name, names: [e.name, ...read.profileOf(e).aliases], stakes: stakesOf(fieldsOf(e)) })),
      { most: 50 },
    ).map((c) => [c.a, c.b, c.why]),
  };
}

const oneLineJson = (o: ReturnType<typeof readOneLine>) => [
  o.name,
  o.age,
  o.gender,
  o.species,
  o.occupation,
  o.origin,
  o.role,
  o.epithet,
  o.ties.map((t) => [t.otherId, t.otherName, t.preset, t.newIsFrom, t.said]),
  o.summary,
];

// ---------------------------------------------------------------------------------------------------- the script

type Op = Record<string, unknown>;

export function runScript(start: NovelSnapshot, script: readonly Op[]): unknown[] {
  let snapshot = start;
  let clock = 1700000000000;
  let idCount = 0;
  const firstCharacter =
    start
      .rows('loreEntries')
      .filter((r) => r['category'] === 'character')
      .map((r) => str(r['id']))
      .sort(byText)[0] ?? null;
  const faction = start.rows('loreEntries').find((r) => r['category'] === 'faction') ?? null;
  const location = start.rows('loreEntries').find((r) => r['category'] === 'location') ?? null;
  const chapter = start.rows('chapters')[0] ?? null;
  const who = (name: unknown): string => {
    const n = name as string;
    if (n === '$first') return firstCharacter ?? 'no-character';
    if (n === '$faction') return faction === null ? 'no-faction' : str(faction['id']);
    return snapshot.rows('loreEntries').find((r) => r['category'] === 'character' && r['name'] === n)?.['id'] as string ?? n;
  };
  const value = (v: unknown): string => {
    const s = v as string;
    if (s === '$faction') return faction === null ? 'no-faction' : str(faction['id']);
    if (s === '$chapter') return chapter === null ? 'no-chapter' : str(chapter['id']);
    if (s === '$locationName') return location === null ? 'Nowhere' : str(location['name']);
    if (s.startsWith('$template:')) {
      const t = snapshot.rows('characterTemplates').find((r) => r['name'] === s.substring(10));
      return t === undefined ? 'missing-template' : str(t['id']);
    }
    if (s.startsWith('@')) return who(s.substring(1));
    return s;
  };
  const deep = (v: unknown): unknown =>
    typeof v === 'string'
      ? value(v)
      : Array.isArray(v)
        ? v.map(deep)
        : v !== null && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
          : v;
  const byTitle = (collection: string, title: unknown) =>
    str(snapshot.rows(collection).find((r) => r['title'] === title)?.['id'] ?? 'missing');
  const strs = (v: unknown) => (v === undefined || v === null ? undefined : (v as string[]));
  const out: unknown[] = [];
  for (const op of script) {
    clock += 1000;
    const c = new CharacterChanges(snapshot, { now: clock, createId: () => `id-${++idCount}` });
    const section = (entryId: string, name: unknown) => {
      const sections = c.profileOf(c.character(entryId)).sections;
      if (name === '$0') return sections.length === 0 ? 'missing-section' : sections[0].id;
      return sections.find((x) => x.name === name)?.id ?? 'missing-section';
    };
    const field = (entryId: string, key: unknown) =>
      c.character(entryId).fields.find((f) => f.key === key)?.id ?? 'missing-field';
    let outcome: unknown;
    try {
      const result = apply();
      snapshot = c.snapshot;
      outcome = { ok: result ?? null };
    } catch (e) {
      outcome =
        e instanceof ChangeRefused ? { refused: e.message } : e instanceof StateError ? { error: 'StateError' } : { error: 'other' };
    }
    const collections: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(snapshot.collections)) if (v.length > 0) collections[k] = v;
    out.push({ op: op['op'], outcome, hash: hashOf(collections) });

    function apply(): unknown {
      switch (op['op']) {
        case 'create':
          return c.create({
            name: op['name'] as string,
            epithet: (op['epithet'] as string | undefined) ?? '',
            roles: (op['roles'] as string[] | undefined) ?? [],
            summary: (op['summary'] as string | undefined) ?? '',
            templateId: op['templateId'] === undefined ? null : value(op['templateId']),
          }).id;
        case 'identity': {
          const focal = op['focal'] as { x: number; y: number } | undefined;
          const changes: Parameters<CharacterChanges['identity']>[1] = {};
          if (op['name'] !== undefined) changes.name = op['name'] as string;
          if (op['summary'] !== undefined) changes.summary = op['summary'] as string;
          if (op['epithet'] !== undefined) changes.epithet = op['epithet'] as string;
          if (op['aliases'] !== undefined) changes.aliases = op['aliases'] as string[];
          if (op['roles'] !== undefined) changes.roles = op['roles'] as string[];
          if (op['status'] !== undefined) changes.status = op['status'] as string;
          if ('image' in op) changes.image = { value: op['image'] as string | null };
          if (focal !== undefined) changes.focal = focal;
          if (op['tags'] !== undefined) changes.tags = op['tags'] as string[];
          c.identity(who(op['who']), changes);
          return null;
        }
        case 'setArchived':
          return c.setArchived(who(op['who']), op['archived'] as boolean);
        case 'reorder':
          return c.reorder((op['who'] as string[]).map(who));
        case 'addSection':
          return c.addSection(who(op['who']), op['name'] as string, profileTabOf(op['tab']));
        case 'updateSection': {
          const id = who(op['who']);
          const changes: { name?: string; hidden?: boolean; tab?: 'overview' | 'details' } = {};
          if (op['name'] !== undefined) changes.name = op['name'] as string;
          if (op['hidden'] !== undefined) changes.hidden = op['hidden'] as boolean;
          if (op['tab'] !== undefined) changes.tab = profileTabOf(op['tab']);
          return c.updateSection(id, section(id, op['section']), changes);
        }
        case 'moveSection': {
          const id = who(op['who']);
          return c.moveSection(id, section(id, op['section']), op['by'] as number);
        }
        case 'addField': {
          const id = who(op['who']);
          return c.addField(
            id,
            section(id, op['section']),
            new FieldSuggestion(op['name'] as string, fieldTypeOf(op['type']) ?? 'text', (op['options'] as string[] | undefined) ?? []),
            { value: op['value'] === undefined ? '' : value(op['value']) },
          );
        }
        case 'updateField': {
          const id = who(op['who']);
          const changes: Parameters<CharacterChanges['updateField']>[2] = {
            type: fieldTypeOf(op['type']),
            options: strs(op['options']) ?? null,
          };
          if (op['key'] !== undefined) changes.key = op['key'] as string;
          if (op['value'] !== undefined) changes.value = op['value'] as string;
          return c.updateField(id, field(id, op['field']), changes);
        }
        case 'moveField': {
          const id = who(op['who']);
          const move: { by?: number; toSection?: string } = {};
          if (op['by'] !== undefined) move.by = op['by'] as number;
          if (op['toSection'] !== undefined) move.toSection = section(id, op['toSection']);
          return c.moveField(id, field(id, op['field']), move);
        }
        case 'duplicateSection': {
          const id = who(op['who']);
          return c.duplicateSection(id, section(id, op['section'])).raw;
        }
        case 'removeSection': {
          const id = who(op['who']);
          return c.removeSection(id, section(id, op['section']), { deleteFields: (op['deleteFields'] as boolean) ?? false });
        }
        case 'applyTemplate':
          return c.applyTemplate(who(op['who']), value(op['template']));
        case 'saveTemplate':
          return c.saveTemplate(who(op['who']), op['name'] as string).raw;
        case 'removeTemplate':
          return c.removeTemplate(value(op['template']));
        case 'setLinkStatus':
          return c.setLinkStatus(who(op['who']), op['link'] as string, op['status'] as string);
        case 'linkEntries':
          return c.linkEntries(who(op['who']), who(op['other']), op['label'] as string).raw;
        case 'saveSecret':
          return c.saveSecret(
            who(op['who']),
            op['secret'] === undefined ? null : byTitle('characterSecrets', op['secret']),
            deep(op['changes']) as JsonMap,
          ).raw;
        case 'saveNote': {
          const changes: Parameters<CharacterChanges['saveNote']>[2] = {};
          if (op['title'] !== undefined) changes.title = op['title'] as string;
          if (op['content'] !== undefined) changes.content = op['content'] as string;
          if (op['tags'] !== undefined) changes.tags = op['tags'] as string[];
          if (op['pinned'] !== undefined) changes.pinned = op['pinned'] as boolean;
          if (op['nodeIds'] !== undefined) changes.nodeIds = deep(op['nodeIds']) as string[];
          return c.saveNote(who(op['who']), op['note'] === undefined ? null : byTitle('characterNotes', op['note']), changes).raw;
        }
        case 'promoteNote': {
          const noteId = byTitle('characterNotes', op['note']);
          const note = snapshot.rows('characterNotes').find((r) => r['id'] === noteId);
          const sectionId = note === undefined ? 'missing-section' : section(str(note['entryId']), op['section']);
          return c.promoteNote(noteId, sectionId, op['field'] as string);
        }
        case 'addMilestone':
          return c.addMilestone(who(op['who']), op['text'] as string, op['node'] === undefined ? null : value(op['node'])).raw;
        case 'removeMilestone': {
          const id = who(op['who']);
          const line = snapshot.rows('characterHistory').find((r) => r['entryId'] === id && r['kind'] === op['line']);
          return c.removeMilestone(line === undefined ? 'missing' : str(line['id']));
        }
        case 'removeField': {
          const id = who(op['who']);
          return c.removeField(id, field(id, op['field']));
        }
        case 'recordIn':
          return recordIn(c, who(op['who']), op['label'] as string, op['names'] as string[], op['value'] as string, {
            sections: op['sections'] as string[],
            newSection: op['newSection'] as string,
          });
        case 'recordStake':
          return recordStake(c, who(op['who']), op['stake'] as Stake, op['value'] as string);
        case 'recordFromLine':
          return recordFromLine(
            c,
            who(op['who']),
            new Map((op['fields'] as [string, string][]).map(([k, v]) => [k, value(v)])),
            (op['ties'] as [string, string, boolean][]).map(([other, preset, newIsFrom]) => ({
              otherId: value(other),
              otherName: '',
              preset,
              newIsFrom,
              said: '',
            })),
          );
        case 'removeNote':
          return c.removeNote(byTitle('characterNotes', op['note']));
        case 'removeSecret':
          return c.removeSecret(byTitle('characterSecrets', op['secret']));
        case 'delete':
          c.snapshot = planCharacterDelete(c.snapshot, who(op['who'])).snapshot;
          return null;
        default:
          throw new StateError(`Unknown op ${String(op['op'])}`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------- misc

export function misc(): Record<string, unknown> {
  const lines = [
    'Mira Vance, 34, a smuggler from Glass River, Kai’s sister',
    'Tam, Ilse’s apprentice',
    'Orla, Kit’s mother; an old woman — from Vell',
    'Ned, Marrow’s cousin',
    'Sefa Quill the Factor, an elf, aged 120, the villain, hates the sea',
    'Bram, called the Ox, an old man, from Vell',
    'James',
    '',
    '  ,  ,',
    'Kit Marrow, 12 years old, the hero, a thief of the Salt Guild',
    'Lena, known as Wren, a young witch, KAI DOYLE’S RIVAL, half-elf',
    'Old Tam, aged 70, born in Merrow, an android, ilse’s friend and Kai’s enemy',
    'Ana, 300 yrs, a dragon-rider from the North, a woman of the sea',
    'Él, the Prince, the protagonist',
  ];
  const cast = [
    { id: 'kai', name: 'Kai Doyle' },
    { id: 'ilse', name: 'Ilse Marrow' },
    { id: 'kit', name: 'Kit Marrow' },
  ];
  const values = [
    'To open the last door.',
    'Revenge on his father',
    'The Architect',
    'Kai’s betrayal',
    'Old Tam',
    'NASA',
    '  his   sister;  ',
    'A',
    'a b',
    'Élan vital',
    'İstanbul',
    '',
    '...',
    'X.',
  ];
  const kindNames = ['Gender', ' sex ', 'PRONOUNS', 'age', 'Date of Birth', 'birthday', 'Alignment', 'Loyalty', 'Occupation', ''];
  const sayings = ['male', 'Man', 'boy', 'F', 'woman', 'She', 'he', 'his', 'Unknown', '', ' 21 ', 'chaotic neutral', 'lawful EVIL', 'she / her'];
  const st = (o: Partial<Record<Stake, string>>) => new Map(Object.entries(o) as [Stake, string][]);
  return {
    lines: lines.map((l) => oneLineJson(readOneLine(l, { cast }))),
    inSentence: values.map(inSentence),
    pronouns: ['Male', ' woman ', 'm', 'F', 'boy', 'x', ''].map((g) => pronounsFor(g).they),
    kinds: kindNames.map((n) => {
      const k = kindOf(n);
      return k === null ? null : [k.type, k.options, kindNote(n, k)];
    }),
    settled: ['Gender', 'Pronouns', 'Alignment', 'Age'].map((n) => sayings.map((v) => settled(kindOf(n), v))),
    slugs: ['Core Identity', '  ', 'Lineage & Magic', 'Ünïcode', '--a--', 'Goals & Stakes!'].map(slug),
    suggestions: (
      [
        ['Core Identity', []],
        [' core identity ', ['Age', 'gender']],
        ['Character Arc', ['Starting Point']],
        ['The Case', ['MOTIVE']],
        ['Nope', []],
      ] as [string, string[]][]
    ).map(([sec, have]) => suggestionsFor(sec, builtinTemplates, have).map((f) => f.toJson())),
    mentions: [
      countMentions(['Kael drew. "Kaelen!" The Oathbreaker. Mikael. kael_x kael'], ['Kaelen Draven', 'Kael', 'The Oathbreaker']),
      countMentions(['Dr. A.B. Stone and AxB, A.B.C.'], ['A.B.', 'Dr.']),
      countMentions(['ÉMILE émile Emile'], ['Émile']),
    ],
    sightings: sightings(
      new Map([
        ['c1', ['The bell rang.', 'Wren dropped the ink. It went across the floor.']],
        ['c2', ['Nobody came. Wren?” he asked.']],
        ['c3', ['“Wren,” said Ilse Marrow. “Wipe it up.”']],
        ['c4', [`${Array(60).fill('and the sea').join(' ')} Wren ${Array(60).fill('went out').join(' ')}.`]],
        ['c5', ['Wren Hollis came.', 'Wren went.']],
      ]),
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
      ['Wren', 'Wren Hollis', ' ', 'Wren'],
    ).map((x) => [x.nodeId, x.block, x.before, x.name, x.after]),
    namedIn: namedIn(
      new Map([
        ['c1', 'Wren looked up. The Drowned Road rose out of the bay.'],
        ['c2', 'A wren sang on the wall. Wrenfield was quiet. O’Brien came.'],
        ['c3', 'They spoke of the drowned road, and of Wren’s map. Mira  Vance.'],
        ['c4', ''],
        ['c5', 'Mira Vance and O’Brien'],
      ]),
      {
        wren: ['Wren Hollis', 'Wren'],
        road: ['The Drowned Road', 'Drowned Road'],
        mira: ['Mira Vance'],
        ob: ['O’Brien'],
        none: ['', '  '],
      },
    ),
    names: namesToFind(
      (
        [
          ['ilse', 'Ilse Marrow', 'character'],
          ['kit', 'Kit Marrow', 'character'],
          ['crane', 'Aldous Crane', 'character'],
          ['rose', 'Rose Hale', 'character'],
          ['north', 'Jon North', 'character'],
          ['van', 'Piet van Dyke', 'character'],
          ['road', 'The Drowned Road', 'location'],
          ['the', 'The Fen', 'location'],
          ['wren', 'Wren', 'character'],
          ['blank', '   ', 'character'],
        ] as const
      ).map(([id, name, category]) => new Entry({ id, name, category })),
      new Map([
        ['crane', new CharacterProfile({ id: 'p', entryId: 'crane', epithet: 'the Provost', aliases: ['Old Crane', ' ', 'X'] })],
        ['wren', new CharacterProfile({ id: 'q', entryId: 'wren', epithet: 'the Grey', aliases: [] })],
      ]),
    ),
    logline: (
      [
        ['Male', st({ wants: 'To open the last door.', inTheWay: 'The Architect.', atStake: 'His sister.' })],
        ['', st({})],
        ['woman', st({ wants: 'out' })],
      ] as const
    ).map(([gender, stakes]) => {
      const pieces = loglineOf({ name: 'Mark', age: gender.length === 0 ? '' : '21', gender, who: 'A locksmith', stakes });
      return [pieces.map((p) => [p.text, p.part, p.gap]), loglineText(pieces)];
    }),
    stakes: [
      { 'what they want': ' x ', goal: 'y', motivations: 'm' },
      { motivations: ' m ' },
      { obstacles: 'o', stakes: 's', ending: 'e', needs: 'n' },
    ].map((f) => Object.fromEntries(stakesOf(new Map(Object.entries(f))))),
    collisions: collisions([
      { id: 'a', name: 'Ann', names: ['Ann', 'Annie'], stakes: st({ wants: 'To find the chart before Bo does' }) },
      { id: 'b', name: 'Bo', names: ['Bo'], stakes: st({ wants: 'The charts of the bay', inTheWay: 'annie' }) },
      { id: 'c', name: 'Cy', names: ['Cy'], stakes: st({ wants: 'Chartered ships' }) },
      { id: 'd', name: 'Di', names: ['D'], stakes: st({ wants: 'Something else entirely, the chartroom' }) },
    ]).map((c) => [c.a, c.b, c.why]),
    tones: ['a', 'kael-1', '00000000-0000-4000-8000-000000000002', 'ü'].map(castTone),
    monograms: ['Kai & Ren', 'Mira', '  ', 'Old Tam', 'élan Vital', '_x y', '1 2 3'].map(monogram),
    freshOrder: new CharacterChanges(new NovelSnapshot({ project: { id: 'p' }, collections: {} }), {
      now: 5,
      createId: () => 'x',
    })
      .templates()
      .map((t) => t.id),
  };
}
