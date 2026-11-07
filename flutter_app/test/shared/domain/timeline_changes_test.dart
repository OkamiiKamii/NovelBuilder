// The timeline's changes: what an event, the calendar and alternate histories store, checked as the original's
// timeline, calendar and history services check them (src/modules/timeline/service.ts, calendarService.ts,
// historyService.ts), and what reading the timeline never changes.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/delete_policy.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/timeline/chronology.dart';
import 'package:novel_builder/shared/domain/timeline/event_changes.dart';
import 'package:novel_builder/shared/domain/timeline/histories.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart';

class _Novel {
  NovelSnapshot snapshot = NovelSnapshot(
    project: {'id': 'novel', 'title': 'Ashfall'},
    collections: {
      'loreEntries': [
        {'id': 'mira', 'projectId': 'novel', 'category': 'character', 'name': 'Mira'},
        {'id': 'bren', 'projectId': 'novel', 'category': 'character', 'name': 'Bren'},
        {'id': 'keep', 'projectId': 'novel', 'category': 'location', 'name': 'The Keep'},
        {'id': 'guild', 'projectId': 'novel', 'category': 'faction', 'name': 'The Guild'},
      ],
      'chapters': [
        {'id': 'ch1', 'projectId': 'novel', 'parentId': null, 'kind': 'chapter', 'title': 'One', 'order': 0},
        {'id': 'ch2', 'projectId': 'novel', 'parentId': null, 'kind': 'chapter', 'title': 'Two', 'order': 1},
      ],
      'plotThreads': [
        {'id': 'thread', 'projectId': 'novel', 'title': 'The curse'},
      ],
    },
  );
  var _ids = 0;

  T change<T>(T Function(EventChanges x) f) {
    final c = EventChanges(snapshot, now: 1000, createId: () => 'id${++_ids}');
    final out = f(c);
    snapshot = c.snapshot;
    return out;
  }

  TimelineEvent event(String id) => TimelineEvent(snapshot.rows('timelineEvents').firstWhere((r) => r['id'] == id));
  JsonMap raw(String id) => event(id).raw;
}

void main() {
  test('a new event has nothing the author did not give it: no date, so it waits under “Not placed in time”', () {
    final n = _Novel();
    final id = n.change((x) => x.createEvent('  The siege  '));
    final e = n.raw(id);
    expect(
      [e['name'], e['when'], e['duration'], e['importance'], e['characters']],
      [
        'The siege',
        {'precision': 'unknown'},
        null,
        'minor',
        <Object?>[],
      ],
    );
    expect(n.change((x) => x.createEvent('  ')), isNotEmpty);
    expect(n.event('id2').name, 'New event');
  });

  test('every field is checked before it is stored; what does not fit is not stored', () {
    final n = _Novel();
    final id = n.change((x) => x.createEvent('The siege'));
    n.change(
      (x) => x.updateEvent(
        id,
        (_) => {
          'name': '   ',
          'when': {'precision': 'exact', 'year': 1020, 'month': null, 'day': 4, 'hour': 3},
          'locationId': 'guild',
          'characters': [
            {'id': 'mira', 'age': '17'},
            {'id': 'mira', 'age': 3},
            {'id': 'guild', 'age': 1},
            {'id': 'gone', 'age': 1},
            {'id': 'bren', 'age': -2},
          ],
          'entryIds': ['guild', 'gone', 'guild'],
          'nodeIds': ['ch2', 'nowhere'],
          'afterId': id,
          'threadIds': ['thread', 'other'],
          'labels': ['  mystery   CLUE ', 'Mystery clue', '', 'mine'],
          'status': 'someday',
          'canon': 'maybe',
          'importance': 'enormous',
        },
      ),
    );
    final e = n.raw(id);
    expect(e['name'], 'Untitled event');
    expect(e['when'], {'precision': 'exact', 'year': 1020, 'month': null, 'day': null, 'hour': null, 'minute': null});
    expect(e['locationId'], isNull, reason: 'a faction is not a place');
    expect(e['characters'], [
      {'id': 'mira', 'age': 17},
      {'id': 'bren', 'age': null},
    ]);
    expect(
      [e['entryIds'], e['nodeIds'], e['afterId'], e['threadIds']],
      [
        ['guild'],
        ['ch2'],
        null,
        ['thread'],
      ],
    );
    expect(e['labels'], ['Mystery clue', 'mine']);
    expect([e['status'], e['canon'], e['importance']], ['confirmed', 'canon', 'minor']);
  });

  test('how long an event lasts is said one way at a time: a duration, an end, or still going on', () {
    final n = _Novel();
    final id = n.change((x) => x.createEvent('The war'));
    void set(JsonMap changes) => n.change((x) => x.updateEvent(id, (_) => changes));
    set({
      'duration': {'amount': 3, 'unit': 'years'},
    });
    expect(
      [n.raw(id)['duration'], n.raw(id)['end'], n.raw(id)['ongoing']],
      [
        {'amount': 3, 'unit': 'years'},
        null,
        false,
      ],
    );
    set({
      'end': {'precision': 'approximate', 'year': 12, 'season': 'spring'},
    });
    expect([n.raw(id)['duration'], n.raw(id)['ongoing']], [null, false]);
    expect(mapOrNull(n.raw(id)['end'])!['season'], 'spring');
    set({'ongoing': true});
    expect([n.raw(id)['duration'], n.raw(id)['end'], n.raw(id)['ongoing']], [null, null, true]);
    set({
      'duration': {'amount': 0, 'unit': 'days'},
    });
    expect(n.raw(id)['duration'], isNull, reason: 'no length is no duration');
    expect(n.raw(id)['ongoing'], isTrue, reason: 'an empty duration says nothing about the end');
  });

  test('a relative date points at another event of the novel, never at itself', () {
    final n = _Novel();
    final a = n.change((x) => x.createEvent('A'));
    final b = n.change((x) => x.createEvent('B'));
    n.change(
      (x) => x.updateEvent(
        b,
        (_) => {
          'when': {'precision': 'relative', 'anchorId': b, 'amount': 2, 'unit': 'days', 'direction': 'after'},
        },
      ),
    );
    expect(mapOrNull(n.raw(b)['when'])!['anchorId'], isNull);
    n.change(
      (x) => x.updateEvent(
        b,
        (_) => {
          'when': {'precision': 'relative', 'anchorId': a, 'amount': -2, 'unit': 'fortnights', 'direction': 'x'},
        },
      ),
    );
    expect(n.raw(b)['when'], {
      'precision': 'relative',
      'anchorId': a,
      'amount': 2,
      'unit': 'years',
      'direction': 'before',
    });
  });

  test('a chapter’s role in telling an event lasts as long as the event is told there', () {
    final n = _Novel();
    final id = n.change((x) => x.createEvent('The duel'));
    n.change(
      (x) => x.updateEvent(
        id,
        (_) => {
          'nodeIds': ['ch1', 'ch2'],
          'reveals': [
            {'nodeId': 'ch1', 'role': 'flashforward'},
            {'nodeId': 'ch1', 'role': 'flashback'},
            {'nodeId': 'ch2', 'role': 'told'},
            {'nodeId': 'elsewhere', 'role': 'mentioned'},
            {'nodeId': 'ch2', 'role': 'sung'},
          ],
        },
      ),
    );
    expect(n.raw(id)['reveals'], [
      {'nodeId': 'ch1', 'role': 'flashforward'},
    ]);
    n.change(
      (x) => x.updateEvent(
        id,
        (_) => {
          'nodeIds': ['ch2'],
        },
      ),
    );
    expect(n.raw(id)['reveals'], isEmpty, reason: 'taking the chapter off takes its role');
  });

  test('saving a calendar is checked first, and never changes an event', () {
    final n = _Novel();
    final id = n.change((x) => x.createEvent('The council'));
    n.change(
      (x) => x.updateEvent(
        id,
        (_) => {
          'when': {'precision': 'exact', 'year': 10, 'month': 12, 'day': 31},
        },
      ),
    );
    final before = n.raw(id);
    expect(
      () => n.change((x) => x.saveCalendar({'kind': 'custom', 'name': '', 'months': [], 'hoursPerDay': 0})),
      throwsA(isA<ChangeRefused>()),
    );
    expect(n.snapshot.rows('storyCalendars'), isEmpty);
    n.change(
      (x) => x.saveCalendar({
        'kind': 'custom',
        'name': ' The Reckoning ',
        'months': [
          {'name': 'Thaw', 'days': 40},
          {'name': 'Frost', 'days': 40},
        ],
        'hoursPerDay': 20,
        'daysPerWeek': 6,
        'eras': [
          {'name': 'Second Age', 'startYear': 1000},
          {'name': 'First Age', 'startYear': 0},
        ],
        'seasons': {'spring': 1, 'summer': 1, 'autumn': 2, 'winter': 2},
      }),
    );
    final row = n.snapshot.rows('storyCalendars').single;
    expect(
      [row['name'], (row['eras']! as List).first],
      [
        'The Reckoning',
        {'name': 'First Age', 'startYear': 0},
      ],
    );
    expect(jsonEquals(n.raw(id), before), isTrue, reason: 'the stored date is left as it was');
    final placed = resolveChronology(
      StoryModel.fromSnapshot(n.snapshot).events.values,
      StoryModel.fromSnapshot(n.snapshot).calendar,
    );
    expect(placed.single.issues.single, contains('Month 12 is not in The Reckoning, which has 2 months.'));
  });

  test('alternate histories keep only their differences, inside themselves, and never touch the main timeline', () {
    final n = _Novel();
    final siege = n.change((x) => x.createEvent('The siege'));
    final feast = n.change((x) => x.createEvent('The feast'));
    n.change(
      (x) => x.updateEvent(
        siege,
        (_) => {
          'when': {'precision': 'exact', 'year': 10},
          'locationId': 'keep',
        },
      ),
    );
    final main = [
      for (final r in n.snapshot.rows('timelineEvents')) {...r},
    ];
    final h = n.change((x) => x.createHistory(name: 'If the Keep fell', baseId: 'nobody', originEventId: 'gone'));
    expect([n.change((x) => x.history(h)).baseId, n.change((x) => x.history(h)).originEventId], [null, null]);

    // The same as the base: nothing is kept.
    n.change((x) => x.changeHistoryEvent(h, siege, {'name': 'The siege', 'locationId': 'keep', 'ongoing': false}));
    expect(n.change((x) => x.history(h)).changed, isEmpty);
    n.change(
      (x) => x.changeHistoryEvent(h, siege, {
        'when': {'precision': 'exact', 'year': 12},
        'locationId': 'mira',
      }),
    );
    expect(n.change((x) => x.history(h)).changed[siege], {
      'when': {'precision': 'exact', 'year': 12, 'month': null, 'day': null, 'hour': null, 'minute': null},
      'locationId': null,
    });
    n.change((x) => x.removeHistoryEvent(h, feast));
    final only = n.change((x) => x.addHistoryEvent(h, 'The parley'));
    final events = historyEvents(
      {for (final r in n.snapshot.rows('timelineEvents')) str(r['id']): TimelineEvent(r)},
      {for (final r in n.snapshot.rows('alternateHistories')) str(r['id']): AlternateHistory(r)},
      h,
    );
    expect(events.keys.toSet(), {siege, only});
    expect(mapOrNull(events[siege]!.raw['when'])!['year'], 12);
    expect(n.snapshot.rows('timelineEvents').any((r) => r['id'] == only), isFalse, reason: 'kept inside the history');
    expect(
      () => n.change((x) => x.changeHistoryEvent(h, only, {'name': 'x'})),
      throwsA(isA<ChangeRefused>()),
      reason: 'an added event is changed as an added event',
    );

    // A history based on this one is based on its base when it goes.
    final child = n.change((x) => x.createHistory(name: 'Further', baseId: h));
    n.change((x) => x.removeHistory(h));
    expect(n.change((x) => x.history(child)).baseId, isNull);
    expect(jsonEquals(n.snapshot.rows('timelineEvents'), main), isTrue, reason: 'the main timeline is never touched');
  });

  test('deleting an event takes its connections with it; events that followed it keep everything and are flagged', () {
    final n = _Novel();
    final a = n.change((x) => x.createEvent('A'));
    final b = n.change((x) => x.createEvent('B'));
    n.change((x) => x.updateEvent(b, (_) => {'afterId': a}));
    final after = planDelete(n.snapshot, EntityRef(EntityType.event, a)).snapshot;
    final model = StoryModel.fromSnapshot(after);
    expect(model.events.keys, [b]);
    expect(model.events[b]!.afterId, a, reason: 'kept, so the author can place it again');
    expect(
      resolveChronology(model.events.values).single.issues,
      contains('It is set to follow an event that no longer exists.'),
    );
  });

  test('moving a chapter changes only reading order, never when anything happens', () {
    final n = _Novel();
    final early = n.change((x) => x.createEvent('Childhood'));
    final late = n.change((x) => x.createEvent('The duel'));
    n.change(
      (x) => x.updateEvent(
        early,
        (_) => {
          'when': {'precision': 'exact', 'year': 1},
          'nodeIds': ['ch2'],
        },
      ),
    );
    n.change(
      (x) => x.updateEvent(
        late,
        (_) => {
          'when': {'precision': 'exact', 'year': 20},
          'nodeIds': ['ch1'],
        },
      ),
    );
    final before = twoOrders(StoryModel.fromSnapshot(n.snapshot));
    expect(orderSummary(before), 'Not told in story order: 1 telling goes back in time.');
    final moved = n.snapshot.withRows('chapters', [
      for (final c in n.snapshot.rows('chapters')) {...c, 'order': c['id'] == 'ch1' ? 1 : 0},
    ]);
    final after = twoOrders(StoryModel.fromSnapshot(moved));
    expect(orderSummary(after), 'Told in story order: the reader meets the events in the order they happen.');
    expect([for (final e in after.events) e.id], [for (final e in before.events) e.id]);
    expect(jsonEquals(moved.rows('timelineEvents'), n.snapshot.rows('timelineEvents')), isTrue);
  });
}
