import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/search/search_dialog.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import 'search_screen_test.dart' show openSearch, start, type;

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';

Future<void> _close(WidgetTester tester) async {
  await tester.sendKeyEvent(LogicalKeyboardKey.escape);
  await tester.pumpAndSettle();
}

/// Search opened again with nothing it is made of written since takes the index it made, instead of reading the book
/// again; a write to the chapters or the codex makes it anew, and finds what was written. And the panel built again
/// for anything else (the keyboard sliding up, a frame at a time) does not search again.
void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('the index is kept between openings until what it is made of is written', (tester) async {
    final c = await start(tester);
    final store = c.read(novelStoreProvider);
    final made = searchIndexesMade;
    await openSearch(tester);
    await type(tester, 'road wall');
    expect(find.textContaining('Manuscript · '), findsOneWidget);
    await _close(tester);
    expect(searchIndexesMade, made + 1);

    // Opened again: the same index, the same results.
    await openSearch(tester);
    expect(searchIndexesMade, made + 1, reason: 'nothing it is made of was written');
    await type(tester, 'road wall');
    expect(find.textContaining('Manuscript · '), findsOneWidget);
    await _close(tester);

    // A write to something search is not made of keeps it.
    store.writeRows(_novel, [
      RowWrite.put('characterProfiles', {'id': 'kept-test-profile', 'entryId': 'nobody'}),
    ]);
    await openSearch(tester);
    expect(searchIndexesMade, made + 1, reason: 'a character profile is not searched');
    await _close(tester);

    // A write to the codex makes it anew, and the new name is found.
    final entry = store.rowsIn(_novel, 'loreEntries').first;
    store.writeRows(_novel, [
      RowWrite.put('loreEntries', {...entry, 'name': 'Quillfeather Marrowgate'}),
    ]);
    await openSearch(tester);
    expect(searchIndexesMade, made + 2);
    await type(tester, 'Quillfeather');
    expect(find.textContaining('Nothing matches'), findsNothing);
    expect(find.textContaining('Quillfeather', findRichText: true), findsWidgets);
    await _close(tester);
  });

  testWidgets('the panel built again for the keyboard does not search again; new words or a scope do', (tester) async {
    await start(tester, size: phone);
    await openSearch(tester);
    await type(tester, 'road wall');
    final searched = searchesRun;
    // The keyboard slides up, a frame at a time: the panel is built for each.
    for (final bottom in [80.0, 160.0, 240.0, 320.0]) {
      tester.view.viewInsets = FakeViewPadding(bottom: bottom);
      await tester.pump(const Duration(milliseconds: 16));
    }
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(searchesRun, searched, reason: 'the same words and scope: the results as they were');
    expect(find.textContaining('Manuscript · '), findsOneWidget);

    await type(tester, 'road');
    expect(searchesRun, greaterThan(searched), reason: 'new words');
    final again = searchesRun;
    await tester.tap(find.widgetWithText(ChoiceChip, 'Codex'));
    await tester.pumpAndSettle();
    expect(searchesRun, greaterThan(again), reason: 'another scope');
  });
}
