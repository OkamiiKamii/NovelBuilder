import { namesToFind } from '../../src/domain/characters/namedIn';

describe('the names each entry is found by', () => {
  it('finds a character by name, aliases, parts of the name that are theirs alone, and the epithet’s capitals', () => {
    const names = namesToFind(
      [
        { id: 'ilse', name: 'Ilse Marrow', category: 'character' },
        { id: 'kit', name: 'Kit Marrow', category: 'character' },
        { id: 'prov', name: 'Edda Crane', category: 'character' },
        { id: 'road', name: 'The Drowned Road', category: 'location' },
      ],
      new Map([
        ['ilse', { aliases: ['Mistress M', ' '], epithet: '' }],
        ['prov', { aliases: [], epithet: 'the Provost' }],
      ]),
    );
    expect(names['ilse']).toEqual(['Ilse Marrow', 'Mistress M', 'Ilse']);
    // "Marrow" is shared with Kit, so it names neither; "Kit" is only three letters and Kit's alone.
    expect(names['kit']).toEqual(['Kit Marrow', 'Kit']);
    expect(names['prov']).toEqual(['Edda Crane', 'Edda', 'Crane', 'Provost']);
    expect(names['road']).toEqual(['The Drowned Road', 'Drowned Road']);
  });

  it('leaves out everyday words and a single-word name without an epithet', () => {
    const names = namesToFind(
      [
        { id: 'a', name: 'Captain Rose Hale', category: 'character' },
        { id: 'b', name: 'Wren', category: 'character' },
      ],
      new Map(),
    );
    expect(names['a']).toEqual(['Captain Rose Hale', 'Hale']);
    expect(names['b']).toEqual(['Wren']);
  });
});
