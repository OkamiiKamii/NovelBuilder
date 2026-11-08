import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('an empty thread list asks the story’s questions; each answered becomes a thread of its kind', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/plan/threads');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill Creator'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();
    expect(find.text('The questions your story asks'), findsOneWidget);
    final ask = find.ancestor(of: find.text('Ask them'), matching: find.bySubtype<ButtonStyleButton>());
    expect(tester.widget<ButtonStyleButton>(ask).onPressed, isNull);

    await tester.enterText(
      find.widgetWithText(TextField, 'Will Ren master his deadly skill?'),
      'Can Ren survive the SSS rank',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Who sealed the SSS rank, and why?'),
      'Who made the first skill?',
    );
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await tester.ensureVisible(ask);
    await tester.pumpAndSettle();
    await tester.tap(ask);
    await tester.pumpAndSettle();

    final threads = {
      for (final r in c.read(novelStoreProvider).rowsIn(novel, 'plotThreads')) r['title']: r['category'],
    };
    expect(threads, {'Can Ren survive the SSS rank?': 'main', 'Who made the first skill?': 'mystery'});
    expect(find.textContaining('Your 2 threads are ready'), findsOneWidget);
    expect(find.text('The questions your story asks'), findsNothing);
  });
}
