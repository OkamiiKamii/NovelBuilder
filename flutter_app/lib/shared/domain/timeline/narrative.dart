import 'dart:math' as math;

import '../collation.dart';
import '../model/story_model.dart';
import '../records/event.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import 'chronology.dart';

/// TWO ORDERS. When something happens in the story (story time, from the timeline) and when the reader meets it (the
/// order of chapters and scenes) are separate, and neither is ever worked out from the other. Comparing them shows how
/// the book is told; nothing here reorders chapters or moves events, and nothing is wrong with a story told out of
/// order.
class StoryTelling {
  StoryTelling({
    required this.eventId,
    required this.nodeId,
    required this.role,
    required this.storyRank,
    required this.readingRank,
  });

  final String eventId;
  final String nodeId;
  final RevealRole role;

  /// Where the event is in story time, from 0; events at the same moment share a place. Null when it has no place.
  final int? storyRank;

  /// Where the chapter or scene is in reading order.
  final int readingRank;

  /// It goes back in time from where the main line (what is told plainly) has got to at this point in the book. For
  /// a plainly told event: it happens before something already told plainly.
  bool back = false;

  /// It goes ahead of where the main line has got to (a flash-forward, a foreshadowing). Never true of the main line.
  bool ahead = false;
}

class OrderedEvent {
  OrderedEvent(this.id, this.title, this.when, this.storyRank, this.tellings);
  final String id;
  final String title;
  final String when;
  final int? storyRank;

  /// Where the reader meets it, in reading order. Empty when no chapter tells it yet.
  final List<StoryTelling> tellings;
}

class OrderedNode {
  OrderedNode(this.id, this.label, this.readingRank, this.tellings);
  final String id;

  /// "Ch 3: The Gate", "Ch 3, scene: At the wall", or a volume's own title.
  final String label;
  final int readingRank;

  /// What it tells, in story order.
  final List<StoryTelling> tellings;
}

class TwoOrders {
  TwoOrders(this.events, this.nodes, this.tellings, this.placed, this.linear);

  /// Every event, in story order; those with no place in time last.
  final List<OrderedEvent> events;

  /// The chapters and scenes that tell something, in reading order.
  final List<OrderedNode> nodes;

  /// Every telling, in reading order.
  final List<StoryTelling> tellings;

  /// How many events have a place in story time.
  final int placed;

  /// No telling goes back in time or ahead: told in story order.
  final bool linear;
}

String nodeLabel(StoryModel model, String nodeId) {
  final node = model.nodes[nodeId];
  if (node == null) return 'A deleted chapter';
  final n = model.order.chapterNumber[nodeId];
  final title = node.title.trim().isNotEmpty
      ? node.title.trim()
      : 'Untitled ${node.kind?.label.toLowerCase() ?? 'chapter'}';
  if (node.kind == NodeKind.chapter && n != null && n != 0) return 'Ch $n: $title';
  if (node.kind == NodeKind.scene && n != null && n != 0) return 'Ch $n, scene: $title';
  return title;
}

/// "1st", "2nd", "23rd": a place in an order, said as people say it.
String ordinal(int n) {
  final tens = n % 100;
  final suffix = tens >= 11 && tens <= 13 ? 'th' : const {1: 'st', 2: 'nd', 3: 'rd'}[n % 10] ?? 'th';
  return '$n$suffix';
}

int _orInf(int? n) => n ?? 1 << 52;

/// Both orders of a novel, side by side. Story order is the timeline's own; reading order is the manuscript's. A
/// chapter that no longer exists is left out.
TwoOrders twoOrders(StoryModel model) {
  final placed = resolveChronology(model.events.values, model.calendar);
  // Events at the same moment share a place; an undated event placed after another gets its own.
  final rank = <String, int?>{};
  var next = 0;
  double? lastValue;
  var hasLast = false;
  for (final p in placed) {
    if (!p.anchored) {
      rank[p.event.id] = null;
      continue;
    }
    final tie = hasLast && p.value != null && lastValue == p.value;
    rank[p.event.id] = tie ? next - 1 : next++;
    lastValue = p.value;
    hasLast = true;
  }

  final tellings = <StoryTelling>[];
  for (final event in model.events.values) {
    final roles = event.reveals;
    for (final nodeId in {...event.nodeIds}) {
      final readingRank = model.order.position[nodeId];
      if (readingRank == null) continue;
      tellings.add(
        StoryTelling(
          eventId: event.id,
          nodeId: nodeId,
          role: roles[nodeId] ?? RevealRole.told,
          storyRank: rank[event.id],
          readingRank: readingRank,
        ),
      );
    }
  }
  final sorted = stableSorted(tellings, (a, b) {
    final byReading = a.readingRank - b.readingRank;
    if (byReading != 0) return byReading;
    final byStory = _orInf(a.storyRank) - _orInf(b.storyRank);
    return byStory != 0 ? byStory : localeCompare(a.eventId, b.eventId);
  });

  // The main line is what is told plainly. Where it has got to at each chapter is the latest of it told so far (this
  // chapter included); before it starts, the first of it to come. Everything else is measured against that point.
  final groups = {for (final t in sorted) t.readingRank}.toList();
  List<int> main(int r) => [
    for (final t in sorted)
      if (t.readingRank == r && t.role == RevealRole.told && t.storyRank != null) t.storyRank!,
  ];
  final before = <int, double>{};
  final reached = <int, int?>{};
  var latest = double.negativeInfinity;
  for (final r in groups) {
    before[r] = latest;
    for (final m in main(r)) {
      latest = math.max(latest, m.toDouble());
    }
    reached[r] = latest.isFinite ? latest.toInt() : null;
  }
  // Before the main line starts, nothing read so far can be later, so nothing goes back; going ahead is past its first.
  final upcoming = <int, int?>{};
  int? first;
  for (final r in groups.reversed) {
    final here = main(r);
    if (here.isNotEmpty) first = here.reduce(math.min);
    upcoming[r] = first;
  }
  for (final t in sorted) {
    final story = t.storyRank;
    if (story == null) continue;
    if (t.role == RevealRole.told) {
      // The main line itself only ever goes back: a jump forward is just the story moving on.
      t.back = before[t.readingRank]! > story;
      continue;
    }
    final point = reached[t.readingRank];
    if (point != null) {
      t.back = story < point;
      t.ahead = story > point;
    } else {
      final upNext = upcoming[t.readingRank];
      t.ahead = upNext != null && story > upNext;
    }
  }

  final events = [
    for (final p in placed)
      OrderedEvent(p.event.id, p.event.name, p.label, rank[p.event.id], [
        for (final t in sorted)
          if (t.eventId == p.event.id) t,
      ]),
  ];
  final nodes = [
    for (final r in groups)
      () {
        final mine = stableSorted([
          for (final t in sorted)
            if (t.readingRank == r) t,
        ], (a, b) => _orInf(a.storyRank) - _orInf(b.storyRank));
        return OrderedNode(mine.first.nodeId, nodeLabel(model, mine.first.nodeId), r, mine);
      }(),
  ];
  return TwoOrders(
    events,
    nodes,
    sorted,
    placed.where((p) => p.anchored).length,
    sorted.every((t) => !t.back && !t.ahead),
  );
}

/// Where a telling stands against the others, in a few words.
String orderWords(StoryTelling t) {
  if (t.storyRank == null) return 'not placed in time yet';
  if (t.back) return 'goes back in time';
  if (t.ahead) return 'goes ahead in time';
  return 'in story order';
}

/// How a chapter tells an event, from the event's side: "Flashback in Ch 4: The Well".
String tellingWords(StoryTelling t, StoryModel model) => '${t.role.label} ${nodeLabel(model, t.nodeId)}';

/// Things worth a look, where how a telling is marked and where it falls do not seem to agree. Suggestions only: a
/// story can have every reason for either, and nothing is changed.
List<({StoryTelling telling, String note})> tellingNotes(TwoOrders orders, StoryModel model) {
  final notes = <({StoryTelling telling, String note})>[];
  String name(String id) => model.events[id]?.name ?? 'An event';
  for (final t in orders.tellings) {
    final story = t.storyRank;
    if (story == null) continue;
    final where = nodeLabel(model, t.nodeId);
    if (t.role == RevealRole.flashback && !t.back) {
      notes.add((
        telling: t,
        note:
            '“${name(t.eventId)}” is marked as a flashback in $where, but the story told plainly has not got past it yet there.',
      ));
    }
    if (t.role == RevealRole.flashforward && !t.ahead) {
      notes.add((
        telling: t,
        note:
            '“${name(t.eventId)}” is marked as a flash-forward in $where, but it does not happen after what is told plainly around it.',
      ));
    }
    if (t.role == RevealRole.told && t.back) {
      // The plainly told event already met that happens later: either this is a flashback, or that a flash-forward.
      final later = stableSorted([
        for (final o in orders.tellings)
          if (o.role == RevealRole.told && o.readingRank < t.readingRank && (o.storyRank ?? -1) > story) o,
      ], (a, b) => a.readingRank - b.readingRank).first;
      notes.add((
        telling: t,
        note:
            '“${name(t.eventId)}” is told in $where, after “${name(later.eventId)}” (${nodeLabel(model, later.nodeId)}), which happens later. Is this a flashback, or that a flash-forward?',
      ));
    }
    if (t.role == RevealRole.foreshadowed) {
      final plain = orders.tellings
          .where((o) => o.eventId == t.eventId && o.role == RevealRole.told && o.readingRank < t.readingRank)
          .firstOrNull;
      if (plain != null) {
        notes.add((
          telling: t,
          note:
              '“${name(t.eventId)}” is foreshadowed in $where, after it is already told in ${nodeLabel(model, plain.nodeId)}.',
        ));
      }
    }
  }
  return notes;
}

/// The whole book's telling in one sentence.
String orderSummary(TwoOrders orders) {
  if (orders.tellings.isEmpty) {
    return 'No event is linked to a chapter or scene yet, so there is no reading order to compare.';
  }
  if (orders.linear) return 'Told in story order: the reader meets the events in the order they happen.';
  String count(int n, String one, String many) => '$n ${n == 1 ? one : many}';
  final back = orders.tellings.where((t) => t.back).length;
  final ahead = orders.tellings.where((t) => t.ahead).length;
  final parts = [
    if (back > 0) '${count(back, 'telling goes', 'tellings go')} back in time',
    if (ahead > 0) '${count(ahead, 'goes', 'go')} ahead',
  ];
  return 'Not told in story order: ${parts.join(', and ')}.';
}
