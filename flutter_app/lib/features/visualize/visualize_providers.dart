import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/backup_service.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/entity_ref.dart';
import '../../shared/domain/model/query.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/visualize/saved_views.dart';
import '../workspace/open_novel.dart';

/// Saved views and which views are on: the only things the Visualize workspace stores. Nothing is stored for a view's
/// content; every view reads the novel's records as they are.
class VisualizeService {
  VisualizeService(this.store, this.backups, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final BackupService backups;
  final DateTime Function() _clock;
  final String Function() _createId;

  T change<T>(String projectId, T Function(SavedViewChanges c) apply) {
    final before =
        store.loadPart(projectId, const {'savedViews'}) ??
        (throw StateError('That novel is no longer in the library.'));
    final now = _clock().millisecondsSinceEpoch;
    final changes = SavedViewChanges(before, now: now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...changes.snapshot.project, 'updatedAt': now}));
    return result;
  }
}

final visualizeServiceProvider = Provider<VisualizeService>(
  (ref) => VisualizeService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

/// What the workspace is looking at, shared by every view so moving between them keeps it: the filters, the selected
/// record, and the saved view open in each view. Not stored: a saved view keeps what is worth keeping.
class VizState {
  const VizState({this.filter = const {}, this.selection, this.openSaved = const {}, this.missing = 0});

  /// The filters, in the original's shape (see `saved_views.dart`).
  final JsonMap filter;
  final EntityRef? selection;

  /// The saved view open in each view, by view key.
  final Map<String, String> openSaved;

  /// How many records the open saved view names that no longer exist.
  final int missing;

  VizState copyWith({
    JsonMap? filter,
    EntityRef? Function()? selection,
    Map<String, String>? openSaved,
    int? missing,
  }) => VizState(
    filter: filter ?? this.filter,
    selection: selection == null ? this.selection : selection(),
    openSaved: openSaved ?? this.openSaved,
    missing: missing ?? this.missing,
  );
}

class VizStateNotifier extends Notifier<VizState> {
  @override
  VizState build() {
    // Each novel starts plain.
    ref.watch(openNovelProvider);
    return const VizState();
  }

  void setFilter(JsonMap filter) => state = state.copyWith(filter: cleanFilter(filter), missing: 0);
  void select(EntityRef? ref) => state = state.copyWith(selection: () => ref);

  void openSaved(String view, String? id, {JsonMap? filter, int missing = 0}) => state = state.copyWith(
    openSaved: {
      for (final e in state.openSaved.entries)
        if (e.key != view) e.key: e.value,
      view: ?id,
    },
    filter: filter ?? state.filter,
    missing: missing,
  );
}

final vizStateProvider = NotifierProvider<VizStateNotifier, VizState>(VizStateNotifier.new);

/// The records the filters leave, by key (`entry:<id>`), of the given kinds; null when no filter is set, so a view
/// shows everything. The shared query decides, the same way in every view.
Set<String>? matchingKeys(StoryModel model, JsonMap filter, List<EntityType> types) {
  if (activeFilters(filter) == 0) return null;
  final result = select(
    model,
    Filter.fromJson({
      ...filter,
      'types': [for (final t in types) t.name],
    }),
  );
  return {for (final v in result.items) v.ref.key};
}

/// Whether the views show canon and continuity marks: a record's canon status when it is not plain canon, and what the
/// checks found about it that is still open. Off until the author turns it on; each novel starts with it off.
class CanonMarksNotifier extends Notifier<bool> {
  @override
  bool build() {
    ref.watch(openNovelProvider);
    return false;
  }

  void set(bool on) => state = on;
}

final canonMarksProvider = NotifierProvider<CanonMarksNotifier, bool>(CanonMarksNotifier.new);
