import 'dart:math' as math;

import '../codex/field_values.dart' show jsNumber;
import '../records/system.dart';
import 'formula.dart';

String _lower(String text) => text.trim().toLowerCase();

/// What a profile brings to a blueprint: its own values, where it stands on each track, what it holds, experience
/// logged, points placed, and values the author set by hand (which win over everything). With none, formulas are
/// checked against the blueprint's starting values.
class SheetProfile {
  const SheetProfile({
    this.values = const {},
    this.progress = const {},
    this.itemIds = const [],
    this.xp = const [],
    this.spent = const {},
    this.overrides = const {},
  });

  factory SheetProfile.of(SystemSheet sheet, {List<XpEntry>? xp}) => SheetProfile(
    values: sheet.values,
    progress: sheet.progress,
    itemIds: sheet.itemIds,
    xp: xp ?? sheet.xp,
    spent: sheet.spent,
  );

  final Map<String, Object> values;
  final Map<String, Object> progress;
  final List<String> itemIds;
  final List<XpEntry> xp;
  final Map<String, double> spent;

  /// Values the author has set by hand, by variable id. Other formulas that read an overridden value read the
  /// author's number.
  final Map<String, Object> overrides;

  SheetProfile withXp(List<XpEntry> xp) =>
      SheetProfile(values: values, progress: progress, itemIds: itemIds, xp: xp, spent: spent, overrides: overrides);
}

class SheetRow {
  SheetRow(this.variable, this.value, this.display, this.sources, this.error);
  final SysVariable variable;

  /// A number (double), or the chosen label. Null when it could not be worked out.
  final Object? value;
  final String display;

  /// Classes, skills and the like that changed this value.
  final List<String> sources;
  final String? error;
}

typedef SheetXp = ({double total, double into, double? needed, int gained, String progress});

class SheetTrack {
  SheetTrack(this.track, this.label, this.level, this.next, this.unmet, this.xp, this.error);
  final SysTrack track;

  /// "12 of 100", or the stage's name.
  final String label;

  /// The level reached, for numbered levels. Null for named stages.
  final int? level;

  /// What comes next and what it takes.
  final String? next;

  /// For a named stage: parts of its requirement that are not met.
  final List<String> unmet;

  /// For numbered levels with experience logged: what was earned and how far into the current level it reaches.
  final SheetXp? xp;
  final String? error;

  SheetTrack plain() => SheetTrack(track, label, level, next, const [], xp, null);
}

/// Points that levels have brought, and how many are placed on attributes. Never enforced.
typedef SheetPoints = ({String name, double earned, double spent, double unspent});

class SheetItem {
  SheetItem(this.item, this.group, this.requires, this.unmet, this.costs, this.effects, this.error);
  final SysItem item;
  final SysGroup? group;
  final String requires;
  final List<String> unmet;
  final List<({String label, String? error})> costs;
  final List<String> effects;
  final String? error;

  SheetItem plain() => SheetItem(item, group, requires, const [], costs, const [], null);
}

class ComputedSheet {
  ComputedSheet(this.rows, this.tracks, this.items, this.available, this.points);
  final List<SheetRow> rows;
  final List<SheetTrack> tracks;
  final List<SheetItem> items;

  /// Things not held whose stated requirement is now met.
  final List<SysItem> available;

  /// Null when no track of the blueprint gives points and none are placed.
  final SheetPoints? points;
}

/// Whether a variable is one that points can be placed on.
bool takesPoints(SysVariable v) => v.kind == 'number' || v.kind == 'resource';

/// "Class: Mage" also finds the group called "Classes".
bool groupNamed(SysGroup g, String wanted) {
  final name = _lower(g.name);
  return name == wanted ||
      name == '${wanted}s' ||
      name == '${wanted}es' ||
      name.replaceAll(RegExp(r'ies$'), 'y') == wanted;
}

double? _numberOf(Object? raw) => switch (raw) {
  final num n => n.toDouble(),
  final String s => jsNumber(s.trim())?.toDouble(),
  _ => null,
};

String _message(Object err) => err is FormulaError ? err.message : 'This could not be worked out.';

/// Works out everything a blueprint says about a profile. Pure: it reads the blueprint and the profile and returns
/// values; it stores nothing. This is what makes a character sheet "inherit" from the blueprint: nothing is copied
/// onto the character, so there is nothing to fall out of date.
///
/// Order: levels from logged experience; starting values, the profile's own numbers and the points placed on them;
/// then what its classes, skills and so on add, multiply or set; then formulas.
ComputedSheet computeSheet(SystemBlueprint system, [SheetProfile profile = const SheetProfile()]) {
  final variables = system.variables;
  final tracks = system.tracks;
  final groups = system.groupList;
  final allItems = system.items;
  final byKey = <String, SysVariable>{};
  for (final v in variables) {
    byKey[_lower(v.key)] = v;
  }
  final held = [
    for (final item in allItems)
      if (profile.itemIds.contains(item.id)) item,
  ];
  SysGroup? groupOf(SysItem item) => groups.where((g) => g.id == item.groupId).firstOrNull;

  // Where the profile stands on each track.
  final level = <String, int>{};
  final stage = <String, int>{};
  for (final track in tracks) {
    final raw = profile.progress[track.id];
    if (track.kind == 'levels') {
      final n = _numberOf(raw);
      final given = n == null || n.isNaN || n == 0 ? 1.0 : jsRound(n);
      final capped = track.cap > 0 ? math.min(track.cap.toDouble(), given) : given;
      level[track.id] = math.max(1, capped).toInt();
    } else {
      level[track.id] = 0;
      stage[track.id] = math.max(0, track.stages.indexWhere((s) => s.id == raw));
    }
  }

  double placed(SysVariable v) {
    final n = takesPoints(v) ? profile.spent[v.id] : null;
    return n != null && n.isFinite ? n : 0;
  }

  final values = <String, Object>{};
  final errors = <String, String>{};
  final sources = <String, List<String>>{};
  for (final v in variables) {
    if (v.kind == 'derived') continue;
    final own = profile.values[v.id];
    if (v.kind == 'choice') {
      values[_lower(v.key)] = own is String && v.options.contains(own) ? own : (v.options.firstOrNull ?? '');
    } else {
      values[_lower(v.key)] = (own is double && own.isFinite ? own : v.base) + placed(v);
    }
  }

  final computing = <String>{};
  late final FormulaScope scope;
  Object? valueOf(String name) {
    final key = _lower(name);
    final track = tracks.where((t) => _lower(t.key) == key || _lower(t.name) == key).firstOrNull;
    // A stage ladder counts from 1, so `realm >= 3` means "third stage or beyond".
    if (track != null) {
      return track.kind == 'levels'
          ? level[track.id]!.toDouble()
          : (track.stages.isNotEmpty ? (stage[track.id]! + 1).toDouble() : 0.0);
    }
    final variable = byKey[key] ?? variables.where((v) => _lower(v.name) == key).firstOrNull;
    if (variable == null) return null;
    final id = _lower(variable.key);
    if (values.containsKey(id)) return values[id];
    if (errors.containsKey(id)) throw FormulaError('“${variable.name}” could not be worked out.');
    if (computing.contains(id)) throw FormulaError('“${variable.name}” depends on itself.');
    computing.add(id);
    try {
      final result = evaluateFormula(parseFormula(variable.formula), scope);
      values[id] = result is bool ? (result ? 1.0 : 0.0) : result;
      return values[id];
    } on Object catch (err) {
      errors[id] = err is FormulaError ? err.message : 'This formula could not be worked out.';
      rethrow;
    } finally {
      computing.remove(id);
    }
  }

  scope = FormulaScope(
    value: valueOf,
    holds: (groupName, name) {
      final wanted = _lower(groupName);
      final track = tracks
          .where((t) => t.kind == 'stages' && (_lower(t.name) == wanted || _lower(t.key) == wanted))
          .firstOrNull;
      if (track != null) {
        final at = stage[track.id]!;
        final current = at < track.stages.length ? track.stages[at].name : '';
        return _lower(current) == _lower(name);
      }
      final group = groups.where((g) => groupNamed(g, wanted)).firstOrNull;
      final variable = variables
          .where((v) => v.kind == 'choice' && (_lower(v.name) == wanted || _lower(v.key) == wanted))
          .firstOrNull;
      if (variable != null) {
        final v = values[_lower(variable.key)];
        return _lower(v == null ? '' : jsString(v)) == _lower(name);
      }
      if (group == null) return null;
      return held.any((item) => item.groupId == group.id && _lower(item.name) == _lower(name));
    },
  );
  double work(String formula) {
    final result = evaluateFormula(parseFormula(formula), scope);
    if (result is String) throw FormulaError('“$formula” gives a label, not a number.');
    return result is bool ? (result ? 1 : 0) : (result as double);
  }

  // Levels bought with logged experience. Each level is paid for at the curve's price for that level, starting from
  // where the sheet says the character began.
  void forget() {
    for (final v in variables) {
      if (v.kind != 'derived') continue;
      values.remove(_lower(v.key));
      errors.remove(_lower(v.key));
    }
  }

  final earned = <String, SheetXp>{};
  final curveErrors = <String, String>{};
  for (final track in tracks) {
    final mine = [
      for (final e in profile.xp)
        if (e.trackId == track.id && e.amount.isFinite) e,
    ];
    if (track.kind != 'levels' || mine.isEmpty) continue;
    final start = level[track.id]!;
    final total = math.max(0.0, mine.fold(0.0, (n, e) => n + e.amount));
    var left = total;
    double? needed;
    while (track.curve.trim().isNotEmpty &&
        !(track.cap > 0 && level[track.id]! >= track.cap) &&
        level[track.id]! - start < 100000) {
      // A curve may read formulas that read the level, so nothing worked out for the last level is reused.
      forget();
      try {
        needed = work(track.curve);
      } on Object catch (err) {
        curveErrors[track.id] = _message(err);
        needed = null;
        break;
      }
      // A curve that asks for nothing cannot be climbed by earning.
      if (!(needed > 0) || !needed.isFinite) {
        needed = null;
        break;
      }
      if (left < needed) break;
      left -= needed;
      level[track.id] = level[track.id]! + 1;
      needed = null;
    }
    forget();
    final unit = track.curveUnit.isNotEmpty ? ' ${track.curveUnit}' : '';
    earned[track.id] = (
      total: total,
      into: left,
      needed: needed,
      gained: level[track.id]! - start,
      progress: needed == null
          ? '${formatNumber(total)}$unit earned'
          : '${formatNumber(left)} of ${formatNumber(needed)}$unit to the next',
    );
  }

  // What classes, skills and the like change. Their amounts are worked out from the values before any of them apply.
  final changes = <({SysItem item, SysVariable target, String op, double amount})>[];
  final itemErrors = <String, String>{};
  for (final item in held) {
    for (final modifier in item.modifiers) {
      final target = byKey[_lower(modifier.target)];
      if (target == null || target.kind == 'choice') continue;
      try {
        changes.add((item: item, target: target, op: modifier.op, amount: work(modifier.value)));
      } on Object catch (err) {
        itemErrors[item.id] = _message(err);
      }
    }
  }
  void apply(SysVariable variable) {
    final mine = [
      for (final c in changes)
        if (c.target.id == variable.id) c,
    ];
    final id = _lower(variable.key);
    final before = values[id];
    if (mine.isEmpty || before is! double) return;
    final set = mine.where((c) => c.op == 'set').lastOrNull;
    final added = mine.where((c) => c.op == 'add').fold<double>(set?.amount ?? before, (n, c) => n + c.amount);
    values[id] = mine.where((c) => c.op == 'multiply').fold<double>(added, (n, c) => n * c.amount);
    sources[id] = {for (final c in mine) c.item.name}.toList();
  }

  bool byHand(SysVariable variable) {
    final set = profile.overrides[variable.id];
    final ok = variable.kind == 'choice' ? set is String : (set is double && set.isFinite);
    if (ok) values[_lower(variable.key)] = set!;
    return ok;
  }

  for (final v in variables) {
    if (v.kind == 'derived') continue;
    apply(v);
    if (byHand(v)) sources.remove(_lower(v.key));
  }
  // Formulas read while working out those amounts saw the values from before; work them out afresh.
  for (final v in variables) {
    if (v.kind != 'derived') continue;
    values.remove(_lower(v.key));
    errors.remove(_lower(v.key));
  }
  for (final v in variables) {
    if (v.kind == 'derived') byHand(v);
  }
  for (final v in variables) {
    if (v.kind != 'derived' || values.containsKey(_lower(v.key))) continue;
    try {
      valueOf(v.key);
      apply(v);
    } on Object {
      // Recorded in `errors` by valueOf.
    }
  }

  final rows = [
    for (final v in variables)
      () {
        final id = _lower(v.key);
        final value = values[id];
        final shown = value is double ? formatNumber(value) : (value is String ? value : null);
        return SheetRow(
          v,
          value is bool ? null : value,
          shown == null ? '—' : '$shown${v.unit.isNotEmpty && shown.isNotEmpty ? ' ${v.unit}' : ''}',
          sources[id] ?? const [],
          errors[id],
        );
      }(),
  ];

  ({List<String> unmet, String? error}) check(String condition) {
    if (condition.trim().isEmpty) return (unmet: const [], error: null);
    try {
      return (unmet: unmet(parseFormula(condition), scope), error: null);
    } on Object catch (err) {
      return (unmet: const [], error: _message(err));
    }
  }

  final sheetTracks = [
    for (final track in tracks)
      () {
        if (track.kind == 'stages') {
          final at = stage[track.id]!;
          final stages = track.stages;
          final current = at < stages.length ? stages[at] : null;
          final upcoming = at + 1 < stages.length ? stages[at + 1] : null;
          final gate = upcoming != null ? check(upcoming.requires) : (unmet: const <String>[], error: null);
          return SheetTrack(
            track,
            current?.name ?? 'No stages yet',
            null,
            upcoming != null
                ? 'Next: ${upcoming.name}${upcoming.requires.trim().isNotEmpty ? ' (needs ${upcoming.requires.trim()})' : ''}'
                : null,
            gate.unmet,
            null,
            gate.error,
          );
        }
        final reached = level[track.id]!;
        final xp = earned[track.id];
        String? next;
        String? error = curveErrors[track.id];
        if (track.cap > 0 && reached >= track.cap) {
          next = 'At the cap';
        } else if (xp?.needed != null) {
          next = xp!.progress;
        } else if (track.curve.trim().isNotEmpty && error == null) {
          try {
            next =
                'Next level: ${formatNumber(work(track.curve))}${track.curveUnit.isNotEmpty ? ' ${track.curveUnit}' : ''}';
          } on Object catch (err) {
            error = _message(err);
          }
        }
        return SheetTrack(
          track,
          '$reached${track.cap > 0 ? ' of ${track.cap}' : ''}',
          reached,
          next,
          const [],
          xp,
          error,
        );
      }(),
  ];

  SysVariable? nameOf(String key) => byKey[_lower(key)];
  final items = [
    for (final item in held)
      () {
        final gate = check(item.requires);
        final costs = [
          for (final cost in item.costs)
            () {
              final target = nameOf(cost.target);
              try {
                return (label: '${formatNumber(work(cost.amount))} ${target?.name ?? cost.target}', error: null);
              } on Object catch (err) {
                return (label: '${cost.amount} ${target?.name ?? cost.target}', error: _message(err));
              }
            }(),
        ];
        final effects = <String>[];
        for (final modifier in item.modifiers) {
          final change = changes
              .where(
                (c) => c.item.id == item.id && _lower(c.target.key) == _lower(modifier.target) && c.op == modifier.op,
              )
              .firstOrNull;
          if (change == null) continue;
          final amount = formatNumber(change.amount.abs());
          effects.add(
            '${change.target.name} ${modifier.op == 'add' ? '${change.amount < 0 ? '−' : '+'}$amount' : '${modifier.op == 'multiply' ? '×' : '='} ${formatNumber(change.amount)}'}',
          );
        }
        return SheetItem(
          item,
          groupOf(item),
          item.requires.trim(),
          gate.unmet,
          costs,
          effects,
          gate.error ?? itemErrors[item.id],
        );
      }(),
  ];

  final available = [
    for (final item in allItems)
      if (!profile.itemIds.contains(item.id) && item.requires.trim().isNotEmpty)
        if (check(item.requires) case final gate when gate.error == null && gate.unmet.isEmpty) item,
  ];

  // Points: each level after the first on a track brings that track's points; placing them is the author's call.
  final granted = tracks.fold(
    0.0,
    (n, t) => n + (t.kind == 'levels' ? math.max(0.0, t.points) * (level[t.id]! - 1) : 0.0),
  );
  final spent = variables.fold(0.0, (n, v) => n + placed(v));
  final points = granted != 0 || spent != 0
      ? (name: 'Points', earned: granted, spent: spent, unspent: granted - spent)
      : null;

  return ComputedSheet(rows, sheetTracks, items, available, points);
}

/// A sheet with its experience and placed points worked into plain numbers: the level each track has reached, and
/// each attribute with its points in. It is what a progression snapshot keeps, so a snapshot stays true whatever is
/// logged afterwards. [reached] leaves out experience from later in the story.
({Map<String, Object> values, Map<String, Object> progress, List<String> itemIds}) settle(
  SystemBlueprint system,
  SheetProfile sheet, [
  bool Function(String? nodeId)? reached,
]) {
  final xp = [
    for (final e in sheet.xp)
      if (reached == null || reached(e.nodeId)) e,
  ];
  final computed = computeSheet(system, sheet.withXp(xp));
  final progress = {...sheet.progress};
  for (final t in computed.tracks) {
    if (t.xp != null && t.level != null) progress[t.track.id] = t.level!.toDouble();
  }
  final values = {...sheet.values};
  for (final v in system.variables) {
    final n = takesPoints(v) ? sheet.spent[v.id] : null;
    if (n != null && n.isFinite && n != 0) {
      final own = values[v.id];
      values[v.id] = (own is double ? own : v.base) + n;
    }
  }
  return (values: values, progress: progress, itemIds: [...sheet.itemIds]);
}

/// A sheet's experience in story order, with the level each gain left the character at: the level history, read from
/// the log rather than kept beside it.
List<({XpEntry entry, int level, SysTrack track})> xpHistory(
  SystemBlueprint system,
  SheetProfile sheet,
  num Function(String? nodeId) position,
) {
  final indexed = [for (final (i, e) in sheet.xp.indexed) (e: e, i: i)]
    ..sort((a, b) {
      final p = position(a.e.nodeId).compareTo(position(b.e.nodeId));
      return p != 0 ? p : a.i.compareTo(b.i);
    });
  final ordered = [for (final x in indexed) x.e];
  final out = <({XpEntry entry, int level, SysTrack track})>[];
  for (final (i, entry) in ordered.indexed) {
    final track = system.tracks.where((t) => t.id == entry.trackId && t.kind == 'levels').firstOrNull;
    if (track == null) continue;
    final upTo = ordered.take(i + 1).toSet();
    final at = computeSheet(
      system,
      sheet.withXp([
        for (final e in sheet.xp)
          if (upTo.contains(e)) e,
      ]),
    ).tracks.firstWhere((t) => t.track.id == track.id);
    out.add((entry: entry, level: at.level ?? 1, track: track));
  }
  return out;
}

typedef FormulaCheck = ({bool ok, String? error, String? preview});

/// Checks a formula or condition as the author types it, against the blueprint's starting values. Empty is fine.
FormulaCheck checkFormula(
  SystemBlueprint system,
  String text, {
  required bool condition,
  Map<String, double> extra = const {},
}) {
  if (text.trim().isEmpty) return (ok: true, error: null, preview: null);
  final FNode tree;
  try {
    tree = parseFormula(text);
  } on Object catch (err) {
    return (ok: false, error: err is FormulaError ? err.message : 'This cannot be read.', preview: null);
  }
  // A scope that knows every name in the blueprint and holds nothing: enough to catch misspelt names and groups.
  final sheet = computeSheet(system);
  final known = <String, Object>{};
  final names = [for (final n in namesIn(tree)) _lower(n)];
  for (final row in sheet.rows) {
    // A formula that leans on a broken one is reported as broken itself, rather than given a made-up number.
    if (row.value != null) {
      known[_lower(row.variable.key)] = row.value!;
    } else if (!names.any((n) => n == _lower(row.variable.key) || n == _lower(row.variable.name))) {
      known[_lower(row.variable.key)] = 0.0;
    }
  }
  for (final t in system.tracks) {
    known[_lower(t.key)] = 1.0;
  }
  for (final e in extra.entries) {
    known[_lower(e.key)] = e.value;
  }
  Object? find(String name) {
    final direct = known[_lower(name)];
    if (direct != null) return direct;
    final key =
        system.variables.where((v) => _lower(v.name) == _lower(name)).firstOrNull?.key ??
        system.tracks.where((t) => _lower(t.name) == _lower(name)).firstOrNull?.key ??
        ' ';
    return known[_lower(key)];
  }

  final scope = FormulaScope(
    value: find,
    holds: (group, name) {
      final wanted = _lower(group);
      final track = system.tracks
          .where((t) => t.kind == 'stages' && (_lower(t.name) == wanted || _lower(t.key) == wanted))
          .firstOrNull;
      if (track != null) {
        if (!track.stages.any((s) => _lower(s.name) == _lower(name))) {
          throw FormulaError('“${track.name}” has no stage called “$name”.');
        }
        return false;
      }
      final choice = system.variables
          .where((v) => v.kind == 'choice' && (_lower(v.name) == wanted || _lower(v.key) == wanted))
          .firstOrNull;
      if (choice != null) {
        if (!choice.options.any((o) => _lower(o) == _lower(name))) {
          throw FormulaError('“${choice.name}” has no choice called “$name”.');
        }
        return false;
      }
      final found = system.groupList.where((g) => groupNamed(g, wanted)).firstOrNull;
      if (found == null) return null;
      if (!system.items.any((i) => i.groupId == found.id && _lower(i.name) == _lower(name))) {
        throw FormulaError('“${found.name}” has nothing called “$name”.');
      }
      return false;
    },
  );
  try {
    // Every branch is read, so a misspelt name is caught even behind an AND that is already false.
    void visit(FNode node) {
      switch (node) {
        case NameNode(:final name):
          if (!const ['true', 'false', 'yes', 'no'].contains(_lower(name)) && find(name) == null) {
            throw FormulaError('Nothing here is called “$name”.');
          }
        case HoldsNode(:final group, :final name):
          if (scope.holds(group, name) == null) throw FormulaError('There is no “$group” to look in for “$name”.');
        case UnaryNode(:final operand):
          visit(operand);
        case BinaryNode(:final left, :final right):
          visit(left);
          visit(right);
        case CallNode(:final args):
          args.forEach(visit);
        case NumberNode() || TextNode():
          break;
      }
    }

    visit(tree);
    final result = evaluateFormula(tree, scope);
    if (!condition && result is String) return (ok: false, error: 'This gives a label, not a number.', preview: null);
    return (
      ok: true,
      error: null,
      preview: condition ? null : formatNumber(result is double ? result : (result == true ? 1 : 0)),
    );
  } on Object catch (err) {
    return (ok: false, error: err is FormulaError ? err.message : 'This could not be worked out.', preview: null);
  }
}

/// What it takes to pass each of the first few levels of a track, for showing the curve.
List<({int level, String cost})> curveTable(SystemBlueprint system, SysTrack track, List<int> levels) {
  if (track.kind != 'levels' || track.curve.trim().isEmpty) return const [];
  return [
    for (final l in levels)
      if (l >= 1 && (track.cap == 0 || l < track.cap))
        () {
          final c = checkFormula(
            system,
            track.curve,
            condition: false,
            extra: {track.key: l.toDouble(), track.name: l.toDouble()},
          );
          return (
            level: l,
            cost: c.error != null ? '?' : '${c.preview}${track.curveUnit.isNotEmpty ? ' ${track.curveUnit}' : ''}',
          );
        }(),
  ];
}
