import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/core/widgets/confirm_dialog.dart';
import 'package:novel_builder/core/widgets/hold_to_confirm.dart';

import '../helpers/hold.dart';

Future<List<int>> pumpButton(WidgetTester tester, {bool reader = false}) async {
  final done = <int>[];
  await tester.pumpWidget(
    MaterialApp(
      home: MediaQuery(
        data: MediaQueryData(accessibleNavigation: reader),
        child: Scaffold(
          body: Center(
            child: HoldToConfirm(label: 'Delete', onConfirmed: () => done.add(1)),
          ),
        ),
      ),
    ),
  );
  return done;
}

/// Hold to Confirm (dqnamo's Kitchen): what cannot be taken back is held, not pressed.
void main() {
  testWidgets('let go halfway: nothing is done, the fill drains, and it says to hold', (tester) async {
    final done = await pumpButton(tester);
    final gesture = await tester.startGesture(tester.getCenter(find.byType(HoldToConfirm)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 450));
    final fill = tester.widget<FractionallySizedBox>(find.byType(FractionallySizedBox));
    expect(fill.widthFactor, closeTo(0.5, 0.1), reason: 'half full at half the hold');
    await gesture.up();
    await tester.pumpAndSettle();
    expect(done, isEmpty);
    expect(tester.widget<FractionallySizedBox>(find.byType(FractionallySizedBox)).widthFactor, 0, reason: 'drained');
    expect(find.text('Hold to delete'), findsOneWidget);

    await tester.tap(find.byType(HoldToConfirm));
    await tester.pumpAndSettle();
    expect(done, isEmpty, reason: 'a press by reflex does nothing');
  });

  testWidgets('held to the end: done, once', (tester) async {
    final done = await pumpButton(tester);
    await holdToConfirm(tester, find.byType(HoldToConfirm));
    expect(done, [1]);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('from the keyboard: Enter held does it; Enter pressed and let go does not', (tester) async {
    final done = await pumpButton(tester);
    Focus.of(
      tester.element(find.descendant(of: find.byType(HoldToConfirm), matching: find.byType(Builder)).first),
    ).requestFocus();
    await tester.pump();
    await tester.sendKeyDownEvent(LogicalKeyboardKey.enter);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(done, isEmpty);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
    await tester.sendKeyUpEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(done, [1]);
  });

  testWidgets('for a screen reader, one press does it, and it is named', (tester) async {
    final done = await pumpButton(tester, reader: true);
    expect(find.bySemanticsLabel('Delete'), findsOneWidget);
    await tester.tap(find.byType(HoldToConfirm));
    await tester.pumpAndSettle();
    expect(done, [1]);
  });

  testWidgets('a destructive confirmation is held; Cancel keeps the focus; others are pressed', (tester) async {
    bool? answer;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => answer = await showConfirmDialog(
              context,
              title: 'Delete “Ash”?',
              message: 'A restore point is kept.',
              confirmLabel: 'Delete',
              destructive: true,
            ),
            child: const Text('Ask'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.byType(HoldToConfirm), findsOneWidget);
    expect(FocusManager.instance.primaryFocus?.context?.widget, isNot(isA<HoldToConfirm>()));
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(answer, isFalse, reason: 'Enter by reflex: Cancel');

    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await holdToConfirm(tester, find.byType(HoldToConfirm));
    expect(answer, isTrue);
  });
}
