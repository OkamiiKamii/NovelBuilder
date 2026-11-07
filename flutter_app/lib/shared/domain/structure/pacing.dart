import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../collation.dart';
import '../json.dart';
import '../json_record.dart';
import '../model/story_model.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import '../timeline/event_changes.dart' show suggestedLabels;

/// STRUCTURE AND PACING. Charts drawn only from what is recorded: the word counts the editor keeps, the volumes, acts
/// and arcs the chapters sit in, the labels the author gives chapters, scenes and events, and the markers they place.
/// They describe the manuscript as it stands; they do not measure quality or whether a structure is right, and no
/// formula is expected: the markers are only the ones the author adds.

const suggestedMarkers = [
  'Act break',
  'Inciting incident',
  'Turning point',
  'Midpoint',
  'Major reveal',
  'Climax',
  'Resolution',
];

/// A structural marker: where in the book something the author considers structural happens.
class StructureMarker extends JsonRecord {
  StructureMarker(super.raw);

  /// What it is, in the author's words: one of the suggestions, or their own.
  String get kind => str(raw['kind']);

  /// Optional words of its own: "The bridge falls".
  String get title => str(raw['title']);

  /// Where the reader meets it: a chapter or scene.
  String? get nodeId => idOrNull(raw['nodeId']);

  /// When it happens in story time, if the author ties it to an event.
  String? get eventId => idOrNull(raw['eventId']);
  String get note => str(raw['note']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// Labels in a steady order: the suggestions first, as listed, then the author's own, alphabetically.
List<String> labelOrder(Iterable<String> labels) {
  int rank(String l) {
    final i = suggestedLabels.indexWhere((s) => s.toLowerCase() == l.toLowerCase());
    return i < 0 ? suggestedLabels.length : i;
  }

  return stableSorted({...labels}, (a, b) {
    final r = rank(a) - rank(b);
    return r != 0 ? r : localeCompare(a, b);
  });
}

enum Grain { chapters, scenes }

/// One bar of the length chart: a chapter (with its scenes), or a scene.
class LengthBar {
  LengthBar({
    required this.nodeId,
    required this.chapterId,
    required this.chapterNumber,
    required this.label,
    required this.words,
    required this.labels,
    required this.partId,
  });

  final String nodeId;

  /// The chapter it is, or is in.
  final String chapterId;
  final int chapterNumber;

  /// "Ch 3: The Seal", or "Ch 3, scene: The vault".
  final String label;
  final int words;

  /// Labels given to it (for a chapter, to it or any of its scenes), in a steady order.
  final List<String> labels;

  /// The volume, act or arc nearest around it, if any.
  final String? partId;
}

/// A run of bars inside the same volume, act or arc. Bar indexes, inclusive.
class PartBand {
  PartBand(this.partId, this.title, this.kind, this.from, this.to);
  final String partId;
  final String title;
  final String kind;
  final int from;
  int to;
}

/// A label is the same label whatever its capitals: each is shown as first spelled in reading order, then on events.
final _spellings = Expando<Map<String, String>>();

String _spellingOf(StoryModel model, String label) {
  var known = _spellings[model];
  if (known == null) {
    known = {};
    const last = 9007199254740991;
    final plans = stableSorted(model.plans.values, (a, b) {
      final byPosition = (model.order.position[a.id] ?? last).compareTo(model.order.position[b.id] ?? last);
      return byPosition != 0 ? byPosition : localeCompare(a.id, b.id);
    });
    final events = stableSorted(model.events.values, (a, b) => localeCompare(a.id, b.id));
    for (final l in [...plans.expand((p) => p.labels), ...events.expand((e) => e.labels)]) {
      known.putIfAbsent(l.toLowerCase(), () => l);
    }
    _spellings[model] = known;
  }
  return known[label.toLowerCase()] ?? label;
}

List<String> _labelsOf(StoryModel model, String nodeId) =>
    {for (final l in model.plans[nodeId]?.labels ?? const <String>[]) _spellingOf(model, l)}.toList();

bool _isGroup(NodeKind? kind) => kind == NodeKind.volume || kind == NodeKind.act || kind == NodeKind.arc;

/// The volume, act or arc a node sits nearest inside, if any.
String? _nearestPart(StoryNode node, StoryModel model) {
  var at = node.parentId == null ? null : model.nodes[node.parentId];
  for (var seen = 0; at != null && seen < 50; seen++) {
    if (_isGroup(at.kind)) return at.id;
    at = at.parentId == null ? null : model.nodes[at.parentId];
  }
  return null;
}

bool _inside(StoryNode node, String partId, StoryModel model) {
  var at = node.parentId == null ? null : model.nodes[node.parentId];
  for (var seen = 0; at != null && seen < 50; seen++) {
    if (at.id == partId) return true;
    at = at.parentId == null ? null : model.nodes[at.parentId];
  }
  return false;
}

List<StoryNode> _scenesOf(StoryModel model, String chapterId) => stableSorted([
  for (final n in model.nodes.values)
    if (n.parentId == chapterId && n.kind == NodeKind.scene) n,
], (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0));

/// The bars of the length chart, in reading order. By chapter, a chapter's words include its scenes'. By scene, each
/// scene is a bar; a chapter with no scenes is a bar of its own, and a chapter's own text beside its scenes is too, so
/// no words go uncounted.
List<LengthBar> lengthBars(StoryModel model, {Grain grain = Grain.chapters, String? partId}) {
  final bars = <LengthBar>[];
  for (final (i, chapter) in model.order.chapters.indexed) {
    if (partId != null && !_inside(chapter, partId, model)) continue;
    final number = i + 1;
    final scenes = _scenesOf(model, chapter.id);
    final part = _nearestPart(chapter, model);
    final title = chapter.title.trim().isEmpty ? 'Untitled chapter' : chapter.title.trim();
    if (grain == Grain.chapters || scenes.isEmpty) {
      bars.add(
        LengthBar(
          nodeId: chapter.id,
          chapterId: chapter.id,
          chapterNumber: number,
          label: 'Ch $number: $title',
          words: chapter.wordCount + scenes.fold(0, (n, s) => n + s.wordCount),
          labels: labelOrder([..._labelsOf(model, chapter.id), ...scenes.expand((s) => _labelsOf(model, s.id))]),
          partId: part,
        ),
      );
      continue;
    }
    if (chapter.wordCount > 0) {
      bars.add(
        LengthBar(
          nodeId: chapter.id,
          chapterId: chapter.id,
          chapterNumber: number,
          label: 'Ch $number: $title (chapter text)',
          words: chapter.wordCount,
          labels: labelOrder(_labelsOf(model, chapter.id)),
          partId: part,
        ),
      );
    }
    for (final scene in scenes) {
      bars.add(
        LengthBar(
          nodeId: scene.id,
          chapterId: chapter.id,
          chapterNumber: number,
          label: 'Ch $number, scene: ${scene.title.trim().isEmpty ? 'Untitled scene' : scene.title.trim()}',
          words: scene.wordCount,
          labels: labelOrder(_labelsOf(model, scene.id)),
          partId: part,
        ),
      );
    }
  }
  return bars;
}

/// The volumes, acts and arcs as bands over the bars they hold.
List<PartBand> partBands(List<LengthBar> bars, StoryModel model) {
  final bands = <PartBand>[];
  for (final (i, bar) in bars.indexed) {
    final last = bands.lastOrNull;
    if (bar.partId != null && last?.partId == bar.partId && last!.to == i - 1) {
      last.to = i;
    } else if (bar.partId != null) {
      final part = model.nodes[bar.partId]!;
      bands.add(PartBand(bar.partId!, part.title.trim().isEmpty ? 'Untitled' : part.title.trim(), part.kindKey, i, i));
    }
  }
  return bands;
}

int _jsRound(num n) => (n + 0.5).floor();

/// Plain facts about the bars: totals, middle values, the longest and shortest, and what is not written or labelled.
({int count, int total, int average, int median, LengthBar? longest, LengthBar? shortest, int empty, int labelled})
lengthFacts(List<LengthBar> bars) {
  final written = [
    for (final b in bars)
      if (b.words > 0) b,
  ];
  final total = bars.fold(0, (n, b) => n + b.words);
  final sorted = [for (final b in written) b.words]..sort();
  final median = sorted.isEmpty
      ? 0
      : sorted.length.isOdd
      ? sorted[(sorted.length - 1) ~/ 2]
      : _jsRound((sorted[sorted.length ~/ 2 - 1] + sorted[sorted.length ~/ 2]) / 2);
  LengthBar? by(bool Function(LengthBar a, LengthBar b) pick) {
    LengthBar? best;
    for (final b in written) {
      if (best == null || pick(b, best)) best = b;
    }
    return best;
  }

  return (
    count: bars.length,
    total: total,
    // Over the bars with any words: an empty chapter is not written yet, not short.
    average: written.isEmpty ? 0 : _jsRound(total / written.length),
    median: median,
    longest: by((a, b) => a.words > b.words),
    shortest: by((a, b) => a.words < b.words),
    empty: bars.length - written.length,
    labelled: bars.where((b) => b.labels.isNotEmpty).length,
  );
}

class LabelCell {
  LabelCell(this.nodeId, this.words, this.unlabelled);
  final String nodeId;
  final Map<String, int> words;
  final int unlabelled;
}

/// Words by label, bar by bar. A chapter or scene counts its words under each of its labels, so one with two labels
/// counts toward both; unlabelled words are counted apart. At chapter level, each of a chapter's scenes (and its own
/// text) counts under its own labels.
({List<String> labels, List<LabelCell> cells, List<({String label, int words, int bars})> totals, int unlabelled})
labelDistribution(List<LengthBar> bars, StoryModel model, Grain grain) {
  List<({int words, List<String> labels})> parts(LengthBar bar) {
    if (grain == Grain.scenes || bar.nodeId != bar.chapterId) {
      return [(words: bar.words, labels: _labelsOf(model, bar.nodeId))];
    }
    final chapter = model.nodes[bar.chapterId]!;
    final scenes = [
      for (final n in model.nodes.values)
        if (n.parentId == chapter.id && n.kind == NodeKind.scene) n,
    ];
    return [
      (words: chapter.wordCount, labels: _labelsOf(model, chapter.id)),
      for (final s in scenes) (words: s.wordCount, labels: _labelsOf(model, s.id)),
    ];
  }

  final cells = [
    for (final bar in bars)
      () {
        final words = <String, int>{};
        var unlabelled = 0;
        for (final p in parts(bar)) {
          if (p.labels.isEmpty) unlabelled += p.words;
          for (final label in p.labels) {
            words[label] = (words[label] ?? 0) + p.words;
          }
        }
        return LabelCell(bar.nodeId, words, unlabelled);
      }(),
  ];
  final labels = labelOrder(cells.expand((c) => c.words.keys));
  return (
    labels: labels,
    cells: cells,
    totals: [
      for (final label in labels)
        (
          label: label,
          words: cells.fold(0, (n, c) => n + (c.words[label] ?? 0)),
          bars: cells.where((c) => c.words.containsKey(label)).length,
        ),
    ],
    unlabelled: cells.fold(0, (n, c) => n + c.unlabelled),
  );
}

/// Every label used in the novel, on chapters, scenes and events, in a steady order. For pickers and filters.
List<String> usedLabels(StoryModel model) => labelOrder([
  for (final l in [...model.plans.values.expand((p) => p.labels), ...model.events.values.expand((e) => e.labels)])
    _spellingOf(model, l),
]);

/// A marker placed in the book: at its chapter or scene, else at the first that tells its event; or not placed.
class PlacedMarker {
  PlacedMarker(this.marker, this.nodeId, this.via, {required this.missing});
  final StructureMarker marker;
  final String? nodeId;

  /// How it got its place: `node`, `event`, or null.
  final String? via;

  /// It names a chapter or scene that has since been removed.
  final bool missing;
}

List<PlacedMarker> placeMarkers(List<StructureMarker> markers, StoryModel model) {
  const last = 9007199254740991;
  int position(String id) => model.order.position[id] ?? last;
  final placed = [
    for (final marker in markers)
      () {
        if (marker.nodeId != null && model.nodes.containsKey(marker.nodeId)) {
          return PlacedMarker(marker, marker.nodeId, 'node', missing: false);
        }
        final told = marker.eventId == null
            ? null
            : (stableSorted([
                for (final id in model.events[marker.eventId]?.nodeIds ?? const <String>[])
                  if (model.nodes.containsKey(id)) id,
              ], (a, b) => position(a).compareTo(position(b))).firstOrNull);
        return PlacedMarker(marker, told, told == null ? null : 'event', missing: marker.nodeId != null);
      }(),
  ];
  return stableSorted(placed, (a, b) {
    final byPlace = (a.nodeId == null ? last : position(a.nodeId!)).compareTo(
      b.nodeId == null ? last : position(b.nodeId!),
    );
    return byPlace != 0 ? byPlace : a.marker.createdAt.compareTo(b.marker.createdAt);
  });
}

/// The bar a placed marker falls on: its own bar, or the bar of the chapter it is in.
int barOf(PlacedMarker placed, List<LengthBar> bars, StoryModel model) {
  final nodeId = placed.nodeId;
  if (nodeId == null) return -1;
  final own = bars.indexWhere((b) => b.nodeId == nodeId);
  if (own >= 0) return own;
  final node = model.nodes[nodeId];
  final chapterId = node?.kind == NodeKind.scene ? node!.parentId : nodeId;
  return bars.indexWhere((b) => b.chapterId == chapterId);
}

/// Changes to a novel's structural markers. A marker needs a kind; where it is may be a chapter or scene, an event,
/// both or neither.
class MarkerChanges extends RecordChanges {
  MarkerChanges(super.snapshot, {required super.now, required super.createId});

  List<StructureMarker> list() => stableSorted([
    for (final r in rows('structureMarkers')) StructureMarker(r),
  ], (a, b) => a.createdAt.compareTo(b.createdAt));

  /// Adds a marker ([markerId] null) or changes one.
  String save(String? markerId, JsonMap changes) {
    final was = markerId == null ? null : row('structureMarkers', markerId);
    if (markerId != null && was == null) throw ChangeRefused('That marker is no longer there.');
    final next = <String, Object?>{
      ...was ??
          {
            'id': newId(),
            'projectId': projectId,
            'kind': '',
            'title': '',
            'nodeId': null,
            'eventId': null,
            'note': '',
            'createdAt': now,
          },
      ...changes,
      'updatedAt': now,
    };
    var kind = '${next['kind'] ?? ''}'.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (kind.length > 40) kind = kind.substring(0, 40);
    if (kind.isEmpty) throw ChangeRefused('Say what kind of marker it is.');
    next['kind'] = kind;
    final title = '${next['title'] ?? ''}'.trim();
    next['title'] = title.length > 120 ? title.substring(0, 120) : title;
    next['note'] = next['note'] ?? '';
    final nodeId = idOrNull(next['nodeId']);
    if (nodeId != null) {
      final node = row('chapters', nodeId);
      if (node == null || (node['kind'] != 'chapter' && node['kind'] != 'scene')) {
        throw ChangeRefused('That chapter or scene is not in this novel.');
      }
    }
    final eventId = idOrNull(next['eventId']);
    if (eventId != null && row('timelineEvents', eventId) == null) {
      throw ChangeRefused('That event is not in this novel.');
    }
    put('structureMarkers', next);
    return next['id']! as String;
  }

  void removeMarker(String markerId) {
    if (row('structureMarkers', markerId) != null) remove('structureMarkers', markerId);
  }
}
