import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/data/sample_novel_text.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/text/red_pencil.dart';

List<String> marked(List<String> paragraphs, PencilMark kind) => [
  for (final f in redPencil(paragraphs).of(kind)) paragraphs[f.block].substring(f.start, f.end),
];

void main() {
  test('an echo: a distinctive word again close to itself, in either form, both places marked', () {
    expect(marked(['The stone was cold. She touched the stone again.'], PencilMark.echo), ['stone', 'stone']);
    expect(marked(['Seven stones stood there.', 'The first stone leaned.'], PencilMark.echo), ['stones', 'stone']);
    expect(marked(['The bell’s note. A bell rang.'], PencilMark.echo), ['bell’s', 'bell']);
  });

  test('not an echo: everyday words, names, short words, or a word that comes back much later', () {
    expect(marked(['“Go,” she said. “No,” he said. They were there, and there they were.'], PencilMark.echo), isEmpty);
    expect(marked(['Wren ran. Wren stopped. Then Wren laughed.'], PencilMark.echo), isEmpty, reason: 'a name');
    expect(marked(['The sea. The sea. The sea.'], PencilMark.echo), isEmpty, reason: 'three letters');
    final far = ['The harbour was empty. ${List.filled(45, 'and').join(' ')} The harbour filled.'];
    expect(marked(far, PencilMark.echo), isEmpty);
  });

  test('fillers, and "began to"', () {
    expect(marked(['It was very cold and she just began to run, really.'], PencilMark.filler), [
      'very',
      'just',
      'began to',
      'really',
    ]);
    expect(marked(['The beginning of it. She started the boat.'], PencilMark.filler), isEmpty);
  });

  test('a long sentence: more than forty words between full stops, marked from its first word to its stop', () {
    final long = 'The road ${List.filled(42, 'ran').join(' ')} on.';
    final text = 'A short one. $long “And this?” Done.';
    final found = redPencil([text]).of(PencilMark.long).toList();
    expect(found, hasLength(1));
    expect(text.substring(found.single.start, found.single.end), long);
    expect(redPencil(['Mr. Fenn paid 3.5 crowns. Then left.']).of(PencilMark.long), isEmpty);
  });

  test('leaned on: the distinctive words used most, five times or more', () {
    final text = List.filled(6, 'The water rose.').join(' ') + List.filled(5, ' Lanterns swung.').join();
    expect(redPencil([text]).leanedOn, [
      (word: 'rose', count: 6),
      (word: 'water', count: 6),
      (word: 'lanterns', count: 5),
      (word: 'swung', count: 5),
    ]);
  });

  test('it only reads: the same text gives the same marks, and nothing in it is changed', () {
    final paragraphs = ['The stone was very cold.', 'The stone was colder.'];
    final copy = [...paragraphs];
    expect(redPencil(paragraphs).findings, redPencil(copy).findings);
    expect(paragraphs, copy);
  });

  test('on a real chapter it marks places to look again, not every other word', () {
    for (final c in sampleChapters) {
      final paragraphs = sampleParagraphs(c.text);
      final words = countWords(paragraphs.join('\n'));
      final report = redPencil(paragraphs);
      expect(report.count(PencilMark.echo), lessThan(words * 0.12), reason: c.title);
      for (final f in report.findings) {
        expect(f.end, lessThanOrEqualTo(paragraphs[f.block].length));
        expect(f.start, lessThan(f.end));
      }
    }
  });
}
