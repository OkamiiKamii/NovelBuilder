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

  testWidgets(
    'World on a large novel: the encyclopedia a screenful first, all six hundred after; a letter further down '
    'is gone to',
    (tester) async {
      await large(tester, '/organize/world');
      await tester.pump();
      expect(articles(tester), Gradually.first, reason: 'the page is there at once');
      await tester.pumpAndSettle();
      expect(articles(tester), 600, reason: 'every entry that is not a character, in the end');

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
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );

  testWidgets(
    'Plan on a large novel: its events a screenful first, all eight hundred after',
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
      expect(cards(), greaterThanOrEqualTo(800));
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
