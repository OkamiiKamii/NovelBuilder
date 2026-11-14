import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/proof.dart';

void main() {
  List<Proof> proofs(List<String?> paragraphs, {String title = 'One', Set<String> names = const {}}) =>
      proofsOf([(id: 'c1', title: title, paragraphs: paragraphs)], names: names);

  /// What each slip marks, as the kind and the words marked.
  List<(Slip, String)> marks(List<Proof> ps) => [for (final p in ps) (p.kind, p.text.substring(p.start, p.end))];

  test('the plain verb of a past form', () {
    expect(
      [
        for (final w in ['looked', 'tried', 'stopped', 'liked', 'hoped', 'walked', 'filled']) plainOf(w),
      ],
      ['look', 'try', 'stop', 'like', 'hope', 'walk', 'fill'],
    );
  });

  test('a name a letter off one of the book’s names, said rarely, where the name is said often', () {
    final ps = proofs(
      [
        'James ran. James stopped. James looked back.',
        'Then Jmaes laughed, and Jame waved.',
        'Jamie is someone else entirely, said often: Jamie, Jamie, Jamie.',
      ],
      names: {'James Hollis'},
    );
    expect(marks(ps.where((p) => p.kind == Slip.name).toList()), [(Slip.name, 'Jmaes'), (Slip.name, 'Jame')]);
    expect(ps.firstWhere((p) => p.kind == Slip.name).note, '“Jmaes”: is it James?');
  });

  test('not a name slip: the name’s plural or possessive, or a word the book also writes small', () {
    final ps = proofs(
      [
        'Fenn ran. Fenn sat. Fenn slept in Vell, and Vell slept in Vell.',
        'The Fenns had worked the crossings. Fenn’s boat was gone.',
        '“Well?” she said. It was well enough.',
      ],
      names: {'Tobiah Fenn', 'Vell'},
    );
    expect(ps.where((p) => p.kind == Slip.name), isEmpty);
  });

  test('doubled words, but not the doubles English keeps', () {
    final ps = proofs(['She went to the the quay. He had had enough. That that was it.']);
    expect(marks(ps), [(Slip.doubled, 'the the')]);
  });

  test('after didn’t, the plain verb', () {
    final ps = proofs(['With that the waitress left and didn’t looked back. She did not tried. He didn’t need it.']);
    expect(marks(ps), [(Slip.didnt, 'didn’t looked'), (Slip.didnt, 'did not tried')]);
    expect(ps.first.note, 'After “didn’t”, the plain verb: “look”?');
    expect(ps.first.find, 'didn’t looked');
  });

  test('a speech not closed, unless the next paragraph opens one', () {
    final ps = proofs([
      '“Wait, she said. The road is gone.',
      'Then it was quiet.',
      '“This one runs on, as speeches do,',
      '“and closes here.”',
    ]);
    expect([for (final p in ps.where((p) => p.kind == Slip.unclosed)) p.block], [0]);
  });

  test('the few quotes that do not match the book’s', () {
    final ps = proofs(['“One,” she said.', '“Two,” he said.', '"Three," they said.']);
    expect([for (final p in ps.where((p) => p.kind == Slip.quotes)) p.block], [2]);
    expect(ps.firstWhere((p) => p.kind == Slip.quotes).note, 'A straight quote in a book of curly ones.');
  });

  test('spacing: a space before a stop or comma, two between words; in the order they come', () {
    final ps = proofs(['He came , then went  away . Wait...  no.']);
    expect(ps.where((p) => p.kind == Slip.spacing).map((p) => p.note), [
      'A space before the “,”.',
      'Two spaces between words.',
      'A space before the “.”.',
      'Two spaces between words.',
    ]);
  });

  test('a sentence starting small, and i for I; not after Mr. or Dr.', () {
    final ps = proofs(['He left. she stayed. Mr. black came, and i saw Dr. grey.']);
    expect(marks(ps), [(Slip.small, 's'), (Slip.small, 'i')]);
  });

  test('chapters with no title, or no words', () {
    final ps = proofsOf([
      (id: 'a', title: '', paragraphs: ['Some words here.']),
      (id: 'b', title: 'Empty', paragraphs: [null, '']),
    ]);
    expect(
      [for (final p in ps) (p.kind, p.chapter, p.note)],
      [(Slip.chapter, 1, 'Chapter 1 has no title.'), (Slip.chapter, 2, 'This chapter has no words yet.')],
    );
  });

  test('clean prose: nothing', () {
    expect(
      proofs(
        [
          '“The water is going,” Wren said. “Nine days.”',
          'The bell in the tower rang, and nobody slept. Mr. Crane came at dawn.',
        ],
        names: {'Wren Hollis'},
      ),
      isEmpty,
    );
  });
}
