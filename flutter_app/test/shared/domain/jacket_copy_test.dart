import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/jacket_copy.dart';

void main() {
  test('the synopsis is the blurb; the quote is a spoken line short enough to set large', () {
    final copy = jacketCopy([
      'The bell rang over the town at dawn.',
      '“Go,” said Kai. “The water will not wait for anyone at all, not even you, not even the Wardens,” he added.',
      '“Master, it’s the tide bell,” Wren said.',
    ], 'A girl, a chart, and nine days of low water.');
    expect(copy.blurb, 'A girl, a chart, and nine days of low water.');
    expect(copy.quote, 'Master, it’s the tide bell.', reason: 'one word, and sixteen, are not; the comma ends it');
  });

  test('no synopsis: the book’s own opening, cut at a sentence, marked as cut', () {
    final long = List.filled(30, 'The road ran on.').join(' ');
    final copy = jacketCopy([long], '');
    expect(copy.blurb, endsWith('The road ran on. …'));
    expect(copy.blurb.split(' ').length, lessThanOrEqualTo(blurbWords + 1));
    final short = jacketCopy(['It rained. Then it stopped.'], '');
    expect(short.blurb, 'It rained. Then it stopped.', reason: 'all of it: nothing cut');
  });

  test('no spoken line: the first sentence, if it is short enough', () {
    expect(jacketCopy(['The gate was open. Nobody came.'], '').quote, 'The gate was open.');
    expect(jacketCopy([List.filled(30, 'word').join(' ')], '').quote, '');
  });

  test('nothing written: nothing to say', () {
    final copy = jacketCopy(const [], '');
    expect((copy.quote, copy.blurb), ('', ''));
  });
}
