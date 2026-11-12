import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/characters/voice.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

List<String> said(List<String> paragraphs, List<String> names) => [
  for (final s in spokenBy({'c': paragraphs}, ['c'], names)) s.words,
];

void main() {
  test('their lines, by how dialogue is written', () {
    expect(said(['“It’s going,” Wren said.'], ['Wren']), ['It’s going']);
    expect(said(['“Go home,” said Nan, and smiled.'], ['Nan']), ['Go home']);
    expect(said(['Ilse whispered: “Close the drawer.”'], ['Ilse']), ['Close the drawer.']);
    expect(said(['Wren said, "Not yet."'], ['Wren']), ['Not yet.']);
  });

  test('the only speaker of a paragraph says all its lines; two speakers, only what is tied to each', () {
    expect(said(['“Nine days,” Wren said. “Nine days of low water.”'], ['Wren']), [
      'Nine days',
      'Nine days of low water.',
    ]);
    expect(said(['“Tell her no,” Ilse said. “I already did,” said Wren. “Tell her again.”'], ['Wren']), [
      'I already did',
    ]);
  });

  test('a pronoun names no one; a quotation no one says is no one’s', () {
    expect(said(['“Morning,” he said.'], ['Tobiah']), isEmpty);
    expect(said(['The sign read “Closed”.'], ['Wren']), isEmpty);
    expect(said(['“Go,” Tobiah said.'], ['Wren']), isEmpty);
  });

  test('the sample novel gives Wren her voice', () {
    final s = sampleNovel(now: 0);
    final pages = {for (final r in s.rows('chapterContents')) str(r['id']): blockTexts(r['doc'])};
    final order = StoryOrder.of([for (final r in s.rows('chapters')) StoryNode(r)]);
    final ids = [for (final c in order.chapters) c.id];
    final lines = [
      for (final x in spokenBy(pages, ids, ['Wren Hollis', 'Wren'])) x.words,
    ];
    expect(lines, contains('The tide bell'));
    expect(lines, contains('She’s my master.'));
    expect(lines, isNot(contains('I want to finish it.')), reason: 'a line alone, with no name by it, is no one’s');
    expect(lines.length, greaterThan(15));
    final nan = [
      for (final x in spokenBy(pages, ids, ['Nan Ottilie', 'Nan'])) x.words,
    ];
    expect(nan, contains('What do you want, child?'));
    expect(nan, isNot(contains('Ilse Marrow’s apprentice')), reason: '“she said”: a pronoun names no one');
  });
}
