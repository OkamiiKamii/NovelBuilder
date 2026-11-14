import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/postcards.dart';

void main() {
  test('places named in the pages, by the look of the name, without the word before', () {
    expect(placesNamedIn('A top of the Mimir Forest, a figure was flying.'), ['Mimir Forest']);
    expect(placesNamedIn('They rode to the Kingdom of Aldia and the Grey Tower.'), ['Kingdom of Aldia', 'Grey Tower']);
    expect(placesNamedIn('The Forest was dark. In Town Hall he waited.'), ['Town Hall']);
    expect(placesNamedIn('He went into the forest and the old tower.'), isEmpty);
  });

  test('what the painting shows, and its light always the same for a name', () {
    expect(sceneryOf('Hollow Light: the lighthouse on its spur of black rock at the east end of the bay'), (
      water: true,
      trees: false,
      peaks: false,
      roofs: false,
      tower: true,
      beacon: true,
      dunes: false,
    ));
    expect(sceneryOf('A town by the sea with a bell tower').beacon, isFalse, reason: 'a tower, but no lamp in it');
    expect(sceneryOf('The Grey Peaks').peaks, isTrue);
    expect(sceneryOf('Mimir Forest').trees, isTrue);
    expect(sceneryOf('Lantern Street').roofs, isTrue);
    expect(sceneryOf('Somewhere'), (
      water: false,
      trees: false,
      peaks: false,
      roofs: false,
      tower: false,
      beacon: false,
      dunes: false,
    ));
    expect(lightOf('Old Merrow'), lightOf('Old Merrow'));
    expect(
      {
        for (final n in ['Vell', 'Old Merrow', 'Hollow Light', 'Mimir Forest', 'Aldia', 'Grey Tower']) lightOf(n),
      }.length,
      greaterThan(1),
    );
  });

  const one = <String?>[
    null,
    'Wren ran down Lantern Street to the quay.',
    'From the top of Lantern Street the sea was a silver ribbon, and nobody had seen it go out like that.',
    'Far off, beyond the Mimir Forest, the bells were ringing in the cold.',
  ];
  const two = <String?>['Old Merrow lay under the water, but its stones were still there.', 'Vell was quiet.'];
  final chapters = <PostcardChapter>[
    (id: 'c1', title: 'The Bell', paragraphs: one),
    (id: 'c2', title: '', paragraphs: two),
  ];
  final kept = <KeptPlace>[
    (names: ['Old Merrow'], about: 'The salt town the sea took three hundred years ago.'),
    (names: ['Lantern Street'], about: 'Where the chart shop stands.'),
    (names: ['Vell'], about: 'The harbour town.'),
    (names: ['The Moon Gate'], about: 'Never named in the pages.'),
  ];

  test('a postcard for each place the book names in a sentence, its best line, in the order the book names them', () {
    final cards = postcards(chapters, kept);
    expect([for (final c in cards) c.place], ['Lantern Street', 'Mimir Forest', 'Old Merrow']);
    final street = cards.first;
    expect(street.line, startsWith('From the top of Lantern Street'), reason: 'the line worth quoting, not the first');
    expect(
      (street.chapter, street.chapterTitle, street.nodeId, street.block, street.kept),
      (1, 'The Bell', 'c1', 2, true),
    );
    expect(street.scenery.roofs, isTrue);
    final forest = cards[1];
    expect((forest.kept, forest.scenery.trees), (false, true), reason: 'named in the pages, not kept');
    expect(cards.last.scenery.water, isTrue, reason: 'what the world says of it: the sea took it');
  });

  test('too short a sentence is no line: Vell, said only in three words, has no postcard', () {
    expect(postcards(chapters, kept).map((c) => c.place), isNot(contains('Vell')));
    expect(postcards(const [], const []), isEmpty);
  });
}
