import '../model/story_model.dart';
import '../model/validity.dart';
import '../timeline/chronology.dart' show resolveChronology;
import '../timeline/narrative.dart' show nodeLabel;
import 'character_records.dart';

/// SECRETS AND KNOWLEDGE (as in the original app)
/// What each character holds of a secret, read only from what the author has recorded. Nothing is inferred: a
/// character with no record is "not recorded", never "unaware"; learning something later says nothing about not
/// knowing it before. A character's records are kept in the order things happen to them, each at a chapter or scene (where the reader sees
/// it) and at an event (when it happens in story time), read apart.

/// One character's records about a secret, in the order things happen to them.
List<KnowledgeRecord> recordsOf(CharacterSecret secret, String characterId) => [
  for (final r in secret.records)
    if (r.characterId == characterId) r,
];

/// Where a character stands now, at the end of everything recorded.
class Current {
  const Current(this.state, this.record, this.source);

  /// Null: nothing recorded about them (or a state this version does not know).
  final Awareness? state;

  /// Their last record, when the state comes from their records.
  final KnowledgeRecord? record;

  /// From their records, or from the simple lists (and "Does … know?" for the secret's own character); null when
  /// nothing is recorded.
  final CurrentSource? source;
}

enum CurrentSource { records, summary }

Current currentOf(CharacterSecret secret, String characterId) {
  final mine = recordsOf(secret, characterId);
  if (mine.isNotEmpty) return Current(mine.last.state, mine.last, CurrentSource.records);
  if (characterId == secret.entryId) return Current(_awareness(secret.self), null, CurrentSource.summary);
  for (final k in Knowledge.values) {
    if (secret.listed(k).contains(characterId)) return Current(_awareness(k), null, CurrentSource.summary);
  }
  return const Current(null, null, null);
}

Awareness _awareness(Knowledge k) => switch (k) {
  Knowledge.knows => Awareness.knows,
  Knowledge.suspects => Awareness.suspects,
  Knowledge.unaware => Awareness.unaware,
};

/// Everyone a secret names: its own character first, then in the order they come into its records, then the simple
/// lists.
List<String> peopleOf(CharacterSecret secret) {
  final ids = <String?>[
    secret.entryId,
    for (final r in secret.records) ...[r.characterId, r.fromId],
    for (final n in secret.needs) n.characterId,
    ...secret.knows,
    ...secret.suspects,
    ...secret.unaware,
  ];
  return {
    for (final id in ids)
      if (id != null && id.isNotEmpty) id,
  }.toList();
}

/// Who stands where now, by state in a fixed order; those named with nothing recorded come last.
List<({Awareness? state, List<String> ids})> whoKnowsWhat(CharacterSecret secret, [List<String>? ids]) {
  final people = ids ?? peopleOf(secret);
  final now = {for (final id in people) id: currentOf(secret, id).state};
  return [
    for (final state in <Awareness?>[...Awareness.values, null])
      if (people.where((id) => now[id] == state).toList() case final group when group.isNotEmpty)
        (state: state, ids: group),
  ];
}

/// A state in a few words, to follow a name ("Mira is unaware"), with their version when there is one.
String stateWords(Awareness state, String belief) =>
    '${state == Awareness.unaware ? 'is unaware' : state.label.toLowerCase()}'
    '${belief.trim().isNotEmpty ? ' (“${belief.trim()}”)' : ''}';

// ---------------------------------------------------------------------------------------------------- along an axis

/// Reading order (chapters and scenes) or story time (events): read apart, as the rest of the app keeps them.
enum KnowledgeAxis {
  reading('As the reader goes (chapters and scenes)'),
  story('In story time (events)');

  const KnowledgeAxis(this.label);
  final String label;
}

String? _placeOf(String? nodeId, String? eventId, KnowledgeAxis axis) =>
    axis == KnowledgeAxis.reading ? nodeId : eventId;

/// Where something is, against a point on the same axis: at or before it, after it, not known, or not placed on this
/// axis at all.
enum PointOrder { before, after, unknown, unplaced }

/// Compares a place with a point. In reading order, chapters and scenes are simply in sequence. In story time, an
/// event is before another only when the dates say so for certain: two events on the same day, or one with no date,
/// are not known to be in either order.
PointOrder compareTo(String? placeId, String pointId, KnowledgeAxis axis, TimeContext context) {
  if (placeId == null) return PointOrder.unplaced;
  if (axis == KnowledgeAxis.reading) {
    final at = context.position[placeId];
    if (at == null) return PointOrder.unplaced;
    if (placeId == pointId) return PointOrder.before;
    final point = context.position[pointId];
    return point == null ? PointOrder.unknown : (at <= point ? PointOrder.before : PointOrder.after);
  }
  if (!context.events.containsKey(placeId)) return PointOrder.unplaced;
  if (placeId == pointId) return PointOrder.before;
  final a = spanOfEvent(placeId, context);
  final b = spanOfEvent(pointId, context);
  if (a == null || b == null) return PointOrder.unknown;
  if (a.hi < b.lo) return PointOrder.before;
  if (a.lo > b.hi) return PointOrder.after;
  return PointOrder.unknown;
}

/// Where a character stands at a point, from their records alone: the record in force (their last one placed at or
/// before the point), and whether that is [settled] (no later record of theirs could already be in force there).
({KnowledgeRecord? record, bool settled}) standingAt(
  List<KnowledgeRecord> records,
  String pointId,
  KnowledgeAxis axis,
  TimeContext context,
) {
  final orders = [for (final r in records) compareTo(_placeOf(r.nodeId, r.eventId, axis), pointId, axis, context)];
  final last = orders.lastIndexOf(PointOrder.before);
  return (record: last < 0 ? null : records[last], settled: orders.skip(last + 1).every((o) => o == PointOrder.after));
}

/// Where a record or mark is, in words: its chapter or scene and its event, as far as each is given.
String placeWords(String? nodeId, String? eventId, StoryModel model) {
  final parts = [
    if (nodeId != null && model.nodes.containsKey(nodeId)) 'in ${nodeLabel(model, nodeId)}',
    if (eventId != null && model.events.containsKey(eventId)) 'at “${model.events[eventId]!.name}”',
  ];
  return parts.isEmpty ? 'with no chapter or event given' : parts.join(', ');
}

/// A record read aloud: "Mira knows part of it (“…”) in Chapter 3, at “The feast”: overheard, from Kai."
String recordWords(KnowledgeRecord record, StoryModel model) {
  String name(String id) => model.entries[id]?.name ?? 'Someone';
  final how = [
    if (record.how.trim().isNotEmpty) record.how.trim(),
    if (record.fromId != null) 'from ${name(record.fromId!)}',
  ].join(', ');
  final state = record.state;
  final words = state == null ? 'is recorded' : stateWords(state, record.belief);
  return '${name(record.characterId)} $words ${placeWords(record.nodeId, record.eventId, model)}'
      '${how.isNotEmpty ? ': $how' : ''}';
}

// ---------------------------------------------------------------------------------------------------- the spread

class SpreadPoint {
  SpreadPoint(this.id, this.label, this.marks);
  final String id;
  final String label;

  /// The secret first figures here (`first`), or comes out here (`reveal`).
  final List<String> marks;
}

class SpreadCell {
  SpreadCell(this.record, this.here, this.needs);

  /// The record in force here (null: none yet).
  final KnowledgeRecord? record;

  /// Records placed at this very point.
  final List<KnowledgeRecord> here;

  /// Marks that they act on it here.
  final List<KnowledgeNeed> needs;
}

class SpreadRow {
  SpreadRow(this.characterId, this.name, this.cells, this.now, this.unplaced);
  final String characterId;
  final String name;
  final List<SpreadCell> cells;
  final Current now;

  /// Their records with no place on this axis: in their history, but not at any point of it.
  final List<KnowledgeRecord> unplaced;
}

class Spread {
  Spread(this.axis, this.points, this.rows, this.tellings);
  final KnowledgeAxis axis;
  final List<SpreadPoint> points;
  final List<SpreadRow> rows;

  /// Who told whom, and at which point (an index into [points]).
  final List<({String recordId, String fromId, String toId, int point})> tellings;
}

/// How knowledge of a secret spreads along one axis: a column for every chapter or scene (or event) a record or mark is
/// placed at, and where the secret first figures and comes out; a row for everyone it names; in each cell the record
/// in force there. Who told whom is drawn where it happens.
Spread knowledgeSpread(CharacterSecret secret, StoryModel model, KnowledgeAxis axis) {
  final context = model.timeContext;
  bool exists(String? id) =>
      id != null && (axis == KnowledgeAxis.reading ? model.nodes.containsKey(id) : model.events.containsKey(id));
  final records = secret.records;
  final needs = secret.needs;
  final marks = <String, List<String>>{};
  for (final (nodeId, eventId) in [
    for (final r in records) (r.nodeId, r.eventId),
    for (final n in needs) (n.nodeId, n.eventId),
  ]) {
    final at = _placeOf(nodeId, eventId, axis);
    if (exists(at)) marks.putIfAbsent(at!, () => []);
  }
  void mark(String? id, String kind) {
    if (!exists(id)) return;
    (marks[id!] ??= []).add(kind);
  }

  if (axis == KnowledgeAxis.reading) {
    mark(secret.firstNodeId, 'first');
    mark(secret.revealNodeId, 'reveal');
  } else {
    mark(secret.revealEventId, 'reveal');
  }
  final chronology = axis == KnowledgeAxis.story
      ? {for (final (i, p) in resolveChronology(model.events.values, model.calendar).indexed) p.event.id: i}
      : null;
  int rank(String id) => (chronology != null ? chronology[id] : context.position[id]) ?? 1 << 53;
  final ids = marks.keys.toList()
    ..sort((a, b) {
      final c = rank(a).compareTo(rank(b));
      return c != 0 ? c : a.compareTo(b);
    });
  final points = [
    for (final id in ids)
      SpreadPoint(id, axis == KnowledgeAxis.reading ? nodeLabel(model, id) : model.events[id]!.name, marks[id]!),
  ];
  final index = {for (final (i, p) in points.indexed) p.id: i};
  final people = [
    for (final id in peopleOf(secret))
      if (model.entries.containsKey(id)) id,
  ];
  final rows = [
    for (final id in people)
      () {
        final mine = recordsOf(secret, id);
        return SpreadRow(
          id,
          model.entries[id]!.name,
          [
            for (final p in points)
              SpreadCell(
                standingAt(mine, p.id, axis, context).record,
                [
                  for (final r in mine)
                    if (_placeOf(r.nodeId, r.eventId, axis) == p.id) r,
                ],
                [
                  for (final n in needs)
                    if (n.characterId == id && _placeOf(n.nodeId, n.eventId, axis) == p.id) n,
                ],
              ),
          ],
          currentOf(secret, id),
          [
            for (final r in mine)
              if (!exists(_placeOf(r.nodeId, r.eventId, axis))) r,
          ],
        );
      }(),
  ];
  final tellings = [
    for (final r in records)
      if (r.fromId != null && people.contains(r.fromId) && index.containsKey(_placeOf(r.nodeId, r.eventId, axis) ?? ''))
        (recordId: r.id, fromId: r.fromId!, toId: r.characterId, point: index[_placeOf(r.nodeId, r.eventId, axis)]!),
  ];
  return Spread(axis, points, rows, tellings);
}

// ---------------------------------------------------------------------------------------------------- checks

/// The only two things checked, each from a stated rule and only when the author's records hold what it needs. A
/// record placed at or before the point is needed, and nothing of theirs later that could already be in force there:
/// when it cannot be told, there is no finding.
enum KnowledgeRule {
  needs(
    'Acts on it while not knowing it',
    'A character you mark as acting on a secret at a point must not be recorded there as unaware of it, or as '
        'believing something false instead.',
    'Your mark that they act on it, and a record of theirs at or before that point, with nothing of theirs later that '
        'could already be in force there.',
  ),
  told(
    'Learns it from someone who did not know',
    'A character recorded as learning a secret from someone cannot learn it from a person recorded as unaware of it '
        'at that point.',
    'A record saying who they learned it from, placed at a chapter or event, and a record of the teller’s at or '
        'before it.',
  );

  const KnowledgeRule(this.title, this.rule, this.requires);
  final String title;
  final String rule;

  /// What the records must hold for it to be checked.
  final String requires;
}

class KnowledgeFinding {
  KnowledgeFinding({
    required this.key,
    required this.rule,
    required this.secretId,
    required this.ownerId,
    required this.message,
    required this.because,
    required this.characterIds,
  });

  /// The same for the same finding on every run, so a decision about it holds.
  final String key;
  final KnowledgeRule rule;
  final String secretId;

  /// The character whose secret it is: where it is edited.
  final String ownerId;
  final String message;
  final String because;
  final List<String> characterIds;
}

/// Every finding for a novel's secrets. Reads only: nothing about anyone's knowledge is changed.
List<KnowledgeFinding> checkKnowledge(List<CharacterSecret> secrets, StoryModel model) {
  final context = model.timeContext;
  String name(String id) => model.entries[id]?.name ?? 'Someone';
  String where(String id, KnowledgeAxis axis) =>
      axis == KnowledgeAxis.reading ? nodeLabel(model, id) : '“${model.events[id]?.name ?? 'an event'}”';
  bool exists(String? id, KnowledgeAxis axis) =>
      id != null && (axis == KnowledgeAxis.reading ? model.nodes.containsKey(id) : model.events.containsKey(id));
  final findings = <KnowledgeFinding>[];
  for (final secret in secrets) {
    final title = '“${secret.title}”';
    for (final need in secret.needs) {
      // A character deleted from the Codex leaves nothing to check.
      if (!model.entries.containsKey(need.characterId)) continue;
      for (final axis in KnowledgeAxis.values) {
        final at = _placeOf(need.nodeId, need.eventId, axis);
        if (!exists(at, axis)) continue;
        final (:record, :settled) = standingAt(recordsOf(secret, need.characterId), at!, axis, context);
        if (record == null ||
            !settled ||
            (record.state != Awareness.unaware && record.state != Awareness.falseBelief)) {
          continue;
        }
        findings.add(
          KnowledgeFinding(
            key: ['knowledge', 'needs', secret.id, need.id, axis.name].join('|'),
            rule: KnowledgeRule.needs,
            secretId: secret.id,
            ownerId: secret.entryId,
            message:
                '${name(need.characterId)} acts on $title ${axis == KnowledgeAxis.reading ? 'in' : 'at'} '
                '${where(at, axis)}, but is recorded as '
                '${record.state == Awareness.unaware ? 'unaware of it' : 'believing something false'} there.',
            because:
                'Your mark: ${need.note.trim().isNotEmpty ? '“${need.note.trim()}”' : 'acts on it'}, '
                '${placeWords(need.nodeId, need.eventId, model)}. Their record: ${recordWords(record, model)}. No later '
                'record of theirs is placed at or before it.',
            characterIds: [need.characterId],
          ),
        );
      }
    }
    for (final learned in secret.records) {
      final fromId = learned.fromId;
      if (fromId == null ||
          learned.state == Awareness.unaware ||
          !model.entries.containsKey(learned.characterId) ||
          !model.entries.containsKey(fromId)) {
        continue;
      }
      for (final axis in KnowledgeAxis.values) {
        final at = _placeOf(learned.nodeId, learned.eventId, axis);
        if (!exists(at, axis)) continue;
        final (:record, :settled) = standingAt(recordsOf(secret, fromId), at!, axis, context);
        if (record == null || !settled || record.state != Awareness.unaware) continue;
        findings.add(
          KnowledgeFinding(
            key: ['knowledge', 'told', secret.id, learned.id, axis.name].join('|'),
            rule: KnowledgeRule.told,
            secretId: secret.id,
            ownerId: secret.entryId,
            message:
                '${name(learned.characterId)} learns $title from ${name(fromId)} '
                '${axis == KnowledgeAxis.reading ? 'in' : 'at'} ${where(at, axis)}, but ${name(fromId)} is recorded as '
                'unaware of it there.',
            because:
                'Learning it: ${recordWords(learned, model)}. The teller’s record: ${recordWords(record, model)}. No later '
                'record of the teller’s is placed at or before it.',
            characterIds: [learned.characterId, fromId],
          ),
        );
      }
    }
  }
  return findings;
}
