import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../helpers/pump_app.dart';

void main() {
  testWidgets('ideas without a premise are counted, and given a line one card at a time', (tester) async {
    final c = await pumpApp(tester, size: phone);
    final library = c.read(libraryServiceProvider);
    final a = library.create({'title': 'Skill Creator', 'status': 'planning'});
    final b = library.create({'title': 'Watch Transformer', 'status': 'planning'});
    library.create({'title': 'Harrowmere', 'status': 'planning', 'synopsis': 'A town that forgets.'});
    await tester.pumpAndSettle();

    expect(find.text('2 ideas have no premise yet. Give each a line.'), findsOneWidget);
    await tester.ensureVisible(find.text('Begin'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Begin'));
    await tester.pumpAndSettle();
    expect(find.text('The idea file · 1 of 2'), findsOneWidget);
    final first = find.descendant(of: find.byType(Dialog), matching: find.text('Skill Creator')).evaluate().isNotEmpty
        ? a
        : b;
    final second = first == a ? b : a;
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.enterText(
      find.widgetWithText(TextField, 'Who wants what, and what stands in the way.'),
      'A boy who makes skills, and pays for each.',
    );
    await tester.pump();
    await tester.tap(find.text('Save & next'));
    await tester.pumpAndSettle();
    expect(find.text('The idea file · 2 of 2'), findsOneWidget);
    await tester.tap(find.text('Skip and finish'));
    await tester.pumpAndSettle();

    final novels = {for (final n in c.read(libraryProvider)) n.id: n};
    expect(novels[first.id]!.synopsis, 'A boy who makes skills, and pays for each.');
    expect(novels[second.id]!.synopsis, '', reason: 'skipped: untouched');
    expect(novels[first.id]!.title, first.title, reason: 'nothing else changes');
    expect(find.text('One idea has its line.'), findsOneWidget);
    expect(find.text('One idea has no premise yet. Give it a line.'), findsOneWidget);
  });
}
