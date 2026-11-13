import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/storyboard.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

/// The sample novel open on Write's contents (no chapter selected).
Future<({ProviderContainer c, String novel})> openContents(WidgetTester tester, {required Size size}) async {
  final c = await pumpApp(tester, size: size, location: '/write');
  final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 12).millisecondsSinceEpoch);
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id);
}

void main() {
  setUpAll(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDownAll(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('on a phone the storyboard shows each chapter’s opening and ending and who is in it, a press opens it, '
      'and it is remembered', (tester) async {
    final w = await openContents(tester, size: phone);
    final before = jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0));
    expect(find.text('OPENS'), findsNothing, reason: 'the list, to begin with');

    await tester.tap(find.byTooltip('Show the storyboard'));
    await tester.pumpAndSettle();
    final opening = find.textContaining('The bell in the Wardens’ tower had not rung in thirty-one years');
    await tester.scrollUntilVisible(opening, 300, scrollable: find.byType(Scrollable).first);
    expect(opening, findsOneWidget);
    expect(find.text('ENDS'), findsWidgets);
    expect(find.textContaining('Wren Hollis, Ilse Marrow'), findsWidgets, reason: 'who is on the pages');
    expect(w.c.read(storyboardOnProvider), isTrue);
    expect(
      jsonEncode(w.c.read(novelStoreProvider).load(w.novel)!.toJson(exportedAt: 0)),
      before,
      reason: 'a look changes nothing',
    );

    // A press on the chapter opens it.
    await tester.tap(opening);
    await tester.pumpAndSettle();
    expect(w.c.read(selectedNodeProvider), isNotNull);

    // Remembered on this device, and back to the list in a press.
    expect(w.c.read(settingsStoreProvider).read(storyboardKey), isTrue);
  });

  testWidgets('back to the list', (tester) async {
    final w = await openContents(tester, size: desktop);
    await tester.tap(find.byTooltip('Show the storyboard'));
    await tester.pumpAndSettle();
    final contents = find.ancestor(of: find.text('THE DAY BOOK'), matching: find.byType(Scrollable)).first;
    final opening = find.textContaining('The bell in the Wardens’ tower');
    await tester.scrollUntilVisible(opening, 300, scrollable: contents);
    expect(find.text('OPENS'), findsWidgets);
    await tester.tap(find.byTooltip('Show the list'));
    await tester.pumpAndSettle();
    expect(find.text('OPENS'), findsNothing);
    expect(w.c.read(settingsStoreProvider).read(storyboardKey), isFalse);
  });
}
