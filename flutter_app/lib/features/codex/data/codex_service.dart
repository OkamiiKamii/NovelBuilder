import '../../../shared/data/backup_service.dart';
import '../../../shared/data/novel_store.dart';
import '../../../shared/domain/codex/codex_changes.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/json.dart';
import '../../../shared/domain/model/delete_policy.dart';
import '../../../shared/domain/model/entity_ref.dart';
import '../../../shared/domain/snapshot/novel_snapshot.dart';

/// The collections a codex change reads and writes (deleting reaches further).
const codexCollections = {'loreEntries', 'loreSchemas', 'loreLinks'};

/// What refers to an entry, counted, for telling the author before they delete it.
typedef EntryReferences = ({int links, int chapters, int events, int threads, int fields, int plans});

/// The novel's world: its entries and kinds of record, and every change the author makes to them. Each change is one
/// transaction on the records as stored, refused (with nothing written) if they changed elsewhere since.
///
/// REFERENCE ISOLATION RULE: nothing here writes manuscript text.
class CodexService {
  CodexService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  T change<T>(String projectId, T Function(CodexChanges c) apply) {
    final before =
        store.loadPart(projectId, codexCollections) ?? (throw StateError('That novel is no longer in the library.'));
    final changes = CodexChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  NovelSnapshot _whole(String projectId) =>
      store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));

  /// Everything that refers to an entry. Reads only.
  EntryReferences references(String projectId, String entryId) {
    final s = _whole(projectId);
    int count(String collection, bool Function(JsonMap row) test) => s.rows(collection).where(test).length;
    return (
      links: count('loreLinks', (l) => l['fromId'] == entryId || l['toId'] == entryId),
      chapters: count('chapters', (n) => strings(n['mentions']).contains(entryId)),
      events: count(
        'timelineEvents',
        (e) =>
            e['locationId'] == entryId ||
            strings(e['entryIds']).contains(entryId) ||
            maps(e['characters']).any((c) => c['id'] == entryId),
      ),
      threads: count(
        'plotThreads',
        (t) => strings(t['characterIds']).contains(entryId) || strings(t['locationIds']).contains(entryId),
      ),
      fields: count(
        'loreEntries',
        (e) => e['id'] != entryId && maps(e['fields']).any((f) => str(f['value']).split('\n').contains(entryId)),
      ),
      plans: count('chapterPlans', (p) => strings(p['entityIds']).contains(entryId)),
    );
  }

  /// Deletes an entry with its links, as every entry is deleted ([planDelete]), after keeping a restore point.
  /// Returns the restore point, for Undo.
  String delete(String projectId, String entryId, {required String name}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before deleting “$name”') ??
        (throw StateError('That novel is no longer in the library.'));
    final before = _whole(projectId);
    final after = planDelete(before, EntityRef(EntityType.entry, entryId)).snapshot;
    store.saveChanges(before, after.copyWith(project: {...before.project, 'updatedAt': _now}));
    return kept;
  }

  void undoDelete(String restorePointId) => backups.restore(restorePointId);
}
