// Every screen, with a real novel open, checked against Flutter's accessibility guidelines: buttons large enough to
// tap and named for screen readers, and text with enough contrast, in both themes; and on a phone at twice the text
// size, nothing cut off.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/app/theme/theme_choice.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';
import '../perf/large_project_test.dart' show screens;
import '../shared/domain/fixtures.dart';

Future<String?> _check(WidgetTester tester, AccessibilityGuideline guideline) async {
  final result = await guideline.evaluate(tester);
  return result.passed ? null : result.reason;
}

void main() {
  for (final theme in [ThemeChoice.light, ThemeChoice.dark]) {
    for (final size in [desktop, phone]) {
      testWidgets(
        'every screen meets the guidelines (${theme.name}, ${size.width.toInt()} wide)',
        (tester) async {
          final semantics = tester.ensureSemantics();
          final c = await pumpApp(tester, size: size);
          c.read(themeChoiceProvider.notifier).choose(theme);
          final snapshot = loadFixture('made-in-the-app');
          c.read(novelStoreProvider).putNovel(snapshot);
          c.read(openNovelProvider.notifier).open(snapshot.projectId);
          await tester.pumpAndSettle();
          final failures = <String>[];
          for (final path in screens) {
            c.read(routerProvider).go(path);
            await tester.pumpAndSettle();
            for (final (name, guideline) in [
              ('tap target', androidTapTargetGuideline),
              ('label', labeledTapTargetGuideline),
              ('contrast', textContrastGuideline),
            ]) {
              final reason = await _check(tester, guideline);
              if (reason != null) failures.add('$path [$name]\n$reason');
            }
          }
          expect(failures, isEmpty, reason: failures.join('\n\n'));
          await tester.pump(const Duration(seconds: 2));
          semantics.dispose();
        },
        timeout: const Timeout(Duration(minutes: 10)),
      );
    }
  }

  testWidgets('every screen fits a phone at twice the text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = await pumpApp(tester, size: phone);
    final snapshot = loadFixture('made-in-the-app');
    c.read(novelStoreProvider).putNovel(snapshot);
    c.read(openNovelProvider.notifier).open(snapshot.projectId);
    await tester.pumpAndSettle();
    final failures = <String>[];
    for (final path in screens) {
      c.read(routerProvider).go(path);
      await tester.pumpAndSettle();
      final error = tester.takeException();
      if (error != null) failures.add('$path: $error');
    }
    expect(failures, isEmpty, reason: failures.join('\n'));
    await tester.pump(const Duration(seconds: 2));
  }, timeout: const Timeout(Duration(minutes: 10)));
}
