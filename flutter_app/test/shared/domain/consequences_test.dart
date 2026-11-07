// "What depends on this", ported: agreement with the original app (tool/golden/consequences.test.ts) on the report for
// every chapter, scene and group, every event and every plot development of each fixture novel, including the
// author's own additions and removals of entries.
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/consequences/consequences.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';

import 'fixtures.dart';
import 'golden.dart';

World worldOf(String name) {
  final s = loadFixture(name);
  return World(
    nodes: [for (final r in s.rows('chapters')) StoryNode(r)],
    docs: {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']},
    plans: s.rows('chapterPlans'),
    entries: s.rows('loreEntries'),
    relations: s.rows('characterRelations'),
    threads: s.rows('plotThreads'),
    events: s.rows('timelineEvents'),
    facts: s.rows('canonFacts'),
    rules: s.rows('continuityRules'),
    snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
    systems: [for (final r in s.rows('systems')) SystemBlueprint(r)],
  );
}

Subject subjectOf(JsonMap s) => switch (s['type']) {
  'node' => NodeSubject(str(s['nodeId'])),
  'event' => EventSubject(str(s['eventId'])),
  _ => BeatSubject(str(s['threadId']), str(s['beatId'])),
};

JsonMap _consequence(Consequence c) => {
  'key': c.key,
  'tier': c.tier.name,
  'kind': switch (c.kind) {
    ConsequenceKind.characterState => 'character-state',
    final k => k.name,
  },
  'message': c.message,
  'basis': c.basis,
  'target': c.target,
  'excerpt': ?c.excerpt,
  'match': ?c.match,
  'nodeId': ?c.nodeId,
  'entryIds': c.entryIds,
  'threadId': ?c.threadId,
  'relationId': ?c.relationId,
  'eventId': ?c.eventId,
  'factId': ?c.factId,
};

void main() {
  final golden = readGolden('consequences.golden.json');
  for (final name in golden.keys) {
    test('$name: every report agrees with the original', () {
      final world = worldOf(name);
      for (final c in maps(golden[name])) {
        final r = analyze(
          world,
          subjectOf(mapOrNull(c['subject'])!),
          include: [for (final x in listOf(c['include'])) str(x)],
          exclude: [for (final x in listOf(c['exclude'])) str(x)],
        );
        final where = '$name ${c['label']}';
        expectJson(
          {
            'title': r.title,
            'found': r.found,
            'anchorIds': r.anchorIds,
            'seeds': [for (final e in r.seeds) e['id']],
            'suggested': [for (final e in r.suggested) e['id']],
            'established': [for (final x in r.established) _consequence(x)],
            'potential': [for (final x in r.potential) _consequence(x)],
            'summary': [
              for (final p in r.summary) {'label': p.label, 'count': p.count},
            ],
            'summaryLine': r.summaryLine,
            'downstream': r.downstream,
          },
          c['report'],
          where,
        );
      }
    });
  }
}
