import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('a calendar of the novel’s own begins from a ready-made one, in one press, then saved', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/plan/calendar');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill Creator'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('Thirteen moons'), findsNothing, reason: 'only for a calendar of its own');

    await tester.tap(find.text('A calendar of this novel’s own'));
    await tester.pumpAndSettle();
    expect(find.text('364 days in 13 months'), findsOneWidget);
    await tester.tap(find.text('Thirteen moons'));
    await tester.pumpAndSettle();
    expect(find.text('Frostmoon'), findsWidgets, reason: 'every month filled in');

    final save = find.widgetWithText(FilledButton, 'Save calendar');
    await tester.ensureVisible(save);
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    final row = c.read(novelStoreProvider).rowsIn(novel, 'storyCalendars').single;
    expect(row['kind'], 'custom');
    expect(row['name'], 'The Moon Reckoning');
    expect(maps(row['months']).length, 13);
    expect(tester.takeException(), isNull);
  });
}
