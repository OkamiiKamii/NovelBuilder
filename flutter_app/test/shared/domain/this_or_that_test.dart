import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/this_or_that.dart';

void main() {
  test('the sides a list of traits is on; an axis with both or neither is not chosen', () {
    expect(sidesOf(['Quiet', 'Stubborn', 'emotional']), {'room': -1, 'head': 1});
    expect(sidesOf(['Quiet', 'Loud']), isEmpty);
    expect(traitsIn('Quiet\nBrave, Kind\n'), ['Quiet', 'Brave', 'Kind']);
  });

  test('what an earlier deck kept (the words pressed) is still read as the choice', () {
    expect(sidesOf(['Heart', 'Lead', 'Break them', 'Fight']), {'head': 1, 'lead': -1, 'rules': 1, 'fight': -1});
    expect(sidesOf(['Heart', 'Rational']), isEmpty, reason: 'both sides: not chosen');
  });

  test('the deck written in: the trait chosen, the other side out, other traits kept first', () {
    expect(traitsAfter('Stubborn\nQuiet\nKind', {'room': 1, 'fight': -1}), 'Stubborn\nKind\nLoud\nCombative');
    expect(traitsAfter('Quiet', {'room': null}), '', reason: 'unchosen: neither word');
    expect(traitsAfter('', {}), '');
    // An earlier deck's words give way to the traits they meant.
    expect(
      traitsAfter('Brave\nHeart\nLead\nBreak them', sidesOf(['Heart', 'Lead', 'Break them'])),
      'Brave\nEmotional\nCommanding\nRebellious',
    );
  });

  test('every question names them; every side a word of its own and a trait of its own', () {
    for (final a in traitAxes) {
      expect(askOf(a, 'Wren'), contains('Wren'), reason: a.id);
      expect(askOf(a, 'Wren'), isNot(contains('{name}')));
    }
    final words = [
      for (final a in traitAxes) ...[a.left.toLowerCase(), a.right.toLowerCase()],
    ];
    expect(words.toSet(), hasLength(words.length), reason: 'no word on two axes');
    final traits = [
      for (final a in traitAxes) ...[a.leftTrait.toLowerCase(), a.rightTrait.toLowerCase()],
    ];
    expect(traits.toSet(), hasLength(traits.length), reason: 'no trait on two axes');
    expect(askOf(traitAxes.first, 'Wren'), 'In a crowded room, Wren is…');
  });
}
