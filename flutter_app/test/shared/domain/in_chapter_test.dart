import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/in_chapter.dart';

void main() {
  const names = {
    'w': ['Wren Hollis', 'Wren'],
    'n': ['Nan'],
    'f': ['The Mimir Forest', 'Mimir Forest'],
  };

  test('named as whole words, capitals as written, a full name once; most first', () {
    final found = presentIn([
      'Wren Hollis walked into the Mimir Forest.',
      'Wren said nothing. Nan laughed; Wren did not.',
      'A wren sang. Nanny came. Wrenfield was far.',
    ], names);
    expect(found, [(id: 'w', mentions: 3), (id: 'n', mentions: 1), (id: 'f', mentions: 1)]);
  });

  test('links count too: linked and never named still counts; the larger count is kept', () {
    expect(presentIn(['Nobody is named.'], names, links: {'x': 2}), [(id: 'x', mentions: 2)]);
    expect(presentIn(['Nan, Nan.'], names, links: {'n': 1}), [(id: 'n', mentions: 2)]);
    expect(presentIn(['Nothing here.'], names), isEmpty);
  });

  test('the same count keeps the codex’s order', () {
    expect(presentIn(['Nan met Wren.'], names), [(id: 'w', mentions: 1), (id: 'n', mentions: 1)]);
  });
}
