import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/progress/widgets/bars.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/large_novel.dart';
import '../../helpers/pump_app.dart';

/// The chapter strips and the column chart are painted, not built a box per chapter: a long book's Analytics page is
/// there sooner, a chapter in hundreds still shows on its strip, and every column is still said and chosen.
void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  final theme = ThemeData();
  final on = theme.colorScheme.primary;
  final off = theme.colorScheme.outlineVariant;

  Future<void> show(WidgetTester tester, Widget child, {double width = 300}) => tester.pumpWidget(
    MaterialApp(
      theme: theme,
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(width: width, child: child),
        ),
      ),
    ),
  );

  RenderObject strip(WidgetTester tester) =>
      tester.renderObject(find.descendant(of: find.byType(ChapterStrip), matching: find.byType(CustomPaint)));

  int elementsIn(Element root) {
    var n = 0;
    void visit(Element e) {
      n++;
      e.visitChildren(visit);
    }

    root.visitChildren(visit);
    return n;
  }

  int elementsUnder(Finder f) => elementsIn(f.evaluate().single);

  testWidgets('a short book: a cell per chapter with a gap after each, filled where they are', (tester) async {
    await show(tester, const ChapterStrip(total: 10, chapters: [2, 3], label: 'Mira appears in chapters 2–3'));
    expect(
      strip(tester),
      paints
        ..rect(rect: const Rect.fromLTWH(0, 0, 29, 12), color: off)
        ..rect(rect: const Rect.fromLTWH(30, 0, 29, 12), color: on)
        ..rect(rect: const Rect.fromLTWH(60, 0, 29, 12), color: on)
        ..rect(rect: const Rect.fromLTWH(90, 0, 29, 12), color: off),
    );
    expect(find.bySemanticsLabel('Mira appears in chapters 2–3'), findsOneWidget, reason: 'said as one picture');
  });

  testWidgets('a long book: one chapter in six hundred is still seen, and runs are one mark', (tester) async {
    await show(
      tester,
      const ChapterStrip(total: 600, chapters: [300, 598, 599, 600], label: 'Kai appears in chapters 300, 598–600'),
    );
    // 0.5 wide a chapter: the track whole, chapter 300 at least two wide, the last three as one run to the end.
    expect(
      strip(tester),
      paints
        ..rect(rect: const Rect.fromLTWH(0, 0, 300, 12), color: off)
        ..rect(rect: const Rect.fromLTWH(149.5, 0, 2, 12), color: on)
        ..rect(rect: const Rect.fromLTWH(298, 0, 2, 12), color: on),
    );
    expect(elementsUnder(find.byType(ChapterStrip)), lessThan(10), reason: 'not a box per chapter');
  });

  testWidgets('right to left: the strip reads from the right', (tester) async {
    await show(
      tester,
      const Directionality(
        textDirection: TextDirection.rtl,
        child: ChapterStrip(total: 600, chapters: [1], label: 'In chapter 1'),
      ),
    );
    expect(
      strip(tester),
      paints
        ..rect(color: off)
        ..rect(rect: const Rect.fromLTWH(298, 0, 2, 12), color: on),
    );
  });

  final bars = [
    for (var i = 1; i <= 200; i++)
      BarDatum(key: 'c$i', short: '$i', label: 'Chapter $i', value: i == 120 ? 5000 : 1000 + i, selectable: i == 3),
  ];

  testWidgets('the column chart: painted; every column said to a screen reader, pressed there when wide enough', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final chosen = <String>[];
    await show(
      tester,
      ColumnChart(
        label: 'Words per chapter',
        bars: bars,
        words: (n) => '$n words',
        labelEvery: 20,
        onSelect: (b) => chosen.add(b.key),
      ),
    );
    final chart = find.byType(ColumnChart);
    expect(
      find.descendant(of: chart, matching: find.byType(InkWell)),
      findsNothing,
      reason: 'no widget per column',
    );
    expect(elementsUnder(chart), lessThan(200), reason: 'two hundred columns, a handful of widgets');

    // Two hundred columns, 12 px each: every one a node of its own, said in full; too narrow to be a button (their
    // numbers are in the table under the chart).
    expect(find.semantics.byLabel('Chapter 1: 1001 words'), findsOne);
    expect(find.semantics.byLabel('Chapter 200: 1200 words'), findsOne);
    expect(
      find.semantics
          .byLabel('Chapter 3: 1003 words')
          .evaluate()
          .single
          .getSemanticsData()
          .hasAction(SemanticsAction.tap),
      isFalse,
    );
    // The highest carries its number.
    expect(find.text('5K'), findsWidgets);

    // Five columns, 52 px each: buttons, pressed as by a tap.
    await show(
      tester,
      ColumnChart(
        label: 'Words',
        bars: bars.take(5).toList(),
        words: (n) => '$n words',
        onSelect: (b) => chosen.add(b.key),
      ),
    );
    final third = find.semantics.byLabel('Chapter 3: 1003 words');
    expect(third.evaluate().single.getSemanticsData().flagsCollection.isButton, isTrue);
    tester.semantics.tap(third);
    await tester.pump();
    expect(chosen, ['c3'], reason: 'a record chosen as by a tap');
    expect(find.text('Chapter 3: 1003 words'), findsOneWidget, reason: 'and said under the chart');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });

  testWidgets('the column chart: a tap on a column tells it; one that is not a record is not chosen', (tester) async {
    final chosen = <String>[];
    await show(
      tester,
      ColumnChart(
        label: 'Words',
        bars: bars.take(10).toList(),
        words: (n) => '$n words',
        onSelect: (b) => chosen.add(b.key),
      ),
    );
    // Ten columns over the 260 beside the axis: 26 each; the fifth's middle.
    final plot = tester.getTopLeft(
      find.descendant(of: find.byType(ColumnChart), matching: find.byType(CustomPaint)).first,
    );
    await tester.tapAt(plot + const Offset(26 * 4 + 13, 80));
    await tester.pump();
    expect(find.text('Chapter 5: 1005 words'), findsOneWidget);
    expect(chosen, isEmpty, reason: 'chapter 5 is not a record that can be chosen');
    await tester.tapAt(plot + const Offset(26 * 2 + 13, 80));
    await tester.pump();
    expect(find.text('Chapter 3: 1003 words'), findsOneWidget);
    expect(chosen, ['c3']);
  });

  testWidgets('the column chart: one stop for the keyboard, the arrows walk the columns, Enter chooses', (
    tester,
  ) async {
    final chosen = <String>[];
    await show(
      tester,
      Column(
        children: [
          ColumnChart(
            label: 'Words',
            bars: bars.take(10).toList(),
            words: (n) => '$n words',
            onSelect: (b) => chosen.add(b.key),
          ),
          TextButton(onPressed: () {}, child: const Text('After the chart')),
        ],
      ),
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowLeft);
    await tester.pump();
    expect(find.text('Chapter 10: 1010 words'), findsOneWidget, reason: 'the newest first');
    await tester.sendKeyEvent(LogicalKeyboardKey.home);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    expect(find.text('Chapter 3: 1003 words'), findsOneWidget);
    expect(chosen, isEmpty, reason: 'walking only tells');
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(chosen, ['c3']);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(
      FocusManager.instance.primaryFocus?.context?.findAncestorWidgetOfExactType<ColumnChart>(),
      isNull,
      reason: 'one Tab leaves the whole chart, not one column',
    );
  });

  testWidgets(
    'Analytics on a long book (300 chapters, 400 characters, 40 threads): strips and chart a few widgets each, and '
    'every strip shows its chapters',
    (tester) async {
      final c = await pumpApp(tester, size: phone);
      final big = largeNovel();
      // One character linked in three chapters far apart (the generated text names nobody by their full name).
      final someone = big.rows('loreEntries').firstWhere((e) => e['category'] == 'character')['id']! as String;
      final chapterRows = [for (final r in big.rows('chapters')) r['kind'] == 'chapter' ? r : null].nonNulls.toList();
      final linked = {
        for (final k in [4, 150, 290]) chapterRows[k]['id'],
      };
      final s = big.withRows('chapters', [
        for (final r in big.rows('chapters'))
          linked.contains(r['id'])
              ? {
                  ...r,
                  'mentions': [someone],
                }
              : r,
      ]);
      c.read(novelStoreProvider).putNovel(s);
      c.read(openNovelProvider.notifier).open(s.projectId);
      await tester.pumpAndSettle();
      c.read(routerProvider).go('/progress/analytics');
      await tester.pumpAndSettle();
      final strips = find.byType(ChapterStrip, skipOffstage: false);
      expect(strips.evaluate().length, greaterThan(40), reason: 'twelve characters and forty threads');
      for (final e in strips.evaluate()) {
        expect(elementsIn(e), lessThan(10), reason: 'a strip of three hundred chapters, not three hundred boxes');
      }
      final chart = find.byType(ColumnChart, skipOffstage: false);
      expect(
        find.descendant(of: chart, matching: find.byType(InkWell), skipOffstage: false),
        findsNothing,
        reason: 'three hundred chapters, no widget per column',
      );
      // The strip with the most chapters (a thread's, or a character's) has them painted, not lost in the gaps.
      final widest = strips.evaluate().reduce(
        (a, b) => (b.widget as ChapterStrip).chapters.length > (a.widget as ChapterStrip).chapters.length ? b : a,
      );
      final most = widest.widget as ChapterStrip;
      expect(most.chapters, hasLength(3), reason: 'the character linked in three chapters');
      final painter =
          tester
                  .widget<CustomPaint>(
                    find.descendant(
                      of: find.byElementPredicate((e) => e == widest, skipOffstage: false),
                      matching: find.byType(CustomPaint),
                      skipOffstage: false,
                    ),
                  )
                  .painter!
              as StripPainter;
      expect(painter.total, chapterRows.length);
      expect(painter.filled, most.chapters.toSet());
      await tester.pump(const Duration(seconds: 3));
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}
