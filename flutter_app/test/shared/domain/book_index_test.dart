import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/book_index.dart';

BookIndex index(List<List<String>> chapters) =>
    bookIndex([for (final (i, c) in chapters.indexed) (id: 'c${i + 1}', paragraphs: c)]);

List<String> terms(BookIndex i) => [for (final e in i.entries) e.term];

void main() {
  test('names, A to Z, with the chapters they are in, and how often', () {
    final i = index([
      ['Wren walked to the Mimir Forest. She met Kai there.', '“Go,” said Kai.'],
      ['The road led to Vell, and Wren followed it into the Order of the Lamp.'],
    ]);
    expect(terms(i), ['Kai', 'Mimir Forest', 'Order of the Lamp', 'Vell', 'Wren']);
    final kai = i.entries.firstWhere((e) => e.term == 'Kai');
    expect((kai.count, kai.places.single.number, kai.places.single.block), (2, 1, 0));
    final wren = i.entries.firstWhere((e) => e.term == 'Wren');
    expect([for (final p in wren.places) p.number], [1, 2]);
  });

  test('not names: words that only begin sentences, I, pronouns after dialogue, shouting, possessives apart', () {
    final i = index([
      [
        'Then the bell rang. Nobody came.',
        '“Run.” He turned. I saw it: NINE DAYS.',
        'Wren’s ink spilled, and then Wren laughed.',
      ],
    ]);
    expect(terms(i), ['Wren'], reason: 'Then, Nobody, He, I, NINE DAYS are not names; Wren’s is Wren');
    expect(i.entries.single.count, 2);
  });

  test('a sentence’s first word beside a name: the name alone (“Then Wren” is Wren)', () {
    final i = index([
      ['Then Wren ran. Later she saw Wren again.'],
    ]);
    expect(terms(i), ['Wren']);
  });

  test('names written two ways, a letter apart: perhaps a slip; plurals and short words are not', () {
    final i = index([
      ['Tobiah came. Then Tobias left, and Tobiah stayed. The Warden saw the Wardens. Kai met Kat.'],
    ]);
    expect([for (final l in i.lookAlikes) '${l.a.term}/${l.b.term}'], ['Tobiah/Tobias']);
  });

  test('nothing written, nothing indexed', () {
    final i = index([[]]);
    expect(i.entries, isEmpty);
    expect(i.lookAlikes, isEmpty);
  });
}
