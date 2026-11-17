import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/progression/systems_page.dart' show ownSystemReadings;
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/features/write/write_providers.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

import '../../helpers/pump_app.dart';

void main() {
  testWidgets('Systems offers the book’s own system first, and begins it with its skills and the hero’s sheet', (
    tester,
  ) async {
    final c = await pumpApp(tester, size: phone, location: '/organize/systems');
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(
      novel,
      one.id,
      textToDoc(
        'Whenever James wants to choose a skill, he searches a big library.\n'
        'For now, James was flying by using Smart Atoms skill. His level rose.',
      ),
      baseRev: 0,
    );
    final s = c.read(characterServiceProvider);
    final james = s.change(novel, (x) => x.create(name: 'James', roles: ['Protagonist'])).id;
    s.change(novel, (x) => x.createEntry('power', 'Empathic Mimicry'));
    c.read(openNovelProvider.notifier).open(novel);
    await tester.pumpAndSettle();

    expect(find.text('Your book’s own system'), findsOneWidget);
    expect(find.textContaining('“skill” ×2'), findsOneWidget);
    expect(find.text('Empathic Mimicry'), findsOneWidget);
    expect(find.text('Smart Atoms'), findsOneWidget);
    expect(find.text('A sheet for James, holding all 2.'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));

    await tester.ensureVisible(find.text('Begin with your book’s system'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Begin with your book’s system'));
    await tester.pumpAndSettle();

    final store = c.read(novelStoreProvider);
    final systems = store.rowsIn(novel, 'systems');
    expect(systems, hasLength(1));
    final items = [for (final i in systems.single['items'] as List) i as Map];
    final mine = items.where((i) => ['Empathic Mimicry', 'Smart Atoms'].contains(i['name'])).toList();
    expect(mine, hasLength(2));
    final sheets = store.rowsIn(novel, 'systemSheets');
    expect(sheets.single['entryId'], james);
    expect((sheets.single['itemIds'] as List).toSet(), {for (final i in mine) i['id']});
    expect(find.text('Your book’s own system'), findsNothing, reason: 'begun: the system itself is shown');
  });

  testWidgets('the pages are read for it away from the screen: the gallery at once, the book’s system when read', (
    tester,
  ) async {
    // Work sent away from the screen is held here until let go, as a long book's reading would take its time.
    final held = <void Function()>[];
    Future<R> later<R>(R Function() job) {
      final done = Completer<R>();
      held.add(() => done.complete(job()));
      return done.future;
    }

    // Frames enough to see the screen with the work held (its spinners never settle).
    Future<void> frames() async {
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    Future<void> letGo() async {
      while (held.isNotEmpty) {
        held.removeAt(0)();
        await tester.pump();
      }
      await tester.pumpAndSettle();
    }

    final c = await pumpApp(tester, size: phone, location: '/organize/systems', runAside: later);
    final novel = c.read(libraryServiceProvider).create({'title': 'Skill In Fantasy'}).id;
    final m = c.read(manuscriptServiceProvider);
    final one = m.create(novel, NodeKind.chapter, title: 'Chapter 1');
    m.save(
      novel,
      one.id,
      textToDoc(
        'Whenever James wants to choose a skill, he searches a big library.\n'
        'For now, James was flying by using Smart Atoms skill. His level rose.',
      ),
      baseRev: 0,
    );
    c.read(characterServiceProvider).change(novel, (x) => x.createEntry('power', 'Empathic Mimicry'));
    c.read(characterServiceProvider).change(novel, (x) => x.create(name: 'James', roles: ['Protagonist']));
    final before = ownSystemReadings;
    c.read(openNovelProvider.notifier).open(novel);
    await frames();

    // Being read: the gallery is there to choose from all the same, without it.
    expect(find.text('Begin a system'), findsOneWidget);
    expect(find.text('Begin with LitRPG / Game System'), findsOneWidget);
    expect(find.text('Your book’s own system'), findsNothing);
    expect(ownSystemReadings, before + 1);

    // Away and back while it is read: the same reading, not a second.
    c.read(routerProvider).go('/write');
    await frames();
    c.read(routerProvider).go('/organize/systems');
    await frames();
    expect(ownSystemReadings, before + 1, reason: 'one reading, waited on by the page come back');

    // Read: it comes in, first.
    await letGo();
    expect(find.text('Your book’s own system'), findsOneWidget);
    expect(find.text('Smart Atoms'), findsOneWidget);
    expect(find.text('A sheet for James, holding all 2.'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Your book’s own system')).dy,
      lessThan(tester.getTopLeft(find.text('Begin with LitRPG / Game System')).dy),
    );

    // Back again with nothing written: there in the first frame, from what was read.
    c.read(routerProvider).go('/write');
    await tester.pumpAndSettle();
    c.read(routerProvider).go('/organize/systems');
    await tester.pump();
    expect(find.text('Your book’s own system'), findsOneWidget);
    expect(ownSystemReadings, before + 1);
    expect(held, isEmpty);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
