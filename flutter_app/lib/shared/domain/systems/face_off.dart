/// THE FACE-OFF: two of a system's sheets set against each other, the progression story's "who would win": each
/// number both have (levels, attributes, resources, what follows from them) side by side, who leads in each, and what
/// it says: who leads in how many, the widest gap, and what each holds that the other does not. Worked out from the
/// sheets as they stand (`compute.dart`).
///
/// Reads only.
library;

import 'compute.dart';
import 'formula.dart' show formatNumber;

/// One number both sheets have: its name, each side's value, and its unit.
typedef FaceOffRow = ({String name, double a, double b, String unit, bool level});

/// The face-off of two sheets: the rows, and what it says.
typedef FaceOff = ({List<FaceOffRow> rows, List<String> says});

/// [a] against [b] (named [aName] and [bName]).
FaceOff faceOff(ComputedSheet a, ComputedSheet b, {required String aName, required String bName}) {
  final rows = <FaceOffRow>[];
  for (final t in a.tracks) {
    final other = b.tracks.where((x) => x.track.id == t.track.id).firstOrNull;
    if (t.level == null || other?.level == null) continue;
    rows.add((name: t.track.name, a: t.level!.toDouble(), b: other!.level!.toDouble(), unit: '', level: true));
  }
  for (final r in a.rows) {
    if (r.value is! double || r.variable.kind == 'choice') continue;
    final other = b.rows.where((x) => x.variable.id == r.variable.id).firstOrNull;
    if (other?.value is! double) continue;
    rows.add((
      name: r.variable.name,
      a: r.value! as double,
      b: other!.value! as double,
      unit: r.variable.unit.trim(),
      level: false,
    ));
  }

  final says = <String>[];
  if (rows.isEmpty) return (rows: rows, says: says);
  final aLeads = [
    for (final r in rows)
      if (r.a > r.b) r.name,
  ];
  final bLeads = [
    for (final r in rows)
      if (r.b > r.a) r.name,
  ];
  String list(List<String> names) =>
      names.length <= 1 ? names.join() : '${names.take(names.length - 1).join(', ')} and ${names.last}';
  if (aLeads.isEmpty && bLeads.isEmpty) {
    says.add('$aName and $bName are even in everything.');
  } else {
    final (leader, led, ahead, behind) = aLeads.length >= bLeads.length
        ? (aName, bName, aLeads, bLeads)
        : (bName, aName, bLeads, aLeads);
    says.add(
      behind.isEmpty
          ? '$leader leads in all ${ahead.length}.'
          : '$leader leads in ${ahead.length} of ${rows.length}; $led only in ${list(behind)}.',
    );
  }
  // The widest gap, as a share: "three times", "half again".
  FaceOffRow? widest;
  var most = 1.0;
  for (final r in rows) {
    final low = r.a < r.b ? r.a : r.b;
    final high = r.a < r.b ? r.b : r.a;
    if (low <= 0 || high == low) continue;
    final ratio = high / low;
    if (ratio > most) {
      most = ratio;
      widest = r;
    }
  }
  if (widest != null && most >= 1.5) {
    final r = widest;
    final (hi, hiValue, lo, loValue) = r.a > r.b ? (aName, r.a, bName, r.b) : (bName, r.b, aName, r.a);
    final unit = r.unit.isEmpty ? '' : ' ${r.unit}';
    final times = most >= 1.95
        ? '${formatNumber((most * 10).roundToDouble() / 10)} times'
        : '${formatNumber(((most - 1) * 100).roundToDouble())}% more';
    says.add(
      'The widest gap: ${r.name}, $hi ${formatNumber(hiValue)}$unit to $lo ${formatNumber(loValue)}$unit ($times).',
    );
  }
  // What each holds that the other does not.
  final aHeld = {for (final i in a.items) i.item.name};
  final bHeld = {for (final i in b.items) i.item.name};
  final onlyA = [
    for (final n in aHeld)
      if (!bHeld.contains(n)) n,
  ];
  final onlyB = [
    for (final n in bHeld)
      if (!aHeld.contains(n)) n,
  ];
  if (onlyA.isNotEmpty) says.add('Only $aName holds ${list(onlyA.take(4).toList())}${onlyA.length > 4 ? '…' : ''}.');
  if (onlyB.isNotEmpty) says.add('Only $bName holds ${list(onlyB.take(4).toList())}${onlyB.length > 4 ? '…' : ''}.');
  return (rows: rows, says: says);
}
