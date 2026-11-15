/// DRAMATIS PERSONAE: the cast list printed before the story, as epic and ensemble novels have it, made from the
/// cast. One a line, "Name — who they are", in the shape `castLines` (`reader/book.dart`) reads back: grouped by
/// faction or by the part they play (a line ending in ":" heads a group), in the order the reader meets them or by
/// name. Who they are is what a reader may know from the start: the title they go by, else the first sentence of
/// their summary, else their trade. Never their fate, their status or a secret.
///
/// Makes text only; putting it in the book is the author's choice.
library;

import '../text/fold.dart';

/// How the list is divided.
enum CastGrouping {
  faction('By faction'),
  role('By part'),
  none('One list');

  const CastGrouping(this.label);
  final String label;
}

/// The order within a group.
enum CastOrder {
  appearance('As they appear'),
  name('By name');

  const CastOrder(this.label);
  final String label;
}

/// A character for the list: their id and name, who they are in a phrase, and their factions and roles.
typedef DramatisPerson = ({String id, String name, String about, List<String> factions, List<String> roles});

/// The heading for those with no faction, and for the roles.
const otherFaction = 'Others';
const principalPart = 'Principal characters';
const supportingPart = 'Supporting characters';
const minorPart = 'And';

/// The cast list for [people]. [appearance] is each one's place in the order of appearance (`entrances.dart`); with
/// [onlyOnPage], those not in it are left out (nobody a reader has not met is printed).
String composeDramatis(
  List<DramatisPerson> people, {
  required CastGrouping by,
  required CastOrder order,
  Map<String, int> appearance = const {},
  bool onlyOnPage = true,
}) {
  final chosen = [
    for (final p in people)
      if (p.name.trim().isNotEmpty && (!onlyOnPage || appearance.containsKey(p.id))) p,
  ];
  int ordered(DramatisPerson a, DramatisPerson b) {
    if (order == CastOrder.appearance) {
      final x = appearance[a.id] ?? 1 << 30, y = appearance[b.id] ?? 1 << 30;
      if (x != y) return x - y;
    }
    return foldText(a.name).compareTo(foldText(b.name));
  }

  String line(DramatisPerson p) => p.about.trim().isEmpty ? p.name.trim() : '${p.name.trim()} — ${p.about.trim()}';

  if (by == CastGrouping.none) return [for (final p in chosen..sort(ordered)) line(p)].join('\n');

  final groups = <String, List<DramatisPerson>>{};
  for (final p in chosen) {
    groups.putIfAbsent(by == CastGrouping.faction ? _factionOf(p) : _partOf(p), () => []).add(p);
  }
  for (final g in groups.values) {
    g.sort(ordered);
  }
  // Groups in the order of their first member; for parts, principal first; those with no faction last.
  final names = groups.keys.toList()
    ..sort((a, b) {
      if (by == CastGrouping.role) {
        const rank = [principalPart, supportingPart, minorPart];
        return rank.indexOf(a) - rank.indexOf(b);
      }
      if ((a == otherFaction) != (b == otherFaction)) return a == otherFaction ? 1 : -1;
      return ordered(groups[a]!.first, groups[b]!.first);
    });
  // One group alone needs no heading.
  if (names.length == 1) return [for (final p in groups[names.single]!) line(p)].join('\n');
  return [
    for (final (i, g) in names.indexed) ...[if (i > 0) '', '$g:', for (final p in groups[g]!) line(p)],
  ].join('\n');
}

String _factionOf(DramatisPerson p) => p.factions.where((f) => f.trim().isNotEmpty).firstOrNull?.trim() ?? otherFaction;

String _partOf(DramatisPerson p) {
  final roles = [for (final r in p.roles) r.toLowerCase()];
  if (roles.any((r) => r.contains('protagonist') || r.contains('antagonist') || r == 'lead' || r == 'main character')) {
    return principalPart;
  }
  if (roles.any((r) => r.contains('supporting') || r.contains('love interest') || r.contains('mentor'))) {
    return supportingPart;
  }
  return minorPart;
}

/// Who someone is in a phrase a reader may know from the start: the title they go by, else the first sentence of
/// their summary (cut at about [most] characters), else their trade.
String aboutOf({required String epithet, required String summary, required String occupation, int most = 90}) {
  if (epithet.trim().isNotEmpty) return epithet.trim();
  final s = summary.trim();
  if (s.isNotEmpty) {
    final end = RegExp(r'[.!?…](\s|$)').firstMatch(s);
    var first = (end == null ? s : s.substring(0, end.start)).trim();
    if (first.length > most) {
      final cut = first.lastIndexOf(' ', most);
      first = '${first.substring(0, cut > 0 ? cut : most).trimRight()}…';
    }
    return first;
  }
  return occupation.trim();
}
