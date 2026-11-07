import '../collation.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../stable_sort.dart';
import 'event_record.dart';

/// TRACKS. A timeline can be split into tracks: one per character, place, faction, plot thread, or record of any kind
/// the author has made. An event is on every track it is connected to (its participants, its place, its threads,
/// anything linked to it), and it is still one event wherever it is drawn. Events connected to nothing of the kind go
/// on a track of their own, so none of them goes missing.
///
/// How the tracks are arranged (order, hidden, folded, focus) is only a way of looking: it never changes when an
/// event happens.
sealed class Grouping {
  const Grouping();

  /// As the original keeps it in an address: `none`, `thread`, or `category:<key>`.
  String get encoded;

  static Grouping decode(String? text) {
    if (text == 'thread') return const ByThread();
    if (text != null && text.startsWith('category:') && text.length > 9) return ByCategory(text.substring(9));
    return const OneLine();
  }
}

final class OneLine extends Grouping {
  const OneLine();
  @override
  String get encoded => 'none';
}

final class ByThread extends Grouping {
  const ByThread();
  @override
  String get encoded => 'thread';
}

final class ByCategory extends Grouping {
  const ByCategory(this.key);
  final String key;
  @override
  String get encoded => 'category:$key';
}

class Track {
  const Track(this.id, this.label, this.eventIds, {this.folded = false});
  final String id;
  final String label;
  final List<String> eventIds;
  final bool folded;

  Track fold(bool folded) => Track(id, label, eventIds, folded: folded);
}

/// The track for events connected to nothing of the kind tracks are made of.
const unlinkedTrack = '__unlinked';
const _allTrack = '__all';

/// The ways this novel's timeline can be split: by threads, and by every kind of codex record it has, the usual ones
/// first.
List<({String value, String label})> groupings(StoryModel model) {
  final used = {for (final e in model.entries.values) e.category};
  const first = ['character', 'location', 'faction'];
  int rank(String k) => first.contains(k) ? first.indexOf(k) + 1 : 99;
  final keys = stableSorted(used, (a, b) {
    final byRank = rank(a) - rank(b);
    return byRank != 0 ? byRank : localeCompare(model.categoryOf(a).name, model.categoryOf(b).name);
  });
  return [
    (value: 'none', label: 'One line'),
    for (final key in keys) (value: 'category:$key', label: key == 'location' ? 'Places' : model.categoryOf(key).name),
    (value: 'thread', label: 'Plot threads'),
  ];
}

/// The tracks for these events. Each event is on every track it belongs to; tracks with no events are left out.
List<Track> tracksFor(StoryModel model, List<EventRecord> events, Grouping grouping) {
  if (grouping is OneLine) {
    return events.isEmpty
        ? []
        : [
            Track(_allTrack, 'All events', [for (final e in events) e.id]),
          ];
  }
  final connections = grouping is ByCategory ? deriveConnections(model).connections : const <Connection>[];
  final members = <String, List<String>>{};
  final unlinked = <String>[];
  for (final event in events) {
    final ids = switch (grouping) {
      ByThread() => [
        for (final id in model.events[event.id]?.threadIds ?? const <String>[])
          if (model.threads.containsKey(id)) id,
      ],
      ByCategory(:final key) => {
        for (final c in connectionsOf(connections, EntityRef(EntityType.event, event.id)))
          if (c.other.type == EntityType.entry && model.entries[c.other.id]?.category == key) c.other.id,
      }.toList(),
      OneLine() => const <String>[],
    };
    if (ids.isEmpty) unlinked.add(event.id);
    for (final id in ids) {
      (members[id] ??= []).add(event.id);
    }
  }
  String nameOf(String id) => grouping is ByThread ? model.threads[id]!.title : model.entries[id]!.name;
  final tracks = stableSorted([for (final e in members.entries) Track(e.key, nameOf(e.key), e.value)], (a, b) {
    final byLabel = localeCompare(a.label, b.label);
    return byLabel != 0 ? byLabel : localeCompare(a.id, b.id);
  });
  if (unlinked.isNotEmpty) {
    final kind = switch (grouping) {
      ByCategory(:final key) =>
        'linked to any ${key == 'location' ? 'place' : model.categoryOf(key).singular.toLowerCase()}',
      _ => 'part of any plot thread',
    };
    tracks.add(Track(unlinkedTrack, 'Not $kind', unlinked));
  }
  return tracks;
}

/// How the author has arranged the tracks.
class TrackPrefs {
  const TrackPrefs({this.order = const [], this.hidden = const [], this.folded = const [], this.focus});

  /// Track ids in the order the author put them; tracks not named keep their usual place after these.
  final List<String> order;
  final List<String> hidden;
  final List<String> folded;

  /// Show this track alone.
  final String? focus;

  TrackPrefs copyWith({List<String>? order, List<String>? hidden, List<String>? folded, String? Function()? focus}) =>
      TrackPrefs(
        order: order ?? this.order,
        hidden: hidden ?? this.hidden,
        folded: folded ?? this.folded,
        focus: focus == null ? this.focus : focus(),
      );
}

/// The tracks as the author has arranged them: in their order, without the hidden ones (or only the focused one),
/// each marked folded or not. Ids of tracks that are not there (a character since deleted) are ignored.
({List<Track> shown, List<Track> hidden, Track? focused}) arrange(List<Track> tracks, TrackPrefs prefs) {
  final byId = {for (final t in tracks) t.id: t};
  final first = [
    for (final id in {...prefs.order})
      if (byId.containsKey(id)) byId[id]!,
  ];
  final ordered = [
    ...first,
    for (final t in tracks)
      if (!first.contains(t)) t,
  ];
  final focused = prefs.focus == null ? null : byId[prefs.focus];
  if (focused != null) {
    return (
      shown: [focused.fold(false)],
      hidden: [
        for (final t in ordered)
          if (t != focused) t,
      ],
      focused: focused,
    );
  }
  return (
    shown: [
      for (final t in ordered)
        if (!prefs.hidden.contains(t.id)) t.fold(prefs.folded.contains(t.id)),
    ],
    hidden: [
      for (final t in ordered)
        if (prefs.hidden.contains(t.id)) t,
    ],
    focused: null,
  );
}

/// The full order after moving one track up (-1) or down (+1) among those in [current], the order as shown now.
List<String> moveTrack(List<String> current, String id, int by) {
  final at = current.indexOf(id);
  final to = at + by;
  if (at < 0 || to < 0 || to >= current.length) return current;
  final next = [...current];
  next[at] = current[to];
  next[to] = current[at];
  return next;
}

/// Turns one id on or off in a list (hidden, folded).
List<String> toggleId(List<String> list, String id) => list.contains(id)
    ? [
        for (final x in list)
          if (x != id) x,
      ]
    : [...list, id];
