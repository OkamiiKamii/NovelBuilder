import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/motion/arrive.dart';
import 'package:novel_builder/core/motion/motion.dart';

Widget row(List<String> names, {bool reduced = false}) => MaterialApp(
  home: MediaQuery(
    data: MediaQueryData(disableAnimations: reduced),
    child: Scaffold(
      body: SingleChildScrollView(
        child: Column(
          children: [for (final (i, n) in names.indexed) Arrive(key: ValueKey(n), index: i, child: Text(n))],
        ),
      ),
    ),
  ),
);

double opacityOf(WidgetTester tester, String text) => tester
    .widget<FadeTransition>(find.ancestor(of: find.text(text), matching: find.byType(FadeTransition)).first)
    .opacity
    .value;

/// Things shown for the first time arrive one after another (Motion's and anime.js's stagger); counts roll up.
void main() {
  testWidgets('one after another: the first in place while a later one is still on its way', (tester) async {
    await tester.pumpWidget(row(['A', 'B', 'C', 'D', 'E', 'F']));
    await tester.pump(const Duration(milliseconds: 200));
    expect(opacityOf(tester, 'A'), greaterThan(opacityOf(tester, 'F')));
    await tester.pumpAndSettle();
    expect(opacityOf(tester, 'F'), 1);

    // Built again with one more: those there stay; only the new one arrives.
    await tester.pumpWidget(row(['A', 'B', 'C', 'D', 'E', 'F', 'G']));
    await tester.pump();
    expect(opacityOf(tester, 'A'), 1);
    expect(opacityOf(tester, 'G'), lessThan(1));
    await tester.pumpAndSettle();
  });

  testWidgets('a long row keeps no one waiting: twelve beats at most', (tester) async {
    await tester.pumpWidget(row([for (var i = 0; i < 40; i++) 'Book $i']));
    await tester.pump();
    await tester.pump(Motion.stagger * 12 + Motion.medium + const Duration(milliseconds: 20));
    expect(opacityOf(tester, 'Book 39'), 1);
  });

  testWidgets('with less motion asked for, everything is there at once', (tester) async {
    await tester.pumpWidget(row(['A', 'B', 'C'], reduced: true));
    await tester.pump();
    expect(opacityOf(tester, 'C'), 1);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('a count rolls up to itself; a screen reader hears the number', (tester) async {
    Widget count(int n, {bool reduced = false}) => MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(disableAnimations: reduced),
        child: Scaffold(
          body: RollingNumber(value: n, format: (v) => '$v'),
        ),
      ),
    );
    await tester.pumpWidget(count(30));
    expect(find.bySemanticsLabel('30'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 150));
    final midway = int.parse(tester.widget<Text>(find.byType(Text)).data!);
    expect(midway, allOf(greaterThan(0), lessThan(30)));
    await tester.pumpAndSettle();
    expect(find.text('30'), findsOneWidget);

    await tester.pumpWidget(count(31));
    await tester.pumpAndSettle();
    expect(find.text('31'), findsOneWidget, reason: 'changed: rolled on from where it was');

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(count(19, reduced: true));
    await tester.pump();
    expect(find.text('19'), findsOneWidget, reason: 'at once');
  });
}
