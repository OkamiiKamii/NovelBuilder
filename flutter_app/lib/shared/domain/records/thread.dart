import '../json.dart';
import '../json_record.dart';

enum ThreadStatus { planned, active, paused, resolved, abandoned, retconned, custom }

/// What a beat is to its thread, as the author records it. A beat stored before roles existed is a development.
enum BeatRole { introduction, development, intersection, resolution, appears }

/// One recorded development of a thread, in a chapter or scene.
class ThreadBeat {
  ThreadBeat(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  BeatRole get role => BeatRole.values.where((r) => r.name == raw['role']).firstOrNull ?? BeatRole.development;

  /// For an intersection: the other threads it crosses here.
  List<String> get withThreadIds => strings(raw['withThreadIds']);

  /// A chapter or scene by id. Null while the author has not placed it.
  String? get nodeId => idOrNull(raw['nodeId']);
  String get title => str(raw['title']);
  String get note => str(raw['note']);
}

/// A storyline followed across the manuscript. It points at chapters, scenes and entries by id only and never changes
/// manuscript text. Its status is only ever set by the author; missing beats are never invented.
class PlotThread extends JsonRecord {
  PlotThread(super.raw);

  String get title => str(raw['title']);
  String get premise => str(raw['premise']);
  String get category => str(raw['category'], 'main');
  String get statusKey => str(raw['status'], 'planned');
  ThreadStatus get status =>
      ThreadStatus.values.where((s) => s.name == raw['status']).firstOrNull ?? ThreadStatus.planned;

  /// The author's own name for a custom status.
  String? get customStatus => strOrNull(raw['customStatus']);
  List<String> get characterIds => strings(raw['characterIds']);
  List<String> get locationIds => strings(raw['locationIds']);

  /// Where it is meant to resolve: a volume, act, arc, chapter or scene.
  String? get targetNodeId => idOrNull(raw['targetNodeId']);
  List<ThreadBeat> get beats => [for (final b in maps(raw['beats'])) ThreadBeat(b)];

  PlotThread withFields(JsonMap changes) => PlotThread(merged(changes));
}
