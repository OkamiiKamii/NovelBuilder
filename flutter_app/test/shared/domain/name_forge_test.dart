import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/name_forge.dart';

void main() {
  final norse = nameFlavours.firstWhere((f) => f.key == 'norse');

  test('new names in the shape of the old: none learned, none twice, all sayable, the same for the same seed', () {
    final names = forgeNames(source: norse.people, seed: 7);
    expect(names, hasLength(12));
    expect(names.toSet(), hasLength(12));
    final learned = {for (final n in norse.people) n.toLowerCase()};
    for (final n in names) {
      expect(learned.contains(n.toLowerCase()), isFalse, reason: n);
      expect(sayable(n), isTrue, reason: n);
      expect(n[0], n[0].toUpperCase(), reason: 'a capital: $n');
    }
    expect(forgeNames(source: norse.people, seed: 7), names);
    expect(forgeNames(source: norse.people, seed: 8), isNot(names));
  });

  test('every tradition forges people and places; places end as the tradition’s places do', () {
    for (final f in nameFlavours) {
      expect(forgeNames(source: f.people, seed: 1), hasLength(12), reason: f.label);
      final places = forgeNames(source: f.people, seed: 1, place: true, placeEndings: f.placeEndings);
      expect(places, isNotEmpty, reason: f.label);
      for (final p in places) {
        expect(f.placeEndings.any((e) => p.toLowerCase().endsWith(e)), isTrue, reason: '${f.label}: $p');
      }
    }
  });

  test('begins with the letters asked for, even where the tradition rarely does', () {
    final names = forgeNames(source: norse.people, seed: 3, start: 'K');
    expect(names, isNotEmpty);
    expect(names.every((n) => n.startsWith('K')), isTrue, reason: '$names');
  });

  test('the book’s names to learn from: names, not ordinary words or small ones', () {
    expect(learnableNames(['Wren Hollis', 'Lantern Street', 'The Drowned Road', 'Old Merrow', 'of', 'KAI', 'Jo']), [
      'Wren',
      'Hollis',
      'Merrow',
    ]);
  });

  test('nothing to learn from, nothing forged; nothing unsayable or rude', () {
    expect(forgeNames(source: const []), isEmpty);
    expect(sayable('Strrk'), isFalse);
    expect(sayable('Aaaron'), isFalse);
    expect(sayable('Shitesh'), isFalse);
    expect(sayable('Halvard'), isTrue);
  });
}
