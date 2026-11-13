import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/book_story.dart';

void main() {
  const inputs = (
    title: 'Ash Road',
    target: 20000,
    chapters: [(id: 'c1', title: 'The Gate', words: 30), (id: 'c2', title: 'The Lantern', words: 45)],
    days: [
      (day: '2026-11-08', words: 400),
      (day: '2026-11-09', words: 900),
      (day: '2026-11-10', words: 0),
      (day: '2026-11-11', words: 300),
    ],
    people: [
      (id: 'wren', name: 'Wren Hollis', names: ['Wren Hollis', 'Wren']),
      (id: 'kai', name: 'Kai', names: ['Kai']),
    ],
  );
  final pages = {
    'c1': ['The gate was open. Wren lit the lantern.', '“Is anyone there?” Wren said. “The lantern will not last.”'],
    'c2': [
      'Kai carried the lantern down. Wren followed the lantern light.',
      '“Go,” said Kai. The lantern swung in the dark, and Wren ran.',
    ],
  };

  test('the book told back: its words, its days, its biggest chapter', () {
    final s = bookStory(inputs, pages);
    expect((s.title, s.words, s.chapters, s.pages, s.minutes), ('Ash Road', 75, 2, 1, 1));
    expect(s.daysWritten, 3, reason: 'a day with no words added is not a day written');
    expect(s.longestRun, 2);
    expect(s.bestDay, (day: '2026-11-09', words: 900));
    expect(s.firstDay, '2026-11-08');
    expect(s.biggest?.title, 'The Lantern');
  });

  test('who it is about, who talks most and a line of theirs, the words leaned on', () {
    final s = bookStory(inputs, pages);
    expect(s.lead?.name, 'Wren Hollis');
    expect(s.lead?.mentions, 4);
    expect(s.talker?.name, 'Wren Hollis');
    expect(s.talker?.line, 'The lantern will not last.', reason: 'a line of four words or more');
    expect(s.leanWords.first, (word: 'lantern', count: 5));
    expect(s.leanWords.where((w) => w.word == 'wren'), isEmpty, reason: 'not names');
  });

  test('where it begins and stands; the next stop on the road', () {
    final s = bookStory(inputs, pages);
    expect(s.opening, 'The gate was open.');
    expect(s.latest, 'The lantern swung in the dark, and Wren ran.');
    expect(s.next, (name: 'the first thousand', words: 925));
  });

  test('nothing written: nothing claimed', () {
    final s = bookStory((title: '', target: null, chapters: const [], days: const [], people: const []), const {});
    expect((s.words, s.daysWritten, s.biggest, s.lead, s.talker, s.opening), (0, 0, null, null, null, ''));
    expect(s.leanWords, isEmpty);
  });
}
