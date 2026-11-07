import 'dart:math' as math;

import '../collation.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/story_order.dart';
import '../records/link.dart';
import '../records/relation.dart';
import '../stable_sort.dart';
import 'history.dart';
import 'relation_types.dart';

/// THE RELATIONSHIP NETWORK (as in the original app)
/// Which characters and relationships the map shows, from the shared model and the map's filters. Reads only.
///
///  current  how each relationship stands at the end of the story so far
///  at       as of a chapter: the stage in force there (a stage whose chapter is not said is not assumed begun)
///  range    across chapters: any stage in force between two chapters, drawn as the latest
///  ever     the whole history: any stage at all
sealed class When {
  const When();
}

class Now extends When {
  const Now();
}

class AsOf extends When {
  const AsOf(this.nodeId);
  final String nodeId;
}

class Across extends When {
  const Across(this.from, this.to);
  final String? from;
  final String? to;
}

class Ever extends When {
  const Ever();
}

/// Layers that can be hidden: each relationship group, other connections between characters, and line labels.
enum Layer { family, social, mentorship, romance, hierarchy, custom, connection, labels }

class NetworkFilter {
  const NetworkFilter({
    this.when = const Now(),
    this.type,
    this.factionId,
    this.focus,
    this.hidden = const {},
    this.isolated = false,
    this.keep,
  });

  final When when;

  /// One type, by key (`friends`, `type:<id>`).
  final String? type;

  /// Characters tied to this entry (a faction, a house) by any connection.
  final String? factionId;

  /// The character the map is centred on, and how many steps out (1 or 2).
  final ({String id, int depth})? focus;
  final Set<Layer> hidden;

  /// Show characters with no relationship too.
  final bool isolated;

  /// The page's own filters, for relationships: keep this one?
  final bool Function(String relationId)? keep;
}

class NetworkNode {
  NetworkNode(this.id, this.name, this.degree, {required this.focus});
  final String id;
  final String name;
  final int degree;
  final bool focus;
}

enum EdgeKind { relationship, connection }

class NetworkEdge {
  NetworkEdge({
    required this.id,
    required this.kind,
    required this.from,
    required this.to,
    required this.directed,
    required this.label,
    required this.fromRole,
    required this.toRole,
    required this.category,
    required this.affinity,
    required this.stage,
    required this.range,
  });

  /// A relationship's id, or a connection's.
  final String id;
  final EdgeKind kind;
  final String from;
  final String to;
  final bool directed;

  /// Its type, in words: "Mentor / Student", "Distrusts".
  final String label;
  final String fromRole;
  final String toRole;

  /// Its group, or null for another connection.
  final RelationCategory? category;
  final Affinity? affinity;
  final RelationStage? stage;

  /// Where the stage applies: "Chapters 3+".
  final String range;
}

class Network {
  Network(this.nodes, this.edges, this.total, this.hidden);
  final List<NetworkNode> nodes;
  final List<NetworkEdge> edges;

  /// Relationships in the novel, and how many the filters and layers leave out.
  final int total;
  final int hidden;
}

int _start(RelationStage s, StoryOrder order) => s.startNodeId == null ? -1 : (order.position[s.startNodeId] ?? -1);

/// The stage a relationship is drawn as under [when], among those matching [type]; null when none.
RelationStage? stageShown(CharacterRelation relation, StoryModel model, When when, [String? type]) {
  RelationStage? fits(RelationStage? s) => s != null && (type == null || s.preset == type) ? s : null;
  switch (when) {
    case Now():
      return fits(stageAt(relation, null, model.order));
    case AsOf(:final nodeId):
      return fits(stageAt(relation, nodeId, model.order));
    case Ever():
      final stages = [
        for (final s in sortedStages(relation, model.order))
          if (type == null || s.preset == type) s,
      ];
      return stages.lastOrNull;
    case Across(:final from, :final to):
      final lo = from == null
          ? double.negativeInfinity
          : (model.order.position[from]?.toDouble() ?? double.negativeInfinity);
      final hi = to == null ? double.infinity : (model.order.position[to]?.toDouble() ?? double.infinity);
      final stages = sortedStages(relation, model.order);
      RelationStage? last;
      for (final (i, s) in stages.indexed) {
        if (s.startUnknown) continue;
        final next = stages.sublist(i + 1).where((x) => !x.startUnknown).firstOrNull;
        final sLo = _start(s, model.order).toDouble();
        final sHi = next == null ? double.infinity : (_start(next, model.order) - 1).toDouble();
        if (sLo <= hi && sHi >= lo && (type == null || s.preset == type)) last = s;
      }
      return last;
  }
}

Layer _layerOf(RelationCategory c) => Layer.values.byName(c.name);

/// The network the map shows under these filters.
Network relationNetwork(StoryModel model, [NetworkFilter filter = const NetworkFilter()]) {
  final characters = {
    for (final e in model.entries.values)
      if (e.category == 'character') e.id: e,
  };
  final connections = deriveConnections(model).connections;
  final factionId = filter.factionId;
  final members = factionId != null && model.entries.containsKey(factionId)
      ? {
          for (final c in connectionsOf(connections, EntityRef(EntityType.entry, factionId)))
            if (c.other.type == EntityType.entry && characters.containsKey(c.other.id)) c.other.id,
        }
      : null;

  var edges = <NetworkEdge>[];
  for (final relation in model.relations.values) {
    if (!characters.containsKey(relation.fromId) || !characters.containsKey(relation.toId)) continue;
    if (filter.keep != null && !filter.keep!(relation.id)) continue;
    final stage = stageShown(relation, model, filter.when, filter.type);
    if (stage == null) continue;
    final category = RelationCategory.of(stage.category);
    if (filter.hidden.contains(_layerOf(category))) continue;
    if (members != null && !members.contains(relation.fromId) && !members.contains(relation.toId)) continue;
    final range = timelineOf(relation, model.order).where((x) => x.stage.id == stage.id).firstOrNull?.range ?? '';
    edges.add(
      NetworkEdge(
        id: relation.id,
        kind: EdgeKind.relationship,
        from: relation.fromId,
        to: relation.toId,
        directed: stage.directional,
        label: stage.label.isEmpty ? 'Related' : stage.label,
        fromRole: stage.fromRole,
        toRole: stage.toRole,
        category: category,
        affinity: Affinity.of(stage.affinity),
        stage: stage,
        range: range,
      ),
    );
  }
  // Other typed connections between two characters: a layer of their own, with no history.
  if (!filter.hidden.contains(Layer.connection) && filter.type == null) {
    for (final c in connections) {
      if (c.kind != ConnectionKind.link ||
          c.from.type != EntityType.entry ||
          c.to.type != EntityType.entry ||
          !characters.containsKey(c.from.id) ||
          !characters.containsKey(c.to.id)) {
        continue;
      }
      if (members != null && !members.contains(c.from.id) && !members.contains(c.to.id)) continue;
      edges.add(
        NetworkEdge(
          id: c.id,
          kind: EdgeKind.connection,
          from: c.from.id,
          to: c.to.id,
          directed: c.directed,
          label: c.label.isNotEmpty ? c.label : connectionType(c.type).label,
          fromRole: '',
          toRole: '',
          category: null,
          affinity: null,
          stage: null,
          range: '',
        ),
      );
    }
  }

  // Focus: the character and those within one or two steps of them, by what is shown.
  Set<String>? focusIds;
  final focus = filter.focus;
  if (focus != null && characters.containsKey(focus.id)) {
    var reached = {focus.id};
    for (var step = 0; step < focus.depth; step++) {
      final ring = {...reached};
      for (final e in edges) {
        if (reached.contains(e.from)) ring.add(e.to);
        if (reached.contains(e.to)) ring.add(e.from);
      }
      reached = ring;
    }
    focusIds = reached;
    edges = [
      for (final e in edges)
        if (reached.contains(e.from) && reached.contains(e.to)) e,
    ];
  }

  final degree = <String, int>{};
  for (final e in edges) {
    for (final id in [e.from, e.to]) {
      degree[id] = (degree[id] ?? 0) + 1;
    }
  }
  final shown = {...degree.keys};
  if (focusIds != null) {
    shown.addAll(focusIds);
  } else if (filter.isolated) {
    for (final id in characters.keys) {
      if (members == null || members.contains(id)) shown.add(id);
    }
  }
  final nodes = stableSorted(
    [for (final id in shown) NetworkNode(id, characters[id]!.name, degree[id] ?? 0, focus: id == focus?.id)],
    (a, b) {
      final c = localeCompare(a.name, b.name);
      return c != 0 ? c : localeCompare(a.id, b.id);
    },
  );
  final relationships = edges.where((e) => e.kind == EdgeKind.relationship).length;
  return Network(
    nodes,
    stableSorted(edges, (a, b) => localeCompare(a.id, b.id)),
    model.relations.length,
    model.relations.length - relationships,
  );
}

/// A node's size, in three steps a reader can tell apart: one tie or none, a few (2–5), many (6 or more).
double radiusOf(int degree) => degree >= 6 ? 25 : (degree >= 2 ? 19 : 14);

/// Where each character goes: a force layout from a fixed start (everyone on a circle in the order given) for a fixed
/// number of steps, so the same network is always drawn the same way. Ties pull, everyone pushes everyone apart, a
/// gentle pull keeps the whole near the centre, and nobody overlaps.
Map<String, ({double x, double y})> layoutNetwork(List<NetworkNode> nodes, List<NetworkEdge> edges) => layoutGraph(
  [for (final n in nodes) (id: n.id, degree: n.degree)],
  [for (final e in edges) (from: e.from, to: e.to)],
);

/// How far one record may move in one step of the layout.
const _maxStep = 40.0;

/// The same layout for any network: each node by its id and how many it is tied to, each tie by its two ends.
Map<String, ({double x, double y})> layoutGraph(
  List<({String id, int degree})> nodes,
  List<({String from, String to})> edges,
) {
  final n = nodes.length;
  final index = {for (final (i, node) in nodes.indexed) node.id: i};
  final r = [for (final node in nodes) radiusOf(node.degree)];
  final ring = 40.0 + n * 9;
  final x = [for (var i = 0; i < n; i++) math.cos(2 * math.pi * i / math.max(n, 1)) * ring];
  final y = [for (var i = 0; i < n; i++) math.sin(2 * math.pi * i / math.max(n, 1)) * ring];
  final links = [
    for (final e in edges)
      if (index.containsKey(e.from) && index.containsKey(e.to) && e.from != e.to) (index[e.from]!, index[e.to]!),
  ];
  final ties = List<int>.filled(n, 0);
  for (final (a, b) in links) {
    ties[a]++;
    ties[b]++;
  }
  if (n > 1) {
    final steps = math.max(60, math.min(300, (40000 / n).round()));
    for (var step = 0; step < steps; step++) {
      final alpha = 1.0 - step / steps;
      final dx = List<double>.filled(n, 0);
      final dy = List<double>.filled(n, 0);
      // Everyone pushes everyone apart, less with distance.
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var vx = x[j] - x[i];
          var vy = y[j] - y[i];
          var d2 = vx * vx + vy * vy;
          if (d2 < 1e-6) {
            vx = (j - i).toDouble();
            vy = 1;
            d2 = vx * vx + vy * vy;
          }
          if (d2 > 900 * 900) continue;
          // As d3 does: never as if closer than one unit, so two records nearly on top of each other are not flung.
          final f = 260 / math.max(d2, 1);
          dx[i] -= vx * f;
          dy[i] -= vy * f;
          dx[j] += vx * f;
          dy[j] += vy * f;
        }
      }
      // Ties pull towards their length. As d3 does, each tie moves the end with fewer ties more, so a record tied to
      // many is not pulled every way at once (and set swinging further each step).
      for (final (a, b) in links) {
        final vx = x[b] - x[a];
        final vy = y[b] - y[a];
        final d = math.max(math.sqrt(vx * vx + vy * vy), 1e-6);
        final want = 70 + r[a] + r[b];
        final f = (d - want) / d * 0.4;
        final bias = ties[a] / (ties[a] + ties[b]);
        dx[a] += vx * f * (1 - bias);
        dy[a] += vy * f * (1 - bias);
        dx[b] -= vx * f * bias;
        dy[b] -= vy * f * bias;
      }
      for (var i = 0; i < n; i++) {
        dx[i] -= x[i] * 0.05;
        dy[i] -= y[i] * 0.05;
        // No step further than [_maxStep]: the layout settles instead of running away.
        final step = math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) * alpha;
        final scale = step > _maxStep ? _maxStep / step : 1.0;
        x[i] += dx[i] * alpha * scale;
        y[i] += dy[i] * alpha * scale;
      }
      // Nobody overlaps.
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          final vx = x[j] - x[i];
          final vy = y[j] - y[i];
          final d = math.sqrt(vx * vx + vy * vy);
          final min = r[i] + r[j] + 22;
          if (d < min && d > 1e-6) {
            final push = (min - d) / d / 2;
            x[i] -= vx * push;
            y[i] -= vy * push;
            x[j] += vx * push;
            y[j] += vy * push;
          }
        }
      }
    }
  }
  return {for (final (i, node) in nodes.indexed) node.id: (x: x[i].roundToDouble(), y: y[i].roundToDouble())};
}
