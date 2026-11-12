import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/codex/world_finder.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

List<(String, String)> found(List<String> paragraphs, {Set<String> known = const {}, Set<String> aside = const {}}) => [
  for (final f in worldFinds([(1, paragraphs)], known: known, setAside: aside)) (f.name, f.kind),
];

void main() {
  test('a place, a group, a thing, a power: by what the words say', () {
    expect(
      found([
        'That was James, flying towards the nearest city; he cut through the Mimir Forest to do so.',
        'For now, James was flying by using the Smart Atoms skill.',
        'The Salt Guild sent its factors. House Vane said nothing. She kept the Brass Compass close.',
        'They sailed to the Isle of Skye, past Mount Ash, to the Order of the Rose.',
      ]),
      unorderedEquals([
        ('Mimir Forest', 'location'),
        ('Smart Atoms', 'power'),
        ('Salt Guild', 'faction'),
        ('House Vane', 'faction'),
        ('Brass Compass', 'item'),
        ('Isle of Skye', 'location'),
        ('Mount Ash', 'location'),
        ('Order of the Rose', 'faction'),
      ]),
    );
  });

  test('not a name: one word alone, someone’s power, words across a comma, what the world already holds', () {
    expect(
      found(['The Forest was dark. The Provost’s power was absolute. They spoke of Vell, Tower and all.']),
      isEmpty,
    );
    expect(found(['He walked down Lantern Street.'], known: {'lantern street'}), isEmpty);
    expect(found(['This skill was new. Water spell or not, it held.']), isEmpty, reason: 'a sentence’s own capital');
    expect(found(['His Fireball spell burned. She knew the old Frost spell.']), [
      ('Fireball', 'power'),
      ('Frost', 'power'),
    ]);
    expect(
      found(['The Drowned Road rose.'], known: {worldKey('The Drowned Road')}),
      isEmpty,
      reason: 'with or without The',
    );
    expect(found(['Into the Mimir Forest.'], aside: {'mimir forest'}), isEmpty);
  });

  test('counted where it is written, most first', () {
    final finds = worldFinds([
      (1, ['The Glass River ran.', 'By the Glass River.']),
      (3, ['The Glass River again, and the Iron Gate.']),
    ]);
    expect(
      [for (final f in finds) (f.name, f.times, f.chapters, f.first)],
      [('Glass River', 3, 2, 1), ('Iron Gate', 1, 1, 3)],
    );
  });

  test('the sample novel names nothing the world does not hold', () {
    final s = sampleNovel(now: 0);
    final order = StoryOrder.of([for (final r in s.rows('chapters')) StoryNode(r)]);
    final finds = worldFinds(
      [for (final r in s.rows('chapterContents')) (order.chapterNumber[str(r['id'])]!, blockTexts(r['doc']))],
      known: {for (final e in s.rows('loreEntries')) worldKey(str(e['name']))},
    );
    expect(finds, isEmpty, reason: 'everything it names is in its world already');
  });
}
