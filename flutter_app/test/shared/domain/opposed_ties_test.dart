import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/canon/checks.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';

void main() {
  test('every alliance is set against each war of its own pair, both ways round, in the order recorded', () {
    final base = loadFixture('canon');
    // Ties among six parties, in both directions, mixed with ties of other kinds; none dated (always in play).
    const parties = ['guild', 'crown', 'mira', 'p4', 'p5', 'p6'];
    final links = <Map<String, Object?>>[];
    var n = 0;
    for (var i = 0; i < parties.length; i++) {
      for (var j = 0; j < parties.length; j++) {
        if (i == j) continue;
        for (final type in const ['allied-with', 'at-war-with', 'related-to']) {
          if ((i * 7 + j * 3 + type.length) % 4 == 0) continue;
          links.add({'id': 't${n++}', 'projectId': 'canon', 'fromId': parties[i], 'toId': parties[j], 'type': type});
        }
      }
    }
    final json = base.toJson();
    final snapshot = NovelSnapshot.fromJson({
      ...json,
      'collections': {...(json['collections']! as Map), 'loreLinks': links},
    });
    final findings = checkRecords(StoryModel.fromSnapshot(snapshot), facts: const [], rules: const []);
    final opposed = [
      for (final f in findings)
        if (f.rule == RecordRule.opposed) f.key,
    ];

    // As the rule says, pair by pair: each alliance (in order) with each war (in order) between the same two.
    String pair(Map<String, Object?> l) => ([l['fromId'], l['toId']]..sort((a, b) => '$a'.compareTo('$b'))).join('~');
    final expected = [
      for (final a in links.where((l) => l['type'] == 'allied-with'))
        for (final w in links.where((l) => l['type'] == 'at-war-with'))
          if (pair(a) == pair(w)) 'records|${RecordRule.opposed.key}|${a['id']}|${w['id']}',
    ];
    expect(expected, isNotEmpty);
    // The same pairs found (the check orders its findings itself; the golden fixtures hold that order).
    expect(opposed, unorderedEquals(expected));
    expect(opposed.toSet().length, opposed.length, reason: 'each pair once');
  });
}
