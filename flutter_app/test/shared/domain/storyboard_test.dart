import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/manuscript/storyboard.dart';

List<({bool heading, String text})> blocks(List<String> paragraphs, {String? heading}) => [
  if (heading != null) (heading: true, text: heading),
  for (final p in paragraphs) (heading: false, text: p),
];

void main() {
  const names = {
    'wren': ['Wren Hollis', 'Wren'],
    'ilse': ['Ilse Marrow', 'Ilse'],
    'vell': ['Vell'],
  };

  test('the first sentence, the last, and who is there, most present first', () {
    final card = storyCardOf(
      blocks(heading: 'The Bell', [
        'The bell had not rung in thirty-one years. Wren dropped the ink.',
        '“Wren,” Ilse said. “What is that?”',
        'Wren ran to the window. Far off, the sea was going away.',
      ]),
      names,
    );
    expect(card.opening, 'The bell had not rung in thirty-one years.');
    expect(card.closing, 'Far off, the sea was going away.');
    expect(card.present, ['wren', 'ilse'], reason: 'Wren four times, Ilse once; Vell not at all');
  });

  test('a closing quotation stays with its sentence', () {
    final card = storyCardOf(blocks(['She left.', 'He called after her. “Come back!”']), names);
    expect(card.closing, '“Come back!”');
  });

  test('one sentence only: an opening and no ending; nothing written: neither', () {
    expect(storyCardOf(blocks(['Only this.']), names).closing, '');
    final none = storyCardOf(blocks(['', '  '], heading: 'Empty'), names);
    expect(none.opening, '');
    expect(none.closing, '');
    expect(none.present, isEmpty);
  });

  test('a long sentence is cut at a word: the opening at its end, the closing at its start', () {
    final long = List.filled(60, 'word').join(' ');
    final card = storyCardOf(blocks(['$long.', 'Then $long end.']), names);
    expect(card.opening.length, lessThanOrEqualTo(storyLineChars + 1));
    expect(card.opening, endsWith('…'));
    expect(card.closing, startsWith('…'));
    expect(card.closing, endsWith('end.'));
  });

  test('the job reads every stored chapter by id', () {
    String stored(String id, String text) => jsonEncode({'id': id, 'doc': textToDoc(text)});
    final cards = storyboardJob([stored('a', 'Wren sang.\nIlse slept.'), stored('b', 'Vell burned.')], names)();
    expect(cards['a']!.opening, 'Wren sang.');
    expect(cards['a']!.closing, 'Ilse slept.');
    expect(cards['b']!.present, ['vell']);
  });
}
