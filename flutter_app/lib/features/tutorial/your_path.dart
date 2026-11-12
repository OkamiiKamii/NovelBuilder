import '../../shared/data/novel_store.dart';
import '../../shared/data/settings_store.dart';
import 'topics.dart';

/// YOUR PATH: which lessons the author has already put to use, read from what the library holds (in any of its
/// books), never asked and never stored. A lesson counts as tried when what it teaches has left something behind: a
/// character for Characters, an event for the Timeline, a ribbon for Ribbons. Lessons that leave nothing to see
/// (searching, reading as a book) are not counted either way.
///
/// The checks, by lesson: what in a book (or the app's settings) shows it was used.
final Map<String, bool Function(_Look look)> _tried = {
  'library': (l) => l.novels.isNotEmpty,
  'write': (l) => l.any('chapterContents'),
  'outline': (l) => l.most('chapters') >= 2,
  'characters': (l) => l.anyWhere('loreEntries', (r) => r['category'] == 'character'),
  'world': (l) => l.anyWhere('loreEntries', (r) => r['category'] != 'character'),
  'timeline': (l) => l.any('timelineEvents'),
  'threads': (l) => l.any('plotThreads'),
  'relationships': (l) => l.any('characterRelations'),
  'ribbons': (l) => l.novels.any((id) => (l.settings.read('ribbons.$id') as List?)?.isNotEmpty ?? false),
  'progress': (l) => l.any('goals'),
  'history': (l) => l.any('chapterRevisions'),
  'drafts': (l) => l.any('chapterBranches'),
  'canon': (l) => l.any('canonFacts'),
  'continuity': (l) => l.any('continuityRules'),
  'places': (l) => l.any('journeys') || l.any('mapPins'),
  'systems': (l) => l.any('systems'),
  'progression': (l) => l.any('progressSnapshots'),
  'modules': (l) => l.any('moduleRecords'),
  'histories': (l) => l.any('alternateHistories'),
  'graph': (l) => l.any('savedViews'),
  'book': (l) => l.any('bookMatter'),
  'team': (l) => l.any('members'),
  'settings': (l) => l.settings.read('appearance.theme') != null,
};

/// The order the path suggests lessons in: the book first, then its people and world, then its plot, then the rest.
const yourPathOrder = [
  'library',
  'write',
  'outline',
  'characters',
  'world',
  'timeline',
  'threads',
  'relationships',
  'ribbons',
  'progress',
  'history',
  'drafts',
  'canon',
  'continuity',
  'places',
  'systems',
  'progression',
  'modules',
  'histories',
  'graph',
  'book',
  'team',
  'settings',
];

class _Look {
  _Look(this.store, this.settings, this.novels);
  final NovelStore store;
  final SettingsStore settings;
  final List<String> novels;

  /// How many records every collection of every book holds: one grouped query from the index, asked once, instead of
  /// a count per lesson per book (some four hundred for eighteen books).
  late final Map<String, Map<String, int>> _counts = store.countsByCollection(novels);
  int _count(String id, String collection) => _counts[id]?[collection] ?? 0;

  bool any(String collection) => novels.any((id) => _count(id, collection) > 0);

  /// Whether any book holds a record of [collection] that passes [test]: read one book at a time, only books that
  /// hold any, and no further than the first that does.
  bool anyWhere(String collection, bool Function(Map<String, Object?> row) test) =>
      novels.any((id) => _count(id, collection) > 0 && store.rowsIn(id, collection).any(test));

  /// The most rows of [collection] any one book has.
  int most(String collection) => novels.fold(0, (m, id) {
    final n = _count(id, collection);
    return n > m ? n : m;
  });
}

/// Where the author is on the path: the lessons tried, those the path can tell about, and the next to try.
typedef YourPath = ({Set<String> tried, List<String> counted, Topic? next});

/// Works out [YourPath] from the library's books ([novelIds]) and the app's settings. Reads only. A book that cannot
/// be read counts as holding nothing.
YourPath yourPath({required NovelStore store, required SettingsStore settings, required List<String> novelIds}) {
  final look = _Look(store, settings, novelIds);
  final tried = <String>{};
  for (final MapEntry(:key, :value) in _tried.entries) {
    try {
      if (value(look)) tried.add(key);
    } on Object {
      // Nothing readable there: not tried.
    }
  }
  final byId = {for (final t in tutorialTopics) t.id: t};
  final next = yourPathOrder.where((id) => !tried.contains(id)).map((id) => byId[id]).nonNulls.firstOrNull;
  return (
    tried: tried,
    counted: [
      for (final id in yourPathOrder)
        if (byId.containsKey(id)) id,
    ],
    next: next,
  );
}
