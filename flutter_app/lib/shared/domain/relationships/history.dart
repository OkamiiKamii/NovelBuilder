import '../model/story_order.dart';
import '../records/relation.dart';
import 'relation_types.dart';

/// A stage and where in the book it applies, in words.
class TimelineEntry {
  TimelineEntry(this.stage, this.range, {required this.orphaned});

  final RelationStage stage;

  /// "Chapters 1–10", "Chapter 11", "Chapters 21+", "Stage 3, chapter not said".
  final String range;

  /// The starting point no longer exists in the manuscript.
  final bool orphaned;
}

/// A relationship's history as labelled chapter ranges, as the original app reads it. A stage whose chapter is not
/// said claims no range, and the one before it reads "From chapter N".
List<TimelineEntry> timelineOf(CharacterRelation relation, StoryOrder order) {
  final stages = sortedStages(relation, order);
  final total = order.chapters.length;
  int first(RelationStage s) => s.startNodeId == null ? 1 : (order.chapterNumber[s.startNodeId] ?? 1);
  return [
    for (final (i, stage) in stages.indexed)
      () {
        if (stage.startUnknown) {
          return TimelineEntry(
            stage,
            total == 0 ? 'Stage ${i + 1}' : 'Stage ${i + 1}, chapter not said',
            orphaned: false,
          );
        }
        final max = total > 1 ? total : 1;
        final from = first(stage) < max ? first(stage) : max;
        final following = stages.sublist(i + 1);
        final next = following.where((s) => !s.startUnknown).firstOrNull;
        final open = following.isNotEmpty && following.first.startUnknown;
        final to = next == null ? null : (first(next) - 1 > from ? first(next) - 1 : from);
        final range = total == 0
            ? (i == stages.length - 1 && i == 0 ? 'Whole story' : 'Stage ${i + 1}')
            : open
            ? 'From chapter $from'
            : to == null
            ? (from >= total ? 'Chapter $from+' : 'Chapters $from+')
            : to == from
            ? 'Chapter $from'
            : 'Chapters $from–$to';
        return TimelineEntry(
          stage,
          range,
          orphaned: stage.startNodeId != null && !order.position.containsKey(stage.startNodeId),
        );
      }(),
  ];
}

/// What a stage changes from the one before it, in words: type, feeling, each tracked attribute each way, title.
List<String> stageDifferences(
  RelationStage? before,
  RelationStage stage, {
  required String fromName,
  required String toName,
  List<TrackedAttribute> attributes = const [],
}) {
  if (before == null) return const [];
  final out = <String>[];
  String said(int? v) => v == null ? 'not said' : '$v';
  String type(RelationStage s) => s.label.isEmpty ? 'Related' : s.label;
  String feeling(RelationStage s) => (Affinity.of(s.affinity) ?? Affinity.neutral).label;
  if (type(before) != type(stage)) out.add('type: ${type(before)} → ${type(stage)}');
  if (before.affinity != stage.affinity) out.add('feeling: ${feeling(before)} → ${feeling(stage)}');
  for (final a in attributes) {
    for (final (side, who, toward) in [('from', fromName, toName), ('to', toName, fromName)]) {
      final was = side == 'from' ? before.attribute(a.key).from : before.attribute(a.key).to;
      final now = side == 'from' ? stage.attribute(a.key).from : stage.attribute(a.key).to;
      if (was != now) out.add('$who’s ${a.label.toLowerCase()} toward $toward: ${said(was)} → ${said(now)}');
    }
  }
  if (before.title != stage.title && stage.title.isNotEmpty) out.add('now called “${stage.title}”');
  return out;
}

/// How one side describes the other under a stage: "Mentor", "Rival"…
String roleOf(RelationStage stage, CharacterRelation relation, String entryId) {
  final role = relation.fromId == entryId ? stage.fromRole : stage.toRole;
  return role.isNotEmpty ? role : (stage.label.isNotEmpty ? stage.label : 'Related');
}
