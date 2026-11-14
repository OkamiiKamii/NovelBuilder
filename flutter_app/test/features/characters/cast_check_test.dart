import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/widgets/cast_check.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the cast, checked: a note with the face it is about; a face opens them; Not now is remembered', (
    tester,
  ) async {
    final c = await pumpApp(tester, location: '/organize');
    final store = c.read(novelStoreProvider);
    final novel = addSampleNovel(store, now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final note = find.text(
      'Nan Ottilie is in chapters 3 to 8, then gone: 7 chapters without them. A thread left hanging?',
    );
    expect(find.text('THE CAST, CHECKED'), findsOneWidget);
    expect(find.text('GONE QUIET'), findsOneWidget);
    expect(note, findsOneWidget);

    final nan = store.rowsIn(novel.id, 'loreEntries').firstWhere((r) => r['name'] == 'Nan Ottilie');
    final face = find.descendant(of: find.byType(CastCheck), matching: find.bySemanticsLabel('Open Nan Ottilie'));
    await tester.ensureVisible(face);
    await tester.pumpAndSettle();
    await tester.tap(face);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/character/${nan['id']}');

    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    final notNow = find.descendant(of: find.byType(CastCheck), matching: find.text('Not now'));
    await tester.ensureVisible(notNow);
    await tester.pumpAndSettle();
    await tester.tap(notNow);
    await tester.pumpAndSettle();
    expect(note, findsNothing);
    expect(find.text('THE CAST, CHECKED'), findsNothing, reason: 'no notes left: no section');
    expect(c.read(settingsStoreProvider).read(castCheckKey(novel.id)), ['quiet:${nan['id']}']);
  });
}
