import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/motion/motion.dart';
import 'package:novel_builder/core/widgets/save_status_indicator.dart';
import 'package:novel_builder/shared/data/autosave.dart';
import 'package:novel_builder/shared/data/providers.dart';

/// A save status set by the test.
class _Set extends SaveStatusNotifier {
  @override
  SaveStatus build() => const SaveStatus(SaveState.saved);
  void set(SaveStatus s) => state = s;
}

Future<ProviderContainer> pumpStatus(WidgetTester tester, {bool compact = false, bool reduced = false}) async {
  final c = ProviderContainer(overrides: [saveStatusProvider.overrideWith(_Set.new)]);
  addTearDown(c.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: c,
      child: MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced),
          child: Scaffold(
            body: Center(child: SaveStatusIndicator(compact: compact)),
          ),
        ),
      ),
    ),
  );
  return c;
}

void set(ProviderContainer c, SaveState s, {String? error}) =>
    (c.read(saveStatusProvider.notifier) as _Set).set(SaveStatus(s, error: error));

/// The save status as a Dynamic Button (dqnamo's Kitchen): its words change in place, and the pill settles to their
/// width on a spring, at once when the device asks for less motion.
void main() {
  test(
    'a spring curve runs from 0 to 1 and comes to rest at 1; the arriving one overshoots, the settling one barely',
    () {
      expect(Motion.settle.transform(0), 0);
      expect(Motion.settle.transform(1), 1);
      double most(Curve c) => [for (var i = 0; i <= 200; i++) c.transform(i / 200)].reduce((a, b) => a > b ? a : b);
      expect(most(Motion.arrive), greaterThan(1.02), reason: 'lands with a little give');
      expect(most(Motion.settle), lessThan(1.05));
      expect(Motion.settle.transform(0.98), closeTo(1, 0.01), reason: 'at rest by the end');
    },
  );

  testWidgets('the words change in place, and the pill settles to their width, not at once', (tester) async {
    final c = await pumpStatus(tester);
    final pill = find.byType(AnimatedSize);
    final savedWidth = tester.getSize(pill).width;
    expect(find.text('Saved on this device'), findsOneWidget);

    set(c, SaveState.saving);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 60));
    expect(find.text('Saving…'), findsOneWidget);
    final between = tester.getSize(pill).width;
    await tester.pumpAndSettle();
    final savingWidth = tester.getSize(pill).width;
    expect(savingWidth, lessThan(savedWidth), reason: '“Saving…” is shorter');
    expect(between, allOf(lessThan(savedWidth), greaterThan(savingWidth)), reason: 'on its way, not jumped');
    expect(find.text('Saved on this device'), findsNothing, reason: 'the old words gone once it settles');
    expect(tester.takeException(), isNull);
  });

  testWidgets('with less motion asked for, the change is shown at once', (tester) async {
    final c = await pumpStatus(tester, reduced: true);
    set(c, SaveState.saving);
    await tester.pump();
    await tester.pump();
    expect(find.text('Saving…'), findsOneWidget);
    expect(find.text('Saved on this device'), findsNothing);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('a failed save says so, with why, and Retry; compact shows only the sign until then', (tester) async {
    final c = await pumpStatus(tester, compact: true);
    expect(find.text('Saved on this device'), findsNothing, reason: 'compact: the sign alone');
    expect(find.byIcon(Icons.cloud_done_outlined), findsOneWidget);
    set(c, SaveState.failed, error: 'the disk is full');
    await tester.pumpAndSettle();
    expect(find.text('Not saved'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Not saved: the disk is full')), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
