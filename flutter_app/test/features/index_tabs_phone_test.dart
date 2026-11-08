import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  for (final scale in [1.0, 2.0]) {
    testWidgets('on a phone the four Organize tabs share the width, every one in sight (text ×$scale)', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final c = await pumpApp(tester, size: phone, location: '/organize');
      c.read(openNovelProvider.notifier).open(c.read(libraryServiceProvider).create({'title': 'A'}).id);
      await tester.pumpAndSettle();
      final views = find.bySemanticsLabel('Views');
      for (final name in ['Characters', 'World', 'Systems', 'Modules']) {
        final tab = find.descendant(of: views, matching: find.bySemanticsLabel(name));
        expect(tab, findsOneWidget);
        final r = tester.getRect(tab);
        expect(r.left, greaterThanOrEqualTo(0));
        expect(r.right, lessThanOrEqualTo(phone.width), reason: '$name is in sight');
      }
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await tester.tap(find.descendant(of: views, matching: find.bySemanticsLabel('Modules')));
      await tester.pumpAndSettle();
      expect(currentLocation(c), '/organize/modules');
      expect(tester.takeException(), isNull);
    });
  }
}
