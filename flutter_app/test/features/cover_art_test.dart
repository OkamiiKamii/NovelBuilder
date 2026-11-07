import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/cover_art.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';

Novel _novel(String id, [String genre = '', List<String> more = const []]) =>
    Novel({'id': id, 'title': 'T', 'primaryGenre': genre, 'secondaryGenres': more});

void main() {
  test('a designed jacket\'s motif follows its genre, then the book, and is always the same for a book', () {
    expect(motifOf(_novel('a', 'Progression Fantasy')), CoverMotif.stars);
    expect(motifOf(_novel('a', 'Sci-Fi')), CoverMotif.rings);
    expect(motifOf(_novel('a', 'Romance')), CoverMotif.vines);
    expect(motifOf(_novel('a', 'Mystery')), CoverMotif.sunburst);
    expect(motifOf(_novel('a', 'Adventure')), CoverMotif.waves);
    expect(motifOf(_novel('a', 'Horror')), CoverMotif.crescent);
    expect(motifOf(_novel('a', 'Gothic Romance')), CoverMotif.crescent, reason: 'the first word that says wins');
    expect(motifOf(_novel('a', 'Drama', ['Space opera'])), CoverMotif.rings, reason: 'second genres count');
    final ids = [for (var i = 0; i < 40; i++) 'book-$i'];
    expect({for (final id in ids) motifOf(_novel(id))}.length, greaterThan(4), reason: 'no genre: varied by the book');
    for (final id in ids) {
      expect(motifOf(_novel(id)), motifOf(_novel(id)), reason: 'the same every time');
    }
  });

  testWidgets('every motif draws on a jacket and a spine', (tester) async {
    for (final m in CoverMotif.values) {
      await tester.pumpWidget(
        Row(
          textDirection: TextDirection.ltr,
          children: [
            SizedBox(
              width: 150,
              height: 225,
              child: CustomPaint(
                painter: CoverArtPainter(motif: m, seed: 7, ink: Colors.white),
              ),
            ),
            SizedBox.square(
              dimension: 14,
              child: CustomPaint(
                painter: SpineEmblemPainter(motif: m, ink: Colors.white),
              ),
            ),
          ],
        ),
      );
      expect(tester.takeException(), isNull, reason: '$m');
    }
  });
}
