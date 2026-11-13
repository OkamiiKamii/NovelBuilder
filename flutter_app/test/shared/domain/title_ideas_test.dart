import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/title_ideas.dart';

void main() {
  test('stand-in titles: nothing, Untitled, a kind and a number', () {
    for (final t in [
      '',
      'Untitled chapter',
      'Chapter 1',
      'chapter 12',
      'Ch. 3',
      'Scene iv',
      'Chapter One',
      'Part 2:',
    ]) {
      expect(placeholderTitle(t), isTrue, reason: t);
    }
    for (final t in ['The Bell', 'Chapter of Ashes', 'One Last Night', '1984']) {
      expect(placeholderTitle(t), isFalse, reason: t);
    }
  });

  test('ideas: who is most present, the thing only this chapter has, the phrase it ends on', () {
    final ideas = titleIdeas(
      paragraphs: [
        'Mira lit the lamp. She held the lamp over the map and the lamp shook.',
        'She could not stop it. She walked towards the Inn.',
      ],
      others: ['Mira read the map by the fire.', 'The fire burned all night. The map was gone.'],
      present: ['Mira Vance'],
    );
    expect(ideas, ['Mira Vance', 'The Lamp', 'Towards the Inn']);
  });

  test('never a verb, a contraction, an adjective or a name as a thing', () {
    final ideas = titleIdeas(
      paragraphs: [
        'They had to wipe it. They had to wipe it again. The can’t was there; the can’t again.',
        'The sixth day came. The sixth hour. James waited. Then James left with the James.',
      ],
      others: const [],
    );
    expect(
      ideas.where((i) => i.contains('Wipe') || i.contains('Can') || i.contains('Sixth') || i.contains('James')),
      isEmpty,
      reason: '$ideas',
    );
  });

  test('a closing phrase must name a place or a thing', () {
    expect(titleIdeas(paragraphs: ['He wanted to go now.'], others: const []), isEmpty);
    expect(titleIdeas(paragraphs: ['They rode into the dark woods.'], others: const []), ['Into the Dark Woods']);
    expect(
      titleIdeas(paragraphs: ['She sailed for Old Merrow.'], others: const []),
      isEmpty,
      reason: '"for" leads no title',
    );
    expect(titleIdeas(paragraphs: ['She came at last to Old Merrow.'], others: const []), ['To Old Merrow']);
  });
}
