import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/widgets/cast_check.dart';
import 'package:novel_builder/features/characters/widgets/manuscript_names.dart';
import 'package:novel_builder/features/characters/widgets/page_notes.dart';
import 'package:novel_builder/features/characters/widgets/together_on_page.dart';
import 'package:novel_builder/features/characters/widgets/waiting_for_a_name.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<void> open(WidgetTester tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 13).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    await tester.pumpAndSettle();
  }

  testWidgets('the cast first: the strip of notes counts what the pages say, and the notes are under the cast', (
    tester,
  ) async {
    await open(tester);
    // The strip, each kind with its count.
    expect(find.text('FROM YOUR PAGES'), findsOneWidget);
    expect(find.text('15 pairs often together'), findsOneWidget);
    expect(find.text('1 note on the cast'), findsOneWidget);
    expect(find.text('1 waiting for a name'), findsOneWidget);
    expect(find.text('2 names in your pages'), findsOneWidget);

    // On a phone, the search and the views come on the first screen, before any of the notes.
    final search = tester.getTopLeft(find.text('Search the cast')).dy;
    expect(search, lessThan(tester.view.physicalSize.height / tester.view.devicePixelRatio));
    for (final panel in [TogetherOnPage, CastCheck, WaitingForAName, ManuscriptNames]) {
      expect(tester.getTopLeft(find.byType(panel)).dy, greaterThan(search), reason: '$panel under the cast');
    }
  });

  testWidgets('a note pressed goes to its panel', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const ValueKey('note-waiting')));
    await tester.pumpAndSettle();
    final y = tester.getTopLeft(find.text('The clerk')).dy;
    expect(y, greaterThan(0));
    expect(y, lessThan(400), reason: 'brought up near the top');
  });

  testWidgets('a note dealt with is counted off the strip', (tester) async {
    await open(tester);
    final names = find.byKey(const ValueKey('note-names'));
    await tester.tap(names);
    await tester.pumpAndSettle();
    final notOne = find.descendant(of: find.byType(ManuscriptNames), matching: find.text('Not a character')).first;
    await tester.ensureVisible(notOne);
    await tester.pumpAndSettle();
    await tester.tap(notOne);
    await tester.pumpAndSettle();
    await tester.pump();
    expect(find.text('1 name in your pages'), findsOneWidget);
    expect(PageNote.names.said(1), '1 name in your pages');
  });
}
