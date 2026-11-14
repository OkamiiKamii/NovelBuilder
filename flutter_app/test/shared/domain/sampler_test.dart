import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/exchange/compile.dart';
import 'package:novel_builder/shared/domain/exchange/render_pdf.dart';
import 'package:novel_builder/shared/domain/exchange/sampler.dart';

void main() {
  SampleChapter chapter(String title, int words) => (title: title, paragraphs: [List.filled(words, 'word').join(' ')]);

  test('the opening: chapters until a reader has enough, three at most, empty ones passed over', () {
    expect(
      [
        for (final c in sampleChapters([chapter('One', 2000), chapter('Two', 500)])) c.title,
      ],
      ['One'],
    );
    expect(
      [
        for (final c in sampleChapters([
          chapter('One', 400),
          chapter('', 0),
          chapter('Two', 600),
          chapter('Three', 900),
        ]))
          c.title,
      ],
      ['One', 'Two', 'Three'],
    );
    expect(sampleChapters([for (var i = 0; i < 6; i++) chapter('$i', 100)]), hasLength(3));
  });

  test('a title page, the chapters each on a new page, and a last page that says how much more', () async {
    final sample = samplerOf(
      title: 'The Drowned Road',
      author: 'R. Hollis',
      quote: 'The sea does not care how excited you are.',
      blurb: 'A girl, a chart, and nine days of low water.',
      chapters: [chapter('The Bell', 1600), chapter('Half a Map', 700)],
      allChapters: 15,
      allWords: 9645,
    );
    final heads = [for (final b in sample.blocks.whereType<HeadingBlock>()) (b.role, b.text, b.pageBreak)];
    expect(heads, [
      (HeadingRole.title, 'The Drowned Road', false),
      (HeadingRole.subtitle, 'by R. Hollis', false),
      (HeadingRole.chapter, 'The Bell', true),
    ]);
    final last = sample.blocks.whereType<ParagraphBlock>().toList();
    expect(
      last[last.length - 2].runs.single.text,
      'End of the sample. The Drowned Road runs to 15 chapters and 9,645 words so far.',
    );
    expect(last.last.runs.single.text, 'Made with Novel Builder');
    expect((sample.wordCount, sample.chapterCount), (1600, 1));
    final pdf = await renderPdf(sample);
    expect(String.fromCharCodes(pdf.take(5)), '%PDF-');
  });

  test('a short book: all of it, and said so', () {
    final sample = samplerOf(
      title: '',
      author: '',
      quote: '',
      blurb: '',
      chapters: [chapter('One', 300)],
      allChapters: 1,
      allWords: 300,
    );
    final texts = [for (final b in sample.blocks.whereType<ParagraphBlock>()) b.runs.single.text];
    expect(texts, contains('End of the sample: all of Untitled so far, 300 words.'));
    expect(sample.blocks.whereType<HeadingBlock>().first.text, 'Untitled');
  });
}
