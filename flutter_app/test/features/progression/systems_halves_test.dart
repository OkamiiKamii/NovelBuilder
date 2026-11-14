import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progression/progression_providers.dart';
import 'package:novel_builder/features/progression/systems_page.dart';
import 'package:novel_builder/features/progression/widgets/live_window.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/systems/system_presets.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('two halves: in the story first, the blueprint a press away, remembered; a link to a tab opens it', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/library');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    final litrpg = systemPresets.firstWhere((p) => p.id == 'litrpg');
    c.read(progressionServiceProvider).systems(novel.id, (x) => x.createSystem(litrpg.content));
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();

    // In the story: the window, the ledger; not the blueprint's tabs.
    expect(find.byType(LiveWindow), findsOneWidget);
    expect(find.text('THE LEDGER'), findsOneWidget);
    expect(find.textContaining('Attributes & resources'), findsNothing);

    await tester.tap(find.text('The blueprint'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Attributes & resources'), findsOneWidget);
    expect(find.byType(LiveWindow), findsNothing);
    expect(c.read(settingsStoreProvider).read(systemsModeKey), 'blueprint');

    // Remembered: back on Systems, the blueprint.
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/systems');
    await tester.pumpAndSettle();
    expect(find.textContaining('Attributes & resources'), findsOneWidget);

    await tester.tap(find.text('In the story'));
    await tester.pumpAndSettle();
    expect(find.byType(LiveWindow), findsOneWidget);

    // A link to a tab opens the blueprint at it.
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/systems?tab=kits');
    await tester.pumpAndSettle();
    expect(find.textContaining('Classes, skills & more'), findsOneWidget);
    expect(find.byType(LiveWindow), findsNothing);
  });
}
