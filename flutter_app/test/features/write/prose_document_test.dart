import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/write/editor/prose_document.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:super_editor/super_editor.dart';

import '../../shared/domain/fixtures.dart';

JsonMap doc(List<JsonMap> content) => {'type': 'doc', 'content': content};
JsonMap p(List<JsonMap> content, {String? align = '__none'}) => {
  'type': 'paragraph',
  'attrs': {'textAlign': align == '__none' ? null : align},
  if (content.isNotEmpty) 'content': content,
};
JsonMap t(String text, [List<String> marks = const []]) => {
  'type': 'text',
  'text': text,
  if (marks.isNotEmpty)
    'marks': [
      for (final m in marks) {'type': m},
    ],
};

void expectRoundTrip(JsonMap source) {
  final opened = editableDocument(source);
  expect(opened.editable, isTrue, reason: opened.reason);
  final back = documentToProse(opened.document!, extras: opened.docExtras);
  expect(jsonEquals(normalizeProse(back), normalizeProse(source)), isTrue, reason: '$back\n!=\n$source');
}

void main() {
  for (final name in fixtureNames) {
    test('every stored text in $name opens for editing and comes back unchanged', () {
      final s = loadFixture(name);
      var n = 0;
      for (final row in [...s.rows('chapterContents'), ...s.rows('chapterRevisions'), ...s.rows('chapterBranches')]) {
        if (row['doc'] is! Map) continue;
        expectRoundTrip(row['doc']! as JsonMap);
        n++;
      }
      expect(n, greaterThan(0));
    });
  }

  test('formatting, alignment, headings, links to entries and line breaks survive', () {
    expectRoundTrip(
      doc([
        {
          'type': 'heading',
          'attrs': {'textAlign': 'center', 'level': 2},
          'content': [t('Part One')],
        },
        p([
          t('Mira ', ['bold']),
          t('drew', ['bold', 'italic']),
          t(' the '),
          {
            'type': 'text',
            'text': 'Ember Blade',
            'marks': [
              {'type': 'underline'},
              {
                'type': 'entityLink',
                'attrs': {'entryId': 'e1'},
              },
            ],
          },
          {'type': 'hardBreak'},
          t('struck', ['strike']),
          t('\tTabbed.'),
        ], align: 'justify'),
        p([]),
      ]),
    );
  });

  test('quotations with several paragraphs, and neighbouring quotations, keep their grouping', () {
    expectRoundTrip(
      doc([
        {
          'type': 'blockquote',
          'content': [
            p([t('One')]),
            p([t('Two')]),
          ],
        },
        {
          'type': 'blockquote',
          'content': [
            p([t('Separate')]),
          ],
        },
      ]),
    );
  });

  test('lists, nested lists and numbered lists that start elsewhere', () {
    JsonMap item(String text, [List<JsonMap> nested = const []]) => {
      'type': 'listItem',
      'content': [
        p([t(text)]),
        ...nested,
      ],
    };
    expectRoundTrip(
      doc([
        {
          'type': 'bulletList',
          'content': [
            item('Apples', [
              {
                'type': 'orderedList',
                'attrs': {'start': 3, 'type': null},
                'content': [item('Three'), item('Four')],
              },
            ]),
            item('Pears'),
          ],
        },
        {'type': 'horizontalRule'},
        {
          'type': 'bulletList',
          'content': [item('Separate list')],
        },
      ]),
    );
  });

  test('a mark this editor has no button for is kept on its text', () {
    expectRoundTrip(
      doc([
        p([
          {
            'type': 'text',
            'text': 'highlighted',
            'marks': [
              {
                'type': 'highlight',
                'attrs': {'color': 'yellow'},
              },
            ],
          },
        ]),
      ]),
    );
  });

  test('unknown attributes on blocks and on the document are kept', () {
    expectRoundTrip({
      'type': 'doc',
      'version': 7,
      'content': [
        {
          'type': 'paragraph',
          'attrs': {'textAlign': null, 'indentFirstLine': true},
          'content': [t('x')],
        },
        {
          'type': 'paragraph',
          'content': [t('stored without attrs')],
        },
      ],
    });
  });

  test('an empty or missing document opens as one empty paragraph', () {
    for (final d in [
      <String, Object?>{'type': 'doc'},
      doc([]),
      emptyDoc(),
    ]) {
      final opened = editableDocument(d);
      expect(opened.editable, isTrue);
      expect(opened.document!.nodeCount, 1);
    }
    expect(editableDocument(null).editable, isTrue);
  });

  test('what the editor cannot reproduce opens read-only, with the reason', () {
    final cases = {
      'image': doc([
        {
          'type': 'image',
          'attrs': {'src': 'x.png'},
        },
      ]),
      'table': doc([
        {'type': 'table', 'content': <JsonMap>[]},
      ]),
      'heading 5': doc([
        {
          'type': 'heading',
          'attrs': {'level': 5, 'textAlign': null},
          'content': [t('Deep')],
        },
      ]),
      'two paragraphs in one item': doc([
        {
          'type': 'bulletList',
          'content': [
            {
              'type': 'listItem',
              'content': [
                p([t('a')]),
                p([t('b')]),
              ],
            },
          ],
        },
      ]),
    };
    for (final e in cases.entries) {
      final opened = editableDocument(e.value);
      expect(opened.editable, isFalse, reason: e.key);
      expect(opened.reason, isNotEmpty);
    }
  });

  test('text typed in the editor is saved as written: no smart quotes, dashes or shortcuts', () {
    final document = MutableDocument(
      nodes: [ParagraphNode(id: 'a', text: AttributedText('# Not a heading -- "quoted" http://example.com'))],
    );
    final saved = documentToProse(document);
    expect(blockTexts(saved), ['# Not a heading -- "quoted" http://example.com']);
    expect(saved['content'], [
      {
        'type': 'paragraph',
        'attrs': {'textAlign': null},
        'content': [t('# Not a heading -- "quoted" http://example.com')],
      },
    ]);
  });
}
