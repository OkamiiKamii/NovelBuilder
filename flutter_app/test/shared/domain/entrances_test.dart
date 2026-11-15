import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/entrances.dart';

void main() {
  const people = <({String id, List<String> names})>[
    (id: 'kade', names: ['Kade Ash', 'Kade']),
    (id: 'mira', names: ['Mira']),
    (id: 'abbot', names: ['the Grey Abbot', 'Abbot']),
    (id: 'tobin', names: ['Tobin']),
    (id: 'wren', names: ['Wren']),
  ];

  /// Chapters of paragraphs, numbered from 1.
  List<EntranceChapter> book(List<List<String>> chapters) => [
    for (final (i, paragraphs) in chapters.indexed)
      (id: 'c${i + 1}', blocks: [for (final p in paragraphs) (heading: false, text: p)]),
  ];

  test('the cast in order of appearance, each with the sentence they enter in', () {
    final e = entrancesIn(
      book([
        ['The road was empty.', 'Kade Ash drew his bow. The wolves were close.'],
        ['Mira watched the gate.'],
        ['Rain.', 'At last Tobin came down the stair.'],
      ]),
      people,
    );
    expect(
      [for (final x in e.order) (x.id, x.at.chapter, x.at.block)],
      [('kade', 1, 1), ('mira', 2, 0), ('tobin', 3, 1)],
    );
    expect(e.order.first.at.sentence, 'Kade Ash drew his bow.');
    expect(e.unseen, ['abbot', 'wren']);
    expect(e.perChapter, [1, 1, 1]);
  });

  test('what the first moment gives: seen, speaks, acts, in their head, or nothing but a name', () {
    Map<String, Set<Gives>> gives(List<String> paragraphs) => {
      for (final x in entrancesIn(book([paragraphs]), people).order) x.id: x.gives,
    };
    expect(gives(['Kade drew his bow.']), {
      'kade': {Gives.acts},
    });
    expect(gives(['Mira was tall, her grey hair cut short.']), {
      'mira': {Gives.seen},
    });
    expect(gives(['“Run,” Tobin said.']), {
      'tobin': {Gives.speaks},
    });
    expect(gives(['Wren knew the forest better than anyone.']), {
      'wren': {Gives.thinks},
    });
    expect(gives(['There was a letter from Kade on the table.']), {'kade': <Gives>{}});
    expect(gives(['Tobin was mending a net when Mira had fallen through the floor.']), {
      'tobin': {Gives.acts},
      'mira': {Gives.acts},
    });
    expect(gives(['Tobin was nothing to her.']), {'tobin': <Gives>{}});
    expect(gives(['Then the Grey Abbot.']), {'abbot': <Gives>{}}, reason: 'a name is not a description');
  });

  test('talked of before they appear; only ever talked of', () {
    final e = entrancesIn(
      book([
        ['“The Abbot will come for us,” said Kade.'],
        ['Rain all day.'],
        ['The Grey Abbot stepped through the door, his robes black with water.'],
        ['“Wren would know,” Kade said.'],
      ]),
      people,
    );
    final abbot = e.order.firstWhere((x) => x.id == 'abbot');
    expect((abbot.at.chapter, abbot.talkedOf?.chapter, abbot.onStage), (3, 1, true));
    expect(abbot.gives, {Gives.acts, Gives.seen});
    final wren = e.order.firstWhere((x) => x.id == 'wren');
    expect((wren.at.chapter, wren.onStage), (4, false));
    expect([for (final x in e.order) x.id], ['kade', 'abbot', 'wren'], reason: 'in the order of the book');
  });

  test('a crowded door: three or more entering in one paragraph', () {
    final e = entrancesIn(
      book([
        ['Kade, Mira, Tobin and Wren sat round the fire.', 'Then the Abbot came.'],
      ]),
      people,
    );
    expect(e.crowds.single.ids, ['kade', 'mira', 'tobin', 'wren']);
    expect(e.perChapter, [5]);
  });

  test('headings are skipped but counted as blocks, so read it there finds the paragraph', () {
    final e = entrancesIn([
      (id: 'c1', blocks: [(heading: true, text: 'Kade'), (heading: false, text: 'Kade ran.')]),
    ], people);
    expect(e.order.single.at.block, 1);
  });
}
