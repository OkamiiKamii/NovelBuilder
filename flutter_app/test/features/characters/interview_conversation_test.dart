import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/interview.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the interview is a conversation: the questions asked, the replies in their voice, where each went', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    final james = c
        .read(characterServiceProvider)
        .change(novel, (x) => x.create(name: 'James', roles: ['Protagonist']))
        .id;
    c.read(routerProvider).go('/organize/character/$james');
    await tester.pumpAndSettle();
    final cast = c.read(castProvider)!;
    final listed = cast.listed(james)!;
    final before = acquaintance(listed.entry, listed.profile, cast.templates);
    final asked = interviewFor(listed.entry, listed.profile, cast.templates);

    await tester.tap(find.text('Interview James'));
    await tester.pumpAndSettle();
    // On a phone, the whole screen: a conversation, not a form over the page.
    expect(find.byWidgetPredicate((w) => w is Dialog && w.child is Material), findsOneWidget);
    expect(find.text('Known ${before.known} of ${before.of}'), findsOneWidget);
    // Answered as the character, who is named and never given a pronoun.
    expect(find.text('In James’s own words'), findsOneWidget);
    expect(find.text(asked.first.ask), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Answer'), 'To find out who he was before.');
    await tester.pump();
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    // The question stays, the reply is James's, and it says where it went.
    expect(find.text(asked.first.ask), findsOneWidget);
    expect(
      find.descendant(of: find.byType(Dialog), matching: find.text('To find out who he was before.')),
      findsOneWidget,
    );
    expect(find.text('→ ${asked.first.fieldName}'), findsOneWidget);
    expect(find.text('Known ${before.known + 1} of ${before.of}'), findsOneWidget);
    expect(find.text(asked[1].ask), findsOneWidget);

    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(find.text('Passed over'), findsOneWidget);
    expect(find.text('One answer saved to the profile.'), findsOneWidget);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));

    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    final after = c.read(castProvider)!.listed(james)!;
    expect(acquaintance(after.entry, after.profile, cast.templates).known, before.known + 1);
    expect(tester.takeException(), isNull);
  });
}
