// The original app's codex behaviour (src/modules/codex/service.test.ts, recordTypes.test.ts) ported, and agreement
// with its own outputs (tool/golden/codex.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/capabilities.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/type_presets.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

class Codex {
  NovelSnapshot snapshot = NovelSnapshot(project: {'id': 'novel', 'title': 'World'}, collections: const {});
  int clock = 1000;
  int _ids = 0;

  T act<T>(T Function(CodexChanges c) change) {
    final c = CodexChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  CodexChanges get read => CodexChanges(snapshot, now: clock, createId: () => throw StateError('reading'));
  Category category(String key) => read.category(key);
  List<String> fieldNames(String key) => [
    for (final f in category(key).fields) '${f.name}${f.archived ? ' (archived)' : ''}:${f.raw['type']}',
  ];
  Entry entry(String id) => read.owned(id);
}

JsonMap _def(String id, String name, String type, [JsonMap extra = const {}]) => {
  'id': id,
  'name': name,
  'type': type,
  'options': <String>[],
  ...extra,
};

void main() {
  group('agrees with the original app', () {
    final golden = readGolden('codex.golden.json');

    test('the presets, field by field', () {
      expectJson(
        [
          for (final p in typePresets)
            {'id': p.id, 'name': p.name, 'description': p.description, 'categories': p.categories},
        ],
        golden['presets'],
        'presets',
      );
    });

    test('view settings are cleaned, remapped and merged the same', () {
      final raws = <Object?>[
        null,
        <String, Object?>{},
        'x',
        {
          'timeline': {'start': 'a', 'end': 'zz'},
        },
        {
          'map': {'x': 'a', 'y': 'b'},
          'rank': 'c',
          'tree': true,
        },
        {
          'ownership': {'type': '  owns  ', 'field': 'b'},
          'graphLabel': 'a',
          'graphLinks': ['a', 'a', 'zz', 'c'],
        },
        {
          'ownership': {'type': '   '},
          'graphLinks': <String>[],
        },
        {
          'rank': 'zz',
          'timeline': {'start': 'zz'},
          'tree': 'yes',
          'extra': 1,
        },
        {
          'ownership': {'type': 'x' * 80},
        },
      ];
      const ids = ['a', 'b', 'c'];
      expectJson([for (final r in raws) cleanUses(r, ids)], golden['cleaned'], 'cleaned');
      expectJson(
        [for (final r in raws) remapUses(cleanUses(r, ids), (id) => id == 'c' ? null : '${id}2')],
        golden['remapped'],
        'remapped',
      );
      expectJson(
        [
          mergeUses(null, {'rank': 'a'}),
          mergeUses({'rank': 'a'}, null),
          mergeUses(
            {'rank': 'a', 'tree': true},
            {
              'rank': 'b',
              'map': {'x': 'a'},
            },
          ),
        ],
        golden['merged'],
        'merged',
      );
    });

    test('entry search finds the same entries in both real files', () {
      final search = golden['search']! as JsonMap;
      for (final name in fixtureNames) {
        final entries = [for (final r in loadFixture(name).rows('loreEntries')) Entry(r)];
        final expected = search[name]! as JsonMap;
        expectJson(
          {
            for (final q in expected.keys)
              q: [
                for (final e in entries)
                  if (matchesEntry(e, q)) e.id,
              ],
          },
          expected,
          name,
        );
      }
    });
  });

  group('defining a kind of record', () {
    test('a field’s rules are kept only where they fit its type; a link only to a category that exists', () {
      final w = Codex();
      final made = w.act((c) => c.saveCategory(null, (_) => {'name': 'Spells'}));
      final saved = w.act(
        (c) => c.saveCategory(
          made.key,
          (_) => {
            'fields': [
              _def('a', 'Rank', 'number', {'min': 0, 'max': 10, 'required': true, 'help': '  How strong  '}),
              _def('b', 'School', 'text', {'min': 3}),
              _def('c', 'Known by', 'references', {'target': 'character'}),
              _def('d', 'Ghost link', 'reference', {'target': 'nowhere'}),
              _def('e', 'Backwards', 'number', {'min': 5, 'max': 1}),
            ],
          },
        ),
      );
      expect(
        [
          for (final f in saved.fields)
            [f.id, f.raw['required'], f.raw['help'], f.raw['min'], f.raw['max'], f.raw['target']],
        ],
        [
          ['a', true, 'How strong', 0, 10, null],
          ['b', null, null, null, null, null],
          ['c', null, null, null, null, 'character'],
          ['d', null, null, null, null, null],
          ['e', null, null, 5, null, null],
        ],
      );
    });

    test('custom fields cannot grow past the limits that keep the app sound', () {
      final w = Codex();
      final made = w.act((c) => c.saveCategory(null, (_) => {'name': 'Planets'}));
      final many = [for (var i = 0; i <= fieldLimits.fields; i++) _def('f$i', 'F$i', 'text')];
      expect(
        () => w.act((c) => c.saveCategory(made.key, (_) => {'fields': many})),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', contains('at most 60 fields'))),
      );
      final saved = w.act(
        (c) => c.saveCategory(
          made.key,
          (_) => {
            'fields': [
              _def('x', 'N' * 200, 'select', {
                'options': [for (var i = 0; i < 150; i++) 'o$i'],
              }),
            ],
          },
        ),
      );
      expect([saved.fields.first.name.length, saved.fields.first.options.length], [60, 100]);
      final odd = w.act(
        (c) => c.saveCategory(
          made.key,
          (_) => {
            'fields': [_def('y', 'Odd', 'spreadsheet')],
          },
        ),
      );
      expect(odd.fields.firstWhere((f) => f.id == 'y').raw['type'], 'text');
    });

    test('presets: each a starting point that only adds; a second time adds nothing', () {
      final w = Codex();
      final spells = typePresets.firstWhere((t) => t.id == 'spells');
      final after = w.act((c) => c.addKinds(spells.categories));
      final made = after.firstWhere((c) => c.name == 'Spells');
      expect(
        [
          for (final f in made.fields) [f.name, f.raw['type'], f.required, f.target],
        ],
        [
          ['Effect', 'longtext', true, null],
          ['School', 'select', false, null],
          ['Rank', 'number', false, null],
          ['Cost', 'text', false, null],
          ['Known by', 'references', false, 'character'],
        ],
      );
      expect(made.key, startsWith('custom-'));
      // Its view settings follow its own fields.
      expect(made.raw['uses'], {'rank': made.fields[2].id, 'tree': true});
      final again = w.act((c) => c.addKinds(spells.categories));
      expect(jsonEquals(again.firstWhere((c) => c.name == 'Spells').raw, made.raw), isTrue);
      expect(
        [for (final t in typePresets) t.name],
        ['Spells', 'Planets', 'Investigations', 'Techniques', 'Organizations', 'Species', 'Technologies', 'Relics'],
      );
    });

    test('kinds added together keep their links to each other', () {
      final w = Codex();
      final after = w.act(
        (c) => c.addKinds([
          {
            'key': 'cells',
            'name': 'Cells',
            'fields': [
              _def('m', 'Members', 'references', {'target': 'agents', 'required': true}),
            ],
          },
          {'key': 'agents', 'name': 'Agents', 'fields': <Object?>[]},
        ]),
      );
      final cells = after.firstWhere((c) => c.name == 'Cells');
      final agents = after.firstWhere((c) => c.name == 'Agents');
      expect(
        [cells.fields.single.name, cells.fields.single.required, cells.fields.single.target],
        ['Members', true, agents.key],
      );
    });
  });

  group('categories and fields', () {
    test('starts with the six built-in categories and their default fields, storing nothing', () {
      final w = Codex();
      expect(
        [for (final c in w.read.categories()) c.name],
        [
          'Characters',
          'Locations',
          'Factions & Species',
          'Items & Artifacts',
          'Power Systems & Rules',
          'Lore & History',
        ],
      );
      expect(w.fieldNames('location'), ['Type:longtext', 'Region:longtext', 'Notable features:longtext']);
      expect(w.snapshot.rows('loreSchemas'), isEmpty);
    });

    test('NON-DESTRUCTIVE: renaming, retyping, reordering and removing fields never loses a value', () {
      final w = Codex();
      final keep = w.act((c) => c.createEntry('location', 'The Keep'));
      final [type, region, notable] = w.category('location').fields;
      w.act((c) => c.setFieldValue(keep.id, type.id, 'Fortress'));
      w.act((c) => c.setFieldValue(keep.id, region.id, 'North'));
      Map<String?, String> stored() => {for (final f in w.entry(keep.id).fields) f.defId: f.value};
      final values = stored();
      // Rename, retype, reorder; and leave "Region" out entirely.
      w.act(
        (c) => c.saveCategory(
          'location',
          (_) => {
            'fields': [
              {...notable.raw, 'name': 'Sights', 'type': 'number'},
              {...type.raw, 'name': 'Kind'},
            ],
          },
        ),
      );
      expect(w.fieldNames('location'), ['Sights:number', 'Kind:longtext', 'Region (archived):longtext']);
      expect(stored(), values, reason: 'not one stored value changed');
      final view = viewFields(w.entry(keep.id), w.category('location'));
      expect([for (final (d, f) in view.category) '${d.name}=${f?.value ?? ''}'], ['Sights=', 'Kind=Fortress']);
      expect([for (final (d, f) in view.archived) '${d.name}=${f.value}'], ['Region=North']);
      // Restoring the field brings its value back.
      w.act(
        (c) => c.saveCategory(
          'location',
          (current) => {
            'fields': [
              for (final f in current!.fields) {...f.raw}..remove('archived'),
            ],
          },
        ),
      );
      expect(
        viewFields(
          w.entry(keep.id),
          w.category('location'),
        ).category.firstWhere((s) => s.$1.name == 'Region').$2!.value,
        'North',
      );
    });

    test('creates custom categories with their own fields, and entries in them; entries can move', () {
      final w = Codex();
      final kingdoms = w.act(
        (c) => c.saveCategory(
          null,
          (_) => {
            'name': ' Kingdoms ',
            'singular': 'Kingdom',
            'fields': [_def('pop', 'Population', 'number')],
          },
        ),
      );
      expect([kingdoms.name, kingdoms.singular, kingdoms.builtin], ['Kingdoms', 'Kingdom', false]);
      expect(kingdoms.key, startsWith('custom-'));
      expect(
        () => w.act((c) => c.saveCategory(null, (_) => {'name': 'kingdoms'})),
        throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', contains('already a category'))),
      );
      expect(() => w.act((c) => c.saveCategory(null, (_) => {'name': '  '})), throwsA(isA<ChangeRefused>()));
      expect(() => w.act((c) => c.saveCategory('nope', (_) => {'name': 'X'})), throwsA(isA<ChangeRefused>()));
      final aldmoor = w.act((c) => c.createEntry(kingdoms.key));
      expect([aldmoor.name, aldmoor.category], ['New kingdom', kingdoms.key]);
      w.act((c) => c.setFieldValue(aldmoor.id, 'pop', '120000'));
      w.act((c) => c.updateEntry(aldmoor.id, category: 'location'));
      expect(
        [for (final f in viewFields(w.entry(aldmoor.id), w.category('location')).own) '${f.key}=${f.value}'],
        ['Population=120000'],
        reason: 'a value the new category cannot place stays on the entry',
      );
      w.act((c) => c.updateEntry(aldmoor.id, category: 'made-up'));
      expect(w.entry(aldmoor.id).category, 'location');
    });

    test('archiving a category keeps its entries; built-ins cannot be archived', () {
      final w = Codex();
      final ships = w.act((c) => c.saveCategory(null, (_) => {'name': 'Starships'}));
      final ship = w.act((c) => c.createEntry(ships.key, 'Kestrel'));
      w.act((c) => c.saveCategory(ships.key, (_) => {'archived': true}));
      expect(w.category(ships.key).archived, isTrue);
      expect(w.entry(ship.id).name, 'Kestrel');
      expect(() => w.act((c) => c.createEntry(ships.key)), throwsA(isA<ChangeRefused>()));
      w.act((c) => c.saveCategory(ships.key, (_) => {'archived': false}));
      expect(w.act((c) => c.createEntry(ships.key)).category, ships.key);
      w.act((c) => c.saveCategory('location', (_) => {'archived': true}));
      expect(w.category('location').archived, isFalse);
    });

    test('a category keeps what a later version stored on it', () {
      final w = Codex();
      w.snapshot = w.snapshot.putRow('loreSchemas', {
        ...Category.builtin('location').toJson(),
        'id': 's1',
        'projectId': 'novel',
        'futureSetting': {'x': 1},
        'fields': [
          {...Category.builtin('location').fields.first.raw, 'futureRule': 'keep me'},
        ],
      });
      final saved = w.act((c) => c.saveCategory('location', (_) => {'name': 'Places'}));
      expect(saved.raw['futureSetting'], {'x': 1});
      w.act(
        (c) => c.saveCategory(
          'location',
          (current) => {
            'fields': [for (final f in current!.fields) f.raw],
          },
        ),
      );
      expect(w.category('location').fields.first.raw['futureRule'], 'keep me');
    });

    test('fields of one entry alone sit beside the category’s fields, and empty rows are dropped', () {
      final w = Codex();
      final keep = w.act((c) => c.createEntry('location', 'The Keep'));
      w.act((c) => c.setFieldValue(keep.id, 'builtin-location-0', 'Fortress'));
      w.act(
        (c) => c.setOwnFields(keep.id, [
          {'id': 'o1', 'key': 'Motto', 'value': 'Hold'},
          {
            'id': 'o2',
            'key': 'Rank',
            'value': 'S',
            'type': 'select',
            'options': ['A', 'S', 'S'],
          },
          {'id': 'o3', 'key': '', 'value': ''},
        ]),
      );
      final view = viewFields(w.entry(keep.id), w.category('location'));
      expect(
        [for (final f in view.own) f.raw],
        [
          {'id': 'o1', 'key': 'Motto', 'value': 'Hold'},
          {
            'id': 'o2',
            'key': 'Rank',
            'value': 'S',
            'type': 'select',
            'options': ['A', 'S'],
          },
        ],
      );
      expect(view.category.first.$2?.value, 'Fortress', reason: 'untouched by edits to the entry’s own fields');
    });

    test('a link’s status is set by the author and kept on the link', () {
      final w = Codex();
      final a = w.act((c) => c.createEntry('location', 'A'));
      final b = w.act((c) => c.createEntry('faction', 'B'));
      final link = w.act((c) => c.linkEntries(a.id, b.id, 'Seat of'));
      w.act((c) => c.setLinkCanon(link.id, CanonStatus.conflicting));
      expect(w.snapshot.rows('loreLinks').single['canon'], 'conflicting');
      expect(() => w.act((c) => c.linkEntries(b.id, a.id)), throwsA(isA<ChangeRefused>()));
    });
  });
}
