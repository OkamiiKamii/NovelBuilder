import '../collation.dart';
import '../json.dart';
import '../model/entity_ref.dart';
import '../model/story_model.dart';
import '../model/validity.dart';
import '../progression/track.dart' show whenWords;
import '../records/entry.dart';
import '../records/link.dart';
import '../stable_sort.dart';
import '../travel/routes.dart' show TravelPoint, pointOf;
import 'ties.dart' show holdsAt;

/// WHO HELD IT, AND HOW IT PASSED (as in the original app)
/// An item's ownership, from the "Owns" connections the author records: each holding with when it began and how
/// (made, found, given, sold, stolen, inherited…), when it ended and how (passed to the next holder, lost,
/// destroyed…). Who made it comes from its "Created by". Nothing is assumed: a holding with no time is said to have
/// none; a stretch with no holding recorded is said to be unknown; a holding tied to an event that does not happen in
/// this timeline (an alternate history without it) is said not to happen here, and is not counted.

/// How a holding begins, and how one ends with nothing after it: offered as words, never required.
const howGained = ['made', 'found', 'given', 'sold', 'stolen', 'inherited', 'won', 'claimed'];
const howEnded = ['lost', 'destroyed', 'abandoned', 'hidden'];

class Holding {
  Holding({
    required this.link,
    required this.holderId,
    required this.holderName,
    required this.how,
    required this.began,
    required this.ended,
    required this.endHow,
    required this.timeless,
    required this.inThisTimeline,
  });
  final Link link;
  final String holderId;
  final String holderName;

  /// How it began, in the author's words.
  final String how;
  final String began;

  /// When it ended, in words; null while it still holds.
  final String? ended;

  /// How it ended: the author's words, or how the next holding began when it begins right there ("stolen by Mira").
  final String endHow;

  /// No time given at all.
  final bool timeless;

  /// False when it hangs on an event this timeline does not have (an alternate history without it).
  final bool inThisTimeline;
}

class Ownership {
  Ownership(this.item, this.makers, this.holdings, this.unknown, this.now);
  final Entry item;

  /// "Created by" the item, with when.
  final List<({String name, String when})> makers;
  final List<Holding> holdings;

  /// Stretches between holdings with no holder recorded, in words.
  final List<String> unknown;

  /// Where it stands at the point asked about: held, ended, unknown or none.
  final ({String state, List<String> holders, String words}) now;
}

/// Items: every codex entry of the Item category, and anything the author records as owned.
List<Entry> ownedItems(StoryModel model) {
  final ids = <String>{
    for (final e in model.entries.values)
      if (e.category == 'item') e.id,
  };
  for (final l in model.links) {
    if (connectionType(l.type).key == 'owns' && l.toType == EntityType.entry && model.entries.containsKey(l.toId)) {
      ids.add(l.toId);
    }
  }
  return stableSorted([for (final id in ids) model.entries[id]!], (a, b) => localeCompare(a.name, b.name));
}

bool _missing(Anchor? a, StoryModel model) => a is EventAnchor && !model.events.containsKey(a.eventId);

/// A holding as this timeline has it: one that begins at an event this timeline does not have does not happen here;
/// one that ends at such an event does not end there, and goes on.
Validity? _asHere(Validity? validity, StoryModel model) =>
    validity != null && _missing(validity.until, model) ? Validity(validity.from, null) : validity;

/// How it passed to the next holder: "stolen by Mira", "given to the King".
String _passed(String how, String to) => how.isNotEmpty
    ? '$how ${['given', 'sold', 'bequeathed', 'lent'].contains(how.toLowerCase()) ? 'to' : 'by'} $to'
    : 'passed to $to';

num _createdAt(Link l) => numOrNull(l.raw['createdAt']) ?? 0;

/// Who has held [itemId], at a point ([at] null for the end of the story).
Ownership? ownershipOf(StoryModel model, String itemId, [Anchor? at]) {
  final item = model.entries[itemId];
  if (item == null) return null;
  final owns = stableSorted(
    model.links.where(
      (l) =>
          connectionType(l.type).key == 'owns' &&
          l.toId == itemId &&
          l.toType == EntityType.entry &&
          l.fromType == EntityType.entry,
    ),
    (a, b) {
      final c = _createdAt(a).compareTo(_createdAt(b));
      return c != 0 ? c : localeCompare(a.id, b.id);
    },
  );
  final ordered = historyOf(owns, (l) => l.validity ?? Validity.always, model.timeContext);
  String nameOf(String id) => model.entries[id]?.name ?? 'someone deleted';
  final holdings = <Holding>[];
  for (final (i, link) in ordered.indexed) {
    final until = _asHere(link.validity, model)?.until;
    // The next holding beginning right where this one ends says how it passed on.
    final next = until == null
        ? null
        : ordered.skip(i + 1).where((n) => n.validity?.from != null && n.validity!.from == until).firstOrNull;
    final endsElsewhere = _missing(link.validity?.until, model);
    final from = link.validity?.from;
    holdings.add(
      Holding(
        link: link,
        holderId: link.fromId,
        holderName: nameOf(link.fromId),
        how: link.how ?? '',
        began: _missing(from, model)
            ? 'at an event this timeline does not have'
            : (from != null ? whenWords(from, model) : (link.validity != null ? 'from the start' : 'no time given')),
        ended: until != null ? whenWords(until, model) : null,
        endHow: endsElsewhere
            ? 'the event it ends at does not happen in this timeline, so it goes on'
            : (link.endHow ?? (next != null ? _passed(next.how ?? '', nameOf(next.fromId)) : '')),
        timeless: link.validity == null || (link.validity!.from == null && link.validity!.until == null),
        inThisTimeline: !_missing(from, model),
      ),
    );
  }
  // Stretches with no holder recorded: one holding ends and the next begins later, in the same order of time.
  final unknown = <String>[];
  final counted = [
    for (final h in holdings)
      if (h.inThisTimeline) h,
  ];
  for (var i = 0; i < counted.length - 1; i++) {
    final a = counted[i];
    final b = counted[i + 1];
    final TravelPoint? end = pointOf(_asHere(a.link.validity, model)?.until, model);
    final TravelPoint? start = pointOf(b.link.validity?.from, model);
    if (end == null || start == null || end.isStory != start.isStory) continue;
    final later = end.isStory ? start.lo! > end.hi! : start.at! > end.at!;
    if (later) unknown.add('Not known between ${a.ended}${a.endHow.isNotEmpty ? ' (${a.endHow})' : ''} and ${b.began}');
  }
  final makers = [
    for (final l in model.links)
      if (connectionType(l.type).key == 'created-by' && l.fromId == itemId)
        (name: nameOf(l.toId), when: l.validity?.from != null ? whenWords(l.validity!.from, model) : 'no time given'),
  ];
  // Where it stands: the holdings that hold at that point, in this timeline.
  Truth holds(Holding h) => holdsAt(_asHere(h.link.validity, model), at, model);
  final holding = [
    for (final h in counted)
      if (holds(h) != Truth.no) h,
  ];
  // Held for certain, or perhaps: it changes hands during the point asked about, or a time cannot be compared with it.
  final surely = [
    for (final h in holding)
      if (holds(h) == Truth.yes) h.holderName,
  ];
  final perhaps = [
    for (final h in holding)
      if (holds(h) == Truth.unknown) h.holderName,
  ];
  final heldWords = [
    if (surely.isNotEmpty) 'Held by ${surely.join(' and ')}' else '',
    if (perhaps.isNotEmpty)
      '${surely.isNotEmpty ? '; perhaps also' : 'Perhaps held by'} ${perhaps.join(' and ')} (it changes hands at this '
          'point, or a time cannot be compared with it)'
    else
      '',
  ].join();
  final last = counted.lastOrNull;
  final lastEnd = last?.link.endHow;
  final ({String state, List<String> holders, String words}) now = counted.isEmpty
      ? (state: 'none', holders: const [], words: 'No owner recorded.')
      : holding.isNotEmpty
      ? (state: 'held', holders: [for (final h in holding) h.holderName], words: '$heldWords.')
      : at == null && lastEnd != null
      ? (
          state: 'ended',
          holders: const [],
          words: '${lastEnd[0].toUpperCase()}${lastEnd.substring(1)} (${last!.ended}, by ${last.holderName}).',
        )
      : (state: 'unknown', holders: const [], words: 'Who holds it then is not recorded.');
  return Ownership(item, makers, holdings, unknown, now);
}
