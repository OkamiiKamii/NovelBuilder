import 'dart:math' as math;

import '../codex/capabilities.dart';
import '../codex/field_values.dart' show displayValue;
import '../collation.dart';
import '../graph/knowledge.dart' show keyOf;
import '../model/connections.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart' show Anchor;
import '../progression/snapshots.dart';
import '../progression/track.dart';
import '../records/link.dart' show connectionType;
import '../records/progress.dart';
import '../records/story_node.dart';
import '../records/system.dart';
import '../stable_sort.dart';
import '../systems/compute.dart' show checkFormula, groupNamed;
import '../systems/formula.dart';

/// ABILITY PATHS (as in the original app)
/// Abilities, skills, techniques, transformations, classes, upgrades (from any system blueprint, and from any kind of
/// record the author marks as one) and the paths the author records between them. Every path says only what it says:
/// a prerequisite must be held first; an upgrade, an evolution, a fusion or a replacement is something else, and is
/// never read as a prerequisite. Nothing is assumed to follow a single system, and nothing is worked out from names.
/// What is wrong is said, never fixed.

enum PathRole {
  prerequisite('Prerequisites'),
  alternative('Alternative prerequisites'),
  rule('Named in a requirement rule'),
  upgrade('Upgrades'),
  evolution('Evolutions'),
  fusion('Fusions'),
  replacement('Replacements'),
  branch('Branches (in a blueprint)'),
  exclusive('Mutually exclusive'),
  other('Your own connections');

  const PathRole(this.label);
  final String label;
}

/// The recorded connection types that are paths, and what each means.
const pathTypes = {
  'prerequisite-for': PathRole.prerequisite,
  'alternative-for': PathRole.alternative,
  'upgrades-to': PathRole.upgrade,
  'evolves-into': PathRole.evolution,
  'fuses-into': PathRole.fusion,
  'replaced-by': PathRole.replacement,
  'excludes': PathRole.exclusive,
};

/// What must be held first: the only paths that decide whether something can be gained.
const _requires = [PathRole.prerequisite, PathRole.rule];

/// Paths that run from one ability on to the next: the tree's layers follow them.
const _forward = [
  PathRole.prerequisite,
  PathRole.alternative,
  PathRole.rule,
  PathRole.upgrade,
  PathRole.evolution,
  PathRole.fusion,
  PathRole.replacement,
  PathRole.branch,
];

/// Paths along which one thing becomes another: holding the later one without the earlier is expected.
const _becomes = [PathRole.upgrade, PathRole.evolution, PathRole.fusion, PathRole.replacement, PathRole.branch];

typedef Holder = ({String id, String name, String how});

/// Gained or lost by a recorded change, or first held in a snapshot. [action]: gain, lose, happen or snapshot.
typedef Acquisition = ({String entryId, String name, String action, String when, String? changeId, String? snapshotId});

class AbilityNode {
  AbilityNode({
    required this.key,
    required this.ref,
    required this.name,
    required this.source,
    required this.sourceKey,
    required this.color,
    required this.rank,
    required this.requires,
    required this.limits,
  });
  final String key;
  final EntityRef ref;
  final String name;

  /// Where it comes from: a blueprint's group ("Ember Arts · Skills"), or its kind of record ("Techniques").
  final String source;
  final String sourceKey;
  final String color;
  final String? rank;

  /// A blueprint item's requirement rule, as written.
  final String requires;

  /// Costs, cooldown and the like, in words.
  final List<String> limits;
  final holders = <Holder>[];
  final acquired = <Acquisition>[];
}

class PathEdge {
  PathEdge(this.id, this.from, this.to, this.role, this.label, this.directed, this.linkId);
  final String id;
  final String from;
  final String to;
  final PathRole role;

  /// How it reads from [from]: "Prerequisite for", "Evolves into", the author's own wording.
  final String label;
  final bool directed;

  /// The recorded connection's own id, when it is one (to change or remove it); null for one read from a blueprint.
  final String? linkId;
}

class AbilityTree {
  AbilityTree(this.nodes, this.edges, this.notDrawn);
  final List<AbilityNode> nodes;
  final List<PathEdge> edges;

  /// Path connections with an end that is not an ability or the like: listed, not drawn.
  final List<({Connection connection, String reason})> notDrawn;
}

const _systemColors = ['#2b7a8c', '#7a4fa3', '#a3622b', '#4f5fa3', '#6b7a2b', '#a8436b'];
String _lower(String s) => s.trim().toLowerCase();

/// The item a requirement names ("Skill: Fire Lance"), in the same blueprint: the group is matched as the blueprint's
/// rules match it.
SysItem? _namedItem(SystemBlueprint system, String group, String name) {
  final wanted = _lower(group);
  final found = system.groupList.where((g) => groupNamed(g, wanted)).firstOrNull;
  return found == null
      ? null
      : system.items.where((i) => i.groupId == found.id && _lower(i.name) == _lower(name)).firstOrNull;
}

List<({String group, String name})> _holdsIn(FNode node) => switch (node) {
  HoldsNode(:final group, :final name) => [(group: group, name: name)],
  UnaryNode(:final operand) => _holdsIn(operand),
  BinaryNode(:final left, :final right) => [..._holdsIn(left), ..._holdsIn(right)],
  CallNode(:final args) => [for (final a in args) ..._holdsIn(a)],
  _ => const [],
};

/// Everything the ability paths are drawn from. Abilities are: every item of every system blueprint; every codex
/// record of a kind set to be shown in the ability tree; and any other record (never a character) at an end of a path
/// the author recorded.
AbilityTree abilityTree(StoryModel model, [List<ProgressSnapshot> snapshots = const []]) {
  final connections = deriveConnections(model).connections;
  final nodes = <String, AbilityNode>{};
  final systemIndex = {for (final (i, id) in model.systems.keys.indexed) id: i};
  bool eligible(EntityRef ref) => switch (ref.type) {
    EntityType.ability => model.abilities.containsKey(ref.id),
    EntityType.entry => (model.entries[ref.id]?.category ?? 'character') != 'character',
    _ => false,
  };

  void add(EntityRef ref) {
    final key = keyOf(ref);
    if (nodes.containsKey(key) || !eligible(ref)) return;
    if (ref.type == EntityType.ability) {
      final record = model.abilities[ref.id]!;
      final system = record.system;
      final item = record.item;
      final variables = {for (final v in system.variables) v.key: v.name};
      final limits = [
        for (final c in item.costs)
          if (c.amount.trim().isNotEmpty) 'Costs ${c.amount} ${variables[c.target] ?? c.target}',
        if (item.cooldown.trim().isNotEmpty) 'Cooldown ${item.cooldown.trim()}',
      ];
      final rank = system.rankName(item);
      nodes[key] = AbilityNode(
        key: key,
        ref: ref,
        name: item.name,
        source: '${system.name}${record.group.isNotEmpty ? ' · ${record.group}' : ''}',
        sourceKey: 'system:${system.id}',
        color: _systemColors[(systemIndex[system.id] ?? 0) % _systemColors.length],
        rank: rank.isEmpty ? null : rank,
        requires: item.requires.trim(),
        limits: limits,
      );
    } else {
      final entry = model.entries[ref.id]!;
      final category = model.categories[entry.category];
      final rankDef = category == null ? null : fieldOf(category, Slot.rank, category.uses['rank']);
      final rankValue = rankDef == null
          ? ''
          : displayValue(
              rankDef.type,
              entry.fields.where((f) => f.defId == rankDef.id).firstOrNull?.value ?? '',
              (_) => null,
            );
      nodes[key] = AbilityNode(
        key: key,
        ref: ref,
        name: entry.name,
        source: category?.name ?? 'Codex',
        sourceKey: 'kind:${entry.category}',
        color: category?.color ?? '#5c6370',
        rank: rankValue.isEmpty ? null : rankValue,
        requires: '',
        limits: const [],
      );
    }
  }

  for (final id in model.abilities.keys) {
    add(EntityRef(EntityType.ability, id));
  }
  for (final entry in model.entries.values) {
    if (model.categories[entry.category]?.uses['tree'] == true) add(EntityRef(EntityType.entry, entry.id));
  }
  bool isPath(Connection c) => c.kind == ConnectionKind.link && pathTypes.containsKey(connectionType(c.type).key);
  final notDrawn = <({Connection connection, String reason})>[];
  for (final c in connections.where(isPath)) {
    final bad = [c.from, c.to].where((end) => !eligible(end)).firstOrNull;
    if (bad == null) {
      add(c.from);
      add(c.to);
    } else {
      notDrawn.add((
        connection: c,
        reason: bad.type == EntityType.entry
            ? 'one end is a character: who holds what is read from sheets and progression, not drawn as a path'
            : 'one end is not an ability, skill, item or the like',
      ));
    }
  }

  // Paths between two abilities: recorded connections, fields, and a blueprint's branches.
  final edges = <PathEdge>[];
  for (final c in connections) {
    final a = keyOf(c.from), b = keyOf(c.to);
    if (!nodes.containsKey(a) || !nodes.containsKey(b)) continue;
    if (c.kind == ConnectionKind.link) {
      final role = pathTypes[connectionType(c.type).key] ?? PathRole.other;
      edges.add(
        PathEdge(
          c.id,
          a,
          b,
          role,
          c.label.isNotEmpty ? c.label : connectionType(c.type).label,
          role == PathRole.exclusive ? false : (role == PathRole.other ? c.directed : true),
          c.source.id,
        ),
      );
    } else if (c.kind == ConnectionKind.branchesFrom) {
      edges.add(PathEdge(c.id, b, a, PathRole.branch, 'Branches into', true, null));
    } else if (c.kind == ConnectionKind.field) {
      edges.add(PathEdge(c.id, a, b, PathRole.other, c.label, true, null));
    }
  }
  // A blueprint item's requirement rule, where it names another of the blueprint's items.
  for (final node in nodes.values) {
    if (node.ref.type != EntityType.ability || node.requires.isEmpty) continue;
    final system = model.abilities[node.ref.id]!.system;
    final FNode tree;
    try {
      tree = parseFormula(node.requires);
    } on Object {
      continue;
    }
    for (final (:group, :name) in _holdsIn(tree)) {
      final item = _namedItem(system, group, name);
      final from = item == null ? null : 'ability:${system.id}/${item.id}';
      if (from != null &&
          nodes.containsKey(from) &&
          !edges.any((e) => e.role == PathRole.rule && e.from == from && e.to == node.key)) {
        edges.add(
          PathEdge('rule:$from>${node.key}', from, node.key, PathRole.rule, 'Named in the requirement of', true, null),
        );
      }
    }
  }

  // Who holds each, and when it was gained: system sheets, the latest snapshot, and the progression change by change.
  String nameOf(String id) => model.entries[id]?.name ?? 'Someone deleted';
  void hold(String key, Holder holder) {
    final node = nodes[key];
    if (node != null && !node.holders.any((h) => h.id == holder.id)) node.holders.add(holder);
  }

  for (final sheet in model.sheets) {
    for (final itemId in sheet.itemIds) {
      hold('ability:${sheet.systemId}/$itemId', (
        id: sheet.entryId,
        name: nameOf(sheet.entryId),
        how: 'on their system sheet',
      ));
    }
  }
  final documents = [...model.nodes.values];
  for (final entryId in {for (final s in snapshots) s.entryId}) {
    if (!model.entries.containsKey(entryId)) continue;
    final ordered = inStoryOrder(snapshots, documents, entryId);
    final firsts = <String, ProgressSnapshot>{};
    for (final snap in ordered) {
      for (final MapEntry(key: systemId, value: state) in snap.systems.entries) {
        for (final itemId in state.itemIds) {
          firsts.putIfAbsent('$systemId/$itemId', () => snap);
        }
      }
    }
    for (final MapEntry(key: id, value: snap) in firsts.entries) {
      nodes['ability:$id']?.acquired.add((
        entryId: entryId,
        name: nameOf(entryId),
        action: 'snapshot',
        when: 'first in a snapshot at ${placeOfSnapshot(snap, documents)}',
        changeId: null,
        snapshotId: snap.id,
      ));
    }
    final latest = ordered.lastOrNull;
    for (final MapEntry(key: systemId, value: state) in (latest?.systems ?? const <String, SnapshotSystem>{}).entries) {
      for (final itemId in state.itemIds) {
        hold('ability:$systemId/$itemId', (
          id: entryId,
          name: nameOf(entryId),
          how: 'in their latest snapshot (${placeOfSnapshot(latest!, documents)})',
        ));
      }
    }
  }
  String? keyOfChange(ProgressChange c) =>
      c.abilityId != null ? 'ability:${c.abilityId}' : (c.refId != null ? 'entry:${c.refId}' : null);
  final changed = <String>{
    for (final c in model.progress)
      if (keyOfChange(c) case final k? when nodes.containsKey(k)) c.entryId,
  };
  for (final entryId in changed) {
    if (!model.entries.containsKey(entryId)) continue;
    for (final change in inOrder(model, entryId)) {
      final key = keyOfChange(change);
      if (key != null && nodes.containsKey(key)) {
        nodes[key]!.acquired.add((
          entryId: entryId,
          name: nameOf(entryId),
          action: change.action == 'lose' ? 'lose' : (change.action == 'happen' ? 'happen' : 'gain'),
          when: whenWords(change.at, model),
          changeId: change.id,
          snapshotId: null,
        ));
      }
    }
    for (final state in progressAt(model, entryId, null).categories) {
      if (state.category.shape != 'held') continue;
      for (final line in state.lines) {
        final key = keyOfChange(line.change);
        if (key != null) hold(key, (id: entryId, name: nameOf(entryId), how: 'as of the end, by their progression'));
      }
    }
  }
  for (final node in nodes.values) {
    final sorted = stableSorted(node.holders, (a, b) => localeCompare(a.name, b.name));
    node.holders
      ..clear()
      ..addAll(sorted);
  }
  return AbilityTree(
    stableSorted(nodes.values, (a, b) {
      final s = localeCompare(a.source, b.source);
      return s != 0 ? s : localeCompare(a.name, b.name);
    }),
    edges,
    notDrawn,
  );
}

// ---------------------------------------------------------------------------------------------------- what does not add up

enum ProblemKind { cycle, conflict, unreachable, rule, loop, fusion, holder }

class PathProblem {
  PathProblem(this.key, this.kind, this.severity, this.message, this.nodes);
  final String key;
  final ProblemKind kind;

  /// `problem` stops something from ever being gained, or cannot be read; a `note` may well be meant.
  final String severity;
  final String message;
  final List<String> nodes;
}

/// Groups of nodes that reach each other along the given edges (Tarjan), each with more than one node or a loop onto
/// itself.
List<List<String>> _cycles(List<String> keys, List<PathEdge> edges) {
  final next = {for (final k in keys) k: <String>[]};
  for (final e in edges) {
    next[e.from]?.add(e.to);
  }
  var index = 0;
  final at = <String, int>{};
  final low = <String, int>{};
  final stack = <String>[];
  final on = <String>{};
  final out = <List<String>>[];
  void visit(String v) {
    at[v] = index;
    low[v] = index++;
    stack.add(v);
    on.add(v);
    for (final w in next[v] ?? const <String>[]) {
      if (!at.containsKey(w)) {
        visit(w);
        low[v] = math.min(low[v]!, low[w]!);
      } else if (on.contains(w)) {
        low[v] = math.min(low[v]!, at[w]!);
      }
    }
    if (low[v] == at[v]) {
      final group = <String>[];
      String w;
      do {
        w = stack.removeLast();
        on.remove(w);
        group.add(w);
      } while (w != v);
      if (group.length > 1 || (next[v] ?? const []).contains(v)) out.add(group.reversed.toList());
    }
  }

  for (final k in keys) {
    if (!at.containsKey(k)) visit(k);
  }
  return out;
}

/// One way round a cycle, in names: "Fire Lance → Flame Wall → Fire Lance".
String _aroundCycle(List<String> group, List<PathEdge> edges, String Function(String key) name) {
  final inside = group.toSet();
  final path = [group.first];
  final seen = {group.first};
  for (;;) {
    final here = path.last;
    final step = edges
        .where((e) => e.from == here && inside.contains(e.to) && (!seen.contains(e.to) || e.to == group.first))
        .firstOrNull;
    if (step == null) break;
    path.add(step.to);
    if (step.to == group.first) break;
    seen.add(step.to);
  }
  return path.map(name).join(' → ');
}

/// Everything about the paths that does not add up, in words. Nothing here changes a record.
List<PathProblem> pathProblems(AbilityTree tree, StoryModel model) {
  final out = <PathProblem>[];
  final byKey = {for (final n in tree.nodes) n.key: n};
  String name(String key) => byKey[key]?.name ?? 'something deleted';
  final keys = [for (final n in tree.nodes) n.key];
  final requires = [
    for (final e in tree.edges)
      if (_requires.contains(e.role)) e,
  ];
  final alternatives = [
    for (final e in tree.edges)
      if (e.role == PathRole.alternative) e,
  ];
  final exclusive = {
    for (final e in tree.edges)
      if (e.role == PathRole.exclusive) ...['${e.from}|${e.to}', '${e.to}|${e.from}'],
  };
  String sortedKey(List<String> group) => ([...group]..sort()).join('|');

  // Requirement cycles: nothing in one can ever be gained.
  final inCycle = <String>{};
  for (final group in _cycles(keys, requires)) {
    inCycle.addAll(group);
    out.add(
      PathProblem(
        'paths|cycle|${sortedKey(group)}',
        ProblemKind.cycle,
        'problem',
        group.length == 1
            ? '${name(group.first)} requires itself, so it can never be gained.'
            : 'A cycle of requirements: ${_aroundCycle(group, requires, name)}. None of them can ever be gained while each requires the next.',
        group,
      ),
    );
  }
  // Loops of upgrades, evolutions, replacements, fusions: may be meant; a blueprint's branches may not loop.
  for (final role in ['branch', 'becomes']) {
    final along = [
      for (final e in tree.edges)
        if (role == 'branch' ? e.role == PathRole.branch : _becomes.contains(e.role) && e.role != PathRole.branch) e,
    ];
    for (final group in _cycles(keys, along)) {
      out.add(
        role == 'branch'
            ? PathProblem(
                'paths|branch-cycle|${sortedKey(group)}',
                ProblemKind.cycle,
                'problem',
                'Blueprint items branch from each other in a loop: ${_aroundCycle(group, along, name)}. Each item can branch from only one that comes before it.',
                group,
              )
            : PathProblem(
                'paths|loop|${sortedKey(group)}',
                ProblemKind.loop,
                'note',
                'A loop of upgrades, evolutions, fusions or replacements: ${_aroundCycle(group, along, name)}. It may be meant (a form taken and left again); it is said here so it is not missed.',
                group,
              ),
      );
    }
  }

  // What can be gained at all, by the requirements as recorded.
  final needs = {
    for (final k in keys)
      k: [
        for (final e in requires)
          if (e.to == k) e.from,
      ],
  };
  final either = {
    for (final k in keys)
      k: [
        for (final e in alternatives)
          if (e.to == k) e.from,
      ],
  };
  List<String> closure(String k) {
    final all = <String>{k};
    final order = [k];
    final todo = [k];
    while (todo.isNotEmpty) {
      for (final r in needs[todo.removeLast()] ?? const <String>[]) {
        if (all.add(r)) {
          order.add(r);
          todo.add(r);
        }
      }
    }
    return order;
  }

  final clash = <String, (String, String)>{};
  for (final k in keys) {
    final all = closure(k);
    for (var i = 0; i < all.length && !clash.containsKey(k); i++) {
      for (var j = i + 1; j < all.length; j++) {
        if (exclusive.contains('${all[i]}|${all[j]}')) clash[k] = (all[i], all[j]);
      }
    }
  }
  final gainable = <String>{};
  for (var changed = true; changed;) {
    changed = false;
    for (final k in keys) {
      if (gainable.contains(k) || clash.containsKey(k)) continue;
      final alts = either[k]!;
      if (needs[k]!.every(gainable.contains) && (alts.isEmpty || alts.any(gainable.contains))) {
        gainable.add(k);
        changed = true;
      }
    }
  }
  for (final k in keys) {
    if (gainable.contains(k)) continue;
    final pair = clash[k];
    if (pair != null) {
      final (a, b) = pair;
      out.add(
        PathProblem(
          'paths|conflict|$k',
          ProblemKind.conflict,
          'problem',
          a == k || b == k
              ? '${name(k)} requires ${name(a == k ? b : a)}, with which it is mutually exclusive, so it can never be gained.'
              : '${name(k)} requires both ${name(a)} and ${name(b)}, which are mutually exclusive, so it can never be gained.',
          {k, a, b}.toList(),
        ),
      );
      continue;
    }
    if (inCycle.contains(k)) continue; // said with its cycle
    final blocked = needs[k]!.where((r) => !gainable.contains(r)).firstOrNull;
    final alts = either[k]!;
    out.add(
      PathProblem(
        'paths|unreachable|$k',
        ProblemKind.unreachable,
        'problem',
        blocked != null
            ? '${name(k)} can never be gained: it requires ${name(blocked)}, which can never be gained.'
            : '${name(k)} can never be gained: none of its alternative prerequisites (${alts.map(name).join(', ')}) can be gained.',
        [
          k,
          ...(blocked != null ? [blocked] : alts),
        ],
      ),
    );
  }

  // A fusion of one thing.
  for (final k in keys) {
    final from = [
      for (final e in tree.edges)
        if (e.role == PathRole.fusion && e.to == k) e.from,
    ];
    if (from.length == 1) {
      out.add(
        PathProblem(
          'paths|fusion|$k',
          ProblemKind.fusion,
          'note',
          '${name(k)} is fused from ${name(from.first)} alone. A fusion is usually of two or more: add the others, or record it as an upgrade or evolution.',
          [k, from.first],
        ),
      );
    }
  }

  // Requirement rules that cannot be read.
  for (final node in tree.nodes) {
    if (node.ref.type != EntityType.ability || node.requires.isEmpty) continue;
    final system = model.abilities[node.ref.id]!.system;
    final check = checkFormula(system, node.requires, condition: true);
    if (!check.ok) {
      out.add(
        PathProblem(
          'paths|rule|${node.key}',
          ProblemKind.rule,
          'problem',
          '${node.name}’s requirement rule “${node.requires}” cannot be read: ${check.error}',
          [node.key],
        ),
      );
    }
  }

  // Holders: holding something without what it requires, or holding two things that exclude each other.
  bool holds(String key, String id) => byKey[key]?.holders.any((h) => h.id == id) ?? false;
  bool becomes(String from, String to) {
    final seen = {from};
    final todo = [from];
    while (todo.isNotEmpty) {
      final here = todo.removeLast();
      for (final e in tree.edges) {
        if (e.from == here && _becomes.contains(e.role) && seen.add(e.to)) todo.add(e.to);
      }
    }
    return seen.contains(to);
  }

  for (final node in tree.nodes) {
    for (final holder in node.holders) {
      for (final r in needs[node.key]!) {
        // What became this one (an evolution of it, its upgrade) is not expected to be held still.
        if (!holds(r, holder.id) && !becomes(r, node.key)) {
          out.add(
            PathProblem(
              'paths|holder|${holder.id}|${node.key}|$r',
              ProblemKind.holder,
              'note',
              '${holder.name} holds ${node.name} without ${name(r)}, which it requires.',
              [node.key, r],
            ),
          );
        }
      }
      final alts = either[node.key]!;
      if (alts.isNotEmpty && !alts.any((a) => holds(a, holder.id) || becomes(a, node.key))) {
        out.add(
          PathProblem(
            'paths|holder|${holder.id}|${node.key}|alternatives',
            ProblemKind.holder,
            'note',
            '${holder.name} holds ${node.name} without any of its alternative prerequisites (${alts.map(name).join(', ')}).',
            [node.key, ...alts],
          ),
        );
      }
    }
  }
  for (final e in tree.edges.where((x) => x.role == PathRole.exclusive)) {
    for (final holder in byKey[e.from]?.holders ?? const <Holder>[]) {
      if (holds(e.to, holder.id)) {
        out.add(
          PathProblem(
            'paths|holder|${holder.id}|${e.id}',
            ProblemKind.holder,
            'note',
            '${holder.name} holds both ${name(e.from)} and ${name(e.to)}, which are mutually exclusive.',
            [e.from, e.to],
          ),
        );
      }
    }
  }
  return stableSorted(out, (a, b) {
    final k = a.kind.index.compareTo(b.kind.index);
    return k != 0 ? k : localeCompare(a.message, b.message);
  });
}

// ---------------------------------------------------------------------------------------------------- the tree's shape

const pathColumn = 190.0;
const pathRow = 120.0;

class TreeLayout {
  TreeLayout(this.at, this.back, this.width, this.height);
  final Map<String, ({double x, double y, int layer})> at;

  /// Paths that run against the layers (part of a loop): drawn, but bent back.
  final Set<String> back;
  final double width;
  final double height;
}

/// Layers from the top: each ability one layer below the furthest of those its forward paths come from (a loop is
/// broken where it closes, and that path is drawn bending back). Within a layer, each sits near what it is joined to
/// (a few passes of the barycentre method). The same records give the same layout every time.
TreeLayout treeLayout(List<String> keys, List<PathEdge> edges) {
  final order = [...keys]..sort();
  final known = order.toSet();
  final forward = stableSorted(
    edges.where((e) => _forward.contains(e.role) && known.contains(e.from) && known.contains(e.to) && e.from != e.to),
    (a, b) => localeCompare(a.id, b.id),
  );
  final next = {for (final k in order) k: <PathEdge>[]};
  for (final e in forward) {
    next[e.from]!.add(e);
  }
  // Break loops where they close: a depth-first walk, from those nothing leads into first.
  final back = <String>{};
  final state = <String, String>{};
  void walk(String k) {
    state[k] = 'open';
    for (final e in next[k]!) {
      if (state[e.to] == 'open') {
        back.add(e.id);
      } else if (!state.containsKey(e.to)) {
        walk(e.to);
      }
    }
    state[k] = 'done';
  }

  final into = {for (final e in forward) e.to};
  for (final k in [...order.where((k) => !into.contains(k)), ...order]) {
    if (!state.containsKey(k)) walk(k);
  }
  final dag = [
    for (final e in forward)
      if (!back.contains(e.id)) e,
  ];
  // Longest path from the top.
  final layer = {for (final k in order) k: 0};
  for (var i = 0; i < order.length; i++) {
    var moved = false;
    for (final e in dag) {
      if (layer[e.to]! < layer[e.from]! + 1) {
        layer[e.to] = layer[e.from]! + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  final depth = order.isEmpty ? 0 : order.map((k) => layer[k]!).reduce(math.max) + 1;
  final layers = [for (var i = 0; i < depth; i++) <String>[]];
  for (final k in order) {
    layers[layer[k]!].add(k);
  }
  // Near what each is joined to.
  final joined = {for (final k in order) k: <String>[]};
  for (final e in dag) {
    joined[e.from]!.add(e.to);
    joined[e.to]!.add(e.from);
  }
  final position = <String, int>{};
  void place() {
    for (final l in layers) {
      for (final (i, k) in l.indexed) {
        position[k] = i;
      }
    }
  }

  place();
  for (var pass = 0; pass < 4; pass++) {
    final sweep = pass.isEven ? layers.skip(1).toList() : layers.take(math.max(0, layers.length - 1)).toList().reversed;
    for (final l in sweep) {
      double centre(String k) {
        final near = [
          for (final o in joined[k]!)
            if ((layer[o]! - layer[k]!).abs() == 1) o,
        ];
        return near.isEmpty ? position[k]!.toDouble() : near.fold(0.0, (s, o) => s + position[o]!) / near.length;
      }

      l.sort((a, b) {
        final c = centre(a).compareTo(centre(b));
        return c != 0 ? c : localeCompare(a, b);
      });
      place();
    }
  }
  final widest = math.max(1, layers.fold(0, (m, l) => math.max(m, l.length)));
  final at = <String, ({double x, double y, int layer})>{};
  for (final (li, l) in layers.indexed) {
    for (final (i, k) in l.indexed) {
      at[k] = (x: (i - (l.length - 1) / 2) * pathColumn + ((widest - 1) / 2) * pathColumn, y: li * pathRow, layer: li);
    }
  }
  return TreeLayout(at, back, widest * pathColumn, layers.length * pathRow);
}

/// Everything one ability is joined to along its paths, both ways and as far as they go: what leads to it, what it
/// leads to, what it excludes.
Set<String> pathsOf(AbilityTree tree, String key) {
  final seen = {key};
  for (final down in [false, true]) {
    final todo = [key];
    while (todo.isNotEmpty) {
      final here = todo.removeLast();
      for (final e in tree.edges) {
        if (e.role == PathRole.exclusive || e.role == PathRole.other) continue;
        final (a, b) = down ? (e.from, e.to) : (e.to, e.from);
        if (a == here && seen.add(b)) todo.add(b);
      }
    }
  }
  for (final e in tree.edges) {
    if ((e.role == PathRole.exclusive || e.role == PathRole.other) && (e.from == key || e.to == key)) {
      seen
        ..add(e.from)
        ..add(e.to);
    }
  }
  return seen;
}

/// The story nodes, for [inStoryOrder] and the like.
List<StoryNode> documentsOf(StoryModel model) => [...model.nodes.values];

// ---------------------------------------------------------------------------------------------------- one character

/// Where an ability stands for one character, as the tree is seen through them.
enum Standing {
  /// They hold it.
  held('Held'),

  /// Not held, but every prerequisite recorded for it is held (or it has none), one of its alternatives is held when it
  /// has some, and nothing it excludes is held.
  available('Can be gained'),

  /// A prerequisite is not held, none of its alternatives is, or they hold something it excludes.
  locked('Locked');

  const Standing(this.label);
  final String label;
}

/// What a character holds, as of a chapter or scene ([atNodeId]; null for the end of the story): what their system
/// sheets hold (a sheet has no place in the story), what their latest snapshot by then holds, and what their
/// progression has them hold by then. The same sources the tree's holders come from; at the end, the same answer.
Set<String> heldBy(StoryModel model, List<ProgressSnapshot> snapshots, String entryId, {String? atNodeId}) {
  final keys = <String>{};
  for (final sheet in model.sheets) {
    if (sheet.entryId != entryId) continue;
    for (final itemId in sheet.itemIds) {
      keys.add('ability:${sheet.systemId}/$itemId');
    }
  }
  final documents = [...model.nodes.values];
  final snap = atNodeId == null
      ? inStoryOrder(snapshots, documents, entryId).lastOrNull
      : stateAt(snapshots, documents, entryId, atNodeId);
  for (final MapEntry(key: systemId, value: state) in (snap?.systems ?? const <String, SnapshotSystem>{}).entries) {
    for (final itemId in state.itemIds) {
      keys.add('ability:$systemId/$itemId');
    }
  }
  if (model.progress.any((c) => c.entryId == entryId)) {
    for (final state in progressAt(model, entryId, atNodeId == null ? null : Anchor.node(atNodeId)).categories) {
      if (state.category.shape != 'held') continue;
      for (final line in state.lines) {
        final c = line.change;
        final key = c.abilityId != null ? 'ability:${c.abilityId}' : (c.refId != null ? 'entry:${c.refId}' : null);
        if (key != null) keys.add(key);
      }
    }
  }
  return keys;
}

/// Where each ability of [tree] stands for someone who holds [held]. Only the paths recorded decide it: a requirement
/// rule counts for the abilities it names, not for the levels or values it may also ask for.
Map<String, Standing> standings(AbilityTree tree, Set<String> held) {
  final requires = {for (final n in tree.nodes) n.key: <String>[]};
  final alternatives = {for (final n in tree.nodes) n.key: <String>[]};
  final excludes = {for (final n in tree.nodes) n.key: <String>{}};
  for (final e in tree.edges) {
    if (_requires.contains(e.role)) requires[e.to]?.add(e.from);
    if (e.role == PathRole.alternative) alternatives[e.to]?.add(e.from);
    if (e.role == PathRole.exclusive) {
      excludes[e.from]?.add(e.to);
      excludes[e.to]?.add(e.from);
    }
  }
  return {
    for (final n in tree.nodes)
      n.key: held.contains(n.key)
          ? Standing.held
          : (requires[n.key]!.every(held.contains) &&
                (alternatives[n.key]!.isEmpty || alternatives[n.key]!.any(held.contains)) &&
                !excludes[n.key]!.any(held.contains))
          ? Standing.available
          : Standing.locked,
  };
}

/// Why an ability is locked for someone who holds [held], in words: what is missing, or what excludes it.
String lockedBecause(AbilityTree tree, String key, Set<String> held, String Function(String key) name) {
  final missing = [
    for (final e in tree.edges)
      if (e.to == key && _requires.contains(e.role) && !held.contains(e.from)) name(e.from),
  ];
  final alternatives = [
    for (final e in tree.edges)
      if (e.to == key && e.role == PathRole.alternative) e.from,
  ];
  final excluded = [
    for (final e in tree.edges)
      if (e.role == PathRole.exclusive && (e.from == key || e.to == key))
        if (e.from == key ? e.to : e.from case final other when held.contains(other)) name(other),
  ];
  return [
    if (missing.isNotEmpty) 'Needs ${missing.join(', ')}.',
    if (alternatives.isNotEmpty && !alternatives.any(held.contains))
      'Needs one of ${alternatives.map(name).join(', ')}.',
    if (excluded.isNotEmpty) 'Excluded by ${excluded.join(', ')}, which is held.',
  ].join(' ');
}
