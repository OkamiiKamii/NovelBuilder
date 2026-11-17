import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/toast.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

/// Somewhere inside the app's page, to say from.
BuildContext page(WidgetTester tester) => tester.element(find.byType(ToastHost).first);

/// Toasts (shadcn/ui's Toast, after Sonner): at the foot of the page, newest in front, three at most, gone on their
/// own or with a swipe; Undo does its work; outside the app's frame, a snack bar as before.
void main() {
  testWidgets('on a phone a toast stands above the bottom bar, goes on its own, and Undo does its work', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone);
    final novel = c.read(libraryServiceProvider).create({'title': 'Salt Court'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go('/organize');
    await tester.pumpAndSettle();
    var undone = 0;
    showToast(page(tester), 'Deleted “Chapter 3”.', actionLabel: 'Undo', onAction: () => undone++);
    await tester.pumpAndSettle();

    final message = find.text('Deleted “Chapter 3”.');
    expect(message, findsOneWidget);
    final bar = find.byType(NavigationBar);
    expect(tester.getRect(message).bottom, lessThan(tester.getRect(bar).top), reason: 'above the bottom bar');
    expect(find.byTooltip('Dismiss'), findsNothing, reason: 'on a phone: swiped away, or gone on its own');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(undone, 1);
    expect(message, findsNothing, reason: 'done with: gone');

    showToast(page(tester), 'Exported.');
    await tester.pumpAndSettle();
    expect(find.text('Exported.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Exported.'), findsOneWidget, reason: 'still there after 3 seconds');
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('Exported.'), findsNothing, reason: 'gone on its own after 4');
  });

  testWidgets('newest in front, three at most; swiped away; a failure marked', (tester) async {
    await pumpApp(tester, size: phone);
    for (final n in [1, 2, 3, 4]) {
      showToast(page(tester), 'Message $n');
      await tester.pump(const Duration(milliseconds: 50));
    }
    await tester.pumpAndSettle();
    expect(find.text('Message 1'), findsNothing, reason: 'the oldest goes for the fourth');
    for (final n in [2, 3, 4]) {
      expect(find.text('Message $n'), findsOneWidget);
    }
    final front = tester.getRect(find.text('Message 4'));
    final behind = tester.getRect(find.text('Message 3'));
    expect(behind.top, lessThan(front.top), reason: 'stacked a little above, behind');

    await tester.drag(find.text('Message 4'), const Offset(400, 0));
    await tester.pumpAndSettle();
    expect(find.text('Message 4'), findsNothing, reason: 'swiped away');
    expect(find.text('Message 3'), findsOneWidget, reason: 'the next comes to the front');

    Toasts.maybeOf(page(tester))!.dismissAll();
    await tester.pumpAndSettle();
    showToast(page(tester), 'It could not be restored.', error: true);
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.error_outline), findsOneWidget);
    expect(find.ancestor(of: find.text('It could not be restored.'), matching: find.byType(Semantics)), findsWidgets);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('on a computer a close button; with less motion asked for, in and out at once', (tester) async {
    await pumpApp(tester);
    tester.platformDispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pump();
    showToast(page(tester), 'Saved a copy.');
    await tester.pump();
    await tester.pump();
    expect(find.text('Saved a copy.'), findsOneWidget);
    expect(tester.hasRunningAnimations, isFalse, reason: 'no motion');
    await tester.tap(find.byTooltip('Dismiss'));
    await tester.pump();
    await tester.pump();
    expect(find.text('Saved a copy.'), findsNothing);
  });

  testWidgets('outside the app’s frame it is a snack bar, as before', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(onPressed: () => showToast(context, 'Copied.'), child: const Text('Copy')),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Copy'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(SnackBar, 'Copied.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
