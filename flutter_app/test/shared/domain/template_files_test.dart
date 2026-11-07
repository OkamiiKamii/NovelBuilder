// Template files: what goes out is built from definitions alone and is exactly what comes back in; anything that is
// not template data is left out; a file over a limit, of an unknown kind or format, or not a template at all is
// refused whole; and a newer version of a template is recognised.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/sharing/template_files.dart';

import 'fixtures.dart';

void main() {
  var ids = 0;
  String id() => 'new-${ids++}';
  final novel = loadFixture('made-in-the-app');

  SharedTemplate share(TemplateKind kind, JsonMap content) => makeSharedTemplate(
    kind: kind,
    id: 'tpl-1',
    version: 2,
    name: 'My template',
    description: 'For testing.',
    author: 'Test Author',
    license: TemplateLicense.ccBy,
    now: 1800000000000,
    content: content,
    newId: id,
  );

  JsonMap file(TemplateKind kind, Object? content, {Map<String, Object?> extra = const {}}) => {
    'format': templateFormat,
    'version': 1,
    'kind': kind.key,
    'id': 'x',
    'templateVersion': 1,
    'name': 'X',
    'content': content,
    ...extra,
  };

  String refusal(Object? json) {
    try {
      readTemplateFile(json is String ? json : jsonEncode(json), newId: id);
    } on TemplateFileException catch (e) {
      return e.message;
    }
    return 'taken in';
  }

  test('categories go out and come back exactly, with who made them, the terms and the version', () {
    final categories = [for (final r in novel.rows('loreSchemas')) CodexChanges.kindTemplate(Category(r))];
    final shared = share(TemplateKind.categories, {'categories': categories});
    final back = readTemplateFile(shared.toFileText(), newId: id);
    expect(back.kind, TemplateKind.categories);
    expectJson(back.content, shared.content);
    expect(
      [back.id, back.version, back.name, back.author, back.license],
      ['tpl-1', 2, 'My template', 'Test Author', TemplateLicense.ccBy],
    );
    expect(back.leftOut, 0);
    expect(maps(back.content['categories']).length, categories.length);
    expect(back.summary, isNotEmpty);
  });

  test('a template made from a real novel carries none of its records, text or notes', () {
    final categories = [for (final r in novel.rows('loreSchemas')) CodexChanges.kindTemplate(Category(r))];
    final text = share(TemplateKind.categories, {'categories': categories}).toFileText();
    final system = share(TemplateKind.system, systemContent(novel.rows('systems').first)).toFileText();
    for (final out in [text, system]) {
      for (final collection in ['loreEntries', 'chapters', 'chapterContents', 'characterSecrets', 'timelineEvents']) {
        for (final r in novel.rows(collection)) {
          expect(out.contains(str(r['id'])), isFalse, reason: '$collection ${r['id']}');
        }
      }
      for (final r in novel.rows('loreEntries')) {
        if (str(r['notes']).length > 8) expect(out.contains(str(r['notes'])), isFalse);
        if (str(r['description']).length > 12) expect(out.contains(str(r['description'])), isFalse);
      }
      expect(out.contains(novel.projectId), isFalse, reason: 'not even the novel\'s id');
    }
  });

  test('a profile layout and a system go out and come back exactly', () {
    final layout = share(
      TemplateKind.profileLayout,
      layoutContent({
        'sections': [
          {
            'name': 'Combat',
            'tab': 'details',
            'fields': [
              {'name': 'Weapon', 'type': 'text'},
              {
                'name': 'Style',
                'type': 'select',
                'options': ['Swift', 'Heavy'],
              },
            ],
          },
        ],
      }),
    );
    expectJson(readTemplateFile(layout.toFileText(), newId: id).content, layout.content);
    final row = novel.rows('systems').first;
    final system = share(TemplateKind.system, systemContent(row));
    final back = readTemplateFile(system.toFileText(), newId: id);
    expectJson(back.content, system.content);
    expect(back.content.containsKey('projectId'), isFalse);
    expect(back.content.containsKey('createdAt'), isFalse);
    // Formulas travel as the words the author wrote; they are read by the app's own arithmetic, never run.
    final formulas = [for (final v in maps(row['variables'])) str(v['formula'])].where((f) => f.isNotEmpty);
    for (final f in formulas) {
      expect(jsonEncode(back.content).contains(jsonEncode(f).replaceAll('"', '')), isTrue);
    }
  });

  test('anything that is not template data is left out, and counted', () {
    final read = readTemplateFile(
      jsonEncode(
        file(
          TemplateKind.categories,
          {
            'categories': [
              {
                'key': 'custom-spells',
                'name': 'Spells',
                'color': '#123456',
                'onLoad': 'alert(1)',
                'fields': [
                  {'id': 'f1', 'name': 'Cost', 'type': 'number', 'script': 'rm -rf /', 'archived': false},
                  {'id': 'f2', 'name': 'Old', 'type': 'text', 'archived': true},
                ],
                'entries': [
                  {'name': 'A secret entry'},
                ],
              },
            ],
            'manuscript': 'Chapter one...',
          },
          extra: {'run': 'code', 'author': 'Someone'},
        ),
      ),
      newId: id,
    );
    final text = jsonEncode(read.toJson());
    for (final bad in ['alert(1)', 'rm -rf', 'A secret entry', 'Chapter one', 'code']) {
      expect(text.contains(bad), isFalse, reason: bad);
    }
    expect(read.leftOut, greaterThanOrEqualTo(4));
    final fields = maps(maps(read.content['categories']).single['fields']);
    expect(fields.map((f) => f['name']), ['Cost'], reason: 'an archived field is not shared');
    expect(
      fields.single.keys.toSet().difference({
        'id',
        'name',
        'type',
        'options',
        'required',
        'help',
        'min',
        'max',
        'target',
      }),
      isEmpty,
    );
  });

  test('a file over a limit, of an unknown kind, or not a template is refused whole, with the reason', () {
    final long = 'x' * 2001;
    expect(refusal('not json at all'), contains('could not be read'));
    expect(refusal({'format': 'novel-builder/project'}), contains('not a Novel Builder template file'));
    expect(refusal({...file(TemplateKind.categories, {}), 'version': 2}), contains('newer version'));
    expect(refusal({...file(TemplateKind.categories, {}), 'kind': 'macro'}), contains('does not know'));
    expect(refusal(file(TemplateKind.categories, {'categories': <Object?>[]})), contains('nothing to use'));
    expect(
      refusal(
        file(TemplateKind.categories, {
          'categories': [
            for (var i = 0; i < 101; i++) {'name': 'C$i', 'fields': <Object?>[]},
          ],
        }),
      ),
      contains('more than 100 categories'),
    );
    expect(
      refusal(
        file(TemplateKind.categories, {
          'categories': [
            {'name': long},
          ],
        }),
      ),
      contains('longer than'),
    );
    expect(
      refusal(
        file(TemplateKind.categories, {
          'categories': [
            {
              'name': 'C',
              'fields': [
                {'name': 'F', 'type': 'formula'},
              ],
            },
          ],
        }),
      ),
      contains('field of a kind this app does not know'),
    );
    expect(
      refusal(
        file(TemplateKind.profileLayout, {
          'sections': [
            {
              'name': 'S',
              'fields': [
                {'name': 'F', 'type': 'executable'},
              ],
            },
          ],
        }),
      ),
      contains('field of a kind this app does not know'),
    );
    Object deep = 'x';
    for (var i = 0; i < 20; i++) {
      deep = [deep];
    }
    expect(
      refusal(
        file(TemplateKind.system, {
          'name': 'S',
          'variables': [deep],
        }),
      ),
      contains('nested'),
    );
    expect(refusal('{"format":"novel-builder/template","pad":"${'y' * 1000001}"}'), contains('larger than'));
  });

  test('a newer version of a template is recognised; the same or an older one is not taken as new', () {
    final t = share(TemplateKind.categories, {
      'categories': [
        {'name': 'Spells', 'fields': <Object?>[]},
      ],
    });
    expect(standingOf(t, const []), TemplateStanding.added);
    expect(standingOf(t, const [(id: 'tpl-1', version: 1)]), TemplateStanding.newer);
    expect(standingOf(t, const [(id: 'tpl-1', version: 2)]), TemplateStanding.sameOrOlder);
    expect(standingOf(t, const [(id: 'other', version: 9)]), TemplateStanding.added);
  });
}

void expectJson(Object? actual, Object? expected) => expect(jsonEncode(actual), jsonEncode(expected));
