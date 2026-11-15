import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/table_read.dart';

void main() {
  const people = <({String id, List<String> names})>[
    (id: 'wren', names: ['Wren Hollis', 'Wren']),
    (id: 'nan', names: ['Nan']),
    (id: 'kai', names: ['Kai']),
  ];
  List<({bool heading, String text})> blocks(List<String> paragraphs) => [
    for (final p in paragraphs) (heading: false, text: p),
  ];
  String script(List<ReadPart> parts) => parts
      .map((p) => p.line ? '${(p.speaker ?? '?').toUpperCase()}${p.likely ? '~' : ''}: ${p.text}' : '(${p.text})')
      .join(' | ');

  test('a chapter as a script: narration and lines in order, each line given to who is named saying it', () {
    final parts = tableRead(
      blocks([
        'The bell rang over the harbour.',
        '“Go,” Wren said. “Now, before the tide.”',
        'Nan whispered, “Not without the map.”',
        '“Who is there?” someone called from the dark.',
      ]),
      people,
    );
    expect(
      script(parts),
      '(The bell rang over the harbour.) | WREN: Go, | (Wren said.) | WREN: Now, before the tide. | '
      '(Nan whispered,) | NAN: Not without the map. | ?: Who is there? | (someone called from the dark.)',
      reason: 'someone else speaking is not the other one’s turn',
    );
    expect(parts[1].block, 1);
  });

  test('two named speaking in one paragraph: a line tied to neither is no one’s; a heading is read', () {
    final parts = tableRead([
      (heading: true, text: 'Chapter One'),
      (heading: false, text: '“Here,” said Nan. Wren answered, “Where?” “There.”'),
    ], people);
    expect(script(parts), '(Chapter One) | NAN: Here, | (said Nan. Wren answered,) | WREN: Where? | ?: There.');
  });

  test('as a reader follows talk, marked likely: she said, an action beat, the other one’s turn', () {
    final parts = tableRead(
      blocks([
        'Kai came in from the rain. Nan looked up from the fire.',
        '“You’re late,” she said.',
        'Kai shook the water from his coat. “The road was out.”',
        '“Which road?”',
        '“The low one.”',
      ]),
      people,
      genders: {'kai': 'Male', 'nan': 'Female'},
    );
    expect(
      [
        for (final p in parts)
          if (p.line) '${p.speaker}${p.likely ? '~' : ''}',
      ],
      ['nan~', 'kai~', 'nan~', 'kai~'],
    );
  });

  test('"he said" never goes to a woman; with no gender written, to the last named', () {
    final he = tableRead(
      blocks(['Nan and Kai stood at the door.', '“Open it,” he said.']),
      people,
      genders: {'nan': 'Female', 'kai': 'Male'},
    );
    expect(he.where((p) => p.line).single.speaker, 'kai');
    final unsaid = tableRead(blocks(['Wren turned.', '“Again,” she said.']), people);
    expect(unsaid.where((p) => p.line).single.speaker, 'wren');
  });

  test('voices spread so no two sound alike: low for men, high for women, between for others; nudged', () {
    final v = castVoices([
      (id: 'mark', gender: 'Male'),
      (id: 'kai', gender: 'male'),
      (id: 'wren', gender: 'Female'),
      (id: 'sefa', gender: ''),
    ]);
    expect(v['mark']!.pitch, 0.72);
    expect(v['kai']!.pitch, 0.95);
    expect(v['wren']!.pitch, 1.26);
    expect(v['sefa']!.pitch, 1.02);
    expect(v['mark']!.rate != v['kai']!.rate, isTrue, reason: 'paces differ too');
    expect(castVoices([(id: 'mark', gender: 'Male')], nudged: {'mark': 2})['mark']!.pitch, closeTo(0.995, 0.01));
    expect(castVoices([(id: 'x', gender: '')], nudged: {'x': -20})['x']!.pitch, lowestPitch, reason: 'kept in bounds');
    expect([voiceWord(v['mark']!), voiceWord(v['wren']!), voiceWord(v['sefa']!)], ['deep', 'high', 'middle']);
  });
}
