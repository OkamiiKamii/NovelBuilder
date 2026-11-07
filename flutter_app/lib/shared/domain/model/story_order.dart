import '../collation.dart';
import '../records/relation.dart';
import '../records/story_node.dart';

/// READING ORDER: where each node sits when the book is read front to back, and chapter numbers. Built from the tree
/// (`parentId` + `order`) only. Never from event dates: chronology is separate.
class StoryOrder {
  StoryOrder._(this.position, this.chapterNumber, this.chapters);

  /// Position of every node (volume, chapter, scene…) in reading order.
  final Map<String, int> position;

  /// For every node, the number of the chapter it is, or of the first chapter at or after it.
  final Map<String, int> chapterNumber;
  final List<StoryNode> chapters;

  factory StoryOrder.of(Iterable<StoryNode> nodes) {
    final reading = readingOrder(nodes);
    final position = {for (final (i, n) in reading.indexed) n.id: i};
    final chapters = [
      for (final n in reading)
        if (n.kind == NodeKind.chapter) n,
    ];
    final chapterNumber = <String, int>{};
    var seen = 0;
    for (final node in reading) {
      if (node.kind == NodeKind.chapter) {
        chapterNumber[node.id] = ++seen;
      } else {
        // A scene belongs to the chapter it is in; a volume or arc points at the first chapter inside or after it.
        chapterNumber[node.id] = node.kind == NodeKind.scene ? (seen < 1 ? 1 : seen) : seen + 1;
      }
    }
    return StoryOrder._(position, chapterNumber, chapters);
  }
}

/// Siblings by `order`, then creation time, then id, as the original app's tree sorts them.
int compareSiblings(StoryNode a, StoryNode b) {
  final byOrder = a.order.compareTo(b.order);
  if (byOrder != 0) return byOrder;
  final byCreated = a.createdAt.compareTo(b.createdAt);
  return byCreated != 0 ? byCreated : localeCompare(a.id, b.id);
}

/// The nodes depth-first, parents before children. A node whose parent is missing is read at the top level rather
/// than lost.
List<StoryNode> readingOrder(Iterable<StoryNode> nodes) {
  final ids = {for (final n in nodes) n.id};
  final byParent = <String?, List<StoryNode>>{};
  for (final node in nodes) {
    final key = node.parentId != null && ids.contains(node.parentId) ? node.parentId : null;
    (byParent[key] ??= []).add(node);
  }
  final out = <StoryNode>[];
  void walk(String? parentId) {
    final children = [...?byParent[parentId]]..sort(compareSiblings);
    for (final child in children) {
      out.add(child);
      walk(child.id);
    }
  }

  walk(null);
  return out;
}

/// The node's id followed by all of its descendants', parents before children.
List<String> subtreeIds(Iterable<StoryNode> nodes, String rootId) {
  final out = [rootId];
  for (var i = 0; i < out.length; i++) {
    for (final node in nodes) {
      if (node.parentId == out[i]) out.add(node.id);
    }
  }
  return out;
}

int _startOf(RelationStage stage, StoryOrder order) =>
    stage.startNodeId == null ? -1 : (order.position[stage.startNodeId] ?? -1);

/// A relationship's stages in reading order. Stages starting at the same point keep the order they were added in.
/// A stage whose chapter is not said stays just after the stage recorded before it.
List<RelationStage> sortedStages(CharacterRelation relation, StoryOrder order) {
  var previous = -1;
  final keyed = <(RelationStage, int, int)>[];
  for (final (i, stage) in relation.stages.indexed) {
    final key = stage.startUnknown ? previous : _startOf(stage, order);
    previous = key;
    keyed.add((stage, i, key));
  }
  keyed.sort((a, b) => a.$3 != b.$3 ? a.$3.compareTo(b.$3) : a.$2.compareTo(b.$2));
  return [for (final k in keyed) k.$1];
}

/// The state of a relationship at a point in the story: the latest stage begun by [atNodeId] (null: the end of the
/// story). Null when it has not started yet there. A stage whose chapter is not said counts only at the end.
RelationStage? stageAt(CharacterRelation relation, String? atNodeId, StoryOrder order) {
  final stages = sortedStages(relation, order);
  if (atNodeId == null) return stages.lastOrNull;
  final at = order.position[atNodeId];
  RelationStage? current;
  for (final stage in stages) {
    if (!stage.startUnknown && (at == null || _startOf(stage, order) <= at)) current = stage;
  }
  return current;
}
