import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/codex/widgets/found_in_pages.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the World offers what the chapters name; a press adds it, under its kind or another; or sets it aside', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/world');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'One');
    m.save(
      novel,
      one.id,
      textToDoc(
        'James cut through the Mimir Forest to do so. The Mimir Forest was dark.\n'
        'For now, James was flying by using the Smart Atoms skill.\n'
        'The Glass Order waited by the Iron Gate.',
      ),
      baseRev: 0,
    );
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('Found in your pages'), findsOneWidget);
    expect(find.text('Mimir Forest'), findsOneWidget);
    expect(find.textContaining('reads as a place · in chapter 1'), findsWidgets);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    List<String> entries() => [
      for (final e in c.read(novelStoreProvider).rowsIn(novel, 'loreEntries')) '${e['name']}:${e['category']}',
    ];

    // Under the kind it reads as, in a press.
    await tester.ensureVisible(find.text('Add as Location').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add as Location').first);
    await tester.pumpAndSettle();
    expect(entries(), contains('Mimir Forest:location'));
    expect(find.text('Mimir Forest is in the world.'), findsOneWidget);
    expect(find.text('Mimir Forest'), findsWidgets, reason: 'now in the encyclopedia');

    // A power, as a power.
    await tester.ensureVisible(find.text('Add as Power System / Rule').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add as Power System / Rule').first);
    await tester.pumpAndSettle();
    expect(entries(), contains('Smart Atoms:power'));

    // Another kind; and one set aside.
    final left = find.descendant(of: find.byType(FoundInPages), matching: find.text('Another kind'));
    await tester.ensureVisible(left.first);
    await tester.pumpAndSettle();
    await tester.tap(left.first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lore / History').last);
    await tester.pumpAndSettle();
    expect(entries().where((e) => e.endsWith(':lore')), hasLength(1));

    final aside = find.text('Not an entry');
    await tester.ensureVisible(aside.first);
    await tester.pumpAndSettle();
    await tester.tap(aside.first);
    await tester.pumpAndSettle();
    expect(find.text('Found in your pages'), findsNothing, reason: 'nothing left to offer');
    expect(c.read(settingsStoreProvider).read(notEntriesKey(novel)), hasLength(1));
    expect(entries(), hasLength(3));
  });
}
