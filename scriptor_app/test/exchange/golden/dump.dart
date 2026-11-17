// The Flutter app's own outputs for the book, the ebook, the web serial and the manuscript export, which
// dart.golden.json pins (outputs.ts makes Scriptor's, keyed the same way). To make the golden again:
//   1. A package config like flutter_app/.dart_tool/package_config.json, with `flutter` pointing at a stand-in package
//      whose lib/foundation.dart is `export 'package:meta/meta.dart' show immutable;` (the domain code needs no more
//      of Flutter) and `novel_builder` at flutter_app. Keep it outside both apps.
//   2. dart run --packages=<that config> dump.dart <out.json>   (the Dart SDK of flutter-3.38.9)
//   3. node make-golden.js <out.json> dart.golden.json
// make-edge.js writes ../edge.novel.json, the novel of edge cases.

import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/render_book.dart';
import 'package:novel_builder/shared/domain/exchange/render_text.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

final here = File.fromUri(Platform.script).parent.path;
final fixturesDir = '$here/../../../../flutter_app/test/fixtures';
const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

JsonMap described(Book book) => {
  'title': book.title,
  'subtitle': book.subtitle,
  'author': book.author,
  'cover': book.cover,
  'accent': book.accent,
  'sceneBreak': book.sceneBreak,
  'words': book.words,
  'chapters': book.chapters,
  'sections': [
    for (final s in book.sections)
      {
        'id': s.id,
        'kind': s.kind.name,
        'title': s.title,
        'label': s.label,
        'showsLabel': s.showsLabel,
        'number': s.number,
        'depth': s.depth,
        'nodeId': s.nodeId,
        'words': s.words,
        'text': s.text,
        'noteBefore': s.noteBefore,
        'noteAfter': s.noteAfter,
        'source': s.source,
        'pieces': [
          for (final p in s.pieces)
            switch (p) {
              BreakPiece() => 'break',
              TextPiece() => {'type': p.node['type'], 'text': pieceText(p)},
            },
        ],
        'blocks': [for (final b in blocksOf(s)) b.toJson()],
      },
  ],
  'progress': [
    for (final (index, _) in book.sections.indexed)
      [for (final fraction in [0.0, 0.25, 0.5, 1.0]) progressAt(book, (index: index, fraction: fraction))],
  ],
  'minutes': readingMinutes(book.words),
  'cast': [
    for (final s in book.sections)
      if (s.kind == SectionKind.cast) [for (final l in castLines(s.text)) [l.group, l.name, l.about]],
  ],
};

Object? zipJson(List<int> bytes) {
  final a = ZipDecoder().decodeBytes(bytes);
  return [
    for (final f in a.files)
      [
        f.name,
        f.name.contains('cover.') ? base64Encode(f.content) : utf8.decode(f.content),
      ],
  ];
}

String err(Object e) => e is BookOutputException ? 'BookOutputException: ${e.message}' : 'ERROR $e';

void main(List<String> args) {
  final out = <String, Object?>{};
  final paths = [for (final f in Directory(fixturesDir).listSync()) if (f.path.endsWith('.novel.json')) f.path]..sort();
  paths.add('$here/../edge.novel.json');
  final modified = DateTime.utc(2026, 10, 26, 12, 30, 5);
  for (final path in paths) {
    final name = File(path).uri.pathSegments.last.replaceAll('.novel.json', '');
    final base = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()));
    NovelSnapshot withProject(JsonMap p) =>
        NovelSnapshot.fromJson({...base.toJson(), 'project': {...base.project, ...p}});
    final variants = <String, NovelSnapshot>{
      '': base,
      if (name == 'edge') ...{
        '+gif': withProject({'cover': 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}),
        '+webp': withProject({'cover': 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA=='}),
        '+riff': withProject({'cover': 'data:image/webp;base64,UklGRhoAAABBVklGVlA4TA0AAAAv'}),
        '+urlsafe': withProject({'cover': 'data:image/png;base64,iVBORw0KGgo-_w=='}),
        '+pct': withProject({'cover': 'data:image/png;base64,iVBORw0KGgoAAA%3D%3d'}),
        '+nob64': withProject({'cover': 'data:image/png,iVBORw0KGgo'}),
        '+bad64': withProject({'cover': 'data:image/png;base64,iVBORw0KGgoA'}),
        '+empty': withProject({'cover': ''}),
      },
      if (name == 'book') ...{
        '+png': withProject({'cover': png}),
        '+web': withProject({'cover': 'https://example.com/cover.jpg'}),
        '+bad': withProject({'cover': 'data:image/png;base64,AAAA'}),
        '+noauthor': withProject({'author': '  ', 'title': ' ', 'subtitle': ''}),
      },
    };
    for (final MapEntry(key: v, value: snapshot) in variants.entries) {
      final source = BookSource.fromSnapshot(snapshot);
      for (final format in BookFormat.values) {
        final book = buildBook(source, format);
        if (v.isEmpty) out['$name.book.${format.name}'] = described(book);
        if (format == BookFormat.ebook) {
          for (final lang in v.isEmpty && name == 'book' ? ['en', 'en-GB', '  '] : [str(snapshot.project['language'], 'en')]) {
            try {
              final r = renderEpub(
                book,
                identifier: epubIdentifier(snapshot.project),
                language: lang,
                modified: modified,
              );
              final a = ZipDecoder().decodeBytes(r.bytes);
              out['$name$v.epub.$lang'] = {
                'files': zipJson(r.bytes),
                'notes': [for (final n in r.notes) n.text],
                'firstStored': a.files.first.compression == CompressionType.none,
              };
            } on Object catch (e) {
              out['$name$v.epub.$lang'] = err(e);
            }
          }
        }
        if (format == BookFormat.serial && v.isEmpty) {
          final chapters = [
            for (final s in book.sections)
              if (s.kind == SectionKind.chapter) s,
          ];
          for (final sf in SerialFormat.values) {
            out['$name.serial.${sf.name}'] = [
              for (final (i, s) in chapters.indexed)
                [serialFileName(s, i, sf), serialHeading(s), renderSerialChapter(book, s, sf)],
            ];
            try {
              out['$name.serialzip.${sf.name}'] = zipJson(renderSerialZip(book, sf));
            } on Object catch (e) {
              out['$name.serialzip.${sf.name}'] = err(e);
            }
          }
        }
      }
    }
    // The manuscript compile, in every combination of its switches but the codex.
    final scopes = <String?>[
      null,
      for (final r in base.rows('chapters'))
        if (r['kind'] != 'scene') str(r['id']),
    ].take(6);
    for (var mask = 0; mask < 32; mask++) {
      for (final scope in mask == 31 || mask == 3 ? scopes : [null]) {
        final options = ExportOptions(
          manuscript: mask & 1 != 0,
          titles: mask & 2 != 0,
          notes: mask & 4 != 0,
          lore: false,
          planning: mask & 8 != 0,
          history: mask & 16 != 0,
          scopeId: scope,
        );
        final c = compileNovel(base, options);
        out['$name.compile.$mask.${scope ?? ''}'] = {
          'compiled': c.toJson(),
          'txt': renderText(c),
          'md': renderMarkdown(c),
          'html': renderHtml(c),
        };
      }
    }
    // With the codex asked for but scoped, the Flutter app adds no codex.
    final firstScope = scopes.skip(1).firstOrNull;
    if (firstScope != null) {
      final c = compileNovel(base, ExportOptions.bible.copyWith(scopeId: () => firstScope));
      out['$name.compile.bible.$firstScope'] = {'compiled': c.toJson()};
    }
  }
  File(args.first).writeAsStringSync(jsonEncode(out));
  stdout.writeln('${out.length} outputs');
}
