import '../collation.dart';
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/navigate.dart' show threadStatusName;
import '../model/story_model.dart';
import '../model/story_order.dart';
import '../progression/track.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import '../timeline/event_record.dart';

/// What each view lists, read from the shared model: the views' written form, everything a drawing shows, in words,
/// in an order that makes sense without the drawing.

String _chapterLabel(StoryModel model, String nodeId) {
  final node = model.nodes[nodeId];
  if (node == null) return 'a deleted chapter';
  final n = model.order.chapterNumber[nodeId];
  final title = node.title.isEmpty ? 'Untitled' : node.title;
  // A scene says which chapter it is in, as every other view names it.
  if (node.kind == NodeKind.scene && n != null && n != 0) return 'Ch $n, scene: $title';
  return node.kind == NodeKind.chapter && n != null && n != 0 ? 'Ch $n: $title' : title;
}

/// Events in story order: dated ones by date, then the ones with no date yet, each with where the reader meets it.
List<({String id, String title, String when, bool dated, double start, List<String> told})> timelineRows(
  StoryModel model,
) {
  final rows = [
    for (final e in eventRecords(model))
      (
        id: e.id,
        title: e.title,
        when: e.label,
        dated: e.span != null,
        start: e.span?.lo ?? double.infinity,
        told: [
          for (final t in e.told)
            t.role.name == 'told'
                ? _chapterLabel(model, t.nodeId)
                : '${_chapterLabel(model, t.nodeId)} (${t.role.name})',
        ],
      ),
  ];
  return [
    for (final r in stableSorted(rows, (a, b) {
      if (a.start != b.start) return a.start.compareTo(b.start);
      return localeCompare(a.title, b.title);
    }))
      (id: r.id, title: r.title, when: r.when, dated: r.dated, start: r.start, told: r.told),
  ];
}

/// Relationships as they stand at the end of the story so far, and how many stages each has been through.
List<({String id, String between, String now, int stages})> relationshipRows(StoryModel model) {
  String name(String id) => model.entries[id]?.name ?? 'Someone deleted';
  return stableSorted([
    for (final r in model.relations.values)
      () {
        final now = stageAt(r, null, model.order);
        return (
          id: r.id,
          between: '${name(r.fromId)} ${now?.directional == true ? '→' : '&'} ${name(r.toId)}',
          now: now == null
              ? 'Not yet begun'
              : (now.title.isNotEmpty ? now.title : (now.label.isNotEmpty ? now.label : 'Related')),
          stages: r.stages.length,
        );
      }(),
  ], (a, b) => localeCompare(a.between, b.between));
}

/// Plot threads with where their developments are placed.
List<({String id, String title, String? status, int developments, int unplaced, List<String> chapters})> plotRows(
  StoryModel model,
) => stableSorted([
  for (final t in model.threads.values)
    () {
      final placed = stableSorted([
        for (final b in t.beats)
          if (b.nodeId != null && model.nodes.containsKey(b.nodeId)) b,
      ], (a, b) => (model.order.position[a.nodeId] ?? 0) - (model.order.position[b.nodeId] ?? 0));
      return (
        id: t.id,
        title: t.title,
        status: threadStatusName(t),
        developments: t.beats.length,
        unplaced: t.beats.length - placed.length,
        chapters: {for (final b in placed) _chapterLabel(model, b.nodeId!)}.toList(),
      );
    }(),
], (a, b) => localeCompare(a.title, b.title));

/// How connected the novel is: the counts, the most connected records, and any connection whose end is gone.
({int records, int connections, int dangling, List<({EntityRef ref, String label, int count})> mostConnected})
graphSummary(StoryModel model, [int top = 5]) {
  final (:connections, :dangling) = deriveConnections(model);
  final degree = <String, ({EntityRef ref, String label, int count})>{};
  for (final c in connections) {
    for (final end in [c.from, c.to]) {
      final was = degree[end.key];
      degree[end.key] = (
        ref: end,
        label: was?.label ?? model.resolve(end)?.label ?? end.id,
        count: (was?.count ?? 0) + 1,
      );
    }
  }
  final records =
      model.nodes.length + model.entries.length + model.events.length + model.threads.length + model.abilities.length;
  return (
    records: records,
    connections: connections.length,
    dangling: dangling.length,
    mostConnected: stableSorted(degree.values, (a, b) {
      if (a.count != b.count) return b.count - a.count;
      return localeCompare(a.label, b.label);
    }).take(top).toList(),
  );
}

/// Places as a tree: what lies inside what comes from "located-in" connections (a place with none is at the top), and
/// each place says how many events happened there. A place inside itself, through a loop, is shown once at the top.
List<({String id, String name, int depth, int events})> placeRows(StoryModel model) {
  final places = [
    for (final e in model.entries.values)
      if (e.category == 'location') e,
  ];
  final ids = {for (final p in places) p.id};
  final parent = <String, String>{};
  for (final link in model.links) {
    if (link.type == 'located-in' && ids.contains(link.fromId) && ids.contains(link.toId)) {
      parent.putIfAbsent(link.fromId, () => link.toId);
    }
  }
  final events = <String, int>{};
  for (final e in model.events.values) {
    final at = e.locationId;
    if (at != null) events[at] = (events[at] ?? 0) + 1;
  }
  bool inLoop(String id) {
    final seen = <String>{};
    for (String? at = id; at != null; at = parent[at]) {
      if (!seen.add(at)) return true;
    }
    return false;
  }

  final children = <String, List<String>>{};
  final roots = <String>[];
  for (final place in places) {
    final up = parent[place.id];
    if (up == null || inLoop(place.id)) {
      roots.add(place.id);
    } else {
      (children[up] ??= []).add(place.id);
    }
  }
  final byId = {for (final p in places) p.id: p};
  final rows = <({String id, String name, int depth, int events})>[];
  final shown = <String>{};
  void walk(List<String> list, int depth) {
    for (final id in stableSorted(list, (a, b) => localeCompare(byId[a]!.name, byId[b]!.name))) {
      if (!shown.add(id)) continue;
      rows.add((id: id, name: byId[id]!.name, depth: depth, events: events[id] ?? 0));
      walk(children[id] ?? const [], depth + 1);
    }
  }

  walk(roots, 0);
  return rows;
}

/// One character's progression at the end of the story, in one line: "Level 4 · Rank Lieutenant · Abilities: Fire
/// Lance, Ward". Empty when nothing is recorded.
String progressSummaryAtEnd(StoryModel model, String entryId) => progressSummary(progressAt(model, entryId, null));

/// Characters with something tracked about how they change: the abilities their sheets hold, their snapshots, and
/// their logged changes. Only who has something recorded is listed: nobody is assumed to have a level or a sheet.
List<({String id, String name, int abilities, int snapshots, int changes, String now})> progressionRows(
  StoryModel model,
  List<JsonMap> snapshots,
) {
  final counts = <String, ({int abilities, int snapshots, int changes})>{};
  ({int abilities, int snapshots, int changes}) at(String id) => counts[id] ?? (abilities: 0, snapshots: 0, changes: 0);
  for (final sheet in model.sheets) {
    final c = at(sheet.entryId);
    counts[sheet.entryId] = (abilities: c.abilities + sheet.itemIds.length, snapshots: c.snapshots, changes: c.changes);
  }
  for (final s in snapshots) {
    final id = str(s['entryId']);
    final c = at(id);
    counts[id] = (abilities: c.abilities, snapshots: c.snapshots + 1, changes: c.changes);
  }
  for (final p in model.progress) {
    final c = at(p.entryId);
    counts[p.entryId] = (abilities: c.abilities, snapshots: c.snapshots, changes: c.changes + 1);
  }
  return stableSorted([
    for (final MapEntry(key: id, value: c) in counts.entries)
      if (model.entries.containsKey(id))
        (
          id: id,
          name: model.entries[id]!.name,
          abilities: c.abilities,
          snapshots: c.snapshots,
          changes: c.changes,
          now: c.changes > 0 ? progressSummaryAtEnd(model, id) : '',
        ),
  ], (a, b) => localeCompare(a.name, b.name));
}
