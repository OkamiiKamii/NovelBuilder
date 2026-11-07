import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';

import 'fixtures.dart';
import 'golden.dart';

/// The book a manuscript makes, in each format, against what the original app's reader made from the same files
/// (`tool/golden/book.test.ts`). `book` is test content holding every case the layout treats specially.
void main() {
  final golden = readGolden('book.golden.json');
  const novels = ['book', 'qa-sample', 'made-in-the-app', 'analytics', 'canon'];

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
        },
    ],
    'progress': [
      for (final (index, _) in book.sections.indexed)
        [
          for (final fraction in [0.0, 0.5, 1.0]) progressAt(book, (index: index, fraction: fraction)),
        ],
    ],
    'minutes': readingMinutes(book.words),
  };

  for (final name in novels) {
    for (final format in BookFormat.values) {
      test('$name as a ${format.label.toLowerCase()} is laid out as the original laid it out', () {
        final book = buildBook(BookSource.fromSnapshot(loadFixture(name)), format);
        expectJson(described(book), (golden[name]! as JsonMap)[format.name], '$name.${format.name}');
      });
    }
  }

  test('typed scene breaks are recognised as the original recognised them', () {
    for (final e in (golden['breakLines']! as JsonMap).entries) {
      expect(isBreakLine(e.key), e.value, reason: e.key);
    }
  });

  test('the book is read from the records, never written: the source is the same after laying it out', () {
    final snapshot = loadFixture('book');
    final before = snapshot.toJson();
    for (final format in BookFormat.values) {
      buildBook(BookSource.fromSnapshot(snapshot), format);
    }
    expect(jsonEquals(snapshot.toJson(), before), isTrue);
  });
}
