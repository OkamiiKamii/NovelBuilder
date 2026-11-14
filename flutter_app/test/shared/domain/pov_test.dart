import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/pov.dart';

void main() {
  const people = <EyesPerson>[
    (id: 'wren', names: ['Wren Hollis', 'Wren']),
    (id: 'ilse', names: ['Ilse Marrow', 'Ilse']),
  ];

  test('told through the one the narration shows thinking, feeling and noticing', () {
    final eyes = chapterEyes([
      (
        id: 'c1',
        title: 'The Bell',
        paragraphs: [
          'Wren knew the bell at once. Wren felt the floor shake under her.',
          '“Ilse,” she called. Ilse came down the stair.',
          'Wren could see the wet stone along the wall.',
        ],
      ),
    ], people);
    expect(eyes.single.telling, Telling.through);
    expect(eyes.single.who, 'wren');
    expect(eyes.single.evidence, 'Wren knew the bell at once.');
  });

  test('what is said aloud does not count: a name in a speech is no one’s eyes', () {
    final eyes = chapterEyes([
      (
        id: 'c1',
        title: '',
        paragraphs: ['“Wren knew, Wren saw, Wren felt it,” said the man.', 'Ilse thought of the chart. Ilse knew.'],
      ),
    ], people);
    expect(eyes.single.who, 'ilse');
  });

  test('“could” counts only before seeing or feeling: “Wren could see” but not “Wren could run”', () {
    final run = chapterEyes([
      (id: 'c', title: '', paragraphs: ['Wren could run. Wren could swim. Wren could climb.']),
    ], people);
    expect(run.single.telling, Telling.unclear);
    final see = chapterEyes([
      (id: 'c', title: '', paragraphs: ['Wren could see the road. Wren could hear the sea.']),
    ], people);
    expect(see.single.who, 'wren');
  });

  test('a narration of “I” is the first person; no one clearly ahead is unclear; an empty chapter is left out', () {
    final eyes = chapterEyes([
      (
        id: 'a',
        title: '',
        paragraphs: ['I made it to the tower. My hands were raw, and I did not look back at the road behind me.'],
      ),
      (id: 'b', title: '', paragraphs: ['The sea came in. The road went under. Nobody was there to see it.']),
      (id: 'c', title: '', paragraphs: const []),
    ], people);
    expect([for (final e in eyes) (e.chapter, e.telling)], [(1, Telling.firstPerson), (2, Telling.unclear)]);
    expect(eyes.first.evidence, 'I made it to the tower.');
  });

  test('two leading together is unclear, not given to either', () {
    final eyes = chapterEyes([
      (id: 'c', title: '', paragraphs: ['Wren knew. Ilse knew. Wren saw. Ilse saw.']),
    ], people);
    expect(eyes.single.telling, Telling.unclear);
  });

  test('what it means: shares, the longest run, how long since each', () {
    ChapterEyes e(int n, String? who, int words) => (
      chapter: n,
      nodeId: '$n',
      title: '',
      words: words,
      telling: who == null ? Telling.unclear : Telling.through,
      who: who,
      evidence: '',
    );
    final summary = eyesSummary([
      e(1, 'wren', 100),
      e(2, 'wren', 100),
      e(3, 'wren', 100),
      e(4, 'ilse', 50),
      e(5, null, 50),
      e(6, 'wren', 100),
    ]);
    expect(summary.each['wren'], (chapters: 4, words: 400));
    expect(summary.each['ilse'], (chapters: 1, words: 50));
    expect(summary.words, 500);
    expect(summary.longestRun, (who: 'wren', from: 1, to: 3));
    expect(summary.since, {'wren': 0, 'ilse': 2});
  });
}
