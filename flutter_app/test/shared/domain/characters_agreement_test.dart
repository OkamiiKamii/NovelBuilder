// Agreement with the original app's character code: both real fixture files go through the Dart port, and every
// result must equal what the original TypeScript produced for the same file (tool/golden/characters.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/appearances.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/knowledge.dart';
import 'package:novel_builder/shared/domain/characters/templates.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

/// IndexedDB hands rows back in id order; the original app's lists start from that order.
List<JsonMap> _byId(List<JsonMap> rows) => [...rows]..sort((a, b) => str(a['id']).compareTo(str(b['id'])));

List<String> _ids(List<Listed> list) => [for (final l in list) l.entry.id];

JsonMap _evidence(CellEvidence e) => {'kind': e.kind.name, 'nodeId': e.nodeId, 'eventId': ?e.eventId};

JsonMap _suggestion(FieldSuggestion f) => f.toJson();

void main() {
  for (final name in fixtureNames) {
    group('characters agree with the original app on $name', () {
      late NovelSnapshot snapshot;
      late StoryModel model;
      late JsonMap golden;
      late List<Listed> list;
      late Map<String, String> names;

      setUpAll(() {
        snapshot = loadFixture(name);
        model = StoryModel.fromSnapshot(snapshot);
        golden = readGolden('$name.characters.golden.json');
        final entries = [for (final r in _byId(snapshot.rows('loreEntries'))) Entry(r)];
        names = {for (final e in entries) e.id: e.name};
        final profiles = {
          for (final p in _byId(snapshot.rows('characterProfiles'))) str(p['entryId']): CharacterProfile(p),
        };
        list = listCharacters(
          entries,
          profiles,
          [
            for (final r in _byId(snapshot.rows('loreLinks')))
              if (Link(r).isEntryLink) Link(r),
          ],
          [for (final r in _byId(snapshot.rows('chapters'))) StoryNode(r)],
          model.order.position,
          (e) => freshProfile(e, str(e.raw['projectId']), builtinTemplates.first),
        );
      });

      test('the library: each character with where it is linked and what it belongs to', () {
        expectJson(
          [
            for (final l in list)
              {
                'id': l.entry.id,
                'profileId': l.profile.id,
                'linkedIn': l.linkedIn,
                'first': l.first,
                'latest': l.latest,
                'factions': l.factions,
              },
          ],
          golden['listed'],
          'listed',
        );
      });

      test('every sort order', () {
        expectJson({for (final s in CastSort.values) s.name: _ids(sortCharacters(list, s))}, golden['sorts'], 'sorts');
      });

      test('the filter menus', () {
        final f = facetsOf(list);
        expectJson(
          {
            'roles': f.roles,
            'statuses': f.statuses,
            'tags': f.tags,
            'species': f.species,
            'occupations': f.occupations,
            'factions': f.factions,
          },
          golden['facets'],
          'facets',
        );
      });

      test('search finds the same characters for every query', () {
        final queries = golden['queries']! as JsonMap;
        expectJson(
          {for (final q in queries.keys) q: _ids(list.where((l) => matchesQuery(l, q, (id) => names[id])).toList())},
          queries,
          'queries',
        );
      });

      test('every filter keeps the same characters', () {
        final expected = golden['filtered']! as JsonMap;
        CastFilters filterFor(String key) {
          final colon = key.indexOf(':');
          final kind = colon < 0 ? key : key.substring(0, colon);
          final value = colon < 0 ? '' : key.substring(colon + 1);
          return switch (kind) {
            'none' => CastFilters.none,
            'archived' => const CastFilters(archived: true),
            'role' => CastFilters(role: value.toLowerCase()),
            'status' => CastFilters(status: value.toUpperCase()),
            'tag' => CastFilters(tag: value),
            'species' => CastFilters(species: value),
            'occupation' => CastFilters(occupation: value),
            'faction' => CastFilters(faction: value),
            'firstBy' => CastFilters(firstBy: model.order.position[value]),
            _ => throw StateError('Unknown filter $key'),
          };
        }

        expectJson(
          {for (final key in expected.keys) key: _ids(list.where((l) => passesFilters(l, filterFor(key))).toList())},
          expected,
          'filtered',
        );
      });

      test('name mentions are counted as whole words, the same', () {
        final texts = [
          for (final content in snapshot.rows('chapterContents'))
            for (final b in docBlocks(content['doc'])) b.text,
        ];
        expectJson(
          {
            for (final l in list)
              l.entry.id: countMentions(texts, [l.entry.name, l.profile.epithet, ...l.profile.aliases]),
          },
          golden['mentions'],
          'mentions',
        );
        expectJson(
          {
            'firstWords': countMentions(texts, [for (final l in list) l.entry.name.split(' ').first]),
            'short': countMentions(texts, ['a', 'I', '']),
            'punctuation': countMentions(texts, ['the.', 'Mr.']),
          },
          golden['extraMentions'],
          'extraMentions',
        );
      });

      test('the appearance matrix, cell by cell, with every filter', () {
        final chapters = [for (final c in model.order.chapters) c.id];
        final places = [
          for (final e in model.entries.values)
            if (e.category == 'location') e.id,
        ]..sort();
        final characters = [
          for (final e in model.entries.values)
            if (e.category == 'character') e.id,
        ]..sort();
        String? at(int i) => i < chapters.length ? chapters[i] : null;
        final filters = {
          'chapters': const MatrixFilter(),
          'scenes': const MatrixFilter(grain: Grain.scenes),
          'everyone': const MatrixFilter(all: true),
          'scenesEveryone': const MatrixFilter(grain: Grain.scenes, all: true),
          'drafting': const MatrixFilter(grain: Grain.scenes, status: NodeStatus.drafting, all: true),
          'range': MatrixFilter(from: at(1), to: at(2)),
          'openEnd': MatrixFilter(grain: Grain.scenes, from: at(1)),
          'place': MatrixFilter(grain: Grain.scenes, placeId: places.firstOrNull),
          'text': const MatrixFilter(text: 'MI', all: true),
          'one': MatrixFilter(characterIds: characters.take(1).toList(), all: true),
        };
        final expected = golden['matrices']! as JsonMap;
        for (final MapEntry(key: key, value: filter) in filters.entries) {
          final m = appearanceMatrix(model, filter);
          expectJson(
            {
              'columns': [
                for (final c in m.columns)
                  {
                    'nodeId': c.nodeId,
                    'chapterId': c.chapterId,
                    'chapterNumber': c.chapterNumber,
                    'label': c.label,
                    'short': c.short,
                    'status': c.status.key,
                  },
              ],
              'rows': [
                for (final r in m.rows)
                  {
                    'characterId': r.characterId,
                    'name': r.name,
                    'recorded': r.recorded,
                    'cells': [
                      for (final (i, cell) in r.cells.indexed)
                        {
                          'state': cell.state.name,
                          'evidence': [for (final e in cell.evidence) _evidence(e)],
                          'words': evidenceWords(cell.evidence, model, m.columns[i].nodeId),
                        },
                    ],
                  },
              ],
              'hidden': m.hidden,
              'characters': m.characters,
            },
            expected[key],
            'matrices.$key',
          );
        }
      });

      test('who knows each secret, from the records alone', () {
        expectJson(
          [
            for (final r in snapshot.rows('characterSecrets'))
              () {
                final s = CharacterSecret(r);
                return {
                  'id': s.id,
                  'people': peopleOf(s),
                  'groups': [
                    for (final g in whoKnowsWhat(s)) {'state': g.state?.key, 'ids': g.ids},
                  ],
                  'current': {
                    for (final p in peopleOf(s))
                      p: () {
                        final c = currentOf(s, p);
                        return {'state': c.state?.key, 'record': c.record?.raw, 'source': c.source?.name};
                      }(),
                  },
                };
              }(),
          ],
          golden['secrets'],
          'secrets',
        );
      });

      test('field values read and checked the same', () {
        final categories = categoriesOf(snapshot);
        final entries = {for (final r in snapshot.rows('loreEntries')) str(r['id']): Entry(r)};
        final out = <Object?>[];
        for (final entry in [for (final r in _byId(snapshot.rows('loreEntries'))) Entry(r)]) {
          final category = categories[entry.category];
          if (category == null) continue;
          final view = viewFields(entry, category);
          for (final (def, field) in view.category) {
            final issue = checkValue(def, field?.value ?? '', entries, categoryName: (k) => categories[k]?.name ?? k);
            out.add({
              'entry': entry.id,
              'def': def.id,
              'display': field == null ? null : displayValue(def.type, field.value, (id) => names[id]),
              'issue': issue == null
                  ? null
                  : {
                      'defId': issue.defId,
                      'field': issue.field,
                      'problem': issue.problem.key,
                      'message': issue.message,
                    },
            });
          }
          for (final field in view.own) {
            out.add({
              'entry': entry.id,
              'field': field.id,
              'display': displayValue(field.type, field.value, (id) => names[id]),
            });
          }
        }
        expectJson(out, golden['fields'], 'fields');
      });
    });
  }

  test('templates, their sections and what each section suggests, as the original app has them', () {
    final golden = readGolden('templates.golden.json');
    expectJson(
      [
        for (final t in builtinTemplates)
          {
            'id': t.id,
            'projectId': null,
            'name': t.name,
            'description': t.description,
            'sections': [for (final s in t.sections) s.toJson()],
            'createdAt': 0,
          },
      ],
      golden['templates'],
      'templates',
    );
    expectJson({for (final t in builtinTemplates) t.id: sectionsOf(t)}, golden['sections'], 'sections');
    final expected = golden['suggestions']! as JsonMap;
    expectJson(
      {
        for (final key in expected.keys)
          key: () {
            final bar = key.indexOf('|');
            final have = key.substring(bar + 1);
            return [
              for (final f in suggestionsFor(
                key.substring(0, bar),
                builtinTemplates,
                have.isEmpty ? [] : have.split(','),
              ))
                _suggestion(f),
            ];
          }(),
      },
      expected,
      'suggestions',
    );
  });
}
