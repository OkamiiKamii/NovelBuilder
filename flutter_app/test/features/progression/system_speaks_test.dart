import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/widgets/system_speaks.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  test('a blueprint wears the window its words call for', () {
    SystemBlueprint named(String name) => SystemBlueprint({'name': name});
    expect(windowKindOf(named('Nine Realms Cultivation')), 'cultivation');
    expect(windowKindOf(named('The Rune Ledger')), 'hard-magic');
    expect(windowKindOf(named('Hero Registry')), 'superhero');
    expect(windowKindOf(named('The System')), 'litrpg');
  });

  testWidgets('the system speaks: filled from the sheet, in the book’s brackets, written at the end of the chapter', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final wren = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Wren Hollis');
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    c.read(progressionServiceProvider).systems(novel.id, (x) {
      final made = x.createSystem(litrpg.content);
      x.addSheet(made.id, str(wren['id']));
    });
    final chapter = [
      for (final n in readingOrder([for (final r in store.rowsIn(novel.id, 'chapters')) StoryNode(r)]))
        if (isDocument(n.kind)) n.id,
    ].first;
    c.read(selectedNodeProvider.notifier).select(chapter);
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('The system speaks'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The system speaks'));
    await tester.pumpAndSettle();
    final window = find.bySemanticsLabel(
      RegExp(r'^The message: \[Level up!\] \[Wren Hollis has reached Level \d+\.\]'),
    );
    expect(window, findsOneWidget, reason: 'to the one with a sheet, from where they stand');

    // A skill, in lenticular brackets (remembered).
    await tester.tap(find.text('New skill'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Skill'), 'Tide Sense');
    await tester.enterText(find.widgetWithText(TextField, 'Rank (optional)'), 'E');
    await tester.pumpAndSettle();
    final lenticular = find.byTooltip('Lenticular brackets');
    await tester.ensureVisible(lenticular);
    await tester.tap(lenticular);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('The message: 【Skill acquired: Tide Sense (E)】'), findsOneWidget);
    expect(c.read(settingsStoreProvider).read(bracketKey(novel.id)), 'lenticular');

    final write = find.text('Write it in the chapter');
    await tester.ensureVisible(write);
    await tester.tap(write);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(pendingInsertProvider), isNull, reason: 'taken by the chapter as it opened');
    // Saved with the chapter.
    c.read(saveControllerProvider).flush();
    final stored = store.row(novel.id, 'chapterContents', chapter)!;
    expect(blockTexts(stored['doc']).last, '【Skill acquired: Tide Sense (E)】');
    await tester.pump(const Duration(seconds: 2));
  });
}
