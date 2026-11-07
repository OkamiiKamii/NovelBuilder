import '../../../shared/data/backup_service.dart';
import '../../../shared/data/novel_store.dart';
import '../../../shared/domain/characters/cast.dart';
import '../../../shared/domain/characters/character_changes.dart';
import '../../../shared/domain/ids.dart';
import '../../../shared/domain/manuscript/prose.dart';
import '../../../shared/domain/snapshot/collections.dart';
import '../../../shared/domain/snapshot/novel_snapshot.dart';

/// Collections no character screen reads: chapter text and its history. Left out when the cast is read, so a long
/// book's manuscript is not loaded to show its characters.
const _manuscriptText = {'chapterContents', 'chapterRevisions', 'chapterBranches'};

/// The characters of one novel: reading them for the screens, and every change the author makes to them.
///
/// Each change is one transaction, made on the records as stored at that moment (so quick edits in a row build on
/// each other) and refused, with nothing written, if they changed elsewhere since they were read.
class CharacterService {
  CharacterService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  /// The novel without its chapter text: what the character screens show and search.
  NovelSnapshot? read(String projectId) =>
      store.loadPart(projectId, {...novelCollections.keys}.difference(_manuscriptText));

  /// Applies [apply] to the character records as stored now, and saves the result in one transaction.
  T change<T>(String projectId, T Function(CharacterChanges c) apply) {
    final before =
        store.loadPart(projectId, characterCollections) ??
        (throw StateError('That novel is no longer in the library.'));
    final changes = CharacterChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    // The novel shows as changed, as the original app marks it after any change to its content.
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  NovelSnapshot _whole(String projectId) =>
      store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));

  /// Everything in the novel that refers to the character. Reads only.
  CharacterReferences references(String projectId, String entryId) => referencesTo(_whole(projectId), entryId);

  /// Deletes a character, after keeping a restore point. Returns the restore point, for Undo.
  String delete(String projectId, String entryId, {required String name}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before deleting the character “$name”') ??
        (throw StateError('That novel is no longer in the library.'));
    final before = _whole(projectId);
    final after = planCharacterDelete(before, entryId).snapshot;
    store.saveChanges(before, after.copyWith(project: {...before.project, 'updatedAt': _now}));
    return kept;
  }

  void undoDelete(String restorePointId) => backups.restore(restorePointId);

  /// How many times any of [names] occurs in the saved text, as whole words. Words on the page, not appearances.
  int nameMentions(String projectId, List<String> names) => countMentions([
    for (final content in store.rowsIn(projectId, 'chapterContents'))
      for (final block in docBlocks(content['doc'])) block.text,
  ], names);
}
