import '../model/story_order.dart';
import '../records/story_node.dart';
import 'outline.dart';

/// THE SCENE BOARD. The manuscript's chapters and scenes laid out as cards, read from the same nodes the editor and
/// the outline show. Nothing is copied: a card is a chapter or scene itself, and moving one changes only where it sits
/// (`parentId` and `order`), through the outline's own move. Words are the counts the editor keeps.

class TreeItem {
  TreeItem(this.node, this.children, this.depth, this.totalWords);
  final StoryNode node;
  final List<TreeItem> children;
  final int depth;

  /// Its own words and everything inside it.
  final int totalWords;
}

/// The manuscript as a tree, siblings in order. A node whose parent is missing is shown at the top level, not lost.
List<TreeItem> buildTree(List<StoryNode> nodes) {
  final ids = {for (final n in nodes) n.id};
  final byParent = <String?, List<StoryNode>>{};
  for (final node in nodes) {
    final key = node.parentId != null && ids.contains(node.parentId) ? node.parentId : null;
    (byParent[key] ??= []).add(node);
  }
  List<TreeItem> build(String? parentId, int depth) => [
    for (final node in [...?byParent[parentId]]..sort(compareSiblings))
      () {
        final children = build(node.id, depth + 1);
        return TreeItem(node, children, depth, node.wordCount + children.fold(0, (n, c) => n + c.totalWords));
      }(),
  ];
  return build(null, 0);
}

/// Depth-first reading order.
List<TreeItem> flattenTree(List<TreeItem> tree) {
  final out = <TreeItem>[];
  void walk(List<TreeItem> items) {
    for (final item in items) {
      out.add(item);
      walk(item.children);
    }
  }

  walk(tree);
  return out;
}

/// The node and the volumes, acts and arcs above it, outermost first.
List<StoryNode> pathTo(List<StoryNode> nodes, String id) {
  final byId = {for (final n in nodes) n.id: n};
  final path = <StoryNode>[];
  for (
    var node = byId[id];
    node != null && !path.contains(node);
    node = node.parentId == null ? null : byId[node.parentId]
  ) {
    path.insert(0, node);
  }
  return path;
}

class BoardCard {
  BoardCard(this.node, this.words);
  final StoryNode node;
  final int words;
}

/// A chapter and the scenes inside it, in reading order.
class BoardColumn {
  BoardColumn(this.chapter, this.words, this.scenes);
  final StoryNode chapter;

  /// The chapter's own words and its scenes'.
  final int words;
  final List<BoardCard> scenes;
}

/// A run of chapters that sit directly in the same place: a volume, act or arc, or the top level.
class BoardPart {
  BoardPart(this.key, this.parentId, this.path, this.columns, [this.endBeforeId]);
  final String key;

  /// Where its chapters sit (null: the top level).
  final String? parentId;

  /// The volumes, acts and arcs it is in, outermost first; empty at the top level.
  final List<StoryNode> path;
  final List<BoardColumn> columns;

  /// Where a chapter dropped at the end of this part lands: in front of this sibling (null: last).
  String? endBeforeId;
}

/// The board, in reading order. Chapters next to each other in the same place form one part; a volume, act or arc
/// between them starts a new one, so the board never reorders the book to group it. A volume, act or arc with nothing
/// in it is an empty part, so chapters can be moved into it.
List<BoardPart> boardOf(List<StoryNode> nodes) {
  final ids = {for (final n in nodes) n.id};
  String? parentOf(StoryNode node) => node.parentId != null && ids.contains(node.parentId) ? node.parentId : null;
  final parts = <BoardPart>[];
  BoardPart? open;
  BoardColumn? column;
  for (final item in flattenTree(buildTree(nodes))) {
    final node = item.node;
    if (node.kind == NodeKind.chapter) {
      final parentId = parentOf(node);
      if (open == null || open.parentId != parentId) {
        open = BoardPart(
          '${parentId ?? 'top'}:${node.id}',
          parentId,
          parentId == null ? const [] : pathTo(nodes, parentId),
          [],
        );
        parts.add(open);
      }
      column = BoardColumn(node, item.totalWords, []);
      open.columns.add(column);
    } else if (node.kind == NodeKind.scene) {
      if (column != null && parentOf(node) == column.chapter.id) column.scenes.add(BoardCard(node, item.totalWords));
    } else {
      open = null;
      column = null;
      if (item.children.isEmpty) parts.add(BoardPart('${node.id}:empty', node.id, pathTo(nodes, node.id), []));
    }
  }
  for (final part in parts) {
    final last = part.columns.lastOrNull?.chapter;
    if (last == null) continue;
    final siblings = siblingsOf(nodes, part.parentId);
    final at = siblings.indexWhere((n) => n.id == last.id) + 1;
    part.endBeforeId = at < siblings.length ? siblings[at].id : null;
  }
  return parts;
}

class BoardFilter {
  const BoardFilter({this.status, this.text = '', this.nodeIds});
  final NodeStatus? status;
  final String text;

  /// Only these chapters and scenes (where a plot thread is recorded), or null for all.
  final Set<String>? nodeIds;

  bool get filtered => status != null || text.trim().isNotEmpty || nodeIds != null;
}

/// Whether a chapter or scene matches: its status, the words in its title or summary, and (with a thread chosen)
/// whether the thread is recorded there.
bool matchesBoard(StoryNode node, BoardFilter filter) {
  final text = filter.text.trim().toLowerCase();
  return (filter.status == null || node.status == filter.status) &&
      (filter.nodeIds == null || filter.nodeIds!.contains(node.id)) &&
      (text.isEmpty || node.title.toLowerCase().contains(text) || node.summary.toLowerCase().contains(text));
}

/// The board narrowed by a filter: a chapter stays when it or one of its scenes matches, with only its matching
/// scenes; parts left empty go.
List<BoardPart> filterBoard(List<BoardPart> parts, BoardFilter filter) {
  if (!filter.filtered) return parts;
  return [
    for (final part in parts)
      () {
        final columns = [
          for (final c in part.columns)
            () {
              final scenes = [
                for (final s in c.scenes)
                  if (matchesBoard(s.node, filter)) s,
              ];
              return matchesBoard(c.chapter, filter) || scenes.isNotEmpty
                  ? BoardColumn(c.chapter, c.words, scenes)
                  : null;
            }(),
        ].nonNulls.toList();
        return columns.isEmpty ? null : BoardPart(part.key, part.parentId, part.path, columns, part.endBeforeId);
      }(),
  ].nonNulls.toList();
}

/// A place in the book: inside [parentId] (null: the top level), in front of [beforeId] (null: last).
typedef Place = ({String? parentId, String? beforeId});

/// Where a node is now: its parent, and the sibling after it.
Place? placeOf(List<StoryNode> nodes, String nodeId) {
  final node = nodes.where((n) => n.id == nodeId).firstOrNull;
  if (node == null) return null;
  final siblings = siblingsOf(nodes, node.parentId);
  final at = siblings.indexWhere((n) => n.id == nodeId) + 1;
  return (parentId: node.parentId, beforeId: at < siblings.length ? siblings[at].id : null);
}

/// Moving a node to where it already is changes nothing.
bool samePlace(List<StoryNode> nodes, String nodeId, Place to) {
  final now = placeOf(nodes, nodeId);
  return now != null && now.parentId == to.parentId && (to.beforeId == nodeId || now.beforeId == to.beforeId);
}

/// Where a moved card lands: a scene in front of another scene or at the end of a chapter; a chapter in front of
/// another chapter or at the end of a part. Null when that is not allowed, or would change nothing.
Place? dropOf(List<StoryNode> nodes, String dragId, Place to) {
  if (to.beforeId == dragId) return null;
  if (moveError(nodes, dragId, to.parentId) != null) return null;
  if (to.beforeId != null && nodes.where((n) => n.id == to.beforeId).firstOrNull?.parentId != to.parentId) {
    return null;
  }
  return samePlace(nodes, dragId, to) ? null : to;
}

/// A move that would carry more than one card into another volume, act or arc: a chapter with its scenes. Asked about
/// before it is made.
({int scenes, int words})? bulkOf(List<StoryNode> nodes, String nodeId, Place to) {
  final node = nodes.where((n) => n.id == nodeId).firstOrNull;
  if (node == null || node.kind != NodeKind.chapter || node.parentId == to.parentId) return null;
  final scenes = [
    for (final n in nodes)
      if (n.parentId == nodeId && isDocument(n.kind)) n,
  ];
  if (scenes.isEmpty) return null;
  return (scenes: scenes.length, words: node.wordCount + scenes.fold(0, (n, s) => n + s.wordCount));
}

/// A change made on the board, and how to take it back.
sealed class BoardChange {
  const BoardChange(this.nodeId, this.title);
  final String nodeId;
  final String title;
}

final class MoveChange extends BoardChange {
  const MoveChange(super.nodeId, super.title, this.from, this.to);
  final Place from;
  final Place to;
}

final class StatusChange extends BoardChange {
  const StatusChange(super.nodeId, super.title, this.from, this.to);
  final NodeStatus from;
  final NodeStatus to;
}

/// Why a change can no longer be undone, or null when it can. Undo puts back only what the board changed, and only
/// while things are as the board left them: if the card has been moved or its status changed since, or where it came
/// from is gone, undo says so instead of guessing.
String? undoProblem(List<StoryNode> nodes, BoardChange change) {
  final node = nodes.where((n) => n.id == change.nodeId).firstOrNull;
  if (node == null) return '“${change.title}” no longer exists.';
  switch (change) {
    case StatusChange(:final to):
      return node.status == to ? null : 'The status of “${change.title}” has been changed since.';
    case MoveChange(:final from, :final to):
      final now = placeOf(nodes, change.nodeId)!;
      if (now.parentId != to.parentId || now.beforeId != to.beforeId) return '“${change.title}” has been moved since.';
      if (from.parentId != null && !nodes.any((n) => n.id == from.parentId)) {
        return 'Where “${change.title}” came from no longer exists.';
      }
      if (from.beforeId != null && nodes.where((n) => n.id == from.beforeId).firstOrNull?.parentId != from.parentId) {
        return 'Where “${change.title}” came from has changed since.';
      }
      return moveError(nodes, change.nodeId, from.parentId);
  }
}

/// A change in words, for the line that offers to undo it.
String boardChangeWords(BoardChange change, List<StoryNode> nodes) {
  switch (change) {
    case StatusChange(:final to):
      return '“${change.title}” set to ${to.label}.';
    case MoveChange(:final to):
      String? name(String? id) => id == null ? null : nodes.where((n) => n.id == id).firstOrNull?.title;
      final where = to.parentId != null ? 'in “${name(to.parentId) ?? 'a deleted chapter'}”' : 'at the top level';
      return 'Moved “${change.title}” $where${to.beforeId != null ? ', before “${name(to.beforeId) ?? '…'}”' : ', at the end'}.';
  }
}

/// The reading order of a list of nodes, for numbering.
StoryOrder orderOf(List<StoryNode> nodes) => StoryOrder.of(nodes);
