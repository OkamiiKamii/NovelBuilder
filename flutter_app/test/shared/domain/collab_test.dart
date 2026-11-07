// The collaboration rules and suggested-edit changes, ported: agreement with the original app on every case it
// produced (tool/golden/collab.test.ts): what each role may see of each record, which changes each role may make (and
// the reason given when not), how a suggestion splits into changes, and how a change lands on a chapter as it is now.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/collab/access.dart';
import 'package:novel_builder/shared/domain/collab/hunks.dart';
import 'package:novel_builder/shared/domain/json.dart';

import 'golden.dart';

void main() {
  final golden = readGolden('collab.golden.json');

  test('what each role may see, and which changes it may make, agree with the original on every case', () {
    final cases = maps(golden['access']);
    expect(cases.length, greaterThan(10000));
    var visibleCases = 0;
    var refusals = 0;
    var allowed = 0;
    for (final c in cases) {
      final role = Role.of(c['role'])!;
      final memberId = str(c['memberId']);
      final key = str(c['key']);
      final where = '${c['novel']} ${role.name} ${c['memberId']} $key';
      if (c['kind'] == 'visible') {
        final row = mapOrNull(c['row'])!;
        final chapter = mapOrNull(c['chapter']);
        final seen = visible(role, memberId, key, row, (k) => k.startsWith('chapters:') ? chapter : null);
        final expected = c['expected'];
        if (expected == 'same') {
          expect(identical(seen, row) || jsonEquals(seen, row), isTrue, reason: where);
        } else {
          expectJson(seen, expected, where);
        }
        visibleCases++;
      } else {
        final reason = refusal(role, memberId, key, mapOrNull(c['before']), mapOrNull(c['after']));
        expect(reason, c['expected'], reason: where);
        reason == null ? allowed++ : refusals++;
      }
    }
    // Both outcomes are exercised many times over.
    expect(
      [visibleCases, allowed, refusals].every((n) => n > 1000),
      isTrue,
      reason: '$visibleCases $allowed $refusals',
    );
  });

  test('suggestions split into the same changes, with the same names, as the original', () {
    final cases = maps(golden['hunks']);
    expect(cases.length, greaterThan(50));
    for (final c in cases) {
      final where = '${c['novel']} ${c['chapter']} ${c['edit']}';
      final found = textHunks(c['base'], c['proposed']);
      expectJson(
        [
          for (final h in found)
            {
              'id': h.id,
              'at': h.at,
              'remove': h.remove,
              'insert': h.insert,
              'before': h.before,
              'text': [textOf(h.remove), textOf(h.insert)],
            },
        ],
        c['hunks'],
        where,
      );
    }
    // The cases include real changes, not only unchanged chapters.
    expect(cases.where((c) => (c['hunks'] as List).isNotEmpty).length, greaterThan(40));
  });

  test('an accepted change lands on the chapter as it is now, or is refused when the passage was rewritten', () {
    var applied = 0;
    var rewritten = 0;
    for (final c in maps(golden['hunks'])) {
      final found = textHunks(c['base'], c['proposed']);
      final nows = maps(c['nows']);
      for (final (n, results) in (c['applied'] as List).indexed) {
        for (final (h, r) in maps(results).indexed) {
          final where = '${c['novel']} ${c['chapter']} ${c['edit']} / ${r['now']}';
          final result = applyHunk(nows[n]['doc'], found[h]);
          final expected = r['result'];
          switch (result) {
            case AppliedTo(:final doc):
              expectJson(doc, expected, where);
              applied++;
            case AlreadyThere():
              expect(expected, 'same', reason: where);
            case Rewritten():
              expect(expected, isNull, reason: where);
              rewritten++;
          }
        }
      }
    }
    expect([applied, rewritten].every((n) => n > 20), isTrue, reason: '$applied $rewritten');
  });
}
