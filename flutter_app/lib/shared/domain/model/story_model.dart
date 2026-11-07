import '../json.dart';
import '../records/calendar.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../records/event.dart';
import '../records/journey.dart';
import '../records/link.dart';
import '../records/novel.dart';
import '../records/progress.dart';
import '../records/relation.dart';
import '../records/story_node.dart';
import '../records/system.dart';
import '../records/thread.dart';
import '../snapshot/novel_snapshot.dart';
import 'entity_ref.dart';
import 'story_order.dart';
import 'validity.dart';

/// An ability as a record: the blueprint item, the system it belongs to, and its group's name.
class AbilityRecord {
  AbilityRecord(this.system, this.item, this.group);
  final SystemBlueprint system;
  final SysItem item;
  final String group;
}

/// SINGLE SOURCE OF TRUTH, READ ONCE: one novel's records indexed by id. This is a read model over the stored rows:
/// it adds no record and copies none. Every view reads this; every change goes through the owning record's
/// repository (Phase 3), never through the model.
class StoryModel {
  StoryModel._({
    required this.novel,
    required this.nodes,
    required this.order,
    required this.plans,
    required this.entries,
    required this.categories,
    required this.links,
    required this.relations,
    required this.events,
    required this.threads,
    required this.systems,
    required this.abilities,
    required this.sheets,
    required this.calendar,
    required this.progressCategories,
    required this.progress,
    required this.journeys,
  });

  factory StoryModel.fromSnapshot(NovelSnapshot s) {
    Map<String, T> index<T>(String collection, T Function(JsonMap) make) => {
      for (final r in s.rows(collection)) str(r['id']): make(r),
    };
    final nodes = index('chapters', StoryNode.new);
    final systems = index('systems', SystemBlueprint.new);
    final abilities = <String, AbilityRecord>{};
    for (final system in systems.values) {
      final groups = {for (final g in system.groups) g.id: g.name};
      for (final item in system.items) {
        abilities[abilityId(system.id, item.id)] = AbilityRecord(system, item, groups[item.groupId] ?? '');
      }
    }
    final calendarRows = s.rows('storyCalendars');
    return StoryModel._(
      novel: Novel(s.project),
      nodes: nodes,
      order: StoryOrder.of(nodes.values),
      plans: index('chapterPlans', ChapterPlan.new),
      entries: index('loreEntries', Entry.new),
      categories: {
        for (final c in resolveCategories([for (final r in s.rows('loreSchemas')) Category(r)])) c.key: c,
      },
      links: [for (final r in s.rows('loreLinks')) Link(r)],
      relations: index('characterRelations', CharacterRelation.new),
      events: index('timelineEvents', TimelineEvent.new),
      threads: index('plotThreads', PlotThread.new),
      systems: systems,
      abilities: abilities,
      sheets: [for (final r in s.rows('systemSheets')) SystemSheet(r)],
      calendar: Calendar.fromJson(calendarRows.isEmpty ? null : calendarRows.first),
      progressCategories: index('progressCategories', ProgressCategory.new),
      progress: [for (final r in s.rows('progressChanges')) ProgressChange(r)],
      journeys: [for (final r in s.rows('journeys')) Journey(r)],
    );
  }

  final Novel novel;
  final Map<String, StoryNode> nodes;
  final StoryOrder order;
  final Map<String, ChapterPlan> plans;
  final Map<String, Entry> entries;
  final Map<String, Category> categories;
  final List<Link> links;
  final Map<String, CharacterRelation> relations;
  final Map<String, TimelineEvent> events;
  final Map<String, PlotThread> threads;
  final Map<String, SystemBlueprint> systems;
  final Map<String, AbilityRecord> abilities;
  final List<SystemSheet> sheets;
  final Calendar calendar;
  final Map<String, ProgressCategory> progressCategories;
  final List<ProgressChange> progress;
  final List<Journey> journeys;

  /// The same novel with another course of events (an alternate history's); every other record is shared.
  StoryModel withEvents(Map<String, TimelineEvent> events) => StoryModel._(
    novel: novel,
    nodes: nodes,
    order: order,
    plans: plans,
    entries: entries,
    categories: categories,
    links: links,
    relations: relations,
    events: events,
    threads: threads,
    systems: systems,
    abilities: abilities,
    sheets: sheets,
    calendar: calendar,
    progressCategories: progressCategories,
    progress: progress,
    journeys: journeys,
  );

  late final TimeContext timeContext = TimeContext(position: order.position, events: events, calendar: calendar);

  Category categoryOf(String key) => categories[key] ?? Category.unknown(key);

  /// Finds a record by ref and says what it is called now. Null for a deleted record or another novel's. Never
  /// throws, so a stale link can always be shown for what it is.
  EntityView? resolve(EntityRef ref) {
    EntityView view(String label, String kind) => EntityView(ref, label, kind);
    switch (ref.type) {
      case EntityType.node:
        final node = nodes[ref.id];
        return node == null ? null : view(node.displayTitle, node.kindKey);
      case EntityType.entry:
        final entry = entries[ref.id];
        return entry == null ? null : view(entry.name, entry.category);
      case EntityType.event:
        final event = events[ref.id];
        return event == null ? null : view(event.name, 'event');
      case EntityType.thread:
        final thread = threads[ref.id];
        return thread == null ? null : view(thread.title, 'thread');
      case EntityType.relation:
        final relation = relations[ref.id];
        if (relation == null) return null;
        String name(String id) => entries[id]?.name ?? 'Someone';
        return view('${name(relation.fromId)} and ${name(relation.toId)}', 'relation');
      case EntityType.ability:
        final ability = abilities[ref.id];
        return ability == null ? null : view(ability.item.name, 'ability');
    }
  }

  bool exists(EntityRef ref) => resolve(ref) != null;
}
