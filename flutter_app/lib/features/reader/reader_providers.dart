import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/autosave.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/data/settings_store.dart';
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/reader/book.dart';
import '../../shared/domain/reader/matter_changes.dart';
import '../../shared/domain/reader/reader_prefs.dart';
import '../workspace/open_novel.dart';

/// The collections the reader reads: the manuscript's parts, their text and the book's matter. Nothing else is loaded.
const readerCollections = {'chapters', 'chapterContents', 'bookMatter'};

/// What the open novel's book is made from, read from storage and refreshed after every change to the store, so the
/// preview always shows what is saved. READ-ONLY RENDERING RULE: the reader holds no way to write the manuscript.
class ReaderSourceNotifier extends Notifier<({String novelId, BookSource source})?> {
  @override
  ({String novelId, BookSource source})? build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return null;
    final store = ref.watch(novelStoreProvider);
    ({String novelId, BookSource source})? read() {
      final snapshot = store.loadPart(novelId, readerCollections);
      return snapshot == null ? null : (novelId: novelId, source: BookSource.fromSnapshot(snapshot));
    }

    void update() {
      if (store.exists(novelId)) state = read();
    }

    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return read();
  }
}

final readerSourceProvider = NotifierProvider.autoDispose<ReaderSourceNotifier, ({String novelId, BookSource source})?>(
  ReaderSourceNotifier.new,
);

const _prefsKey = 'reader.prefs';

/// The reader's look, which belongs to the person reading on this device and is part of no novel.
class ReaderPrefsNotifier extends Notifier<ReaderPrefs> {
  @override
  ReaderPrefs build() => ReaderPrefs.fromJson(ref.watch(settingsStoreProvider).read(_prefsKey));

  /// Changes the preferences as they are now, so quick changes in a row all count.
  void update(ReaderPrefs Function(ReaderPrefs current) change) {
    state = change(state);
    final settings = ref.read(settingsStoreProvider);
    final json = state.toJson();
    ref.read(saveControllerProvider).schedule('setting:$_prefsKey', () => settings.write(_prefsKey, json));
  }

  void reset() => update((_) => const ReaderPrefs());
}

final readerPrefsProvider = NotifierProvider<ReaderPrefsNotifier, ReaderPrefs>(ReaderPrefsNotifier.new);

String _bookmarkKey(String novelId) => 'reader.place.$novelId';

/// Where the reader had got to in a novel, on this device.
Bookmark? readBookmark(SettingsStore settings, String novelId) =>
    Bookmark.fromJson(settings.read(_bookmarkKey(novelId)));

/// Remembers the place, a moment after reading stops. Not essential: a failure only loses the place.
void writeBookmark(SettingsStore settings, SaveController save, String novelId, Bookmark bookmark) {
  save.schedule('setting:${_bookmarkKey(novelId)}', () => settings.write(_bookmarkKey(novelId), bookmark.toJson()));
}

/// Saving the book's matter: each field on its own, applied to the row as stored at the moment it is written, so quick
/// edits to several fields never undo each other. Saved through autosave, so a failure shows and is retried.
class MatterActions {
  MatterActions(this.ref);
  final Ref ref;

  void set(String novelId, String field, String value) {
    ref.read(saveControllerProvider).schedule('matter:$novelId:$field', () => _write(novelId, {field: value}));
  }

  void _write(String novelId, Map<String, String> changes) {
    final store = ref.read(novelStoreProvider);
    final rows = [...store.rowsIn(novelId, 'bookMatter')]..sort((a, b) => str(a['id']).compareTo(str(b['id'])));
    final stored = rows.firstOrNull;
    final next = matterWithChanges(
      stored,
      projectId: novelId,
      changes: changes,
      now: DateTime.now().millisecondsSinceEpoch,
      newId: newId,
    );
    store.writeRows(novelId, [RowWrite.put('bookMatter', next, expect: stored)]);
  }
}

final matterActionsProvider = Provider<MatterActions>(MatterActions.new);
