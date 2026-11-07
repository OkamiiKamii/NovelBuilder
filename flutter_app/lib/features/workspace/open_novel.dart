import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';

const openNovelSettingKey = 'library.openNovel';

/// The id of the novel open in the workspace, or null when none is. Remembered on this device, so the app reopens
/// the novel the author was working in. A novel that is deleted is closed.
class OpenNovelNotifier extends Notifier<String?> {
  @override
  String? build() {
    final store = ref.watch(novelStoreProvider);
    void closeIfGone() {
      if (state != null && !store.exists(state!)) close();
    }

    store.addListener(closeIfGone);
    ref.onDispose(() => store.removeListener(closeIfGone));
    final remembered = ref.read(settingsStoreProvider).read(openNovelSettingKey);
    return remembered is String && store.exists(remembered) ? remembered : null;
  }

  void open(String novelId) {
    state = novelId;
    ref.read(libraryServiceProvider).markOpened(novelId);
    _remember(novelId);
  }

  void close() {
    state = null;
    _remember(null);
  }

  void _remember(String? id) {
    final settings = ref.read(settingsStoreProvider);
    ref
        .read(saveControllerProvider)
        .saveNow('setting:$openNovelSettingKey', () => settings.write(openNovelSettingKey, id));
  }
}

final openNovelProvider = NotifierProvider<OpenNovelNotifier, String?>(OpenNovelNotifier.new);
