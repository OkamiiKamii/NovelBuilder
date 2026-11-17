import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/widgets/skeleton.dart';

Future<void> pumpSkeleton(WidgetTester tester, Widget skeleton, {bool reduced = false, double scale = 1}) =>
    tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced, textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: Center(child: SizedBox(width: 360, child: skeleton)),
          ),
        ),
      ),
    );

/// A Skeleton (shadcn/ui): where the words will stand, while the book is read.
void main() {
  testWidgets('it says what is being done, and a light passes over it', (tester) async {
    await pumpSkeleton(tester, const Skeleton(label: 'Reading the book…'));
    expect(find.bySemanticsLabel('Reading the book…'), findsOneWidget);
    expect(find.text('Reading the book…'), findsNothing, reason: 'said, not written, unless asked');
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.hasRunningAnimations, isTrue);
  });

  testWidgets('with less motion asked for, the light holds still', (tester) async {
    await pumpSkeleton(tester, const Skeleton(), reduced: true);
    await tester.pump(const Duration(milliseconds: 300));
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('the short one fits the card it stands in; a caption reads at twice the text size', (tester) async {
    await pumpSkeleton(
      tester,
      const SizedBox(height: 120, child: Skeleton(label: 'Reading the book…', lines: 2, heading: false)),
    );
    expect(tester.takeException(), isNull);
    await pumpSkeleton(tester, const Skeleton(caption: true), scale: 2);
    expect(find.text('Loading…'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
