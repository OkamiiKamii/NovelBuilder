import 'dart:async';

import 'package:flutter/foundation.dart' show FlutterError, FlutterErrorDetails;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/background.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/characters/cast.dart';
import '../../shared/domain/characters/character_changes.dart';
import '../../shared/domain/characters/character_records.dart';
import '../../shared/domain/characters/named_in.dart';
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
  CastData(this.novelId, this.snapshot, {this.named = const {}}) : model = StoryModel.fromSnapshot(snapshot) {
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
    list = listCharacters(
      entries,
      profiles,
      links,
      model.nodes.values,
      model.order.position,
      _read.fresh,
      named: named,
    );
    templates = _read.templates();
    characterCategory = categoriesOf(snapshot)['character'] ?? Category.builtin('character');
  }

  final String novelId;
  final NovelSnapshot snapshot;

  /// Where each entry's name is on the page, by entry: chapters and scenes (`named_in.dart`, [namedInProvider]).
  final Map<String, List<String>> named;

  /// For each entry, the chapters (by number) it is in: linked in their text, or named there.
  Map<String, Set<int>> chaptersOf() {
    final out = <String, Set<int>>{};
    for (final node in model.nodes.values) {
      final n = model.order.chapterNumber[node.id];
      if (n == null) continue;
      for (final id in node.mentions) {
        (out[id] ??= {}).add(n);
      }
    }
    for (final MapEntry(key: id, value: nodes) in named.entries) {
      for (final node in nodes) {
        if (model.order.chapterNumber[node] case final n?) (out[id] ??= {}).add(n);
      }
    }
    return out;
  }

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
    // Where names are on the page arrives from the background a moment later; the cast is read again with it then (as
    // it arrives, never in the middle of building a page).
    var named = const <String, List<String>>{};
    CastData? read() {
      final snapshot = service.read(novelId);
      return snapshot == null ? null : CastData(novelId, snapshot, named: named);
    }

    void update() {
      if (store.exists(novelId)) state = read();
    }

    ref.listen(namedInProvider, (_, next) {
      named = next;
      update();
    });
    named = ref.read(namedInProvider);
    store.addListener(update);
    ref.onDispose(() => store.removeListener(update));
    return read();
  }
}

final castProvider = NotifierProvider.autoDispose<CastNotifier, CastData?>(CastNotifier.new);

/// Where each entry of the open novel is named in its text (`named_in.dart`), by entry: chapters and scenes. Read away
/// from the screen when a screen first needs it, and again shortly after the text, the entries or the profiles
/// change (and only then: a store change elsewhere leaves it be). Empty until the first reading is done.
class NamedInNotifier extends Notifier<Map<String, List<String>>> {
  @override
  Map<String, List<String>> build() {
    final novelId = ref.watch(openNovelProvider);
    if (novelId == null) return const {};
    final store = ref.watch(novelStoreProvider);
    final run = ref.watch(runAsideProvider);
    var alive = true;
    String? readAt;
    // One reading at a time; changes while one runs are read once it is done. Changes in the same moment are one.
    var running = false;
    var again = false;
    var queued = false;

    String stamp() => [
      for (final c in const ['chapterContents', 'loreEntries', 'characterProfiles'])
        if (store.stampOf(novelId, c) case (:final count, :final latest)) '$count:$latest',
    ].join('|');

    void read() {
      if (!alive || !store.exists(novelId)) return;
      if (running) {
        again = true;
        return;
      }
      final now = stamp();
      if (now == readAt) return;
      readAt = now;
      running = true;
      final entries = [for (final r in store.rowsIn(novelId, 'loreEntries')) Entry(r)];
      final profiles = <String, CharacterProfile>{
        for (final r in [
          ...store.rowsIn(novelId, 'characterProfiles'),
        ]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
          str(r['entryId']): CharacterProfile(r),
      };
      run(namedInJob(store.rawJsonIn(novelId, 'chapterContents'), namesToFind(entries, profiles)))
          .then(
            (found) {
              if (alive && readAt == now) state = found;
            },
            onError: (Object e, StackTrace s) =>
                FlutterError.reportError(FlutterErrorDetails(exception: e, stack: s, library: 'characters')),
          )
          .whenComplete(() {
            running = false;
            if (again) {
              again = false;
              read();
            }
          });
    }

    // Saves come from the editor already gathered (a pause in typing), and a change to anything but the text, the
    // entries or the profiles is a quick look at their stamps and no more.
    void changed() {
      if (queued) return;
      queued = true;
      scheduleMicrotask(() {
        queued = false;
        read();
      });
    }

    store.addListener(changed);
    ref.onDispose(() {
      alive = false;
      store.removeListener(changed);
    });
    // The first reading too waits until whatever is being built now is done.
    changed();
    return const {};
  }
}

final namedInProvider = NotifierProvider.autoDispose<NamedInNotifier, Map<String, List<String>>>(NamedInNotifier.new);

/// Cards, a list, the ties or the orbit, remembered on this device.
enum CastView { cards, list, ties, orbit }

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
