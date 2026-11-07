import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/app/router.dart';
import 'package:novel_builder/features/characters/characters_providers.dart';
import 'package:novel_builder/features/timeline/timeline_providers.dart';
import 'package:novel_builder/features/timeline/widgets/chronicle.dart';
import 'package:novel_builder/features/workspace/open_novel.dart';
import 'package:novel_builder/shared/data/providers.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/timeline/event_changes.dart';

import '../../helpers/pump_app.dart';

const tall = Size(1400, 4000);

Future<({ProviderContainer c, String novel, String mira})> setUpNovel(
  WidgetTester tester, {
  Size size = tall,
  String location = '/plan',
}) async {
  final c = await pumpApp(tester, size: size, location: location);
  final novel = c.read(libraryServiceProvider).create({'title': 'Ashfall'});
  final mira = c.read(characterServiceProvider).change(novel.id, (x) => x.create(name: 'Mira')).id;
  c.read(openNovelProvider.notifier).open(novel.id);
  await tester.pumpAndSettle();
  return (c: c, novel: novel.id, mira: mira);
}

List<TimelineEvent> eventsOf(ProviderContainer c, String novel) => [
  for (final r in c.read(novelStoreProvider).rowsIn(novel, 'timelineEvents')) TimelineEvent(r),
];

T timelineIn<T>(ProviderContainer c, String novel, T Function(EventChanges x) f) =>
    c.read(timelineServiceProvider).change(novel, f);

Future<void> enterNumber(WidgetTester tester, String label, String text) async {
  final field = find.widgetWithText(TextField, label);
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.enterText(field, text);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a new event is dated, given an end, someone taking part, and deleted with Undo', (tester) async {
    final w = await setUpNovel(tester);
    expect(find.text('What happened, and when'), findsOneWidget);
    await tester.tap(find.text('New event').first);
    await tester.pumpAndSettle();
    final id = eventsOf(w.c, w.novel).single.id;
    expect(currentLocation(w.c), '/plan/event/$id');

    await tester.tap(find.widgetWithText(ChoiceChip, 'Exact'));
    await tester.pumpAndSettle();
    await enterNumber(tester, 'Year', '1020');
    expect(eventsOf(w.c, w.novel).single.when, isA<ExactDate>().having((d) => d.year, 'year', 1020));
    await enterNumber(tester, 'Day', '4');
    expect((eventsOf(w.c, w.novel).single.when! as ExactDate).day, isNull, reason: 'no month yet: day disabled');

    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Ends'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Still going on').last);
    await tester.pumpAndSettle();
    expect(eventsOf(w.c, w.novel).single.ongoing, isTrue);
    expect(find.textContaining('the timeline draws it to the edge'), findsOneWidget);

    await tester.tap(find.byTooltip('Add a character'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira').last);
    await tester.pumpAndSettle();
    expect(eventsOf(w.c, w.novel).single.characters.single.id, w.mira);
    await enterNumber(tester, 'Mira’s age', '17');
    expect(eventsOf(w.c, w.novel).single.characters.single.age, 17);

    await tester.ensureVisible(find.text('Delete event…'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete event…'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(eventsOf(w.c, w.novel), isEmpty);
    expect(currentLocation(w.c), '/plan');
    await tester.tap(find.text('Undo'));
    await tester.pumpAndSettle();
    expect(eventsOf(w.c, w.novel).single.characters.single.age, 17);
  });

  testWidgets('the timeline lists events in story order, by year, with a life path and its ages', (tester) async {
    final w = await setUpNovel(tester);
    timelineIn(w.c, w.novel, (x) {
      final born = x.createEvent('Mira is born');
      x.updateEvent(
        born,
        (_) => {
          'when': {'precision': 'exact', 'year': 1000, 'month': 3, 'day': 1},
          'characters': [
            {'id': w.mira, 'age': 0},
          ],
        },
      );
      final siege = x.createEvent('The siege');
      x.updateEvent(
        siege,
        (_) => {
          'when': {'precision': 'approximate', 'year': 1026},
          'characters': [
            {'id': w.mira, 'age': null},
          ],
          'importance': 'climax',
        },
      );
      x.createEvent('A rumour');
    });
    await tester.pumpAndSettle();
    expect(find.text('Year 1000'), findsOneWidget);
    expect(find.text('Year 1026'), findsOneWidget);
    expect(find.text('Not yet placed in time'), findsOneWidget);
    final born = tester.getTopLeft(find.text('Mira is born')).dy;
    final siege = tester.getTopLeft(find.text('The siege')).dy;
    expect(born < siege, isTrue);
    // The chronicle: the years between are said on the line, and events hang to either side of it on a wide screen.
    expect(find.text('26 years later'), findsOneWidget);
    final line = tester.getCenter(find.byType(Chronicle)).dx;
    expect(tester.getCenter(find.text('Mira is born')).dx < line, isTrue);
    expect(tester.getTopLeft(find.text('The siege')).dx > line, isTrue);

    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Life path of'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira’s life').last);
    await tester.pumpAndSettle();
    expect(find.text('Age 0: Mira is born → Age 25–26: The siege'), findsOneWidget);
    expect(find.text('A rumour'), findsNothing);
  });

  testWidgets('an event page refuses a day its month does not have, and keeps the date as it was', (tester) async {
    final w = await setUpNovel(tester);
    final id = timelineIn(w.c, w.novel, (x) {
      final id = x.createEvent('The council');
      x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 10, 'month': 2},
        },
      );
      x.saveCalendar({
        'kind': 'custom',
        'name': 'The Reckoning',
        'months': [
          {'name': 'Thaw', 'days': 30},
          {'name': 'Bloom', 'days': 20},
        ],
        'hoursPerDay': 20,
        'daysPerWeek': 6,
        'eras': <Object?>[],
        'seasons': {'spring': 1, 'summer': 1, 'autumn': 2, 'winter': 2},
      });
      return id;
    });
    w.c.read(routerProvider).go('/plan/event/$id');
    await tester.pumpAndSettle();
    await enterNumber(tester, 'Day', '25');
    expect(find.text('Bloom has 20 days: day 25 was not saved.'), findsOneWidget);
    expect(mapOrNull(eventsOf(w.c, w.novel).single.raw['when'])!['day'], isNull);
    await enterNumber(tester, 'Day', '20');
    expect(mapOrNull(eventsOf(w.c, w.novel).single.raw['when'])!['day'], 20);
  });

  testWidgets('the calendar is a draft until saved, says what is wrong, and lists events it does not have', (
    tester,
  ) async {
    final w = await setUpNovel(tester, location: '/plan/calendar');
    timelineIn(w.c, w.novel, (x) {
      final id = x.createEvent('The thaw feast');
      x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 10, 'month': 12, 'day': 1},
        },
      );
    });
    await tester.pumpAndSettle();
    expect(find.text('Standard calendar. Dates read like “Year 10, January 1”.'), findsOneWidget);
    await tester.tap(find.text('A calendar of this novel’s own'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Calendar name'), 'The Reckoning');
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Days in January'), '');
    await tester.pumpAndSettle();
    expect(find.text('• January needs a whole number of days, from 1 to 1000.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save calendar')).onPressed, isNull);
    await tester.enterText(find.widgetWithText(TextField, 'Days in January'), '40');
    await tester.pumpAndSettle();
    for (var i = 0; i < 11; i++) {
      await tester.tap(
        find.byTooltip(
          'Remove ${['February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]}',
        ),
      );
      await tester.pumpAndSettle();
    }
    expect(find.textContaining('1 event has a date this calendar does not have.'), findsOneWidget);
    expect(find.textContaining('The thaw feast: Month 12 is not in The Reckoning, which has 1 month.'), findsOneWidget);
    expect(w.c.read(novelStoreProvider).rowsIn(w.novel, 'storyCalendars'), isEmpty, reason: 'a draft until saved');
    await tester.tap(find.widgetWithText(FilledButton, 'Save calendar'));
    await tester.pumpAndSettle();
    final row = w.c.read(novelStoreProvider).rowsIn(w.novel, 'storyCalendars').single;
    expect([row['kind'], row['name'], (row['months']! as List).length], ['custom', 'The Reckoning', 1]);
    expect(find.textContaining('now read in the “The Reckoning” calendar'), findsOneWidget);
    expect(mapOrNull(eventsOf(w.c, w.novel).single.raw['when'])!['month'], 12, reason: 'never rewritten');
  });

  testWidgets('an alternate history is started, an event goes differently there, and the two are compared', (
    tester,
  ) async {
    final w = await setUpNovel(tester, location: '/plan/histories');
    final siege = timelineIn(w.c, w.novel, (x) {
      final id = x.createEvent('The siege');
      x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 10},
        },
      );
      return id;
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('No alternate histories yet.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'If the Keep fell');
    await tester.tap(find.text('Start the history'));
    await tester.pumpAndSettle();
    final h = w.c.read(novelStoreProvider).rowsIn(w.novel, 'alternateHistories').single;
    expect(currentLocation(w.c), '/plan/histories?history=${h['id']}');
    expect(find.text('The main timeline and “If the Keep fell” have the same events.'), findsOneWidget);

    await tester.tap(find.text('Change').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Event name in this history'), 'The fall of the Keep');
    await tester.tap(find.text('Save for this history'));
    await tester.pumpAndSettle();
    expect(find.text('1 event differs: 1 changed.'), findsOneWidget);
    expect(find.text('Changed: name'), findsOneWidget);
    expect(eventsOf(w.c, w.novel).single.name, 'The siege', reason: 'the main timeline is never touched');
    expect(eventsOf(w.c, w.novel).single.id, siege);
  });

  testWidgets('the drawn timeline shows events on tracks, lists them, and opens the one chosen', (tester) async {
    final semantics = tester.ensureSemantics();
    final w = await setUpNovel(tester, location: '/visualize/timeline');
    final bren = w.c.read(characterServiceProvider).change(w.novel, (x) => x.create(name: 'Bren')).id;
    final feast = timelineIn(w.c, w.novel, (x) {
      final feast = x.createEvent('The feast');
      x.updateEvent(
        feast,
        (_) => {
          'when': {'precision': 'approximate', 'year': 12},
          'characters': [
            {'id': w.mira, 'age': null},
            {'id': bren, 'age': null},
          ],
        },
      );
      final war = x.createEvent('The war');
      x.updateEvent(
        war,
        (_) => {
          'when': {'precision': 'exact', 'year': 9, 'month': 1, 'day': 1},
          'ongoing': true,
        },
      );
      x.createEvent('A rumour');
      return feast;
    });
    await tester.pumpAndSettle();
    expect(find.textContaining('Timeline of 2 dated events, in the order they happen.'), findsOneWidget);
    expect(find.textContaining('A rumour: No date yet'), findsOneWidget);
    expect(
      find.semantics.byLabel(
        RegExp('^The feast, Around Year 12, somewhere in that stretch of time, on the All events track'),
      ),
      findsOneWidget,
    );

    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, 'Tracks by'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Characters').last);
    await tester.pumpAndSettle();
    expect(find.textContaining('on 3 tracks'), findsOneWidget, reason: 'Bren, Mira, and not linked to any character');
    expect(find.semantics.byLabel(RegExp(r'^The feast, .* on the (Mira|Bren) track$')), findsNWidgets(2));

    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('The feast').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Open the event'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open the event'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/plan/event/$feast');
    semantics.dispose();
  });

  testWidgets('story order beside reading order says how the book is told, and why', (tester) async {
    final w = await setUpNovel(tester, location: '/visualize/order');
    final store = w.c.read(novelStoreProvider);
    timelineIn(w.c, w.novel, (x) {
      for (final (i, title) in ['Prologue', 'One'].indexed) {
        x.put('chapters', {
          'id': 'ch$i',
          'projectId': w.novel,
          'parentId': null,
          'kind': 'chapter',
          'title': title,
          'order': i,
        });
      }
      final duel = x.createEvent('The duel');
      x.updateEvent(
        duel,
        (_) => {
          'when': {'precision': 'exact', 'year': 20},
          'nodeIds': ['ch0'],
        },
      );
      final childhood = x.createEvent('Childhood');
      x.updateEvent(
        childhood,
        (_) => {
          'when': {'precision': 'exact', 'year': 1},
          'nodeIds': ['ch1'],
        },
      );
    });
    await tester.pumpAndSettle();
    expect(find.text('Not told in story order: 1 telling goes back in time.'), findsOneWidget);
    expect(
      find.textContaining('“Childhood” is told in Ch 2: One, after “The duel” (Ch 1: Prologue), which happens later.'),
      findsOneWidget,
    );
    await tester.tap(find.text('List'));
    await tester.pumpAndSettle();
    expect(find.text('Ch 2: One: Childhood'), findsOneWidget);
    expect(store.rowsIn(w.novel, 'chapters').map((c) => c['order']), [0, 1], reason: 'no chapter moves');
  });

  testWidgets('a character’s history gathers their life, with ages as exact as the dates allow', (tester) async {
    final w = await setUpNovel(tester, location: '/organize');
    timelineIn(w.c, w.novel, (x) {
      final born = x.createEvent('Mira is born');
      x.updateEvent(
        born,
        (_) => {
          'when': {'precision': 'exact', 'year': 1000, 'month': 3, 'day': 1},
          'characters': [
            {'id': w.mira, 'age': 0},
          ],
        },
      );
      final siege = x.createEvent('The siege');
      x.updateEvent(
        siege,
        (_) => {
          'when': {'precision': 'approximate', 'year': 1026},
          'characters': [
            {'id': w.mira, 'age': null},
          ],
        },
      );
    });
    w.c.read(routerProvider).go('/organize/character/${w.mira}?tab=history');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mira’s whole life history'));
    await tester.pumpAndSettle();
    expect(currentLocation(w.c), '/visualize/history?who=${w.mira}');
    expect(find.text('Born on Year 1000, March 1, worked out from their birth, “Mira is born”.'), findsOneWidget);
    expect(find.text('Around Year 1026 · Age 25–26 · takes part'), findsOneWidget);
  });

  testWidgets('the timeline review explains each finding, keeps a decision, and reopens it', (tester) async {
    final w = await setUpNovel(tester, location: '/review/timeline');
    timelineIn(w.c, w.novel, (x) {
      final id = x.createEvent('The long night');
      x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 12},
          'end': {'precision': 'exact', 'year': 10},
        },
      );
    });
    await tester.pumpAndSettle();
    expect(find.text('Ends before it starts'), findsOneWidget);
    expect(find.text('“The long night” ends before it starts.'), findsOneWidget);
    expect(find.text('Because: It starts Year 12 and ends Year 10.'), findsOneWidget);
    await tester.tap(find.text('Mark as intentional…'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Time travel'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save as intentional'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing to look at'), findsWidgets);
    expect(find.text('Your note: Time travel'), findsOneWidget);
    await tester.tap(find.text('Reopen'));
    await tester.pumpAndSettle();
    expect(find.text('“The long night” ends before it starts.'), findsOneWidget);
    expect(eventsOf(w.c, w.novel).single.name, 'The long night', reason: 'nothing changes the story');
  });

  testWidgets('timeline pages work on a phone at 200% text size', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final w = await setUpNovel(tester, size: phone);
    final id = timelineIn(w.c, w.novel, (x) {
      final id = x.createEvent('The long siege of the city at the edge of the world');
      x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 10, 'minute': 30},
          'end': {'precision': 'approximate', 'year': 1022, 'season': 'winter'},
          'characters': [
            {'id': w.mira, 'age': 30},
          ],
        },
      );
      return id;
    });
    timelineIn(w.c, w.novel, (x) => x.createHistory(name: 'What if the long siege had never ended at all'));
    for (final location in [
      '/plan',
      '/plan/event/$id',
      '/plan/calendar',
      '/plan/histories',
      '/visualize/timeline',
      '/visualize/order',
      '/visualize/history?who=${w.mira}',
      '/review/timeline',
    ]) {
      w.c.read(routerProvider).go(location);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: location);
    }
  });
}
