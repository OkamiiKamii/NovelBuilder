import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/novel_store.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/records/link.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

Future<({ProviderContainer c, String novel})> openNovelAt(
  WidgetTester tester,
  String location, {
  Size size = tall,
}) async {
  final c = await pumpApp(tester, size: size, location: location);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id);
}

NovelStore storeOf(ProviderContainer c) => c.read(novelStoreProvider);

void main() {
  testWidgets('a connection is added from an entry, reads its converse from the other end, and can be removed', (
    tester,
  ) async {
    final w = await openNovelAt(tester, '/organize/world');
    final s = w.c.read(characterServiceProvider);
    final mira = s.change(w.novel, (x) => x.create(name: 'Mira')).id;
    final guild = s.change(w.novel, (x) => x.createEntry('faction', 'Ash Guild')).id;
    w.c.read(routerProvider).go('/organize/character/$mira');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add a connection'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Related to'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Member of').last);
    await tester.pumpAndSettle();
    expect(find.text('From the other end it reads “Has member”.'), findsOneWidget);
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Which one'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ash Guild').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connect'));
    await tester.pumpAndSettle();
    final link = Link(storeOf(w.c).rowsIn(w.novel, 'loreLinks').single);
    expect([link.fromId, link.toId, link.type], [mira, guild, 'member-of']);
    expect(find.text('Member of'), findsWidgets);

    w.c.read(routerProvider).go('/organize/world/entry/$guild');
    await tester.pumpAndSettle();
    expect(find.text('member of this'), findsOneWidget, reason: 'Mira’s statement, seen from the guild');
    await tester.tap(find.byTooltip('Remove this connection'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Remove'));
    await tester.pumpAndSettle();
    expect(storeOf(w.c).rowsIn(w.novel, 'loreLinks'), isEmpty);
    expect(storeOf(w.c).row(w.novel, 'loreEntries', guild), isNotNull);
  });

  testWidgets('the record check finds a broken reference and takes only that reference out', (tester) async {
    final w = await openNovelAt(tester, '/review/records');
    expect(find.text('Record check'), findsWidgets, reason: 'the title, and its place in the view switch');
    storeOf(w.c).writeRows(w.novel, [
      RowWrite.put('timelineEvents', {
        'id': 'siege',
        'projectId': w.novel,
        'name': 'The siege',
        'characters': [
          {'id': 'a1b2c3d4-0000-4000-8000-000000000099', 'age': null},
        ],
        'nodeIds': <String>[],
      }),
    ]);
    await tester.pumpAndSettle();
    expect(find.textContaining('points at a codex entry that no longer exists'), findsOneWidget);
    await tester.tap(find.text('Take this reference out'));
    await tester.pumpAndSettle();
    final event = storeOf(w.c).row(w.novel, 'timelineEvents', 'siege')!;
    expect([event['name'], event['characters']], ['The siege', <Object?>[]]);
    expect(find.textContaining('points at a codex entry that no longer exists'), findsNothing);
  });

  testWidgets('look-alikes: “Not duplicates” holds and can be reopened; a merge is confirmed by name and undone', (
    tester,
  ) async {
    final w = await openNovelAt(tester, '/review/records');
    final s = w.c.read(characterServiceProvider);
    final keep = s.change(w.novel, (x) => x.createEntry('location', 'The Ember Keep')).id;
    final twin = s.change(w.novel, (x) => x.createEntry('location', 'ember keep')).id;
    final other = s.change(w.novel, (x) => x.createEntry('faction', 'Wardens')).id;
    s.change(
      w.novel,
      (x) => x.createConnection(
        from: EntityRef(EntityType.entry, other),
        to: EntityRef(EntityType.entry, twin),
        type: 'controls',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate(
        (w) => w is Text && {'The Ember Keep and ember keep', 'ember keep and The Ember Keep'}.contains(w.data),
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Not duplicates'));
    await tester.pumpAndSettle();
    expect(find.text('Decided: not duplicates'), findsOneWidget);
    await tester.tap(find.text('Reopen'));
    await tester.pumpAndSettle();
    expect(find.text('Merge…'), findsOneWidget);

    await tester.tap(find.text('Merge…'));
    await tester.pumpAndSettle();
    // Keep the one named “The Ember Keep”, whichever comes first.
    await tester.tap(find.text('Keep “The Ember Keep”'));
    await tester.pumpAndSettle();
    expect(find.textContaining('connections: 1'), findsOneWidget);
    final merge = find.widgetWithText(FilledButton, 'Merge them');
    expect(tester.widget<FilledButton>(merge).onPressed, isNull, reason: 'not until the name is typed');
    await tester.enterText(find.byType(TextField).last, 'ember keep');
    await tester.pumpAndSettle();
    await tester.tap(merge);
    await tester.pumpAndSettle();
    expect(storeOf(w.c).row(w.novel, 'loreEntries', twin), isNull);
    expect(Link(storeOf(w.c).rowsIn(w.novel, 'loreLinks').single).toId, keep);
    expect(str(storeOf(w.c).row(w.novel, 'loreEntries', keep)!['notes']), contains('Merged “ember keep”'));
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(storeOf(w.c).row(w.novel, 'loreEntries', twin), isNotNull);
    expect(Link(storeOf(w.c).rowsIn(w.novel, 'loreLinks').single).toId, twin);
  });

  testWidgets('the record check works on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await openNovelAt(tester, '/review/records', size: phone);
    final s = w.c.read(characterServiceProvider);
    s.change(w.novel, (x) => x.createEntry('location', 'The Keep of Ten Thousand Winters'));
    s.change(w.novel, (x) => x.createEntry('location', 'keep of ten thousand winters'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
