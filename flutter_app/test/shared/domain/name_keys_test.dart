import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/text/name_keys.dart';

void main() {
  const names = {
    'wren': ['Wren Hollis', 'Wren', 'Hollis'],
    'ilse': ['Ilse Marrow', 'Ilse'],
    'merrow': ['The Drowned Merrow', 'Drowned Merrow'],
    'mimir': ['Mimir Forest'],
    'mira': ['Mira Vance', 'Mira'],
  };

  group('wordAt', () {
    test('the letters that end at the caret, and where they start', () {
      expect(wordAt('She saw Wr', 10), (start: 8, word: 'Wr'));
      expect(wordAt('“Il', 3), (start: 1, word: 'Il'));
    });
    test('nothing after a space, or with the caret inside a word', () {
      expect(wordAt('She saw ', 8), isNull);
      expect(wordAt('She saw Wren', 10), isNull);
      expect(wordAt('', 0), isNull);
    });
  });

  group('completionsFor', () {
    test('names that begin with the word, any case after its capital; the shorter first', () {
      expect([for (final k in completionsFor('Wr', names)) k.name], ['Wren', 'Wren Hollis']);
      expect([for (final k in completionsFor('MI', names)) k.name], ['Mira', 'Mira Vance', 'Mimir Forest']);
      expect(completionsFor('Wr', names).first.id, 'wren');
    });

    test('this chapter’s people first', () {
      expect(completionsFor('Mi', names, present: ['mimir']).first.name, 'Mimir Forest');
    });

    test('nothing for a lowercase word, one letter, a whole name already, or a name that begins "The"', () {
      expect(completionsFor('wr', names), isEmpty, reason: 'names are written with a capital');
      expect(completionsFor('W', names), isEmpty);
      expect([for (final k in completionsFor('Wren', names)) k.name], ['Wren Hollis']);
      expect([for (final k in completionsFor('Th', names)) k.name], isEmpty);
      expect([for (final k in completionsFor('Dr', names)) k.name], ['Drowned Merrow']);
    });
  });

  test('pageKeys: the page’s names by their first name when they go by it, in order', () {
    expect(
      [
        for (final k in pageKeys(names, ['mimir', 'wren', 'merrow'])) k.name,
      ],
      ['Mimir Forest', 'Wren', 'Drowned Merrow'],
    );
  });
}
