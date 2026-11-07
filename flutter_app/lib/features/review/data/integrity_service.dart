import '../../../shared/data/backup_service.dart';
import '../../../shared/data/novel_store.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/integrity/fixes.dart' as fix;
import '../../../shared/domain/json.dart';
import '../../../shared/domain/records/review.dart';
import '../../../shared/domain/snapshot/novel_snapshot.dart';

/// The record check's fixes and decisions. Each is one transaction on the whole novel as stored, refused (with nothing
/// written) if it changed elsewhere since; nothing happens until the author chooses it.
class IntegrityService {
  IntegrityService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  NovelSnapshot _whole(String projectId) =>
      store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));

  void _apply(String projectId, NovelSnapshot Function(NovelSnapshot s) change) {
    final before = _whole(projectId);
    store.saveChanges(before, change(before).copyWith(project: {...before.project, 'updatedAt': _now}));
  }

  void removeReference(String projectId, String table, String rowId, String missingId) =>
      _apply(projectId, (s) => fix.removeReference(s, table, rowId, missingId, now: _now));

  void pointField(String projectId, String entryId, String fieldId, String words, String targetId) =>
      _apply(projectId, (s) => fix.pointField(s, entryId, fieldId, words, targetId, now: _now));

  /// What a merge would do. Reads only.
  fix.MergePlan mergePlan(String projectId, String keepId, String mergeId) =>
      fix.mergePlan(_whole(projectId), keepId, mergeId);

  /// Merges, after keeping a restore point. Returns the restore point, for Undo.
  String merge(String projectId, String keepId, String mergeId, {required String names}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before merging $names') ??
        (throw StateError('That novel is no longer in the library.'));
    _apply(projectId, (s) => fix.mergeEntries(s, keepId, mergeId, now: _now));
    return kept;
  }

  void undo(String restorePointId) => backups.restore(restorePointId);

  /// Records the author's decision about a finding ("not duplicates"), replacing any earlier one. Nothing else changes.
  void decide(String projectId, String key, String message, ReviewDecision kind, {String note = '', String? nodeId}) {
    final existing = store.rowsIn(projectId, 'continuityResolutions').where((r) => r['key'] == key).firstOrNull;
    final now = _now;
    store.writeRows(projectId, [
      RowWrite.put('continuityResolutions', {
        ...?existing,
        'id': existing?['id'] ?? _createId(),
        'projectId': projectId,
        'key': key,
        'kind': kind.name,
        'note': note.trim(),
        'message': message,
        'nodeId': nodeId != null && store.row(projectId, 'chapters', nodeId) != null ? nodeId : existing?['nodeId'],
        'createdAt': existing?['createdAt'] ?? now,
        'updatedAt': now,
      }, expect: existing ?? RowWrite.unchecked),
    ]);
  }

  /// Withdraws a decision, so the finding is raised again if it still applies.
  void reopen(String projectId, String decisionId) =>
      store.writeRows(projectId, [RowWrite.delete('continuityResolutions', decisionId)]);

  List<ReviewItem> decisions(String projectId) => [
    for (final r in store.rowsIn(projectId, 'continuityResolutions')) ReviewItem(r),
  ];

  JsonMap? row(String projectId, String collection, String id) => store.row(projectId, collection, id);
}
