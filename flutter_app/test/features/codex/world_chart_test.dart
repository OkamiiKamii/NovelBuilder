import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/codex/widgets/world_chart.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/records/link.dart';

import '../../helpers/pump_app.dart';

List<ChartPlace> _all(List<ChartPlace> places) => [
  for (final p in places) ...[p, ..._all(p.children)],
];

void main() {
  test('the chart holds every place inside what it is in, and every other world entry once: on a shore or adrift', () {
    final cast = CastData('x', sampleNovel(now: 0));
    final chart = worldChartOf(cast.model, cast.chaptersOf());
    final places = _all(chart.islands);
    final locations = cast.entries.where((e) => e.category == 'location').toList();
    expect(places.map((p) => p.entry.id).toSet(), locations.map((e) => e.id).toSet());
    for (final island in chart.islands) {
      expect(island.depth, 0);
      for (final p in _all(island.children)) {
        expect(p.depth, greaterThan(0));
      }
    }
    final world = cast.entries.where((e) => e.category != 'character' && e.category != 'location').toList();
    final shown = [for (final p in places) ...p.seals, ...chart.adrift];
    expect(shown.map((e) => e.id).toList()..sort(), world.map((e) => e.id).toList()..sort(), reason: 'each once');
    // A seal is linked to its place; an entry adrift is linked to none.
    final placeIds = places.map((p) => p.entry.id).toSet();
    bool tiedToAPlace(String id) => cast.model.links.any(
      (l) =>
          l.isEntryLink &&
          ((l.fromId == id && placeIds.contains(l.toId)) || (l.toId == id && placeIds.contains(l.fromId))),
    );
    for (final p in places) {
      for (final s in p.seals) {
        expect(tiedToAPlace(s.id), isTrue, reason: s.name);
      }
    }
    for (final e in chart.adrift) {
      expect(tiedToAPlace(e.id), isFalse, reason: e.name);
    }
  });

  testWidgets('the chart heads the whole world; an entry adrift is placed in a press, and a place opens', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: const Size(1400, 2400), location: '/organize');
    final novel = addSampleNovel(c.read(novelStoreProvider), now: DateTime(2026, 11, 10).millisecondsSinceEpoch);
    c.read(openNovelProvider.notifier).open(novel.id);
    await tester.pumpAndSettle();
    await tester.tap(find.text('World'));
    await tester.pumpAndSettle();
    expect(find.byType(WorldChart), findsOneWidget);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    final cast = c.read(castProvider)!;
    final before = worldChartOf(cast.model, cast.chaptersOf());
    final drifting = before.adrift.first;
    final island = before.islands.first;
    await tester.tap(find.bySemanticsLabel(RegExp('^${RegExp.escape(drifting.name)}, adrift')));
    await tester.pumpAndSettle();
    expect(find.text('Where does ${drifting.name} belong?'), findsOneWidget);
    await tester.tap(find.descendant(of: find.byType(BottomSheet), matching: find.text(island.entry.name)));
    await tester.pumpAndSettle();

    final word = belongsWord(drifting.category);
    final links = [for (final r in c.read(novelStoreProvider).rowsIn(novel.id, 'loreLinks')) Link(r)];
    final made = links.where((l) => l.fromId == drifting.id && l.toId == island.entry.id).single;
    expect(made.fromLabel, word);
    expect(find.text('${drifting.name} $word ${island.entry.name}.'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^${RegExp.escape(drifting.name)}, .*on the shore')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('^${RegExp.escape(drifting.name)}, adrift')), findsNothing);

    // On its own land, by its name, clear of the places inside it.
    final shore = tester.getRect(
      find.bySemanticsLabel(RegExp('^${RegExp.escape(island.entry.name)}, a place on the chart')),
    );
    await tester.tapAt(Offset(shore.center.dx, shore.top + shore.height * 0.16));
    await tester.pumpAndSettle();
    expect(currentLocation(c), '/organize/world/entry/${island.entry.id}');
  });

  testWidgets('a world with no places has no chart; a volume of one kind has none either', (tester) async {
    final c = await pumpApp(tester, location: '/organize/world');
    final novel = c.read(libraryServiceProvider).create({'title': 'Ash'}).id;
    c.read(openNovelProvider.notifier).open(novel);
    c.read(characterServiceProvider).change(novel, (x) => x.createEntry('faction', 'Ash Guild'));
    await tester.pumpAndSettle();
    expect(find.byType(WorldChart), findsOneWidget, reason: 'the widget is there');
    expect(find.bySemanticsLabel(RegExp('^Chart of the world')), findsNothing, reason: 'but draws nothing');

    c.read(characterServiceProvider).change(novel, (x) => x.createEntry('location', 'The Keep'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('^Chart of the world: 1 place, 1 adrift')), findsOneWidget);
    await tester.tap(find.text('Factions & Species'));
    await tester.pumpAndSettle();
    expect(find.byType(WorldChart), findsNothing);
  });
}
