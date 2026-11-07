import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

void main() {
  test('the closing words are the last paragraphs, exactly as written, headings left out', () {
    final doc = textToDoc('One.\n\nTwo, then three.');
    expect(closingWords(doc), (text: 'One.\n\nTwo, then three.', cut: false));
    expect(closingWords(emptyDoc()), (text: '', cut: false));
    expect(closingWords(null), (text: '', cut: false));
    expect(
      closingWords({
        'type': 'doc',
        'content': [
          {
            'type': 'heading',
            'attrs': {'level': 2},
            'content': [
              {'type': 'text', 'text': 'Part one'},
            ],
          },
          {
            'type': 'paragraph',
            'content': [
              {'type': 'text', 'text': 'It began.'},
            ],
          },
        ],
      }),
      (text: 'It began.', cut: false),
    );
  });

  test('a long ending is cut at a space, never inside a word, and says it was cut', () {
    final words = List.generate(200, (i) => 'word$i').join(' ');
    final closing = closingWords(textToDoc('Earlier.\n\n$words'), max: 60);
    expect(closing.cut, isTrue);
    expect(words.endsWith(closing.text), isTrue);
    expect(closing.text.startsWith('word'), isTrue, reason: 'starts on a whole word');
    expect(closing.text.length, lessThanOrEqualTo(60));
    expect(closing.text.endsWith('word199'), isTrue);
  });

  test('earlier paragraphs that do not fit are left out whole', () {
    final closing = closingWords(textToDoc('${'a ' * 100}\n\nShort end.'), max: 50);
    expect(closing, (text: 'Short end.', cut: true), reason: 'too little room is left for a useful part of it');
    final roomy = closingWords(textToDoc('${'a ' * 100}\n\nShort end.'), max: 80);
    expect(roomy.text.endsWith('a a\n\nShort end.'), isTrue, reason: 'with room, the end of the earlier one too');
  });

  test('one unbroken run longer than the room keeps its end', () {
    final closing = closingWords(textToDoc('x' * 100), max: 60);
    expect(closing, (text: 'x' * 60, cut: true));
  });
}
