import '../../../shared/data/backup_service.dart';
import '../../../shared/data/novel_store.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/model/delete_policy.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/snapshot/novel_snapshot.dart';
import '../../../shared/domain/timeline/event_changes.dart';

/// A novel's timeline: every change the author makes to its events, its calendar and its alternate histories.
///
/// Each change is one transaction, made on the records as stored at that moment (so quick edits in a row build on
/// each other) and refused, with nothing written, if they changed elsewhere since they were read.
class TimelineService {
  TimelineService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  /// Applies [apply] to the timeline as stored now, and saves the result in one transaction.
  T change<T>(String projectId, T Function(EventChanges c) apply) {
    final before =
        store.loadPart(projectId, timelineCollections) ?? (throw StateError('That novel is no longer in the library.'));
    final changes = EventChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    // The novel shows as changed, as the original app marks it after any change to its content.
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  NovelSnapshot _whole(String projectId) =>
      store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));

  /// Deletes an event after keeping a restore point, and returns the restore point, for Undo. Chapters, scenes and
  /// entries it links to are not changed; its connections go with it, and events set to follow it are flagged.
  String deleteEvent(String projectId, String eventId, {required String name}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before deleting the event “$name”') ??
        (throw StateError('That novel is no longer in the library.'));
    final before = _whole(projectId);
    final after = planDelete(before, EntityRef(EntityType.event, eventId)).snapshot;
    store.saveChanges(before, after.copyWith(project: {...before.project, 'updatedAt': _now}));
    return kept;
  }

  void undo(String restorePointId) => backups.restore(restorePointId);
}
