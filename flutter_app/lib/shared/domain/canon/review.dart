import '../collation.dart';
import '../continuity/rules.dart' show filledFields;
import '../records/canon.dart';
import '../records/category.dart';
import '../records/entry.dart';
import '../records/story_node.dart';
import '../stable_sort.dart';
import '../text/fold.dart' show nfkdWords;
import 'facts.dart';

/// One thing the canon review noticed about a statement.
class Flag {
  Flag({required this.key, required this.kind, required this.message, this.otherId, this.dismiss});

  /// Stable within a fact, for lists and for telling flags apart.
  final String key;

  /// `fact`, `field` or `unpaired`.
  final String kind;
  final String message;

  /// The other fact, when the flag is about one.
  final String? otherId;

  /// How to set this flag aside, when it can be.
  final Dismissal? dismiss;
}

class FactReview {
  FactReview(this.fact, this.flags);
  final CanonFact fact;
  final List<Flag> flags;
}

/// One possible contradiction between two facts, listed once. [stated]: the author linked them, rather than the
/// comparison noticing.
typedef FactPair = ({CanonFact a, CanonFact b, bool stated});

/// Compares wording loosely: case, punctuation and spacing do not make two statements different.
String normalize(String text) => nfkdWords(text);

/// "Chapter 4" for where a fact was established, when it names a chapter or scene that still exists.
String? _establishedIn(CanonFact fact, Map<String, StoryNode> nodes) {
  final source = fact.factSources.where((s) => s.type == 'chapter' && nodes.containsKey(s.refId)).firstOrNull;
  return source == null ? null : nodes[source.refId]!.title;
}

bool _isDismissed(CanonFact fact, Dismissal other) => fact.dismissed.any(
  (d) => other.factId != null
      ? d.factId == other.factId
      : d.entryId == other.entryId && normalize(d.field ?? '') == normalize(other.field ?? ''),
);

/// Two facts are about the same thing when they share a subject and are not tied to different codex entries.
bool _sameSubject(CanonFact a, CanonFact b) {
  if (normalize(a.subject).isEmpty || normalize(a.subject) != normalize(b.subject)) return false;
  return a.entryIds.isEmpty || b.entryIds.isEmpty || a.entryIds.any(b.entryIds.contains);
}

/// AUTHORIAL PRIMACY PRINCIPLE (as in the original app)
/// Looks for statements that may contradict one another and describes what it sees. It changes nothing, and each
/// message says "appears to", because only the author knows whether two statements really disagree, which of them
/// stands, or whether it matters. What it notices:
///  - two statements in play (canon, conflicting or provisional) with the same subject, about the same thing, worded
///    differently, at least one of them established;
///  - two facts the author has linked as contradicting, while both are in play;
///  - a statement that differs from a field of the same name on a codex entry it is about.
({List<FactReview> reviews, List<FactPair> pairs}) reviewCanon(
  List<CanonFact> facts,
  List<Entry> entries,
  List<StoryNode> nodes, [
  Category? Function(String key)? categoryOf,
]) {
  final nodeById = {for (final n in nodes) n.id: n};
  final entryById = {for (final e in entries) e.id: e};
  final flags = {for (final f in facts) f.id: <Flag>[]};
  final pairs = <FactPair>[];
  // Oldest first, so the same contradictions are always listed in the same order.
  final playing = stableSorted(facts.where((f) => inPlay.contains(f.status)), (a, b) {
    final c = a.createdAt.compareTo(b.createdAt);
    return c != 0 ? c : localeCompare(a.id, b.id);
  });

  String describe(CanonFact other) {
    final where = _establishedIn(other, nodeById);
    if (established.contains(other.status)) {
      return 'This statement appears to conflict with '
          '${where != null ? 'established canon in $where' : 'another statement marked ${other.status.label}'}: '
          '${quoted(other.statement)}.';
    }
    return 'A ${other.status.label.toLowerCase()} statement appears to differ from this one: ${quoted(other.statement)}.';
  }

  for (var i = 0; i < playing.length; i++) {
    for (var j = i + 1; j < playing.length; j++) {
      final a = playing[i];
      final b = playing[j];
      final stated = a.conflictsWith.contains(b.id) || b.conflictsWith.contains(a.id);
      final noticed =
          (established.contains(a.status) || established.contains(b.status)) &&
          _sameSubject(a, b) &&
          normalize(a.statement) != normalize(b.statement) &&
          normalize(a.statement).isNotEmpty &&
          normalize(b.statement).isNotEmpty;
      if (!stated && !noticed) continue;
      // A link the author made stays until they remove it; something merely noticed can be set aside.
      if (!stated &&
          (_isDismissed(a, (factId: b.id, entryId: null, field: null)) ||
              _isDismissed(b, (factId: a.id, entryId: null, field: null)))) {
        continue;
      }
      pairs.add((a: a, b: b, stated: stated));
      flags[a.id]!.add(
        Flag(
          key: 'fact:${b.id}',
          kind: 'fact',
          otherId: b.id,
          message: describe(b),
          dismiss: stated ? null : (factId: b.id, entryId: null, field: null),
        ),
      );
      flags[b.id]!.add(
        Flag(
          key: 'fact:${a.id}',
          kind: 'fact',
          otherId: a.id,
          message: describe(a),
          dismiss: stated ? null : (factId: a.id, entryId: null, field: null),
        ),
      );
    }
  }

  for (final fact in playing) {
    final subject = normalize(fact.subject);
    final statement = normalize(fact.statement);
    if (subject.isEmpty || statement.isEmpty) continue;
    for (final entryId in fact.entryIds) {
      final entry = entryById[entryId];
      if (entry == null) continue;
      final category = categoryOf?.call(entry.category) ?? Category.unknown(entry.category);
      for (final field in filledFields(entry, category, (id) => entryById[id]?.name)) {
        final value = normalize(field.text);
        if (normalize(field.label) != subject || value.isEmpty) continue;
        // "Alex is 19" agrees with a field that says "19".
        if (' $statement '.contains(' $value ') || ' $value '.contains(' $statement ')) continue;
        final Dismissal dismiss = (factId: null, entryId: entryId, field: field.label);
        if (_isDismissed(fact, dismiss)) continue;
        flags[fact.id]!.add(
          Flag(
            key: 'field:$entryId:${normalize(field.label)}',
            kind: 'field',
            message:
                "This statement appears to differ from ${entry.name}'s codex profile, which gives ${field.label} as "
                '${quoted(field.text)}.',
            dismiss: dismiss,
          ),
        );
      }
    }
  }

  for (final fact in facts) {
    if (fact.status == CanonStatus.conflicting && flags[fact.id]!.isEmpty) {
      flags[fact.id]!.add(
        Flag(
          key: 'unpaired',
          kind: 'unpaired',
          message: 'Marked Conflicting, with no other statement linked or noticed as the one it contradicts.',
        ),
      );
    }
  }

  return (reviews: [for (final f in facts) FactReview(f, flags[f.id]!)], pairs: pairs);
}

/// A source named the way a reader would cite it: "Chapter 14 (paragraph 120)", "Alex (Character profile)". [missing]:
/// the thing it points at is gone; the source is kept as a record.
({String label, bool missing}) describeSource(
  FactSource source, {
  required StoryNode? Function(String id) node,
  required Entry? Function(String id) entry,
  required String? Function(String id) event,
  required Category? Function(String key) category,
}) {
  final refId = source.refId;
  if (source.type == 'note' || refId == null) {
    return (label: source.note.trim().isNotEmpty ? source.note.trim() : 'Unspecified source', missing: false);
  }
  if (source.type == 'chapter') {
    final n = node(refId);
    return (
      label: n != null
          ? '${n.title}${source.block != null ? ' (paragraph ${source.block! + 1})' : ''}'
          : 'A chapter or scene that was removed',
      missing: n == null,
    );
  }
  if (source.type == 'entry') {
    final e = entry(refId);
    return (
      label: e != null
          ? '${e.name} (${(category(e.category) ?? Category.unknown(e.category)).singular} profile)'
          : 'A codex entry that was removed',
      missing: e == null,
    );
  }
  final name = event(refId);
  return (label: name != null ? '$name (Timeline event)' : 'A timeline event that was removed', missing: name == null);
}
