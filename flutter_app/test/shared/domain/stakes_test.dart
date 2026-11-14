import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/stakes.dart';

void main() {
  test(
    'each stake from whichever field answers it, the first written; Motivations when nothing says what they want',
    () {
      expect(stakesOf({'what they want': 'The chart', 'initial goals': 'Other'})[Stake.wants], 'The chart');
      expect(stakesOf({'what they want': '  ', 'initial goals': 'To be a master'})[Stake.wants], 'To be a master');
      expect(stakesOf({'motivations': 'Her father'})[Stake.wants], 'Her father');
      expect(stakesOf({'external conflict': 'The Wardens'})[Stake.inTheWay], 'The Wardens');
      expect(stakesOf({'how they change, if they do': 'He stays'})[Stake.ends], 'He stays');
      expect(stakesOf({'what they stand to lose': 'Everything'})[Stake.atStake], 'Everything');
      expect(stakesOf({}), isEmpty);
      expect(Stake.wants.ask('Wren'), 'What does Wren want?');
    },
  );

  StakeHolder who(String id, String name, Map<Stake, String> s) =>
      (id: id, name: name, names: [name, name.split(' ').first], stakes: s);

  test('where wants collide: one names the other, or stands in their way; or both want the same thing', () {
    final cast = [
      who('w', 'Wren Hollis', {Stake.wants: 'To finish the chart of the drowned road'}),
      who('c', 'Aldous Crane', {
        Stake.wants: 'That nobody ever walks the road again',
        Stake.inTheWay: 'Wren and her pencil',
      }),
      who('s', 'Sefa Quill', {Stake.wants: 'A chart for the guild, and a safe road to the warehouses'}),
      who('k', 'Kit Marrow', {Stake.wants: 'To come home'}),
    ];
    final found = collisions(cast);
    expect(found.first, (a: 'c', b: 'w', why: 'Wren Hollis stands in Aldous Crane’s way'), reason: 'naming first');
    expect(found.any((c) => {c.a, c.b}.containsAll({'w', 's'})), isTrue, reason: 'both want the chart');
    expect(found.where((c) => c.a == 'k' || c.b == 'k'), isEmpty, reason: 'nothing shared');
    expect(found.where((c) => {c.a, c.b}.containsAll({'w', 'c'})), hasLength(1), reason: 'a pair once');
  });

  test('common words are not a collision; a short cast collides at most four times', () {
    final cast = [
      who('a', 'Ann', {Stake.wants: 'Something about their other place, and the lantern'}),
      who('b', 'Bea', {Stake.wants: 'Something about their other place; the lanterns'}),
    ];
    expect(collisions(cast), [(a: 'a', b: 'b', why: 'Both want “lanterns”')], reason: 'not “something”');
    final quiet = [
      who('a', 'Ann', {Stake.wants: 'They would never come back'}),
      who('b', 'Bea', {Stake.wants: 'They would never come back'}),
    ];
    expect(collisions(quiet), isEmpty);
    final many = [
      for (var i = 0; i < 8; i++) who('$i', 'P$i', {Stake.wants: 'The crown'}),
    ];
    expect(collisions(many), hasLength(4));
  });
}
