import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/library/idea_jot.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';

import '../helpers/pump_app.dart';

void main() {
  test('a jotted line is a title, and a premise after a dash or a colon', () {
    expect(readJot('  The Salt Court  '), (title: 'The Salt Court', premise: ''));
    expect(readJot('The Salt Court — a queen who cannot lie'), (
      title: 'The Salt Court',
      premise: 'a queen who cannot lie',
    ));
    expect(readJot('Harrowmere: a town that forgets'), (title: 'Harrowmere', premise: 'a town that forgets'));
    expect(readJot('Half-Blood Prince'), (title: 'Half-Blood Prince', premise: ''), reason: 'a hyphen in a word stays');
  });

  testWidgets('an idea jotted on the shelf stands there at once, as an idea, with nothing opened', (tester) async {
    final c = await pumpApp(tester, size: phone);
    c.read(libraryServiceProvider).create({'title': 'Skill Creator', 'status': 'planning'});
    await tester.pumpAndSettle();
    final field = find.widgetWithText(TextField, 'Jot an idea');
    await tester.ensureVisible(field);
    await tester.pumpAndSettle();
    await tester.enterText(field, 'The Salt Court — a queen who cannot lie');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    final made = c.read(libraryProvider).firstWhere((n) => n.title == 'The Salt Court');
    expect(made.status, NovelStatus.planning);
    expect(made.synopsis, 'a queen who cannot lie');
    expect(currentLocation(c), '/', reason: 'still the Library');
    expect(find.text('“The Salt Court” is on the Ideas shelf.'), findsOneWidget);
    expect(tester.widget<TextField>(field).controller!.text, isEmpty, reason: 'ready for the next');
  });

  testWidgets('with no ideas yet, the Ideas shelf still offers the line', (tester) async {
    final c = await pumpApp(tester, size: phone);
    c.read(libraryServiceProvider).create({'title': 'Being written', 'status': 'drafting'});
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Jot an idea'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
