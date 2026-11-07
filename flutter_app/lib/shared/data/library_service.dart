import '../domain/ids.dart';
import '../domain/json.dart';
import '../domain/records/novel.dart';
import '../domain/snapshot/copy.dart';
import '../domain/snapshot/novel_snapshot.dart';
import 'backup_service.dart';
import 'novel_store.dart';

/// Managing the novels in the library: create, edit details, pin, archive, duplicate, delete, import as a copy.
///
/// Every novel is isolated: its records are stored under its own id, copies get new ids for everything, and nothing
/// one novel holds points into another. Deleting keeps a restore point first, so it can be undone.
class LibraryService {
  LibraryService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  /// [base] if no novel has that title, otherwise "[base] 2", "[base] 3"…
  String uniqueTitle(String base) {
    final taken = {for (final n in store.listNovels()) n.title};
    if (!taken.contains(base)) return base;
    for (var n = 2; ; n++) {
      if (!taken.contains('$base $n')) return '$base $n';
    }
  }

  /// A new novel with these details. With [setupFrom], it starts organised like that novel (its record kinds and
  /// fields, relationship types, calendar, progress tracking and systems), with none of its story.
  Novel create(JsonMap details, {String? setupFrom}) {
    final now = _now;
    final clean = normalizeNovelDetails(details);
    final project = {
      ...clean,
      'id': _createId(),
      'pinned': false,
      'archived': false,
      'createdAt': now,
      'updatedAt': now,
      'lastOpenedAt': null,
    };
    if (setupFrom == null) {
      store.putNovel(NovelSnapshot(project: project, collections: const {}));
      return Novel(project);
    }
    final source = store.load(setupFrom);
    if (source == null) throw StateError('The novel to copy the setup from no longer exists.');
    final copy = setupOf(source, project, now: now, createId: _createId);
    store.putNovel(copy);
    return Novel(copy.project);
  }

  Novel _require(String id) => store.novel(id) ?? (throw StateError('That novel is no longer in the library.'));

  /// Changes the details the author edits. Every other field of the novel, known to this version or not, is kept.
  void updateDetails(String id, JsonMap details) {
    final current = _require(id);
    store.putNovelDetails(
      current.withFields({
        ...normalizeNovelDetails({...current.raw, ...details}),
        'updatedAt': _now,
      }),
    );
  }

  void setPinned(String id, bool pinned) => store.putNovelDetails(_require(id).withFields({'pinned': pinned}));

  /// Archiving hides a novel from the main list; nothing in it changes. An archived novel is not pinned.
  void setArchived(String id, bool archived) => store.putNovelDetails(
    _require(id).withFields({'archived': archived, if (archived) 'pinned': false, 'updatedAt': _now}),
  );

  void markOpened(String id) => store.putNovelDetails(_require(id).withFields({'lastOpenedAt': _now}));

  /// A separate copy of the novel, titled "… (Copy)": new ids for everything, every link kept within the copy.
  /// Version history stays with the original.
  Novel duplicate(String id) {
    final source = store.load(id) ?? (throw StateError('That novel is no longer in the library.'));
    final copy = duplicateNovel(
      source,
      title: uniqueTitle('${Novel(source.project).title} (Copy)'),
      now: _now,
      createId: _createId,
    );
    _checkIsolated(source, copy);
    store.putNovel(copy);
    return Novel(copy.project);
  }

  /// Imports a backup as a separate novel, beside any novel it came from: new ids, title made unique.
  Novel importAsCopy(ImportPreview preview) {
    final source = preview.snapshot;
    final copy = copyNovel(source, title: uniqueTitle(Novel(source.project).title), now: _now, createId: _createId);
    _checkIsolated(source, copy);
    store.putNovel(copy);
    return Novel(copy.project);
  }

  /// Deletes a novel. A restore point is kept first (Settings → Restore points), and its id returned for Undo; if it
  /// cannot be kept, nothing is deleted.
  String delete(String id) {
    final kept =
        backups.keepRestorePoint(id, 'Before deleting it') ??
        (throw StateError('That novel is no longer in the library.'));
    store.deleteNovel(id);
    return kept;
  }

  /// Brings back a novel deleted with [delete].
  void undoDelete(String restorePointId) => backups.restore(restorePointId);

  static void _checkIsolated(NovelSnapshot source, NovelSnapshot copy) {
    final foreign = foreignReferences(source, copy);
    if (foreign.isNotEmpty) {
      throw StateError('The copy would still point into the original (${foreign.first}). Nothing was saved.');
    }
  }
}
