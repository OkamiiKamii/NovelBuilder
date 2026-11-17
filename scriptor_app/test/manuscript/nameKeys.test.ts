// A port of flutter_app/test/shared/domain/name_keys_test.dart.

import { completionsFor, pageKeys, wordAt } from '../../src/domain/text/nameKeys';

const names = {
  wren: ['Wren Hollis', 'Wren', 'Hollis'],
  ilse: ['Ilse Marrow', 'Ilse'],
  merrow: ['The Drowned Merrow', 'Drowned Merrow'],
  mimir: ['Mimir Forest'],
  mira: ['Mira Vance', 'Mira'],
};

describe('wordAt', () => {
  test('the letters that end at the caret, and where they start', () => {
    expect(wordAt('She saw Wr', 10)).toEqual({ start: 8, word: 'Wr' });
    expect(wordAt('“Il', 3)).toEqual({ start: 1, word: 'Il' });
  });
  test('nothing after a space, or with the caret inside a word', () => {
    expect(wordAt('She saw ', 8)).toBeNull();
    expect(wordAt('She saw Wren', 10)).toBeNull();
    expect(wordAt('', 0)).toBeNull();
  });
});

describe('completionsFor', () => {
  test('names that begin with the word, any case after its capital; the shorter first', () => {
    expect(completionsFor('Wr', names).map((k) => k.name)).toEqual(['Wren', 'Wren Hollis']);
    expect(completionsFor('MI', names).map((k) => k.name)).toEqual(['Mira', 'Mira Vance', 'Mimir Forest']);
    expect(completionsFor('Wr', names)[0].id).toBe('wren');
  });

  test('this chapter’s people first', () => {
    expect(completionsFor('Mi', names, ['mimir'])[0].name).toBe('Mimir Forest');
  });

  test('nothing for a lowercase word, one letter, a whole name already, or a name that begins "The"', () => {
    // Names are written with a capital.
    expect(completionsFor('wr', names)).toEqual([]);
    expect(completionsFor('W', names)).toEqual([]);
    expect(completionsFor('Wren', names).map((k) => k.name)).toEqual(['Wren Hollis']);
    expect(completionsFor('Th', names).map((k) => k.name)).toEqual([]);
    expect(completionsFor('Dr', names).map((k) => k.name)).toEqual(['Drowned Merrow']);
  });
});

test('pageKeys: the page’s names by their first name when they go by it, in order', () => {
  expect(pageKeys(names, ['mimir', 'wren', 'merrow']).map((k) => k.name)).toEqual([
    'Mimir Forest',
    'Wren',
    'Drowned Merrow',
  ]);
});
