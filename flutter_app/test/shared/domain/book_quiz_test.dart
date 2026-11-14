import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/book_quiz.dart';

void main() {
  // Lines worth asking about: a turn, the senses, the right length.
  const one = [
    'The bell in the tower had not rung in thirty years, but tonight it rang through the cold stone.',
    'Wren dropped the good ink, and the black ran across the floorboards like spilled night.',
    'Nobody in the town ever forgot the sound of the sea going out across the old salt flats.',
    '“The water is going, and it will not wait for us,” Wren said.',
  ];
  const two = [
    'The causeway rose out of the grey bay, yet no one dared to walk it before the morning light.',
    'Kit counted the lanterns along the harbour wall, but the smoke hid half of them from view.',
    '“Never trust the tide bell, whatever the wardens tell you,” Kit said.',
    'The chart on the wall had a blank where the drowned town should be, and nobody ever asked why.',
  ];
  final chapters = <QuizChapter>[
    (id: 'c1', title: 'The Bell', paragraphs: [null, ...one]),
    (id: 'c2', title: '', paragraphs: two),
  ];
  final speakers = <String, QuizSpeaker>{
    'w': (
      name: 'Wren Hollis',
      lines: [(nodeId: 'c1', block: 4, words: 'The water is going, and it will not wait for us')],
    ),
    'k': (
      name: 'Kit Marrow',
      lines: [(nodeId: 'c2', block: 2, words: 'Never trust the tide bell, whatever the wardens tell you')],
    ),
    'i': (name: 'Ilse Marrow', lines: const []),
  };

  test('the kinds take turn about, each right answer among the choices, no line asked twice', () {
    final quiz = bookQuiz(chapters, speakers, seed: 7);
    expect(quiz.length, greaterThanOrEqualTo(quizAtLeast));
    expect(quiz.length, lessThanOrEqualTo(quizLength));
    expect({for (final q in quiz.take(4)) q.kind}, containsAll([QuizKind.whoSaid, QuizKind.missingWord]));
    for (final q in quiz) {
      expect(q.answer, inInclusiveRange(0, q.options.length - 1));
      expect(q.options.toSet(), hasLength(q.options.length), reason: 'no choice twice');
    }
    final asked = [
      for (final q in quiz)
        if (q.kind != QuizKind.whichFirst) q.line,
    ];
    expect(asked.toSet(), hasLength(asked.length));
  });

  test('who said it: the speaker among the cast; which chapter: the chapter said as it is titled', () {
    for (var seed = 0; seed < 20; seed++) {
      for (final q in bookQuiz(chapters, speakers, seed: seed)) {
        switch (q.kind) {
          case QuizKind.whoSaid:
            final right = q.options[q.answer];
            expect(
              speakers.values.firstWhere((s) => s.name == right).lines.map((l) => '“${l.words}”'),
              contains(q.line),
            );
            expect(q.options, hasLength(3));
          case QuizKind.whichChapter:
            expect(q.options, ['Chapter 1 · The Bell', 'Chapter 2']);
            expect(q.options[q.answer], q.nodeId == 'c1' ? 'Chapter 1 · The Bell' : 'Chapter 2');
          case QuizKind.missingWord:
            expect(q.line, contains(quizGap));
            final whole = [
              ...one,
              ...two,
            ].firstWhere((p) => p.contains(q.line.split(quizGap).first) && p.contains(q.line.split(quizGap).last));
            expect(whole, contains(q.options[q.answer]));
          case QuizKind.whichFirst:
            expect(q.options, hasLength(2));
            final all = [...one, ...two];
            final at = [for (final o in q.options) all.indexWhere((p) => p.contains(o))];
            expect(at[q.answer], lessThan(at[1 - q.answer]));
        }
      }
    }
  });

  test('a seed picks the game: the same seed the same, another seed another', () {
    String game(int seed) => [for (final q in bookQuiz(chapters, speakers, seed: seed)) '${q.kind}${q.line}'].join();
    expect(game(3), game(3));
    expect({for (var s = 0; s < 6; s++) game(s)}.length, greaterThan(1));
  });

  test('one chapter and one character still make a game; too little makes none', () {
    final alone = bookQuiz([chapters.first, (id: 'c2', title: '', paragraphs: two)], {'w': speakers['w']!}, seed: 1);
    expect(alone.map((q) => q.kind), isNot(contains(QuizKind.whoSaid)));
    expect(alone, isNotEmpty);
    expect(
      bookQuiz(
        [
          (id: 'c', title: '', paragraphs: const ['Short.']),
        ],
        const {},
        seed: 1,
      ),
      isEmpty,
    );
  });

  test('what a score says', () {
    expect(quizVerdict(10, 10), contains('by heart'));
    expect(quizVerdict(7, 10), contains('know it well'));
    expect(quizVerdict(4, 10), contains('reread'));
    expect(quizVerdict(1, 10), contains('read it again'));
  });
}
