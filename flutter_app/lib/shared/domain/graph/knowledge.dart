import '../codex/field_values.dart' show displayValue;
import '../collation.dart';
import '../integrity/rules.dart' show statusOf;
import '../json.dart';
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../records/category.dart';
import '../records/link.dart' show connectionType;
import '../stable_sort.dart';

/// THE KNOWLEDGE GRAPH (as in the original app)
/// Every record of the novel as a node (characters, places, factions, items, species and any category the author
/// makes; abilities; events; chapters and scenes and the parts they sit in; plot threads) and every connection the
/// shared model reads as an edge, each with its type. Nothing is stored for the graph: it is the records and their
/// connections, as they are.
class GraphNode {
  GraphNode({
    required this.key,
    required this.ref,
    required this.type,
    required this.label,
    required this.color,
    this.aka,
    this.degree = 0,
    this.members,
  });

  /// `entry:<id>`, `event:<id>`… unique across record types. A group of records folded together starts `group:`.
  final String key;

  /// The record it is; null for a group.
  final EntityRef? ref;

  /// `entry:<category>`, `event`, `chapter`, `scene`, `part`, `thread` or `ability`.
  final String type;
  String label;

  /// The record's own name, when its kind labels it in the graph by a field instead.
  final String? aka;
  final String color;

  /// Connections it has in the whole novel (for a group: those shown).
  int degree;

  /// For a group: the records folded into it.
  final List<String>? members;

  bool get isGroup => key.startsWith('group:');
}

class GraphEdge {
  GraphEdge({
    required this.id,
    required this.from,
    required this.to,
    required this.kind,
    required this.type,
    required this.label,
    required this.directed,
    required this.connection,
    this.reverseLabel,
  });

  /// The connection's own stable id.
  final String id;
  final String from;
  final String to;
  final ConnectionKind kind;

  /// `link:<type>` for a stored connection, else the kind.
  final String type;

  /// How it reads from its `from` side, and from its `to` side when that differs.
  final String label;
  final String? reverseLabel;
  final bool directed;
  final Connection connection;

  GraphEdge between(String from, String to) => GraphEdge(
    id: id,
    from: from,
    to: to,
    kind: kind,
    type: type,
    label: label,
    directed: directed,
    connection: connection,
    reverseLabel: reverseLabel,
  );
}

typedef Excluded = ({String category, int count});
typedef Undrawn = ({String category, String field, int count});

class KnowledgeGraph {
  KnowledgeGraph(this.nodes, this.edges, this.dangling, {this.excluded, this.undrawn});
  final List<GraphNode> nodes;
  final List<GraphEdge> edges;

  /// Connections one end of which no longer exists: left out, and counted.
  final int dangling;

  /// Kinds of record set not to appear in the graph, and how many records that leaves out.
  final List<Excluded>? excluded;

  /// Link fields a kind of record set not to be drawn, and how many connections that leaves out.
  final List<Undrawn>? undrawn;
}

String keyOf(EntityRef ref) => '${ref.type.name}:${ref.id}';

EntityRef? refOf(String key) {
  final at = key.indexOf(':');
  if (at <= 0 || at == key.length - 1) return null;
  final type = entityTypeOf(key.substring(0, at));
  return type == null ? null : EntityRef(type, key.substring(at + 1));
}

const _fixedTypes = {
  'event': (label: 'Events', color: '#c08a1e'),
  'chapter': (label: 'Chapters', color: '#64748b'),
  'scene': (label: 'Scenes', color: '#94a3b8'),
  'part': (label: 'Volumes, acts and arcs', color: '#334155'),
  'thread': (label: 'Plot threads', color: '#7a4fa3'),
  'ability': (label: 'Abilities', color: '#2b7a8c'),
};

Category _category(StoryModel model, String key) => model.categories[key] ?? Category.unknown(key);

/// A node type in words: a category's plural name, or the fixed names.
String nodeTypeLabel(String type, StoryModel model) =>
    type.startsWith('entry:') ? _category(model, type.substring(6)).name : (_fixedTypes[type]?.label ?? type);

String nodeTypeColor(String type, StoryModel model) =>
    type.startsWith('entry:') ? _category(model, type.substring(6)).color : (_fixedTypes[type]?.color ?? '#8a8276');

const _kindLabels = {
  ConnectionKind.partOf: 'Part of',
  ConnectionKind.link: 'Related to',
  ConnectionKind.relationship: 'Character relationship',
  ConnectionKind.field: 'Named in a field',
  ConnectionKind.mentioned: 'Linked in the text of',
  ConnectionKind.present: 'Involved in (chapter plan)',
  ConnectionKind.appearance: 'Appearance record',
  ConnectionKind.participant: 'Takes part in',
  ConnectionKind.involved: 'Involved in (event)',
  ConnectionKind.occursAt: 'Takes place at',
  ConnectionKind.toldIn: 'Told in',
  ConnectionKind.follows: 'Comes after',
  ConnectionKind.datedFrom: 'Dated from',
  ConnectionKind.inThread: 'Belongs to the thread',
  ConnectionKind.threadEntry: 'Thread involves',
  ConnectionKind.beat: 'Thread develops in',
  ConnectionKind.resolvesIn: 'Thread meant to resolve in',
  ConnectionKind.holds: 'Has the ability',
  ConnectionKind.branchesFrom: 'Branches from',
  ConnectionKind.progress: 'Progression change',
  ConnectionKind.travel: 'Journey',
};

String edgeTypeOf(Connection c) => c.kind == ConnectionKind.link ? 'link:${connectionType(c.type).key}' : c.kind.key;

/// An edge type in words: a stored connection's type ("Owns", "Created by", the author's own word), or what the app
/// keeps.
String edgeTypeLabel(String type) {
  if (type.startsWith('link:')) return connectionType(type.substring(5)).label;
  final kind = ConnectionKind.of(type);
  return kind == null ? type : _kindLabels[kind]!;
}

/// A record's node type.
String? nodeTypeOf(EntityRef ref, StoryModel model) {
  switch (ref.type) {
    case EntityType.entry:
      final entry = model.entries[ref.id];
      return entry == null ? null : 'entry:${entry.category}';
    case EntityType.node:
      final node = model.nodes[ref.id];
      if (node == null) return null;
      return node.kind?.isGroup == true ? 'part' : node.kindKey;
    case EntityType.event:
      return model.events.containsKey(ref.id) ? 'event' : null;
    case EntityType.thread:
      return model.threads.containsKey(ref.id) ? 'thread' : null;
    case EntityType.ability:
      return model.abilities.containsKey(ref.id) ? 'ability' : null;
    case EntityType.relation:
      return null;
  }
}

const _labelTypes = {FieldType.text, FieldType.number, FieldType.select, FieldType.date};

/// The whole graph of a novel: every record, every connection.
KnowledgeGraph knowledgeGraph(StoryModel model) {
  final nodes = <String, GraphNode>{};
  void add(EntityRef ref) {
    final type = nodeTypeOf(ref, model);
    final found = model.resolve(ref);
    if (type == null || found == null) return;
    // A kind may label its records by one of its fields (a code name, a designation), where that field is filled in.
    final entry = ref.type == EntityType.entry ? model.entries[ref.id] : null;
    final category = entry == null ? null : model.categories[entry.category];
    final defId = category?.uses['graphLabel'];
    final def = defId is String
        ? category!.fields.where((f) => f.id == defId && !f.archived && _labelTypes.contains(f.type)).firstOrNull
        : null;
    final value = def == null || entry == null
        ? ''
        : displayValue(
            def.type,
            entry.fields.where((f) => f.defId == def.id).firstOrNull?.value ?? '',
            (_) => null,
          ).trim();
    nodes[keyOf(ref)] = GraphNode(
      key: keyOf(ref),
      ref: ref,
      type: type,
      label: value.isNotEmpty ? value : found.label,
      aka: value.isNotEmpty ? found.label : null,
      color: nodeTypeColor(type, model),
    );
  }

  // A category the author set not to appear in the graph leaves its entries out, and is counted, so the view can say so.
  final excluded = <String, int>{};
  for (final entry in model.entries.values) {
    if (model.categories[entry.category]?.raw['graph'] == false) {
      excluded[entry.category] = (excluded[entry.category] ?? 0) + 1;
    } else {
      add(EntityRef(EntityType.entry, entry.id));
    }
  }
  for (final id in model.events.keys) {
    add(EntityRef(EntityType.event, id));
  }
  for (final id in model.nodes.keys) {
    add(EntityRef(EntityType.node, id));
  }
  for (final id in model.threads.keys) {
    add(EntityRef(EntityType.thread, id));
  }
  for (final id in model.abilities.keys) {
    add(EntityRef(EntityType.ability, id));
  }
  final (:connections, :dangling) = deriveConnections(model);
  final edges = <GraphEdge>[];
  // A kind may choose which of its link fields are drawn; the others are left out, and counted.
  final undrawn = <String, Undrawn>{};
  bool drawn(Connection c) {
    if (c.kind != ConnectionKind.field || c.source.field == null) return true;
    final entry = model.entries[c.source.id];
    final uses = entry == null ? null : model.categories[entry.category]?.uses;
    final chosen = uses != null && uses['graphLinks'] is List ? strings(uses['graphLinks']) : null;
    final defId = entry?.fields.where((f) => f.id == c.source.field).firstOrNull?.defId;
    // Fields of one entry alone are not the kind's to choose: always drawn.
    if (entry == null || chosen == null || defId == null || chosen.contains(defId)) return true;
    final key = '${entry.category}|$defId';
    final name = model.categories[entry.category]?.fields.where((d) => d.id == defId).firstOrNull?.name ?? c.label;
    undrawn[key] = (category: entry.category, field: name, count: (undrawn[key]?.count ?? 0) + 1);
    return false;
  }

  for (final c in connections) {
    final from = keyOf(c.from), to = keyOf(c.to);
    if (!nodes.containsKey(from) || !nodes.containsKey(to) || from == to || !drawn(c)) continue;
    final type = edgeTypeOf(c);
    edges.add(
      GraphEdge(
        id: c.id,
        from: from,
        to: to,
        kind: c.kind,
        type: type,
        label: c.label.isNotEmpty ? c.label : edgeTypeLabel(type),
        reverseLabel: c.reverseLabel != null && c.reverseLabel!.isNotEmpty ? c.reverseLabel : null,
        directed: c.directed,
        connection: c,
      ),
    );
    nodes[from]!.degree++;
    nodes[to]!.degree++;
  }
  return KnowledgeGraph(
    stableSorted(nodes.values, (a, b) {
      final byLabel = localeCompare(a.label, b.label);
      return byLabel != 0 ? byLabel : localeCompare(a.key, b.key);
    }),
    edges,
    dangling.length,
    excluded: [for (final MapEntry(:key, :value) in excluded.entries) (category: key, count: value)],
    undrawn: [...undrawn.values],
  );
}

/// What a query leaves of the graph: types hidden, words, a focus.
class GraphQuery {
  const GraphQuery({
    this.hiddenNodes = const {},
    this.hiddenEdges = const {},
    this.hiddenStatuses = const {},
    this.text = '',
    this.focus,
    this.isolated = false,
  });

  /// Node types not shown.
  final Set<String> hiddenNodes;

  /// Edge types not shown.
  final Set<String> hiddenEdges;

  /// Statuses of stored connections not shown. Other connections have none, and stay.
  final Set<String> hiddenStatuses;

  /// Only records whose name has these words, and what they are directly connected to.
  final String text;

  /// Only this record's neighbourhood: one step, or two.
  final ({String key, int depth})? focus;

  /// Show records with no connection shown, too.
  final bool isolated;
}

/// The records a record reaches in up to [depth] steps over these edges, itself included.
Set<String> neighbourhood(List<GraphEdge> edges, String key, int depth) {
  final reached = {key};
  var frontier = {key};
  for (var step = 0; step < depth; step++) {
    final next = <String>{};
    for (final e in edges) {
      if (frontier.contains(e.from) && !reached.contains(e.to)) next.add(e.to);
      if (frontier.contains(e.to) && !reached.contains(e.from)) next.add(e.from);
    }
    reached.addAll(next);
    frontier = next;
  }
  return reached;
}

/// The graph a query leaves: the types shown, then the words, then the focus; edges only between what remains.
KnowledgeGraph queryGraph(KnowledgeGraph graph, GraphQuery query) {
  var nodes = [
    for (final n in graph.nodes)
      if (!query.hiddenNodes.contains(n.type)) n,
  ];
  var keep = {for (final n in nodes) n.key};
  var edges = [
    for (final e in graph.edges)
      if (!query.hiddenEdges.contains(e.type) &&
          !query.hiddenStatuses.contains(statusOf(e.connection)?.name ?? '') &&
          keep.contains(e.from) &&
          keep.contains(e.to))
        e,
  ];
  final text = query.text.trim().toLowerCase();
  if (text.isNotEmpty) {
    final hits = [
      for (final n in nodes)
        if (n.label.toLowerCase().contains(text) || (n.aka?.toLowerCase().contains(text) ?? false)) n.key,
    ];
    keep = {for (final k in hits) ...neighbourhood(edges, k, 1)};
  }
  final focus = query.focus;
  if (focus != null && keep.contains(focus.key)) {
    final near = neighbourhood(
      [
        for (final e in edges)
          if (keep.contains(e.from) && keep.contains(e.to)) e,
      ],
      focus.key,
      focus.depth,
    );
    keep = {
      for (final k in keep)
        if (near.contains(k)) k,
    };
  }
  edges = [
    for (final e in edges)
      if (keep.contains(e.from) && keep.contains(e.to)) e,
  ];
  final linked = {
    for (final e in edges) ...[e.from, e.to],
  };
  nodes = [
    for (final n in nodes)
      if (keep.contains(n.key) && (query.isolated || linked.contains(n.key) || n.key == focus?.key)) n,
  ];
  return KnowledgeGraph(nodes, edges, graph.dangling);
}

/// How two records are connected: the shortest chain of connections between them, either way along each, over the
/// edges given. Null when they are not connected at all within [limit] steps.
List<GraphEdge>? pathBetween(List<GraphEdge> edges, String fromKey, String toKey, [int limit = 8]) {
  if (fromKey == toKey) return [];
  final via = <String, GraphEdge>{};
  final seen = {fromKey};
  var frontier = [fromKey];
  for (var step = 0; step < limit && frontier.isNotEmpty; step++) {
    final next = <String>[];
    for (final key in frontier) {
      for (final e in edges) {
        final other = e.from == key ? e.to : (e.to == key ? e.from : null);
        if (other == null || seen.contains(other)) continue;
        seen.add(other);
        via[other] = e;
        if (other == toKey) {
          final path = <GraphEdge>[];
          for (var at = toKey; at != fromKey;) {
            final edge = via[at]!;
            path.insert(0, edge);
            at = edge.from == at ? edge.to : edge.from;
          }
          return path;
        }
        next.add(other);
      }
    }
    frontier = next;
  }
  return null;
}

typedef TypeCount = (String type, int count);

/// How many nodes and edges of each type, most first: for the layers and legends.
({List<TypeCount> nodes, List<TypeCount> edges, List<TypeCount> statuses}) typeCounts(KnowledgeGraph graph) {
  List<TypeCount> count(Iterable<String> types) {
    final m = <String, int>{};
    for (final t in types) {
      m[t] = (m[t] ?? 0) + 1;
    }
    return stableSorted([for (final e in m.entries) (e.key, e.value)], (a, b) {
      final byCount = b.$2.compareTo(a.$2);
      return byCount != 0 ? byCount : localeCompare(a.$1, b.$1);
    });
  }

  return (
    nodes: count(graph.nodes.map((n) => n.type)),
    edges: count(graph.edges.map((e) => e.type)),
    statuses: count([for (final e in graph.edges) ?statusOf(e.connection)?.name]),
  );
}

String _lowerFirst(String s) => s.isEmpty ? s : '${s[0].toLowerCase()}${s.substring(1)}';

/// One edge read aloud: "Mira owns The Ember Blade", "The siege took place at The Keep".
String edgeWords(GraphEdge edge, String Function(String key) labelOf) =>
    '${labelOf(edge.from)} ${_lowerFirst(edge.label)} ${labelOf(edge.to)}'
    '${edge.reverseLabel != null ? ' (from the other side: ${edge.reverseLabel!.toLowerCase()})' : ''}';

// ---------------------------------------------------------------------------------------------------- against clutter

/// The graph with records folded together: scenes into their chapters ([fold]), and whole kinds of record ([types])
/// into one group node each. Connections follow what they joined, keeping their own ids; those inside one group, or
/// between a scene and its chapter, are left out (and counted). `into` says where each record went, for lighting up a
/// path or a selection inside a group.
({KnowledgeGraph graph, Map<String, String> into, int inside}) collapseGraph(
  KnowledgeGraph graph, {
  Set<String> types = const {},
  String? Function(String key)? fold,
  required String Function(String type, int count) groupLabel,
}) {
  final byKey = {for (final n in graph.nodes) n.key: n};
  final into = <String, String>{};
  for (final node in graph.nodes) {
    final target = fold?.call(node.key);
    into[node.key] = target != null && target != node.key && byKey.containsKey(target) ? target : node.key;
  }
  // A record folded into another follows it into a group, too.
  final groups = <String, GraphNode>{};
  for (final node in graph.nodes) {
    final host = byKey[into[node.key]] ?? node;
    if (!types.contains(host.type)) continue;
    final key = 'group:${host.type}';
    groups
        .putIfAbsent(
          key,
          () => GraphNode(key: key, ref: null, type: host.type, label: '', color: host.color, members: []),
        )
        .members!
        .add(node.key);
    into[node.key] = key;
  }
  for (final group in groups.values) {
    group.label = groupLabel(group.type, group.members!.where((k) => byKey[k]?.type == group.type).length);
  }
  var inside = 0;
  final edges = <GraphEdge>[];
  for (final e in graph.edges) {
    final from = into[e.from] ?? e.from, to = into[e.to] ?? e.to;
    if (from == to) {
      inside++;
    } else {
      edges.add(from == e.from && to == e.to ? e : e.between(from, to));
    }
  }
  final nodes = [
    for (final n in graph.nodes)
      if (into[n.key] == n.key) n,
    ...groups.values,
  ];
  for (final group in groups.values) {
    group.degree = edges.where((e) => e.from == group.key || e.to == group.key).length;
  }
  return (graph: KnowledgeGraph(nodes, edges, graph.dangling), into: into, inside: inside);
}

/// How many records the graph draws at most, unless the author asks for more: beyond this, it is too crowded to read
/// and slow to lay out.
const drawLimit = 200;
const drawStep = 100;

/// At most [limit] records: the most connected first (by the connections shown), always with the records in [keep]
/// (the selection, the focus, a path). The rest are not drawn, and are counted, so a partial view is never taken for
/// the whole story.
({KnowledgeGraph graph, int total, int cut}) limitGraph(
  KnowledgeGraph graph,
  num limit, [
  Set<String> keep = const {},
]) {
  final total = graph.nodes.length;
  if (total <= limit) return (graph: graph, total: total, cut: 0);
  final degree = <String, int>{};
  for (final e in graph.edges) {
    for (final k in [e.from, e.to]) {
      degree[k] = (degree[k] ?? 0) + 1;
    }
  }
  final ranked = stableSorted(graph.nodes, (a, b) {
    final byDegree = (degree[b.key] ?? 0).compareTo(degree[a.key] ?? 0);
    if (byDegree != 0) return byDegree;
    final byLabel = localeCompare(a.label, b.label);
    return byLabel != 0 ? byLabel : localeCompare(a.key, b.key);
  });
  final present = {for (final n in graph.nodes) n.key};
  final taken = {
    for (final k in keep)
      if (present.contains(k)) k,
  };
  for (final node in ranked) {
    if (taken.length >= limit) break;
    taken.add(node.key);
  }
  final nodes = [
    for (final n in graph.nodes)
      if (taken.contains(n.key)) n,
  ];
  return (
    graph: KnowledgeGraph(nodes, [
      for (final e in graph.edges)
        if (taken.contains(e.from) && taken.contains(e.to)) e,
    ], graph.dangling),
    total: total,
    cut: total - nodes.length,
  );
}

// ------------------------------------------------------------------------------------------------------- how it is drawn

/// How each kind of record is drawn: a shape as well as a colour, named in the legend.
enum NodeShape { circle, diamond, square, triangle }

NodeShape shapeOf(String type) => switch (type) {
  'event' => NodeShape.diamond,
  'chapter' || 'scene' || 'part' => NodeShape.square,
  'thread' || 'ability' => NodeShape.triangle,
  _ => NodeShape.circle,
};

final _notWord = RegExp(r'[^\p{L}\p{N}]', unicode: true);

String _code(String word, int length) {
  final first = String.fromCharCodes(word.runes.take(1)).toUpperCase();
  final rest = String.fromCharCodes(word.runes.skip(1).take(length - 1)).toLowerCase();
  return '$first$rest';
}

/// Letter codes for the kinds of record that share a shape (characters, places and factions are all circles), so no
/// kind is told by its colour alone: the first letter of its name, or as many as tell them apart.
Map<String, String> typeCodes(Iterable<String> types, String Function(String type) label) {
  final codes = <String, String>{};
  final byShape = <NodeShape, List<String>>{};
  for (final type in types.toSet().toList()..sort()) {
    (byShape[shapeOf(type)] ??= []).add(type);
  }
  for (final group in byShape.values) {
    if (group.length < 2) continue;
    final words = [
      for (final t in group)
        if (label(t).replaceAll(_notWord, '') case final w) w.isEmpty ? '?' : w,
    ];
    for (var length = 1; length <= 3; length++) {
      final tries = [for (final w in words) _code(w, length)];
      final unique = tries.toSet().length == tries.length;
      if (unique || length == 3) {
        for (final (i, t) in group.indexed) {
          codes[t] = unique ? tries[i] : '${tries[i]}${i + 1}';
        }
        break;
      }
    }
  }
  return codes;
}

/// Connections fall in groups, each with a line of its own (and a colour), named in the legend. In this order the
/// strongest first: a line between two records is drawn as the strongest group among its connections.
enum EdgeGroup {
  typed('Connections you recorded (owns, created by, your own…)'),
  relationship('Character relationships'),
  field('Named in a field'),
  timeline('Timeline (takes part in, takes place at, comes after…)'),
  plot('Plot threads'),
  manuscript('Manuscript (told in, linked in the text, part of…)'),
  system('Abilities');

  const EdgeGroup(this.label);
  final String label;
}

EdgeGroup groupOf(ConnectionKind kind) => switch (kind) {
  ConnectionKind.link => EdgeGroup.typed,
  ConnectionKind.relationship => EdgeGroup.relationship,
  ConnectionKind.field => EdgeGroup.field,
  ConnectionKind.participant ||
  ConnectionKind.involved ||
  ConnectionKind.occursAt ||
  ConnectionKind.follows ||
  ConnectionKind.datedFrom => EdgeGroup.timeline,
  ConnectionKind.inThread ||
  ConnectionKind.threadEntry ||
  ConnectionKind.beat ||
  ConnectionKind.resolvesIn => EdgeGroup.plot,
  ConnectionKind.holds || ConnectionKind.branchesFrom => EdgeGroup.system,
  _ => EdgeGroup.manuscript,
};

/// The connections between one pair of records, drawn as one line.
class Pair {
  Pair(this.key, this.a, this.b);
  final String key;
  final String a;
  final String b;
  final List<GraphEdge> edges = [];

  /// The strongest group among its connections: how its line is drawn.
  EdgeGroup get group => EdgeGroup.values.firstWhere((g) => edges.any((e) => groupOf(e.kind) == g));
}

List<Pair> pairsOf(List<GraphEdge> edges) {
  final pairs = <String, Pair>{};
  for (final e in edges) {
    final (a, b) = e.from.compareTo(e.to) < 0 ? (e.from, e.to) : (e.to, e.from);
    pairs.putIfAbsent('$a~$b', () => Pair('$a~$b', a, b)).edges.add(e);
  }
  return [...pairs.values];
}
