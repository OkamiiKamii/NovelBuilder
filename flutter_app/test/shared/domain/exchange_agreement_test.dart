import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/import_parse.dart';
import 'package:novel_builder/shared/domain/exchange/import_structure.dart';
import 'package:novel_builder/shared/domain/exchange/records_export.dart';
import 'package:novel_builder/shared/domain/exchange/render_docx.dart';
import 'package:novel_builder/shared/domain/exchange/render_text.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';

import 'fixtures.dart';
import 'golden.dart';

/// The original's runs omit a style that is off; so does this.
JsonMap runJson(Run r) => r.toJson();

Object? blockJson(ImportBlock b) => switch (b) {
  ImportHeading() => {'type': 'heading', 'level': b.level, 'text': b.text},
  ImportParagraph() => {
    'type': 'paragraph',
    'runs': [for (final r in b.runs) runJson(r)],
    if (b.align != null) 'align': b.align!.name,
    if (b.quote) 'quote': true,
  },
  ImportDivider() => {'type': 'divider'},
};

Object? nodeJson(ImportNode n) => {
  'kind': n.kind.name,
  'title': n.title,
  'words': metricsOf(n.blocks).words,
  'doc': toDoc(n.blocks),
  'children': [for (final c in n.children) nodeJson(c)],
};

Map<String, String> zipParts(List<int> bytes) => {
  for (final f in ZipDecoder().decodeBytes(bytes).files) f.name: utf8.decode(f.readBytes()!),
};

void main() {
  final golden = readGolden('exchange.golden.json');

  group('manuscript export agrees with the original app', () {
    for (final name in ['qa-sample', 'made-in-the-app', 'saga']) {
      final snapshot = loadFixture(name);
      final expected = golden[name]! as JsonMap;
      final variants = {
        'reader': ExportOptions.reader,
        'bible': ExportOptions.bible,
        'planningOnly': const ExportOptions(
          manuscript: false,
          titles: false,
          notes: true,
          lore: false,
          planning: true,
          history: false,
        ),
        'textOnly': const ExportOptions(
          manuscript: true,
          titles: false,
          notes: false,
          lore: false,
          planning: false,
          history: false,
        ),
        'scoped': ExportOptions.bible.copyWith(scopeId: () => expected['scopeId'] as String?),
      };
      for (final MapEntry(key: key, value: options) in variants.entries) {
        test('$name, $key', () {
          final want = expected[key]! as JsonMap;
          final compiled = compileNovel(snapshot, options);
          expectJson(compiled.toJson(), want['compiled'], '$name $key compiled');
          expect(renderText(compiled), want['txt'], reason: '$name $key text');
          expect(renderMarkdown(compiled), want['md'], reason: '$name $key Markdown');
          expect(renderHtml(compiled), want['html'], reason: '$name $key web page');
          if (want['docx'] case final JsonMap parts) {
            expect(zipParts(renderDocx(compiled)), parts, reason: '$name $key Word');
          }
        });
      }
    }
  });

  group('manuscript import agrees with the original app', () {
    final imports = golden['imports']! as JsonMap;
    for (final MapEntry(key: fileName, value: expected) in imports.entries) {
      test(fileName, () {
        final want = expected! as JsonMap;
        final blocks = parseFile(fileName, File('test/fixtures/exchange/$fileName').readAsBytesSync());
        expectJson([for (final b in blocks) blockJson(b)], want['blocks'], '$fileName blocks');
        final splits = {
          'both': (true, true),
          'chapters': (true, false),
          'scenes': (false, true),
          'none': (false, false),
        };
        for (final MapEntry(key: split, value: (chapters, scenes)) in splits.entries) {
          final nodes = buildStructure(
            blocks,
            ImportOptions(
              splitChapters: chapters,
              splitScenes: scenes,
              fallbackTitle: fileName.replaceFirst(RegExp(r'\.[^.]+$'), ''),
            ),
          );
          final s = summarise(nodes);
          final w = (want['splits']! as JsonMap)[split]! as JsonMap;
          expectJson([for (final n in nodes) nodeJson(n)], w['nodes'], '$fileName $split');
          expectJson(
            {'volumes': s.volumes, 'chapters': s.chapters, 'scenes': s.scenes, 'words': s.words},
            w['summary'],
            '$fileName $split summary',
          );
        }
      });
    }

    test('files that cannot be read say why, in the same words', () {
      for (final MapEntry(key: fileName, value: message) in (golden['errors']! as JsonMap).entries) {
        final bytes = utf8.encode(
          fileName == 'broken.docx'
              ? 'not a zip'
              : fileName == 'fake.rtf'
              ? 'plain words'
              : 'x',
        );
        expect(
          () => parseFile(fileName, bytes),
          throwsA(isA<ImportException>().having((e) => e.reason, 'reason', message)),
          reason: fileName,
        );
      }
    });
  });

  group('a view\'s records agree with the original app', () {
    final views = golden['views']! as JsonMap;
    for (final MapEntry(key: name, value: perView) in views.entries) {
      final model = StoryModel.fromSnapshot(loadFixture(name));
      final byView = perView! as JsonMap;
      final some = {...strings(byView['some'])};
      for (final MapEntry(key: view, value: want) in byView.entries) {
        if (view == 'some') continue;
        test('$name, $view', () {
          final w = want! as JsonMap;
          for (final (key, keep, private) in [
            ('all', (String _) => true, false),
            ('private', (String _) => true, true),
            ('some', some.contains, false),
          ]) {
            final got = exportRecords(model, viewData[view]!, keep: keep, includePrivate: private);
            expectJson({'records': got.records, 'names': got.names, 'count': got.count}, w[key], '$name $view $key');
          }
        });
      }
    }
  });

  test('every fixture novel compiles in every switch combination without failing', () {
    for (final name in fixtureNames) {
      for (var mask = 0; mask < 64; mask++) {
        compileNovel(
          loadFixture(name),
          ExportOptions(
            manuscript: mask & 1 != 0,
            titles: mask & 2 != 0,
            notes: mask & 4 != 0,
            lore: mask & 8 != 0,
            planning: mask & 16 != 0,
            history: mask & 32 != 0,
          ),
        );
      }
    }
  });
}
