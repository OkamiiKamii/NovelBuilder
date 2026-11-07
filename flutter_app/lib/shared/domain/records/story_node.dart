import '../json.dart';
import '../json_record.dart';

/// A node of the story tree. Volumes, acts and arcs group; chapters and scenes hold text.
enum NodeKind {
  volume('Volume'),
  act('Act'),
  arc('Arc'),
  chapter('Chapter'),
  scene('Scene');

  const NodeKind(this.label);
  final String label;

  bool get isGroup => this == volume || this == act || this == arc;

  static NodeKind? of(Object? value) {
    for (final k in values) {
      if (k.name == value) return k;
    }
    return null;
  }
}

/// The workflow pipeline, in order.
enum NodeStatus {
  idea('Idea'),
  planned('Planned'),
  drafting('Drafting'),
  draftComplete('Draft Complete', key: 'draft-complete'),
  revising('Revising'),
  finalDraft('Final', key: 'final'),
  published('Published');

  const NodeStatus(this.label, {String? key}) : _key = key;
  final String label;
  final String? _key;
  String get key => _key ?? name;

  static NodeStatus? of(Object? value) {
    for (final s in values) {
      if (s.key == value) return s;
    }
    return null;
  }

  /// Maps the original app's earlier two-field scheme (a progress plus a planned/written/published tag) onto the
  /// single pipeline, exactly as its own upgrade did.
  static NodeStatus upgrade(Object? status, [Object? publication]) {
    if (publication == 'published') return published;
    final known = of(status);
    if (known != null) return known;
    return switch (status) {
      'outlining' => planned,
      'editing' => revising,
      'complete' => finalDraft,
      _ => idea,
    };
  }
}

/// One node of the story tree: a volume/act/arc, a chapter or a scene.
///
/// STABLE ID RULE: structure is only `parentId` + `order`. Reordering or moving a node changes those two fields and
/// nothing else, so text, plans and every link (which hang off [id]) cannot be detached or mixed up.
///
/// READING ORDER is this tree, read depth first. It is never the story's chronology: that lives on events.
class StoryNode extends JsonRecord {
  StoryNode(super.raw);

  String? get parentId => idOrNull(raw['parentId']);

  /// Null when the stored kind is not one this version knows (reported by validation; kept as stored).
  NodeKind? get kind => NodeKind.of(raw['kind']);
  String get kindKey => str(raw['kind']);
  String get title => str(raw['title']);

  /// Position among siblings. Never used to identify a node.
  num get order => numOrNull(raw['order']) ?? 0;
  String get summary => str(raw['summary']);
  String get notes => str(raw['notes']);
  NodeStatus get status => NodeStatus.upgrade(raw['status'], raw['publication']);

  /// Codex entries linked inside this node's text, kept up to date on every save.
  List<String> get mentions => strings(raw['mentions']);
  int get wordCount => intOrNull(raw['wordCount']) ?? 0;
  int get charCount => intOrNull(raw['charCount']) ?? 0;
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;

  /// The name shown for it: its title, or "Untitled chapter" and the like.
  String get displayTitle => title.isNotEmpty ? title : 'Untitled ${kind?.label.toLowerCase() ?? 'item'}';

  StoryNode withFields(JsonMap changes) => StoryNode(merged(changes));

  StoryNode renamed(String title) => withFields({'title': title});

  /// Moves the node in the tree. Only `parentId` and `order` change.
  StoryNode movedTo({required String? parentId, required num order}) =>
      withFields({'parentId': parentId, 'order': order});
}

/// A planned beat of a chapter or scene.
class PlanBeat {
  PlanBeat(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get text => str(raw['text']);
}

/// The plan for a chapter or scene (`id` is the node's id). Kept apart from the manuscript text: nothing ever copies a
/// plan into the text.
class ChapterPlan extends JsonRecord {
  ChapterPlan(super.raw);

  /// The chapter or scene this plans: plans share their node's id.
  String get nodeId => id;
  String get objective => str(raw['objective']);
  List<PlanBeat> get beats => [for (final b in maps(raw['beats'])) PlanBeat(b)];

  /// Codex entries present in this chapter or scene, by their permanent ids.
  List<String> get entityIds => strings(raw['entityIds']);
  List<String> get labels => strings(raw['labels']);

  /// Characters recorded as on the page here. A character is here or in [mentionIds], not both.
  List<String> get appearIds => strings(raw['appearIds']);

  /// Characters recorded as mentioned but not on the page.
  List<String> get mentionIds => strings(raw['mentionIds']);

  /// Whose point of view it is told from, as the author records it.
  List<String> get povIds => strings(raw['povIds']);

  ChapterPlan withFields(JsonMap changes) => ChapterPlan(merged(changes));
}
