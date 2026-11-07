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

/// What each novel holds (words, chapters…), refreshed after every change to the store.
class NovelStatsNotifier extends Notifier<Map<String, NovelStats>> {
  @override
  Map<String, NovelStats> build() {
    final store = ref.watch(novelStoreProvider);
    void update() => state = store.stats();
    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return store.stats();
  }
}

final novelStatsProvider = NotifierProvider<NovelStatsNotifier, Map<String, NovelStats>>(NovelStatsNotifier.new);

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
