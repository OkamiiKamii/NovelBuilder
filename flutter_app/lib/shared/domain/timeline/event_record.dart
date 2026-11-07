import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validate.dart';
import '../model/validity.dart';
import '../records/calendar.dart';
import '../records/event.dart';
import '../stable_sort.dart';
import 'dates.dart';

/// An event lasts no time at all, for a stretch (a duration or an end date), or has no end within the story.
enum EventShape { instant, span, ongoing }

EventShape eventShape(TimelineEvent e) => e.ongoing
    ? EventShape.ongoing
    : (e.raw['end'] != null || e.duration != null ? EventShape.span : EventShape.instant);

/// Where an event reaches the reader: a chapter or scene, how it tells it, and its place in reading order.
typedef Telling = ({String nodeId, RevealRole role, int? position});

/// ONE EVENT, TWO ORDERS: what every view reads for an event, with its defaults filled in. When it happens ([start],
/// [bounds], [span]: story time) and where the reader meets it ([told], chapters and scenes in reading order) are kept
/// apart, so a flashback is early in one and late in the other, and neither is ever worked out from the other.
class EventRecord {
  EventRecord({
    required this.event,
    required this.shape,
    required this.label,
    required this.span,
    required this.bounds,
    required this.dateProblem,
    required this.told,
  });

  final TimelineEvent event;
  String get id => event.id;
  String get title => event.name;
  EventDate? get start => event.when;
  String get precision => event.when?.precision ?? 'unknown';
  final EventShape shape;

  /// As the author would read it: "Summer of Year 10", "Year 1026, October 14 — 8:30 PM to Year 1026, October 17".
  final String label;

  /// From its start to its end in minutes of story time; [Span.hi] is infinite with no known end. Null when undated.
  final Span? span;

  /// When it starts and ends, each as the stretch it is known to fall in. Null when it cannot be dated.
  final EventBounds? bounds;

  /// Why its date cannot be placed in the novel's calendar (a month the calendar does not have), or null.
  final String? dateProblem;

  /// Where it reaches the reader, in reading order; chapters that no longer exist go last.
  final List<Telling> told;
}

/// The full record of one event, or null when there is none with that id.
EventRecord? eventRecord(StoryModel model, String eventId) {
  final event = model.events[eventId];
  if (event == null) return null;
  final context = model.timeContext;
  final calendar = model.calendar;
  String? nameOf(String id) => model.events[id]?.name;
  final shape = eventShape(event);
  final start = formatDate(event.when, nameOf, calendar);
  final end = event.end;
  final ends = event.raw['end'] == null
      ? null
      : end is UnknownDate
      ? '$start, end not known'
      : '$start to ${formatDate(end, nameOf, calendar)}';
  final label = shape == EventShape.ongoing
      ? '$start, still going on'
      : (ends ?? (event.duration != null ? '$start, for ${formatDuration(event.duration)}' : start));
  final roles = event.reveals;
  final told = stableSorted<Telling>([
    for (final nodeId in event.nodeIds)
      (nodeId: nodeId, role: roles[nodeId] ?? RevealRole.told, position: model.order.position[nodeId]),
  ], (a, b) => (a.position ?? double.infinity).compareTo(b.position ?? double.infinity));
  final when = event.when;
  return EventRecord(
    event: event,
    shape: shape,
    label: label,
    span: spanOfEvent(eventId, context),
    bounds: boundsOfEvent(eventId, context),
    dateProblem: (when == null ? null : calendar.dateProblem(when)) ?? (end == null ? null : calendar.dateProblem(end)),
    told: told,
  );
}

List<EventRecord> eventRecords(StoryModel model) => [for (final id in model.events.keys) eventRecord(model, id)!];

/// What is wrong with an event, in words: its required fields, and anything that contradicts itself (an end before
/// the start, two ways of saying how long it lasts, a reveal in a chapter it is not told in, links to records that
/// are gone). Nothing is changed; the author decides.
List<String> validateEvent(StoryModel model, TimelineEvent event) {
  final problems = validateRecord(EntityType.event, event.raw);
  if (problems.isNotEmpty) return problems;
  final context = model.timeContext;
  final ways = [
    if (event.raw['end'] != null) 'an end date',
    if (event.duration != null) 'a duration',
    if (event.ongoing) '“still going on”',
  ];
  if (ways.length > 1) problems.add('its length is given more than one way: ${ways.join(' and ')}');
  if (event.raw['end'] != null) {
    final start = spanOfDate(event.when, context, {event.id});
    final end = spanOfDate(event.end, context, {event.id});
    if (start != null && end != null && end.hi < start.lo) problems.add('it ends before it starts');
  }
  final told = event.nodeIds.toSet();
  for (final MapEntry(key: nodeId, value: role) in event.reveals.entries) {
    if (!told.contains(nodeId)) problems.add('it is marked as ${role.name} in a chapter it is not told in');
  }
  void gone(String what, Iterable<String> ids, bool Function(String) exists) {
    for (final id in ids) {
      if (!exists(id)) problems.add('$what $id no longer exists');
    }
  }

  gone('the character', event.characters.map((c) => c.id), model.entries.containsKey);
  gone('the place', [?event.locationId], model.entries.containsKey);
  gone('the entry', event.entryIds, model.entries.containsKey);
  gone('the chapter', event.nodeIds, model.nodes.containsKey);
  gone('the plot thread', event.threadIds, model.threads.containsKey);
  gone('the event it follows,', [?event.afterId], model.events.containsKey);
  return problems;
}
