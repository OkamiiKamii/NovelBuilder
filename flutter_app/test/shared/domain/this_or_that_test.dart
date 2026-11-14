import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/this_or_that.dart';

void main() {
  test('the sides a list of traits is on; an axis with both or neither is not chosen', () {
    expect(sidesOf(['Quiet', 'Stubborn', 'heart']), {'room': -1, 'head': 1});
    expect(sidesOf(['Quiet', 'Loud']), isEmpty);
    expect(traitsIn('Quiet\nBrave, Kind\n'), ['Quiet', 'Brave', 'Kind']);
  });

  test('the deck written in: its words chosen, the other words out, other traits kept first', () {
    expect(traitsAfter('Stubborn\nQuiet\nKind', {'room': 1, 'fight': -1}), 'Stubborn\nKind\nLoud\nFight');
    expect(traitsAfter('Quiet', {'room': null}), '', reason: 'unchosen: neither word');
    expect(traitsAfter('', {}), '');
  });

  test('every question names them, and every axis has two words of its own', () {
    for (final a in traitAxes) {
      expect(askOf(a, 'Wren'), contains('Wren'), reason: a.id);
      expect(askOf(a, 'Wren'), isNot(contains('{name}')));
    }
    final words = [
      for (final a in traitAxes) ...[a.left.toLowerCase(), a.right.toLowerCase()],
    ];
    expect(words.toSet(), hasLength(words.length), reason: 'no word on two axes');
    expect(askOf(traitAxes.first, 'Wren'), 'In a crowded room, Wren is…');
  });
}
