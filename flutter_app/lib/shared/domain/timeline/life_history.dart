import '../characters/character_records.dart';
import '../collation.dart';
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/story_order.dart';
import '../model/validity.dart';
import '../records/event.dart';
import '../records/link.dart';
import '../relationships/relation_types.dart';
import '../stable_sort.dart';
import 'ages.dart';
import 'chronology.dart';
import 'dates.dart';
import 'event_record.dart';
import 'narrative.dart';
import 'scale.dart';

/// What kind of line a life history has.
enum HistoryItemKind {
  birth('Birth'),
  event('Event'),
  place('Place'),
  affiliation('Affiliation'),
  ability('Ability'),
  appearance('Appearance'),
  relationship('Relationship'),
  milestone('Milestone'),
  progress('Progression'),
  journey('Journey');

  const HistoryItemKind(this.label);
  final String label;
}

/// A page that opens a line that is not a record the model holds.
typedef HistoryLink = ({String page, String id});

class HistoryItem {
  HistoryItem({
    required this.key,
    required this.kind,
    required this.ref,
    required this.title,
    required this.detail,
    required this.when,
    required this.age,
    required this.order,
    this.to,
  });

  final String key;
  final HistoryItemKind kind;

  /// The shared record it comes from; null for a line [to] opens instead.
  final EntityRef? ref;
  final HistoryLink? to;
  final String title;

  /// More about it: where, how, until when.
  final String detail;

  /// When: a date in story time, or a chapter in reading order.
  final String when;

  /// Their age, for an event.
  final AgeAt? age;

  /// Where it sorts within its list: story time, or reading position.
  final double order;
}

class LifeHistory {
  LifeHistory({
    required this.name,
    required this.birth,
    required this.born,
    required this.story,
    required this.reading,
    required this.throughout,
    required this.issues,
  });

  final String name;
  final Birth birth;

  /// How their birth is known, in a sentence.
  final String born;
  final List<HistoryItem> story;
  final List<HistoryItem> reading;
  final List<HistoryItem> throughout;

  /// Things to check, in words. Nothing is changed.
  final List<String> issues;
}

bool _isUnknownTime(Anchor? at) => at is DateAnchor && at.when is UnknownDate;

/// When a progression change or a journey happens, in words.
String whenWords(Anchor? at, StoryModel model) {
  if (at == null) return 'Before the story';
  if (_isUnknownTime(at)) return 'When is not known';
  return switch (at) {
    NodeAnchor(:final nodeId) =>
      model.nodes.containsKey(nodeId) ? nodeLabel(model, nodeId) : 'A chapter that was deleted',
    EventAnchor(:final eventId) => 'At “${model.events[eventId]?.name ?? 'a deleted event'}”',
    DateAnchor(when: final date) => formatDate(date, (id) => model.events[id]?.name, model.calendar),
  };
}

const _maxSafe = 9007199254740991.0;

/// A CHARACTER'S LIFE, FROM THE RECORDS: everything the novel already records about one character, put together. Each
/// line is a reference to the record it comes from; nothing is copied, and nothing is recorded here. Story time and
/// reading order are kept apart: events and ties dated by an event or a date in story time; appearances, relationship
/// changes, snapshots, milestones and ties dated by a chapter as the reader meets them; the rest throughout.
LifeHistory? lifeHistory(
  StoryModel model,
  String characterId, {
  List<JsonMap> snapshots = const [],
  List<CharacterHistoryLine> milestones = const [],
}) {
  final me = model.entries[characterId];
  if (me == null) return null;
  final calendar = model.calendar;
  final context = model.timeContext;
  final placed = resolveChronology(model.events.values, calendar);
  // Story time for an event: its own, or for an undated one placed after another, just after that one's.
  final storyTime = <String, double>{};
  var last = double.negativeInfinity;
  for (final (i, p) in placed.indexed) {
    if (!p.anchored) continue;
    if (p.value != null) last = p.value!;
    storyTime[p.event.id] = (last.isFinite ? last : -1e15) + i * 1e-6;
  }
  String nameOf(EntityRef ref) =>
      switch (ref.type) {
        EntityType.entry => model.entries[ref.id]?.name,
        EntityType.ability => model.abilities[ref.id]?.item.name,
        EntityType.event => model.events[ref.id]?.name,
        _ => null,
      } ??
      'a deleted record';
  double position(String? nodeId) => nodeId == null ? -1 : (model.order.position[nodeId]?.toDouble() ?? _maxSafe);
  String chapter(String? nodeId) => nodeId == null ? 'Before the story' : nodeLabel(model, nodeId);

  final story = <HistoryItem>[];
  final reading = <HistoryItem>[];
  final throughout = <HistoryItem>[];
  final seen = connectionsOf(deriveConnections(model).connections, EntityRef(EntityType.entry, characterId));

  // Events: as a participant, as involved, or through a typed link.
  final how = <String, String>{};
  for (final s in seen) {
    final kind = s.connection.kind;
    // Progression changes at an event are lines of their own (below), not a way of taking part in it.
    if (s.other.type != EntityType.event || !model.events.containsKey(s.other.id)) continue;
    if (kind == ConnectionKind.progress || kind == ConnectionKind.travel) continue;
    final words = kind == ConnectionKind.participant
        ? 'takes part'
        : kind == ConnectionKind.involved
        ? 'involved'
        : (s.label.isNotEmpty ? s.label : connectionType(s.connection.type).label);
    if (!how.containsKey(s.other.id) || kind == ConnectionKind.participant) how[s.other.id] = words;
  }
  final birthDate = birthDateOf(me);
  final ages = agesOf(characterId, model.events, calendar: calendar, birthDate: birthDate, eventIds: [...how.keys]);
  for (final MapEntry(key: eventId, value: words) in how.entries) {
    final e = eventRecord(model, eventId)!;
    final place = e.event.locationId == null ? null : model.entries[e.event.locationId]?.name;
    story.add(
      HistoryItem(
        key: 'event:$eventId',
        kind: HistoryItemKind.event,
        ref: EntityRef(EntityType.event, eventId),
        title: e.title,
        detail: [words, if (place != null && place.isNotEmpty) 'at $place'].join(' · '),
        when: e.span != null ? e.label : 'Not placed in time',
        age: ages.at[eventId],
        order: storyTime[eventId] ?? double.infinity,
      ),
    );
  }
  if (birthDate != null && ages.birth.basis.any((b) => b.startsWith('the date of birth'))) {
    story.add(
      HistoryItem(
        key: 'birth',
        kind: HistoryItemKind.birth,
        ref: EntityRef(EntityType.entry, characterId),
        title: 'Born',
        detail: 'the date of birth on their profile',
        when: birthDate,
        age: null,
        order: ages.birth.span?.lo ?? double.negativeInfinity,
      ),
    );
  }

  // Ties the author made as connections, placed by when they hold.
  String anchorWords(Anchor a) => switch (a) {
    NodeAnchor(:final nodeId) => chapter(nodeId),
    EventAnchor(:final eventId) => '“${model.events[eventId]?.name ?? 'a deleted event'}”',
    DateAnchor(when: final date) => formatDate(date, (id) => model.events[id]?.name, calendar),
  };
  for (final s in seen) {
    final kind = s.connection.kind;
    if (kind != ConnectionKind.link && kind != ConnectionKind.field) continue;
    if (s.other.type != EntityType.entry && s.other.type != EntityType.ability) continue;
    final other = s.other.type == EntityType.entry ? model.entries[s.other.id] : null;
    final itemKind = s.other.type == EntityType.ability
        ? HistoryItemKind.ability
        : other?.category == 'location'
        ? HistoryItemKind.place
        : other?.category == 'character'
        ? HistoryItemKind.relationship
        : HistoryItemKind.affiliation;
    final typeWords = kind == ConnectionKind.link ? connectionType(s.connection.type).label : '';
    final words = s.label.isNotEmpty ? s.label : (typeWords.isNotEmpty ? typeWords : 'Linked to');
    final from = s.connection.validity?.from;
    final until = s.connection.validity?.until;
    final span = [
      if (from != null) 'from ${anchorWords(from)}',
      if (until != null) 'until ${anchorWords(until)}',
    ].join(' ');
    HistoryItem item(String when, double order) => HistoryItem(
      key: 'link:${s.connection.id}:${s.outgoing}',
      kind: itemKind,
      ref: s.other,
      title: '$words ${nameOf(s.other)}',
      detail: span,
      when: when,
      age: null,
      order: order,
    );
    final anchor = from ?? until;
    switch (anchor) {
      case null:
        throughout.add(item('No time given', 0));
      case NodeAnchor(:final nodeId):
        reading.add(item(chapter(nodeId), position(nodeId)));
      case EventAnchor(:final eventId):
        // Dated from an event, it comes just after that event.
        final at = spanOfEvent(eventId, context);
        story.add(
          item(
            anchorWords(anchor),
            storyTime.containsKey(eventId) ? storyTime[eventId]! + 1e-7 : (at?.lo ?? double.infinity),
          ),
        );
      case DateAnchor(when: final date):
        story.add(item(anchorWords(anchor), spanOfDate(date, context)?.lo ?? double.infinity));
    }
  }

  // Appearances: the author's appearance records, and the other records that tie them to a chapter (linked in its
  // text or listed in its plan).
  final appearances = <String, ({String? record, List<String> ways})>{};
  for (final s in seen) {
    final kind = s.connection.kind;
    if (s.other.type != EntityType.node) continue;
    if (kind != ConnectionKind.mentioned && kind != ConnectionKind.present && kind != ConnectionKind.appearance) {
      continue;
    }
    var at = appearances[s.other.id] ?? (record: null, ways: <String>[]);
    if (kind != ConnectionKind.appearance) {
      at.ways.add(kind == ConnectionKind.mentioned ? 'linked in the text' : 'in the chapter plan');
    } else if (s.connection.id.startsWith('pov:')) {
      at = (record: at.record ?? 'pov', ways: at.ways..add('their point of view'));
    } else if (s.connection.label.startsWith('Mentioned')) {
      at = (
        record: at.record != 'appears' ? 'mentioned' : at.record,
        ways: at.ways..add('mentioned, not on the page (your appearance record)'),
      );
    } else {
      at = (record: 'appears', ways: at.ways..add('on the page (your appearance record)'));
    }
    appearances[s.other.id] = at;
  }
  const verb = {'appears': 'Appears in', 'mentioned': 'Mentioned in', 'pov': 'Point of view in'};
  String andList(List<String> list) =>
      list.length > 2 ? '${list.sublist(0, list.length - 1).join(', ')} and ${list.last}' : list.join(' and ');
  for (final MapEntry(key: nodeId, value: (:record, :ways)) in appearances.entries) {
    reading.add(
      HistoryItem(
        key: 'node:$nodeId',
        kind: HistoryItemKind.appearance,
        ref: EntityRef(EntityType.node, nodeId),
        title: '${record != null ? verb[record] : 'Appears in'} ${nodeLabel(model, nodeId)}',
        detail: andList({...ways}.toList()),
        when: chapter(nodeId),
        age: null,
        order: position(nodeId),
      ),
    );
  }

  // Relationship changes, each stage from where it begins.
  for (final relation in model.relations.values) {
    if (relation.fromId != characterId && relation.toId != characterId) continue;
    final otherId = relation.fromId == characterId ? relation.toId : relation.fromId;
    final otherName = model.entries[otherId]?.name ?? 'someone deleted';
    for (final (i, stage) in sortedStages(relation, model.order).indexed) {
      final what = stage.title.isNotEmpty ? stage.title : (stage.label.isNotEmpty ? stage.label : 'related');
      reading.add(
        HistoryItem(
          key: 'relation:${relation.id}:${stage.id}',
          kind: HistoryItemKind.relationship,
          ref: EntityRef(EntityType.relation, relation.id),
          title: '${i == 0 ? 'Relationship with' : 'Relationship changes with'} $otherName: $what',
          detail: Affinity.of(stage.affinity)?.label ?? '',
          when: chapter(stage.startNodeId),
          age: null,
          order: position(stage.startNodeId),
        ),
      );
    }
  }

  // Ability and state changes, as the progression tracker records them; and the author's milestones.
  for (final snap in snapshots.where((s) => s['entryId'] == characterId)) {
    final label = str(snap['label']).trim();
    final nodeId = idOrNull(snap['nodeId']);
    reading.add(
      HistoryItem(
        key: 'snap:${snap['id']}',
        kind: HistoryItemKind.ability,
        ref: null,
        to: (page: 'progression', id: str(snap['id'])),
        title: label.isNotEmpty ? label : 'State recorded',
        detail: 'progression snapshot',
        when: chapter(nodeId),
        age: null,
        order: position(nodeId),
      ),
    );
  }
  for (final line in milestones.where((m) => m.entryId == characterId && m.isStory)) {
    reading.add(
      HistoryItem(
        key: 'milestone:${line.id}',
        kind: HistoryItemKind.milestone,
        ref: null,
        to: (page: 'history', id: line.id),
        title: line.text,
        detail: 'milestone',
        when: chapter(line.nodeId),
        age: null,
        order: position(line.nodeId),
      ),
    );
  }

  // Progression changes, placed by when they happen.
  for (final change in model.progress.where((c) => c.entryId == characterId)) {
    final category = model.progressCategories[change.categoryId];
    final at = change.at;
    HistoryItem item(double order) => HistoryItem(
      key: 'progress:${change.id}',
      kind: HistoryItemKind.progress,
      ref: null,
      to: (page: 'tracker', id: change.id),
      title: changeWords(change, category, model),
      detail: [
        if (category != null && category.name.isNotEmpty) category.name,
        if (str(change.raw['cost']).isNotEmpty) 'cost: ${str(change.raw['cost'])}',
      ].join(' · '),
      when: whenWords(at, model),
      age: null,
      order: order,
    );
    switch (at) {
      case null:
        reading.add(item(position(null)));
      case NodeAnchor(:final nodeId):
        reading.add(item(position(nodeId)));
      case _ when _isUnknownTime(at):
        throughout.add(item(2));
      case EventAnchor(:final eventId):
        final span = spanOfEvent(eventId, context);
        story.add(item(storyTime.containsKey(eventId) ? storyTime[eventId]! + 2e-7 : (span?.lo ?? double.infinity)));
      case DateAnchor(when: final date):
        story.add(item(spanOfDate(date, context)?.lo ?? double.infinity));
    }
  }

  // Journeys, placed by when they set out (or arrive, when that is all that is known).
  for (final journey in model.journeys.where((j) => j.travellerIds.contains(characterId))) {
    String place(String? id) =>
        id == null ? 'somewhere not recorded' : (model.entries[id]?.name ?? 'a place that is gone');
    final at = journey.departure ?? journey.arrival;
    HistoryItem item(double order) => HistoryItem(
      key: 'journey:${journey.id}',
      kind: HistoryItemKind.journey,
      ref: null,
      to: (page: 'journeys', id: journey.id),
      title: 'Travels from ${place(journey.fromId)} to ${place(journey.toId)}',
      detail: str(journey.raw['method']),
      when: at == null ? 'When is not known' : whenWords(at, model),
      age: null,
      order: order,
    );
    switch (at) {
      case null:
        throughout.add(item(3));
      case NodeAnchor(:final nodeId):
        reading.add(item(position(nodeId)));
      case EventAnchor(:final eventId):
        final span = spanOfEvent(eventId, context);
        story.add(item(storyTime.containsKey(eventId) ? storyTime[eventId]! + 3e-7 : (span?.lo ?? double.infinity)));
      case DateAnchor(when: final date):
        story.add(item(spanOfDate(date, context)?.lo ?? double.infinity));
    }
  }

  // The abilities on their system sheets: held, with no time given.
  for (final sheet in model.sheets.where((s) => s.entryId == characterId)) {
    for (final itemId in sheet.itemIds) {
      final id = '${sheet.systemId}/$itemId';
      final ability = model.abilities[id];
      if (ability == null) continue;
      throughout.add(
        HistoryItem(
          key: 'holds:$id',
          kind: HistoryItemKind.ability,
          ref: EntityRef(EntityType.ability, id),
          title: 'Holds ${ability.item.name}',
          detail: ability.system.name,
          when: 'On their sheet',
          age: null,
          order: 1,
        ),
      );
    }
  }

  List<HistoryItem> sort(List<HistoryItem> list) => stableSorted(list, (a, b) {
    if (a.order != b.order) return a.order.compareTo(b.order);
    return localeCompare(a.title, b.title);
  });
  final issues = <String>[
    if (ages.birth.unread != null)
      'The date of birth on ${me.name}’s profile, “${ages.birth.unread}”, could not be read as a date${calendar.standard ? '' : ' in ${calendar.name}'}, so ages are not counted from it. Write it as a year (1000), a year and month (1000-3), or a full date (1000-3-1).',
    if (ages.birth.conflict)
      'What is recorded about ${me.name}’s age does not agree (${ages.birth.basis.join('; ')}), so no age is worked out from it together. Each age given at an event still shows.',
    for (final MapEntry(key: eventId, value: issue) in ages.issues.entries)
      '“${model.events[eventId]?.name}”: ${issue.replaceFirst(RegExp('^Stated'), '${me.name} is stated').replaceFirst(RegExp('^Takes part'), '${me.name} takes part')}',
  ];
  return LifeHistory(
    name: me.name,
    birth: ages.birth,
    born: _bornWords(ages.birth, model),
    story: sort(story),
    reading: sort(reading),
    throughout: sort(throughout),
    issues: issues,
  );
}

/// When they were born, in a sentence, and what that is worked out from.
String _bornWords(Birth birth, StoryModel model) {
  final span = birth.span;
  if (span == null) {
    if (birth.conflict) return 'When they were born cannot be worked out: what is recorded does not agree.';
    return 'When they were born is not recorded. Give a date of birth on their profile, or their age at any dated event (0 at their birth), and their ages are worked out from it.';
  }
  final c = model.calendar;
  String day(double t) {
    final p = partsOf(t, c);
    return formatDate(ExactDate(p.year, month: p.month + 1, day: p.day + 1), null, c);
  }

  final lo = day(span.lo);
  final hi = day(span.hi);
  return 'Born ${lo == hi ? 'on $lo' : 'between $lo and $hi'}, worked out from ${birth.basis.join(' and ')}.';
}
