import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/foils.dart';

void main() {
  Temperament t(String id, Map<String, int> sides) => (id: id, sides: sides);

  test('a foil: opposed on most of what both answered, the most opposed first', () {
    final f = foilsOf([
      t('mark', {'head': -1, 'risk': 1, 'truth': -1, 'lead': -1, 'room': 1}),
      t('kai', {'head': 1, 'risk': -1, 'truth': 1, 'lead': -1, 'room': -1}),
      t('wren', {'head': 1, 'risk': -1, 'truth': -1}),
    ]);
    final first = f.foils.first;
    expect((first.a, first.b, first.both, first.opposed), ('mark', 'kai', 5, 4));
    expect(first.differ, ['room', 'head', 'risk', 'truth'], reason: 'in the deck’s order');
    expect([for (final p in f.foils) '${p.a}-${p.b}'], ['mark-kai', 'mark-wren']);
  });

  test('twins: alike on all but one of four or more; too few in common, not compared', () {
    final f = foilsOf([
      t('ilse', {'head': -1, 'risk': -1, 'truth': -1, 'lead': 1}),
      t('nan', {'head': -1, 'risk': -1, 'truth': -1, 'lead': -1}),
      t('jory', {'head': 1, 'risk': 1}),
    ]);
    expect([for (final p in f.twins) '${p.a}-${p.b}:${p.alike}'], ['ilse-nan:3']);
    expect(f.foils, isEmpty, reason: 'jory shares only two answers with anyone');
  });

  test('a trait the whole cast shares, from four or more; the trait words', () {
    final f = foilsOf([
      for (final id in ['a', 'b', 'c', 'd']) t(id, {'truth': -1, 'risk': id == 'a' ? 1 : -1}),
    ]);
    expect([for (final s in f.shared) (s.axis, s.side, s.count)], [('truth', -1, 4)]);
    expect(traitOf('truth', -1), 'Honest');
    expect(traitOf('head', 1), 'Emotional');
  });

  test('the axes the cast spreads across most, for the compass', () {
    expect(spreadAxes([]), ('room', 'plan'), reason: 'nothing answered: the deck’s first two');
    final cast = [
      t('a', {'head': -1, 'risk': 1, 'room': 1}),
      t('b', {'head': 1, 'risk': -1, 'room': 1}),
      t('c', {'head': 1, 'risk': 1, 'room': 1}),
    ];
    final (x, y) = spreadAxes(cast);
    expect({x, y}, {'head', 'risk'}, reason: 'answered by all and split, over all on one side');
  });
}
