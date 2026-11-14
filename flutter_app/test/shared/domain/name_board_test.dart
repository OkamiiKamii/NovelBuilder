import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/name_board.dart';

void main() {
  BoardName n(String name, [String kind = 'character']) => (name: name, id: name, kind: kind);

  test('the letter a name is shelved under: its first word, "The" and "A" left off, accents plain', () {
    expect(
      [
        for (final s in ['The Drowned Road', 'Wren Hollis', 'A Salt Ship', 'Élodie', 'the', '9 Lives', ''])
          initialOf(s),
      ],
      ['D', 'W', 'S', 'E', 'T', '#', '#'],
    );
  });

  test('by letter, A to Z, each sorted; free letters are the empty ones', () {
    final board = byLetter([n('Wren Hollis'), n('Vell', 'location'), n('Warden'), n('The Wardens’ Tower', 'location')]);
    expect(board.keys.first, 'A');
    expect([for (final b in board['W']!) b.name], ['Warden', 'The Wardens’ Tower', 'Wren Hollis']);
    expect(board['V']!.single.name, 'Vell');
    final free = freeLetters(board);
    expect(free, hasLength(24));
    expect(free, isNot(contains('W')));
  });

  test('one letter apart: changed, added, dropped, or two swapped', () {
    expect(oneApart('marrow', 'merrow'), isTrue);
    expect(oneApart('kate', 'kat'), isTrue);
    expect(oneApart('isle', 'ilse'), isTrue);
    expect(oneApart('wren', 'warden'), isFalse);
    expect(oneApart('same', 'same'), isFalse);
  });

  test('look-alikes between different names, the closest first; a family’s shared name is not one', () {
    final alike = lookAlikes([
      n('Ilse Marrow'),
      n('Kit Marrow'),
      n('Old Merrow', 'location'),
      n('Aldous Crane'),
      n('Aldric'),
      n('Iona'),
      n('Ilsa'),
      n('Tobiah Fenn'),
    ]);
    expect(
      [for (final a in alike) (a.wordA, a.wordB, a.why)],
      [
        ('Ilsa', 'Ilse', 'one letter apart'),
        ('Marrow', 'Merrow', 'one letter apart'),
        ('Aldous', 'Aldric', 'the same first three letters'),
      ],
    );
    final marrow = alike[1];
    expect([for (final x in marrow.inA) x.name], ['Ilse Marrow', 'Kit Marrow']);
    expect([for (final x in marrow.inB) x.name], ['Old Merrow']);
    expect(lookAlikes([n('Elara Fell'), n('Elena Fell')]).single.why, 'beginning and ending alike');
    expect(lookAlikes([n('The Ferry Song'), n('The Ferrymen’s Company')]), isEmpty, reason: 'a word built on another');
  });

  test('the words a reader goes by', () {
    expect(nameWords('The Wardens’ Tower'), ['Wardens', 'Tower']);
    expect(nameWords('Kit of the Quay'), ['Kit', 'Quay']);
    expect(nameWords('al-Rashid'), ['Rashid']);
  });
}
