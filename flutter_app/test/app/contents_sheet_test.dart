import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/shell/contents_sheet.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/relationships/relation_changes.dart';

import '../helpers/pump_app.dart';

void main() {
  test('the areas in Roman numerals', () {
    expect([for (var n = 1; n <= 8; n++) roman(n)], ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);
  });

  testWidgets('More opens on the contents: each area with what it holds now, and opens it', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/write');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash Road', 'targetWordCount': '10000'}).id;
    c.read(novelStoreProvider).writeRows(novel, [
      RowWrite.put('chapters', {
        'id': 'ch1',
        'projectId': novel,
        'parentId': null,
        'kind': 'chapter',
        'title': 'One',
        'order': 0,
        'status': 'drafting',
        'wordCount': 2500,
        'createdAt': 0,
        'updatedAt': 0,
      }),
    ]);
    final s = c.read(characterServiceProvider);
    final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
    final kai = s.change(novel, (x) => x.create(name: 'Kai')).id;
    s.change(novel, (x) {
      final r = RelationChanges(x.snapshot, now: x.now, createId: x.newId)..createRelation(mira, kai, 'friends');
      x.snapshot = r.snapshot;
    });
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    final sheet = find.byType(BottomSheet);
    Finder inSheet(Finder f) => find.descendant(of: sheet, matching: f);
    expect(inSheet(find.text('Contents')), findsOneWidget);
    expect(inSheet(find.text('Ash Road')), findsOneWidget);
    expect(inSheet(find.text('IV')), findsOneWidget, reason: 'Plan is the fourth area');
    expect(inSheet(find.text('2 characters · 1 tie')), findsOneWidget);
    expect(inSheet(find.text('Threads, structure and the board')), findsOneWidget, reason: 'no threads yet');
    expect(inSheet(find.text('2,500 of 10,000 words')), findsOneWidget);
    expect(tester.widget<LinearProgressIndicator>(inSheet(find.byType(LinearProgressIndicator))).value, 0.25);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(inSheet(find.text('Progress')));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/progress');
  });

  testWidgets('with no novel open, the contents are the areas alone', (tester) async {
    await pumpApp(tester, size: phone, location: '/');
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('Contents'), findsOneWidget);
    expect(find.text('Settings'), findsWidgets);
    expect(find.textContaining('words'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
