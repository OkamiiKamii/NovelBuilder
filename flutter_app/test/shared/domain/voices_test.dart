import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/voices.dart';

void main() {
  const cast = {
    'w': ['Wren Hollis', 'Wren'],
    'n': ['Nan'],
  };

  List<(String, String?)> said(List<String> paragraphs, [Map<String, List<String>> names = cast]) => [
    for (final l in voicesOf(paragraphs, names).lines) (paragraphs[l.block].substring(l.start, l.end), l.speaker),
  ];

  test('a line is tied to the name beside it, after it or before it', () {
    expect(said(['“It is going,” Wren said.']), [('“It is going,”', 'w')]);
    expect(said(['“Go,” said Nan, and turned.']), [('“Go,”', 'n')]);
    expect(said(['Nan whispered: “Close the drawer.”']), [('“Close the drawer.”', 'n')]);
    expect(said(['"Straight quotes," Wren Hollis said.']), [('"Straight quotes,"', 'w')]);
    expect(said(['“British”, said Nan.']), [('“British”', 'n')], reason: 'the comma outside the marks');
  });

  test('a paragraph of one named speaker is theirs throughout; two, or a pronoun, and only what is tied', () {
    expect(said(['“Nine days,” Wren said. “Nine days of low water.”']), [
      ('“Nine days,”', 'w'),
      ('“Nine days of low water.”', 'w'),
    ]);
    expect(said(['“Go,” Wren said. “No,” Nan said. “Then stay.”']), [
      ('“Go,”', 'w'),
      ('“No,”', 'n'),
      ('“Then stay.”', null),
    ]);
    expect(said(['“Go,” Wren said. “No,” she said.']), [('“Go,”', 'w'), ('“No,”', null)]);
  });

  test('nobody named is nobody guessed', () {
    expect(said(['“Who is there?” she asked.']), [('“Who is there?”', null)]);
    expect(said(['“Hello.”']), [('“Hello.”', null)]);
    expect(said(['“Hello,” Orrin said.']), [('“Hello,”', null)], reason: 'not in the cast');
    expect(said(['“Hi,” Wren said.'], const {}), [('“Hi,”', null)], reason: 'no cast at all');
    expect(said(['No dialogue here.', '']), isEmpty);
  });

  test('a name two characters share speaks for neither', () {
    final twins = {
      'a': ['Kit Marrow', 'Kit'],
      'b': ['Kit'],
    };
    expect(said(['“Run,” Kit said.'], twins), [('“Run,”', null)]);
    expect(said(['“Run,” Kit Marrow said.'], twins), [('“Run,”', 'a')]);
  });

  test('the report counts words, lines and who has the floor', () {
    final r = voicesOf([
      'The river rose all night.',
      '“It is going,” Wren said. “All of it.”',
      '“Go,” said Nan.',
      '“Who?” she asked.',
    ], cast);
    expect(r.chapterWords, 5 + 8 + 3 + 3);
    expect(r.dialogueWords, 6 + 1 + 1);
    expect([for (final s in r.speakers) (s.speaker, s.words, s.lines)], [('w', 6, 2), ('n', 1, 1), (null, 1, 1)]);
    expect(r.of('n').single.block, 2);
  });
}
