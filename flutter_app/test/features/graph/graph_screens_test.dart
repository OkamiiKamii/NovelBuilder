import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/graph/graph_page.dart';
import 'package:novel_builder/features/timeline/timeline_providers.dart';
import 'package:novel_builder/features/visualize/visualize_providers.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/graph/knowledge.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

typedef Novel = ({ProviderContainer c, String novel, String mira, String bren});

/// Mira takes part in the siege at the Keep, and the Docks lie in the Keep; Bren takes part in the feast, apart.
Future<Novel> setUpNovel(WidgetTester tester, {Size size = tall, int extras = 0}) async {
  final c = await pumpApp(tester, size: size, location: '/visualize/graph');
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'}).id;
  final s = c.read(characterServiceProvider);
  final mira = s.change(novel, (x) => x.create(name: 'Mira')).id;
  final bren = s.change(novel, (x) => x.create(name: 'Bren')).id;
  final keep = s.change(novel, (x) => x.createEntry('location', 'The Keep')).id;
  final docks = s.change(novel, (x) => x.createEntry('location', 'The Docks')).id;
  s.change(
    novel,
    (x) => x.createConnection(
      from: EntityRef(EntityType.entry, docks),
      to: EntityRef(EntityType.entry, keep),
      type: 'located-in',
    ),
  );
  for (var i = 0; i < extras; i++) {
    s.change(novel, (x) => x.create(name: 'Extra $i'));
  }
  c.read(timelineServiceProvider).change(novel, (x) {
    final siege = x.createEvent('The siege');
    x.updateEvent(
      siege,
      (_) => {
        'locationId': keep,
        'characters': [
          {'id': mira, 'age': null},
        ],
      },
    );
    final feast = x.createEvent('The feast');
    x.updateEvent(
      feast,
      (_) => {
        'characters': [
          {'id': bren, 'age': null},
        ],
      },
    );
  });
  c.read(openNovelProvider.notifier).open(novel);
  await tester.pumpAndSettle();
  return (c: c, novel: novel, mira: mira, bren: bren);
}

FocusNode canvas(WidgetTester tester) => tester
    .widget<Focus>(find.byWidgetPredicate((x) => x is Focus && x.focusNode?.debugLabel == 'Knowledge graph'))
    .focusNode!;

Future<void> key(WidgetTester tester, LogicalKeyboardKey k) async {
  await tester.sendKeyEvent(k);
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String text) async {
  final f = find.text(text).last;
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the graph says what it shows, and every layer it hides comes with a way back', (tester) async {
    await setUpNovel(tester);
    expect(find.text('Showing 6 of 6 records and 4 of 4 connections.'), findsOneWidget);
    expect(find.text('This is part of the story, not all of it.'), findsNothing);

    await tapText(tester, 'Layers: what is shown, and what is folded together');
    await tester.tap(find.widgetWithText(CheckboxListTile, 'Events  2'));
    await tester.pumpAndSettle();
    expect(find.text('This is part of the story, not all of it.'), findsOneWidget);
    expect(find.text('• Hidden kinds of record: Events.'), findsOneWidget);
    // Without the events, Mira and Bren are connected to nothing shown, and that is said too.
    expect(find.text('• 2 records have no connection shown, and are not drawn.'), findsOneWidget);
    expect(find.text('Showing 2 of 6 records and 1 of 4 connections.'), findsOneWidget);
    await tapText(tester, 'Show them');
    expect(find.text('Showing 6 of 6 records and 4 of 4 connections.'), findsOneWidget);

    final fold = find.byWidgetPredicate((x) => x is Text && x.semanticsLabel == 'Fold together Events');
    await tester.ensureVisible(fold);
    await tester.pumpAndSettle();
    await tester.tap(fold);
    await tester.pumpAndSettle();
    expect(
      find.text('• Folded together, one node each: Events. Connections inside a group are not drawn.'),
      findsOneWidget,
    );
    expect(find.textContaining('1 group folded together'), findsOneWidget);
    await tapText(tester, 'Restore the full view');
    expect(find.text('This is part of the story, not all of it.'), findsNothing);
  });

  testWidgets('the keyboard moves through the records, selects one and focuses on it', (tester) async {
    final w = await setUpNovel(tester);
    canvas(tester).requestFocus();
    await tester.pumpAndSettle();
    await key(tester, LogicalKeyboardKey.enter);
    expect(w.c.read(vizStateProvider).selection, EntityRef(EntityType.entry, w.bren), reason: 'records by name');
    await key(tester, LogicalKeyboardKey.arrowRight);
    await key(tester, LogicalKeyboardKey.keyF);
    expect(find.text('• Only what is within one step of Mira.'), findsOneWidget);
    expect(find.text('Showing 2 of 6 records and 1 of 4 connections, around Mira.'), findsOneWidget);

    await tester.tap(find.widgetWithText(DropdownButtonFormField<int>, 'Around Mira'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Two steps').last);
    await tester.pumpAndSettle();
    expect(find.text('Showing 3 of 6 records and 2 of 4 connections, around Mira.'), findsOneWidget);
    await tapText(tester, 'Show the whole graph');
    expect(find.text('Showing 6 of 6 records and 4 of 4 connections.'), findsOneWidget);
  });

  testWidgets('the path from the selection to another record is shown step by step', (tester) async {
    final w = await setUpNovel(tester);
    w.c.read(vizStateProvider.notifier).select(EntityRef(EntityType.entry, w.mira));
    await tester.pumpAndSettle();
    expect(find.text('How is Mira connected to…'), findsOneWidget);
    canvas(tester).requestFocus();
    await tester.pumpAndSettle();
    await key(tester, LogicalKeyboardKey.keyP); // Bren, first by name: apart from Mira.
    expect(find.text('Not connected within eight steps.'), findsOneWidget);
    await key(tester, LogicalKeyboardKey.arrowRight);
    await key(tester, LogicalKeyboardKey.arrowRight);
    await key(tester, LogicalKeyboardKey.keyP); // The Docks.
    expect(find.textContaining(RegExp(r'^1\. Mira ')), findsOneWidget);
    expect(find.textContaining(RegExp(r'^3\. The Docks ')), findsOneWidget);
  });

  testWidgets('the list form says every connection in words, and where it is kept', (tester) async {
    await setUpNovel(tester);
    await tester.tap(find.text('List').first);
    await tester.pumpAndSettle();
    expect(find.text('kept in a connection you recorded'), findsOneWidget);
    expect(find.text('kept in a timeline event'), findsNWidgets(3));
  });

  testWidgets('a large graph draws the most connected first, and says how many more there are', (tester) async {
    await setUpNovel(tester, extras: 200);
    expect(find.text('• 200 records have no connection shown, and are not drawn.'), findsOneWidget);
    await tapText(tester, 'Draw them');
    expect(find.textContaining('Only the 200 most connected of 206 records and groups are drawn'), findsOneWidget);
    await tapText(tester, 'Draw 6 more');
    expect(find.textContaining('most connected of'), findsNothing);
    expect(find.text('Showing 206 of 206 records and 4 of 4 connections.'), findsOneWidget);
  });

  testWidgets(
    'renaming and deleting records shows at once, and says so when a connection points at something deleted',
    (tester) async {
      final w = await setUpNovel(tester);
      await tester.tap(find.text('List').first);
      await tester.pumpAndSettle();
      w.c.read(characterServiceProvider).change(w.novel, (x) => x.updateEntry(w.mira, name: 'Mirabel'));
      await tester.pumpAndSettle();
      expect(find.text('Mirabel'), findsWidgets);
      expect(find.text('Mira'), findsNothing);
      w.c.read(characterServiceProvider).delete(w.novel, w.bren, name: 'Bren');
      await tester.pumpAndSettle();
      expect(find.text('Bren'), findsNothing);
      // The feast still names Bren: left out of the graph, counted and said, never drawn to nothing.
      expect(
        find.text(
          'Showing 4 of 5 records and 3 of 3 connections. 1 connection points at something deleted, and is left out.',
        ),
        findsOneWidget,
      );
      expect(find.text('• 1 record has no connection shown, and is not drawn.'), findsOneWidget);
    },
  );

  test('the view’s settings are kept as the original keeps them in a saved view', () {
    final layout = {
      'ghide': 'event,thread',
      'gedges': 'link:owns',
      'gstatus': 'disputed',
      'gfocus': 'entry:x',
      'gdepth': '2',
      'gall': '1',
      'gcollapse': 'scene',
      'gfold': '1',
      'glimit': '300',
    };
    expect(GraphSettings.of(layout).toLayout(), layout);
    expect(GraphSettings.of({'glimit': 'all'}).limit, double.infinity);
    expect(GraphSettings.of({'glimit': '50'}).limit, drawLimit, reason: 'never fewer than the original draws');
    expect(const GraphSettings().toLayout(), isEmpty);
  });
}
