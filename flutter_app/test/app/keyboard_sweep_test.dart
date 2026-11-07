// Every screen can be gone through with the keyboard: Tab always moves on to another control, and never gets stuck in
// one (a drawing, a list, a field) that keeps it.
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';
import '../perf/large_project_test.dart' show screens;
import '../shared/domain/fixtures.dart';

void main() {
  testWidgets('Tab moves through every screen without getting stuck', (tester) async {
    final c = await pumpApp(tester);
    final snapshot = loadFixture('made-in-the-app');
    c.read(novelStoreProvider).putNovel(snapshot);
    c.read(openNovelProvider.notifier).open(snapshot.projectId);
    await tester.pumpAndSettle();
    final stuck = <String>[];
    final reached = <String, int>{};
    for (final path in screens) {
      c.read(routerProvider).go(path);
      await tester.pumpAndSettle();
      final seen = <FocusNode>{};
      FocusNode? last;
      for (var i = 0; i < 80; i++) {
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        final now = FocusManager.instance.primaryFocus;
        if (now != null && now == last) {
          stuck.add('$path: Tab stays on ${now.debugLabel ?? now.context?.widget.runtimeType}');
          break;
        }
        if (now != null && !seen.add(now)) break; // Back where it started: every control has been reached.
        last = now;
      }
      reached[path] = seen.length;
    }
    expect(stuck, isEmpty, reason: stuck.join('\n'));
    // Every screen has controls the keyboard reaches.
    expect(
      [
        for (final MapEntry(:key, :value) in reached.entries)
          if (value < 3) key,
      ],
      isEmpty,
      reason: '$reached',
    );
    await tester.pump(const Duration(seconds: 2));
  }, timeout: const Timeout(Duration(minutes: 10)));
}
