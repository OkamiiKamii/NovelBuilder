import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import '../../shared/domain/records/story_node.dart';
import '../workspace/open_novel.dart';
import 'data/manuscript_service.dart';

final manuscriptServiceProvider = Provider<ManuscriptService>(
  (ref) =>
      ManuscriptService(ref.watch(novelStoreProvider), ref.watch(draftStoreProvider), ref.watch(backupServiceProvider)),
);

/// The open novel's chapters, scenes and groups, refreshed after every change to the store.
class OutlineNotifier extends Notifier<List<StoryNode>> {
  @override
  List<StoryNode> build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const [];
    final store = ref.watch(novelStoreProvider);
    final service = ref.watch(manuscriptServiceProvider);
    void update() {
      if (store.exists(novelId)) state = service.nodes(novelId);
    }

    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return service.nodes(novelId);
  }
}

final outlineProvider = NotifierProvider<OutlineNotifier, List<StoryNode>>(OutlineNotifier.new);

String _lastNodeKey(String novelId) => 'write.lastNode.$novelId';

/// The chapter or scene open in the editor. Remembered per novel on this device, so writing resumes where it stopped.
class SelectedNodeNotifier extends Notifier<String?> {
  @override
  String? build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return null;
    final remembered = ref.read(settingsStoreProvider).read(_lastNodeKey(novelId));
    final nodes = ref.read(outlineProvider);
    return remembered is String && nodes.any((n) => n.id == remembered) ? remembered : null;
  }

  void select(String? nodeId) {
    state = nodeId;
    final novelId = ref.read(openNovelProvider);
    // Going back to the contents (nothing selected) keeps the page last written on: the Library's "Pick up where you
    // left off" still opens it, with its last lines.
    if (novelId == null || nodeId == null) return;
    final settings = ref.read(settingsStoreProvider);
    ref
        .read(saveControllerProvider)
        .saveNow('setting:${_lastNodeKey(novelId)}', () => settings.write(_lastNodeKey(novelId), nodeId));
  }
}

final selectedNodeProvider = NotifierProvider<SelectedNodeNotifier, String?>(SelectedNodeNotifier.new);

/// A request to open a chapter with find already on some words, at a paragraph (from search across the novel). The
/// chapter's editor takes it when it opens.
typedef FindRequest = ({String nodeId, String term, int block});

class PendingFindNotifier extends Notifier<FindRequest?> {
  @override
  FindRequest? build() => null;

  void request(FindRequest? find) => state = find;
}

final pendingFindProvider = NotifierProvider<PendingFindNotifier, FindRequest?>(PendingFindNotifier.new);

/// A chapter or scene to open with the caret after its last word (from the library's "Continue writing"), so the
/// author carries on where they stopped. The chapter's editor takes it when it opens.
class PendingCaretNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void request(String? nodeId) => state = nodeId;
}

final pendingCaretEndProvider = NotifierProvider<PendingCaretNotifier, String?>(PendingCaretNotifier.new);

/// Lines to be written at the end of a chapter as it opens (a system's message, from Systems), each a paragraph of
/// its own, the caret after them. The chapter's editor takes them when it opens.
typedef PendingInsert = ({String nodeId, List<String> lines});

class PendingInsertNotifier extends Notifier<PendingInsert?> {
  @override
  PendingInsert? build() => null;

  void request(PendingInsert? insert) => state = insert;
}

final pendingInsertProvider = NotifierProvider<PendingInsertNotifier, PendingInsert?>(PendingInsertNotifier.new);
