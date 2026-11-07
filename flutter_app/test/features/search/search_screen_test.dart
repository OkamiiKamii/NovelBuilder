import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/editor/find_bar.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';
import '../../shared/domain/fixtures.dart';

const _novel = '70465ae9-f720-4346-8683-298ce006ed1a';

Future<ProviderContainer> start(WidgetTester tester, {Size size = desktop}) async {
  final c = await pumpApp(tester, size: size, location: '/organize');
  c.read(novelStoreProvider).putNovel(loadFixture('made-in-the-app'));
  c.read(openNovelProvider.notifier).open(_novel);
  await tester.pumpAndSettle();
  return c;
}

Future<void> openSearch(WidgetTester tester) async {
  await tester.sendKeyDownEvent(LogicalKeyboardKey.control);
  await tester.sendKeyEvent(LogicalKeyboardKey.keyK);
  await tester.sendKeyUpEvent(LogicalKeyboardKey.control);
  await tester.pumpAndSettle();
}

Future<void> type(WidgetTester tester, String query) async {
  await tester.enterText(find.widgetWithText(TextField, 'Search the whole novel'), query);
  await tester.pump(const Duration(milliseconds: 200));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('Ctrl+K searches the whole novel; a match in the text opens the chapter with find on it', (tester) async {
    final c = await start(tester);
    await openSearch(tester);
    expect(find.text('Search the whole novel'), findsOneWidget);
    await type(tester, 'road wall');
    expect(find.textContaining('Manuscript · '), findsOneWidget);
    expect(find.text('Chapter 1'), findsWidgets);
    expect(find.textContaining('Read only: nothing is changed.'), findsOneWidget);
    // Opening the passage: the chapter, in Write, with find on the matched words.
    await tester.tap(find.textContaining('ended at a', findRichText: true).first);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/write');
    expect(c.read(selectedNodeProvider), '4fee0c33-10ac-413e-a828-941049a681a0');
    expect(find.byType(FindBar), findsOneWidget);
    final field = tester
        .widgetList<TextField>(find.descendant(of: find.byType(FindBar), matching: find.byType(TextField)))
        .first;
    expect(field.controller!.text.toLowerCase(), anyOf('road', 'wall'));
    expect(c.read(pendingFindProvider), isNull, reason: 'the request is used once');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('an entry is found by name and opened where it lives; scopes narrow the search', (tester) async {
    final c = await start(tester);
    await openSearch(tester);
    await type(tester, 'lyon');
    expect(find.textContaining('Locations · '), findsOneWidget);
    await tester.tap(find.text('Manuscript'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Nothing matches “lyon” in manuscript.'), findsOneWidget);
    await tester.tap(find.text('Everything'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lyon').last);
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/world/entry/01ac40fa-82f4-4e46-848d-2039d865984c-lyon');
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('one letter waits; a word nowhere says so; with no novel open, search says to open one', (tester) async {
    await start(tester);
    await openSearch(tester);
    await type(tester, 'r');
    expect(find.textContaining('Type at least two letters'), findsOneWidget);
    await type(tester, 'zzzqqq');
    expect(find.textContaining('Nothing matches “zzzqqq”'), findsOneWidget);
    await tester.tap(find.byTooltip('Close search'));
    await tester.pumpAndSettle();
    expect(find.text('Search the whole novel'), findsNothing);
  });

  testWidgets('with no novel open, search says to open one', (tester) async {
    await pumpApp(tester, location: '/organize');
    await openSearch(tester);
    expect(find.text('Open a novel from the Library to search it.'), findsOneWidget);
  });

  testWidgets('on a phone at twice the text size, search fits and opens from More', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await start(tester, size: phone);
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Search the novel'));
    await tester.pumpAndSettle();
    await type(tester, 'bell');
    expect(tester.takeException(), isNull);
    expect(find.text('The Bell'), findsWidgets);
    await tester.pump(const Duration(seconds: 2));
  });
}
