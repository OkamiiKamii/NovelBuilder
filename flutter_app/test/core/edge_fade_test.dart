import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/widgets/edge_fade.dart';

Future<void> pumpList(WidgetTester tester, int rows, {Axis axis = Axis.vertical}) => tester.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: 300,
          height: 300,
          child: EdgeFade(
            child: ListView.builder(
              scrollDirection: axis,
              itemCount: rows,
              itemBuilder: (_, i) => SizedBox(width: 60, height: 60, child: Text('Row $i')),
            ),
          ),
        ),
      ),
    ),
  ),
);

({bool before, bool after}) fading(WidgetTester tester) => tester.state<EdgeFadeState>(find.byType(EdgeFade)).fading;

/// A Scroll Fade List (dqnamo's Kitchen): an edge fades where more of the list lies beyond it, and only there.
void main() {
  testWidgets('a list that fits fades at neither edge', (tester) async {
    await pumpList(tester, 3);
    await tester.pumpAndSettle();
    expect(fading(tester), (before: false, after: false));
  });

  testWidgets('a long list fades below at the top, at both edges between, and above at the end', (tester) async {
    await pumpList(tester, 40);
    await tester.pumpAndSettle();
    expect(fading(tester), (before: false, after: true), reason: 'at the top: more below');

    await tester.drag(find.byType(ListView), const Offset(0, -400));
    await tester.pumpAndSettle();
    expect(fading(tester), (before: true, after: true), reason: 'between: more either way');

    await tester.fling(find.byType(ListView), const Offset(0, -10000), 5000);
    await tester.pumpAndSettle();
    expect(fading(tester), (before: true, after: false), reason: 'at the end: more above only');
    expect(find.text('Row 39'), findsOneWidget, reason: 'the list scrolls as it did');
    expect(tester.takeException(), isNull);
  });

  testWidgets('a sideways list fades sideways', (tester) async {
    await pumpList(tester, 40, axis: Axis.horizontal);
    await tester.pumpAndSettle();
    expect(fading(tester), (before: false, after: true));
    await tester.drag(find.byType(ListView), const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(fading(tester), (before: true, after: true));
  });
}
