import '../collation.dart';
import '../model/story_model.dart';
import '../plot/lanes.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';

/// WHO APPEARS WHERE (as in the original app)
/// Characters against chapters (or scenes), from what is recorded and from nothing else: no text is searched for
/// names. The author's appearance records say a character appears on the page, or is only mentioned; the other
/// records that tie a character to a chapter (a link in the text, the plan's "Entities involved", an event they take
/// part in that the chapter tells) are shown for what they are, and are not taken as an appearance. A chapter with no
/// record for a character is "not recorded", never "absent".

/// What a record says ties a character to a chapter or scene.
enum Evidence {
  appears('Appears (your appearance record)'),
  mentioned('Mentioned, not on the page (your appearance record)'),
  linked('Linked in the text'),
  involved('Listed under “Entities involved” in the plan'),
  event('Takes part in an event told here');

  const Evidence(this.label);
  final String label;
}

/// A cell as drawn: the author's appearance record, if any; else whether anything else is recorded; else nothing.
enum CellState {
  appears('Appears'),
  mentioned('Mentioned'),
  other('Other records'),
  none('Not recorded');

  const CellState(this.label);
  final String label;
}

class CellEvidence {
  const CellEvidence(this.kind, this.nodeId, [this.eventId]);

  final Evidence kind;

  /// The chapter or scene the record is on.
  final String nodeId;

  /// For [Evidence.event]: which event.
  final String? eventId;
}

class MatrixCell {
  MatrixCell(this.state, this.evidence);
  final CellState state;
  final List<CellEvidence> evidence;
}

class MatrixColumn {
  MatrixColumn({
    required this.nodeId,
    required this.chapterId,
    required this.chapterNumber,
    required this.label,
    required this.short,
    required this.status,
  });

  final String nodeId;
  final String chapterId;
  final int chapterNumber;

  /// "Ch 3: The Seal", "Ch 3, scene: The vault".
  final String label;

  /// "3", or "3.2" for a chapter's second scene.
  final String short;
  final NodeStatus status;
}

class MatrixRow {
  MatrixRow(this.characterId, this.name, this.cells);

  final String characterId;
  final String name;
  final List<MatrixCell> cells;

  /// Cells with anything recorded.
  int get recorded => cells.where((c) => c.state != CellState.none).length;
}

enum Grain { chapters, scenes }

class MatrixFilter {
  const MatrixFilter({
    this.grain = Grain.chapters,
    this.characterIds = const [],
    this.text = '',
    this.from,
    this.to,
    this.placeId,
    this.threadId,
    this.status,
    this.all = false,
  });

  final Grain grain;

  /// Only these characters.
  final List<String> characterIds;

  /// Words in the character's name.
  final String text;

  /// A range of chapters, by node id, both included; either end may be open.
  final String? from;
  final String? to;

  /// Only chapters and scenes this place is recorded at.
  final String? placeId;

  /// Only chapters and scenes where this plot thread is recorded (its beats, and the events that belong to it).
  final String? threadId;

  /// Only chapters and scenes with this status.
  final NodeStatus? status;

  /// Show characters with nothing recorded in the columns shown, too.
  final bool all;
}

class AppearanceMatrix {
  AppearanceMatrix(this.columns, this.rows, this.hidden, this.characters);

  final List<MatrixColumn> columns;
  final List<MatrixRow> rows;

  /// Characters left out because nothing is recorded for them in the columns shown.
  final int hidden;
  final int characters;
}

/// Every record tying a character to one chapter or scene, by character.
Map<String, List<CellEvidence>> _recordsAt(StoryNode node, StoryModel model) {
  final out = <String, List<CellEvidence>>{};
  void add(String id, CellEvidence item) {
    if (model.entries[id]?.category != 'character') return;
    (out[id] ??= []).add(item);
  }

  final plan = model.plans[node.id];
  for (final id in plan?.appearIds ?? const <String>[]) {
    add(id, CellEvidence(Evidence.appears, node.id));
  }
  for (final id in plan?.mentionIds ?? const <String>[]) {
    add(id, CellEvidence(Evidence.mentioned, node.id));
  }
  for (final id in node.mentions) {
    add(id, CellEvidence(Evidence.linked, node.id));
  }
  for (final id in plan?.entityIds ?? const <String>[]) {
    add(id, CellEvidence(Evidence.involved, node.id));
  }
  for (final event in model.events.values) {
    if (!event.nodeIds.contains(node.id)) continue;
    for (final c in event.characters) {
      add(c.id, CellEvidence(Evidence.event, node.id, event.id));
    }
  }
  return out;
}

/// Whether a place is recorded at a chapter or scene: in its plan, linked in its text, or as where an event it tells
/// happens.
bool _placeAt(StoryNode node, String placeId, StoryModel model) =>
    (model.plans[node.id]?.entityIds.contains(placeId) ?? false) ||
    node.mentions.contains(placeId) ||
    model.events.values.any((e) => e.locationId == placeId && e.nodeIds.contains(node.id));

/// The cell's state: the author's appearance record first; any other record is "other"; nothing at all is "not
/// recorded".
CellState stateOf(List<CellEvidence> evidence) {
  if (evidence.any((e) => e.kind == Evidence.appears)) return CellState.appears;
  if (evidence.any((e) => e.kind == Evidence.mentioned)) return CellState.mentioned;
  return evidence.isEmpty ? CellState.none : CellState.other;
}

/// The matrix. Columns are chapters in reading order (or, by scene, each scene, and a chapter with no scenes as
/// itself; a chapter's own column beside its scenes when anything is recorded on the chapter itself). A chapter's
/// cell gathers the records on it and on its scenes. As the original app's `appearanceMatrix`.
AppearanceMatrix appearanceMatrix(StoryModel model, MatrixFilter filter) {
  final chapters = model.order.chapters;
  int index(String? id) =>
      id == null ? -1 : chapters.indexWhere((c) => c.id == id || model.nodes[id]?.parentId == c.id);
  final lo = filter.from != null ? index(filter.from) : 0;
  final hi = filter.to != null ? index(filter.to) : chapters.length - 1;
  List<StoryNode> scenesOf(StoryNode chapter) => stableSorted(
    model.nodes.values.where((n) => n.parentId == chapter.id && n.kind == NodeKind.scene),
    (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
  );
  final thread = filter.threadId == null ? null : model.threads[filter.threadId];
  final threadNodes = thread == null ? null : {for (final p in placesOf(thread, model)) p.nodeId};
  final records = <String, Map<String, List<CellEvidence>>>{};
  Map<String, List<CellEvidence>> at(StoryNode node) => records[node.id] ??= _recordsAt(node, model);

  final candidates = <({MatrixColumn column, List<StoryNode> nodes})>[];
  for (final (i, chapter) in chapters.indexed) {
    if (i < (lo < 0 ? 0 : lo) || i > (hi < 0 ? chapters.length - 1 : hi)) continue;
    final number = i + 1;
    final scenes = scenesOf(chapter);
    String title(StoryNode n) =>
        n.title.trim().isNotEmpty ? n.title.trim() : (n.kind == NodeKind.scene ? 'Untitled scene' : 'Untitled chapter');
    MatrixColumn column(StoryNode node, String short, String label) => MatrixColumn(
      nodeId: node.id,
      chapterId: chapter.id,
      chapterNumber: number,
      label: label,
      short: short,
      status: node.status,
    );
    if (filter.grain == Grain.chapters || scenes.isEmpty) {
      candidates.add((
        column: column(chapter, '$number', 'Ch $number: ${title(chapter)}'),
        nodes: [chapter, ...scenes],
      ));
      continue;
    }
    if (at(chapter).isNotEmpty || chapter.wordCount > 0) {
      candidates.add((
        column: column(chapter, '$number', 'Ch $number: ${title(chapter)} (the chapter itself)'),
        nodes: [chapter],
      ));
    }
    for (final (k, scene) in scenes.indexed) {
      candidates.add((column: column(scene, '$number.${k + 1}', 'Ch $number, scene: ${title(scene)}'), nodes: [scene]));
    }
  }
  final columns = [
    for (final c in candidates)
      if ((filter.status == null || c.column.status == filter.status) &&
          (threadNodes == null || c.nodes.any((n) => threadNodes.contains(n.id))) &&
          (filter.placeId == null || c.nodes.any((n) => _placeAt(n, filter.placeId!, model))))
        c,
  ];

  final text = filter.text.trim().toLowerCase();
  final people = stableSorted(
    model.entries.values.where(
      (e) =>
          e.category == 'character' &&
          (filter.characterIds.isEmpty || filter.characterIds.contains(e.id)) &&
          (text.isEmpty || e.name.toLowerCase().contains(text)),
    ),
    (a, b) => localeCompare(a.name, b.name),
  );
  final all = [
    for (final person in people)
      MatrixRow(person.id, person.name, [
        for (final c in columns)
          () {
            final evidence = [for (final n in c.nodes) ...?at(n)[person.id]];
            return MatrixCell(stateOf(evidence), evidence);
          }(),
      ]),
  ];
  final rows = filter.all
      ? all
      : [
          for (final r in all)
            if (r.recorded > 0) r,
        ];
  return AppearanceMatrix([for (final c in columns) c.column], rows, all.length - rows.length, people.length);
}

/// A cell's records in words, each saying where it is.
List<String> evidenceWords(List<CellEvidence> evidence, StoryModel model, String columnNodeId) => [
  for (final e in evidence)
    () {
      final where = e.nodeId == columnNodeId ? '' : ' (in “${model.nodes[e.nodeId]?.title ?? 'a scene'}”)';
      return e.kind == Evidence.event
          ? 'Takes part in “${model.events[e.eventId]?.name ?? 'an event'}”, told here$where'
          : '${e.kind.label}$where';
    }(),
];
