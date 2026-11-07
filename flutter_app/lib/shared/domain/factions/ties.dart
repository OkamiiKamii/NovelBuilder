import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../progression/track.dart' show whenWords;
import '../records/entry.dart';
import '../records/link.dart';
import '../stable_sort.dart';

/// FACTIONS AND THEIR TIES (as in the original app)
/// Who belongs to a faction and who leads it, who it is allied with or at war with, what it controls and influences,
/// where it is based: read from the typed connections the author records, each with when it holds. Nothing is assumed
/// to last: a tie with no time given is said to have none, and one that has ended is history, not the present. Ties of
/// the author's own kinds are kept, under their own words.

enum TieRole {
  leader('Leaders'),
  member('Members'),
  ally('Allies'),
  rival('Rivals and enemies'),
  territory('Territory'),
  influence('Influence'),
  seat('Based in'),
  other('Other ties');

  const TieRole(this.label);
  final String label;
}

const roleOf = {
  'leads': TieRole.leader,
  'member-of': TieRole.member,
  'allied-with': TieRole.ally,
  'at-war-with': TieRole.rival,
  'considers-rival': TieRole.rival,
  'controls': TieRole.territory,
  'influences': TieRole.influence,
  'located-in': TieRole.seat,
};

class Tie {
  Tie({
    required this.link,
    required this.role,
    required this.other,
    required this.otherName,
    required this.words,
    required this.when,
    required this.timeless,
    required this.holds,
  });
  final Link link;
  final TieRole role;

  /// The record at the other end.
  final EntityRef other;
  final String otherName;

  /// The tie in words, from the faction: "Mira is a member", "Allied with The Crown", "Owes a debt to Orrin".
  final String words;

  /// When it holds, in words: "from Year 3 until Year 8 (expelled)", or that no time is given.
  final String when;

  /// No time given: it holds as far as anyone has said, which is not the same as for ever.
  final bool timeless;

  /// At the point asked about: holds, may hold (it cannot be placed against that point), or not.
  final Truth holds;
}

bool _isFactionEnd(StoryModel model, String id) {
  final category = model.entries[id]?.category;
  return category != null && category != 'character' && category != 'location';
}

/// The factions: every codex entry of the Faction category, and any other record (never a character or a place) the
/// author treats as one: what someone is a member of or leads, or what controls or influences something.
List<Entry> factionsOf(StoryModel model) {
  final ids = <String>{
    for (final e in model.entries.values)
      if (e.category == 'faction') e.id,
  };
  for (final l in model.links) {
    final key = connectionType(l.type).key;
    if ((key == 'member-of' || key == 'leads') && _isFactionEnd(model, l.toId)) ids.add(l.toId);
    if ((key == 'controls' || key == 'influences') && _isFactionEnd(model, l.fromId)) ids.add(l.fromId);
  }
  return stableSorted([for (final id in ids) model.entries[id]!], (a, b) => localeCompare(a.name, b.name));
}

String _name(StoryModel model, EntityRef ref) =>
    switch (ref.type) {
      EntityType.entry => model.entries[ref.id]?.name,
      EntityType.event => model.events[ref.id]?.name,
      EntityType.node => model.nodes[ref.id]?.title,
      _ => null,
    } ??
    'something deleted';

/// A tie's time in words: "from Year 3 until Year 8 (expelled)", "until Ch 4", or that none is given.
String whenHeld(Link link, StoryModel model) {
  final validity = link.validity;
  final how = link.how;
  final from = validity?.from;
  final until = validity?.until;
  final began = how != null ? ' ($how)' : '';
  if (validity == null || (from == null && until == null)) return 'no time given$began';
  return [
    from != null ? 'from ${whenWords(from, model)}$began' : 'from the start$began',
    if (until != null) 'until ${whenWords(until, model)}${link.endHow != null ? ' (${link.endHow})' : ''}',
  ].join(' ');
}

/// Whether a tie holds at a point; at the end of the story ([at] null), whatever has not ended holds.
Truth holdsAt(Validity? validity, Anchor? at, StoryModel model) {
  if (at == null) return validity?.until != null ? Truth.no : Truth.yes;
  return validAt(validity ?? Validity.always, at, model.timeContext);
}

num _createdAt(Link l) => numOrNull(l.raw['createdAt']) ?? 0;

String _lowerFirst(String s) => s.isEmpty ? s : '${s[0].toLowerCase()}${s.substring(1)}';

/// Every tie of one faction, each with its role, its words and when it holds; [at] (null for the end of the story)
/// marks which hold at that point.
List<Tie> factionTies(StoryModel model, String factionId, [Anchor? at]) {
  final out = <Tie>[];
  for (final link in model.links) {
    if (link.type == null) continue;
    final outgoing = link.fromId == factionId && link.fromType == EntityType.entry;
    final incoming = link.toId == factionId && link.toType == EntityType.entry;
    if (!outgoing && !incoming) continue;
    final kind = connectionType(link.type);
    final other = outgoing ? link.to : link.from;
    final role = roleOf[kind.key] ?? TieRole.other;
    // A role reads one way: a member is someone's tie TO the faction; territory is the faction's tie TO a place.
    final fits = switch (role) {
      TieRole.leader || TieRole.member => incoming,
      TieRole.territory || TieRole.influence || TieRole.seat => outgoing,
      _ => true,
    };
    final otherName = _name(model, other);
    final said = link.fromLabel.isNotEmpty ? link.fromLabel : kind.label;
    final words = !fits || role == TieRole.other || role == TieRole.ally || role == TieRole.rival
        ? (outgoing ? '$said $otherName' : '$otherName ${_lowerFirst(said)} this')
        : switch (role) {
            TieRole.leader => '$otherName leads it',
            TieRole.member => '$otherName is a member',
            _ => '$said $otherName',
          };
    final validity = link.validity;
    out.add(
      Tie(
        link: link,
        role: fits ? role : TieRole.other,
        other: other,
        otherName: otherName,
        words: words,
        when: whenHeld(link, model),
        timeless: validity == null || (validity.from == null && validity.until == null),
        holds: holdsAt(validity, at, model),
      ),
    );
  }
  final sorted = stableSorted(out, (a, b) {
    final c = _createdAt(a.link).compareTo(_createdAt(b.link));
    return c != 0 ? c : localeCompare(a.link.id, b.link.id);
  });
  return historyOf(sorted, (t) => t.link.validity ?? Validity.always, model.timeContext);
}

/// A faction at a point: its ties by role, only those that hold there or may (marked), and how many have ended or not
/// yet begun.
({Map<TieRole, List<Tie>> byRole, int notNow}) factionAt(StoryModel model, String factionId, Anchor? at) {
  final ties = factionTies(model, factionId, at);
  final byRole = <TieRole, List<Tie>>{};
  for (final t in ties.where((t) => t.holds != Truth.no)) {
    (byRole[t.role] ??= []).add(t);
  }
  return (byRole: byRole, notNow: ties.where((t) => t.holds == Truth.no).length);
}

/// Ties between factions, and from factions to what they control or influence, holding at a point: what the faction
/// map draws.
({List<Entry> factions, List<Tie> edges, List<Entry> territories}) factionNetwork(StoryModel model, Anchor? at) {
  final factions = factionsOf(model);
  final ids = {for (final f in factions) f.id};
  final edges = <Tie>[];
  final seen = <String>{};
  for (final f in factions) {
    for (final t in factionTies(model, f.id, at)) {
      if (t.holds == Truth.no || seen.contains(t.link.id)) continue;
      final between =
          t.other.type == EntityType.entry &&
          ids.contains(t.other.id) &&
          (t.role == TieRole.ally || t.role == TieRole.rival || t.role == TieRole.influence || t.role == TieRole.other);
      final over = t.role == TieRole.territory || (t.role == TieRole.influence && t.other.type == EntityType.entry);
      if (between || over) {
        edges.add(t);
        seen.add(t.link.id);
      }
    }
  }
  final territories = <String>[];
  for (final e in edges) {
    if (e.other.type == EntityType.entry && !ids.contains(e.other.id) && !territories.contains(e.other.id)) {
      territories.add(e.other.id);
    }
  }
  return (factions: factions, edges: edges, territories: [for (final id in territories) ?model.entries[id]]);
}
