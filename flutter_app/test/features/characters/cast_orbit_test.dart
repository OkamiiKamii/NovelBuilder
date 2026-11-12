import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/interview.dart';
import 'package:novel_builder/features/characters/widgets/cast_orbit.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';

import '../../helpers/pump_app.dart';

void main() {
  test('who goes where: the protagonist at the heart, the principals close in, those not on the page in the wings', () {
    final cast = CastData('x', sampleNovel(now: 0));
    final plan = orbitPlan(cast.list, hasChapters: cast.model.order.chapters.isNotEmpty);
    expect([for (final l in plan.heart) l.entry.name], ['Wren Hollis']);
    final everyone = [...plan.heart, for (final p in plan.rings.values) ...p];
    expect(everyone.length, cast.list.length, reason: 'each character once');
    expect(everyone.toSet().length, cast.list.length);
    for (final l in plan.rings[OrbitRing.wings] ?? const []) {
      expect(l.seenIn, isEmpty);
    }
    // Each ring in the order they enter the book.
    for (final people in plan.rings.values) {
      final firsts = [for (final l in people) l.first < 0 ? 1 << 30 : l.first];
      expect(firsts, [...firsts]..sort());
    }
  });

  test(
    'with no protagonist, the one most in the book is at the heart; without chapters, no one waits in the wings',
    () {
      final cast = CastData('x', sampleNovel(now: 0));
      final noLead = [
        for (final l in cast.list)
          if (!l.profile.roles.contains('Protagonist')) l,
      ];
      final plan = orbitPlan(noLead, hasChapters: false);
      final most = noLead.map((l) => l.seenIn.length).reduce((a, b) => a > b ? a : b);
      expect(plan.heart.single.seenIn.length, most);
      expect(plan.rings.containsKey(OrbitRing.wings), isFalse);
    },
  );

  testWidgets('the orbit: the cast round the heart, a press opens anyone, and the one to know next interviewed', (
    tester,
  ) async {
    final c = await pumpApp(tester, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Orbit'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Orbit'));
    await tester.pumpAndSettle();
    expect(c.read(castViewProvider), CastView.orbit);
    expect(find.byType(CastOrbit), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp(r'^Wren Hollis, Protagonist, at the heart')), findsOneWidget);
    expect(find.textContaining('At the heart, Wren Hollis'), findsOneWidget);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    // The one known least of the principals, with Interview.
    final cast = c.read(castProvider)!;
    final plan = orbitPlan(cast.list, hasChapters: true);
    final next = nextToKnow(plan, (l) => acquaintance(l.entry, l.profile, cast.templates));
    expect(next, isNotNull);
    final first = next!.entry.name.split(' ').first;
    final asked = interviewFor(next.entry, next.profile, cast.templates);
    await tester.ensureVisible(find.text('Interview $first'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Interview $first'));
    await tester.pumpAndSettle();
    expect(find.text(asked.first.ask), findsOneWidget, reason: 'the interview opens on its first question');
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.bySemanticsLabel(RegExp(r'^Wren Hollis, Protagonist, at the heart')));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Wren Hollis, Protagonist, at the heart')));
    await tester.pumpAndSettle();
    final wren = cast.entries.firstWhere((e) => e.name == 'Wren Hollis').id;
    expect(currentLocation(c), '/organize/character/$wren');
  });

  testWidgets('on a phone the orbit fits the screen and still opens anyone', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byTooltip('Orbit'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Orbit'));
    await tester.pumpAndSettle();
    expect(find.byType(CastOrbit), findsOneWidget);
    expect(tester.takeException(), isNull);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  });
}
