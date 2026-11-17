// The logic of the character screens' tests (flutter_app/test/features/characters/): characters_screens_test.dart,
// character_vault_test.dart (with vault_test_data.dart's Kaelen), in_one_sentence_test.dart, one_line_screen_test.dart,
// field_kinds_screen_test.dart and named_in_screen_test.dart. What those check of the widgets themselves (taps, layout
// at 200% text, contrast, the editor's popup, uploading a picture) belongs to the screens and is not here.

import { CastFilters, fieldNamed } from '../../src/domain/characters/cast';
import { CastData } from '../../src/domain/characters/castData';
import { type CharacterChanges, referencesTo } from '../../src/domain/characters/characterChanges';
import { FieldSuggestion } from '../../src/domain/characters/characterRecords';
import { namedIn, namesToFind } from '../../src/domain/characters/namedIn';
import { recordIn } from '../../src/domain/characters/recordLook';
import { CastingCall, characterPath, makeNewCharacter } from '../../src/domain/characters/screens/create';
import { recordLines } from '../../src/domain/characters/screens/history';
import { cardLabel, cardWhere, libraryView, monogram, castTone, roleTabs } from '../../src/domain/characters/screens/library';
import { keepAnswer, oneSentence } from '../../src/domain/characters/screens/oneSentence';
import {
  deleteDialog,
  ownStatusValue,
  statusChoices,
  vaultStep,
} from '../../src/domain/characters/screens/profile';
import { fieldCard, sectionCard, sectionsView } from '../../src/domain/characters/screens/sections';
import { identityFacts, relationWeb, symbolOf } from '../../src/domain/characters/screens/vault';
import { str } from '../../src/domain/json';
import { RelationChanges } from '../../src/domain/relationships/relationChanges';
import { blockTexts, textToDoc } from '../../src/domain/prose';
import { World } from './world';

const castOf = (w: World, named?: Map<string, string[]>) => new CastData('novel', w.snapshot, { named });

/** TEST DATA ONLY: Kaelen Draven of the design reference (vault_test_data.dart), made through the app's own changes,
 * without the portraits. */
function addKaelen(w: World): string {
  return w.act((ch: CharacterChanges) => {
    const kael = ch.create({ name: 'Kaelen Draven', epithet: 'The Oathbreaker', roles: ['Protagonist'], templateId: 'general' });
    const sections = ch.profileOf(kael).sections;
    const section = (name: string) => sections.find((s) => s.name === name)!.id;
    for (const [name, value] of [
      ['Age', '27'],
      ['Gender', 'Male'],
      ['Occupation', 'Warrior'],
      ['Alignment', 'Chaotic Neutral'],
    ]) {
      ch.addField(kael.id, section('Core Identity'), new FieldSuggestion(name), { value });
    }
    ch.addField(kael.id, section('Personality & Psychology'), new FieldSuggestion('Core Traits', 'tags'), {
      value: 'Brooding\nLoyal\nClever\nGuarded\nProtective',
    });
    ch.addField(kael.id, section('Character Arc'), new FieldSuggestion('Wounds', 'longtext'), {
      value: 'Betrayed by the king he swore to protect.',
    });
    ch.addField(kael.id, section('Core Identity'), new FieldSuggestion('Symbol'), { value: 'Broken Sword' });
    const ids: string[] = [];
    for (const [name, preset] of [
      ['Mira Vale', 'rivals'],
      ['Ren Ashford', 'allies'],
      ['Sera Lune', 'romantic-interest'],
      ['Tomas Hale', 'mentor-student'],
      ['Ilya Thorn', 'enemies'],
    ]) {
      const o = ch.create({ name, templateId: 'supporting' });
      ids.push(o.id);
      const rel = new RelationChanges(ch.snapshot, { now: ch.now, createId: () => ch.newId() });
      if (preset === 'mentor-student') rel.createRelation(o.id, kael.id, preset);
      else rel.createRelation(kael.id, o.id, preset);
      ch.snapshot = rel.snapshot;
    }
    // Two of them know each other, so the web joins them too.
    const rel = new RelationChanges(ch.snapshot, { now: ch.now, createId: () => ch.newId() });
    rel.createRelation(ids[1], ids[2], 'friends');
    ch.snapshot = rel.snapshot;
    return kael.id;
  });
}

describe('the casting call and the library (characters_screens_test.dart)', () => {
  test('only a name is needed; the new character keeps the id the card was drawn with', () => {
    const w = new World();
    const call = new CastingCall(castOf(w).templates);
    expect(call.preview.name).toBe('Their name');
    expect(call.submit()).toBeNull();
    expect(call.nameError).toBe('Give the character a name.');
    call.name = 'Kaelen Draven';
    call.setRole('Protagonist', true);
    const made = call.submit()!;
    const entry = w.act((c) => makeNewCharacter(c, made));
    expect(entry.id).toBe(call.id);
    expect(castTone(entry.id)).toBe(castTone(call.id));
    expect(characterPath(entry.id)).toBe(`/organize/character/${entry.id}`);
    expect(w.rows('loreEntries').map((e) => [e['name'], e['category']])).toEqual([['Kaelen Draven', 'character']]);
    expect(w.profile(entry.id).roles).toEqual(['Protagonist']);
    // Empty fields say so, rather than looking like values.
    expect(sectionCard(w.entry(entry.id), w.profile(entry.id).sections[0]).title).toBe('Core Identity (0)');
    w.act((c) => c.updateSection(entry.id, w.sectionId(entry.id, 1), { hidden: true }));
    const view = sectionsView(castOf(w), w.entry(entry.id), w.profile(entry.id), 'overview');
    expect(view.hidden?.title).toBe('1 hidden section');
    expect(view.visible.map((v) => v.section.name)).toEqual(['Core Identity', 'Character Arc', 'Resources & Position']);
  });

  test('the card is drawn as typed: name, epithet, roles in capitals', () => {
    const call = new CastingCall(castOf(new World()).templates);
    call.name = 'Mira Vance';
    call.epithet = 'The Last Heir';
    call.setRole('Antagonist', true);
    expect(call.preview).toMatchObject({ name: 'Mira Vance', epithet: 'The Last Heir', roles: 'ANTAGONIST' });
  });

  test('editing who the character is is noted in their history, in words', () => {
    const w = new World();
    const id = w.createCharacter('Marcus');
    w.act((c) => c.identity(id, { epithet: 'The Oathbreaker' }));
    w.act((c) => c.identity(id, { name: 'Marcus Vell' }));
    const said = recordLines(castOf(w), w.entry(id)).map((l) => l.text);
    expect(said).toEqual(
      expect.arrayContaining([
        'Set Title to “The Oathbreaker”.',
        'Changed Name from “Marcus” to “Marcus Vell”.',
        'Created the character “Marcus”.',
      ]),
    );
  });

  test('a field added from a section’s suggestions is shown in its section and among the facts at the top', () => {
    const w = new World();
    const id = w.createCharacter('Kael');
    const age = w.act((c) => c.addField(id, w.sectionId(id, 0), new FieldSuggestion('Age')));
    const cast = castOf(w);
    const section = w.profile(id).sections[0];
    expect(sectionCard(w.entry(id), section).title).toBe('Core Identity (1)');
    expect(fieldCard(cast, w.entry(id), w.profile(id), w.entry(id).fields[0], section).empty).toBe('Not recorded');
    w.act((c) => c.updateField(id, str(age['id']), { value: '27' }));
    const after = castOf(w);
    expect(fieldCard(after, w.entry(id), w.profile(id), w.entry(id).fields[0], section).shown).toBe('27');
    expect(identityFacts(after, w.entry(id), w.profile(id))).toEqual([{ name: 'Age', value: '27' }]);
  });

  test('the library searches, filters by role, archives, and counts', () => {
    const w = new World();
    w.createCharacter('Kaelen Draven', { roles: ['Protagonist'], epithet: 'The Oathbreaker' });
    w.createCharacter('Seraphina Valdris', { roles: ['Antagonist'] });
    const tam = w.createCharacter('Old Tam', { roles: ['Minor'] });
    let view = libraryView(castOf(w), { query: '', filters: CastFilters.none, sort: 'name' });
    expect(view.count).toBe('3 characters');
    view = libraryView(castOf(w), { query: 'oathbreaker', filters: CastFilters.none, sort: 'name' });
    expect(view.found.map((l) => l.entry.name)).toEqual(['Kaelen Draven']);
    expect(view.count).toBe('1 of 3 characters');
    const tabs = roleTabs(CastFilters.none, libraryView(castOf(w), { query: '', filters: CastFilters.none, sort: 'name' }));
    expect(tabs.map((t) => t.label)).toEqual(['All (3)', 'Protagonists', 'Antagonists', 'Minor']);
    const antagonists = tabs.find((t) => t.label === 'Antagonists')!.filters;
    expect(
      libraryView(castOf(w), { query: '', filters: antagonists, sort: 'name' }).found.map((l) => l.entry.name),
    ).toEqual(['Seraphina Valdris']);

    w.act((c) => c.setArchived(tam, true));
    const archived = roleTabs(CastFilters.none, libraryView(castOf(w), { query: '', filters: CastFilters.none, sort: 'name' }));
    expect(archived.map((t) => t.label)).toEqual(['All (2)', 'Protagonists', 'Antagonists', 'Archived (1)']);
    expect(
      libraryView(castOf(w), { query: '', filters: archived[3].filters, sort: 'name' }).found.map((l) => l.entry.name),
    ).toEqual(['Old Tam']);
  });

  test('deleting lists what refers to the character', () => {
    const w = new World();
    const kael = w.createCharacter('Kael');
    const mira = w.createCharacter('Mira');
    w.act((c) => c.saveSecret(mira, null, { title: 'Spy', knows: [kael] }));
    const dialog = deleteDialog(w.entry(kael), w.profile(kael), referencesTo(w.snapshot, kael));
    expect(dialog.title).toBe('Delete Kael?');
    expect(dialog.lines).toContain('•  1 other character’s secret names them');
    expect(dialog.archiveInstead).toBe('Archive instead');
  });

  test('a character keeps their colour and monogram whatever the list around them', () => {
    expect(castTone('kael-1')).toBe(castTone('kael-1'));
    expect([monogram('Kai & Ren'), monogram('Mira'), monogram('  '), monogram('Old Tam')]).toEqual(['KR', 'M', '?', 'OT']);
  });

  test('the cast wall: each card says where they are in the book', () => {
    const w = new World();
    const kael = w.createCharacter('Kael', { roles: ['Protagonist'], epithet: 'The Oathbreaker' });
    const mira = w.createCharacter('Mira');
    w.chapter('one', { order: 0, mentions: [kael] });
    w.chapter('two', { order: 1 });
    w.chapter('three', { order: 2, mentions: [kael] });
    const cast = castOf(w);
    const order = cast.model.order;
    expect(cardWhere(cast.listed(kael)!, order)).toBe('In 2 of 3 chapters · 1–3');
    expect(cardWhere(cast.listed(mira)!, order)).toBe('Not in the manuscript yet');
    expect(cardLabel(cast.listed(kael)!, order)).toBe('Kael, The Oathbreaker, Protagonist, In 2 of 3 chapters · 1–3');
    expect(monogram('Kael')).toBe('K');
    expect(vaultStep(cast, kael, 1)).toBe(mira);
    expect(vaultStep(cast, kael, -1)).toBe(mira);
  });
});

describe('the vault (character_vault_test.dart)', () => {
  test('who they are from their own record: identity facts, traits, symbol', () => {
    const w = new World();
    const kael = addKaelen(w);
    const cast = castOf(w);
    const facts = identityFacts(cast, w.entry(kael), w.profile(kael)).map((f) => `${f.name}: ${f.value}`);
    expect(facts).toEqual(['Age: 27', 'Gender: Male', 'Occupation: Warrior', 'Alignment: Chaotic Neutral']);
    expect(symbolOf(cast, w.entry(kael))).toBe('Broken Sword');
    const traits = w.entry(kael).fields.find((f) => f.key === 'Core Traits')!;
    expect(fieldCard(cast, w.entry(kael), w.profile(kael), traits, null).chips).toContain('Protective');
  });

  test('the web shows the people they have a relationship with, joined', () => {
    const w = new World();
    const kael = addKaelen(w);
    const web = relationWeb(castOf(w), w.entry(kael));
    expect(web.middleLabel).toBe('Kaelen Draven, in the middle');
    expect(web.shown.map((s) => s.label).sort()).toEqual(
      [
        'Mira Vale: Rival. Open their profile',
        'Ren Ashford: Ally. Open their profile',
        'Sera Lune: Romantic interest. Open their profile',
        'Tomas Hale: Mentor. Open their profile',
        'Ilya Thorn: Enemy. Open their profile',
      ].sort(),
    );
    expect(web.between).toHaveLength(1);
    expect(web.empty).toBeNull();
  });

  test('with no relationships, the web says so; with no identity facts, none are made up', () => {
    const w = new World();
    const id = w.createCharacter('Nobody Yet');
    const cast = castOf(w);
    expect(relationWeb(cast, w.entry(id)).empty).toContain('No relationships recorded yet');
    expect(identityFacts(cast, w.entry(id), w.profile(id))).toEqual([]);
    expect(symbolOf(cast, w.entry(id))).toBeNull();
  });
});

describe('in one sentence (in_one_sentence_test.dart)', () => {
  const field = (w: World, id: string, name: string) => fieldNamed(w.entry(id), name);

  test('Mark in one sentence: the blanks filled in place, each kept in his profile, then whole', () => {
    const w = new World();
    const mark = w.createCharacter('Mark');
    w.act((x) => {
      recordIn(x, mark, 'Age', ['age'], '21', { sections: ['identity'], newSection: 'Core Identity' });
      recordIn(x, mark, 'Gender', ['gender'], 'Male', { sections: ['identity'], newSection: 'Core Identity' });
    });
    let s = oneSentence(castOf(w), mark)!;
    expect(s.caption).toBe('4 blanks to fill. Press one: what you write is kept in Mark’s profile.');
    expect(s.pieces.filter((p) => p.gap).map((p) => p.text)).toEqual(expect.arrayContaining(['who he is', 'what he wants']));
    expect(s.whole).toBeNull();

    w.act((c) => keepAnswer(c, mark, 'wants', 'To open the last door.'));
    expect(field(w, mark, 'What they want')).toBe('To open the last door.');
    s = oneSentence(castOf(w), mark)!;
    expect(s.pieces.map((p) => p.text)).toContain('to open the last door');
    expect(s.caption).toBe('3 blanks to fill. Press one: what you write is kept in Mark’s profile.');

    w.act((c) => keepAnswer(c, mark, 'who', 'A locksmith’s apprentice'));
    w.act((c) => keepAnswer(c, mark, 'inTheWay', 'The Architect'));
    w.act((c) => keepAnswer(c, mark, 'atStake', 'His sister'));
    expect(field(w, mark, 'Occupation')).toBe('A locksmith’s apprentice');
    s = oneSentence(castOf(w), mark)!;
    expect(s.whole).toBe(
      'Mark, 21, a locksmith’s apprentice, wants to open the last door, but the Architect stands in his way. ' +
        'If he fails, he loses his sister.',
    );
    expect(s.caption.startsWith('Mark in one sentence: the pitch')).toBe(true);
    expect(s.ask('atStake').question).toBe('What could Mark lose?');

    // A part changed: the same field, written over.
    w.act((c) => keepAnswer(c, mark, 'wants', 'To close every door'));
    expect(field(w, mark, 'What they want')).toBe('To close every door');
  });
});

describe('a character written in a line (one_line_screen_test.dart)', () => {
  test('the preview says what is recorded, and Add records it all', () => {
    const w = new World();
    const kai = w.createCharacter('Kai Doyle');
    const river = w.act((c) => c.createEntry('location', 'Glass River')).id;
    const cast = castOf(w);
    const call = new CastingCall(cast.templates, cast.characters().map((e) => ({ id: e.id, name: e.name })));
    call.lineChanged('Mira Vance, 34, a smuggler from Glass River, Kai’s sister');
    expect(call.name).toBe('Mira Vance');
    expect(call.also).toEqual([
      ['Age', '34'],
      ['Gender', 'Female'],
      ['Occupation', 'smuggler'],
      ['From', 'Glass River'],
      ['Siblings', 'Kai Doyle'],
    ]);
    const mira = w.act((c) => makeNewCharacter(c, call.submit()!));
    const fields = Object.fromEntries(w.entry(mira.id).fields.map((f) => [f.key, f.value]));
    expect(fields).toEqual({ Age: '34', Gender: 'Female', Occupation: 'smuggler', 'Place of Origin': river });
    const ties = w.rows('characterRelations');
    expect(ties).toHaveLength(1);
    expect(new Set([ties[0]['fromId'], ties[0]['toId']])).toEqual(new Set([kai, mira.id]));
    expect((ties[0]['stages'] as { preset: string }[])[0].preset).toBe('siblings');
  });

  test('begun from an empty chair, the line is read with the name left to write', () => {
    const w = new World();
    const wren = w.createCharacter('Wren');
    const call = new CastingCall(castOf(w).templates, [{ id: wren, name: 'Wren' }], { line: ', Wren’s rival' });
    expect(call.name).toBe('');
    expect(call.read!.ties.map((t) => t.preset)).toEqual(['rivals']);
  });
});

describe('fields of a known shape on the page (field_kinds_screen_test.dart)', () => {
  test('a Gender written as text reads as its choice, and becomes the choice when next chosen', () => {
    const w = new World();
    const mark = w.createCharacter('Mark', { templateId: 'general' });
    w.act((x) => {
      recordIn(x, mark, 'Age', ['age'], '21', { sections: ['identity'], newSection: 'Core Identity' });
      recordIn(x, mark, 'Gender', ['gender'], 'male', { sections: ['identity'], newSection: 'Core Identity' });
      for (const f of x.character(mark).fields) {
        x.updateField(mark, f.id, { type: 'text', options: [], value: f.value === 'Male' ? 'male' : undefined });
      }
    });
    const gender = () => w.entry(mark).fields.find((f) => f.key === 'Gender')!;
    expect(gender().type).not.toBe('select');
    const cast = castOf(w);
    expect(identityFacts(cast, w.entry(mark), w.profile(mark))).toContainEqual({ name: 'Gender', value: 'Male' });
    const card = fieldCard(cast, w.entry(mark), w.profile(mark), gender(), w.profile(mark).sections[0]);
    expect([card.type, card.options, card.value, card.reshape]).toEqual(['select', ['Male', 'Female'], 'Male', true]);
    expect(card.settings.kindNote).toBe('Gender is a choice: Male or Female.');
    expect(card.settings.types).toBeNull();
    w.act((c) => c.updateField(mark, gender().id, card.changeOf('Female')));
    expect([gender().value, gender().type, gender().options.join('/')]).toEqual(['Female', 'select', 'Male/Female']);

    const age = w.entry(mark).fields.find((f) => f.key === 'Age')!;
    const ageCard = fieldCard(castOf(w), w.entry(mark), w.profile(mark), age, null);
    w.act((c) => c.updateField(mark, age.id, ageCard.changeOf('22')));
    const after = w.entry(mark).fields.find((f) => f.key === 'Age')!;
    expect([after.value, after.type]).toEqual(['22', 'number']);
  });

  test('Status is chosen, the one set marked; one of the author’s own is kept and shown', () => {
    const w = new World();
    const mark = w.createCharacter('Mark');
    w.act((c) => c.identity(mark, { status: 'Deceased' }));
    expect(statusChoices(w.profile(mark)).filter((s) => s.selected).map((s) => s.status)).toEqual(['Deceased']);
    w.act((c) => c.identity(mark, { status: 'Exiled' }));
    expect(statusChoices(w.profile(mark)).map((s) => s.status)).toContain('Exiled');
    expect(ownStatusValue(w.profile(mark))).toBe('Exiled');
    // Pressed again, cleared.
    w.act((c) => c.identity(mark, { status: '' }));
    expect(w.profile(mark).status).toBe('');
  });
});

describe('named in the text, on the cards (named_in_screen_test.dart)', () => {
  test('the cast is found in the text by name, unlinked, and follows the text as it changes', () => {
    const w = new World();
    w.chapter('one', { order: 0 });
    w.chapter('two', { order: 1 });
    const mira = w.createCharacter('Mira Vance');
    const kai = w.createCharacter('Kai Doyle');
    const read = (texts: [string, string][]) => {
      const cast = castOf(w);
      const found = namedIn(new Map(texts), namesToFind(cast.entries, cast.profiles));
      return castOf(w, found);
    };
    let cast = read([
      ['one', blockTexts(textToDoc('Mira waited at the gate.')).join('\n')],
      ['two', 'Nobody came.'],
    ]);
    expect(cardWhere(cast.listed(mira)!, cast.model.order)).toBe('In chapter 1');
    expect(cardWhere(cast.listed(kai)!, cast.model.order)).toBe('Not in the manuscript yet');
    cast = read([
      ['one', 'Mira waited at the gate.'],
      ['two', 'Nobody came but Kai.'],
    ]);
    expect(cardWhere(cast.listed(kai)!, cast.model.order)).toBe('In chapter 2');
  });
});
