import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/in_view_rows.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../helpers/large_novel.dart';
import '../helpers/pump_app.dart';

/// Rows built as they come into view, in a page that scrolls as a whole: the page as long as ever, only the rows near
/// what is seen built, and those coming into view built as it scrolls (and after it stops).
void main() {
  Future<List<int>> page(WidgetTester tester, {bool scrolls = true, int count = 1000}) async {
    final tapped = <int>[];
    final rows = InViewRows(
      count: count,
      height: 40,
      builder: (context, i) => InkWell(onTap: () => tapped.add(i), child: Text('Row $i')),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: scrolls
              ? SingleChildScrollView(
                  child: Column(
                    children: [
                      const SizedBox(height: 900, child: Text('Above')),
                      rows,
                      const Text('Below'),
                    ],
                  ),
                )
              : rows,
        ),
      ),
    );
    await tester.pump();
    return tapped;
  }

  int built() => find.textContaining(RegExp(r'^Row \d+$'), skipOffstage: false).evaluate().length;

  testWidgets('only the rows near what is seen are built; the page is as long as all of them', (tester) async {
    await page(tester);
    expect(tester.getSize(find.byType(InViewRows)).height, 40000, reason: 'room for every row');
    expect(built(), lessThan(60), reason: 'near the screen, not a thousand');
    expect(find.text('Row 0', skipOffstage: false), findsOneWidget);
    expect(find.text('Row 999', skipOffstage: false), findsNothing);
  });

  testWidgets('scrolled, the rows coming into view are built and those far from it let go; a row in view is pressed', (
    tester,
  ) async {
    final tapped = await page(tester);
    // A drag, then nothing more: the rows are where the page stopped, not one step behind.
    await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -1500));
    await tester.pumpAndSettle();
    expect(find.text('Row 20'), findsOneWidget, reason: 'in view');
    await tester.tap(find.text('Row 20'));
    expect(tapped, [20]);

    final position = tester.state<ScrollableState>(find.byType(Scrollable)).position;
    position.jumpTo(900 + 40.0 * 700);
    await tester.pumpAndSettle();
    expect(find.text('Row 700'), findsOneWidget);
    expect(find.text('Row 0', skipOffstage: false), findsNothing, reason: 'far out of view: let go');
    expect(built(), lessThan(80));

    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(find.text('Row 999'), findsOneWidget);
    expect(find.text('Below'), findsOneWidget, reason: 'what is under the rows is where it was');
  });

  testWidgets('in nothing that scrolls, every row is built', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 2000));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await page(tester, scrolls: false, count: 30);
    expect(built(), 30);
  });

  Future<void> large(WidgetTester tester, String at) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await pumpApp(tester, size: phone);
    final s = largeNovel();
    c.read(novelStoreProvider).putNovel(s);
    c.read(openNovelProvider.notifier).open(s.projectId);
    await tester.pumpAndSettle();
    c.read(routerProvider).go(at);
    await tester.pumpAndSettle();
  }

  int elements(WidgetTester tester) {
    var n = 0;
    void visit(Element e) {
      n++;
      e.visitChildren(visit);
    }

    tester.binding.rootElement!.visitChildren(visit);
    return n;
  }

  testWidgets(
    'Order on a long book: the chapters beside the events built as they come into view',
    (tester) async {
      await large(tester, '/visualize/order');
      expect(elements(tester), lessThan(4000), reason: 'was 26,147 with every chapter and event built');
      expect(find.text('Ch 250: Chapter 250', skipOffstage: false), findsNothing);
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first).position;
      scroll.jumpTo(scroll.maxScrollExtent / 2);
      await tester.pumpAndSettle();
      final inView = find.textContaining(RegExp(r'^Event \d+: '));
      expect(
        inView,
        findsWidgets,
        reason: 'the events halfway down, where the page is (the chapters end sooner: 300 beside 800)',
      );
      await tester.tap(inView.first);
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );

  testWidgets(
    'Records by kind on a long book: its table a row a record, built as they come into view',
    (tester) async {
      await large(tester, '/visualize/kinds');
      expect(elements(tester), lessThan(5000), reason: 'was 27,682 with every row of the table built');
      expect(find.text('Name'), findsOneWidget, reason: 'the table and its heading');
      final rows = find.byType(InViewRows);
      expect(rows, findsOneWidget);
      final count = tester.widget<InViewRows>(rows).count;
      expect(count, greaterThan(100));
      final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first).position;
      scroll.jumpTo(scroll.maxScrollExtent);
      await tester.pumpAndSettle();
      // The last record is in view at the end, and its name picks it.
      final names = find.descendant(of: rows, matching: find.byType(TextButton));
      expect(names, findsWidgets);
      await tester.tap(names.last);
      await tester.pumpAndSettle();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
