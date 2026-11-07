import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/calendar.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/review.dart';
import '../../shared/domain/records/thread.dart';
import '../../shared/domain/stable_sort.dart';
import '../../shared/domain/timeline/chronology.dart';
import '../../shared/domain/timeline/event_changes.dart';
import '../../shared/domain/timeline/event_record.dart';
import '../../shared/domain/timeline/histories.dart';
import '../../shared/domain/timeline/review.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';
import 'data/timeline_service.dart';

final timelineServiceProvider = Provider<TimelineService>(
  (ref) => TimelineService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

/// Where an event's page is.
String eventPath(String eventId) => '/plan/event/$eventId';

/// The open novel's timeline as the screens read it: the same records the characters and world screens read, with
/// the timeline worked out from them. Nothing here is stored.
class TimelineData {
  TimelineData(this.cast);

  final CastData cast;
  StoryModel get model => cast.model;
  Calendar get calendar => model.calendar;
  String get novelId => cast.novelId;

  /// Every event in story order, with its date in words and its problems.
  late final List<Placed> placed = resolveChronology(model.events.values, calendar);
  late final Map<String, Placed> placedById = {for (final p in placed) p.event.id: p};

  /// Every event as every view reads it.
  late final List<EventRecord> records = eventRecords(model);
  late final Map<String, EventRecord> recordById = {for (final r in records) r.id: r};

  late final List<ReviewFinding> findings = reviewTimeline(model, cast.snapshot.rows('continuityRules'));
  late final List<ReviewItem> decisions = [for (final r in cast.snapshot.rows('continuityResolutions')) ReviewItem(r)];
  late final review = withDecisions(findings, decisions);

  /// Findings an event's page shows beside its own problems: those its other checks do not already raise.
  List<ReviewFinding> findingsOf(String eventId) => [
    for (final f in review.open)
      if (f.eventIds.contains(eventId) &&
          (f.rule == ReviewRule.dates || f.rule == ReviewRule.travel || f.rule == ReviewRule.twoPlaces))
        f,
  ];

  late final Map<String, AlternateHistory> histories = {
    for (final r in cast.snapshot.rows('alternateHistories')) str(r['id']): AlternateHistory(r),
  };

  /// Alternate histories, oldest first.
  late final List<AlternateHistory> historyList = stableSorted(
    histories.values,
    (a, b) => a.createdAt.compareTo(b.createdAt),
  );

  List<Entry> entriesOf(String category) => stableSorted([
    for (final e in cast.entries)
      if (e.category == category) e,
  ], (a, b) => localeCompare(a.name, b.name));

  late final List<Entry> places = entriesOf('location');

  late final List<PlotThread> threads = stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));

  String? eventName(String id) => model.events[id]?.name;
}

final timelineProvider = Provider.autoDispose<TimelineData?>((ref) {
  final cast = ref.watch(castProvider);
  return cast == null ? null : TimelineData(cast);
});

/// Changes to the open novel's timeline from a screen, beside everything a character screen can do.
class TimelineActions extends CharacterActions {
  TimelineActions(super.context, super.novelId);

  TimelineService get timeline => container.read(timelineServiceProvider);

  /// Makes a change now. A change that cannot be made as asked is said, and nothing is changed.
  T? edit<T>(T Function(EventChanges c) apply) {
    try {
      return timeline.change(novelId, apply);
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  /// Saves typing through autosave, under [key]: the newest text replaces a waiting save.
  void editLater(String key, void Function(EventChanges c) apply) {
    final service = timeline;
    container.read(saveControllerProvider).schedule('timeline:$novelId:$key', () {
      try {
        service.change(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  void openEvent(String eventId) {
    flush();
    router.go(eventPath(eventId));
  }
}
