import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/feeling_arcs.dart';

void main() {
  const people = <({String id, List<String> names})>[
    (id: 'kade', names: ['Kade Ash', 'Kade']),
    (id: 'mira', names: ['Mira']),
  ];

  /// Chapters of one paragraph each, numbered from 1.
  List<ArcChapter> book(List<String> chapters) => [
    for (final (i, text) in chapters.indexed) (id: 'c${i + 1}', blocks: [(heading: false, text: text)]),
  ];

  test('a man in a hole: bright, then dark, then bright again', () {
    final arcs = feelingArcs(
      book([
        'Kade laughed with his friends, happy and safe.',
        'Kade was glad of the warm fire. Kade smiled.',
        'Kade was afraid. Kade wept, alone and lost.',
        'Kade was hurt, ashamed, and afraid of the dark.',
        'Kade was terrified and broken.',
        'Kade felt hope again. Kade smiled.',
        'Kade laughed, safe and proud, and free.',
      ]),
      people,
    );
    final kade = arcs.arcs.single;
    expect(kade.id, 'kade');
    expect(kade.points.length, 7);
    expect(kade.shape, ArcShape.fallsThenRises);
    expect(kade.shape!.classic, 'a man in a hole');
    expect(kade.low!.chapter, inInclusiveRange(3, 5));
    expect(kade.high!.chapter, anyOf(1, 7));
    expect(kade.points[2].feeling, lessThan(0));
    expect(kade.points[0].feeling, greaterThan(0));
    expect(kade.points[2].lines.first.sentence, startsWith('Kade wept'), reason: 'the strongest line first');
  });

  test('a negation turns a word over; a chapter with no feeling has no reading', () {
    final arcs = feelingArcs(
      book(['Kade was not afraid.', 'Kade walked to the market.', 'Kade never felt happy there.']),
      people,
    );
    final p = arcs.arcs.single.points;
    expect(p[0].feeling, greaterThan(0), reason: 'not afraid');
    expect(p[1].feeling, isNull);
    expect(p[2].feeling, lessThan(0), reason: 'never happy');
  });

  test('the shapes', () {
    expect(shapeOf([-0.5, -0.4, 0, 0.3, 0.5]), ArcShape.rises);
    expect(shapeOf([0.5, 0.3, 0, -0.3, -0.5]), ArcShape.falls);
    expect(shapeOf([-0.4, 0, 0.5, 0.5, 0, -0.4]), ArcShape.risesThenFalls);
    expect(shapeOf([0.1, 0.12, 0.08, 0.1]), ArcShape.flat);
    expect(shapeOf([0.1, 0.2]), isNull, reason: 'too few to say');
    expect(shapeOf([0.4, 0.4, -0.3, 0.4]), ArcShape.fallsThenRises, reason: 'a short line read as drawn');
  });

  test('named too little to draw; never named, not there; the most named first', () {
    final arcs = feelingArcs(
      book(['Kade was happy. Mira was sad.', 'Kade was afraid.', 'Kade was glad. Kade was safe.']),
      people,
    );
    expect([for (final a in arcs.arcs) a.id], ['kade']);
    expect(arcs.thin, ['mira']);
    expect(arcs.chapters, 3);
    expect(feelingArcs(book(['Rain.']), people).thin, isEmpty);
  });
}
