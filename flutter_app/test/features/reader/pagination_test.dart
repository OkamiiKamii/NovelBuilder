import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/reader/book_layout.dart';
import 'package:novel_builder/shared/domain/reader/book.dart';
import 'package:novel_builder/shared/domain/reader/reader_prefs.dart';

import '../../shared/domain/fixtures.dart';

/// Pages are measured the way they are drawn: every character of a section lands on exactly one page, in order, and no
/// page holds more than fits.
void main() {
  final book = buildBook(BookSource.fromSnapshot(loadFixture('qa-sample')), BookFormat.novel);
  final look = BookLook.of(const ReaderPrefs(), book.sceneBreak, TargetPlatform.android);

  void checkSection(Section s, Size size, TextScaler scaler) {
    final items = sectionItems(book, s, look);
    final pages = paginate(items, size, scaler);
    // Every item is covered from its first character to its last, once, in reading order.
    final covered = <int, int>{};
    var lastItem = -1;
    for (final page in pages) {
      for (final part in page) {
        expect(part.item >= lastItem, isTrue, reason: 'out of order in ${s.title}');
        lastItem = part.item;
        expect(part.start, covered[part.item] ?? 0, reason: 'a gap or overlap in ${s.title}, item ${part.item}');
        expect(part.end > part.start || items[part.item].text.isEmpty, isTrue);
        covered[part.item] = part.end;
      }
    }
    for (final (i, item) in items.indexed) {
      expect(covered[i], item.text.length, reason: 'item $i of ${s.title} is not wholly on the pages');
    }
    // Nothing runs off the bottom, unless one block on its own is taller than a page.
    for (final page in pages) {
      var used = 0.0;
      for (final part in page) {
        final item = items[part.item];
        final p = TextPainter(
          text: spanOf(item, start: part.start, end: part.end),
          textAlign: item.align,
          textDirection: TextDirection.ltr,
          textScaler: scaler,
        )..layout(maxWidth: size.width - item.left);
        used += part.spaceBefore + p.height;
        p.dispose();
      }
      if (page.length > 1) expect(used, lessThanOrEqualTo(size.height + 0.5), reason: 'a page of ${s.title} overflows');
    }
  }

  testWidgets('every chapter, on a small page, is split at line breaks without losing or repeating text', (_) async {
    final chapters = book.sections.where((s) => s.kind == SectionKind.chapter && s.words > 0).toList();
    expect(chapters, isNotEmpty);
    for (final s in chapters) {
      checkSection(s, const Size(260, 220), TextScaler.noScaling);
    }
  });

  testWidgets('at twice the text size the same holds, on more pages', (_) async {
    final s = book.sections.firstWhere((s) => s.kind == SectionKind.chapter && s.words > 0);
    const size = Size(300, 400);
    checkSection(s, size, const TextScaler.linear(2));
    final normal = paginate(sectionItems(book, s, look), size, TextScaler.noScaling).length;
    final large = paginate(sectionItems(book, s, look), size, const TextScaler.linear(2)).length;
    expect(large, greaterThan(normal));
  });
}
