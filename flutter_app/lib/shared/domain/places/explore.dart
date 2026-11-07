import '../collation.dart';
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../records/entry.dart';
import '../records/event.dart';
import '../records/link.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import 'places.dart';

/// THE PLACE TREE (as in the original app)
/// Every location of the novel, inside what it is "Located in" (a connection still holding: one that has ended is
/// history, not where it is now), with its level, and how much of the story it holds: events there and in the places
/// inside it, the characters, factions and chapters tied to it. Read from the records; nothing is stored for the
/// tree, and nothing is changed.

class PlaceRow {
  PlaceRow({
    required this.entry,
    required this.depth,
    required this.parentId,
    required this.childIds,
    required this.level,
    required this.levelWords,
    required this.events,
    required this.characters,
    required this.factions,
    required this.chapters,
    required this.maps,
    required this.notes,
  });
  final Entry entry;
  final int depth;
  final String? parentId;
  final List<String> childIds;
  final PlaceLevel? level;

  /// The level in words: its name, nothing when none is set, or that the level was removed.
  final String levelWords;
  final int events;

  /// Events in the places inside it, however deep.
  int eventsWithin = 0;
  final int characters;
  final int factions;
  final int chapters;

  /// The maps it has a pin on, by id.
  final List<String> maps;

  /// What to look at, in words: also recorded inside another place, inside itself, a larger place inside a smaller.
  /// Never fixed.
  final List<String> notes;
}

bool isPlace(Entry? e) => e?.category == 'location';

num _createdAt(Link l) => numOrNull(l.raw['createdAt']) ?? 0;

/// Each place's parent: its "Located in" a place, still holding; the first recorded when there are several (the
/// others are said).
({Map<String, String> parent, Map<String, List<String>> others}) parentsOf(StoryModel model) {
  final parent = <String, String>{};
  final others = <String, List<String>>{};
  final links = stableSorted(
    model.links.where((l) => l.type == 'located-in' && l.isEntryLink && l.validity?.until == null),
    (a, b) {
      final c = _createdAt(a).compareTo(_createdAt(b));
      return c != 0 ? c : localeCompare(a.id, b.id);
    },
  );
  for (final link in links) {
    if (!isPlace(model.entries[link.fromId]) || !isPlace(model.entries[link.toId]) || link.fromId == link.toId) {
      continue;
    }
    if (!parent.containsKey(link.fromId)) {
      parent[link.fromId] = link.toId;
    } else if (parent[link.fromId] != link.toId) {
      (others[link.fromId] ??= []).add(link.toId);
    }
  }
  return (parent: parent, others: others);
}

/// The places inside one, however deep, in tree order.
List<String> placesWithin(List<PlaceRow> rows, String id) {
  final at = rows.indexWhere((r) => r.entry.id == id);
  if (at < 0) return const [];
  return [for (var i = at + 1; i < rows.length && rows[i].depth > rows[at].depth; i++) rows[i].entry.id];
}

List<PlaceRow> placeTree(StoryModel model, {PlaceSettings? settings, List<MapPin> pins = const []}) {
  final places = model.entries.values.where(isPlace).toList();
  final (:parent, :others) = parentsOf(model);
  final levels = settings?.levels ?? const <PlaceLevel>[];
  final levelAt = {for (final (i, l) in levels.indexed) l.id: i};
  String name(String id) => model.entries[id]?.name ?? 'a place that is gone';
  bool loopOf(String id) {
    final seen = <String>{};
    for (String? at = id; at != null; at = parent[at]) {
      if (!seen.add(at)) return true;
    }
    return false;
  }

  final children = <String, List<Entry>>{};
  final roots = <Entry>[];
  for (final place in places) {
    final up = parent[place.id];
    if (up == null || loopOf(place.id)) {
      roots.add(place);
    } else {
      (children[up] ??= []).add(place);
    }
  }
  final connections = deriveConnections(model).connections;
  final eventsAt = <String, List<TimelineEvent>>{};
  for (final e in model.events.values) {
    if (e.locationId case final id?) (eventsAt[id] ??= []).add(e);
  }
  final pinned = <String, List<String>>{};
  for (final pin in pins) {
    (pinned[pin.entryId] ??= []).add(pin.mapId);
  }

  final rows = <PlaceRow>[];
  final shown = <String>{};
  void walk(List<Entry> list, int depth, String? parentId) {
    for (final place in stableSorted(list, (a, b) => localeCompare(a.name, b.name))) {
      if (!shown.add(place.id)) continue;
      final links = placeLinks(model, place.id, connections);
      final levelId = place.placeLevel;
      final level = levelId == null ? null : levels.where((l) => l.id == levelId).firstOrNull;
      final notes = <String>[];
      if (others[place.id] case final more?) {
        notes.add(
          'Also recorded as inside ${more.map(name).join(', ')}; shown inside ${name(parent[place.id]!)}, recorded '
          'first.',
        );
      }
      if (parent[place.id] != null && loopOf(place.id)) {
        notes.add('It is inside itself through what it is located in, so it is shown at the top.');
      }
      final up = parentId == null ? null : model.entries[parentId];
      final upLevel = up?.placeLevel;
      if (level != null && upLevel != null && levelAt.containsKey(upLevel) && levelAt[level.id]! <= levelAt[upLevel]!) {
        notes.add(
          'A ${level.name} inside ${up!.name}, a ${levels[levelAt[upLevel]!].name}: it is not a smaller kind of place '
          'than what it is in.',
        );
      }
      rows.add(
        PlaceRow(
          entry: place,
          depth: depth,
          parentId: parentId,
          childIds: [for (final c in children[place.id] ?? const <Entry>[]) c.id],
          level: level,
          levelWords: level != null ? level.name : (levelId != null ? 'a level that was removed' : ''),
          events: eventsAt[place.id]?.length ?? 0,
          characters: links.characters.length,
          factions: links.factions.length,
          chapters: links.chapters.length,
          maps: pinned[place.id] ?? const [],
          notes: notes,
        ),
      );
      walk(children[place.id] ?? const [], depth + 1, place.id);
    }
  }

  walk(roots, 0, null);
  for (final row in rows) {
    row.eventsWithin = placesWithin(rows, row.entry.id).fold(0, (n, id) => n + (eventsAt[id]?.length ?? 0));
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------- what a place is tied to

typedef Tied = ({Entry entry, List<String> how});

class PlaceLinks {
  PlaceLinks(this.characters, this.factions, this.others, this.events, this.chapters);

  /// Each with how it is tied: "Located in", "takes part in “The siege”, here".
  final List<Tied> characters;
  final List<Tied> factions;
  final List<Tied> others;
  final List<TimelineEvent> events;
  final List<({StoryNode node, List<String> how})> chapters;
}

/// Everything one place is tied to: records connected to it (characters, factions, anything else) and how; the events
/// that take place there, and the characters who take part in them; the chapters and scenes that link it in their
/// text or plan, or tell an event that takes place there.
PlaceLinks placeLinks(StoryModel model, String placeId, [List<Connection>? connections]) {
  final all = connections ?? deriveConnections(model).connections;
  final entries = <String, List<String>>{};
  final nodes = <String, List<String>>{};
  void tie(Map<String, List<String>> map, String id, String how) {
    final list = map[id] ??= [];
    if (!list.contains(how)) list.add(how);
  }

  for (final seen in connectionsOf(all, EntityRef(EntityType.entry, placeId))) {
    final kind = connectionType(seen.connection.type).label;
    final words = seen.outgoing
        ? (seen.label.isNotEmpty ? seen.label : kind)
        : (seen.connection.label.isNotEmpty ? seen.connection.label : kind);
    final other = seen.other;
    if (other.type == EntityType.entry && other.id != placeId && model.entries.containsKey(other.id)) {
      // A place inside this one, or the one it is in, belongs to the tree, not here.
      if (seen.connection.kind == ConnectionKind.link &&
          connectionType(seen.connection.type).key == 'located-in' &&
          isPlace(model.entries[other.id])) {
        continue;
      }
      tie(entries, other.id, seen.outgoing ? words : '$words this');
    }
    if (other.type == EntityType.node && model.nodes.containsKey(other.id)) {
      tie(nodes, other.id, switch (seen.connection.kind) {
        ConnectionKind.mentioned => 'links it in the text',
        ConnectionKind.present => 'has it in the plan',
        _ => words,
      });
    }
  }
  final events = stableSorted(
    model.events.values.where((e) => e.locationId == placeId),
    (a, b) => localeCompare(a.name, b.name),
  );
  for (final event in events) {
    for (final c in event.characters) {
      if (model.entries.containsKey(c.id)) tie(entries, c.id, 'takes part in “${event.name}”, here');
    }
    for (final nodeId in event.nodeIds) {
      if (model.nodes.containsKey(nodeId)) tie(nodes, nodeId, 'tells “${event.name}”, here');
    }
  }
  List<Tied> group(String? category) => stableSorted([
    for (final MapEntry(key: id, value: how) in entries.entries)
      if (category == null
          ? model.entries[id]!.category != 'character' && model.entries[id]!.category != 'faction'
          : model.entries[id]!.category == category)
        (entry: model.entries[id]!, how: how),
  ], (a, b) => localeCompare(a.entry.name, b.entry.name));
  int position(String id) => model.order.position[id] ?? 1 << 53;
  return PlaceLinks(
    group('character'),
    group('faction'),
    group(null),
    events,
    stableSorted([
      for (final MapEntry(key: id, value: how) in nodes.entries) (node: model.nodes[id]!, how: how),
    ], (a, b) => position(a.node.id).compareTo(position(b.node.id))),
  );
}

// ---------------------------------------------------------------------------------------------------- on a map

class MapPlaces {
  MapPlaces(this.pinned, this.missing);

  /// Places with a pin on this map, and whether the pin lies outside its edges.
  final List<({Entry entry, MapPin pin, bool outside})> pinned;

  /// Places this map covers (inside the place it is a map of, or all of them) with no pin on it: in the tree, not on
  /// this map.
  final List<Entry> missing;
}

MapPlaces mapPlaces(List<PlaceRow> rows, WorldMap map, List<MapPin> pins) {
  final byId = {for (final r in rows) r.entry.id: r.entry};
  final covers = map.placeId != null ? placesWithin(rows, map.placeId!).toSet() : {for (final r in rows) r.entry.id};
  final mine = [
    for (final p in pins)
      if (p.mapId == map.id && byId.containsKey(p.entryId)) p,
  ];
  final pinned = [
    for (final pin in mine)
      (entry: byId[pin.entryId]!, pin: pin, outside: pin.x < 0 || pin.y < 0 || pin.x > map.width || pin.y > map.height),
  ];
  final has = {for (final p in mine) p.entryId};
  return MapPlaces(stableSorted(pinned, (a, b) => localeCompare(a.entry.name, b.entry.name)), [
    for (final r in rows)
      if (covers.contains(r.entry.id) && !has.contains(r.entry.id)) r.entry,
  ]);
}
