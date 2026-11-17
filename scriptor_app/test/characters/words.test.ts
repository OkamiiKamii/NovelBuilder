// A character in a line, in one sentence, and found by name in the text. Ports of
// flutter_app/test/shared/domain/one_line_test.dart, logline_test.dart and named_in_test.dart, and the part of
// identity_test.dart not already in test/model (new ids).

import { CharacterProfile } from '../../src/domain/characters/characterRecords';
import { type LoglinePiece, inSentence, loglineOf, loglineText } from '../../src/domain/characters/logline';
import { namedIn, namedInJob, namesToFind, sightingChars, sightings } from '../../src/domain/characters/namedIn';
import { readOneLine } from '../../src/domain/characters/oneLine';
import { type Stake } from '../../src/domain/characters/stakes';
import { newId } from '../../src/domain/ids';
import { str } from '../../src/domain/json';
import { StoryOrder } from '../../src/domain/model/storyOrder';
import { blockTexts } from '../../src/domain/prose';
import { Entry } from '../../src/domain/records/entry';
import { StoryNode } from '../../src/domain/records/storyNode';
import { NovelSnapshot } from '../../src/domain/snapshot/novelSnapshot';
import { sampleJson } from '../fixtures';

const cast = [
  { id: 'kai', name: 'Kai Doyle' },
  { id: 'ilse', name: 'Ilse Marrow' },
  { id: 'kit', name: 'Kit Marrow' },
];

describe('a character in a line', () => {
  test('a line read into a character', () => {
    const c = readOneLine('Mira Vance, 34, a smuggler from Glass River, Kai’s sister', { cast });
    expect(c.name).toBe('Mira Vance');
    expect(c.age).toBe('34');
    expect(c.occupation).toBe('smuggler');
    expect(c.origin).toBe('Glass River');
    expect(c.gender).toBe('Female');
    expect(c.ties).toEqual([
      { otherId: 'kai', otherName: 'Kai Doyle', preset: 'siblings', newIsFrom: false, said: 'Kai’s sister' },
    ]);
    expect(c.summary).toBe('');
  });

  test('who is which in a tie with a direction; a name shared is not guessed', () => {
    const a = readOneLine('Tam, Ilse’s apprentice', { cast });
    expect([a.ties[0].preset, a.ties[0].newIsFrom]).toEqual(['mentor-student', true]);
    expect(a.ties).toHaveLength(1);
    const b = readOneLine('Orla, Kit’s mother', { cast });
    expect([b.ties[0].preset, b.ties[0].newIsFrom]).toEqual(['parent-child', false]);
    expect(readOneLine('Ned, Marrow’s cousin', { cast }).ties).toEqual([]);
    expect(readOneLine('Ned, Bram’s cousin', { cast }).ties).toEqual([]);
  });

  test('the rest: species, role, epithet, age in words; anything else for the summary', () => {
    const c = readOneLine('Sefa Quill the Factor, an elf, aged 120, the villain, hates the sea');
    expect(c.name).toBe('Sefa Quill');
    expect(c.epithet).toBe('the Factor');
    expect(c.species).toBe('Elf');
    expect(c.age).toBe('120');
    expect(c.role).toBe('Antagonist');
    expect(c.occupation).toBe('');
    expect(c.summary).toBe('hates the sea');
    const d = readOneLine('Bram, called the Ox, an old man, from Vell');
    expect([d.epithet, d.gender, d.origin, d.occupation]).toEqual(['the Ox', 'Male', 'Vell', '']);
  });

  test('a name alone is a name', () => {
    const c = readOneLine('James');
    expect([c.name, c.age, c.occupation, c.summary]).toEqual(['James', '', '', '']);
    expect(c.ties).toEqual([]);
  });
});

describe('in one sentence', () => {
  const said = (pieces: LoglinePiece[]) => pieces.map((p) => (p.gap ? `[${p.text}]` : p.text)).join('');
  const stakes = (o: Partial<Record<Stake, string>>) => new Map(Object.entries(o) as [Stake, string][]);

  test('a whole profile reads as one sentence', () => {
    const pieces = loglineOf({
      name: 'Mark',
      age: '21',
      gender: 'Male',
      who: 'A locksmith’s apprentice',
      stakes: stakes({ wants: 'To open the last door.', inTheWay: 'The Architect.', atStake: 'His sister.' }),
    });
    expect(loglineText(pieces)).toBe(
      'Mark, 21, a locksmith’s apprentice, wants to open the last door, but the Architect stands in his way. ' +
        'If he fails, he loses his sister.',
    );
  });

  test('what the profile does not say is a gap, asked in their pronouns; no age, none said', () => {
    expect(said(loglineOf({ name: 'Mark', age: '21', gender: 'Male', who: '', stakes: new Map() }))).toBe(
      'Mark, 21, [who he is], wants [what he wants], but [what is in the way] stands in his way. If he fails, he loses ' +
        '[what is at stake].',
    );
    expect(
      said(loglineOf({ name: 'Wren', age: '', gender: 'Female', who: 'the mapmaker', stakes: stakes({ wants: 'out' }) })),
    ).toBe('Wren, the mapmaker, wants out, but [what is in the way] stands in her way. If she fails, she loses [what is at stake].');
    const they = loglineOf({ name: 'Sefa', age: '', gender: '', who: '', stakes: new Map() });
    expect(said(they)).toContain('[who they are], wants [what they want]');
    expect(said(they)).toContain('stands in their way. If they fail, they lose');
    expect(loglineText(they)).toBeNull();
  });

  test('an answer as it reads in the sentence', () => {
    expect(inSentence('To open the last door.')).toBe('to open the last door');
    expect(inSentence('Revenge on his father')).toBe('revenge on his father');
    expect(inSentence('The Architect')).toBe('the Architect');
    expect(inSentence('Kai’s betrayal')).toBe('Kai’s betrayal');
    expect(inSentence('Old Tam')).toBe('Old Tam');
    expect(inSentence('NASA')).toBe('NASA');
    expect(inSentence('  his   sister;  ')).toBe('his sister');
  });
});

describe('named in the text', () => {
  const entry = (id: string, name: string, category = 'character') => new Entry({ id, name, category });
  const profile = (entryId: string, o: { epithet?: string; aliases?: string[] } = {}) =>
    new CharacterProfile({ id: `p${entryId}`, entryId, epithet: o.epithet ?? '', aliases: o.aliases ?? [] });
  const sample = () => NovelSnapshot.fromJson(sampleJson());
  const unordered = (xs: readonly string[] | undefined) => [...(xs ?? [])].sort();

  test('in their pages: the first sentence each chapter names them in, the name picked out', () => {
    const found = sightings(
      new Map([
        ['c1', ['The bell rang.', 'Wren dropped the ink. It went across the floor.']],
        ['c2', ['Nobody came.']],
        ['c3', ['“Wren,” said Ilse Marrow. “Wipe it up.”']],
      ]),
      ['c1', 'c2', 'c3'],
      ['Wren Hollis', 'Wren'],
    );
    expect(found.map((s) => [s.nodeId, s.block, s.before, s.name, s.after])).toEqual([
      ['c1', 1, '', 'Wren', ' dropped the ink.'],
      ['c3', 0, '“', 'Wren', ',” said Ilse Marrow.'],
    ]);
  });

  test('a long sentence is cut around the name, at spaces', () => {
    const long = `${Array(60).fill('and the sea').join(' ')} Wren ${Array(60).fill('went out').join(' ')}.`;
    const [s] = sightings(new Map([['c', [long]]]), ['c'], ['Wren']);
    expect(s.name).toBe('Wren');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
    expect(s.before.length + s.name.length + s.after.length).toBeLessThanOrEqual(sightingChars + 4);
  });

  test('the sample novel: a passage for every chapter Wren is in', () => {
    const s = sample();
    const pages = new Map(s.rows('chapterContents').map((r) => [str(r['id']), blockTexts(r['doc'])]));
    const order = StoryOrder.of(s.rows('chapters').map((r) => new StoryNode(r)));
    const found = sightings(
      pages,
      order.chapters.map((c) => c.id),
      ['Wren Hollis', 'Wren'],
    );
    expect(found).toHaveLength(15);
    expect(found[0].name).toBe('Wren Hollis');
    expect(`${found[0].before}${found[0].name}${found[0].after}`.startsWith('The bell in the Wardens’ tower')).toBe(true);
  });

  test('the names looked for: whole names, parts that are theirs alone, aliases, an epithet’s capitals', () => {
    const names = namesToFind(
      [
        entry('ilse', 'Ilse Marrow'),
        entry('kit', 'Kit Marrow'),
        entry('crane', 'Aldous Crane'),
        entry('rose', 'Rose Hale'),
        entry('road', 'The Drowned Road', 'location'),
        entry('vell', 'Vell', 'location'),
      ],
      new Map([['crane', profile('crane', { epithet: 'the Provost', aliases: ['Old Crane'] })]]),
    );
    expect(unordered(names['ilse'])).toEqual(unordered(['Ilse Marrow', 'Ilse']));
    expect(unordered(names['kit'])).toEqual(unordered(['Kit Marrow', 'Kit']));
    expect(unordered(names['crane'])).toEqual(unordered(['Aldous Crane', 'Old Crane', 'Aldous', 'Crane', 'Provost']));
    expect(unordered(names['rose'])).toEqual(unordered(['Rose Hale', 'Hale']));
    expect(unordered(names['road'])).toEqual(unordered(['The Drowned Road', 'Drowned Road']));
    expect(names['vell']).toEqual(['Vell']);
  });

  test('an everyday word of the original’s list is not a name part (north, son, van…)', () => {
    const names = namesToFind([entry('a', 'Jon North'), entry('b', 'Piet van Dyke')], new Map());
    expect(unordered(names['a'])).toEqual(unordered(['Jon North', 'Jon']));
    expect(unordered(names['b'])).toEqual(unordered(['Piet van Dyke', 'Piet', 'Dyke']));
  });

  test('found as whole words, capitals as written', () => {
    const found = namedIn(
      new Map([
        ['c1', 'Wren looked up. The Drowned Road rose out of the bay.'],
        ['c2', 'A wren sang on the wall. Wrenfield was quiet.'],
        ['c3', 'They spoke of the drowned road, and of Wren’s map.'],
      ]),
      { wren: ['Wren Hollis', 'Wren'], road: ['The Drowned Road', 'Drowned Road'] },
    );
    expect(found.get('wren')).toEqual(['c1', 'c3']);
    expect(found.get('road')).toEqual(['c1']);
  });

  test('in the sample novel, its people and places are found where they are', () => {
    const s = sample();
    const entries = s.rows('loreEntries').map((r) => new Entry(r));
    const profiles = new Map(s.rows('characterProfiles').map((r) => [str(r['entryId']), new CharacterProfile(r)]));
    const found = namedInJob(
      s.rows('chapterContents').map((r) => JSON.stringify(r)),
      namesToFind(entries, profiles),
    )();
    const order = StoryOrder.of(s.rows('chapters').map((r) => new StoryNode(r)));
    const chapters = (name: string) =>
      new Set((found.get(entries.find((e) => e.name === name)!.id) ?? []).map((id) => order.chapterNumber.get(id)!));
    expect([...chapters('Wren Hollis')].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect([...chapters('Aldous Crane')]).toEqual(expect.arrayContaining([4, 10, 15]));
    expect([...chapters('Jory')].sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
    expect(chapters('Old Merrow').has(12)).toBe(true);
    expect(chapters('Hollow Light').has(4)).toBe(true);
  });
});

test('new ids are unique version-4 UUIDs (identity_test.dart)', () => {
  // Scriptor's ids come from the platform (expo-crypto in the app, the runtime's crypto here) through ids.ts.
  const made = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(made.size).toBe(1000);
  expect(
    [...made].every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)),
  ).toBe(true);
});
