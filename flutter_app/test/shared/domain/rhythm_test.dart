import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/rhythm.dart';

void main() {
  test('sentences: split at their ends, quotes kept with them, dialogue marked', () {
    final r = rhythmOf(['The gate was open. Nobody guarded it!', '“Go,” she said. “Now?”', 'No end mark']);
    String text(int i) => [
      'The gate was open. Nobody guarded it!',
      '“Go,” she said. “Now?”',
      'No end mark',
    ][r.sentences[i].block].substring(r.sentences[i].start, r.sentences[i].end);
    expect(
      [for (var i = 0; i < r.sentences.length; i++) text(i)],
      ['The gate was open.', 'Nobody guarded it!', '“Go,” she said.', '“Now?”', 'No end mark'],
    );
    expect([for (final s in r.sentences) s.words], [4, 3, 3, 1, 3]);
    expect([for (final s in r.sentences) s.spoken], [false, false, true, true, false]);
    expect((r.shortest, r.longest, r.usual), (1, 4, 3));
  });

  test('a run keeps one beat: five or more of nearly one length, four words or more', () {
    String of(int n) => '${List.filled(n, 'word').join(' ')}.';
    final r = rhythmOf([
      [of(2), of(8), of(9), of(10), of(8), of(11), of(30), of(3)].join(' '),
    ]);
    expect(r.runs, [(from: 1, to: 6)]);
    expect(rhythmOf([List.filled(6, of(2)).join(' ')]).runs, isEmpty, reason: 'short lines in a row are a beat too');
    expect(rhythmOf([List.filled(4, of(9)).join(' ')]).runs, isEmpty, reason: 'four is not yet a run');
    expect(RhythmReport.empty.usual, 0);
  });
}
