import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a character’s page quotes their lines; a press opens the chapter at the line', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final wren = c
        .read(novelStoreProvider)
        .rowsIn(novel.id, 'loreEntries')
        .firstWhere((e) => e['name'] == 'Wren Hollis');
    c.read(routerProvider).go('/organize/character/${wren['id']}');
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('In their own words'), 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    final line = find.text('Master, it’s the tide bell.”');
    expect(line, findsOneWidget);
    expect(find.textContaining('Show all'), findsWidgets);
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.ensureVisible(line);
    await tester.pumpAndSettle();
    await tester.tap(line);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), isNotNull);
    expect(find.text('Master, it’s the tide bell'), findsWidgets, reason: 'found in the chapter');
  });
}
