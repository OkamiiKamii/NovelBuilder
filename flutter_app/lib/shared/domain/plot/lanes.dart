import '../collation.dart';
import '../model/story_model.dart';
import '../records/story_node.dart';
import '../records/thread.dart';
import '../stable_sort.dart';

/// PLOT-THREAD LANES. Each thread across the chapters, read only from what the author has recorded: its beats (each at
/// a chapter or scene, with a role) and the timeline events that belong to it, at the chapters and scenes that tell
/// them. Nothing is filled in: a chapter with nothing recorded is shown as that, a gap, and no beat, role or chapter is
/// ever made up for a thread.

/// A chapter or scene where a thread is recorded, and what is recorded there.
class ThreadPlace {
  ThreadPlace(this.nodeId, this.chapterId);
  final String nodeId;

  /// The chapter it is, or is in.
  final String chapterId;
  final List<ThreadBeat> beats = [];

  /// The thread's events that this chapter or scene tells.
  final List<String> eventIds = [];
}

/// The chapter a chapter or scene is in (itself for a chapter); null for a volume, act or arc, or a node that is gone.
String? chapterOf(String nodeId, StoryModel model) {
  var node = model.nodes[nodeId];
  for (var seen = 0; node != null && seen < 50; seen++) {
    if (node.kind == NodeKind.chapter) return node.id;
    if (node.kind != NodeKind.scene) return null;
    node = node.parentId == null ? null : model.nodes[node.parentId];
  }
  return null;
}

/// The role a beat has, as the original reads it: a beat stored before roles is a development; an unknown role is kept
/// as written, and is none of the five.
String roleKey(ThreadBeat beat) => beat.raw['role'] is String ? beat.raw['role']! as String : 'development';

/// Every chapter and scene a thread is recorded at, in reading order.
List<ThreadPlace> placesOf(PlotThread thread, StoryModel model) {
  final places = <String, ThreadPlace>{};
  ThreadPlace? at(String nodeId) {
    final chapterId = chapterOf(nodeId, model);
    if (chapterId == null) return null;
    return places.putIfAbsent(nodeId, () => ThreadPlace(nodeId, chapterId));
  }

  for (final beat in thread.beats) {
    if (beat.nodeId != null) at(beat.nodeId!)?.beats.add(beat);
  }
  for (final event in model.events.values) {
    if (!event.threadIds.contains(thread.id)) continue;
    for (final nodeId in event.nodeIds) {
      at(nodeId)?.eventIds.add(event.id);
    }
  }
  const last = 9007199254740991;
  return stableSorted(
    places.values,
    (a, b) => (model.order.position[a.nodeId] ?? last).compareTo(model.order.position[b.nodeId] ?? last),
  );
}

class LaneCell {
  /// The places in this chapter (the chapter itself, or its scenes).
  final List<ThreadPlace> places = [];
  final List<ThreadBeat> beats = [];
  final List<String> eventIds = [];

  /// The role drawn for the cell: the weightiest among its beats, or null when only events are recorded.
  String? role;
}

/// A run of chapters, between two that have something recorded, with nothing recorded. Column indexes, inclusive.
typedef Gap = ({int from, int to, int chapters});

/// An intersection beat, at a chapter, and a thread it crosses.
typedef Crossing = ({String beatId, int column, String otherId});

class Lane {
  Lane({
    required this.thread,
    required this.cells,
    required this.first,
    required this.last,
    required this.gaps,
    required this.crossings,
    required this.unplaced,
    required this.untold,
  });

  final PlotThread thread;
  final List<LaneCell> cells;

  /// The first and last chapters with anything recorded.
  final int? first;
  final int? last;
  final List<Gap> gaps;
  final List<Crossing> crossings;

  /// Beats with no chapter given, or whose chapter is gone.
  final List<ThreadBeat> unplaced;

  /// The thread's events that no chapter or scene tells.
  final List<String> untold;
}

typedef LaneChapter = ({String id, int number, String title});

class Lanes {
  Lanes(this.chapters, this.lanes);
  final List<LaneChapter> chapters;
  final List<Lane> lanes;
}

/// Which role a cell shows when a chapter holds several: the ones that open and close a thread first.
const _weight = ['resolution', 'introduction', 'intersection', 'development', 'appears'];

/// The threads as lanes across the chapters, in reading order. [threadIds] picks and orders them; by default every
/// thread, by title.
Lanes threadLanes(StoryModel model, [List<String>? threadIds]) {
  final chapters = [for (final (i, c) in model.order.chapters.indexed) (id: c.id, number: i + 1, title: c.title)];
  final column = {for (final (i, c) in chapters.indexed) c.id: i};
  final threads = threadIds != null
      ? [for (final id in threadIds) ?model.threads[id]]
      : stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));
  final lanes = [
    for (final thread in threads)
      () {
        final cells = [for (final _ in chapters) LaneCell()];
        for (final place in placesOf(thread, model)) {
          final i = column[place.chapterId];
          if (i == null) continue;
          final cell = cells[i];
          cell.places.add(place);
          cell.beats.addAll(place.beats);
          for (final id in place.eventIds) {
            if (!cell.eventIds.contains(id)) cell.eventIds.add(id);
          }
        }
        for (final cell in cells) {
          cell.role = _weight.where((r) => cell.beats.any((b) => roleKey(b) == r)).firstOrNull;
        }
        final marked = [
          for (final (i, c) in cells.indexed)
            if (c.places.isNotEmpty) i,
        ];
        final gaps = <Gap>[
          for (var i = 1; i < marked.length; i++)
            if (marked[i] - marked[i - 1] > 1)
              (from: marked[i - 1] + 1, to: marked[i] - 1, chapters: marked[i] - marked[i - 1] - 1),
        ];
        final crossings = <Crossing>[
          for (final (i, cell) in cells.indexed)
            for (final b in cell.beats)
              if (roleKey(b) == 'intersection')
                for (final otherId in b.withThreadIds)
                  if (model.threads.containsKey(otherId)) (beatId: b.id, column: i, otherId: otherId),
        ];
        final placedIds = {
          for (final c in cells)
            for (final b in c.beats) b.id,
        };
        final told = {
          for (final c in cells)
            for (final id in c.eventIds) id,
        };
        return Lane(
          thread: thread,
          cells: cells,
          first: marked.isEmpty ? null : marked.first,
          last: marked.isEmpty ? null : marked.last,
          gaps: gaps,
          crossings: crossings,
          unplaced: [
            for (final b in thread.beats)
              if (!placedIds.contains(b.id)) b,
          ],
          untold: [
            for (final e in model.events.values)
              if (e.threadIds.contains(thread.id) && !told.contains(e.id)) e.id,
          ],
        );
      }(),
  ];
  return Lanes(chapters, lanes);
}

/// A run of chapters in words: "Ch 4" or "Ch 4–7".
String chaptersWords(Lanes lanes, int from, int to) =>
    from == to ? 'Ch ${lanes.chapters[from].number}' : 'Ch ${lanes.chapters[from].number}–${lanes.chapters[to].number}';

/// A gap in words, as a fact: "Nothing recorded in Ch 4–7 (4 chapters)".
String gapWords(Lanes lanes, Gap gap) =>
    'Nothing recorded in ${chaptersWords(lanes, gap.from, gap.to)} (${gap.chapters} ${gap.chapters == 1 ? 'chapter' : 'chapters'})';

/// Where the author recorded a thread's introduction and resolution, or that they have not.
({String introduced, String resolved}) endsOf(Lane lane, Lanes lanes) {
  String? where(String role) {
    final at = lane.cells.indexWhere((c) => c.beats.any((b) => roleKey(b) == role));
    return at < 0 ? null : 'Ch ${lanes.chapters[at].number}';
  }

  return (introduced: where('introduction') ?? 'not recorded', resolved: where('resolution') ?? 'not recorded');
}

const beatRoles = ['introduction', 'development', 'intersection', 'resolution', 'appears'];
const beatRoleLabels = {
  'introduction': 'Introduction',
  'development': 'Development',
  'intersection': 'Intersection',
  'resolution': 'Resolution',
  'appears': 'Appears (no development)',
};

class ThreadHere {
  ThreadHere(this.thread, this.roles, this.plainIds, this.events);
  final PlotThread thread;
  final List<String> roles;

  /// Beats here that only say the thread appears, with no words of the author's: the only kind a card may take away.
  final List<String> plainIds;
  final int events;
}

/// For every chapter and scene, the threads recorded there, with the roles of their beats there, by title.
Map<String, List<ThreadHere>> threadsByNode(StoryModel model) {
  final out = <String, List<ThreadHere>>{};
  for (final thread in stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title))) {
    for (final place in placesOf(thread, model)) {
      final here = ThreadHere(
        thread,
        [
          for (final r in beatRoles)
            if (place.beats.any((b) => roleKey(b) == r)) r,
        ],
        [
          for (final b in place.beats)
            if (roleKey(b) == 'appears' && b.title.trim().isEmpty && b.note.trim().isEmpty) b.id,
        ],
        place.eventIds.length,
      );
      (out[place.nodeId] ??= []).add(here);
    }
  }
  return out;
}
