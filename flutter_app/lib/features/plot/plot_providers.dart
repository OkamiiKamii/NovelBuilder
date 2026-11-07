import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/backup_service.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/model/delete_policy.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/plot/plot_changes.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/structure/pacing.dart';
import '../characters/character_actions.dart';

/// Plot threads, plans and structural markers: every change the author makes to them, one transaction each, made on
/// the records as stored at that moment and refused if they changed elsewhere since.
class PlotService {
  PlotService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  int get _now => _clock().millisecondsSinceEpoch;

  NovelSnapshot _part(String projectId) =>
      store.loadPart(projectId, plotCollections) ?? (throw StateError('That novel is no longer in the library.'));

  T change<T>(String projectId, T Function(PlotChanges c) apply) {
    final before = _part(projectId);
    final changes = PlotChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  T markers<T>(String projectId, T Function(MarkerChanges c) apply) {
    final before = _part(projectId);
    final changes = MarkerChanges(before, now: _now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': _now}));
    return result;
  }

  /// Deletes a thread and its developments, after keeping a restore point. Chapters, scenes and entries it pointed at
  /// are not changed; events and other threads' intersections stop naming it. Returns the restore point, for Undo.
  String deleteThread(String projectId, String threadId, {required String title}) {
    final kept =
        backups.keepRestorePoint(projectId, 'Before deleting the plot thread “$title”') ??
        (throw StateError('That novel is no longer in the library.'));
    final before = store.load(projectId) ?? (throw StateError('That novel is no longer in the library.'));
    final after = planDelete(before, EntityRef(EntityType.thread, threadId)).snapshot;
    store.saveChanges(before, after.copyWith(project: {...before.project, 'updatedAt': _now}));
    return kept;
  }

  void undo(String restorePointId) => backups.restore(restorePointId);
}

final plotServiceProvider = Provider<PlotService>(
  (ref) => PlotService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

String threadPath(String threadId) => '/plan/thread/$threadId';
String chapterPlanPath(String nodeId) => '/plan/chapter/$nodeId';

/// Changes to plot threads, plans and markers from a screen, beside everything a character screen can do.
class PlotActions extends CharacterActions {
  PlotActions(super.context, super.novelId);

  PlotService get plot => container.read(plotServiceProvider);

  T? edit<T>(T Function(PlotChanges c) apply) {
    try {
      return plot.change(novelId, apply);
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  T? editMarkers<T>(T Function(MarkerChanges c) apply) {
    try {
      return plot.markers(novelId, apply);
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return null;
  }

  /// Saves typing through autosave, under [key]: the newest text replaces a waiting save.
  void editLater(String key, void Function(PlotChanges c) apply) {
    final service = plot;
    container.read(saveControllerProvider).schedule('plot:$novelId:$key', () {
      try {
        service.change(novelId, apply);
      } on ChangeRefused catch (e) {
        tell('Not saved: ${e.message}');
      }
    });
  }

  void openThread(String threadId) {
    flush();
    router.go(threadPath(threadId));
  }

  void openPlan(String nodeId) {
    flush();
    router.go(chapterPlanPath(nodeId));
  }
}
