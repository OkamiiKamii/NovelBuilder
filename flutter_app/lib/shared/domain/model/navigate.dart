import '../collation.dart';
import '../records/canon.dart';
import '../records/thread.dart';
import '../relationships/relation_types.dart';
import '../stable_sort.dart';
import '../timeline/dates.dart' show localeNumber;
import '../timeline/event_record.dart';
import '../timeline/overlap.dart';
import 'connections.dart';
import 'entity_ref.dart';
import 'story_model.dart';
import 'story_order.dart';

/// SELECTION AND NAVIGATION. Whatever a view shows, selecting it means the same thing everywhere: its details show in
/// a shared panel ([detailsOf]), it opens on the page where it is kept, and other views mark it and what it is
/// connected to ([relatedIds]). All by stable id, within one novel; a record deleted since is reported as gone.

typedef DetailItem = ({EntityRef ref, String label, String note});

class Details {
  Details(this.view, this.facts, this.groups);
  final EntityView view;

  /// Plain facts about the record itself: its date, status, category.
  final List<({String label, String value})> facts;

  /// What it is connected to, grouped by how.
  final List<({String title, List<DetailItem> items})> groups;
}

/// How a group of connections reads from the selected record's side: (what it reaches, what reaches it).
const _groups = <ConnectionKind, (String, String)>{
  ConnectionKind.partOf: ('Part of', 'Contains'),
  ConnectionKind.link: ('Connections', 'Connections'),
  ConnectionKind.relationship: ('Relationships', 'Relationships'),
  ConnectionKind.field: ('Linked by its fields', 'Linked from fields'),
  ConnectionKind.mentioned: ('Linked in the text of', 'Linked in its text'),
  ConnectionKind.present: ('In the plan of', 'In its plan'),
  ConnectionKind.appearance: ('Your appearance record: in', 'Your appearance records: who appears'),
  ConnectionKind.participant: ('Events they take part in', 'Who takes part'),
  ConnectionKind.involved: ('Events involved in', 'Also involved'),
  ConnectionKind.occursAt: ('Takes place at', 'Events here'),
  ConnectionKind.toldIn: ('Told in', 'Events told here'),
  ConnectionKind.follows: ('Comes after', 'Followed by'),
  ConnectionKind.datedFrom: ('Dated from', 'Dates others'),
  ConnectionKind.inThread: ('Plot threads', 'Events'),
  ConnectionKind.threadEntry: ('Involves', 'Plot threads'),
  ConnectionKind.beat: ('Develops in', 'Plot developments here'),
  ConnectionKind.resolvesIn: ('Meant to resolve in', 'Threads meant to resolve here'),
  ConnectionKind.holds: ('Abilities', 'Held by'),
  ConnectionKind.branchesFrom: ('Grows out of', 'Grows into'),
};

/// The wordings connections get when the author gave none: already said by the group's title.
const _plain = {
  'Part of',
  'Mentioned in',
  'Present in',
  'Takes part in',
  'Involved in',
  'Takes place at',
  'Told in',
  'Comes after',
  'Dated from',
  'Involves',
  'Develops in',
  'Meant to resolve in',
  'Has',
  'Branches from',
  'Related',
};

const _importance = {'minor': 'Minor', 'major': 'Major', 'climax': 'Climax'};
const _eventStatus = {'idea': 'Idea', 'planned': 'Planned', 'confirmed': 'Confirmed'};
const _threadStatus = {
  ThreadStatus.planned: 'Planned',
  ThreadStatus.active: 'Active',
  ThreadStatus.paused: 'Paused',
  ThreadStatus.resolved: 'Resolved',
  ThreadStatus.abandoned: 'Abandoned',
  ThreadStatus.retconned: 'Retconned',
  ThreadStatus.custom: 'Custom',
};

/// A thread's status as the author names it: their own words for a custom one. Null for a status this app does not
/// know (an edited file), which is shown as nothing rather than guessed.
String? threadStatusName(PlotThread t) {
  final known = ThreadStatus.values.where((s) => s.name == t.statusKey).firstOrNull;
  if (known == null) return null;
  return known == ThreadStatus.custom && (t.customStatus?.trim().isNotEmpty ?? false)
      ? t.customStatus!.trim()
      : _threadStatus[known]!;
}

List<({String label, String value})> _factsOf(StoryModel model, EntityRef ref) {
  final facts = <({String label, String value})>[];
  void add(String label, String? value) {
    if (value != null && value.isNotEmpty) facts.add((label: label, value: value));
  }

  switch (ref.type) {
    case EntityType.event:
      final e = eventRecord(model, ref.id)!;
      add('When', e.label);
      add('Significance', _importance[e.event.importanceKey]);
      add('Status', _eventStatus[e.event.statusKey] ?? 'Confirmed');
      add('Canon', (CanonStatus.of(e.event.canonKey) ?? CanonStatus.canon).label);
      add('Description', e.event.description.trim());
    case EntityType.entry:
      final entry = model.entries[ref.id]!;
      add('Kind', model.categories[entry.category]?.singular ?? entry.category);
      add('Summary', entry.summary.trim());
    case EntityType.node:
      final node = model.nodes[ref.id]!;
      add('Kind', node.kind?.label);
      add('Status', node.status.label);
      add('Words', node.wordCount != 0 ? localeNumber(node.wordCount) : null);
      add('Summary', node.summary.trim());
    case EntityType.thread:
      final thread = model.threads[ref.id]!;
      add('Status', threadStatusName(thread));
      add('Developments', '${thread.beats.length}');
    case EntityType.relation:
      final relation = model.relations[ref.id]!;
      final now = stageAt(relation, null, model.order);
      add(
        'Now',
        now == null
            ? 'Not yet begun'
            : (now.title.isNotEmpty ? now.title : (now.label.isNotEmpty ? now.label : 'Related')),
      );
      if (now != null) {
        final a = model.entries[relation.fromId]?.name ?? 'Someone';
        final b = model.entries[relation.toId]?.name ?? 'Someone';
        add(
          'Direction',
          now.directional
              ? '$a (${now.fromRole.isEmpty ? 'first' : now.fromRole}) → $b (${now.toRole.isEmpty ? 'second' : now.toRole})'
              : 'Both ways: $a and $b',
        );
        add('Feeling', Affinity.of(now.affinity)?.label);
      }
      add('Stages', '${relation.stages.length}');
    case EntityType.ability:
      final ability = model.abilities[ref.id]!;
      add('System', ability.system.name);
      add('Group', ability.group);
      add('Description', '${ability.item.raw['description'] ?? ''}'.trim());
  }
  return facts;
}

String _ageNote(StoryModel model, String eventId, String characterId) {
  final age = model.events[eventId]?.characters.where((c) => c.id == characterId).firstOrNull?.age;
  return age == null ? '' : 'Age ${age is int || age == age.truncate() ? age.toInt() : age}';
}

/// The details of a selected record: its facts, and everything it is connected to, grouped by how and worded from
/// its side. Null when the record does not exist (deleted since, or another novel's).
Details? detailsOf(StoryModel model, EntityRef ref) {
  final found = model.resolve(ref);
  if (found == null) return null;
  final groups = <String, List<DetailItem>>{};
  void add(String title, DetailItem item) {
    final list = groups.putIfAbsent(title, () => []);
    if (!list.any((i) => i.ref == item.ref && i.note == item.note)) list.add(item);
  }

  String label(EntityRef r) => model.resolve(r)?.label ?? r.id;
  for (final seen in connectionsOf(deriveConnections(model).connections, ref)) {
    final c = seen.connection;
    final titles = _groups[c.kind] ?? (c.label, c.label);
    final words = c.kind == ConnectionKind.participant
        ? _ageNote(model, c.to.id, c.from.id)
        : (seen.label.isNotEmpty ? seen.label : seen.theirLabel);
    final title = seen.outgoing ? titles.$1 : titles.$2;
    // A note says something the group title does not: the author's wording, an age, a flashback.
    final note = _plain.contains(words) || words == title ? '' : words;
    add(title, (ref: seen.other, label: label(seen.other), note: note));
  }
  // A relationship is a record in its own right: its two characters belong in its details.
  if (ref.type == EntityType.relation) {
    final relation = model.relations[ref.id]!;
    for (final id in [relation.fromId, relation.toId]) {
      final r = EntityRef(EntityType.entry, id);
      add('Between', (ref: r, label: label(r), note: ''));
    }
  }
  // Events sharing time with this one, whatever links them: what else is happening, and where. Never a warning.
  if (ref.type == EntityType.event) {
    for (final (:record, :how) in atTheSameTime(eventRecords(model), ref.id, model.calendar.minutesPerDay)) {
      final place = model.entries[record.event.locationId]?.name;
      add('At the same time', (
        ref: EntityRef(EntityType.event, record.id),
        label: record.title,
        note: place != null ? '${how.words} · at $place' : how.words,
      ));
    }
  }
  if (ref.type == EntityType.entry) {
    for (final relation in model.relations.values) {
      if (relation.fromId == ref.id || relation.toId == ref.id) {
        final r = EntityRef(EntityType.relation, relation.id);
        add('Relationship records', (ref: r, label: label(r), note: ''));
      }
    }
  }
  return Details(found, _factsOf(model, ref), [
    for (final e in groups.entries)
      (title: e.key, items: stableSorted(e.value, (a, b) => localeCompare(a.label, b.label))),
  ]);
}

/// The ids of what a record is directly connected to (and its own), for marking it in other views.
Set<String> relatedIds(StoryModel model, EntityRef ref) {
  final ids = {ref.id};
  for (final seen in connectionsOf(deriveConnections(model).connections, ref)) {
    ids.add(seen.other.id);
  }
  for (final relation in model.relations.values) {
    if (relation.id == ref.id) ids.addAll([relation.fromId, relation.toId]);
    if (relation.fromId == ref.id || relation.toId == ref.id) ids.add(relation.id);
  }
  return ids;
}
