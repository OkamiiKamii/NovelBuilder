import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/journal.dart';

void main() {
  test('prompts made of what is known of them first, then ones that fit anyone', () {
    final p = journalPrompts(
      'Mark',
      others: [(name: 'Kai', tie: 'Rival'), (name: 'Ren', tie: '')],
      wants: 'To open the last door.',
    );
    expect(p.first.ask, 'The night before everything changes. Write it as Mark, tonight.');
    expect(
      [for (final x in p) x.ask],
      containsAll([
        'A letter Mark will never send, to Kai (Rival).',
        'Mark on what they want (“To open the last door”), and the real reason, last.',
        'Mark describes Ren to a stranger.',
      ]),
    );
    expect(p.map((x) => x.id).toSet(), hasLength(p.length), reason: 'each its own');
  });

  test('nothing known of them: the ones that fit anyone, a want asked for', () {
    final p = journalPrompts('Mark');
    expect(p.any((x) => x.ask.contains('letter')), isFalse);
    expect(p.any((x) => x.ask == 'Everything Mark wants, in a list. The real reason goes last.'), isTrue);
    expect(p.length, greaterThanOrEqualTo(10));
  });

  test('the journal pages among the notes, the newest first; the prompt read back; words counted', () {
    CharacterNote note(String id, String title, List<String> tags, int at) =>
        CharacterNote({'id': id, 'title': title, 'content': 'x', 'tags': tags, 'createdAt': at});
    final pages = journalPages([
      note('a', '${journalTitlePrefix}The night before.', [journalTag], 1),
      note('b', 'A plain note', [], 3),
      note('c', '${journalTitlePrefix}What is in his pockets.', [journalTag], 2),
    ]);
    expect([for (final p in pages) p.id], ['c', 'a']);
    expect(promptOf(pages.first), 'What is in his pockets.');
    expect(wordsIn('I never wanted the door. Not really — it’s Kai’s.'), 9);
  });
}
