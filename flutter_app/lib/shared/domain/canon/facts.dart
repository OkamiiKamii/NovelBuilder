import '../json.dart';
import '../records/canon.dart';

/// CANON STATEMENTS (as in the original app): what is claimed about the fictional world, where it was established, and
/// where it stands. The status is the author's alone; nothing here sets or prefers one.

/// The order statuses are listed in: what needs a decision first, then what is true, then what is set aside.
const statusOrder = [
  CanonStatus.conflicting,
  CanonStatus.canon,
  CanonStatus.provisional,
  CanonStatus.retconned,
  CanonStatus.nonCanon,
];

/// Statuses whose wording is on the record: changing it is a retcon, kept in the history.
const established = [CanonStatus.canon, CanonStatus.conflicting];

/// Statuses that take part in the story's current truth, and so can contradict it.
const inPlay = [CanonStatus.canon, CanonStatus.conflicting, CanonStatus.provisional];

/// Statuses that set something aside: not part of the story as it stands.
const setAside = [CanonStatus.retconned, CanonStatus.nonCanon];

const factKinds = ['lore', 'attribute', 'rule', 'story'];
const factKindLabels = {
  'lore': 'Lore statement',
  'attribute': 'Attribute',
  'rule': 'World rule',
  'story': 'Story fact',
};

const sourceTypes = ['chapter', 'entry', 'event', 'note'];
const sourceLabels = {
  'chapter': 'Chapter or scene',
  'entry': 'Codex entry',
  'event': 'Timeline event',
  'note': 'Somewhere else',
};

/// Where a fact was established. Points at a chapter, scene, codex entry or timeline event by id; never copies or
/// changes it.
class FactSource {
  FactSource(this.raw);
  final JsonMap raw;

  String get id => str(raw['id']);
  String get type => sourceTypes.contains(raw['type']) ? raw['type']! as String : 'note';

  /// The chapter, scene, entry or event. Null for a free-text source.
  String? get refId => idOrNull(raw['refId']);

  /// For manuscript sources: which paragraph (counting from 0, as the editor does). Null when not pinned to one.
  int? get block => switch (raw['block']) {
    final num n when n >= 0 => n.toInt(),
    _ => null,
  };

  /// The words that establish the fact, as they stood when the source was recorded.
  String get quote => str(raw['quote']);
  String get note => str(raw['note']);
}

/// A possible contradiction the author has looked at and set aside: with another fact, or with a field on a codex
/// entry.
typedef Dismissal = ({String? factId, String? entryId, String? field});

/// Everything a statement holds, read: its sources, what it was set aside from, and its history.
extension FactParts on CanonFact {
  List<FactSource> get factSources => [for (final s in sources) FactSource(s)];
  List<Dismissal> get dismissed => [
    for (final d in maps(raw['dismissed']))
      (factId: idOrNull(d['factId']), entryId: idOrNull(d['entryId']), field: strOrNull(d['field'])),
  ];
  String get notes => str(raw['notes']);
  num get createdAt => numOrNull(raw['createdAt']) ?? 0;

  /// "Royal Academy foundation: Founded 1,000 years ago", quoted and kept short.
  String get words => '${subject.trim().isNotEmpty ? '${subject.trim()}: ' : ''}$statement';
}

/// Text in quotation marks, at most about ninety characters.
String quoted(String text) {
  final t = text.trim();
  return '“${t.length > 90 ? '${t.substring(0, 88)}…' : t}”';
}
