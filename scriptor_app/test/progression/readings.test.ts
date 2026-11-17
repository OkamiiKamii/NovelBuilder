// The page readings of a progression story, ported from the Flutter app's tests
// (flutter_app/test/shared/domain/{levels_in_pages,number_ledger,pages_names}_test.dart): levels in the pages and
// whose they are, the ledger of numbers and its slips, and the names the pages give the system's way.

import { type LevelChapter, cleanLevelName, levelsInPages, ownerIn } from '../../src/domain/systems/levelsInPages';
import { type Ledger, numberLedger } from '../../src/domain/systems/numberLedger';
import { namesInPages } from '../../src/domain/systems/pagesNames';

describe('levels in your pages', () => {
  /** Chapters of one paragraph each, numbered from 1. */
  const book = (chapters: string[]): LevelChapter[] => chapters.map((text, i) => ({ id: `c${i + 1}`, paragraphs: [text] }));

  /** Each thing and its steps, as [chapter, level]. */
  const read = (chapters: LevelChapter[], setAside: Set<string> = new Set()) =>
    Object.fromEntries(levelsInPages(chapters, { setAside }).map((l) => [l.name, l.steps.map((s) => [s.chapter, s.level])]));

  test('the armor and its versions: each kept as the pages level it, the latest where it is now', () => {
    const chapters = [
      'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
      'He drew on it again, and the Archer Armor reached Level 2.',
      'A second shape: Hunter Armor (Lv. 1).',
      ...Array.from({ length: 96 }, () => 'He walked on. Nothing about the armor today.'),
      'At last the Hunter Armor reached Level 100.',
    ];
    const levels = levelsInPages(book(chapters));
    expect(levels.map((l) => [l.name, l.family])).toEqual([
      ['Archer Armor', 'Armor'],
      ['Hunter Armor', 'Armor'],
    ]);
    const hunter = levels[levels.length - 1];
    expect(hunter.steps.map((s) => [s.chapter, s.level])).toEqual([
      [3, 1],
      [100, 100],
    ]);
    expect(hunter.steps[1].sentence).toBe('At last the Hunter Armor reached Level 100.');
    // The author's own words, stop and all.
    expect(hunter.steps[0].sentence).toBe('A second shape: Hunter Armor (Lv. 1).');
    // The Archer Armor is at 2: nothing has said otherwise.
    expect(levels[0].steps[levels[0].steps.length - 1].level).toBe(2);
  });

  test('every way these books write a level', () => {
    expect(
      read(
        book([
          'Hunter Armor Level 2 hummed.',
          'The Hunter Armor’s level rose to 4.',
          'It was a Level 6 Hunter Armor now.',
          '[Hunter Armor: Lv 7]',
          'Then Hunter Armor hit level 9!',
          'The Hunter Armor leveled up.',
          '[Hunter Armor Level Up!]',
        ]),
      ),
    ).toEqual({
      'Hunter Armor': [
        [1, 2],
        [2, 4],
        [3, 6],
        [4, 7],
        [5, 9],
        [6, 10],
        [7, 11],
      ],
    });
  });

  test('the name, without what opens the sentence or who owns it; anything can have a level', () => {
    expect(
      read(
        book([
          'Then James’s Hunter Armor reached Level 3. Wren reached Level 5. Tide Sense Lv. 2 flickered.',
          'His Spear of the Deep was now at Level 4. Suddenly Fireball reached Level 10.',
        ]),
      ),
    ).toEqual({
      'Hunter Armor': [[1, 3]],
      Wren: [[1, 5]],
      'Tide Sense': [[1, 2]],
      'Spear of the Deep': [[2, 4]],
      Fireball: [[2, 10]],
    });
    expect(cleanLevelName('Then The')).toBeNull();
    expect(cleanLevelName('He')).toBeNull();
  });

  test('saying the level again is not a step; a step only when it changes', () => {
    const [l] = levelsInPages(book(['Archer Armor Level 2. Archer Armor Level 2 again.', 'Archer Armor Level 2.', 'Archer Armor Level 3.']));
    expect(l.steps.map((s) => [s.chapter, s.level])).toEqual([
      [1, 2],
      [3, 3],
    ]);
    expect(l.mentions).toBe(4);
  });

  test('a level lower than before is marked, unless the page says it fell', () => {
    const [l] = levelsInPages(
      book([
        'The Hunter Armor reached Level 50.',
        'The Hunter Armor was Level 40.',
        'The curse struck, and the Hunter Armor dropped to Level 30.',
      ]),
    );
    expect(l.steps.map((s) => [s.level, s.backwards])).toEqual([
      [50, false],
      [40, true],
      [30, false],
    ]);
  });

  describe('whose it is', () => {
    const people = [
      { id: 'kade', names: ['Kade Ash', 'Kade'] },
      { id: 'mira', names: ['Mira'] },
    ];
    const whose = (chapters: LevelChapter[], assigned: Map<string, string> = new Map()) =>
      Object.fromEntries(levelsInPages(chapters, { people, assigned }).map((l) => [l.name, [l.owner, l.self]]));

    test('a character’s own level is theirs', () => {
      expect(whose(book(['Kade reached Level 5. Mira Lv. 2 stood by.']))).toEqual({ Kade: ['kade', true], Mira: ['mira', true] });
    });

    test('the owner the pages name, then who is in the sentence', () => {
      expect(
        whose(
          book([
            'Kade’s Hunter Armor reached Level 3.',
            'Mira watched as the Hunter Armor rose to Level 4.',
            'Mira lifted the Tide Spear, and the Tide Spear hit Level 2.',
          ]),
        ),
      ).toEqual({ 'Hunter Armor': ['kade', false], 'Tide Spear': ['mira', false] });
    });

    test('with no one named, whose eyes the chapter is seen through', () => {
      const chapter = {
        id: 'c1',
        paragraphs: ['Kade knew the forest. Kade felt the cold come down. Kade saw the wolves.', 'His Hunter Armor reached Level 2.'],
      };
      expect(whose([chapter])).toEqual({ 'Hunter Armor': ['kade', false] });
    });

    test('two named as much: no one’s; the author’s word over all', () => {
      const both = book(['Kade and Mira watched the Ember Lamp reach Level 3.']);
      expect(whose(both)).toEqual({ 'Ember Lamp': [null, false] });
      expect(whose(both, new Map([['ember lamp', 'mira']]))).toEqual({ 'Ember Lamp': ['mira', false] });
      expect(whose(book(['Kade’s Hunter Armor reached Level 3.']), new Map([['hunter armor', '']]))).toEqual({
        'Hunter Armor': [null, false],
      });
    });

    test('the owner named in a match', () => {
      expect(ownerIn('James’s Hunter Armor')).toBe('James');
      expect(ownerIn('Hunter Armor')).toBeNull();
    });
  });

  test('a level up with nothing before it says nothing; a name set aside is left out; no level, no thing', () => {
    expect(read(book(['The Hunter Armor leveled up.']))).toEqual({});
    expect(read(book(['Floor Level 3 was dark. Hunter Armor Level 1.']), new Set(['floor']))).toEqual({ 'Hunter Armor': [[1, 1]] });
    expect(read(book(['He wore the Hunter Armor into the rain. The level of the river rose.']))).toEqual({});
  });
});

describe('the ledger', () => {
  const read = (chapters: string[][], sheet: Map<string, number> = new Map()): Ledger =>
    numberLedger(
      chapters.map((p, i) => ({ id: `c${i}`, paragraphs: p })),
      { stats: ['Strength', 'HP'], tracks: ['Level'], sheet },
    );

  test('the numbers each named thing is given, in the book’s order, plain and as a rise', () => {
    const l = read([['Kael checked his status. Strength 10. Level 1.'], ['[Strength +2 (10 → 12)]', 'He had reached Level 2 at last.'], ['HP: 100 / 230']]);
    const strength = l.lines.find((x) => x.name === 'Strength')!;
    expect(strength.entries.map((e) => [e.chapter, e.value, e.from])).toEqual([
      [1, 10, null],
      [2, 12, 10],
    ]);
    expect(l.lines.find((x) => x.name === 'Level')!.entries.map((e) => e.value)).toEqual([1, 2]);
    expect(l.lines.find((x) => x.name === 'HP')!.entries.map((e) => e.value)).toEqual([100]);
    expect(l.slips).toEqual([]);
    expect(strength.entries[0].said).toBe('Strength 10.');
  });

  test('a sum that does not come out; a rise from the wrong number; a level backwards', () => {
    const l = read([['Strength 13. Level 4.'], ['[Strength +2 (12 → 15)]'], ['By then he was Level 3.']]);
    expect(l.slips.map((s) => s.kind)).toEqual(['sum', 'backwards']);
    expect(l.slips[0].says).toBe('Strength 12 + 2 is 14, not 15 (chapter 2).');
    expect(l.slips[1].says).toBe('Level 3 in chapter 3, after Level 4 in chapter 1.');
    const [start] = read([['Strength 13.'], ['[Strength +1 (12 → 13)]']]).slips;
    expect(start.kind).toBe('start');
    expect(start.says).toBe('Strength rises from 12 in chapter 2, but it was 13 in chapter 1.');
  });

  test('the pages’ last number against the sheet; stats may fall, levels may not', () => {
    const l = read(
      [['HP 200. Level 5.'], ['HP 40.']],
      new Map([
        ['level', 6],
        ['HP', 40],
      ]),
    );
    expect(l.slips.map((s) => [s.kind, s.name])).toEqual([['sheet', 'Level']]);
    expect(l.slips[0].says).toBe('The pages end on Level 5 (chapter 1); the sheet holds 6.');
  });

  test('a name inside another word, or a percentage, is not a number given', () => {
    expect(read([['Superstrength 40. Strength 50% of his best. Levelled 3 times.']]).lines).toEqual([]);
  });

  test('within one chapter: "earlier in the chapter"; the sentence whole, through "->" and "3.5"', () => {
    const l = read([['Strength 13. Level 2. Then Strength +2 (12 -> 14). Level 1.']]);
    expect(l.slips.map((s) => s.says)).toEqual([
      'Strength rises from 12 in chapter 1, but it was 13 earlier in the chapter.',
      'Level 1 in chapter 1, after Level 2 earlier in the chapter.',
    ]);
    expect(l.slips[0].at.said).toBe('Then Strength +2 (12 -> 14).');
    const decimal = read([['By dusk her HP 3.5 and falling. Later.']]);
    expect(decimal.lines[0].entries[0].said).toBe('By dusk her HP 3.5 and falling.');
  });
});

describe('in your pages, not in the system', () => {
  const read = (chapters: string[][], known: string[] = [], aside: string[] = []) =>
    namesInPages(
      chapters.map((p, i) => ({ id: `c${i}`, paragraphs: p })),
      { known, setAside: aside },
    );

  test('the system’s messages: the kind from its word, the rank in brackets after', () => {
    const names = read([
      ['[Skill acquired: Tide Sense (E)]', 'Title earned: Giant Slayer.'],
      ['【Class unlocked: Warden】', '<Item obtained: Tide Glass>', 'New skill: Spark, and then nothing.'],
    ]);
    expect(names.map((n) => [n.name, n.thing, n.rank])).toEqual([
      ['Tide Sense', 'skill', 'E'],
      ['Giant Slayer', 'title', ''],
      ['Warden', 'kit', ''],
      ['Tide Glass', 'item', ''],
      ['Spark', 'skill', ''],
    ]);
    expect(names[0].chapter).toBe(1);
    expect(names[0].said).toBe('[Skill acquired: Tide Sense (E)]');
  });

  test('a name in brackets alone, counted; the most named first; a message says what it is', () => {
    const names = read([
      ['He used [Power Strike] again.', '[Power Strike] missed.'],
      ['[Title earned: Ironside]', 'They called him [Ironside].', '[Power Strike] hit.'],
    ]);
    expect(names.map((n) => [n.name, n.times, n.thing])).toEqual([
      ['Power Strike', 3, 'skill'],
      ['Ironside', 2, 'title'],
    ]);
  });

  test('not the system’s own words, not a cry, not a long line; not what the system holds or was set aside', () => {
    const names = read(
      [['[Status]', '[Level up!]', '[Warning]', '[This is a whole sentence in brackets here]', '[Fireball]', '[Spark]']],
      ['fireball'],
      ['Spark'],
    );
    expect(names).toEqual([]);
  });
});
