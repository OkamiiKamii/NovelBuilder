import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/time_lapse.dart';

void main() {
  test('frames oldest first, a save that changed nothing left out, what each adds marked', () {
    final frames = timeLapse([
      (at: 30, paragraphs: ['The gate was open.', 'Nobody guarded it.', 'Orrin went in.']),
      (at: 10, paragraphs: ['The gate was open.', '']),
      (at: 20, paragraphs: ['The gate was open.', 'Nobody guarded it.']),
      (at: 25, paragraphs: ['The gate was open.', 'Nobody guarded it.']),
    ]);
    expect([for (final f in frames) f.at], [10, 20, 30]);
    expect([for (final f in frames) f.words], [4, 7, 10]);
    expect(
      [for (final f in frames) f.fresh],
      [
        {0},
        {1},
        {2},
      ],
    );
  });

  test('a paragraph rewritten is new where it stands; one cut leaves nothing marked', () {
    final rewritten = timeLapse([
      (at: 1, paragraphs: ['A.', 'B.', 'C.']),
      (at: 2, paragraphs: ['A.', 'B, changed.', 'C.']),
      (at: 3, paragraphs: ['A.', 'C.']),
    ]);
    expect(rewritten[1].fresh, {1});
    expect(rewritten[2].fresh, isEmpty);
    expect(rewritten[2].words, 2);
  });

  test('nothing saved, nothing to show', () {
    expect(timeLapse(const []), isEmpty);
  });
}
