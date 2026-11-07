import '../codex/codex_changes.dart' show ChangeRefused, RecordChanges;
import '../json.dart';
import '../manuscript/prose.dart' show docBlocks;
import '../records/canon.dart';
import 'facts.dart';
import 'review.dart' show normalize;

/// The collections a change to canon statements or continuity rules reads and writes.
const canonCollections = {
  'canonFacts',
  'continuityRules',
  'continuityResolutions',
  'loreEntries',
  'loreSchemas',
  'chapters',
  'chapterContents',
  'timelineEvents',
};

const _sourceTables = {'chapter': 'chapters', 'entry': 'loreEntries', 'event': 'timelineEvents'};

/// Canon statements, as in the original's canon service. A statement's status is set by the author alone, and every
/// move is added to its history; the wording of an established statement is only ever revised (a retcon), never
/// overwritten, and nothing in its history is erased.
class CanonChanges extends RecordChanges {
  CanonChanges(super.snapshot, {required super.now, required super.createId});

  List<CanonFact> facts() => [for (final r in rows('canonFacts')) CanonFact(r)];

  CanonFact owned(String factId) =>
      CanonFact(row('canonFacts', factId) ?? (throw ChangeRefused('That canon statement is not in this novel.')));

  /// Keeps only ids of this novel's rows in [table], once each.
  List<String> _existing(String table, Object? ids) => [
    for (final id in {...strings(ids)})
      if (row(table, id) != null) id,
  ];

  void _edit(String factId, JsonMap Function(CanonFact fact) change) {
    final fact = owned(factId);
    final changes = change(fact);
    if (changes.isNotEmpty) put('canonFacts', {...fact.toJson(), ...changes, 'updatedAt': now});
  }

  List<JsonMap> _withStep(CanonFact fact, JsonMap step) => [
    ...fact.history,
    {'id': newId(), 'at': now, ...step},
  ];

  /// Records a new statement. It starts as Provisional unless the author says otherwise.
  CanonFact create({
    String subject = '',
    String statement = '',
    CanonStatus status = CanonStatus.provisional,
    String kind = 'lore',
    List<String> entryIds = const [],
  }) {
    final words = statement.trim();
    final fact = {
      'id': newId(),
      'projectId': projectId,
      'subject': subject.trim().isEmpty ? 'New fact' : subject.trim(),
      'statement': words,
      'kind': factKinds.contains(kind) ? kind : 'lore',
      'status': status.key,
      'entryIds': _existing('loreEntries', entryIds),
      'sources': <Object?>[],
      'conflictsWith': <Object?>[],
      'replacedById': null,
      'dismissed': <Object?>[],
      'history': [
        {'id': newId(), 'at': now, 'kind': 'created', 'statement': words, 'toStatus': status.key, 'reason': ''},
      ],
      'notes': '',
      'createdAt': now,
      'updatedAt': now,
    };
    put('canonFacts', fact);
    return CanonFact(fact);
  }

  /// Changes details that are not part of the record. The wording of a statement that is Canon or Conflicting cannot
  /// be changed here: [revise] it, so the earlier wording is kept.
  void update(
    String factId, {
    String? subject,
    String? statement,
    String? kind,
    List<String>? entryIds,
    ({String? value})? replacedById,
    String? notes,
  }) => _edit(factId, (fact) {
    final next = <String, Object?>{};
    if (subject != null) next['subject'] = subject.trim().isEmpty ? 'Untitled fact' : subject.trim();
    if (notes != null) next['notes'] = notes;
    if (kind != null && factKinds.contains(kind)) next['kind'] = kind;
    if (statement != null && statement != fact.statement) {
      if (established.contains(fact.status)) {
        throw ChangeRefused(
          'This statement is on the record. Revise it, so the earlier wording is kept in its history.',
        );
      }
      next['statement'] = statement;
    }
    if (entryIds != null) next['entryIds'] = _existing('loreEntries', entryIds);
    if (replacedById != null) {
      final id = replacedById.value;
      next['replacedById'] = id != null && id != factId && row('canonFacts', id) != null ? id : null;
    }
    return next;
  });

  /// Moves a statement to another canon status, because the author chose it; the move is added to its history.
  void setStatus(String factId, CanonStatus status, {String reason = ''}) => _edit(factId, (fact) {
    if (status == fact.status) return const {};
    return {
      'status': status.key,
      'history': _withStep(fact, {
        'kind': 'status',
        'statement': fact.statement,
        'fromStatus': fact.status.key,
        'toStatus': status.key,
        'reason': reason.trim(),
      }),
    };
  });

  /// Replaces a statement's wording and keeps what it said before. For one that is Canon or Conflicting this is a
  /// retcon; [minor] records a correction of wording instead. Nothing is ever erased.
  void revise(String factId, String statement, {String reason = '', bool minor = false}) => _edit(factId, (fact) {
    final words = statement.trim();
    if (words.isEmpty || words == fact.statement) return const {};
    return {
      'statement': words,
      'history': _withStep(fact, {
        'kind': established.contains(fact.status) && !minor ? 'retcon' : 'reworded',
        'statement': fact.statement,
        'newStatement': words,
        'fromStatus': fact.status.key,
        'reason': reason.trim(),
      }),
    };
  });

  /// Adds to or corrects the reason noted on a step of the history. The step itself stays as it was recorded.
  void annotate(String factId, String stepId, String reason) => _edit(factId, (fact) {
    if (!fact.history.any((c) => c['id'] == stepId)) return const {};
    return {
      'history': [
        for (final c in fact.history) c['id'] == stepId ? {...c, 'reason': reason} : c,
      ],
    };
  });

  /// Which paragraph of a chapter or scene contains [quote], as the text is saved now.
  int? locate(String nodeId, String quote) {
    final wanted = normalize(quote);
    if (wanted.isEmpty || row('chapters', nodeId) == null) return null;
    final blocks = docBlocks(row('chapterContents', nodeId)?['doc']);
    final index = blocks.indexWhere((b) => normalize(b.text).contains(wanted));
    return index < 0 ? null : index;
  }

  /// Records where a statement was established. For a chapter or scene, a quote is looked up in the saved text to pin
  /// the source to its paragraph. A source that points nowhere is kept as the author's own note.
  FactSource addSource(
    String factId, {
    String type = 'note',
    String? refId,
    int? block,
    String quote = '',
    String note = '',
  }) {
    final kind = sourceTypes.contains(type) ? type : 'note';
    final table = _sourceTables[kind];
    final ref = table == null || refId == null || row(table, refId) == null ? null : refId;
    var at = block != null && block >= 0 ? block : null;
    if (kind != 'chapter' || ref == null) {
      at = null;
    } else if (at == null && quote.trim().isNotEmpty) {
      at = locate(ref, quote);
    }
    final source = {
      'id': newId(),
      'type': ref != null ? kind : 'note',
      'refId': ref,
      'block': at,
      'quote': quote.trim(),
      'note': note.trim(),
      'createdAt': now,
    };
    _edit(
      factId,
      (fact) => {
        'sources': [...fact.sources, source],
      },
    );
    return FactSource(source);
  }

  void removeSource(String factId, String sourceId) => _edit(
    factId,
    (fact) => {
      'sources': [
        for (final s in fact.sources)
          if (s['id'] != sourceId) s,
      ],
    },
  );

  /// The author says these two statements contradict each other. Neither status is changed.
  void linkConflict(String factId, String otherId) => _edit(factId, (fact) {
    if (otherId == factId || row('canonFacts', otherId) == null || fact.conflictsWith.contains(otherId)) {
      return const {};
    }
    return {
      'conflictsWith': [...fact.conflictsWith, otherId],
    };
  });

  /// Removes the link, whichever of the two holds it.
  void unlinkConflict(String factId, String otherId) {
    for (final (a, b) in [(factId, otherId), (otherId, factId)]) {
      _edit(
        a,
        (fact) => fact.conflictsWith.contains(b)
            ? {
                'conflictsWith': [
                  for (final id in fact.conflictsWith)
                    if (id != b) id,
                ],
              }
            : const {},
      );
    }
  }

  /// The author has looked at a possible contradiction and set it aside.
  void dismiss(String factId, Dismissal dismissal) => _edit(factId, (fact) {
    final clean = dismissal.factId != null
        ? {'factId': dismissal.factId}
        : {'entryId': dismissal.entryId, 'field': dismissal.field};
    final ok = dismissal.factId != null || (dismissal.entryId != null && dismissal.field != null);
    final current = maps(fact.raw['dismissed']).toList();
    if (!ok || current.any((d) => jsonEquals(d, clean))) return const {};
    return {
      'dismissed': [...current, clean],
    };
  });

  /// Brings back everything set aside for this statement, including what was set aside from the other side.
  void undismiss(String factId) {
    _edit(factId, (_) => {'dismissed': <Object?>[]});
    for (final other in facts()) {
      final kept = [
        for (final d in maps(other.raw['dismissed']))
          if (d['factId'] != factId) d,
      ];
      if (kept.length != maps(other.raw['dismissed']).length) {
        put('canonFacts', {...other.toJson(), 'dismissed': kept});
      }
    }
  }

  /// Deletes a statement and its whole history. To keep the record, mark it Non-Canon or Retconned instead.
  void removeFact(String factId) {
    owned(factId);
    remove('canonFacts', factId);
  }
}
