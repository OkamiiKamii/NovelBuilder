import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../collation.dart';
import '../json.dart';
import '../json_record.dart';
import '../model/story_order.dart';
import '../records/story_node.dart';
import '../records/system.dart';
import '../stable_sort.dart';
import '../systems/compute.dart';
import '../systems/formula.dart' show formatNumber;

/// SNAPSHOTS (as in the original app): a character's whole state at one point in the story, complete in itself, so
/// reading the state at a chapter never replays history and editing one snapshot never alters another.

const statusDimensions = ['condition', 'transformations', 'reputation', 'knowledge', 'goals'];
const dimensionLabels = {
  'condition': 'Physical condition & injuries',
  'transformations': 'Active transformations',
  'reputation': 'Reputation & standing',
  'knowledge': 'Knowledge & secrets known',
  'goals': 'Personal goals',
};
const dimensionHints = {
  'condition': 'Broken left arm\nExhausted',
  'transformations': 'Wolf form (until dawn)',
  'reputation': 'Ash Guild: trusted\nThe Crown: wanted',
  'knowledge': 'Knows the prince is alive',
  'goals': 'Find her brother',
};

/// How gear is held: only suggestions.
const gearKinds = ['Equipped', 'Weapon', 'Bound artifact', 'Key item', 'Carried'];

Map<String, Object> _numbersOrLabels(Object? value) => {
  for (final e in (mapOrNull(value) ?? const {}).entries)
    if (e.value is String)
      e.key: e.value! as String
    else if (e.value is num && (e.value! as num).isFinite)
      e.key: (e.value! as num).toDouble(),
};

/// A character's standing in one system at one point. [auto] is the author's choice of whether the blueprint's
/// formulas and class effects are applied at all; [overrides] holds any value the author set by hand, which always
/// wins and is never rewritten.
class SnapshotSystem {
  SnapshotSystem(this.raw);
  final JsonMap raw;
  bool get auto => raw['auto'] != false;
  Map<String, Object> get values => _numbersOrLabels(raw['values']);
  Map<String, Object> get progress => _numbersOrLabels(raw['progress']);
  List<String> get itemIds => strings(raw['itemIds']);
  Map<String, Object> get overrides => _numbersOrLabels(raw['overrides']);
}

/// Something the character has at this point. May point at an item in the codex; never changes it.
class GearItem {
  GearItem(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);
  String get kind => str(raw['kind']);
  String? get entryId => idOrNull(raw['entryId']);
  String get note => str(raw['note']);
}

class ProgressSnapshot extends JsonRecord {
  ProgressSnapshot(super.raw);
  String get entryId => str(raw['entryId']);

  /// The chapter or scene it is true from. Null: before the story begins.
  String? get nodeId => idOrNull(raw['nodeId']);
  String get label => str(raw['label']);
  Map<String, SnapshotSystem> get systems => {
    for (final e in (mapOrNull(raw['systems']) ?? const {}).entries)
      if (mapOrNull(e.value) case final m?) e.key: SnapshotSystem(m),
  };
  List<GearItem> get gear => [for (final g in maps(raw['gear'])) GearItem(g)];
  String status(String dimension) => str(mapOrNull(raw['status'])?[dimension]);
  String get notes => str(raw['notes']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;
}

/// Snapshots of one entry in story order: "before the story" first, then by chapter; within a chapter, in the order
/// they were logged. One whose chapter was deleted is kept, after everything that still has a place.
List<ProgressSnapshot> inStoryOrder(List<ProgressSnapshot> snapshots, List<StoryNode> nodes, String entryId) {
  final position = StoryOrder.of(nodes).position;
  num at(ProgressSnapshot s) => s.nodeId == null ? -1 : (position[s.nodeId] ?? 9007199254740991);
  return stableSorted(snapshots.where((s) => s.entryId == entryId), (a, b) {
    final p = at(a).compareTo(at(b));
    if (p != 0) return p;
    final c = a.createdAt.compareTo(b.createdAt);
    return c != 0 ? c : localeCompare(a.id, b.id);
  });
}

/// The state valid at a point in the manuscript: the latest snapshot at or before that chapter or scene. [nodeId] null
/// asks for the end of the story. Null when nothing has been logged by then.
ProgressSnapshot? stateAt(List<ProgressSnapshot> snapshots, List<StoryNode> nodes, String entryId, String? nodeId) {
  final position = StoryOrder.of(nodes).position;
  final ordered = [
    for (final s in inStoryOrder(snapshots, nodes, entryId))
      if (s.nodeId == null || position.containsKey(s.nodeId)) s,
  ];
  if (nodeId == null) return ordered.lastOrNull;
  final limit = position[nodeId];
  if (limit == null) return null;
  return ordered.where((s) => s.nodeId == null || position[s.nodeId]! <= limit).lastOrNull;
}

/// "Before the story", the chapter's title, or what became of it.
String placeOfSnapshot(ProgressSnapshot s, List<StoryNode> nodes) => s.nodeId == null
    ? 'Before the story'
    : (nodes.where((n) => n.id == s.nodeId).firstOrNull?.title ?? 'A chapter that was removed');

class StateRow {
  StateRow(this.variable, this.value, this.display, this.byHand, this.systemSays, this.sources, this.error);
  final SysVariable variable;
  final Object? value;
  final String display;

  /// The author set this by hand.
  final bool byHand;

  /// What the system works out, when the author's value differs from it.
  final String? systemSays;
  final List<String> sources;
  final String? error;
}

class SystemState {
  SystemState(this.system, this.auto, this.rows, this.tracks, this.items, this.available);
  final SystemBlueprint system;
  final bool auto;
  final List<StateRow> rows;
  final List<SheetTrack> tracks;
  final List<SheetItem> items;

  /// With the calculator on: things not held whose requirement is now met.
  final List<SysItem> available;
}

String _show(SysVariable variable, Object? value) => value == null || value == ''
    ? '—'
    : '${value is double ? formatNumber(value) : value}${variable.unit.isNotEmpty && value is double ? ' ${variable.unit}' : ''}';

/// AUTHOR PRIMACY & MANUAL OVERRIDE RULE: works out what a snapshot says about one system. With the calculator on, the
/// blueprint's formulas and class effects are applied, and any value the author set by hand replaces the worked-out
/// one (and is what other formulas then read). With it off, nothing is worked out: every value is what the author
/// entered.
SystemState resolveSystem(SystemBlueprint system, [SnapshotSystem? snapshot]) {
  final snap = snapshot ?? SnapshotSystem(const {});
  final profile = SheetProfile(values: snap.values, progress: snap.progress, itemIds: snap.itemIds);
  final plain = computeSheet(system, profile);
  final overrides = snap.overrides;
  Object? set(SysVariable v) {
    final value = overrides[v.id];
    return v.kind == 'choice' ? (value is String ? value : null) : (value is double && value.isFinite ? value : null);
  }

  if (!snap.auto) {
    final rows = [
      for (final v in system.variables)
        () {
          final own = snap.values[v.id];
          final value =
              set(v) ??
              (v.kind == 'derived'
                  ? null
                  : v.kind == 'choice'
                  ? (own is String ? own : (v.options.firstOrNull ?? ''))
                  : (own is double ? own : v.base));
          return StateRow(v, value, _show(v, value), true, null, const [], null);
        }(),
    ];
    return SystemState(
      system,
      false,
      rows,
      [for (final t in plain.tracks) t.plain()],
      [for (final i in plain.items) i.plain()],
      const [],
    );
  }
  final worked = computeSheet(
    system,
    SheetProfile(values: snap.values, progress: snap.progress, itemIds: snap.itemIds, overrides: overrides),
  );
  final rows = [
    for (final (i, row) in worked.rows.indexed)
      () {
        final byHand = set(row.variable) != null;
        return StateRow(
          row.variable,
          row.value,
          row.display,
          byHand,
          byHand && plain.rows[i].display != row.display ? plain.rows[i].display : null,
          row.sources,
          byHand ? null : row.error,
        );
      }(),
  ];
  return SystemState(system, true, rows, worked.tracks, worked.items, worked.available);
}

/// Lines of a status field: one thing per line, blanks ignored.
List<String> linesOf(String text) => [
  for (final line in text.split('\n'))
    if (line.trim().isNotEmpty) line.trim(),
];

class Comparison {
  final stats = <({String system, String name, String from, String to, double? delta})>[];
  final advancement = <({String system, String name, String from, String to})>[];
  final gained = <({String group, String name})>[];
  final lost = <({String group, String name})>[];
  final gear = <({String change, String name, String detail})>[];
  final status = <({String dimension, String label, List<String> added, List<String> removed})>[];

  /// Nothing differs between the two.
  bool get same =>
      stats.isEmpty && advancement.isEmpty && gained.isEmpty && lost.isEmpty && gear.isEmpty && status.isEmpty;
}

String _gearKey(GearItem g) => g.name.trim().toLowerCase();
String _gearDetail(GearItem g) => [g.kind.trim(), g.note.trim()].where((x) => x.isNotEmpty).join(' · ');

/// What is different between two snapshots, read from [from] to [to]: stat changes with their size, advancement,
/// abilities and titles gained or lost, gear that changed hands, and status lines that came or went.
Comparison compareSnapshots(ProgressSnapshot from, ProgressSnapshot to, List<SystemBlueprint> systems) {
  final result = Comparison();
  final fromSystems = from.systems;
  final toSystems = to.systems;
  for (final system in systems) {
    if (!fromSystems.containsKey(system.id) && !toSystems.containsKey(system.id)) continue;
    final a = resolveSystem(system, fromSystems[system.id]);
    final b = resolveSystem(system, toSystems[system.id]);
    for (final (i, row) in a.rows.indexed) {
      final next = b.rows[i];
      if (row.display == next.display) continue;
      result.stats.add((
        system: system.name,
        name: row.variable.name,
        from: row.display,
        to: next.display,
        delta: row.value is double && next.value is double ? (next.value! as double) - (row.value! as double) : null,
      ));
    }
    for (final (i, t) in a.tracks.indexed) {
      if (t.label != b.tracks[i].label) {
        result.advancement.add((system: system.name, name: t.track.name, from: t.label, to: b.tracks[i].label));
      }
    }
    final groups = system.groupList;
    String group(SysItem item) => groups.where((g) => g.id == item.groupId).firstOrNull?.name ?? system.name;
    final heldA = {for (final i in a.items) i.item.id};
    final heldB = {for (final i in b.items) i.item.id};
    for (final i in b.items) {
      if (!heldA.contains(i.item.id)) result.gained.add((group: group(i.item), name: i.item.name));
    }
    for (final i in a.items) {
      if (!heldB.contains(i.item.id)) result.lost.add((group: group(i.item), name: i.item.name));
    }
  }
  final before = {for (final g in from.gear) _gearKey(g): g};
  final after = {for (final g in to.gear) _gearKey(g): g};
  for (final MapEntry(:key, value: item) in after.entries) {
    final old = before[key];
    if (old == null) {
      result.gear.add((change: 'gained', name: item.name, detail: _gearDetail(item)));
    } else if (_gearDetail(old) != _gearDetail(item)) {
      final was = _gearDetail(old).isEmpty ? 'no details' : _gearDetail(old);
      final now = _gearDetail(item).isEmpty ? 'no details' : _gearDetail(item);
      result.gear.add((change: 'changed', name: item.name, detail: '$was → $now'));
    }
  }
  for (final MapEntry(:key, value: item) in before.entries) {
    if (!after.containsKey(key)) result.gear.add((change: 'lost', name: item.name, detail: _gearDetail(item)));
  }
  for (final d in statusDimensions) {
    final old = linesOf(from.status(d));
    final now = linesOf(to.status(d));
    Set<String> lower(List<String> lines) => {for (final l in lines) l.toLowerCase()};
    final added = [
      for (final l in now)
        if (!lower(old).contains(l.toLowerCase())) l,
    ];
    final removed = [
      for (final l in old)
        if (!lower(now).contains(l.toLowerCase())) l,
    ];
    if (added.isNotEmpty || removed.isNotEmpty) {
      result.status.add((dimension: d, label: dimensionLabels[d]!, added: added, removed: removed));
    }
  }
  return result;
}

/// Snapshots: logged, changed one at a time, removed. Nothing about their contents is judged.
class SnapshotChanges extends RecordChanges {
  SnapshotChanges(super.snapshot, {required super.now, required super.createId});

  List<ProgressSnapshot> snapshots() => [for (final r in rows('progressSnapshots')) ProgressSnapshot(r)];
  List<StoryNode> get _nodes => [for (final r in rows('chapters')) StoryNode(r)];

  String? _mine(String collection, Object? id) =>
      id is String && id.isNotEmpty && row(collection, id) != null ? id : null;

  Map<String, Object?> _record(Object? value) => {
    for (final e in (mapOrNull(value) ?? const {}).entries)
      if (e.value is String || (e.value is num && (e.value! as num).isFinite)) e.key: e.value,
  };

  /// Keeps a snapshot well formed without judging its contents.
  JsonMap _clean(Object? systems, Object? gear, Object? status) => {
    'systems': {
      for (final e in (mapOrNull(systems) ?? const {}).entries)
        if (_mine('systems', e.key) != null)
          if (mapOrNull(e.value) case final raw?)
            e.key: {
              'auto': raw['auto'] != false,
              'values': _record(raw['values']),
              'progress': _record(raw['progress']),
              'itemIds': {
                for (final id in listOf(raw['itemIds']))
                  if (id is String) id,
              }.toList(),
              'overrides': _record(raw['overrides']),
            },
    },
    'gear': [
      for (final g in maps(gear))
        if (str(g['name']).trim().isNotEmpty)
          {
            'id': str(g['id']).isNotEmpty ? g['id'] : newId(),
            'name': str(g['name']).trim(),
            'kind': str(g['kind']).trim(),
            'entryId': _mine('loreEntries', g['entryId']),
            'note': str(g['note']),
          },
    ],
    'status': {for (final d in statusDimensions) d: str(mapOrNull(status)?[d])},
  };

  /// Logs a character's state at a chapter or scene ([nodeId] null: before the story). It starts as a copy of the
  /// state valid at that point, so only what changed needs entering; with nothing logged yet, it starts from the
  /// character's system sheets.
  ProgressSnapshot createSnapshot(String entryId, {String? nodeId, String label = ''}) {
    if (_mine('loreEntries', entryId) == null) throw ChangeRefused('That codex entry is not in this novel.');
    final at = _mine('chapters', nodeId);
    final nodes = _nodes;
    final previous = stateAt(snapshots(), nodes, entryId, at);
    final position = StoryOrder.of(nodes).position;
    final limit = at == null ? -1 : (position[at] ?? 9007199254740991);
    bool reached(String? id) => id == null || (position[id] ?? 9007199254740991) <= limit;
    final blueprints = {for (final r in rows('systems')) str(r['id']): SystemBlueprint(r)};
    final fromSheets = <String, Object?>{};
    for (final r in rows('systemSheets')) {
      final sheet = SystemSheet(r);
      if (sheet.entryId != entryId) continue;
      final system = blueprints[sheet.systemId];
      if (system == null) continue;
      final settled = settle(system, SheetProfile.of(sheet), reached);
      final before = mapOrNull(previous?.raw['systems'])?[sheet.systemId];
      // With an earlier snapshot, its numbers stand; only levels with experience logged move on.
      final levels = {
        for (final t in system.tracks)
          if (t.kind == 'levels' && sheet.xp.any((e) => e.trackId == t.id)) t.id: settled.progress[t.id],
      };
      fromSheets[sheet.systemId] = mapOrNull(before) != null
          ? {
              ...mapOrNull(before)!,
              'progress': {...?mapOrNull(mapOrNull(before)!['progress']), ...levels},
            }
          : {
              'auto': true,
              'values': settled.values,
              'progress': settled.progress,
              'itemIds': settled.itemIds,
              'overrides': <String, Object?>{},
            };
    }
    final saved = {
      'id': newId(),
      'projectId': projectId,
      'entryId': entryId,
      'nodeId': at,
      'label': label.trim(),
      ..._clean(
        // Systems the character has since been put on join in with their sheet as it stands.
        {...?mapOrNull(previous?.raw['systems']), ...fromSheets},
        previous == null
            ? const []
            : [
                for (final g in previous.gear) {...g.raw, 'id': newId()},
              ],
        previous?.raw['status'] ?? const {},
      ),
      'notes': '',
      'createdAt': now,
      'updatedAt': now,
    };
    put('progressSnapshots', saved);
    return ProgressSnapshot(saved);
  }

  /// Changes one snapshot, worked out from it as stored right now. Other snapshots are never touched.
  void updateSnapshot(String snapshotId, JsonMap Function(ProgressSnapshot current) change) {
    final current = ProgressSnapshot(
      row('progressSnapshots', snapshotId) ?? (throw ChangeRefused('That snapshot is not in this novel.')),
    );
    final edit = change(current);
    final next = {...current.raw, ...edit};
    put('progressSnapshots', {
      ...current.raw,
      'nodeId': edit.containsKey('nodeId') && edit['nodeId'] != current.nodeId
          ? _mine('chapters', edit['nodeId'])
          : current.nodeId,
      'label': str(next['label']).trim(),
      'notes': str(next['notes']),
      ..._clean(next['systems'], next['gear'], next['status']),
      'updatedAt': now,
    });
  }

  void removeSnapshot(String snapshotId) {
    if (row('progressSnapshots', snapshotId) == null) throw ChangeRefused('That snapshot is not in this novel.');
    remove('progressSnapshots', snapshotId);
  }
}
