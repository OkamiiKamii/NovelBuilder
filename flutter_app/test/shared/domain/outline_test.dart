import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'builder.dart';

List<String> readingOrder(NovelSnapshot s) => [for (final n in StoryModel.fromSnapshot(s).order.position.keys) n];

String titleOf(NovelSnapshot s, String id) => str(s.rows('chapters').firstWhere((r) => r['id'] == id)['title']);

void main() {
  var n = 0;
  String id() => 'n${n++}';
  setUp(() => n = 0);

  test('new nodes: chapters numbered across the book, scenes within their chapter', () {
    var s = (NovelBuilder()..node('v', kind: 'volume')).build();
    final c1 = createNode(s, NodeKind.chapter, parentId: 'v', now: 1, createId: id);
    s = c1.snapshot;
    final c2 = createNode(s, NodeKind.chapter, now: 1, createId: id);
    s = c2.snapshot;
    final sc = createNode(s, NodeKind.scene, parentId: c2.node.id, now: 1, createId: id);
    expect([c1.node.title, c2.node.title, sc.node.title], ['Chapter 1', 'Chapter 2', 'Scene 1']);
    expect(sc.node.order, 0);
    expect(c2.node.status, NodeStatus.idea);
  });

  test('where nodes can go', () {
    final s =
        (NovelBuilder()
              ..node('v', kind: 'volume')
              ..node('a', kind: 'arc', parent: 'v')
              ..node('c', parent: 'a')
              ..node('sc', kind: 'scene', parent: 'c'))
            .build();
    expect(() => createNode(s, NodeKind.scene, now: 1), throwsA(isA<OutlineException>()), reason: 'scene at top level');
    expect(() => createNode(s, NodeKind.volume, parentId: 'a', now: 1), throwsA(isA<OutlineException>()));
    expect(() => createNode(s, NodeKind.chapter, parentId: 'sc', now: 1), throwsA(isA<OutlineException>()));
    expect(() => placeNode(s, 'v', 'c', null, now: 1), throwsA(isA<OutlineException>()), reason: 'inside itself');
    expect(canContain(null, NodeKind.chapter), isTrue);
    expect(canContain(NodeKind.volume, NodeKind.arc), isTrue);
    expect(canContain(NodeKind.arc, NodeKind.act), isFalse);
  });

  test('moving changes only position: parentId and order, never text, ids or when events happen', () {
    final b = NovelBuilder()
      ..node('c1')
      ..node('c2', order: 1)
      ..node('c3', order: 2)
      ..event('siege', when: year(10), nodeIds: ['c3']);
    final s = b.build();
    final moved = placeNode(s, 'c3', null, 'c1', now: 5);
    expect(readingOrder(moved), ['c3', 'c1', 'c2']);
    final before = StoryModel.fromSnapshot(s);
    final after = StoryModel.fromSnapshot(moved);
    expect(spanOfEvent('siege', after.timeContext), spanOfEvent('siege', before.timeContext));
    expect(
      {for (final c in deriveConnections(after).connections) c.id},
      {for (final c in deriveConnections(before).connections) c.id},
    );
    final c3 = moved.rows('chapters').firstWhere((r) => r['id'] == 'c3');
    final old = s.rows('chapters').firstWhere((r) => r['id'] == 'c3');
    expect(
      {
        for (final k in c3.keys)
          if (!jsonEquals(c3[k], old[k])) k,
      },
      {'order', 'updatedAt'},
    );
  });

  test('nudging up and down, and doing nothing at the ends', () {
    final s =
        (NovelBuilder()
              ..node('a')
              ..node('b', order: 1)
              ..node('c', order: 2))
            .build();
    expect(readingOrder(nudgeNode(s, 'b', -1, now: 1)), ['b', 'a', 'c']);
    expect(readingOrder(nudgeNode(s, 'b', 1, now: 1)), ['a', 'c', 'b']);
    expect(identical(nudgeNode(s, 'a', -1, now: 1), s), isTrue);
    expect(identical(nudgeNode(s, 'c', 1, now: 1), s), isTrue);
  });

  test('duplicating copies the subtree with its text and plans, fresh ids, right after the original', () {
    final s =
        (NovelBuilder()
              ..node('c1')
              ..node('sc', kind: 'scene', parent: 'c1')
              ..node('c2', order: 1)
              ..row('chapterContents', {'id': 'sc', 'doc': textToDoc('Words here'), 'rev': 3})
              ..row('chapterPlans', {'id': 'c1', 'objective': 'Win'}))
            .build();
    final r = duplicateNode(s, 'c1', now: 9, createId: id);
    expect(readingOrder(r.snapshot), ['c1', 'sc', r.id, 'n1', 'c2']);
    expect(titleOf(r.snapshot, r.id), 'c1 (Copy)');
    expect(blockTexts(contentOf(r.snapshot, 'n1')!['doc']), ['Words here']);
    expect(r.snapshot.rows('chapterPlans').where((p) => p['id'] == r.id).single['objective'], 'Win');
    expect(blockTexts(contentOf(r.snapshot, 'sc')!['doc']), ['Words here'], reason: 'the original is unchanged');
  });

  test('splitting: the first part stays, the rest becomes a new node right after it, with counts', () {
    final s =
        (NovelBuilder()
              ..node('c1', title: 'The Gate')
              ..node('c2', order: 1)
              ..row('chapterContents', {'id': 'c1', 'doc': textToDoc('One two.\nThree four five.'), 'rev': 2}))
            .build();
    final r = splitNode(s, 'c1', textToDoc('One two.'), textToDoc('Three four five.'), now: 3, createId: id);
    expect(readingOrder(r.snapshot), ['c1', r.id, 'c2']);
    expect(titleOf(r.snapshot, r.id), 'The Gate (continued)');
    final first = r.snapshot.rows('chapters').firstWhere((x) => x['id'] == 'c1');
    final second = r.snapshot.rows('chapters').firstWhere((x) => x['id'] == r.id);
    expect((first['wordCount'], second['wordCount']), (2, 3));
    expect(contentOf(r.snapshot, 'c1')!['rev'], 3);
    expect(
      () => splitNode((NovelBuilder()..node('v', kind: 'volume')).build(), 'v', emptyDoc(), emptyDoc(), now: 1),
      throwsA(isA<OutlineException>()),
    );
  });

  test('merging: texts joined, scenes and plans moved in, references re-pointed once, the second node gone', () {
    final s =
        (NovelBuilder()
              ..node('c1')
              ..node('c2', order: 1)
              ..node('s1', kind: 'scene', parent: 'c1')
              ..node('s2', kind: 'scene', parent: 'c2')
              ..row('chapterContents', {'id': 'c1', 'doc': textToDoc('First.'), 'rev': 1})
              ..row('chapterContents', {'id': 'c2', 'doc': textToDoc('Second part.'), 'rev': 4})
              ..row('chapterPlans', {
                'id': 'c1',
                'entityIds': ['mira'],
                'objective': 'Arrive',
              })
              ..row('chapterPlans', {
                'id': 'c2',
                'entityIds': ['mira', 'orrin'],
                'objective': 'Leave',
              })
              ..entry('mira')
              ..entry('orrin')
              ..event('e', nodeIds: ['c1', 'c2']))
            .build();
    final merged = mergeWithNext(s, 'c1', now: 7);
    expect(merged.rows('chapters').any((r) => r['id'] == 'c2'), isFalse);
    expect(blockTexts(contentOf(merged, 'c1')!['doc']), ['First.', 'Second part.']);
    expect(merged.rows('chapters').firstWhere((r) => r['id'] == 'c1')['wordCount'], 3);
    expect(merged.rows('chapters').firstWhere((r) => r['id'] == 's2')['parentId'], 'c1');
    final plan = merged.rows('chapterPlans').single;
    expect(plan['entityIds'], ['mira', 'orrin']);
    expect(plan['objective'], 'Arrive\n\nLeave');
    expect(merged.rows('timelineEvents').single['nodeIds'], ['c1'], reason: 'pointed at both: now once');
    expect(deriveConnections(StoryModel.fromSnapshot(merged)).dangling, isEmpty);
    expect(mergeCandidate(merged, 'c1'), isNull, reason: 'nothing after it now');
  });
}
