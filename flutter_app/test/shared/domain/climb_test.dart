import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/systems/climb.dart';

void main() {
  // A level costs 100 XP each, from Level 1, to a cap of 50.
  final system = SystemBlueprint({
    'name': 'Test',
    'tracks': [
      {'id': 't', 'name': 'Level', 'key': 'level', 'kind': 'levels', 'cap': 50, 'curve': '100', 'curveUnit': 'XP'},
    ],
  });
  SystemSheet sheet(List<(String?, num)> xp) => SystemSheet({
    'id': 's',
    'systemId': 'x',
    'entryId': 'e',
    'xp': [
      for (final (i, (node, amount)) in xp.indexed) {'id': 'x$i', 'trackId': 't', 'amount': amount, 'nodeId': node},
    ],
  });
  final chapterOf = {for (var i = 1; i <= 20; i++) 'c$i': i};

  test('the level at the end of each chapter, by the system’s curve; the pace and where it leads', () {
    final climb = climbsOf(
      system,
      sheet([('c1', 100), ('c2', 100), ('c4', 200)]),
      chapterOf: chapterOf,
      chapters: 10,
      who: 'Wren',
    ).single;
    expect(climb.actual, [(0, 1), (1, 2), (2, 3), (3, 3), (4, 5)]);
    expect(climb.perChapter, 100);
    expect(climb.projected.first, (5, 6));
    expect(climb.says, [
      'At this pace (100 XP a chapter), Level 11 by the end of chapter 10, the last written.',
      'Level 10 in chapter 9.',
      'The cap, Level 50, in chapter 49.',
    ]);
  });

  test('a chapter that gives far more than the others', () {
    final climb = climbsOf(
      system,
      sheet([('c1', 100), ('c3', 100), ('c5', 600)]),
      chapterOf: chapterOf,
      chapters: 5,
      who: 'Wren',
    ).single;
    expect(climb.says.last, 'Chapter 5 alone gives Wren 6 levels, of 8 in the book so far.');
  });

  test('no experience, a stage track, or a node not in the book: no climb; before the story is chapter 0', () {
    expect(climbsOf(system, sheet([]), chapterOf: chapterOf, chapters: 5), isEmpty);
    expect(climbsOf(system, sheet([('gone', 500)]), chapterOf: chapterOf, chapters: 5), isEmpty);
    final before = climbsOf(system, sheet([(null, 300)]), chapterOf: chapterOf, chapters: 5).single;
    expect(before.actual, [(0, 4)]);
    expect(before.projected, isEmpty, reason: 'no pace without a chapter');
  });
}
