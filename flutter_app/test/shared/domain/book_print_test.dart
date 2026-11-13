import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/book_print.dart';

void main() {
  const names = {
    'wren': ['Wren Hollis', 'Wren'],
    'ilse': ['Ilse'],
  };

  test('each paragraph to the one named most in it, else to whom the scene was with; marked where someone speaks', () {
    final lines = printLines([
      'The bell rang over the town.',
      'Wren dropped the ink. Wren ran.',
      '“Is it the tide?” she asked.',
      'Ilse said nothing, and Wren waited for Ilse.',
      'The sea went out.',
    ], namePatterns(names));
    expect([for (final l in lines) l.who], [null, 'wren', 'wren', 'ilse', 'ilse']);
    expect([for (final l in lines) l.spoken], [false, false, true, false, false]);
    expect(lines.first.words, 6);
  });

  test('the print: chapters in order, and whose paragraphs are whose', () {
    final print = bookPrint(
      [(id: 'b', title: 'Two'), (id: 'a', title: 'One')],
      {
        'a': ['Wren lit the lamp.', 'She waited.'],
        'b': ['Ilse came in.'],
      },
      names,
    );
    expect([for (final c in print.chapters) c.title], ['Two', 'One']);
    expect(print.shares, {'ilse': 1, 'wren': 2});
    expect(print.chapters.last.lines.last.who, 'wren', reason: 'her scene goes on');
  });

  test('a chapter with no text is an empty column', () {
    final print = bookPrint([(id: 'a', title: 'One')], const {}, names);
    expect(print.chapters.single.lines, isEmpty);
    expect(print.shares, isEmpty);
  });
}
