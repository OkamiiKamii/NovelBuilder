import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/character_actions.dart' show characterPath;
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/journal_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/characters/journal.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/page_action.dart';
import '../../helpers/pump_app.dart';

void main() {
  setUp(() => BlinkController.indeterminateAnimationsEnabled = false);
  tearDown(() => BlinkController.indeterminateAnimationsEnabled = true);

  Future<({ProviderContainer c, String mark})> open(WidgetTester tester, {Size size = const Size(1200, 2400)}) async {
    final c = await pumpApp(tester, size: size, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'The Doorwalker'}).id;
    final mark = c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'Mark')).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(routerProvider).go(characterPath(mark));
    await tester.pumpAndSettle();
    await pressPageAction(tester, 'Mark’s journal');
    await tester.pumpAndSettle();
    return (c: c, mark: mark);
  }

  List<({String title, String content, List<String> tags})> pages(ProviderContainer c, String mark) => [
    for (final n in c.read(castProvider)!.notes(mark)) (title: n.title, content: n.content, tags: n.tags),
  ];

  String? prompt(WidgetTester tester) => tester.widget<Text>(find.byKey(const ValueKey('journal-prompt'))).data;

  testWidgets('a page written as them is kept as it is written, in their notes, and can be gone on with', (
    tester,
  ) async {
    final o = await open(tester);
    expect(find.byType(JournalPage), findsOneWidget);
    expect(find.text('The night before everything changes. Write it as Mark, tonight.'), findsOneWidget);
    expect(pages(o.c, o.mark), isEmpty, reason: 'nothing kept until something is written');

    await tester.enterText(find.byKey(const ValueKey('journal-page')), 'I could not sleep. The door hums.');
    await tester.pumpAndSettle();
    final kept = pages(o.c, o.mark).single;
    expect(kept.title, '${journalTitlePrefix}The night before everything changes. Write it as Mark, tonight.');
    expect(kept.content, 'I could not sleep. The door hums.');
    expect(kept.tags, [journalTag]);
    expect(find.text('7 words · kept in Mark’s notes'), findsOneWidget);

    // Gone on with: the same page, not a second.
    await tester.enterText(
      find.byKey(const ValueKey('journal-page')),
      'I could not sleep. The door hums. It knows me.',
    );
    o.c.read(saveControllerProvider).flush();
    await tester.pumpAndSettle();
    expect(pages(o.c, o.mark).single.content, 'I could not sleep. The door hums. It knows me.');

    // A new page: the next prompt, blank.
    await tester.tap(find.text('A new page'));
    await tester.pumpAndSettle();
    expect(prompt(tester), isNot('The night before everything changes. Write it as Mark, tonight.'));
    expect(find.text('EARLIER PAGES'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('journal-page')), 'A list. One: the door.');
    await tester.pumpAndSettle();
    expect(pages(o.c, o.mark), hasLength(2));

    // The earlier page, opened again to go on with.
    await tester.tap(find.textContaining('It knows me.'));
    await tester.pumpAndSettle();
    expect(prompt(tester), 'The night before everything changes. Write it as Mark, tonight.');
    expect(
      tester.widget<TextField>(find.byKey(const ValueKey('journal-page'))).controller!.text,
      'I could not sleep. The door hums. It knows me.',
    );
  });

  testWidgets('another prompt deals the next; on a phone the page fits', (tester) async {
    final o = await open(tester, size: const Size(390, 2400));
    final first = tester.widget<Text>(find.byKey(const ValueKey('journal-prompt'))).data;
    await tester.tap(find.text('Another prompt'));
    await tester.pumpAndSettle();
    expect(tester.widget<Text>(find.byKey(const ValueKey('journal-prompt'))).data, isNot(first));
    expect(pages(o.c, o.mark), isEmpty, reason: 'turning a blank page keeps nothing');
    expect(tester.takeException(), isNull);
  });
}
