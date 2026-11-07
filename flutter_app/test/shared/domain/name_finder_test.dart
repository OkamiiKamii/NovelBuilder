import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/name_finder.dart';

void main() {
  const text = [
    (
      1,
      ['Mira looked at Kai. Then Mira turned to the gate, where Kai waited with Orrin.', 'It was Monday. A rose grew.'],
    ),
    (2, ['Rose said nothing. Later, Kai and Mira crossed the river; Mira’s horse slipped.', 'Kai laughed at Mira.']),
    (3, ['The Ash Guild met. “Mira,” he said. Nobody answered Kai.']),
  ];

  test('names are capitalised words that recur mid-sentence, counted with their chapters', () {
    final found = manuscriptNames(text);
    expect([for (final n in found) n.name], ['Mira', 'Kai'], reason: 'most written first; Orrin once, Rose not enough');
    final mira = found.firstWhere((n) => n.name == 'Mira');
    expect((mira.times, mira.chapters, mira.first), (6, 3, 1), reason: 'Mira’s counts as Mira');
    final kai = found.firstWhere((n) => n.name == 'Kai');
    expect((kai.times, kai.chapters, kai.first), (5, 3, 1));
  });

  test('known names, names set aside, common words and words usually lower case are left out', () {
    expect(
      [
        for (final n in manuscriptNames(text, known: knownWords(['Kai Ren']))) n.name,
      ],
      ['Mira'],
    );
    expect(
      [
        for (final n in manuscriptNames(text, setAside: {plainName('Mira')})) n.name,
      ],
      ['Kai'],
    );
    final days = manuscriptNames([
      (1, ['On a Monday we left, and by Monday we were home, and every Monday since.']),
    ]);
    expect(days, isEmpty, reason: 'a day is not a character');
    final flower = manuscriptNames([
      (1, ['She gave Rose a rose, and Rose kept the rose, and a rose and a rose and a rose.']),
    ]);
    expect(flower, isEmpty, reason: 'written more often in lower case');
    expect(
      manuscriptNames([
        (1, ['RANKS from E to SSS, then SSS again and SSS.']),
      ]),
      isEmpty,
      reason: 'all capitals',
    );
  });

  test('at most the limit, most written first', () {
    final many = [
      for (var i = 0; i < 20; i++)
        (
          i + 1,
          ['Then Na${String.fromCharCode(97 + i)}o came, and Na${String.fromCharCode(97 + i)}o left, and stayed.'],
        ),
    ];
    expect(manuscriptNames(many, limit: 5), hasLength(5));
  });
}
