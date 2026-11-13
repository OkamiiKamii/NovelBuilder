import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/glance.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';

void main() {
  const names = {
    'wren': ['Wren Hollis', 'Wren', 'Hollis'],
    'vell': ['Vell'],
  };

  group('nameAt', () {
    const text = 'At dawn Wren Hollis left Vell for good.';
    test('the name the caret is in or touches, the longest where names overlap', () {
      expect(nameAt(text, 10, names), (id: 'wren', start: 8, end: 19), reason: 'inside “Wren”: the whole name');
      expect(nameAt(text, 8, names), (id: 'wren', start: 8, end: 19), reason: 'at its first letter');
      expect(nameAt(text, 19, names), (id: 'wren', start: 8, end: 19), reason: 'just after it');
      expect(nameAt(text, 26, names)?.id, 'vell');
    });

    test('nothing away from a name, inside a longer word, or in another case', () {
      expect(nameAt(text, 3, names), isNull);
      expect(nameAt('The Vellum burned.', 6, names), isNull);
      expect(nameAt('a wren sang', 4, names), isNull, reason: 'capitals as recorded: a bird, not Wren');
    });
  });

  group('glanceOf', () {
    final mira = Entry({
      'id': 'mira',
      'category': 'character',
      'name': 'Mira Vance',
      'summary': 'A smuggler from Glass River. She owes everyone.',
      'fields': [
        {'key': 'Age', 'value': '34'},
        {'key': 'Eyes', 'value': 'Grey'},
        {'key': 'Backstory', 'value': 'A very long story that runs on well past what a card has room to show here.'},
        {'key': 'Hair', 'value': ''},
      ],
    });
    final profile = CharacterProfile({
      'entryId': 'mira',
      'roles': ['protagonist'],
      'epithet': 'the smuggler',
    });
    final tie = CharacterRelation({
      'id': 'r1',
      'fromId': 'mira',
      'toId': 'kai',
      'stages': [
        {'id': 's1', 'fromRole': 'Sister', 'toRole': 'Brother'},
      ],
    });

    test('what they are, the short facts in order, the ties from their side, the first sentence', () {
      final card = glanceOf(mira, profile: profile, relations: [tie], names: {'kai': 'Kai', 'mira': 'Mira Vance'});
      expect(card.name, 'Mira Vance');
      expect(card.what, 'Protagonist');
      expect(card.epithet, 'the smuggler');
      expect(card.facts, [(label: 'Age', value: '34'), (label: 'Eyes', value: 'Grey')]);
      expect(card.ties, ['Kai’s sister']);
      expect(card.summary, 'A smuggler from Glass River.');
    });

    test('the other side of the same tie', () {
      final kai = Entry({'id': 'kai', 'category': 'character', 'name': 'Kai'});
      expect(glanceOf(kai, relations: [tie], names: {'mira': 'Mira Vance'}).ties, ['Mira Vance’s brother']);
    });

    test('a place: its kind as what it is', () {
      final vell = Entry({'id': 'vell', 'category': 'location', 'name': 'Vell'});
      final card = glanceOf(vell, what: 'Location');
      expect(card.what, 'Location');
      expect(card.facts, isEmpty);
      expect(card.ties, isEmpty);
      expect(card.summary, '');
    });
  });
}
