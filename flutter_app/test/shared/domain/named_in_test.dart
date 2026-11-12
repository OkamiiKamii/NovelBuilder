import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/data/sample_novel.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';

Entry _entry(String id, String name, [String category = 'character']) =>
    Entry({'id': id, 'name': name, 'category': category});

CharacterProfile _profile(String entryId, {String epithet = '', List<String> aliases = const []}) =>
    CharacterProfile({'id': 'p$entryId', 'entryId': entryId, 'epithet': epithet, 'aliases': aliases});

void main() {
  sightingTests();
  test('the names looked for: whole names, parts that are theirs alone, aliases, an epithet’s capitals', () {
    final names = namesToFind(
      [
        _entry('ilse', 'Ilse Marrow'),
        _entry('kit', 'Kit Marrow'),
        _entry('crane', 'Aldous Crane'),
        _entry('rose', 'Rose Hale'),
        _entry('road', 'The Drowned Road', 'location'),
        _entry('vell', 'Vell', 'location'),
      ],
      {
        'crane': _profile('crane', epithet: 'the Provost', aliases: ['Old Crane']),
      },
    );
    expect(names['ilse'], unorderedEquals(['Ilse Marrow', 'Ilse']), reason: 'Marrow is Kit’s too');
    expect(names['kit'], unorderedEquals(['Kit Marrow', 'Kit']));
    expect(names['crane'], unorderedEquals(['Aldous Crane', 'Old Crane', 'Aldous', 'Crane', 'Provost']));
    expect(names['rose'], unorderedEquals(['Rose Hale', 'Hale']), reason: '“Rose” begins sentences');
    expect(names['road'], unorderedEquals(['The Drowned Road', 'Drowned Road']));
    expect(names['vell'], ['Vell']);
  });

  test('found as whole words, capitals as written', () {
    final found = namedIn(
      {
        'c1': 'Wren looked up. The Drowned Road rose out of the bay.',
        'c2': 'A wren sang on the wall. Wrenfield was quiet.',
        'c3': 'They spoke of the drowned road, and of Wren’s map.',
      },
      {
        'wren': ['Wren Hollis', 'Wren'],
        'road': ['The Drowned Road', 'Drowned Road'],
      },
    );
    expect(found['wren'], ['c1', 'c3'], reason: 'not the bird, not Wrenfield');
    expect(found['road'], ['c1'], reason: 'a drowned road is not the Drowned Road');
  });

  test('in the sample novel, its people and places are found where they are', () {
    final s = sampleNovel(now: 0);
    final entries = [for (final r in s.rows('loreEntries')) Entry(r)];
    final profiles = {for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)};
    final found = namedInJob([
      for (final r in s.rows('chapterContents')) jsonEncode(r),
    ], namesToFind(entries, profiles))();
    final order = StoryOrder.of([for (final r in s.rows('chapters')) StoryNode(r)]);
    Set<int> chapters(String name) => {
      for (final id in found[entries.firstWhere((e) => e.name == name).id] ?? const <String>[])
        order.chapterNumber[id]!,
    };
    expect(chapters('Wren Hollis'), {for (var n = 1; n <= 15; n++) n});
    expect(chapters('Aldous Crane'), containsAll([4, 10, 15]), reason: 'Crane, and the Provost');
    expect(chapters('Jory'), {11, 12, 13, 14});
    expect(chapters('Old Merrow'), contains(12));
    expect(chapters('Hollow Light'), contains(4));
  });
}

void sightingTests() {
  test('in their pages: the first sentence each chapter names them in, the name picked out', () {
    final found = sightings(
      {
        'c1': ['The bell rang.', 'Wren dropped the ink. It went across the floor.'],
        'c2': ['Nobody came.'],
        'c3': ['“Wren,” said Ilse Marrow. “Wipe it up.”'],
      },
      ['c1', 'c2', 'c3'],
      ['Wren Hollis', 'Wren'],
    );
    expect(
      [for (final s in found) (s.nodeId, s.block, s.before, s.name, s.after)],
      [('c1', 1, '', 'Wren', ' dropped the ink.'), ('c3', 0, '“', 'Wren', ',” said Ilse Marrow.')],
    );
  });

  test('a long sentence is cut around the name, at spaces', () {
    final long = '${List.filled(60, 'and the sea').join(' ')} Wren ${List.filled(60, 'went out').join(' ')}.';
    final s = sightings(
      {
        'c': [long],
      },
      ['c'],
      ['Wren'],
    ).single;
    expect(s.name, 'Wren');
    expect(s.before, startsWith('…'));
    expect(s.after, endsWith('…'));
    expect(s.before.length + s.name.length + s.after.length, lessThanOrEqualTo(sightingChars + 4));
  });

  test('the sample novel: a passage for every chapter Wren is in', () {
    final s = sampleNovel(now: 0);
    final pages = {for (final r in s.rows('chapterContents')) str(r['id']): blockTexts(r['doc'])};
    final order = StoryOrder.of([for (final r in s.rows('chapters')) StoryNode(r)]);
    final ids = [for (final c in order.chapters) c.id];
    final found = sightings(pages, ids, ['Wren Hollis', 'Wren']);
    expect(found, hasLength(15));
    expect(found.first.name, 'Wren Hollis');
    expect(
      '${found.first.before}${found.first.name}${found.first.after}',
      startsWith('The bell in the Wardens’ tower'),
    );
  });
}
