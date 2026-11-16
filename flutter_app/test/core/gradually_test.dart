import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/gradually.dart';
import 'package:novel_builder/features/codex/widgets/encyclopedia.dart';
import 'package:novel_builder/features/timeline/widgets/chronicle.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/large_novel.dart';
import '../helpers/pump_app.dart';
import '../helpers/scroll_to_end.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  testWidgets('a screenful first, a handful each frame after, all in the end; all at once when asked', (tester) async {
    final control = GraduallyController();
    var built = 0;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Gradually(
          total: 50,
          controller: control,
          builder: (count) {
            built = count;
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    expect(built, Gradually.first);
    await tester.pump();
    expect(built, Gradually.first + Gradually.perFrame);
    var done = false;
    control.buildAll(then: () => done = true);
    await tester.pump();
    expect(built, 50);
    expect(done, isTrue, reason: 'told once they are laid out');
    await tester.pumpAndSettle();
    expect(built, 50, reason: 'never more than there are');

    // In nothing that scrolls, all of them in the end without asking.
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: Gradually(
          total: 50,
          builder: (count) {
            built = count;
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(built, 50);
  });

  testWidgets('in a page that scrolls: only as far as the reader can reach, and on as the page is scrolled', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(400, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final scroll = ScrollController();
    addTearDown(scroll.dispose);
    var built = 0;
    await tester.pumpWidget(
      Directionality(
        textDirection: TextDirection.ltr,
        child: SingleChildScrollView(
          controller: scroll,
          child: Column(
            children: [
              const SizedBox(height: 300),
              Gradually(
                total: 500,
                builder: (count) {
                  built = count;
                  return Column(children: [for (var i = 0; i < count; i++) const SizedBox(height: 100)]);
                },
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Within (1 + ahead) screens of the top, less the 300 above: (1,800 - 300) / 100 = 15 rows, and the handful that
    // took it past.
    final reach = ((600 * (1 + Gradually.ahead) - 300) / 100).ceil();
    expect(built, greaterThanOrEqualTo(reach));
    expect(built, lessThan(reach + Gradually.perFrame + 1), reason: 'it waits once the end is out of reach');
    final settled = built;
    await tester.pump(const Duration(seconds: 5));
    expect(built, settled, reason: 'and stays so while the page is still: no frames spent');
    expect(tester.binding.hasScheduledFrame, isFalse);

    // Scrolled to the end of what is built: on again, as far as can be reached from there.
    scroll.jumpTo(scroll.position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(built, greaterThan(settled));
    expect(built, lessThan(500));
    // Scrolled on and on: all of them.
    for (var i = 0; i < 100 && built < 500; i++) {
      scroll.jumpTo(scroll.position.maxScrollExtent);
      await tester.pumpAndSettle();
    }
    expect(built, 500);
    expect(scroll.position.maxScrollExtent, 300 + 500 * 100 - 600.0);
  });

  Future<void> large(WidgetTester tester, String at) async {
    final c = await pumpApp(tester, size: phone);
    final s = largeNovel();
    c.read(novelStoreProvider).putNovel(s);
    c.read(openNovelProvider.notifier).open(s.projectId);
    await tester.pumpAndSettle();
    c.read(routerProvider).go(at);
  }

  int articles(WidgetTester tester) => find
      .descendant(
        of: find.byType(Encyclopedia),
        matching: find.byWidgetPredicate((w) => w.runtimeType.toString() == '_Article'),
        skipOffstage: false,
      )
      .evaluate()
      .length;

  testWidgets('World on a large novel: the encyclopedia a screenful first, then only as far as can be reached; all six '
      'hundred as the page is scrolled to its end; a letter further down is gone to', (tester) async {
    await large(tester, '/organize/world');
    await tester.pump();
    expect(articles(tester), Gradually.first, reason: 'the page is there at once');
    await tester.pumpAndSettle();
    final settled = articles(tester);
    // On a phone the encyclopedia starts below the chart and the shelves: the first few already reach past what
    // can be reached.
    expect(settled, greaterThanOrEqualTo(Gradually.first));
    expect(settled, lessThan(100), reason: 'not six hundred, a frame at a time, for seconds');
    final scrolls = await scrollToEnd(tester, find.byType(Encyclopedia), done: () => articles(tester) == 600);
    expect(articles(tester), 600, reason: 'every entry that is not a character, as the page is scrolled');
    expect(scrolls, greaterThan(1), reason: 'built as they come within reach, not all at the first scroll');

    // A letter far down, jumped to before the rest are built: built, then gone to.
    await tester.pumpWidget(const SizedBox());
    await large(tester, '/organize/world');
    await tester.pump();
    // The last letter of the index, before the articles under it are built.
    final index = find.byWidgetPredicate((w) => w.runtimeType.toString() == '_LetterIndex');
    final letters = find.descendant(of: index, matching: find.byType(InkWell));
    final last = letters.at(letters.evaluate().length - 1);
    final letter = tester.widget<Text>(find.descendant(of: last, matching: find.byType(Text))).data!;
    expect(find.bySemanticsLabel('Letter $letter'), findsNothing, reason: 'not built yet');
    await tester.ensureVisible(last);
    await tester.pump();
    await tester.tap(last);
    await tester.pumpAndSettle();
    expect(articles(tester), 600);
    final heading = tester.getRect(find.bySemanticsLabel('Letter $letter'));
    expect(heading.top, inInclusiveRange(0, phone.height), reason: 'the page went to it');
    await tester.pump(const Duration(seconds: 3));
  }, timeout: const Timeout(Duration(minutes: 3)));

  testWidgets(
    'Plan on a large novel: its events a screenful first, then only as far as can be reached; all eight hundred as '
    'the page is scrolled to its end',
    (tester) async {
      await large(tester, '/plan');
      await tester.pump();
      int cards() => find
          .descendant(of: find.byType(Chronicle), matching: find.byType(InkWell), skipOffstage: false)
          .evaluate()
          .length;
      final first = cards();
      expect(first, lessThanOrEqualTo(Gradually.first * 2), reason: 'a screenful, not eight hundred');
      await tester.pumpAndSettle();
      expect(cards(), lessThan(150), reason: 'only as far as the reader can reach, not eight hundred');
      await scrollToEnd(tester, find.byType(Chronicle), done: () => cards() >= 800);
      expect(cards(), greaterThanOrEqualTo(800));
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
