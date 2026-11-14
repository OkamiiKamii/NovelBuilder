import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/climb_view.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

/// A sheet in a system whose levels cost 100 XP each, with [xp] logged at the first chapters.
Future<void> climbing(WidgetTester tester, {required List<num> xp, Size size = const Size(1200, 2600)}) async {
  final c = await pumpApp(tester, size: size, location: '/library');
  final store = c.read(novelStoreProvider);
  final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
  c.read(openNovelProvider.notifier).open(novel.id);
  final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
  final chapters = [
    for (final n in readingOrder([for (final r in store.rowsIn(novel.id, 'chapters')) StoryNode(r)]))
      if (isDocument(n.kind)) n.id,
  ];
  c.read(progressionServiceProvider).systems(novel.id, (x) {
    final made = x.createSystem({
      'name': 'Test',
      'tracks': [
        {'id': 't', 'name': 'Level', 'key': 'level', 'kind': 'levels', 'cap': 50, 'curve': '100', 'curveUnit': 'XP'},
      ],
    });
    final sheet = x.addSheet(made.id, str(wren['id']));
    final track = made.tracks.single.id;
    x.updateSheet(
      sheet.id,
      (_) => {
        'xp': [
          for (final (i, a) in xp.indexed) {'id': 'x$i', 'trackId': track, 'amount': a, 'nodeId': chapters[i]},
        ],
      },
    );
  });
  c.read(routerProvider).go('/organize/systems');
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the climb: her level by chapter, the pace, and where it leads', (tester) async {
    await climbing(tester, xp: [100, 100, 100, 100]);
    expect(find.text('THE CLIMB'), findsOneWidget);
    expect(find.byType(ClimbView), findsOneWidget);
    expect(
      find.text('At this pace (100 XP a chapter), Level 16 by the end of chapter 15, the last written.'),
      findsOneWidget,
    );
    expect(find.text('Level 10 in chapter 9.'), findsOneWidget);
    expect(find.text('The cap, Level 50, in chapter 49.'), findsOneWidget);
  });

  testWidgets('a chapter that gives far more is said', (tester) async {
    await climbing(tester, xp: [100, 0, 100, 800]);
    expect(find.text('Chapter 4 alone gives Wren Hollis 8 levels, of 10 in the book so far.'), findsOneWidget);
  });
}
