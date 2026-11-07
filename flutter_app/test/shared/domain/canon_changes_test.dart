// The original app's canon and continuity services (src/modules/canon/canon.test.ts, continuity.test.ts) ported:
// statements keep their history, nothing established is overwritten, and "Update canon" changes only what it says.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/canon/canon_changes.dart';
import 'package:novel_builder/shared/domain/canon/facts.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/continuity/continuity_changes.dart';
import 'package:novel_builder/shared/domain/continuity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

class Novel {
  NovelSnapshot snapshot = NovelSnapshot(project: {'id': 'novel', 'title': 'Canon'}, collections: const {});
  int clock = 1000;
  int _ids = 0;

  T canon<T>(T Function(CanonChanges c) change) {
    final c = CanonChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  T rules<T>(T Function(ContinuityChanges c) change) {
    final c = ContinuityChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  T codex<T>(T Function(CodexChanges c) change) {
    final c = CodexChanges(snapshot, now: ++clock, createId: () => 'id${++_ids}');
    final result = change(c);
    snapshot = c.snapshot;
    return result;
  }

  CanonFact fact(String id) => CanonFact(snapshot.rows('canonFacts').firstWhere((f) => f['id'] == id));
}

void main() {
  test('a statement starts Provisional; an established one is revised, never overwritten, and its history kept', () {
    final n = Novel();
    final f = n.canon((c) => c.create(subject: 'Royal Academy', statement: 'Founded 1,000 years ago'));
    expect(f.status, CanonStatus.provisional);
    n.canon((c) => c.update(f.id, statement: 'Founded 900 years ago'));
    n.canon((c) => c.setStatus(f.id, CanonStatus.canon, reason: 'Decided'));
    expect(() => n.canon((c) => c.update(f.id, statement: 'Founded 500 years ago')), throwsA(isA<ChangeRefused>()));
    n.canon((c) => c.revise(f.id, 'Founded 500 years ago', reason: 'Book two'));
    final history = n.fact(f.id).history;
    expect([for (final h in history) h['kind']], ['created', 'status', 'retcon']);
    expect(
      [history.last['statement'], history.last['newStatement'], history.last['reason']],
      ['Founded 900 years ago', 'Founded 500 years ago', 'Book two'],
    );
    n.canon((c) => c.annotate(f.id, str(history[1]['id']), 'Settled in the outline'));
    expect(n.fact(f.id).history[1]['reason'], 'Settled in the outline');
    expect(n.fact(f.id).history[1]['toStatus'], 'canon', reason: 'the step itself is unchanged');
  });

  test('a source in a chapter is pinned to the paragraph its quote is in; one pointing nowhere is a note', () {
    final n = Novel();
    n.snapshot = n.snapshot
        .putRow('chapters', {'id': 'c1', 'projectId': 'novel', 'kind': 'chapter', 'title': 'Chapter 1', 'order': 0})
        .putRow('chapterContents', {
          'id': 'c1',
          'projectId': 'novel',
          'doc': textToDoc('First.\nThe Academy was founded long ago.'),
        });
    final f = n.canon((c) => c.create(statement: 'Old'));
    final s = n.canon((c) => c.addSource(f.id, type: 'chapter', refId: 'c1', quote: 'founded LONG ago'));
    expect([s.type, s.block], ['chapter', 1]);
    final lost = n.canon((c) => c.addSource(f.id, type: 'event', refId: 'gone', note: 'my notebook'));
    expect([lost.type, lost.refId, lost.note], ['note', null, 'my notebook']);
    n.canon((c) => c.removeSource(f.id, s.id));
    expect(n.fact(f.id).factSources.map((x) => x.id), [lost.id]);
  });

  test('contradictions are linked and unlinked from either side; set aside and brought back', () {
    final n = Novel();
    final a = n.canon((c) => c.create(statement: 'Two moons'));
    final b = n.canon((c) => c.create(statement: 'One moon'));
    n.canon((c) => c.linkConflict(a.id, b.id));
    n.canon((c) => c.linkConflict(a.id, a.id));
    expect(n.fact(a.id).conflictsWith, [b.id]);
    n.canon((c) => c.unlinkConflict(b.id, a.id));
    expect(n.fact(a.id).conflictsWith, isEmpty);
    n.canon((c) => c.dismiss(b.id, (factId: a.id, entryId: null, field: null)));
    n.canon((c) => c.dismiss(b.id, (factId: a.id, entryId: null, field: null)));
    expect(n.fact(b.id).dismissed, hasLength(1));
    n.canon((c) => c.undismiss(a.id));
    expect(n.fact(b.id).dismissed, isEmpty, reason: 'what was set aside from the other side comes back too');
    n.canon((c) => c.removeFact(a.id));
    expect(n.snapshot.rows('canonFacts').map((f) => f['id']), [b.id]);
  });

  test('tracked rules keep only this novel’s records; "Update canon" changes only what it says', () {
    final n = Novel();
    final mira = n.codex((c) => c.createEntry('character', 'Mira')).id;
    final rule = n.rules(
      (c) => c.createRule('status', {
        'entryId': mira,
        'state': 'nope',
        'aliases': 'the heir, , The Heir',
        'fromNodeId': 'gone',
        'amount': 5,
      }),
    );
    expect(
      [rule.state, rule.aliases, rule.fromNodeId, rule.amount],
      [
        'deceased',
        ['the heir', 'The Heir'],
        null,
        null,
      ],
    );
    expect(() => n.rules((c) => c.createRule('weather')), throwsA(isA<ChangeRefused>()));
    final power = n.rules((c) => c.createRule('power', {'entryId': mira, 'words': 'underground, Night'}));
    n.rules((c) => c.applyFix(UnblockFix(power.id, 'night')));
    expect(n.rules((c) => c.owned(power.id)).words, ['underground']);
    final travel = n.rules((c) => c.createRule('travel', {'amount': 10}));
    n.rules((c) => c.applyFix(TravelFix(travel.id, 2, 'days')));
    expect([n.rules((c) => c.owned(travel.id)).amount, n.rules((c) => c.owned(travel.id)).unit], [2, 'days']);
    n.codex(
      (c) => c.setOwnFields(mira, [
        {'id': 'age', 'key': 'Age', 'value': '19', 'type': 'text'},
      ]),
    );
    final fieldId = str(maps(n.snapshot.rows('loreEntries').single['fields']).single['id']);
    n.rules((c) => c.applyFix(FieldFix(mira, fieldId, '20')));
    expect(maps(n.snapshot.rows('loreEntries').single['fields']).single['value'], '20');
    expect(() => n.rules((c) => c.applyFix(FieldFix(mira, 'nope', '1'))), throwsA(isA<ChangeRefused>()));
  });
}
