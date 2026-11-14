import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/systems/levels_in_pages.dart';

void main() {
  /// Chapters of one paragraph each, numbered from 1.
  List<LevelChapter> book(List<String> chapters) => [
    for (final (i, text) in chapters.indexed) (id: 'c${i + 1}', paragraphs: [text]),
  ];

  /// Each thing and its steps, as (chapter, level).
  Map<String, List<(int, int)>> read(List<LevelChapter> chapters, {Set<String> setAside = const {}}) => {
    for (final l in levelsInPages(chapters, setAside: setAside))
      l.name: [for (final s in l.steps) (s.chapter, s.level)],
  };

  test('the armor and its versions: each kept as the pages level it, the latest where it is now', () {
    final chapters = <String>[
      'The armor answered him. Archer Armor Level 1. The bow settled into his hands.',
      'He drew on it again, and the Archer Armor reached Level 2.',
      'A second shape: Hunter Armor (Lv. 1).',
      for (var i = 4; i < 100; i++) 'He walked on. Nothing about the armor today.',
      'At last the Hunter Armor reached Level 100.',
    ];
    final levels = levelsInPages(book(chapters));
    expect([for (final l in levels) (l.name, l.family)], [('Archer Armor', 'Armor'), ('Hunter Armor', 'Armor')]);
    final hunter = levels.last;
    expect([for (final s in hunter.steps) (s.chapter, s.level)], [(3, 1), (100, 100)]);
    expect(hunter.steps.last.sentence, 'At last the Hunter Armor reached Level 100.');
    expect(
      hunter.steps.first.sentence,
      'A second shape: Hunter Armor (Lv. 1).',
      reason: 'the author’s own words, stop and all',
    );
    expect(levels.first.steps.last.level, 2, reason: 'the Archer Armor is at 2: nothing has said otherwise');
  });

  test('every way these books write a level', () {
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
      {
        'Hunter Armor': [(1, 2), (2, 4), (3, 6), (4, 7), (5, 9), (6, 10), (7, 11)],
      },
    );
  });

  test('the name, without what opens the sentence or who owns it; anything can have a level', () {
    expect(
      read(
        book([
          'Then James’s Hunter Armor reached Level 3. Wren reached Level 5. Tide Sense Lv. 2 flickered.',
          'His Spear of the Deep was now at Level 4. Suddenly Fireball reached Level 10.',
        ]),
      ),
      {
        'Hunter Armor': [(1, 3)],
        'Wren': [(1, 5)],
        'Tide Sense': [(1, 2)],
        'Spear of the Deep': [(2, 4)],
        'Fireball': [(2, 10)],
      },
    );
    expect(cleanLevelName('Then The'), isNull);
    expect(cleanLevelName('He'), isNull);
  });

  test('saying the level again is not a step; a step only when it changes', () {
    final l = levelsInPages(
      book(['Archer Armor Level 2. Archer Armor Level 2 again.', 'Archer Armor Level 2.', 'Archer Armor Level 3.']),
    ).single;
    expect([for (final s in l.steps) (s.chapter, s.level)], [(1, 2), (3, 3)]);
    expect(l.mentions, 4);
  });

  test('a level lower than before is marked, unless the page says it fell', () {
    final l = levelsInPages(
      book([
        'The Hunter Armor reached Level 50.',
        'The Hunter Armor was Level 40.',
        'The curse struck, and the Hunter Armor dropped to Level 30.',
      ]),
    ).single;
    expect([for (final s in l.steps) (s.level, s.backwards)], [(50, false), (40, true), (30, false)]);
  });

  group('whose it is', () {
    const people = <({String id, List<String> names})>[
      (id: 'kade', names: ['Kade Ash', 'Kade']),
      (id: 'mira', names: ['Mira']),
    ];
    Map<String, (String?, bool)> whose(List<LevelChapter> chapters, {Map<String, String> assigned = const {}}) => {
      for (final l in levelsInPages(chapters, people: people, assigned: assigned)) l.name: (l.owner, l.self),
    };

    test('a character’s own level is theirs', () {
      expect(whose(book(['Kade reached Level 5. Mira Lv. 2 stood by.'])), {
        'Kade': ('kade', true),
        'Mira': ('mira', true),
      });
    });

    test('the owner the pages name, then who is in the sentence', () {
      expect(
        whose(
          book([
            'Kade’s Hunter Armor reached Level 3.',
            'Mira watched as the Hunter Armor rose to Level 4.',
            'Mira lifted the Tide Spear, and the Tide Spear hit Level 2.',
          ]),
        ),
        {'Hunter Armor': ('kade', false), 'Tide Spear': ('mira', false)},
      );
    });

    test('with no one named, whose eyes the chapter is seen through', () {
      final chapter = (
        id: 'c1',
        paragraphs: [
          'Kade knew the forest. Kade felt the cold come down. Kade saw the wolves.',
          'His Hunter Armor reached Level 2.',
        ],
      );
      expect(whose([chapter]), {'Hunter Armor': ('kade', false)});
    });

    test('two named as much: no one’s; the author’s word over all', () {
      final both = book(['Kade and Mira watched the Ember Lamp reach Level 3.']);
      expect(whose(both), {'Ember Lamp': (null, false)});
      expect(whose(both, assigned: {'ember lamp': 'mira'}), {'Ember Lamp': ('mira', false)});
      expect(whose(book(['Kade’s Hunter Armor reached Level 3.']), assigned: {'hunter armor': ''}), {
        'Hunter Armor': (null, false),
      });
    });

    test('the owner named in a match', () {
      expect(ownerIn('James’s Hunter Armor'), 'James');
      expect(ownerIn('Hunter Armor'), isNull);
    });
  });

  test('a level up with nothing before it says nothing; a name set aside is left out; no level, no thing', () {
    expect(read(book(['The Hunter Armor leveled up.'])), isEmpty);
    expect(read(book(['Floor Level 3 was dark. Hunter Armor Level 1.']), setAside: {'floor'}), {
      'Hunter Armor': [(1, 1)],
    });
    expect(read(book(['He wore the Hunter Armor into the rain. The level of the river rose.'])), isEmpty);
  });
}
