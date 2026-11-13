import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/trailer.dart';

void main() {
  List<String> kinds(Trailer t) => [for (final s in t.shots) s.kind.name];
  List<String> lines(Trailer t) => [
    for (final s in t.shots)
      if (s.kind == ShotKind.line) s.text,
  ];

  test('from the author, lines from the book, the names it is about, the strongest last, the title', () {
    final book = [
      'The bell rang over the town at dawn, and nobody in the town of Low Harrow thought anything of it at all.',
      '“Is the water going?” Wren asked.',
      'Wren ran down to the quay.',
      'Kai said nothing for a long while.',
      '“Nobody crosses the road at night!” Kai said.',
      'Wren looked at Kai.',
      'Wren went home.',
      'The tide came in.',
      'Wren slept.',
      '“Kai, the road will drown us all, will it not?” Wren cried, and that was the ending of it.',
    ];
    final t = trailerOf(
      book,
      title: 'The Drowned Road',
      author: 'R. G. A.',
      cast: const [
        (name: 'Wren Hollis', names: ['Wren']),
        (name: 'Kai Marrow', names: ['Kai']),
        (name: 'Orrin', names: ['Orrin']),
      ],
    );
    expect(t.shots.first, (kind: ShotKind.from, text: 'From R. G. A.'));
    expect(t.shots.last, (kind: ShotKind.title, text: 'The Drowned Road'));
    expect(t.cast, ['Wren Hollis', 'Kai Marrow'], reason: 'the most written first; Orrin is never written');
    expect(lines(t), contains('“Is the water going?”'));
    expect(lines(t), contains('“Nobody crosses the road at night!”'));
    expect(lines(t).last, t.sting, reason: 'the line that lands hardest is kept for last');
    expect(lines(t).any((l) => l.contains('drown us all')), isFalse, reason: 'nothing from the last pages');
    expect(lines(t).any((l) => l.startsWith('The bell rang')), isFalse, reason: 'too long to set large');
    expect(kinds(t).where((k) => k == 'name').length, 2);
    expect(kinds(t)[kinds(t).length - 2], 'line', reason: 'the strongest line just before the title, no name between');
  });

  test('not all questions; a spoken line ending in a comma ends as a sentence', () {
    final book = [
      for (var i = 0; i < 6; i++) '“Where is the bell number ${'abcdef'[i]}?”',
      '“Go home now,” she said.',
      'The dark came down over the water.',
      'It was late.',
      'It was later.',
      'It was much later than that.',
    ];
    final t = trailerOf(book, title: 'T', author: '');
    final asked = lines(t).where((l) => l.endsWith('?”')).length;
    expect(asked, lessThanOrEqualTo(2));
    expect(lines(t), contains('“Go home now.”'));
    expect(t.shots.first.text, 'A new novel', reason: 'no author');
  });

  test('fragments, lists and long sentences are not lines a trailer takes', () {
    final t = trailerOf(['and then she went.', 'The list: bread; salt.', 'He waited.'], title: 'T', author: 'A');
    expect(lines(t), isEmpty, reason: 'a fragment, a list, and three words too few');
  });

  test('nothing written: who it is from, and the title', () {
    final t = trailerOf(const [], title: '', author: 'A');
    expect(kinds(t), ['from', 'title']);
    expect(t.shots.last.text, 'Untitled');
    expect(t.sting, '');
  });
}
