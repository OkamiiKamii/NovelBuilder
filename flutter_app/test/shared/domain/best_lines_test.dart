import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/best_lines.dart';

void main() {
  test('a line to quote: a turn, a truth, the senses; not business, a fragment, a number or a broken-off line', () {
    expect(lineScore('The sea does not care how excited you are.'), greaterThan(lineScore('He walked to the door.')));
    expect(lineScore('Everyone in Vell knew what the bell meant.'), greaterThanOrEqualTo(5));
    expect(lineScore('He walked to the door and then he turned to the window.'), lessThan(3));
    expect(lineScore('and the tide went out.'), 0, reason: 'a fragment');
    expect(lineScore('Too short.'), 0);
    expect(lineScore('“Master, if you knew the tables were wrong—”'), 0, reason: 'broken off');
    expect(
      lineScore('There were 400 stones on the road to the sea.'),
      lessThan(lineScore('There were stones on the road to the sea.')),
    );
  });

  test('the best first, one from a paragraph, no line twice, twelve at most', () {
    final lines = bestLines([
      (
        id: 'c1',
        paragraphs: [
          'He sat down. The sea does not care how excited you are. The sea is cold and the night is long.',
          'He walked to the door.',
          'The sea does not care how excited you are.',
        ],
      ),
      (id: 'c2', paragraphs: [for (var i = 0; i < 20; i++) 'Nobody listened, and the bell rang on in the dark.']),
    ]);
    expect(lines, hasLength(2), reason: 'a repeated line once');
    expect(lines.where((l) => l.chapter == 1), hasLength(1), reason: 'one from its paragraph');
    expect(lines.first.score, greaterThanOrEqualTo(lines.last.score));
    expect(bestLines(const []), isEmpty);
  });
}
