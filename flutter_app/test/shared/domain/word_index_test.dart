import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/continuity/text.dart';

/// Names and the text around them: whole words and half-words, cases, accents, apostrophes, hyphens and spaces in
/// names, and letters outside the first plane.
const _names = [
  'Mira',
  'mira',
  'Mira Vance',
  'Vance',
  'Kai',
  'Kaisa',
  'O’Brien',
  "O'Brien",
  'Jean-Luc',
  'Émile',
  'Ωmega',
  '𝐀lpha',
  'The Grey Abbot',
  'Abbot',
  'Dr. Kell',
  'Kell',
  '42nd',
  ' Mira ',
  '',
];
const _words = [
  'Mira',
  'Miras',
  'mira',
  'Vance',
  'Mira Vance',
  'Mira  Vance',
  'Kai',
  'Kaisa',
  'Kai’s',
  'O’Brien',
  "O'Brien",
  'Jean-Luc',
  'Jean',
  'Luc',
  'Émile',
  'Emile',
  'Ωmega',
  '𝐀lpha',
  'x𝐀lpha',
  'The Grey Abbot',
  'Abbots',
  'Dr. Kell',
  'Kell.',
  '42nd',
  '(Mira)',
  '“Kai”',
  'the',
  'and',
  '—',
  '…',
  '\n',
];

void main() {
  test('a word index answers as a search of the text does, for every kind of name', () {
    final rnd = Random(11);
    for (var round = 0; round < 400; round++) {
      final text = [
        for (var i = 0; i < rnd.nextInt(30); i++) _words[rnd.nextInt(_words.length)],
      ].join(const [' ', '', '-', '\n', ', '][rnd.nextInt(5)]);
      final index = WordIndex(text);
      for (final name in _names) {
        expect(index.has(name), findWords(text, [name]).isNotEmpty, reason: '“$name” in “$text”');
      }
    }
  });

  test('the same search, asked again, finds the same (patterns kept for reuse)', () {
    const text = 'Mira met Kai. Kai met the Grey Abbot.';
    final first = findWords(text, ['Kai', 'The Grey Abbot', 'Mira']);
    for (var i = 0; i < 300; i++) {
      findWords('filler $i', ['name$i']);
    }
    expect(findWords(text, ['Kai', 'The Grey Abbot', 'Mira']), first);
    expect(findWords(text, ['grey abbot'], loose: true).single.text, 'Grey Abbot');
  });
}
