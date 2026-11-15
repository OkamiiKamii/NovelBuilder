import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';
import 'package:novel_builder/shared/domain/characters/write_them_in.dart';

void main() {
  group('the sparks', () {
    test('from what the author wrote about them, the strongest first, then the ones that fit anyone', () {
      final sparks = sparksFor(
        'Mark',
        {Stake.wants: 'To open the last door.', Stake.inTheWay: 'The Architect.', Stake.atStake: 'His sister.'},
        [(other: 'Kai', tie: 'Rival'), (other: 'Ren', tie: ''), (other: 'Tam', tie: 'Friend')],
      );
      expect(
        [for (final s in sparks) s.text],
        [
          'Mark goes after what they want: “To open the last door.”',
          'What stands in Mark’s way shows itself: “The Architect.”',
          'Mark comes close to losing it: “His sister.”',
          'Mark and Kai (Rival), in the same room, wanting different things.',
          'Mark and Ren, in the same room, wanting different things.',
          'Mark doing what they do best, and it goes wrong.',
          'Mark wants something small and urgent, right now.',
          'Someone sees Mark for the first time.',
        ],
      );
    });

    test('nothing written about them yet: the ones that fit anyone; a long answer cut at a word', () {
      expect([for (final s in sparksFor('Mark', {}, [])) s.from], ['Anyone', 'Anyone', 'Anyone']);
      final long = sparksFor('Mark', {Stake.wants: 'word ' * 60}, []).first.text;
      expect(long.length, lessThan(200));
      expect(long, endsWith('…”'));
    });
  });

  group('where it goes', () {
    PlaceNode node(String id, {String kind = 'chapter', String? parent, int words = 0, bool planned = false}) =>
        (id: id, kind: kind, parentId: parent, title: 'Chapter $id', words: words, planned: planned);

    test('a book with only its blank first chapter starts there', () {
      final places = placesFor([node('1')]);
      expect([for (final p in places) (p.kind, p.nodeId)], [(PlaceKind.blank, '1'), (PlaceKind.newChapter, '1')]);
      expect(places.first.label, 'In Chapter 1, still blank');
    });

    test('a book being written: a new chapter, or a scene in the latest; a planned or full chapter is not blank', () {
      final places = placesFor([
        node('1', words: 900),
        node('2', planned: true),
        node('s', kind: 'scene', parent: '2'),
      ]);
      expect([for (final p in places) (p.kind, p.nodeId)], [(PlaceKind.newChapter, '2'), (PlaceKind.newScene, '2')]);
      expect(places.last.label, 'A new scene in Chapter 2');
    });

    test('an empty book: a new chapter', () {
      expect([for (final p in placesFor([])) (p.kind, p.nodeId)], [(PlaceKind.newChapter, null)]);
    });
  });
}
