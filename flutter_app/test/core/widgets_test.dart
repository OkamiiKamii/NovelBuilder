import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/theme/app_theme.dart';
import 'package:novel_builder/core/layout/breakpoints.dart';
import 'package:novel_builder/core/widgets/confirm_dialog.dart';
import 'package:novel_builder/core/widgets/detail_panel.dart';
import 'package:novel_builder/core/widgets/states.dart';

Future<void> _pump(WidgetTester tester, Widget child, {Size size = const Size(1200, 800)}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(body: child),
    ),
  );
}

void main() {
  test('window size classes switch at 600 and 1000', () {
    expect(WindowSize.ofWidth(599), WindowSize.compact);
    expect(WindowSize.ofWidth(600), WindowSize.medium);
    expect(WindowSize.ofWidth(999), WindowSize.medium);
    expect(WindowSize.ofWidth(1000), WindowSize.expanded);
  });

  group('states', () {
    testWidgets('error state shows the message and retries', (tester) async {
      var retried = 0;
      await _pump(tester, ErrorState(message: 'Could not read the file.', onRetry: () => retried++));
      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Could not read the file.'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);
    });

    testWidgets('no-results state names the query and clears it', (tester) async {
      var cleared = false;
      await _pump(tester, NoResultsState(query: 'Mira', onClear: () => cleared = true));
      expect(find.text('Nothing matches “Mira”'), findsOneWidget);
      await tester.tap(find.text('Clear search and filters'));
      expect(cleared, isTrue);
    });

    testWidgets('AsyncValueView shows loading, error, empty and data', (tester) async {
      Widget view(AsyncValue<List<String>> value) => AsyncValueView<List<String>>(
        value: value,
        isEmpty: (list) => list.isEmpty,
        empty: const EmptyState(icon: Icons.inbox, title: 'Nothing yet'),
        data: (list) => Text(list.join(',')),
      );
      await _pump(tester, view(const AsyncLoading()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await _pump(tester, view(AsyncError(Exception('Disk full'), StackTrace.empty)));
      expect(find.text('Disk full'), findsOneWidget);
      await _pump(tester, view(const AsyncData([])));
      expect(find.text('Nothing yet'), findsOneWidget);
      await _pump(tester, view(const AsyncData(['a', 'b'])));
      expect(find.text('a,b'), findsOneWidget);
    });

    testWidgets('an unexpected non-Exception error is not shown raw', (tester) async {
      await _pump(
        tester,
        AsyncValueView<int>(
          value: AsyncError(StateError('internal detail'), StackTrace.empty),
          data: (n) => Text('$n'),
        ),
      );
      expect(find.textContaining('internal detail'), findsNothing);
      expect(find.text('An unexpected problem occurred.'), findsOneWidget);
    });
  });

  group('confirm dialog', () {
    Future<Future<bool>> open(WidgetTester tester, {bool destructive = false}) async {
      late Future<bool> result;
      await _pump(
        tester,
        Builder(
          builder: (context) => TextButton(
            onPressed: () => result = showConfirmDialog(
              context,
              title: 'Delete chapter?',
              message: 'It moves to the bin.',
              confirmLabel: 'Delete',
              destructive: destructive,
            ),
            child: const Text('open'),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      return result;
    }

    testWidgets('resolves true only on the confirm button', (tester) async {
      final result = await open(tester);
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(await result, isTrue);
    });

    testWidgets('Cancel and Escape resolve false', (tester) async {
      var result = await open(tester);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(await result, isFalse);

      result = await open(tester);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(await result, isFalse);
    });

    testWidgets('a destructive dialog puts focus on Cancel, so Enter does not delete', (tester) async {
      final result = await open(tester, destructive: true);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(await result, isFalse);
    });
  });

  group('detail panel', () {
    testWidgets('sits beside the content on wide screens and closes with Escape', (tester) async {
      var closed = false;
      await _pump(
        tester,
        DetailPanelLayout(
          main: const Text('list'),
          panelTitle: 'Mira',
          onClose: () => closed = true,
          panel: const TextField(autofocus: true),
        ),
      );
      await tester.pump();
      expect(find.text('list'), findsOneWidget);
      expect(find.text('Mira'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      expect(closed, isTrue);
    });

    testWidgets('is left out on phones, where details open as a sheet instead', (tester) async {
      await _pump(
        tester,
        const DetailPanelLayout(main: Text('list'), panelTitle: 'Mira', panel: Text('details')),
        size: const Size(390, 844),
      );
      expect(find.text('list'), findsOneWidget);
      expect(find.text('details'), findsNothing);

      await _pump(
        tester,
        Builder(
          builder: (context) => TextButton(
            onPressed: () => unawaited(showDetailSheet(context, title: 'Mira', child: const Text('details'))),
            child: const Text('open'),
          ),
        ),
        size: const Size(390, 844),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('details'), findsOneWidget);
    });
  });
}
