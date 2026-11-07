// The original app's character tests (src/modules/characters/characters.test.ts), ported: the same scenarios, the
// same expectations, against the Dart port of its character service.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/templates.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/copy.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

/// One novel, changed one step at a time as the app does: each step on the records as they are, all of it or none.
class World {
  NovelSnapshot snapshot = NovelSnapshot(project: {'id': 'novel', 'title': 'Ashfall'}, collections: const {});
  int clock = 1000000;
  int _ids = 0;

  T act<T>(T Function(CharacterChanges c) change, {int advance = 1}) {
    clock += advance;
    final c = CharacterChanges(snapshot, now: clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  CharacterChanges get read => CharacterChanges(snapshot, now: clock, createId: () => throw StateError('reading'));

  List<JsonMap> rows(String collection) => snapshot.rows(collection);
  Entry entry(String id) => read.owned(id);
  CharacterProfile profile(String id) => read.profileOf(read.character(id));
  List<CharacterHistoryLine> history(String id) => read.history(id);
  String createCharacter(String name, {String epithet = '', List<String> roles = const [], String? templateId}) =>
      act((c) => c.create(name: name, epithet: epithet, roles: roles, templateId: templateId)).id;

  void chapter(String id, {num order = 0, List<String> mentions = const []}) => snapshot = snapshot.putRow('chapters', {
    'id': id,
    'projectId': 'novel',
    'parentId': null,
    'kind': 'chapter',
    'title': id,
    'order': order,
    'mentions': mentions,
    'createdAt': order,
  });

  String sectionId(String entryId, int index) => profile(entryId).sections[index].id;
}

String _line(CharacterHistoryLine h) => '${h.action}|${h.label}|${h.from}|${h.to}';

void main() {
  group('a character is one record', () {
    test('is created as a codex entry in Characters, with a profile beside it', () {
      final w = World();
      final sera = w.act(
        (c) => c.create(
          name: 'Seraphina Valdris',
          epithet: 'The Last Heir',
          roles: ['Protagonist'],
          summary: 'First daughter of House Valdris.',
        ),
      );
      expect(
        (sera.category, sera.name, sera.summary, sera.projectId),
        ('character', 'Seraphina Valdris', 'First daughter of House Valdris.', 'novel'),
      );
      expect([for (final r in w.rows('loreEntries')) r['id']], [sera.id]);
      final profile = w.profile(sera.id);
      expect(
        [profile.entryId, profile.epithet, profile.roles, profile.archived],
        [
          sera.id,
          'The Last Heir',
          ['Protagonist'],
          false,
        ],
      );
      expect(
        [for (final s in profile.sections) (s.name, s.tab.name, s.fieldIds.length)],
        [
          ('Core Identity', 'overview', 0),
          ('Personality & Psychology', 'overview', 0),
          ('Character Arc', 'overview', 0),
          ('Resources & Position', 'overview', 0),
          ('Biography & History', 'details', 0),
          ('Appearance', 'details', 0),
        ],
      );
      expect(w.rows('characterProfiles'), hasLength(1));
      expect(
        () => w.act((c) => c.create(name: '  ')),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', 'Give the character a name.')),
      );
      // Nothing else is required: no summary, no role, no portrait.
      final nobody = w.act((c) => c.create(name: 'Nobody'));
      expect((nobody.name, nobody.summary, nobody.image), ('Nobody', '', null));
    });

    test('gives a character made in the Codex the same profile, without writing anything until it is changed', () {
      final w = World();
      final old = w.act((c) => c.createEntry('character', 'Old Tam'));
      w.snapshot = w.snapshot.putRow(
        'loreEntries',
        w.entry(old.id).merged({
          'fields': [
            {'id': 'a', 'key': 'Age', 'value': '70'},
          ],
        }),
      );
      final before = w.snapshot.toJson();
      expect(w.profile(old.id).sections.map((s) => s.name), contains('Core Identity'));
      expect(jsonEquals(w.snapshot.toJson(), before), isTrue, reason: 'asking for a profile writes nothing');
      // The field written in the Codex is the character's field: not copied, the same one.
      w.act((c) => c.updateField(old.id, 'a', value: '71'));
      expect(w.entry(old.id).raw['fields'], [
        {'id': 'a', 'key': 'Age', 'value': '71'},
      ]);
      expect(w.rows('characterProfiles'), isEmpty);
      w.act((c) => c.identity(old.id, const IdentityChanges(epithet: 'The Ferryman')));
      expect(w.rows('characterProfiles'), hasLength(1));
      // Only characters have profiles.
      final place = w.act((c) => c.createEntry('location', 'Emberhold'));
      expect(() => w.profile(place.id), throwsA(isA<ChangeRefused>()));
    });

    test('keeps identity where it belongs and notes each change, folding quick edits into one line', () {
      final w = World();
      final id = w.createCharacter('Marcus');
      w.act(
        (c) => c.identity(
          id,
          const IdentityChanges(
            name: 'Marcus Vell',
            epithet: 'The Oathbreaker',
            aliases: ['Marc', 'Marc', ' The Wolf '],
            roles: ['Antagonist', 'Supporting'],
            status: 'Alive',
            summary: 'A soldier.',
            focal: (x: 130, y: -4),
            tags: ['guard'],
          ),
        ),
      );
      final p = w.profile(id);
      expect(
        [p.epithet, p.aliases, p.roles, p.status, p.focal],
        [
          'The Oathbreaker',
          ['Marc', 'The Wolf'],
          ['Antagonist', 'Supporting'],
          'Alive',
          (x: 100.0, y: 0.0),
        ],
      );
      w.act((c) => c.identity(id, const IdentityChanges(summary: 'A soldier, then a commander.')));
      w.act((c) => c.identity(id, const IdentityChanges(image: (value: 'data:image/png;base64,AAAA'))));
      w.act((c) => c.identity(id, const IdentityChanges(image: (value: null))));
      expect(
        w.history(id).map(_line).toList()..sort(),
        [
          'created|Marcus||',
          'identity|Name|Marcus|Marcus Vell',
          'identity|Summary||A soldier, then a commander.',
          'identity|Title||The Oathbreaker',
          'identity|Aliases||Marc, The Wolf',
          'identity|Role||Antagonist, Supporting',
          'identity|Status||Alive',
          'portrait|added||',
          'portrait|removed||',
        ]..sort(),
      );
    });
  });

  group('sections and fields', () {
    test('lets the author add, rename, reorder, hide, duplicate and remove sections', () {
      final w = World();
      final id = w.createCharacter('Kael', templateId: 'supporting');
      List<String> names([ProfileTab tab = ProfileTab.overview]) => [
        for (final s in w.profile(id).sections)
          if (s.tab == tab) s.name,
      ];
      expect(names(), ['Core Identity', 'Role in the Story', 'Personality']);
      w.act((c) => c.addSection(id, 'Magic'));
      final magic = w.profile(id).sections.firstWhere((s) => s.name == 'Magic').id;
      w.act((c) => c.moveSection(id, magic, -1));
      w.act((c) => c.moveSection(id, magic, -1));
      expect(names(), ['Core Identity', 'Magic', 'Role in the Story', 'Personality']);
      w.act((c) => c.moveSection(id, magic, -1));
      w.act((c) => c.moveSection(id, magic, -1));
      expect(names().first, 'Magic');
      w.act((c) => c.updateSection(id, magic, name: 'Lineage & Magic', hidden: true));
      final renamed = w.profile(id).sections.firstWhere((s) => s.id == magic);
      expect((renamed.name, renamed.hidden), ('Lineage & Magic', true));
      expect(() => w.act((c) => c.updateSection(id, magic, name: ' ')), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.addSection(id, '')), throwsA(isA<ChangeRefused>()));

      final school = w.act((c) => c.addField(id, magic, const FieldSuggestion('School'), value: 'Ash'));
      w.act((c) => c.addField(id, magic, const FieldSuggestion('Tier', FieldType.number), value: '3'));
      final copy = w.act((c) => c.duplicateSection(id, magic));
      expect([for (final s in w.profile(id).sections) s.name].take(2), ['Lineage & Magic', 'Lineage & Magic (copy)']);
      final fields = {for (final f in w.entry(id).fields) f.id: f};
      expect(
        [for (final fid in copy.fieldIds) (fields[fid]!.key, fields[fid]!.value, fields[fid]!.type)],
        [('School', '', null), ('Tier', '', FieldType.number)],
      );

      // Removing a section leaves what was written, unless the author says to delete it too.
      w.act((c) => c.removeSection(id, magic));
      expect(w.entry(id).fields.firstWhere((f) => f.id == school['id']).value, 'Ash');
      w.act((c) => c.removeSection(id, copy.id, deleteFields: true));
      expect([for (final f in w.entry(id).fields) f.key], ['School', 'Tier']);
      expect(w.profile(id).sections.any((s) => s.name.startsWith('Lineage')), isFalse);
    });

    test('lets the author add, rename, retype, reorder, move, edit and remove fields, of every type', () {
      final w = World();
      final id = w.createCharacter('Kael');
      final guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
      final identity = w.sectionId(id, 0);
      final psyche = w.sectionId(id, 1);
      String add(FieldSuggestion f, String value) => str(w.act((c) => c.addField(id, identity, f, value: value))['id']);
      final age = add(const FieldSuggestion('Age'), '27');
      final traits = add(const FieldSuggestion('Core Traits', FieldType.tags), 'Brooding\nLoyal');
      final faction = add(const FieldSuggestion('Faction', FieldType.reference), guild.id);
      final oath = add(const FieldSuggestion('Oathbound', FieldType.toggle), 'yes');
      final rankRow = w.act(
        (c) => c.addField(
          id,
          identity,
          const FieldSuggestion('Rank', FieldType.select, ['Squire', 'Knight', 'Knight']),
          value: 'Knight',
        ),
      );
      final rank = str(rankRow['id']);
      expect(rankRow['options'], ['Squire', 'Knight']);
      List<String> ids(String sectionId) => w.profile(id).sections.firstWhere((s) => s.id == sectionId).fieldIds;
      expect(ids(identity), [age, traits, faction, oath, rank]);

      w.act((c) => c.moveField(id, rank, by: -1));
      w.act((c) => c.moveField(id, age, by: -1));
      expect(ids(identity), [age, traits, faction, rank, oath]);
      w.act((c) => c.moveField(id, traits, toSection: psyche));
      expect(
        [ids(identity), ids(psyche)],
        [
          [age, faction, rank, oath],
          [traits],
        ],
      );

      w.act((c) => c.updateField(id, age, key: 'Age in years', type: FieldType.number, value: '28'));
      w.act((c) => c.updateField(id, faction, value: ''));
      w.act((c) => c.updateField(id, traits, value: 'Brooding\nLoyal\nGuarded'));
      expect(w.entry(id).fields.firstWhere((f) => f.id == age).raw, {
        'id': age,
        'key': 'Age in years',
        'value': '28',
        'type': 'number',
      });
      expect(() => w.act((c) => c.updateField(id, age, key: '')), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.addField(id, identity, const FieldSuggestion(''))), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.updateField(id, 'nope', value: 'x')), throwsA(isA<ChangeRefused>()));

      // History says what changed, in words, with a linked entry by its name.
      final lines = [
        for (final h in w.history(id))
          if (h.action == 'field') '${h.label}: ${h.from} → ${h.to}',
      ];
      expect(
        lines,
        containsAll([
          'Age in years: 27 → 28',
          'Faction: Ash Guild → ',
          'Core Traits: Brooding, Loyal → Brooding, Loyal, Guarded',
        ]),
      );

      w.act((c) => c.removeField(id, oath));
      expect(ids(identity), [age, faction, rank]);
      expect(w.entry(id).fields.any((f) => f.id == oath), isFalse);
    });

    test('folds a run of edits to one field into a single line, and drops it if the value ends where it began', () {
      final w = World();
      final id = w.createCharacter('Marcus');
      final job = str(
        w.act((c) => c.addField(id, w.sectionId(id, 0), const FieldSuggestion('Occupation'), value: 'Soldier'))['id'],
      );
      for (final value in ['C', 'Co', 'Commander']) {
        w.act((c) => c.updateField(id, job, value: value));
      }
      List<String> lines() => [
        for (final h in w.history(id))
          if (h.action == 'field') '${h.label}: ${h.from} → ${h.to}',
      ];
      expect(lines(), ['Occupation: Soldier → Commander']);
      w.act((c) => c.updateField(id, job, value: 'Soldier'));
      expect(lines(), isEmpty);
      // Ten minutes later, a change is a line of its own.
      w.act((c) => c.updateField(id, job, value: 'General'), advance: sameEditMs);
      expect(lines(), ['Occupation: Soldier → General']);
    });

    test('offers a section’s usual fields without storing any until one is added', () {
      final w = World();
      final id = w.createCharacter('Kael', templateId: 'suspect');
      expect(
        [for (final s in w.profile(id).sections) s.name],
        ['Identity', 'The Case', 'Reveal', 'Personality & Psychology', 'Biography & History'],
      );
      expect(w.entry(id).fields, isEmpty);
      final offered = suggestionsFor('The Case', w.read.templates(), ['Motive']);
      expect(
        [for (final f in offered) f.name],
        ['Means', 'Opportunity', 'Alibi', 'Alibi holds?', 'Evidence for', 'Evidence against'],
      );
      expect(offered.firstWhere((f) => f.name == 'Alibi holds?').type, FieldType.toggle);
      expect(suggestionsFor('A section of my own', w.read.templates(), []), isEmpty);
      for (final template in builtinTemplates) {
        expect({for (final s in sectionsOf(template)) s['id']}, hasLength(template.sections.length));
      }
    });

    test('applies a template by adding what is missing, and saves a layout for other characters', () {
      final w = World();
      final a = w.createCharacter('A', templateId: 'supporting');
      w.act((c) => c.addField(a, w.sectionId(a, 0), const FieldSuggestion('Age'), value: '30'));
      w.act((c) => c.applyTemplate(a, 'fantasy'));
      final names = [for (final s in w.profile(a).sections) s.name];
      expect(names, [
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
      expect([for (final f in w.entry(a).fields) (f.key, f.value)], [('Age', '30')]);

      final saved = w.act((c) => c.saveTemplate(a, 'My cast'));
      expect(saved.sections.first.toJson(), {
        'name': 'Core Identity',
        'tab': 'overview',
        'fields': [
          {'name': 'Age', 'type': 'text'},
        ],
      });
      final b = w.createCharacter('B', templateId: saved.id);
      expect([for (final s in w.profile(b).sections) s.name], names);
      expect(
        [
          for (final f in suggestionsFor('Core Identity', [saved], [])) f.name,
        ],
        ['Age'],
      );
      w.act((c) => c.removeTemplate(saved.id));
      expect(w.read.templates(), hasLength(builtinTemplates.length));
      expect(() => w.act((c) => c.applyTemplate(a, saved.id)), throwsA(isA<ChangeRefused>()));
    });

    test('a shared field of every character is set by its definition, and offered without being stored', () {
      final w = World();
      w.snapshot = w.snapshot.putRow('loreSchemas', {
        ...Category.builtin('character').toJson(),
        'id': 'character',
        'fields': [
          {'id': 'def-sanity', 'name': 'Sanity', 'type': 'number', 'options': <String>[], 'min': 0, 'max': 100},
        ],
      });
      final id = w.createCharacter('Kael');
      expect(w.entry(id).fields, isEmpty, reason: 'offered, never forced onto the record');
      w.act((c) => c.setFieldValue(id, 'def-sanity', '120'));
      final field = w.entry(id).fields.single;
      expect((field.key, field.value, field.defId, field.type), ('Sanity', '120', 'def-sanity', FieldType.number));
      final def = w.read.category('character').fields.single;
      expect(checkValue(def, field.value, {})?.message, 'Sanity should be at most 100; it is 120.');
      expect(() => w.act((c) => c.setFieldValue(id, 'nope', '1')), throwsA(isA<ChangeRefused>()));
    });
  });

  group('the library', () {
    ({World w, String kael, String sera, String tam, List<Listed> Function() read}) cast() {
      final w = World();
      w.chapter('one', order: 0, mentions: []);
      w.chapter('two', order: 1);
      w.chapter('three', order: 2);
      final kael = w.createCharacter('Kaelen Draven', epithet: 'The Oathbreaker', roles: ['Protagonist']);
      w.act((c) => c.identity(kael, const IdentityChanges(summary: 'A disgraced knight.')));
      final sera = w.createCharacter('Seraphina Valdris', roles: ['Antagonist', 'Supporting']);
      w.act((c) => c.identity(sera, const IdentityChanges(summary: 'First daughter of House Valdris.')));
      final tam = w.createCharacter('Old Tam', roles: ['Minor']);
      final guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
      w.act((c) => c.linkEntries(kael, guild.id, 'Captain'));
      w.act((c) => c.identity(kael, const IdentityChanges(aliases: ['Kael'], status: 'Alive', tags: ['knight'])));
      w.act((c) => c.identity(sera, const IdentityChanges(status: 'Alive', tags: ['noble', 'knight'])));
      w.act((c) => c.identity(tam, const IdentityChanges(status: 'Deceased')));
      w.act((c) => c.addField(kael, w.sectionId(kael, 0), const FieldSuggestion('Species'), value: 'Human'));
      w.act((c) => c.addField(kael, w.sectionId(kael, 0), const FieldSuggestion('Occupation'), value: 'Warrior'));
      w.act((c) => c.addField(sera, w.sectionId(sera, 0), const FieldSuggestion('Species'), value: 'Elf'));
      w.act(
        (c) => c.addField(
          sera,
          w.sectionId(sera, 0),
          const FieldSuggestion('Backstory', FieldType.longtext),
          value: 'Raised among wolves.',
        ),
      );
      w.chapter('one', order: 0, mentions: [sera]);
      w.chapter('two', order: 1, mentions: [kael]);
      w.chapter('three', order: 2, mentions: [sera]);
      List<Listed> read() {
        final nodes = [for (final r in w.rows('chapters')) StoryNode(r)];
        final list = listCharacters(
          [for (final r in w.rows('loreEntries')) Entry(r)],
          {for (final r in w.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)},
          [for (final r in w.rows('loreLinks')) Link(r)],
          nodes,
          StoryOrder.of(nodes).position,
          (e) => w.read.fresh(e),
        );
        // In the order they were made.
        return list..sort((a, b) => a.profile.order.compareTo(b.profile.order));
      }

      return (w: w, kael: kael, sera: sera, tam: tam, read: read);
    }

    List<String> firstNames(Iterable<Listed> l) => [for (final x in l) x.entry.name.split(' ').first];

    test('finds a character by name, alias, epithet, summary, tag, role, faction or a field, and only real ones', () {
      final c = cast();
      final list = c.read();
      final names = {for (final r in c.w.rows('loreEntries')) str(r['id']): str(r['name'])};
      List<String> find(String q) => firstNames(list.where((l) => matchesQuery(l, q, (id) => names[id])));
      expect(find(''), ['Kaelen', 'Seraphina', 'Old']);
      expect(find('The Oathbreaker'), ['Kaelen']);
      expect(find('oathbreaker kael'), ['Kaelen']);
      expect(find('KAEL'), ['Kaelen']);
      expect(find('valdris'), ['Seraphina']);
      expect(find('knight'), ['Kaelen', 'Seraphina']);
      expect(find('antagonist'), ['Seraphina']);
      expect(find('ash guild'), ['Kaelen']);
      expect(find('warrior'), ['Kaelen']);
      expect(find('elf'), ['Seraphina']);
      // Long passages are not searched here (project search is for that), and nothing is invented.
      expect(find('wolves'), isEmpty);
      expect(find('zzz'), isEmpty);
      // Accents are ignored, as in the original.
      expect(find('séraphina'), ['Seraphina']);
    });

    test('filters by role, status, tag, species, occupation, faction and first appearance; two roles at once', () {
      final c = cast();
      final list = c.read();
      List<String> only(CastFilters f) => firstNames(list.where((l) => passesFilters(l, f)));
      expect(only(const CastFilters(role: 'Antagonist')), ['Seraphina']);
      expect(only(const CastFilters(role: 'supporting')), ['Seraphina']);
      expect(only(const CastFilters(status: 'Deceased')), ['Old']);
      expect(only(const CastFilters(tag: 'knight')), ['Kaelen', 'Seraphina']);
      expect(only(const CastFilters(species: 'Elf')), ['Seraphina']);
      expect(only(const CastFilters(occupation: 'Warrior')), ['Kaelen']);
      expect(only(const CastFilters(faction: 'Ash Guild')), ['Kaelen']);
      expect(only(const CastFilters(firstBy: 0)), ['Seraphina']);
      expect(only(const CastFilters(firstBy: 1)), ['Kaelen', 'Seraphina']);
      final f = facetsOf(list);
      expect(
        [f.roles, f.statuses, f.tags, f.species, f.occupations, f.factions],
        [
          ['Antagonist', 'Minor', 'Protagonist', 'Supporting'],
          ['Alive', 'Deceased'],
          ['knight', 'noble'],
          ['Elf', 'Human'],
          ['Warrior'],
          ['Ash Guild'],
        ],
      );

      // Archived characters are out of the library until asked for, and nothing else about them changes.
      c.w.act((x) => x.setArchived(c.tam, true));
      final again = c.read();
      expect(firstNames(again.where((l) => passesFilters(l, CastFilters.none))), ['Kaelen', 'Seraphina']);
      expect(firstNames(again.where((l) => passesFilters(l, const CastFilters(archived: true)))), ['Old']);
      c.w.act((x) => x.setArchived(c.tam, false));
      expect([for (final h in c.w.history(c.tam)) h.action].take(2), ['restored', 'archived']);
    });

    test('sorts by name, dates, appearances and the author’s own order', () {
      final c = cast();
      final list = c.read();
      expect(
        [for (final l in list) (l.entry.name.split(' ').first, l.linkedIn.length, l.first, l.latest)],
        [('Kaelen', 1, 1, 1), ('Seraphina', 2, 0, 2), ('Old', 0, -1, -1)],
      );
      expect(firstNames(sortCharacters(list, CastSort.name)), ['Kaelen', 'Old', 'Seraphina']);
      expect(firstNames(sortCharacters(list, CastSort.first)), ['Seraphina', 'Kaelen', 'Old']);
      expect(firstNames(sortCharacters(list, CastSort.latest)), ['Seraphina', 'Kaelen', 'Old']);
      expect(firstNames(sortCharacters(list, CastSort.appearances)), ['Seraphina', 'Kaelen', 'Old']);
      expect(firstNames(sortCharacters(list, CastSort.custom)), ['Kaelen', 'Seraphina', 'Old']);
      c.w.act((x) => x.reorder([c.tam, c.sera, c.kael]));
      expect(firstNames(sortCharacters(c.read(), CastSort.custom)), ['Old', 'Seraphina', 'Kaelen']);
    });

    test('counts name mentions as whole words, and says nothing more than that', () {
      const texts = [
        'Kael drew his sword. "Kaelen!" she cried. The Oathbreaker did not turn.',
        'Mikael, not Kael’s brother, laughed. kael.',
      ];
      expect(countMentions(texts, ['Kaelen Draven', 'Kael', 'The Oathbreaker']), 4);
      expect(countMentions(texts, ['Kael']), 3);
      expect(countMentions(texts, ['K', '']), 0);
      expect(countMentions([], ['Kael']), 0);
      // Punctuation in a name is matched as written, not as a pattern.
      expect(countMentions(['Dr. A.B. Stone and AxB'], ['A.B.']), 1);
    });
  });

  group('secrets, notes and history', () {
    test('keeps apart what is true, what the character knows, what others know and what the reader knows', () {
      final w = World();
      final kael = w.createCharacter('Kael');
      final mira = w.createCharacter('Mira');
      final tam = w.createCharacter('Tam');
      final secret = w.act(
        (c) => c.saveSecret(kael, null, {
          'title': 'True heir',
          'description': 'Kael is the king’s son.',
          'self': 'unaware',
          'knows': [tam, kael],
          'suspects': [mira],
          'reader': 'suspects',
        }),
      );
      expect(
        [secret.status, secret.self, secret.knows, secret.suspects, secret.unaware, secret.reader],
        [
          'Hidden',
          Knowledge.unaware,
          [tam],
          [mira],
          <String>[],
          Knowledge.suspects,
        ],
      );
      // Mira finds out: she moves from suspecting to knowing, never both.
      final later = w.act(
        (c) => c.saveSecret(kael, secret.id, {
          'knows': [tam, mira],
          'status': 'Partly revealed',
        }),
      );
      expect(
        [later.knows, later.suspects, later.status, later.self, later.description],
        [
          [tam, mira],
          <String>[],
          'Partly revealed',
          Knowledge.unaware,
          'Kael is the king’s son.',
        ],
      );
      expect(
        w
            .act(
              (c) => c.saveSecret(kael, secret.id, {
                'unaware': [mira],
              }),
            )
            .knows,
        [tam],
      );
      expect(
        () => w.act((c) => c.saveSecret(kael, null, {'title': ' '})),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', 'Give the secret a title.')),
      );
      expect(() => w.act((c) => c.saveSecret(mira, secret.id, {'title': 'Stolen'})), throwsA(isA<ChangeRefused>()));
      expect(w.read.secrets(kael), hasLength(1));
      expect(w.read.secrets(mira), isEmpty);
      w.act((c) => c.removeSecret(secret.id));
      expect(w.read.secrets(kael), isEmpty);
    });

    test('someone whose knowledge has a recorded history stays in it: the simple lists cannot say otherwise', () {
      final w = World();
      final kael = w.createCharacter('Kael');
      final mira = w.createCharacter('Mira');
      final secret = w.act((c) => c.saveSecret(kael, null, {'title': 'Heir'}));
      // A record made with the original app's knowledge tracking.
      w.snapshot = w.snapshot.putRow(
        'characterSecrets',
        secret.merged({
          'records': [
            {
              'id': 'r1',
              'characterId': mira,
              'state': 'suspects',
              'belief': '',
              'nodeId': null,
              'eventId': null,
              'how': '',
              'fromId': null,
            },
          ],
        }),
      );
      expect(
        () => w.act(
          (c) => c.saveSecret(kael, secret.id, {
            'knows': [mira],
          }),
        ),
        throwsA(isA<ChangeRefused>()),
      );
      final kept = w.act((c) => c.saveSecret(kael, secret.id, {'title': 'Heir to the throne'}));
      expect(kept.records.single.id, 'r1', reason: 'records are kept as they were');
    });

    test('keeps notes out of the record until the author copies one in', () {
      final w = World();
      final marcus = w.createCharacter('Marcus');
      final before = w.entry(marcus).raw['fields'];
      final note = w.act(
        (c) => c.saveNote(marcus, null, content: 'Maybe make Marcus the prince’s brother', tags: ['idea', 'idea']),
      );
      expect(
        [note.title, note.tags, note.pinned],
        [
          'Maybe make Marcus the prince’s brother',
          ['idea'],
          false,
        ],
      );
      w.act((c) => c.saveNote(marcus, null, title: 'Pinned', content: 'Read first.', pinned: true));
      expect([for (final n in w.read.notes(marcus)) n.title], ['Pinned', 'Maybe make Marcus the prince’s brother']);
      // Writing the note changed nothing about Marcus.
      expect(jsonEquals(w.entry(marcus).raw['fields'], before), isTrue);
      expect(
        () => w.act((c) => c.saveNote(marcus, null, title: '', content: ' ')),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', 'Write the note first.')),
      );

      final identity = w.sectionId(marcus, 0);
      expect(() => w.act((c) => c.promoteNote(note.id, identity, '')), throwsA(isA<ChangeRefused>()));
      final field = w.act((c) => c.promoteNote(note.id, identity, 'Family'));
      expect(w.entry(marcus).raw['fields'], [
        {'id': field['id'], 'key': 'Family', 'value': 'Maybe make Marcus the prince’s brother', 'type': 'longtext'},
      ]);
      expect(w.read.notes(marcus), hasLength(2));
      expect((w.history(marcus).first.action, w.history(marcus).first.label), ('note', 'Family'));
    });

    test('tells a change to the record from an event in the story', () {
      final w = World();
      final marcus = w.createCharacter('Marcus');
      w.chapter('ch18');
      final job = str(
        w.act(
          (c) => c.addField(marcus, w.sectionId(marcus, 0), const FieldSuggestion('Occupation'), value: 'Soldier'),
        )['id'],
      );
      w.act((c) => c.updateField(marcus, job, value: 'Commander'));
      final event = w.act((c) => c.addMilestone(marcus, 'Marcus became commander.', 'ch18'));
      expect(() => w.act((c) => c.addMilestone(marcus, ' ')), throwsA(isA<ChangeRefused>()));
      final lines = w.history(marcus);
      expect(
        [
          for (final h in lines)
            if (!h.isStory) [h.action, h.label, h.from, h.to],
        ],
        [
          ['field', 'Occupation', 'Soldier', 'Commander'],
          ['created', 'Marcus', '', ''],
        ],
      );
      expect(
        [for (final h in lines.where((h) => h.isStory)) (h.text, h.nodeId)],
        [('Marcus became commander.', 'ch18')],
      );
      // Only the author's own story lines can be removed; the record of changes cannot.
      w.act((c) => c.removeMilestone(lines.firstWhere((h) => h.action == 'created').id));
      w.act((c) => c.removeMilestone(event.id));
      expect([for (final h in w.history(marcus)) h.action], ['field', 'created']);
    });
  });

  group('archiving and deleting', () {
    test('says what refers to a character, and deleting removes it without harming anything else', () {
      final w = World();
      final kael = w.createCharacter('Kael');
      final mira = w.createCharacter('Mira');
      final guild = w.act((c) => c.createEntry('faction', 'Ash Guild'));
      w.act((c) => c.linkEntries(kael, guild.id, 'Captain'));
      w.chapter('one', mentions: [kael]);
      final doc = {
        'type': 'doc',
        'content': [
          {
            'type': 'paragraph',
            'content': [
              {
                'type': 'text',
                'text': 'Kael',
                'marks': [
                  {
                    'type': 'entityLink',
                    'attrs': {'entryId': kael},
                  },
                ],
              },
            ],
          },
        ],
      };
      w.snapshot = w.snapshot
          .putRow('chapterContents', {'id': 'one', 'projectId': 'novel', 'doc': doc})
          .putRow('characterRelations', {'id': 'rel', 'projectId': 'novel', 'fromId': kael, 'toId': mira})
          .putRow('plotThreads', {
            'id': 'heist',
            'projectId': 'novel',
            'title': 'The Heist',
            'characterIds': [kael, mira],
          });
      w.act((c) => c.saveSecret(kael, null, {'title': 'Heir'}));
      final hers = w.act(
        (c) => c.saveSecret(mira, null, {
          'title': 'Spy',
          'knows': [kael],
        }),
      );
      w.act((c) => c.saveNote(kael, null, content: 'A note.'));
      expect(referencesTo(w.snapshot, kael).counts, {
        'chapters': 1,
        'relationships': 1,
        'events': 0,
        'threads': 1,
        'links': 1,
        'sheets': 0,
        'snapshots': 0,
        'secrets': 1,
        'inSecrets': 1,
        'notes': 1,
      });

      w.snapshot = planCharacterDelete(w.snapshot, kael).snapshot;
      expect([for (final r in w.rows('loreEntries')) r['name']], ['Mira', 'Ash Guild']);
      for (final collection in ['characterProfiles', 'characterSecrets', 'characterNotes', 'characterHistory']) {
        expect(w.rows(collection).any((r) => r['entryId'] == kael), isFalse, reason: collection);
      }
      expect(w.rows('characterRelations'), isEmpty);
      // Everything else is as it was: the words, the faction, the plot thread, Mira and her secret (which no longer
      // names Kael).
      expect(jsonEquals(w.rows('chapterContents').single['doc'], doc), isTrue);
      expect(w.rows('plotThreads').single['title'], 'The Heist');
      final secret = CharacterSecret(w.rows('characterSecrets').firstWhere((r) => r['id'] == hers.id));
      expect([secret.title, secret.knows], ['Spy', <String>[]]);
    });

    test('travels with the novel: a copy has its own characters, profiles, secrets and notes', () {
      final w = World();
      final kael = w.createCharacter('Kael', epithet: 'The Oathbreaker');
      final mira = w.createCharacter('Mira');
      w.act(
        (c) => c.saveSecret(kael, null, {
          'title': 'Heir',
          'knows': [mira],
        }),
      );
      w.act((c) => c.saveNote(kael, null, content: 'A note.'));
      final copy = duplicateNovel(w.snapshot, title: 'Ashfall (Copy)', now: 5);
      final theirs = CharacterChanges(copy, now: 6, createId: () => 'x');
      final cast = [
        for (final r in copy.rows('loreEntries'))
          if (r['category'] == 'character') Entry(r),
      ];
      expect([for (final e in cast) e.name]..sort(), ['Kael', 'Mira']);
      final kael2 = cast.firstWhere((e) => e.name == 'Kael');
      expect(kael2.id, isNot(kael));
      final profile = theirs.profileOf(kael2);
      expect((profile.epithet, profile.entryId), ('The Oathbreaker', kael2.id));
      expect(theirs.secrets(kael2.id).single.knows, [cast.firstWhere((e) => e.name == 'Mira').id]);
      expect(theirs.notes(kael2.id), hasLength(1));
      expect(foreignReferences(w.snapshot, copy), isEmpty);
    });
  });
}
