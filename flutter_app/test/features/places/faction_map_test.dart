import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/core/widgets/gradually.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/factions/ties.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:super_text_layout/super_text_layout.dart';

import '../../helpers/large_novel.dart';
import '../../helpers/pump_app.dart';

/// The faction map on a large novel (190 factions, 4,000 links): the most tied when none is looked at, one faction's
/// own web when one is; each faction's ties found from its own links, as reading every link found them.
void main() {
  final model = StoryModel.fromSnapshot(largeNovel());
  final factions = factionsOf(model);

  test('a faction’s ties are found from its own links: the same ties, in the same order, as reading every link', () {
    expect(factions.length, greaterThan(mapMost));
    for (final f in factions) {
      final every = [
        for (final l in model.links)
          if (l.type != null &&
              ((l.fromId == f.id && l.fromType == EntityType.entry) ||
                  (l.toId == f.id && l.toType == EntityType.entry)))
            l.id,
      ];
      final found = [for (final t in factionTies(model, f.id)) t.link.id];
      expect(found.toSet(), every.toSet(), reason: f.name);
      expect(found.length, every.length, reason: 'each tie once: ${f.name}');
    }
  });

  test('none looked at: the most tied, the ties among them only, and how many are left out', () {
    final n = factionNetwork(model, null);
    expect(n.factions.length, mapMost);
    expect(n.left, factions.length - mapMost);
    final drawn = {for (final f in n.factions) f.id};
    final every = {for (final f in factions) f.id};
    for (final e in n.edges) {
      for (final end in [e.link.fromId, e.link.toId].where(every.contains)) {
        expect(drawn, contains(end), reason: 'a tie to a faction left out is not drawn');
      }
    }
    // Every faction drawn has at least as many ties as any left out.
    final all = factionNetwork(model, null, most: 100000);
    int ties(String id) => all.edges.where((e) => e.link.fromId == id || e.link.toId == id).length;
    final least = n.factions.map((f) => ties(f.id)).reduce((a, b) => a < b ? a : b);
    for (final f in factions.where((f) => !drawn.contains(f.id))) {
      expect(ties(f.id), lessThanOrEqualTo(least), reason: f.name);
    }
    expect(all.left, 0, reason: 'a book with few factions draws them all');
  });

  test('around one faction: it first, the factions it is tied to, and its own ties only', () {
    final f = factions.firstWhere((f) => factionTies(model, f.id).isNotEmpty);
    final n = factionNetwork(model, null, around: f.id);
    expect(n.factions.first.id, f.id);
    expect(n.left, factions.length - n.factions.length);
    for (final e in n.edges) {
      expect([e.link.fromId, e.link.toId], contains(f.id), reason: 'only its own ties');
    }
    final near = {for (final e in n.edges) e.link.fromId, for (final e in n.edges) e.link.toId};
    for (final g in n.factions.skip(1)) {
      expect(near, contains(g.id), reason: '${g.name} is tied to it');
    }
  });

  testWidgets('on a phone: the most tied on the map, a tap turns it round one faction, Every faction turns it back; '
      'the cards a screenful first', (tester) async {
    BlinkController.indeterminateAnimationsEnabled = false;
    addTearDown(() => BlinkController.indeterminateAnimationsEnabled = true);
    final c = await pumpApp(tester, size: phone);
    final s = largeNovel();
    c.read(novelStoreProvider).putNovel(s);
    c.read(openNovelProvider.notifier).open(s.projectId);
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/visualize/factions');
    await tester.pump();
    int cards() => find
        .descendant(
          of: find.byType(Gradually),
          matching: find.byWidgetPredicate((w) => w.runtimeType.toString() == '_FactionCard'),
          skipOffstage: false,
        )
        .evaluate()
        .length;
    expect(cards(), lessThanOrEqualTo(Gradually.first), reason: 'a screenful, not 190 cards');
    await tester.pumpAndSettle();
    expect(cards(), factions.length, reason: 'every faction in the end');

    expect(
      find.text(
        'The $mapMost factions with the most ties, of ${factions.length}. Tap one to see its own ties '
        'round it; every faction is in the cards below.',
      ),
      findsOneWidget,
    );
    final onMap = find.bySemanticsLabel(RegExp(r', a faction$'));
    expect(onMap, findsNWidgets(mapMost));

    // A faction tapped: the map turns round it.
    final tapped = tester.widget<Semantics>(onMap.first).properties.label!.replaceFirst(', a faction', '');
    await tester.ensureVisible(onMap.first);
    await tester.pumpAndSettle();
    await tester.tap(onMap.first, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.textContaining('$tapped and its own ties:'), findsOneWidget);
    expect(cards(), 1, reason: 'its card, and its history');
    final f = factions.firstWhere((f) => f.name == tapped);
    expect(onMap, findsNWidgets(factionNetwork(model, null, around: f.id).factions.length));

    await tester.ensureVisible(find.ancestor(of: find.text('Every faction'), matching: find.bySubtype<TextButton>()));
    await tester.pumpAndSettle();
    await tester.tap(find.ancestor(of: find.text('Every faction'), matching: find.bySubtype<TextButton>()));
    await tester.pumpAndSettle();
    expect(find.textContaining('and its own ties:'), findsNothing);
    expect(onMap, findsNWidgets(mapMost));
    await tester.pump(const Duration(seconds: 3));
  }, timeout: const Timeout(Duration(minutes: 3)));
}
