// Where each character appears: the quick word check in front of the name search must never change which chapters
// a name is found in. Compared here with the search alone, on names that are hard to match.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/analytics.dart';
import 'package:novel_builder/shared/domain/continuity/text.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

const _p = 'p0000000-0000-4000-8000-000000000000';

const _texts = [
  "Zoë met O'Neil by the gate. Jean-Luc stayed home.",
  'Ann-Marie laughed; Anne did not. R2 beeped twice.',
  'Señor Núñez, the 3rd of his name, waited for Dr. Ho.',
  'Nobody came. annie whispered to the ANN on the radio.',
  '“Mira!” said Vane. Mira Vane. MiraVane. Mira  Vane.',
];

const _names = [
  'Zoë',
  'Zoe',
  "O'Neil",
  'Neil',
  'Jean-Luc',
  'Jean',
  'Luc',
  'Ann',
  'Anne',
  'Ann-Marie',
  'Marie',
  'R2',
  'R',
  'Señor Núñez',
  'Núñez',
  'Nunez',
  '3rd',
  'Dr. Ho',
  'Ho',
  'annie',
  'Annie',
  'ANN',
  'Mira',
  'Vane',
  'Mira Vane',
  'Mira  Vane',
  'MiraVane',
  'the',
  '...',
  ' Mira ',
];

void main() {
  test('every name is found in exactly the chapters the name search finds it in', () {
    final snapshot = NovelSnapshot.fromJson({
      'format': 'novel-builder/project',
      'version': 4,
      'exportedAt': 1,
      'project': {'id': _p, 'title': 'Names', 'createdAt': 1, 'updatedAt': 1},
      'collections': {
        'chapters': [
          for (final (i, _) in _texts.indexed)
            {
              'id': '$_p-c$i',
              'projectId': _p,
              'parentId': null,
              'kind': 'chapter',
              'title': 'Chapter ${i + 1}',
              'order': i,
              'status': 'drafting',
              'wordCount': 10,
              'mentions': <Object?>[],
            },
        ],
        'chapterContents': [
          for (final (i, text) in _texts.indexed)
            {
              'id': '$_p-c$i',
              'projectId': _p,
              'doc': {
                'type': 'doc',
                'content': [
                  {
                    'type': 'paragraph',
                    'content': [
                      {'type': 'text', 'text': text},
                    ],
                  },
                ],
              },
            },
        ],
        'loreEntries': [
          for (final (i, name) in _names.indexed)
            {'id': '$_p-n$i', 'projectId': _p, 'category': 'character', 'name': name, 'fields': <Object?>[]},
        ],
      },
    });
    final model = StoryModel.fromSnapshot(snapshot);
    final analytics = computeAnalytics(
      model,
      targetWordCount: null,
      docs: {for (final r in snapshot.rows('chapterContents')) r['id']! as String: r['doc']},
      snapshots: const [],
      sessions: const [],
      goals: const [],
      now: DateTime(2026, 10, 27).millisecondsSinceEpoch,
    );
    final found = {for (final r in analytics.cast.rows) r.name: r.chapters};
    for (final name in _names) {
      final expected = [
        for (final (i, text) in _texts.indexed)
          if (name.trim().isNotEmpty && text.contains(name.trim()) && findWords(text, [name]).isNotEmpty) i + 1,
      ];
      expect(found[name], expected, reason: name);
    }
    // The check is not vacuous: hard names are found, and near misses are not.
    expect(found['Zoë'], [1]);
    expect(found["O'Neil"], [1]);
    expect(found['Ann'], [2]);
    expect(found['Núñez'], [3]);
    expect(found['Nunez'], isEmpty);
    expect(found['MiraVane'], [5]);
  });
}
