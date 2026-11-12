import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/characters/widgets/together_on_page.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/characters/together.dart';
import 'package:novel_builder/shared/domain/records/relation.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('the sample novel’s untied pairs, most together first; recorded ties and set-aside pairs are left out', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    final cast = c.read(castProvider)!;
    String id(String name) => cast.entries.firstWhere((e) => e.name == name).id;
    final related = {
      for (final r in cast.snapshot.rows('characterRelations').map(CharacterRelation.new)) pairKey(r.fromId, r.toId),
    };
    final together = chaptersTogether(cast.list, cast.model.order);
    expect(together[pairKey(id('Wren Hollis'), id('Tobiah Fenn'))], hasLength(greaterThanOrEqualTo(10)));

    final pairs = untiedTogether(cast.list, cast.model.order, related: related);
    expect(pairs, isNotEmpty);
    for (final p in pairs) {
      expect(related, isNot(contains(pairKey(p.a, p.b))), reason: 'no recorded tie is asked about');
      expect(p.chapters.length, greaterThanOrEqualTo(togetherAtLeast));
    }
    for (var i = 1; i < pairs.length; i++) {
      expect(pairs[i].chapters.length, lessThanOrEqualTo(pairs[i - 1].chapters.length));
    }
    final first = pairs.first;
    expect(
      untiedTogether(cast.list, cast.model.order, related: related, setAside: {pairKey(first.b, first.a)}),
      isNot(contains(first)),
      reason: 'set aside, either way round',
    );
  });

  testWidgets('How are they tied? records the tie in a press; Not tied sets the pair aside', (tester) async {
    final c = await pumpApp(tester, size: phone, location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pumpAndSettle();

    expect(find.text('Together on the page'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    final relations = c.read(novelStoreProvider).rowsIn(novel.id, 'characterRelations').length;
    final firstPair = tester.widget<Text>(find.textContaining(' & ').first).data!;

    await tester.ensureVisible(find.text('How are they tied?').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('How are they tied?').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Friends').last);
    await tester.pumpAndSettle();
    expect(c.read(novelStoreProvider).rowsIn(novel.id, 'characterRelations'), hasLength(relations + 1));
    expect(find.textContaining(': Friends.'), findsOneWidget);
    expect(find.text(firstPair), findsNothing, reason: 'tied now, so no longer asked about');

    final next = tester.widget<Text>(find.textContaining(' & ').first).data!;
    await tester.ensureVisible(find.text('Not tied').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Not tied').first);
    await tester.pumpAndSettle();
    expect(find.text(next), findsNothing);
    expect(c.read(settingsStoreProvider).read(notTiedKey(novel.id)), hasLength(1));
    expect(
      c.read(novelStoreProvider).rowsIn(novel.id, 'characterRelations'),
      hasLength(relations + 1),
      reason: 'nothing recorded',
    );
  });
}
