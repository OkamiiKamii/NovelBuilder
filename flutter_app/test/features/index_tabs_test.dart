import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('an area\'s parts are index tabs: the one shown says so, and a press opens another', (tester) async {
    final c = await pumpApp(tester, location: '/organize');
    c.read(openNovelProvider.notifier).open(c.read(libraryServiceProvider).create({'title': 'Ash'}).id);
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(find.bySemanticsLabel('Characters').first),
      containsSemantics(isSelected: true, isButton: true),
    );
    await tester.tap(find.text('World'));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/world');
    expect(tester.getSemantics(find.bySemanticsLabel('World').first), containsSemantics(isSelected: true));
  });

  testWidgets('on a phone the tabs scroll sideways and keep the one shown in sight', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/plan/calendar');
    c.read(openNovelProvider.notifier).open(c.read(libraryServiceProvider).create({'title': 'Ash'}).id);
    c.read(routerProvider).go('/plan/calendar');
    await tester.pumpAndSettle();
    final tab = tester.getRect(find.text('Calendar').first);
    expect(tab.left, greaterThanOrEqualTo(0));
    expect(tab.right, lessThanOrEqualTo(phone.width), reason: 'the last tab, scrolled into sight');
    expect(tester.takeException(), isNull);
  });
}
