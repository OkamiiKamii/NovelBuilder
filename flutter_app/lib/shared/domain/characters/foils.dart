/// FOILS AND TWINS: the cast's temperaments set against each other, from the traits This or that keeps
/// (`this_or_that.dart`). A **foil** is a pair who answer most of what they both answer the other way (the contrast a
/// scene between them runs on); **twins** answer nearly everything the same way (a reader may mix them up); and a trait
/// the **whole cast shares** (everyone honest) is a cast with no one to break it. Read from what the author chose,
/// never guessed; a pair with too few answers in common is not compared.
///
/// Reads only.
library;

import 'this_or_that.dart';

/// A character's answers: their id, and the side of each axis they are on (-1 left, 1 right).
typedef Temperament = ({String id, Map<String, int> sides});

/// Two characters compared: who, on how many axes both answered, how many the other way and how many the same, and
/// the axes they differ on (in the deck's order).
typedef Pairing = ({String a, String b, int both, int opposed, int alike, List<String> differ});

/// A trait the whole cast shares: the axis, the side, and how many answered it.
typedef Shared = ({String axis, int side, int count});

/// What the cast's temperaments say.
typedef Foils = ({List<Pairing> foils, List<Pairing> twins, List<Shared> shared});

/// How many axes two must both have answered to be compared.
const comparedFrom = 3;

/// The foils (two opposed on at least three in five of what they both answered, the most opposed first), the twins
/// (alike on all but at most one of four or more), and the traits all of four or more share, among [cast].
Foils foilsOf(List<Temperament> cast) {
  final foils = <Pairing>[];
  final twins = <Pairing>[];
  for (var i = 0; i < cast.length; i++) {
    for (var j = i + 1; j < cast.length; j++) {
      final p = pair(cast[i], cast[j]);
      if (p.both < comparedFrom) continue;
      if (p.opposed * 5 >= p.both * 3) foils.add(p);
      if (p.both >= 4 && p.opposed <= 1) twins.add(p);
    }
  }
  foils.sort((x, y) => y.opposed != x.opposed ? y.opposed - x.opposed : x.both - y.both);
  twins.sort((x, y) => y.alike != x.alike ? y.alike - x.alike : x.opposed - y.opposed);
  final shared = <Shared>[];
  for (final axis in traitAxes) {
    final sides = [for (final t in cast) ?t.sides[axis.id]];
    if (sides.length >= 4 && sides.every((s) => s == sides.first)) {
      shared.add((axis: axis.id, side: sides.first, count: sides.length));
    }
  }
  return (foils: foils, twins: twins, shared: shared);
}

/// [a] and [b] compared, axis by axis.
Pairing pair(Temperament a, Temperament b) {
  var both = 0, opposed = 0;
  final differ = <String>[];
  for (final axis in traitAxes) {
    final x = a.sides[axis.id], y = b.sides[axis.id];
    if (x == null || y == null) continue;
    both++;
    if (x != y) {
      opposed++;
      differ.add(axis.id);
    }
  }
  return (a: a.id, b: b.id, both: both, opposed: opposed, alike: both - opposed, differ: differ);
}

/// The trait [side] of the axis [id] keeps ("Rational", "Emotional").
String traitOf(String id, int side) {
  final a = traitAxes.firstWhere((x) => x.id == id);
  return side < 0 ? a.leftTrait : a.rightTrait;
}

/// The two axes the cast's answers spread across most (answered by the most, split the most evenly), for a compass
/// that shows them apart; the deck's first two when nothing is answered.
(String, String) spreadAxes(List<Temperament> cast) {
  double spread(String id) {
    final l = cast.where((t) => t.sides[id] == -1).length;
    final r = cast.where((t) => t.sides[id] == 1).length;
    return (l + r) + (l < r ? l : r) * 2.0;
  }

  final order = [for (final a in traitAxes) a.id];
  // The widest spread first; a tie in the deck's order, so the compass is the same each time.
  final ranked = [...order]
    ..sort((x, y) => spread(y) != spread(x) ? spread(y).compareTo(spread(x)) : order.indexOf(x) - order.indexOf(y));
  return (ranked[0], ranked[1]);
}
