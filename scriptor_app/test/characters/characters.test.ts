// The characters: a port of flutter_app/test/shared/domain/characters_test.dart (itself the original app's character
// tests): the same scenarios, the same expectations, against the TypeScript port of the character changes.

import {
  CastFilters,
  type Listed,
  countMentions,
  facetsOf,
  listCharacters,
  matchesQuery,
  passesFilters,
  sortCharacters,
} from '../../src/domain/characters/cast';
import {
  CharacterChanges,
  planCharacterDelete,
  referencesTo,
  sameEditMs,
} from '../../src/domain/characters/characterChanges';
import {
  type CharacterHistoryLine,
  CharacterProfile,
  CharacterSecret,
  FieldSuggestion,
  type ProfileTab,
} from '../../src/domain/characters/characterRecords';
import { kindNote, kindOf, settled } from '../../src/domain/characters/fieldKinds';
import { recordIn } from '../../src/domain/characters/recordLook';
import { builtinTemplates, sectionsOf, suggestionsFor } from '../../src/domain/characters/templates';
import { ChangeRefused } from '../../src/domain/codex/codexChanges';
import { checkValue } from '../../src/domain/codex/fieldValues';
import { jsonEquals, str } from '../../src/domain/json';
import { StoryOrder } from '../../src/domain/model/storyOrder';
import { Category } from '../../src/domain/records/category';
import { Entry } from '../../src/domain/records/entry';
import { Link } from '../../src/domain/records/link';
import { StoryNode } from '../../src/domain/records/storyNode';
import { duplicateNovel, foreignReferences } from '../../src/domain/snapshot/copy';

import { World } from './world';

const line = (h: CharacterHistoryLine) => `${h.action}|${h.label}|${h.from}|${h.to}`;
const refused = (f: () => unknown, message?: string) => {
  let error: unknown = null;
  try {
    f();
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ChangeRefused);
  if (message !== undefined) expect((error as ChangeRefused).message).toBe(message);
};
const sorted = (xs: string[]) => [...xs].sort();

describe('a character is one record', () => {
  test('is created as a codex entry in Characters, with a profile beside it', () => {
    const w = new World();
    const sera = w.act((c) =>
      c.create({
        name: 'Seraphina Valdris',
        epithet: 'The Last Heir',
        roles: ['Protagonist'],
        summary: 'First daughter of House Valdris.',
      }),
    );
    expect([sera.category, sera.name, sera.summary, sera.projectId]).toEqual([
      'character',
      'Seraphina Valdris',
      'First daughter of House Valdris.',
      'novel',
    ]);
    expect(w.rows('loreEntries').map((r) => r['id'])).toEqual([sera.id]);
    const profile = w.profile(sera.id);
    expect([profile.entryId, profile.epithet, profile.roles, profile.archived]).toEqual([
      sera.id,
      'The Last Heir',
      ['Protagonist'],
      false,
    ]);
    expect(profile.sections.map((s) => [s.name, s.tab, s.fieldIds.length])).toEqual([
      ['Core Identity', 'overview', 0],
      ['Personality & Psychology', 'overview', 0],
      ['Character Arc', 'overview', 0],
      ['Resources & Position', 'overview', 0],
      ['Biography & History', 'details', 0],
      ['Appearance', 'details', 0],
    ]);
    expect(w.rows('characterProfiles')).toHaveLength(1);
    refused(() => w.act((c) => c.create({ name: '  ' })), 'Give the character a name.');
    // Nothing else is required: no summary, no role, no portrait.
    const nobody = w.act((c) => c.create({ name: 'Nobody' }));
    expect([nobody.name, nobody.summary, nobody.image]).toEqual(['Nobody', '', null]);
  });

  test('gives a character made in the Codex the same profile, without writing anything until it is changed', () => {
    const w = new World();
    const old = w.act((c) => c.createEntry('character', 'Old Tam'));
    w.snapshot = w.snapshot.putRow('loreEntries', w.entry(old.id).merged({ fields: [{ id: 'a', key: 'Age', value: '70' }] }));
    const before = w.snapshot.toJson();
    expect(w.profile(old.id).sections.map((s) => s.name)).toContain('Core Identity');
    expect(jsonEquals(w.snapshot.toJson(), before)).toBe(true);
    // The field written in the Codex is the character's field: not copied, the same one.
    w.act((c) => c.updateField(old.id, 'a', { value: '71' }));
    expect(w.entry(old.id).raw['fields']).toEqual([{ id: 'a', key: 'Age', value: '71' }]);
    expect(w.rows('characterProfiles')).toHaveLength(0);
    w.act((c) => c.identity(old.id, { epithet: 'The Ferryman' }));
    expect(w.rows('characterProfiles')).toHaveLength(1);
    // Only characters have profiles.
    const place = w.act((c) => c.createEntry('location', 'Emberhold'));
    refused(() => w.profile(place.id));
  });

  test('keeps identity where it belongs and notes each change, folding quick edits into one line', () => {
    const w = new World();
    const id = w.createCharacter('Marcus');
    w.act((c) =>
      c.identity(id, {
        name: 'Marcus Vell',
        epithet: 'The Oathbreaker',
        aliases: ['Marc', 'Marc', ' The Wolf '],
        roles: ['Antagonist', 'Supporting'],
        status: 'Alive',
        summary: 'A soldier.',
        focal: { x: 130, y: -4 },
        tags: ['guard'],
      }),
    );
    const p = w.profile(id);
    expect([p.epithet, p.aliases, p.roles, p.status, p.focal]).toEqual([
      'The Oathbreaker',
      ['Marc', 'The Wolf'],
      ['Antagonist', 'Supporting'],
      'Alive',
      { x: 100, y: 0 },
    ]);
    w.act((c) => c.identity(id, { summary: 'A soldier, then a commander.' }));
    w.act((c) => c.identity(id, { image: { value: 'data:image/png;base64,AAAA' } }));
    w.act((c) => c.identity(id, { image: { value: null } }));
    expect(sorted(w.history(id).map(line))).toEqual(
      sorted([
        'created|Marcus||',
        'identity|Name|Marcus|Marcus Vell',
        'identity|Summary||A soldier, then a commander.',
        'identity|Title||The Oathbreaker',
        'identity|Aliases||Marc, The Wolf',
        'identity|Role||Antagonist, Supporting',
        'identity|Status||Alive',
        'portrait|added||',
        'portrait|removed||',
      ]),
    );
  });
});

describe('sections and fields', () => {
  test('lets the author add, rename, reorder, hide, duplicate and remove sections', () => {
    const w = new World();
    const id = w.createCharacter('Kael', { templateId: 'supporting' });
    const names = (tab: ProfileTab = 'overview') =>
      w
        .profile(id)
        .sections.filter((s) => s.tab === tab)
        .map((s) => s.name);
    expect(names()).toEqual(['Core Identity', 'Role in the Story', 'Personality']);
    w.act((c) => c.addSection(id, 'Magic'));
    const magic = w.profile(id).sections.find((s) => s.name === 'Magic')!.id;
    w.act((c) => c.moveSection(id, magic, -1));
    w.act((c) => c.moveSection(id, magic, -1));
    expect(names()).toEqual(['Core Identity', 'Magic', 'Role in the Story', 'Personality']);
    w.act((c) => c.moveSection(id, magic, -1));
    w.act((c) => c.moveSection(id, magic, -1));
    expect(names()[0]).toBe('Magic');
    w.act((c) => c.updateSection(id, magic, { name: 'Lineage & Magic', hidden: true }));
    const renamed = w.profile(id).sections.find((s) => s.id === magic)!;
    expect([renamed.name, renamed.hidden]).toEqual(['Lineage & Magic', true]);
    refused(() => w.act((c) => c.updateSection(id, magic, { name: ' ' })));
    refused(() => w.act((c) => c.addSection(id, '')));

    const school = w.act((c) => c.addField(id, magic, new FieldSuggestion('School'), { value: 'Ash' }));
    w.act((c) => c.addField(id, magic, new FieldSuggestion('Tier', 'number'), { value: '3' }));
    const copy = w.act((c) => c.duplicateSection(id, magic));
    expect(
      w
        .profile(id)
        .sections.map((s) => s.name)
        .slice(0, 2),
    ).toEqual(['Lineage & Magic', 'Lineage & Magic (copy)']);
    const fields = new Map(w.entry(id).fields.map((f) => [f.id, f]));
    expect(copy.fieldIds.map((fid) => [fields.get(fid)!.key, fields.get(fid)!.value, fields.get(fid)!.type])).toEqual([
      ['School', '', null],
      ['Tier', '', 'number'],
    ]);

    // Removing a section leaves what was written, unless the author says to delete it too.
    w.act((c) => c.removeSection(id, magic));
    expect(w.entry(id).fields.find((f) => f.id === school['id'])!.value).toBe('Ash');
    w.act((c) => c.removeSection(id, copy.id, { deleteFields: true }));
    expect(w.entry(id).fields.map((f) => f.key)).toEqual(['School', 'Tier']);
    expect(w.profile(id).sections.some((s) => s.name.startsWith('Lineage'))).toBe(false);
  });

  test('lets the author add, rename, retype, reorder, move, edit and remove fields, of every type', () => {
    const w = new World();
    const id = w.createCharacter('Kael');
    const guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
    const identity = w.sectionId(id, 0);
    const psyche = w.sectionId(id, 1);
    const add = (f: FieldSuggestion, value: string) => str(w.act((c) => c.addField(id, identity, f, { value }))['id']);
    const age = add(new FieldSuggestion('Age'), '27');
    const traits = add(new FieldSuggestion('Core Traits', 'tags'), 'Brooding\nLoyal');
    const faction = add(new FieldSuggestion('Faction', 'reference'), guild.id);
    const oath = add(new FieldSuggestion('Oathbound', 'toggle'), 'yes');
    const rankRow = w.act((c) =>
      c.addField(id, identity, new FieldSuggestion('Rank', 'select', ['Squire', 'Knight', 'Knight']), { value: 'Knight' }),
    );
    const rank = str(rankRow['id']);
    expect(rankRow['options']).toEqual(['Squire', 'Knight']);
    const ids = (sectionId: string) => w.profile(id).sections.find((s) => s.id === sectionId)!.fieldIds;
    expect(ids(identity)).toEqual([age, traits, faction, oath, rank]);

    w.act((c) => c.moveField(id, rank, { by: -1 }));
    w.act((c) => c.moveField(id, age, { by: -1 }));
    expect(ids(identity)).toEqual([age, traits, faction, rank, oath]);
    w.act((c) => c.moveField(id, traits, { toSection: psyche }));
    expect([ids(identity), ids(psyche)]).toEqual([[age, faction, rank, oath], [traits]]);

    w.act((c) => c.updateField(id, age, { key: 'Age in years', type: 'number', value: '28' }));
    w.act((c) => c.updateField(id, faction, { value: '' }));
    w.act((c) => c.updateField(id, traits, { value: 'Brooding\nLoyal\nGuarded' }));
    expect(w.entry(id).fields.find((f) => f.id === age)!.raw).toEqual({
      id: age,
      key: 'Age in years',
      value: '28',
      type: 'number',
    });
    refused(() => w.act((c) => c.updateField(id, age, { key: '' })));
    refused(() => w.act((c) => c.addField(id, identity, new FieldSuggestion(''))));
    refused(() => w.act((c) => c.updateField(id, 'nope', { value: 'x' })));

    // History says what changed, in words, with a linked entry by its name.
    const lines = w
      .history(id)
      .filter((h) => h.action === 'field')
      .map((h) => `${h.label}: ${h.from} → ${h.to}`);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Age in years: 27 → 28',
        'Faction: Ash Guild → ',
        'Core Traits: Brooding, Loyal → Brooding, Loyal, Guarded',
      ]),
    );

    w.act((c) => c.removeField(id, oath));
    expect(ids(identity)).toEqual([age, faction, rank]);
    expect(w.entry(id).fields.some((f) => f.id === oath)).toBe(false);
  });

  test('folds a run of edits to one field into a single line, and drops it if the value ends where it began', () => {
    const w = new World();
    const id = w.createCharacter('Marcus');
    const job = str(
      w.act((c) => c.addField(id, w.sectionId(id, 0), new FieldSuggestion('Occupation'), { value: 'Soldier' }))['id'],
    );
    for (const value of ['C', 'Co', 'Commander']) w.act((c) => c.updateField(id, job, { value }));
    const lines = () =>
      w
        .history(id)
        .filter((h) => h.action === 'field')
        .map((h) => `${h.label}: ${h.from} → ${h.to}`);
    expect(lines()).toEqual(['Occupation: Soldier → Commander']);
    w.act((c) => c.updateField(id, job, { value: 'Soldier' }));
    expect(lines()).toEqual([]);
    // Ten minutes later, a change is a line of its own.
    w.act((c) => c.updateField(id, job, { value: 'General' }), sameEditMs);
    expect(lines()).toEqual(['Occupation: Soldier → General']);
  });

  test('offers a section’s usual fields without storing any until one is added', () => {
    const w = new World();
    const id = w.createCharacter('Kael', { templateId: 'suspect' });
    expect(w.profile(id).sections.map((s) => s.name)).toEqual([
      'Identity',
      'The Case',
      'Reveal',
      'Personality & Psychology',
      'Biography & History',
    ]);
    expect(w.entry(id).fields).toHaveLength(0);
    const offered = suggestionsFor('The Case', w.read.templates(), ['Motive']);
    expect(offered.map((f) => f.name)).toEqual([
      'Means',
      'Opportunity',
      'Alibi',
      'Alibi holds?',
      'Evidence for',
      'Evidence against',
    ]);
    expect(offered.find((f) => f.name === 'Alibi holds?')!.type).toBe('toggle');
    expect(suggestionsFor('A section of my own', w.read.templates(), [])).toEqual([]);
    for (const template of builtinTemplates) {
      expect(new Set(sectionsOf(template).map((s) => s['id'])).size).toBe(template.sections.length);
    }
  });

  test('applies a template by adding what is missing, and saves a layout for other characters', () => {
    const w = new World();
    const a = w.createCharacter('A', { templateId: 'supporting' });
    w.act((c) => c.addField(a, w.sectionId(a, 0), new FieldSuggestion('Age'), { value: '30' }));
    w.act((c) => c.applyTemplate(a, 'fantasy'));
    const names = w.profile(a).sections.map((s) => s.name);
    expect(names).toEqual([
      'Core Identity',
      'Role in the Story',
      'Personality',
      'Biography & History',
      'Lineage & Magic',
      'Personality & Psychology',
      'Character Arc',
      'Allegiances',
      'Appearance',
    ]);
    expect(w.entry(a).fields.map((f) => [f.key, f.value])).toEqual([['Age', '30']]);

    const saved = w.act((c) => c.saveTemplate(a, 'My cast'));
    // An Age is a number (fieldKinds.ts), so the layout keeps it as one.
    expect(saved.sections[0].toJson()).toEqual({
      name: 'Core Identity',
      tab: 'overview',
      fields: [{ name: 'Age', type: 'number' }],
    });
    const b = w.createCharacter('B', { templateId: saved.id });
    expect(w.profile(b).sections.map((s) => s.name)).toEqual(names);
    expect(suggestionsFor('Core Identity', [saved], []).map((f) => f.name)).toEqual(['Age']);
    w.act((c) => c.removeTemplate(saved.id));
    expect(w.read.templates()).toHaveLength(builtinTemplates.length);
    refused(() => w.act((c) => c.applyTemplate(a, saved.id)));
  });

  test('a shared field of every character is set by its definition, and offered without being stored', () => {
    const w = new World();
    w.snapshot = w.snapshot.putRow('loreSchemas', {
      ...Category.builtin('character').toJson(),
      id: 'character',
      fields: [{ id: 'def-sanity', name: 'Sanity', type: 'number', options: [], min: 0, max: 100 }],
    });
    const id = w.createCharacter('Kael');
    expect(w.entry(id).fields).toHaveLength(0);
    w.act((c) => c.setFieldValue(id, 'def-sanity', '120'));
    const [field] = w.entry(id).fields;
    expect(w.entry(id).fields).toHaveLength(1);
    expect([field.key, field.value, field.defId, field.type]).toEqual(['Sanity', '120', 'def-sanity', 'number']);
    const [def] = w.read.category('character').fields;
    expect(checkValue(def, field.value, new Map())?.message).toBe('Sanity should be at most 100; it is 120.');
    refused(() => w.act((c) => c.setFieldValue(id, 'nope', '1')));
  });
});

describe('the library', () => {
  function cast() {
    const w = new World();
    w.chapter('one', { order: 0, mentions: [] });
    w.chapter('two', { order: 1 });
    w.chapter('three', { order: 2 });
    const kael = w.createCharacter('Kaelen Draven', { epithet: 'The Oathbreaker', roles: ['Protagonist'] });
    w.act((c) => c.identity(kael, { summary: 'A disgraced knight.' }));
    const sera = w.createCharacter('Seraphina Valdris', { roles: ['Antagonist', 'Supporting'] });
    w.act((c) => c.identity(sera, { summary: 'First daughter of House Valdris.' }));
    const tam = w.createCharacter('Old Tam', { roles: ['Minor'] });
    const guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
    w.act((c) => c.linkEntries(kael, guild.id, 'Captain'));
    w.act((c) => c.identity(kael, { aliases: ['Kael'], status: 'Alive', tags: ['knight'] }));
    w.act((c) => c.identity(sera, { status: 'Alive', tags: ['noble', 'knight'] }));
    w.act((c) => c.identity(tam, { status: 'Deceased' }));
    w.act((c) => c.addField(kael, w.sectionId(kael, 0), new FieldSuggestion('Species'), { value: 'Human' }));
    w.act((c) => c.addField(kael, w.sectionId(kael, 0), new FieldSuggestion('Occupation'), { value: 'Warrior' }));
    w.act((c) => c.addField(sera, w.sectionId(sera, 0), new FieldSuggestion('Species'), { value: 'Elf' }));
    w.act((c) =>
      c.addField(sera, w.sectionId(sera, 0), new FieldSuggestion('Backstory', 'longtext'), {
        value: 'Raised among wolves.',
      }),
    );
    w.chapter('one', { order: 0, mentions: [sera] });
    w.chapter('two', { order: 1, mentions: [kael] });
    w.chapter('three', { order: 2, mentions: [sera] });
    const read = (): Listed[] => {
      const nodes = w.rows('chapters').map((r) => new StoryNode(r));
      const list = listCharacters(
        w.rows('loreEntries').map((r) => new Entry(r)),
        new Map(w.rows('characterProfiles').map((r) => [str(r['entryId']), new CharacterProfile(r)])),
        w.rows('loreLinks').map((r) => new Link(r)),
        nodes,
        StoryOrder.of(nodes).position,
        (e) => w.read.fresh(e),
      );
      // In the order they were made.
      return list.sort((a, b) => a.profile.order - b.profile.order);
    };
    return { w, kael, sera, tam, read };
  }

  const firstNames = (l: Iterable<Listed>) => [...l].map((x) => x.entry.name.split(' ')[0]);

  test('finds a character by name, alias, epithet, summary, tag, role, faction or a field, and only real ones', () => {
    const c = cast();
    const list = c.read();
    const names = new Map(c.w.rows('loreEntries').map((r) => [str(r['id']), str(r['name'])]));
    const find = (q: string) => firstNames(list.filter((l) => matchesQuery(l, q, (id) => names.get(id) ?? null)));
    expect(find('')).toEqual(['Kaelen', 'Seraphina', 'Old']);
    expect(find('The Oathbreaker')).toEqual(['Kaelen']);
    expect(find('oathbreaker kael')).toEqual(['Kaelen']);
    expect(find('KAEL')).toEqual(['Kaelen']);
    expect(find('valdris')).toEqual(['Seraphina']);
    expect(find('knight')).toEqual(['Kaelen', 'Seraphina']);
    expect(find('antagonist')).toEqual(['Seraphina']);
    expect(find('ash guild')).toEqual(['Kaelen']);
    expect(find('warrior')).toEqual(['Kaelen']);
    expect(find('elf')).toEqual(['Seraphina']);
    // Long passages are not searched here (project search is for that), and nothing is invented.
    expect(find('wolves')).toEqual([]);
    expect(find('zzz')).toEqual([]);
    // Accents are ignored, as in the original.
    expect(find('séraphina')).toEqual(['Seraphina']);
  });

  test('filters by role, status, tag, species, occupation, faction and first appearance; two roles at once', () => {
    const c = cast();
    const list = c.read();
    const only = (f: CastFilters) => firstNames(list.filter((l) => passesFilters(l, f)));
    expect(only(new CastFilters({ role: 'Antagonist' }))).toEqual(['Seraphina']);
    expect(only(new CastFilters({ role: 'supporting' }))).toEqual(['Seraphina']);
    expect(only(new CastFilters({ status: 'Deceased' }))).toEqual(['Old']);
    expect(only(new CastFilters({ tag: 'knight' }))).toEqual(['Kaelen', 'Seraphina']);
    expect(only(new CastFilters({ species: 'Elf' }))).toEqual(['Seraphina']);
    expect(only(new CastFilters({ occupation: 'Warrior' }))).toEqual(['Kaelen']);
    expect(only(new CastFilters({ faction: 'Ash Guild' }))).toEqual(['Kaelen']);
    expect(only(new CastFilters({ firstBy: 0 }))).toEqual(['Seraphina']);
    expect(only(new CastFilters({ firstBy: 1 }))).toEqual(['Kaelen', 'Seraphina']);
    const f = facetsOf(list);
    expect([f.roles, f.statuses, f.tags, f.species, f.occupations, f.factions]).toEqual([
      ['Antagonist', 'Minor', 'Protagonist', 'Supporting'],
      ['Alive', 'Deceased'],
      ['knight', 'noble'],
      ['Elf', 'Human'],
      ['Warrior'],
      ['Ash Guild'],
    ]);

    // Archived characters are out of the library until asked for, and nothing else about them changes.
    c.w.act((x) => x.setArchived(c.tam, true));
    const again = c.read();
    expect(firstNames(again.filter((l) => passesFilters(l, CastFilters.none)))).toEqual(['Kaelen', 'Seraphina']);
    expect(firstNames(again.filter((l) => passesFilters(l, new CastFilters({ archived: true }))))).toEqual(['Old']);
    c.w.act((x) => x.setArchived(c.tam, false));
    expect(
      c.w
        .history(c.tam)
        .map((h) => h.action)
        .slice(0, 2),
    ).toEqual(['restored', 'archived']);
  });

  test('sorts by name, dates, appearances and the author’s own order', () => {
    const c = cast();
    const list = c.read();
    expect(list.map((l) => [l.entry.name.split(' ')[0], l.linkedIn.length, l.first, l.latest])).toEqual([
      ['Kaelen', 1, 1, 1],
      ['Seraphina', 2, 0, 2],
      ['Old', 0, -1, -1],
    ]);
    expect(firstNames(sortCharacters(list, 'name'))).toEqual(['Kaelen', 'Old', 'Seraphina']);
    expect(firstNames(sortCharacters(list, 'first'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(firstNames(sortCharacters(list, 'latest'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(firstNames(sortCharacters(list, 'appearances'))).toEqual(['Seraphina', 'Kaelen', 'Old']);
    expect(firstNames(sortCharacters(list, 'custom'))).toEqual(['Kaelen', 'Seraphina', 'Old']);
    c.w.act((x) => x.reorder([c.tam, c.sera, c.kael]));
    expect(firstNames(sortCharacters(c.read(), 'custom'))).toEqual(['Old', 'Seraphina', 'Kaelen']);
  });

  test('counts name mentions as whole words, and says nothing more than that', () => {
    const texts = [
      'Kael drew his sword. "Kaelen!" she cried. The Oathbreaker did not turn.',
      'Mikael, not Kael’s brother, laughed. kael.',
    ];
    expect(countMentions(texts, ['Kaelen Draven', 'Kael', 'The Oathbreaker'])).toBe(4);
    expect(countMentions(texts, ['Kael'])).toBe(3);
    expect(countMentions(texts, ['K', ''])).toBe(0);
    expect(countMentions([], ['Kael'])).toBe(0);
    // Punctuation in a name is matched as written, not as a pattern.
    expect(countMentions(['Dr. A.B. Stone and AxB'], ['A.B.'])).toBe(1);
  });
});

describe('secrets, notes and history', () => {
  test('keeps apart what is true, what the character knows, what others know and what the reader knows', () => {
    const w = new World();
    const kael = w.createCharacter('Kael');
    const mira = w.createCharacter('Mira');
    const tam = w.createCharacter('Tam');
    const secret = w.act((c) =>
      c.saveSecret(kael, null, {
        title: 'True heir',
        description: 'Kael is the king’s son.',
        self: 'unaware',
        knows: [tam, kael],
        suspects: [mira],
        reader: 'suspects',
      }),
    );
    expect([secret.status, secret.self, secret.knows, secret.suspects, secret.unaware, secret.reader]).toEqual([
      'Hidden',
      'unaware',
      [tam],
      [mira],
      [],
      'suspects',
    ]);
    // Mira finds out: she moves from suspecting to knowing, never both.
    const later = w.act((c) => c.saveSecret(kael, secret.id, { knows: [tam, mira], status: 'Partly revealed' }));
    expect([later.knows, later.suspects, later.status, later.self, later.description]).toEqual([
      [tam, mira],
      [],
      'Partly revealed',
      'unaware',
      'Kael is the king’s son.',
    ]);
    expect(w.act((c) => c.saveSecret(kael, secret.id, { unaware: [mira] })).knows).toEqual([tam]);
    refused(() => w.act((c) => c.saveSecret(kael, null, { title: ' ' })), 'Give the secret a title.');
    refused(() => w.act((c) => c.saveSecret(mira, secret.id, { title: 'Stolen' })));
    expect(w.read.secrets(kael)).toHaveLength(1);
    expect(w.read.secrets(mira)).toHaveLength(0);
    w.act((c) => c.removeSecret(secret.id));
    expect(w.read.secrets(kael)).toHaveLength(0);
  });

  test('someone whose knowledge has a recorded history stays in it: the simple lists cannot say otherwise', () => {
    const w = new World();
    const kael = w.createCharacter('Kael');
    const mira = w.createCharacter('Mira');
    const secret = w.act((c) => c.saveSecret(kael, null, { title: 'Heir' }));
    // A record made with the original app's knowledge tracking.
    w.snapshot = w.snapshot.putRow(
      'characterSecrets',
      secret.merged({
        records: [
          { id: 'r1', characterId: mira, state: 'suspects', belief: '', nodeId: null, eventId: null, how: '', fromId: null },
        ],
      }),
    );
    refused(() => w.act((c) => c.saveSecret(kael, secret.id, { knows: [mira] })));
    const kept = w.act((c) => c.saveSecret(kael, secret.id, { title: 'Heir to the throne' }));
    expect(kept.records.map((r) => r.id)).toEqual(['r1']);
  });

  test('keeps notes out of the record until the author copies one in', () => {
    const w = new World();
    const marcus = w.createCharacter('Marcus');
    const before = w.entry(marcus).raw['fields'];
    const note = w.act((c) =>
      c.saveNote(marcus, null, { content: 'Maybe make Marcus the prince’s brother', tags: ['idea', 'idea'] }),
    );
    expect([note.title, note.tags, note.pinned]).toEqual(['Maybe make Marcus the prince’s brother', ['idea'], false]);
    w.act((c) => c.saveNote(marcus, null, { title: 'Pinned', content: 'Read first.', pinned: true }));
    expect(w.read.notes(marcus).map((n) => n.title)).toEqual(['Pinned', 'Maybe make Marcus the prince’s brother']);
    // Writing the note changed nothing about Marcus.
    expect(jsonEquals(w.entry(marcus).raw['fields'], before)).toBe(true);
    refused(() => w.act((c) => c.saveNote(marcus, null, { title: '', content: ' ' })), 'Write the note first.');

    const identity = w.sectionId(marcus, 0);
    refused(() => w.act((c) => c.promoteNote(note.id, identity, '')));
    const field = w.act((c) => c.promoteNote(note.id, identity, 'Family'));
    expect(w.entry(marcus).raw['fields']).toEqual([
      { id: field['id'], key: 'Family', value: 'Maybe make Marcus the prince’s brother', type: 'longtext' },
    ]);
    expect(w.read.notes(marcus)).toHaveLength(2);
    expect([w.history(marcus)[0].action, w.history(marcus)[0].label]).toEqual(['note', 'Family']);
  });

  test('tells a change to the record from an event in the story', () => {
    const w = new World();
    const marcus = w.createCharacter('Marcus');
    w.chapter('ch18');
    const job = str(
      w.act((c) => c.addField(marcus, w.sectionId(marcus, 0), new FieldSuggestion('Occupation'), { value: 'Soldier' }))[
        'id'
      ],
    );
    w.act((c) => c.updateField(marcus, job, { value: 'Commander' }));
    const event = w.act((c) => c.addMilestone(marcus, 'Marcus became commander.', 'ch18'));
    refused(() => w.act((c) => c.addMilestone(marcus, ' ')));
    const lines = w.history(marcus);
    expect(lines.filter((h) => !h.isStory).map((h) => [h.action, h.label, h.from, h.to])).toEqual([
      ['field', 'Occupation', 'Soldier', 'Commander'],
      ['created', 'Marcus', '', ''],
    ]);
    expect(lines.filter((h) => h.isStory).map((h) => [h.text, h.nodeId])).toEqual([['Marcus became commander.', 'ch18']]);
    // Only the author's own story lines can be removed; the record of changes cannot.
    w.act((c) => c.removeMilestone(lines.find((h) => h.action === 'created')!.id));
    w.act((c) => c.removeMilestone(event.id));
    expect(w.history(marcus).map((h) => h.action)).toEqual(['field', 'created']);
  });
});

describe('archiving and deleting', () => {
  test('says what refers to a character, and deleting removes it without harming anything else', () => {
    const w = new World();
    const kael = w.createCharacter('Kael');
    const mira = w.createCharacter('Mira');
    const guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
    w.act((c) => c.linkEntries(kael, guild.id, 'Captain'));
    w.chapter('one', { mentions: [kael] });
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Kael', marks: [{ type: 'entityLink', attrs: { entryId: kael } }] }],
        },
      ],
    };
    w.snapshot = w.snapshot
      .putRow('chapterContents', { id: 'one', projectId: 'novel', doc })
      .putRow('characterRelations', { id: 'rel', projectId: 'novel', fromId: kael, toId: mira })
      .putRow('plotThreads', { id: 'heist', projectId: 'novel', title: 'The Heist', characterIds: [kael, mira] });
    w.act((c) => c.saveSecret(kael, null, { title: 'Heir' }));
    const hers = w.act((c) => c.saveSecret(mira, null, { title: 'Spy', knows: [kael] }));
    w.act((c) => c.saveNote(kael, null, { content: 'A note.' }));
    expect(Object.fromEntries(referencesTo(w.snapshot, kael).counts)).toEqual({
      chapters: 1,
      relationships: 1,
      events: 0,
      threads: 1,
      links: 1,
      sheets: 0,
      snapshots: 0,
      secrets: 1,
      inSecrets: 1,
      notes: 1,
    });
    expect([...referencesTo(w.snapshot, kael).counts.keys()]).toEqual([
      'chapters',
      'relationships',
      'events',
      'threads',
      'links',
      'sheets',
      'snapshots',
      'secrets',
      'inSecrets',
      'notes',
    ]);

    w.snapshot = planCharacterDelete(w.snapshot, kael).snapshot;
    expect(w.rows('loreEntries').map((r) => r['name'])).toEqual(['Mira', 'Ash Guild']);
    for (const collection of ['characterProfiles', 'characterSecrets', 'characterNotes', 'characterHistory']) {
      expect(w.rows(collection).some((r) => r['entryId'] === kael)).toBe(false);
    }
    expect(w.rows('characterRelations')).toHaveLength(0);
    // Everything else is as it was: the words, the faction, the plot thread, Mira and her secret (which no longer
    // names Kael).
    expect(jsonEquals(w.rows('chapterContents')[0]['doc'], doc)).toBe(true);
    expect(w.rows('plotThreads')[0]['title']).toBe('The Heist');
    const secret = new CharacterSecret(w.rows('characterSecrets').find((r) => r['id'] === hers.id)!);
    expect([secret.title, secret.knows]).toEqual(['Spy', []]);
  });

  test('travels with the novel: a copy has its own characters, profiles, secrets and notes', () => {
    const w = new World();
    const kael = w.createCharacter('Kael', { epithet: 'The Oathbreaker' });
    const mira = w.createCharacter('Mira');
    w.act((c) => c.saveSecret(kael, null, { title: 'Heir', knows: [mira] }));
    w.act((c) => c.saveNote(kael, null, { content: 'A note.' }));
    let n = 0;
    const copy = duplicateNovel(w.snapshot, { title: 'Ashfall (Copy)', now: 5, createId: () => `copy-${++n}` });
    const theirs = new CharacterChanges(copy, { now: 6, createId: () => 'x' });
    const cast = copy
      .rows('loreEntries')
      .filter((r) => r['category'] === 'character')
      .map((r) => new Entry(r));
    expect(sorted(cast.map((e) => e.name))).toEqual(['Kael', 'Mira']);
    const kael2 = cast.find((e) => e.name === 'Kael')!;
    expect(kael2.id).not.toBe(kael);
    const profile = theirs.profileOf(kael2);
    expect([profile.epithet, profile.entryId]).toEqual(['The Oathbreaker', kael2.id]);
    expect(theirs.secrets(kael2.id)[0].knows).toEqual([cast.find((e) => e.name === 'Mira')!.id]);
    expect(theirs.notes(kael2.id)).toHaveLength(1);
    expect(foreignReferences(w.snapshot, copy)).toEqual([]);
  });
});

describe('fields whose answer has a known shape', () => {
  test('a Gender is a choice of Male or Female; Pronouns follow; an Age is a number; a birth a date', () => {
    expect([kindOf('Gender')!.type, kindOf('Gender')!.options.join('/')]).toEqual(['select', 'Male/Female']);
    expect(kindOf(' gender ')).not.toBeNull();
    expect(kindOf('Pronouns')!.options).toEqual(['He/him', 'She/her']);
    expect(kindOf('Age')!.type).toBe('number');
    expect(kindOf('Date of Birth')!.type).toBe('date');
    expect(kindOf('Alignment')!.options).toHaveLength(9);
    expect(kindOf('Occupation')).toBeNull();
  });

  test('a value read as its choice, however it was written; one that is none of them kept as it is', () => {
    const g = kindOf('Gender');
    expect(['male', 'Man', 'boy', 'F', 'woman', 'She'].map((v) => settled(g, v))).toEqual([
      'Male',
      'Male',
      'Male',
      'Female',
      'Female',
      'Female',
    ]);
    expect(settled(g, 'Unknown')).toBe('Unknown');
    expect(settled(kindOf('Pronouns'), 'he')).toBe('He/him');
    expect(settled(kindOf('Alignment'), 'chaotic neutral')).toBe('Chaotic Neutral');
    expect(settled(kindOf('Age'), ' 21 ')).toBe(' 21 ');
    expect(kindNote('Gender', g!)).toBe('Gender is a choice: Male or Female.');
  });

  test('made a choice when added by name; a field made before as text takes its shape when next written', () => {
    const w = new World();
    const a = w.createCharacter('Mark', { templateId: 'general' });
    const made = w.act((c) => c.addField(a, w.sectionId(a, 0), new FieldSuggestion('Gender'), { value: 'man' }));
    expect([made['type'], (made['options'] as string[]).join('/'), made['value']]).toEqual(['select', 'Male/Female', 'Male']);
    const age = w.act((c) => c.addField(a, w.sectionId(a, 0), new FieldSuggestion('Age'), { value: '21' }));
    expect(age['type']).toBe('number');
    // Asked for otherwise, as otherwise.
    const own = w.act((c) => c.addField(a, w.sectionId(a, 0), new FieldSuggestion('Gender', 'tags'), { value: 'x' }));
    expect(own['type']).toBe('tags');

    // A Gender made as text before: written through the cast's tools, it becomes the choice.
    const b = w.createCharacter('Wren', { templateId: 'general' });
    const old = w.act((c) => c.addField(a, w.sectionId(a, 0), new FieldSuggestion('Sex'), { value: '' }));
    w.act((c) => c.updateField(a, old['id'] as string, { type: 'text', options: [] }));
    w.act((c) => c.addField(b, w.sectionId(b, 0), new FieldSuggestion('Nickname'), { value: 'Wee' }));
    w.act((c) => recordIn(c, a, 'Sex', ['sex'], 'female', { sections: ['identity'], newSection: 'X' }));
    const sex = w.entry(a).fields.find((f) => f.key === 'Sex')!;
    expect([sex.type, sex.options.join('/'), sex.value]).toEqual(['select', 'Male/Female', 'Female']);
  });
});
