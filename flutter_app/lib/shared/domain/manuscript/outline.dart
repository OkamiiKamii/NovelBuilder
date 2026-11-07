import '../ids.dart';
import '../json.dart';
import '../model/story_order.dart';
import '../records/story_node.dart';
import '../snapshot/copy.dart';
import '../snapshot/novel_snapshot.dart';
import 'prose.dart';

/// Changes to the manuscript's structure: chapters and scenes and the groups above them. Each returns the novel as
/// it would be after the change; nothing is saved until the caller stores it.
///
/// READING ORDER ONLY: moving, reordering, splitting and merging change `parentId` and `order` (and, for split and
/// merge, which node holds which text). They never touch events, so when things happen in the story stays as it was.

/// Why a move or a new node cannot go where asked, in words.
class OutlineException implements Exception {
  OutlineException(this.message);
  final String message;

  @override
  String toString() => message;
}

const _rank = {NodeKind.volume: 0, NodeKind.act: 1, NodeKind.arc: 2, NodeKind.chapter: 3, NodeKind.scene: 4};

/// Scenes go inside chapters; groups hold what is below them; anything but a scene can be at the top level.
bool canContain(NodeKind? parent, NodeKind child) {
  if (child == NodeKind.scene) return parent == NodeKind.chapter;
  if (parent == null) return true;
  return parent.isGroup && _rank[parent]! < _rank[child]!;
}

/// Chapters and scenes hold text; volumes, acts and arcs group them.
bool isDocument(NodeKind? kind) => kind == NodeKind.chapter || kind == NodeKind.scene;

List<StoryNode> _nodes(NovelSnapshot s) => [for (final r in s.rows('chapters')) StoryNode(r)];

List<StoryNode> siblingsOf(List<StoryNode> nodes, String? parentId) => [
  for (final n in nodes)
    if (n.parentId == parentId) n,
]..sort(compareSiblings);

StoryNode _require(List<StoryNode> nodes, String id) =>
    nodes.where((n) => n.id == id).firstOrNull ?? (throw OutlineException('That item no longer exists.'));

String? moveError(List<StoryNode> nodes, String nodeId, String? parentId) {
  final node = nodes.where((n) => n.id == nodeId).firstOrNull;
  final parent = parentId == null ? null : nodes.where((n) => n.id == parentId).firstOrNull;
  if (node == null || (parentId != null && parent == null)) return 'That item no longer exists.';
  if (parent != null && subtreeIds(nodes, nodeId).contains(parent.id)) return 'An item cannot be moved inside itself.';
  if (node.kind == null || !canContain(parent?.kind, node.kind!)) {
    return node.kind == NodeKind.scene
        ? 'A scene must be inside a chapter.'
        : 'A ${node.kindKey} cannot go inside ${parent == null ? 'the top level' : 'a ${parent.kindKey}'}.';
  }
  return null;
}

/// A new chapter, scene or group, last among [parentId]'s children. Its default title numbers it: scenes within
/// their chapter, everything else across the book ("Chapter 12").
({NovelSnapshot snapshot, StoryNode node}) createNode(
  NovelSnapshot s,
  NodeKind kind, {
  String? parentId,
  String? title,
  required num now,
  String Function() createId = newId,
}) {
  final nodes = _nodes(s);
  final parent = parentId == null ? null : _require(nodes, parentId);
  if (!canContain(parent?.kind, kind)) {
    throw OutlineException(
      kind == NodeKind.scene ? 'A scene must be inside a chapter.' : 'A ${kind.name} cannot be created there.',
    );
  }
  final siblings = siblingsOf(nodes, parentId);
  final peers = kind == NodeKind.scene ? siblings : nodes;
  final row = {
    'id': createId(),
    'projectId': s.projectId,
    'parentId': parentId,
    'kind': kind.name,
    'title': (title ?? '').trim().isNotEmpty
        ? title!.trim()
        : '${kind.label} ${peers.where((n) => n.kind == kind).length + 1}',
    'order': siblings.isEmpty ? 0 : siblings.last.order + 1,
    'summary': '',
    'notes': '',
    'status': NodeStatus.idea.key,
    'wordCount': 0,
    'charCount': 0,
    'createdAt': now,
    'updatedAt': now,
  };
  return (snapshot: s.putRow('chapters', row), node: StoryNode(row));
}

NovelSnapshot _update(NovelSnapshot s, String id, JsonMap changes) {
  final node = _require(_nodes(s), id);
  return s.putRow('chapters', node.withFields(changes).toJson());
}

NovelSnapshot renameNode(NovelSnapshot s, String id, String title, {required num now}) =>
    _update(s, id, {'title': title.trim().isEmpty ? 'Untitled' : title.trim(), 'updatedAt': now});

NovelSnapshot setNodeStatus(NovelSnapshot s, String id, NodeStatus status, {required num now}) =>
    _update(s, id, {'status': status.key, 'updatedAt': now});

/// The only change to structure: [nodeId] under [parentId], in front of [beforeId] (null: last). Siblings are
/// renumbered; no other field of any node, and no text, is touched.
NovelSnapshot placeNode(NovelSnapshot s, String nodeId, String? parentId, String? beforeId, {required num now}) {
  final nodes = _nodes(s);
  final problem = moveError(nodes, nodeId, parentId);
  if (problem != null) throw OutlineException(problem);
  final siblings = [
    for (final n in siblingsOf(nodes, parentId))
      if (n.id != nodeId) n,
  ];
  final at = beforeId == null ? siblings.length : siblings.indexWhere((n) => n.id == beforeId);
  if (at == -1) throw OutlineException('The place it was meant to go no longer exists.');
  final ordered = [...siblings.sublist(0, at).map((n) => n.id), nodeId, ...siblings.sublist(at).map((n) => n.id)];
  final byId = {for (final n in nodes) n.id: n};
  var out = s;
  for (final (order, id) in ordered.indexed) {
    final node = byId[id]!;
    if (id == nodeId) {
      out = out.putRow('chapters', node.withFields({'parentId': parentId, 'order': order, 'updatedAt': now}).toJson());
    } else if (node.order != order) {
      out = out.putRow('chapters', node.withFields({'order': order}).toJson());
    }
  }
  return out;
}

/// One place up (-1) or down (+1) among its siblings. At either end, nothing changes.
NovelSnapshot nudgeNode(NovelSnapshot s, String nodeId, int delta, {required num now}) {
  final nodes = _nodes(s);
  final node = _require(nodes, nodeId);
  final siblings = siblingsOf(nodes, node.parentId);
  final from = siblings.indexWhere((n) => n.id == nodeId);
  final to = from + delta;
  if (to < 0 || to >= siblings.length) return s;
  final before = delta < 0 ? siblings[to] : (to + 1 < siblings.length ? siblings[to + 1] : null);
  return placeNode(s, nodeId, node.parentId, before?.id, now: now);
}

/// A copy of a node with everything inside it (children, text, plans, alternate drafts), placed right after it.
/// Every copy gets a fresh id; the originals are not changed.
({NovelSnapshot snapshot, String id}) duplicateNode(
  NovelSnapshot s,
  String nodeId, {
  required num now,
  String Function() createId = newId,
}) {
  final nodes = _nodes(s);
  final source = _require(nodes, nodeId);
  final ids = subtreeIds(nodes, nodeId);
  final newIds = {for (final id in ids) id: createId()};
  var out = s;
  for (final id in ids) {
    final original = nodes.firstWhere((n) => n.id == id);
    out = out.putRow('chapters', {
      ...original.toJson(),
      'id': newIds[id],
      'parentId': id == nodeId ? original.parentId : newIds[original.parentId],
      'title': id == nodeId ? '${original.title} (Copy)' : original.title,
      'createdAt': now,
      'updatedAt': now,
    });
  }
  for (final c in ['chapterContents', 'chapterPlans']) {
    for (final r in s.rows(c)) {
      if (newIds.containsKey(r['id'])) out = out.putRow(c, {...r, 'id': newIds[r['id']]});
    }
  }
  for (final r in s.rows('chapterBranches')) {
    if (newIds.containsKey(r['nodeId'])) {
      out = out.putRow('chapterBranches', {...r, 'id': createId(), 'nodeId': newIds[r['nodeId']]});
    }
  }
  final siblings = siblingsOf(nodes, source.parentId);
  final next = siblings.indexWhere((n) => n.id == nodeId) + 1;
  return (
    snapshot: placeNode(
      out,
      newIds[nodeId]!,
      source.parentId,
      next < siblings.length ? siblings[next].id : null,
      now: now,
    ),
    id: newIds[nodeId]!,
  );
}

JsonMap? contentOf(NovelSnapshot s, String nodeId) =>
    s.rows('chapterContents').where((r) => r['id'] == nodeId).firstOrNull;

/// Stores [doc] as [node]'s text, with its counts and the codex entries it links. [rev] goes up by one.
NovelSnapshot _withText(NovelSnapshot s, StoryNode node, JsonMap doc, {required num now}) {
  final previous = contentOf(s, node.id);
  final m = measureDoc(doc);
  return s
      .putRow('chapterContents', {
        ...?previous,
        'id': node.id,
        'projectId': s.projectId,
        'doc': doc,
        'rev': (intOrNull(previous?['rev']) ?? 0) + 1,
        'savedAt': now,
      })
      .putRow(
        'chapters',
        node.withFields({
          'wordCount': m.words,
          'charCount': m.characters,
          'mentions': mentionsIn(doc),
          'updatedAt': now,
        }).toJson(),
      );
}

/// Splits a chapter or scene in two: it keeps [head]; a new one right after it, titled "… (continued)", gets
/// [tail]. Scenes inside a split chapter stay with the first part. Nothing else that points at it is changed.
({NovelSnapshot snapshot, String id}) splitNode(
  NovelSnapshot s,
  String nodeId,
  JsonMap head,
  JsonMap tail, {
  required num now,
  String Function() createId = newId,
}) {
  final node = _require(_nodes(s), nodeId);
  if (!isDocument(node.kind)) throw OutlineException('Only a chapter or a scene can be split.');
  final created = createNode(
    s,
    node.kind!,
    parentId: node.parentId,
    title: '${node.title} (continued)',
    now: now,
    createId: createId,
  );
  var out = _withText(created.snapshot, node, head, now: now);
  out = _withText(out, created.node, tail, now: now);
  final siblings = siblingsOf(_nodes(s), node.parentId);
  final next = siblings.indexWhere((n) => n.id == nodeId) + 1;
  out = placeNode(out, created.node.id, node.parentId, next < siblings.length ? siblings[next].id : null, now: now);
  return (snapshot: out, id: created.node.id);
}

/// The sibling a node would merge with: the next one, when it is the same kind.
StoryNode? mergeCandidate(NovelSnapshot s, String nodeId) {
  final nodes = _nodes(s);
  final node = nodes.where((n) => n.id == nodeId).firstOrNull;
  if (node == null || !isDocument(node.kind)) return null;
  final siblings = siblingsOf(nodes, node.parentId);
  final i = siblings.indexWhere((n) => n.id == nodeId);
  final next = i + 1 < siblings.length ? siblings[i + 1] : null;
  return next != null && next.kind == node.kind ? next : null;
}

/// Merges the next chapter or scene into this one: its text follows this one's, its scenes move in after this one's,
/// its plan joins this one's, and everything that pointed at it now points here. The merged node is removed.
NovelSnapshot mergeWithNext(NovelSnapshot s, String nodeId, {required num now}) {
  final nodes = _nodes(s);
  final node = _require(nodes, nodeId);
  final next =
      mergeCandidate(s, nodeId) ??
      (throw OutlineException('There is no ${node.kindKey} of the same kind after this one.'));
  final a = contentOf(s, node.id)?['doc'] as JsonMap? ?? emptyDoc();
  final b = contentOf(s, next.id)?['doc'] as JsonMap? ?? emptyDoc();
  final merged = {
    ...a,
    'content': [...listOf(a['content']), ...listOf(b['content'])],
  };

  var out = s;
  // Scenes of the merged chapter move in after this one's.
  final children = siblingsOf(nodes, node.id);
  var order = children.isEmpty ? 0 : children.last.order + 1;
  for (final child in siblingsOf(nodes, next.id)) {
    out = out.putRow('chapters', child.withFields({'parentId': node.id, 'order': order++}).toJson());
  }
  // Plans: lists joined without repeats, texts joined with a blank line.
  final planA = out.rows('chapterPlans').where((r) => r['id'] == node.id).firstOrNull;
  final planB = out.rows('chapterPlans').where((r) => r['id'] == next.id).firstOrNull;
  if (planB != null) {
    final plan = <String, Object?>{
      ...?planA,
      ...planA == null ? {...planB, 'id': node.id} : {},
    };
    if (planA != null) {
      for (final e in planB.entries) {
        if (e.key == 'id' || e.key == 'projectId') continue;
        final x = plan[e.key];
        final y = e.value;
        if (x is List && y is List) {
          plan[e.key] = [...x, ...y.where((v) => !x.any((u) => jsonEquals(u, v)))];
        } else if (x is String && y is String) {
          plan[e.key] = [x, y].where((t) => t.trim().isNotEmpty).join('\n\n');
        } else {
          plan.putIfAbsent(e.key, () => y);
        }
      }
    }
    out = out.putRow('chapterPlans', {...plan, 'updatedAt': now});
  }
  out = out
      .withRows('chapterContents', [
        for (final r in out.rows('chapterContents'))
          if (r['id'] != next.id) r,
      ])
      .withRows('chapterPlans', [
        for (final r in out.rows('chapterPlans'))
          if (r['id'] != next.id) r,
      ])
      .withRows('chapters', [
        for (final r in out.rows('chapters'))
          if (r['id'] != next.id) r,
      ]);
  // Whatever pointed at the merged node (events told in it, threads developing in it…) points here now.
  final map = {next.id: node.id};
  out = out.copyWith(
    collections: {
      for (final e in out.collections.entries)
        e.key: e.key == 'chapters' || e.key == 'chapterContents'
            ? e.value
            : [for (final r in e.value) _dedupe(substituteIds(r, map), node.id)! as JsonMap],
    },
  );
  return _withText(out, StoryNode(out.rows('chapters').firstWhere((r) => r['id'] == node.id)), merged, now: now);
}

/// After a merge, a list that named both merged nodes names the survivor twice: once is enough.
Object? _dedupe(Object? v, String id) => switch (v) {
  final List<Object?> l => [
    for (final (i, x) in l.indexed)
      if (!(x == id && l.indexOf(x) < i)) _dedupe(x, id),
  ],
  final Map<String, Object?> m => {for (final e in m.entries) e.key: _dedupe(e.value, id)},
  _ => v,
};

/// One volume, act, arc, chapter or scene to add from an imported file, with its text (null: none).
class ImportItem {
  const ImportItem({required this.kind, required this.title, this.doc, this.children = const []});
  final NodeKind kind;
  final String title;
  final JsonMap? doc;
  final List<ImportItem> children;
}

/// Adds an imported structure after everything already under [parentId] (null: the top level), in one change. Text is
/// stored exactly as given; a chapter or scene with words in it starts as "Drafting", one without as "Idea". Nothing
/// already in the manuscript is changed. Returns the ids created, in reading order. A port of the original app's
/// `importTree`.
({NovelSnapshot snapshot, List<String> created}) addImportedTree(
  NovelSnapshot s,
  String? parentId,
  List<ImportItem> items, {
  required num now,
  String Function() createId = newId,
}) {
  final nodes = _nodes(s);
  final parent = parentId == null ? null : _require(nodes, parentId);
  final siblings = siblingsOf(nodes, parentId);
  var order = siblings.isEmpty ? 0 : siblings.last.order + 1;
  final created = <String>[];
  var out = s;
  void add(ImportItem item, String? into, NodeKind? intoKind, num position) {
    if (!canContain(intoKind, item.kind)) {
      throw OutlineException(
        'A ${item.kind.name} cannot be placed inside ${intoKind == null ? 'the top level' : 'a ${intoKind.name}'}.',
      );
    }
    final id = createId();
    final doc = isDocument(item.kind) ? item.doc : null;
    final m = doc == null ? null : measureDoc(doc);
    out = out.putRow('chapters', {
      'id': id,
      'projectId': s.projectId,
      'parentId': into,
      'kind': item.kind.name,
      'title': item.title.trim().isNotEmpty ? item.title.trim() : 'Untitled ${item.kind.name}',
      'order': position,
      'summary': '',
      'notes': '',
      'status': m != null && m.words > 0 ? NodeStatus.drafting.key : NodeStatus.idea.key,
      'wordCount': m?.words ?? 0,
      'charCount': m?.characters ?? 0,
      'mentions': doc == null ? <Object?>[] : mentionsIn(doc),
      'createdAt': now,
      'updatedAt': now,
    });
    if (doc != null) {
      out = out.putRow('chapterContents', {'id': id, 'projectId': s.projectId, 'doc': doc, 'rev': 1, 'savedAt': now});
    }
    created.add(id);
    for (final (index, child) in item.children.indexed) {
      add(child, id, item.kind, index);
    }
  }

  for (final item in items) {
    add(item, parentId, parent?.kind, order++);
  }
  return (snapshot: out, created: created);
}
