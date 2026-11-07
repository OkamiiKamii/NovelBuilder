import '../ids.dart';
import '../json.dart';
import '../json_record.dart';
import '../text/fold.dart' show foldText;

/// One class, skill, title, power… inside a blueprint. Everything except the name is optional; no RPG rules are
/// assumed. It is an ability record named `<systemId>/<itemId>`.
class SysItem {
  SysItem(JsonMap raw) : raw = freezeMap(raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get groupId => str(raw['groupId']);
  String get name => str(raw['name']);

  /// What it branches from or evolves out of, within the same blueprint.
  String? get parentId => idOrNull(raw['parentId']);

  /// One of the blueprint's ranks, by id, so renaming the rank keeps the item on it.
  String? get rankId => idOrNull(raw['rankId']);
  String get description => str(raw['description']);

  /// A condition: `Class: Void Mage AND level >= 50`.
  String get requires => str(raw['requires']);
  List<SysModifier> get modifiers => [for (final m in maps(raw['modifiers'])) SysModifier(m)];
  List<SysCost> get costs => [for (final c in maps(raw['costs'])) SysCost(c)];
  String get cooldown => str(raw['cooldown']);

  /// Element, school, affinity, origin: whatever the author sorts by.
  String get affinity => str(raw['affinity']);

  /// When and into what it evolves, in words or as a condition.
  String get evolution => str(raw['evolution']);
}

/// What a held item does to a variable: adds to it, multiplies it, or sets it. The value is a number or a formula.
class SysModifier {
  SysModifier(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);

  /// Key of the variable it changes.
  String get target => str(raw['target']);

  /// `add`, `multiply` or `set`.
  String get op => str(raw['op'], 'add');
  String get value => str(raw['value']);
}

/// What using an item spends: an amount (a number or a formula) of a variable, by key.
class SysCost {
  SysCost(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get target => str(raw['target']);
  String get amount => str(raw['amount']);
}

/// A named value: an attribute, a resource pool, a formula worked out from others, or one of a list of labels.
class SysVariable {
  SysVariable(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);

  /// How formulas refer to it. Stays the same when the name is changed, so formulas keep working.
  String get key => str(raw['key']);

  /// `number` (an attribute), `resource`, `derived` (a formula) or `choice`.
  String get kind => str(raw['kind'], 'number');
  String get unit => str(raw['unit']);
  double get base => (numOrNull(raw['base']) ?? 0).toDouble();
  String get formula => str(raw['formula']);
  List<String> get options => strings(raw['options']);
  String get note => str(raw['note']);
}

/// A step on a ladder of named stages: a realm, a rank, a tier.
class SysStage {
  SysStage(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);

  /// A condition for reaching it: `qi >= 1000 AND Item: Foundation Pill`.
  String get requires => str(raw['requires']);
  String get note => str(raw['note']);
}

/// A way of advancing: numbered levels with a curve, or named stages in order.
class SysTrack {
  SysTrack(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);
  String get key => str(raw['key']);

  /// `levels` or `stages`.
  String get kind => raw['kind'] == 'stages' ? 'stages' : 'levels';
  int get cap => (numOrNull(raw['cap']) ?? 0).toInt();

  /// What it takes to go from one level to the next, as a formula of this track's key.
  String get curve => str(raw['curve']);
  String get curveUnit => str(raw['curveUnit']);

  /// Points to place on attributes that each level after the first brings.
  double get points => (numOrNull(raw['points']) ?? 0).toDouble();

  /// What experience comes from, in the author's words. Offered when logging; never enforced.
  List<String> get sources => strings(raw['sources']);
  List<SysStage> get stages => [for (final s in maps(raw['stages'])) SysStage(s)];
}

/// A kind of thing a profile can hold: "Classes", "Skills", "Titles". [single]: one at a time (a class).
class SysGroup {
  SysGroup(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);
  bool get single => raw['single'] == true;
}

/// A grid of free text: an elemental interaction chart, an affix table. Cells are keyed `rowId|columnId`.
class SysMatrix {
  SysMatrix(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get name => str(raw['name']);
  List<({String id, String name})> get rows => [
    for (final r in maps(raw['rows'])) (id: str(r['id']), name: str(r['name'])),
  ];
  List<({String id, String name})> get columns => [
    for (final c in maps(raw['columns'])) (id: str(c['id']), name: str(c['name'])),
  ];
  Map<String, String> get cells => {
    for (final e in (mapOrNull(raw['cells']) ?? const {}).entries)
      if (e.value is String) e.key: e.value! as String,
  };
}

/// A fictional system: the author's own variables, tracks, ranks, groups ("Classes", "Mutations"…), items and tables.
class SystemBlueprint extends JsonRecord {
  SystemBlueprint(super.raw);

  String get name => str(raw['name']);
  List<({String id, String name})> get groups => [
    for (final g in maps(raw['groups'])) (id: str(g['id']), name: str(g['name'])),
  ];
  List<({String id, String name})> get ranks => [
    for (final r in maps(raw['ranks'])) (id: str(r['id']), name: str(r['name'])),
  ];
  List<SysItem> get items => [for (final i in maps(raw['items'])) SysItem(i)];
  String get description => str(raw['description']);
  List<SysVariable> get variables => [for (final v in maps(raw['variables'])) SysVariable(v)];
  List<SysTrack> get tracks => [for (final t in maps(raw['tracks'])) SysTrack(t)];
  List<SysGroup> get groupList => [for (final g in maps(raw['groups'])) SysGroup(g)];
  List<SysMatrix> get matrices => [for (final m in maps(raw['matrices'])) SysMatrix(m)];
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;

  /// The name of an item's rank as it is now; empty when it has none.
  String rankName(SysItem item) =>
      item.rankId == null ? '' : (ranks.where((r) => r.id == item.rankId).firstOrNull?.name ?? '');

  SystemBlueprint withFields(JsonMap changes) => SystemBlueprint(merged(changes));
}

/// A codex entry's place in a system: its own values, progress, and the items it holds (by id).
class SystemSheet extends JsonRecord {
  SystemSheet(super.raw);

  String get systemId => str(raw['systemId']);
  String get entryId => str(raw['entryId']);
  List<String> get itemIds => strings(raw['itemIds']);

  /// This entry's own value for a variable, by variable id: a number or a label.
  Map<String, Object> get values => _numbersOrLabels(raw['values']);

  /// Where it stands on each track, by track id: a level number, or a stage id.
  Map<String, Object> get progress => _numbersOrLabels(raw['progress']);

  /// Experience logged against numbered-level tracks.
  List<XpEntry> get xp => [for (final e in maps(raw['xp'])) XpEntry(e)];

  /// Points placed on attributes, by variable id.
  Map<String, double> get spent => {
    for (final e in (mapOrNull(raw['spent']) ?? const {}).entries)
      if (e.value is num && (e.value! as num).isFinite) e.key: (e.value! as num).toDouble(),
  };
  String get note => str(raw['note']);
}

Map<String, Object> _numbersOrLabels(Object? value) => {
  for (final e in (mapOrNull(value) ?? const {}).entries)
    if (e.value is String)
      e.key: e.value! as String
    else if (e.value is num && (e.value! as num).isFinite)
      e.key: (e.value! as num).toDouble(),
};

/// Experience gained (or lost) at a point in the story.
class XpEntry {
  XpEntry(this.raw);
  final JsonMap raw;
  String get id => str(raw['id']);
  String get trackId => str(raw['trackId']);

  /// Negative for a loss.
  double get amount => (numOrNull(raw['amount']) ?? double.nan).toDouble();
  String get source => str(raw['source']);

  /// The chapter or scene it was earned in. Null: before the story.
  String? get nodeId => idOrNull(raw['nodeId']);
  String get note => str(raw['note']);
}

/// Turns a name into something a formula can use: "Max Health" becomes `max_health`.
String toFormulaKey(String name) {
  // As NFKD would: the common ligatures come apart.
  const ligatures = {'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st'};
  final key = foldText(name.split('').map((c) => ligatures[c] ?? c).join())
      .replaceAll(RegExp(r'\p{M}+', unicode: true), '')
      .replaceAll(RegExp(r'[^\p{L}\p{N}]+', unicode: true), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');
  return key.isEmpty ? 'value' : key;
}

/// NAMES ARE NOT LINKS: brings a blueprint from the original app's earlier shape (ranks and table rows/columns linked
/// by name) to the one linked by id. A port of `systems/shape.ts` `upgradeShape`.
///
/// It changes nothing else and drops nothing: a rank an item names that is not in the list is added; a cell whose
/// names match no row or column keeps its old key; values that are not records pass through. Safe to run twice.
JsonMap upgradeBlueprintShape(JsonMap content, {String Function() createId = newId}) {
  List<JsonMap> named(Object? value) {
    final seen = <String>{};
    final out = <JsonMap>[];
    for (final x in listOf(value)) {
      final name = (x is String ? x : str(mapOrNull(x)?['name'])).trim();
      if (name.isEmpty) continue;
      var id = x is String ? '' : str(mapOrNull(x)?['id']);
      if (id.isEmpty || seen.contains(id)) id = createId();
      seen.add(id);
      // Whatever else a named thing holds, known to this version or not, is kept.
      out.add(x is String ? {'id': id, 'name': name} : {...mapOrNull(x)!, 'id': id, 'name': name});
    }
    return out;
  }

  final ranks = named(content['ranks']);
  final rankByName = {for (final r in ranks) r['name']! as String: r['id']! as String};
  final rankIds = {for (final r in ranks) r['id']! as String};
  final items = [
    for (final raw in listOf(content['items']))
      if (raw is! Map)
        raw
      else
        () {
          final item = Map<String, Object?>.of(raw.cast<String, Object?>());
          final rank = item.remove('rank');
          final current = item['rankId'];
          if (current is String && rankIds.contains(current)) return item;
          final label = str(rank).trim();
          if (label.isEmpty) return {...item, 'rankId': null};
          if (!rankByName.containsKey(label)) {
            final added = {'id': createId(), 'name': label};
            ranks.add(added);
            rankByName[label] = added['id']!;
            rankIds.add(added['id']!);
          }
          return {...item, 'rankId': rankByName[label]};
        }(),
  ];
  final matrices = [
    for (final raw in listOf(content['matrices']))
      if (raw is! Map)
        raw
      else
        () {
          final m = raw.cast<String, Object?>();
          final rows = named(m['rows']);
          final columns = named(m['columns']);
          final rowIds = {for (final r in rows) r['id']};
          final columnIds = {for (final c in columns) c['id']};
          final cells = <String, Object?>{};
          for (final e in (mapOrNull(m['cells']) ?? const {}).entries) {
            final key = e.key;
            final value = e.value;
            // A value that is not text is kept under its own key.
            if (value is! String) {
              cells[key] = value;
              continue;
            }
            final bar = key.indexOf('|');
            final a = bar < 0 ? '' : key.substring(0, bar);
            final b = key.substring(bar + 1);
            if (rowIds.contains(a) && columnIds.contains(b)) {
              cells[key] = value;
              continue;
            }
            // Keyed by names: the row whose name starts the key, and the column whose name is the rest.
            final row = rows
                .where(
                  (r) =>
                      key.startsWith('${r['name']}|') &&
                      columns.any((c) => c['name'] == key.substring((r['name']! as String).length + 1)),
                )
                .firstOrNull;
            final column = row == null
                ? null
                : columns.where((c) => c['name'] == key.substring((row['name']! as String).length + 1)).firstOrNull;
            cells[row != null && column != null ? '${row['id']}|${column['id']}' : key] = value;
          }
          return {...m, 'rows': rows, 'columns': columns, 'cells': cells};
        }(),
  ];
  return {...content, 'ranks': ranks, 'items': items, 'matrices': matrices};
}
