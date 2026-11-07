import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/ids.dart';
import '../../shared/domain/progression/snapshots.dart';
import '../../shared/domain/progression/track_changes.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/systems/system_changes.dart';
import '../characters/character_actions.dart';

/// Systems, progression changes and snapshots: every change one transaction, made on the records as stored at that
/// moment and refused if they changed elsewhere since.
class ProgressionService {
  ProgressionService(this.store, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DateTime Function() _clock;
  final String Function() _createId;

  static final collections = {...systemCollections, ...trackerCollections};

  int get _now => _clock().millisecondsSinceEpoch;

  T _change<C, T>(
    String projectId,
    C Function(NovelSnapshot s, int now) make,
    NovelSnapshot Function(C c) after,
    T Function(C c) apply,
  ) {
    final before =
        store.loadPart(projectId, collections) ?? (throw StateError('That novel is no longer in the library.'));
    final changes = make(before, _now);
    final result = apply(changes);
    store.saveChanges(before, after(changes).copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  T track<T>(String projectId, T Function(TrackChanges c) apply) =>
      _change(projectId, (s, now) => TrackChanges(s, now: now, createId: _createId), (c) => c.snapshot, apply);

  T systems<T>(String projectId, T Function(SystemChanges c) apply) =>
      _change(projectId, (s, now) => SystemChanges(s, now: now, createId: _createId), (c) => c.snapshot, apply);

  T snapshots<T>(String projectId, T Function(SnapshotChanges c) apply) =>
      _change(projectId, (s, now) => SnapshotChanges(s, now: now, createId: _createId), (c) => c.snapshot, apply);
}

final progressionServiceProvider = Provider<ProgressionService>(
  (ref) => ProgressionService(ref.watch(novelStoreProvider)),
);

String systemsPath({String? systemId, String? tab, String? sheetId}) {
  final query = {'system': ?systemId, 'tab': ?tab, 'sheet': ?sheetId};
  return Uri(path: '/organize/systems', queryParameters: query.isEmpty ? null : query).toString();
}

/// Changes to systems and progression from a screen, beside everything a character screen can do.
class ProgressionActions extends CharacterActions {
  ProgressionActions(super.context, super.novelId);

  ProgressionService get progression => container.read(progressionServiceProvider);

  T? _try<T>(T Function() run) {
    try {
      return run();
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  T? track<T>(T Function(TrackChanges c) apply) => _try(() => progression.track(novelId, apply));
  T? systems<T>(T Function(SystemChanges c) apply) => _try(() => progression.systems(novelId, apply));
  T? snapshots<T>(T Function(SnapshotChanges c) apply) => _try(() => progression.snapshots(novelId, apply));

  /// Saves typing through autosave, under [key]: the newest text replaces a waiting save.
  void systemsLater(String key, void Function(SystemChanges c) apply) {
    final service = progression;
    container.read(saveControllerProvider).schedule('systems:$novelId:$key', () {
      try {
        service.systems(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  void snapshotsLater(String key, void Function(SnapshotChanges c) apply) {
    final service = progression;
    container.read(saveControllerProvider).schedule('snapshots:$novelId:$key', () {
      try {
        service.snapshots(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  void openSystems({String? systemId, String? tab, String? sheetId}) {
    flush();
    router.go(systemsPath(systemId: systemId, tab: tab, sheetId: sheetId));
  }
}

/// The snapshots of the open novel's characters, from the cast's snapshot.
List<ProgressSnapshot> snapshotsOf(NovelSnapshot s) => [
  for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r),
];
