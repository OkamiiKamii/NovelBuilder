import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../features/characters/widgets/vault.dart';
import '../../features/workspace/open_novel.dart';
import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/records/story_node.dart';
import '../destinations.dart';

/// THE TRAIL: the pages of a book are many and some lie deep (a character, a place, a thread, a chapter's plan, a tie
/// between two people), and going back to one just left meant finding the way again. Now the book remembers where the
/// author has been, and More opens with it: "Where you were", the last places by name ("Wren Hollis, character",
/// "The tide bell, thread", "Plot lanes"), newest first, each a press from going back. The page open now is left out,
/// and so are the bar's own (the Library, Write and Organize as they open).
///
/// A place is remembered by where it is, not what it is called: its name is read as More opens, so a character
/// renamed is shown by the new name, and one deleted drops off the trail. Kept on this device, a trail a book, the
/// last [trailKept]; nothing is stored in the novel.

/// How many places a book's trail keeps.
const trailKept = 12;

/// How many More shows.
const trailShown = 6;

/// One step of the trail: where (a location, with its query) and when.
typedef TrailStep = ({String location, int at});

/// A place as More shows it: its name, what kind of place it is, and its sign.
typedef TrailPlace = ({String name, String kind, IconData icon});

String trailSettingKey(String novelId) => 'shell.trail.$novelId';

/// The trail after going to [location] at [at]: it first, the same place earlier taken out, the oldest let go.
List<TrailStep> walkedTo(List<TrailStep> trail, String location, int at) => [
  (location: location, at: at),
  for (final s in trail)
    if (_path(s.location) != _path(location)) s,
].take(trailKept).toList();

String _path(String location) => Uri.parse(location).path;

/// The trail as stored.
List<TrailStep> trailFrom(Object? stored) => [
  if (stored is List)
    for (final s in stored)
      if (s is Map && s['location'] is String && s['at'] is int)
        (location: s['location'] as String, at: s['at'] as int),
];

/// Pages of an area under one name, and the area they are in (shared with search, which goes to them).
const namedPages = {
  '/plan/threads': ('Threads', 'Plan'),
  '/plan/board': ('The board', 'Plan'),
  '/plan/calendar': ('Calendar', 'Plan'),
  '/plan/histories': ('Histories', 'Plan'),
  '/organize/world': ('World', 'Organize'),
  '/organize/world/kinds': ('Kinds of things', 'World'),
  '/organize/systems': ('Systems', 'Organize'),
  '/organize/modules': ('Modules', 'Organize'),
  '/organize/relationships/settings': ('Kinds of ties', 'Organize'),
  '/visualize/timeline': ('Timeline', 'Visualize'),
  '/visualize/order': ('Story order', 'Visualize'),
  '/visualize/plot': ('Plot lanes', 'Visualize'),
  '/visualize/structure': ('Structure', 'Visualize'),
  '/visualize/appearances': ('Appearances', 'Visualize'),
  '/visualize/graph': ('Graph', 'Visualize'),
  '/visualize/kinds': ('Kinds', 'Visualize'),
  '/visualize/abilities': ('Abilities', 'Visualize'),
  '/visualize/progression': ('Progression', 'Visualize'),
  '/visualize/places': ('Places', 'Visualize'),
  '/visualize/knowledge': ('Who knows what', 'Visualize'),
  '/visualize/journeys': ('Journeys', 'Visualize'),
  '/visualize/factions': ('Factions', 'Visualize'),
  '/visualize/ownership': ('Who owns what', 'Visualize'),
  '/visualize/charts': ('Charts', 'Visualize'),
  '/visualize/history': ('Life history', 'Visualize'),
  '/review/records': ('Records check', 'Review'),
  '/review/team': ('Team', 'Review'),
  '/review/consequences': ('Consequences', 'Review'),
  '/review/timeline': ('Timeline check', 'Review'),
  '/review/canon': ('Canon', 'Review'),
  '/review/continuity': ('Continuity', 'Review'),
  '/progress/analytics': ('Analytics', 'Progress'),
  '/write/read': ('Reader', 'Your book as a reader sees it'),
  '/write/book': ('Book details', 'The front and back of the book'),
};

/// Kinds of entries in a word.
const _kinds = {'location': 'Place', 'place': 'Place', 'faction': 'Faction', 'item': 'Item', 'creature': 'Creature'};

/// The place at [location] in [novelId], or none when it is not one to keep (the bar's own pages, the shelf) or no
/// longer exists.
TrailPlace? placeAt(String location, NovelStore store, String novelId) {
  final parts = Uri.parse(location).pathSegments;
  final path = '/${parts.join('/')}';
  if (namedPages[path] case (final name, final kind)) {
    final area = Destination.forLocation(path);
    return (name: name, kind: kind, icon: area?.icon ?? Icons.bookmark_outline);
  }
  JsonMap? row(String collection, String id) => store.row(novelId, collection, id);
  String nameOf(JsonMap r) => str(r['name']).trim().isNotEmpty ? str(r['name']).trim() : str(r['title']).trim();
  if (parts.length < 3) return null;
  final id = parts.last;
  switch ((parts[0], parts[1])) {
    case ('organize', 'character'):
      final r = row('loreEntries', id);
      return r == null ? null : (name: _or(nameOf(r), 'A character'), kind: 'Character', icon: Icons.person_outline);
    case ('organize', 'world') when parts.length == 4 && parts[2] == 'entry':
      final r = row('loreEntries', id);
      if (r == null) return null;
      final category = str(r['category']);
      return (
        name: _or(nameOf(r), 'An entry'),
        kind: _kinds[category] ?? (category.isEmpty ? 'Entry' : '${category[0].toUpperCase()}${category.substring(1)}'),
        icon: Icons.public,
      );
    case ('organize', 'relationship'):
      final r = row('characterRelations', id);
      if (r == null) return null;
      String who(Object? entryId) {
        final e = entryId is String ? row('loreEntries', entryId) : null;
        return e == null ? 'someone' : _or(nameOf(e), 'someone');
      }

      return (name: '${who(r['fromId'])} & ${who(r['toId'])}', kind: 'A tie', icon: Icons.link);
    case ('organize', 'modules'):
      return (name: _or(id, 'A module'), kind: 'Module', icon: Icons.extension_outlined);
    case ('plan', 'thread'):
      final r = row('plotThreads', id);
      return r == null ? null : (name: _or(nameOf(r), 'A thread'), kind: 'Thread', icon: Icons.timeline);
    case ('plan', 'event'):
      final r = row('timelineEvents', id);
      return r == null ? null : (name: _or(nameOf(r), 'An event'), kind: 'Event', icon: Icons.event_outlined);
    case ('plan', 'chapter'):
      final r = row('chapters', id);
      return r == null
          ? null
          : (name: StoryNode(r).displayTitle, kind: 'Chapter plan', icon: Icons.view_agenda_outlined);
  }
  return null;
}

String _or(String s, String otherwise) => s.isEmpty ? otherwise : s;

/// The trail of the open book, kept as the author goes.
class TrailNotifier extends Notifier<List<TrailStep>> {
  @override
  List<TrailStep> build() {
    final id = ref.watch(openNovelProvider);
    return id == null ? const [] : trailFrom(ref.read(settingsStoreProvider).read(trailSettingKey(id)));
  }

  /// The author has come to [location]: remembered, when it is a place to keep in the open book.
  void went(String location, {DateTime? at}) {
    final id = ref.read(openNovelProvider);
    if (id == null || placeAt(location, ref.read(novelStoreProvider), id) == null) return;
    if (state.isNotEmpty && state.first.location == location) return;
    state = walkedTo(state, location, (at ?? DateTime.now()).millisecondsSinceEpoch);
    final settings = ref.read(settingsStoreProvider);
    final stored = [
      for (final s in state) {'location': s.location, 'at': s.at},
    ];
    ref
        .read(saveControllerProvider)
        .saveNow('setting:${trailSettingKey(id)}', () => settings.write(trailSettingKey(id), stored));
  }
}

final trailProvider = NotifierProvider<TrailNotifier, List<TrailStep>>(TrailNotifier.new);

/// WHERE YOU WERE, at the head of More: the last places, a press from each.
class TrailRow extends ConsumerWidget {
  const TrailRow({super.key, required this.current, required this.onGo});

  /// The page open now, left out.
  final String? current;
  final ValueChanged<String> onGo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = ref.watch(openNovelProvider);
    if (id == null) return const SizedBox.shrink();
    final store = ref.watch(novelStoreProvider);
    final here = current == null ? null : Uri.parse(current!).path;
    final places = [
      for (final s in ref.watch(trailProvider))
        if (Uri.parse(s.location).path != here)
          if (placeAt(s.location, store, id) case final p?) (step: s, place: p),
    ].take(trailShown).toList();
    if (places.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 6),
          child: Semantics(
            header: true,
            child: Text(
              'WHERE YOU WERE',
              style: vaultHeading(context, size: 11, color: scheme.primary, weight: 700).copyWith(letterSpacing: 2),
            ),
          ),
        ),
        SizedBox(
          height: 104,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: places.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, i) =>
                _Step(place: places[i].place, at: places[i].step.at, onGo: () => onGo(places[i].step.location)),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.place, required this.at, required this.onGo});
  final TrailPlace place;
  final int at;
  final VoidCallback onGo;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final when = formatRelative(context, at);
    return Semantics(
      button: true,
      label: 'Back to ${place.name}, ${place.kind.toLowerCase()}, $when',
      excludeSemantics: true,
      child: SizedBox(
        width: 156,
        child: Material(
          color: scheme.surfaceContainerHigh,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: scheme.outlineVariant),
          ),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onGo,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          color: scheme.primary.withValues(alpha: 0.14),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(place.icon, size: 15, color: scheme.primary),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          place.kind,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Expanded(
                    child: Text(
                      place.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: vaultText(context, size: 16, color: scheme.onSurface).copyWith(height: 1.15),
                    ),
                  ),
                  Text(when, style: TextStyle(fontSize: 11.5, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
