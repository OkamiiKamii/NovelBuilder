import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/providers.dart';
import '../../shared/domain/characters/cast.dart';
import '../../shared/domain/characters/character_changes.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/codex/codex_changes.dart';
import '../../shared/domain/collation.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/model/connections.dart';
import '../../shared/domain/model/story_model.dart';
import '../../shared/domain/records/category.dart';
import '../../shared/domain/records/entry.dart';
import '../../shared/domain/records/link.dart';
import '../../shared/domain/records/story_node.dart';
import '../../shared/domain/snapshot/novel_snapshot.dart';
import '../../shared/domain/stable_sort.dart';
import '../workspace/open_novel.dart';
import 'data/character_service.dart';

final characterServiceProvider = Provider<CharacterService>(
  (ref) => CharacterService(ref.watch(novelStoreProvider), ref.watch(backupServiceProvider)),
);

/// The open novel's characters and what their screens show about them, read from the stored records (without the
/// chapter text). Nothing here is a copy that could drift: it is read again after every change.
class CastData {
  CastData(this.novelId, this.snapshot) : model = StoryModel.fromSnapshot(snapshot) {
    _read = CharacterChanges(snapshot, now: 0, createId: () => throw StateError('Reading only.'));
    // As the original app reads them: in id order, which decides the order of characters with the same name.
    entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
    profiles = {
      for (final r in [...snapshot.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
        str(r['entryId']): CharacterProfile(r),
    };
    links = [
      for (final l in model.links)
        if (l.isEntryLink) l,
    ]..sort((a, b) => a.id.compareTo(b.id));
    list = listCharacters(entries, profiles, links, model.nodes.values, model.order.position, _read.fresh);
    templates = _read.templates();
    characterCategory = categoriesOf(snapshot)['character'] ?? Category.builtin('character');
  }

  final String novelId;
  final NovelSnapshot snapshot;

  String get novelTitle => str(snapshot.project['title']);

  /// Every connection the records make, read once per change (and those pointing at something gone).
  late final derived = deriveConnections(model);
  final StoryModel model;
  late final CharacterChanges _read;
  late final List<Entry> entries;

  /// Stored profiles by character. A character without one shows the empty general layout.
  late final Map<String, CharacterProfile> profiles;
  late final List<Link> links;
  late final List<Listed> list;
  late final List<CharacterTemplate> templates;

  /// The fields every character of the novel shares (a genre's "Sanity", a template's "Power Rank").
  late final Category characterCategory;

  Listed? listed(String entryId) => list.where((l) => l.entry.id == entryId).firstOrNull;
  String? nameOf(String id) => model.entries[id]?.name;
  List<CharacterSecret> secrets(String entryId) => _read.secrets(entryId);
  List<CharacterNote> notes(String entryId) => _read.notes(entryId);
  List<CharacterHistoryLine> history(String entryId) => _read.history(entryId);

  /// Other characters, by name, for choosing who knows, who is related…
  List<Entry> characters({String? except}) => stableSorted([
    for (final e in entries)
      if (e.category == 'character' && e.id != except) e,
  ], (a, b) => localeCompare(a.name, b.name));

  /// Chapters and scenes in reading order, for choosing where something happens.
  List<StoryNode> get documents => stableSorted(
    model.nodes.values.where((n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene),
    (a, b) => (model.order.position[a.id] ?? 0) - (model.order.position[b.id] ?? 0),
  );

  List<RelatedEntry> relatedOf(String entryId) => relatedTo(entryId, entries, links);
}

/// The cast of the open novel, refreshed after every change to the store. Kept only while a screen shows it, so
/// writing elsewhere does not keep re-reading it.
class CastNotifier extends Notifier<CastData?> {
  @override
  CastData? build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return null;
    final store = ref.watch(novelStoreProvider);
    final service = ref.watch(characterServiceProvider);
    CastData? read() {
      final snapshot = service.read(novelId);
      return snapshot == null ? null : CastData(novelId, snapshot);
    }

    void update() {
      if (store.exists(novelId)) state = read();
    }

    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return read();
  }
}

final castProvider = NotifierProvider.autoDispose<CastNotifier, CastData?>(CastNotifier.new);

/// Cards or a list, remembered on this device.
enum CastView { cards, list, ties }

const _viewKey = 'characters.view';

class CastViewNotifier extends Notifier<CastView> {
  @override
  CastView build() =>
      CastView.values.where((v) => v.name == ref.read(settingsStoreProvider).read(_viewKey)).firstOrNull ??
      CastView.cards;

  void set(CastView view) {
    state = view;
    final settings = ref.read(settingsStoreProvider);
    ref.read(saveControllerProvider).saveNow('setting:$_viewKey', () => settings.write(_viewKey, view.name));
  }
}

final castViewProvider = NotifierProvider<CastViewNotifier, CastView>(CastViewNotifier.new);
