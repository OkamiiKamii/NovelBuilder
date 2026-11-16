import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/records/novel.dart';
import 'autosave.dart';
import 'backup_files.dart';
import 'backup_service.dart';
import 'database.dart';
import 'draft_store.dart';
import 'library_service.dart';
import 'novel_store.dart';
import 'settings_store.dart';

/// The library on this device. Opened once at startup (see `app/bootstrap.dart`), and by tests with
/// `AppDatabase.inMemory()`.
final databaseProvider = Provider<AppDatabase>(
  (ref) => throw StateError('The library is opened at startup and provided with an override.'),
);

final novelStoreProvider = Provider<NovelStore>((ref) {
  final store = NovelStore(ref.watch(databaseProvider));
  ref.onDispose(store.dispose);
  return store;
});

final settingsStoreProvider = Provider<SettingsStore>((ref) => SettingsStore(ref.watch(databaseProvider)));

final draftStoreProvider = Provider<DraftStore>((ref) => DraftStore(ref.watch(databaseProvider)));

final restorePointStoreProvider = Provider<RestorePointStore>((ref) => RestorePointStore(ref.watch(databaseProvider)));

final backupServiceProvider = Provider<BackupService>(
  (ref) => BackupService(ref.watch(novelStoreProvider), ref.watch(restorePointStoreProvider)),
);

final libraryServiceProvider = Provider<LibraryService>(
  (ref) => LibraryService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

/// What each novel holds (words, chapters…), for the library. Counted only while a page shows it (the library, not the
/// page being written on: a save there no longer counts every book of the library), and then only for the books
/// written in since they were last counted (each by its own records); the first time, all at once.
class NovelStatsNotifier extends Notifier<Map<String, NovelStats>> {
  @override
  Map<String, NovelStats> build() {
    final store = ref.watch(novelStoreProvider);
    final kept = ref.watch(_statsKeptProvider);
    Map<String, NovelStats> count() {
      final ids = [for (final n in store.listNovels()) n.id];
      // Each book's count of writes to what is counted, read before counting: a write in between is counted again
      // next time, never missed.
      final now = {for (final id in ids) id: store.versionOf(id, NovelStore.statsCollections)};
      final first = kept.versions.isEmpty;
      final stale = [
        for (final id in ids)
          if (kept.versions[id] != now[id]) id,
      ];
      // Nothing written, no book come or gone: the numbers already counted (a book with no records has none).
      if (!first && stale.isEmpty && kept.versions.length == ids.length) return kept.stats;
      final fresh = first ? store.stats() : store.stats(only: stale);
      final staleIds = stale.toSet();
      final next = Map<String, NovelStats>.unmodifiable({
        for (final id in ids) id: ?(staleIds.contains(id) ? fresh[id] : kept.stats[id]),
      });
      kept
        ..stats = next
        ..versions = now;
      return next;
    }

    void update() {
      final next = count();
      if (!identical(next, state)) state = next;
    }

    // Heard only while some page shows the numbers: when none does (the library left for the page being written on),
    // the store is not listened to; when one does again, the books written in meanwhile are counted, and it listens.
    var listening = false;
    void listen() {
      if (listening) return;
      listening = true;
      store.addListener(update);
    }

    void stop() {
      if (!listening) return;
      listening = false;
      store.removeListener(update);
    }

    ref
      ..onCancel(stop)
      ..onResume(() {
        listen();
        // Not while the page that came back is being built: just after.
        scheduleMicrotask(() {
          if (listening) update();
        });
      })
      ..onDispose(stop);
    listen();
    return count();
  }
}

final novelStatsProvider = NotifierProvider<NovelStatsNotifier, Map<String, NovelStats>>(NovelStatsNotifier.new);

/// The numbers last counted, and the store's count of writes to each book's counted records when they were: kept while
/// the app runs, so going back to the library counts only the books written in since.
class _StatsKept {
  Map<String, NovelStats> stats = const {};
  Map<String, int> versions = const {};
}

/// Made anew with the store, so numbers are never kept across stores (whose counts start again).
final _statsKeptProvider = Provider<_StatsKept>((ref) {
  ref.watch(novelStoreProvider);
  return _StatsKept();
});

/// Where backup files are picked from and saved to. Tests provide a fake.
final backupFilesProvider = Provider<BackupFiles>((ref) => PlatformBackupFiles());

final saveControllerProvider = Provider<SaveController>((ref) {
  final controller = SaveController();
  ref.onDispose(controller.dispose);
  return controller;
});

/// The save status, for the indicator every screen shows.
class SaveStatusNotifier extends Notifier<SaveStatus> {
  @override
  SaveStatus build() {
    final controller = ref.watch(saveControllerProvider);
    void update() => state = controller.status;
    controller.addListener(update);
    ref.onDispose(() => controller.removeListener(update));
    return controller.status;
  }
}

final saveStatusProvider = NotifierProvider<SaveStatusNotifier, SaveStatus>(SaveStatusNotifier.new);

/// The novels in the library, refreshed after every change to the store.
class LibraryNotifier extends Notifier<List<Novel>> {
  @override
  List<Novel> build() {
    final store = ref.watch(novelStoreProvider);
    void update() => state = store.listNovels();
    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return store.listNovels();
  }
}

final libraryProvider = NotifierProvider<LibraryNotifier, List<Novel>>(LibraryNotifier.new);

/// Restore points, refreshed after every change to the store (restores and imports make them).
class RestorePointsNotifier extends Notifier<List<RestorePoint>> {
  @override
  List<RestorePoint> build() {
    final store = ref.watch(novelStoreProvider);
    final points = ref.watch(restorePointStoreProvider);
    void update() => state = points.list();
    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return points.list();
  }

  void refresh() => state = ref.read(restorePointStoreProvider).list();
}

final restorePointsProvider = NotifierProvider<RestorePointsNotifier, List<RestorePoint>>(RestorePointsNotifier.new);
