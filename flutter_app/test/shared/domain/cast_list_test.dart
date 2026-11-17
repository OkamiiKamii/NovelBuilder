import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/cast.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';

import '../../helpers/large_novel.dart';

/// The cast as it was listed before (each character looking through every chapter and every link): kept as the
/// reference the listing read once for the whole cast must agree with.
List<String> oldListing(
  List<Entry> entries,
  Map<String, CharacterProfile> profiles,
  List<Link> links,
  Iterable<StoryNode> nodes,
  Map<String, int> position,
  CharacterProfile Function(Entry) fallback, {
  Map<String, List<String>> named = const {},
}) {
  final byId = {for (final e in entries) e.id: e};
  final ordered = stableSorted(
    nodes.where((n) => n.mentions.isNotEmpty),
    (a, b) => (position[a.id] ?? 0) - (position[b.id] ?? 0),
  );
  return [
    for (final entry in entries)
      if (entry.category == 'character')
        () {
          final linkedIn = [
            for (final node in ordered)
              if (node.mentions.contains(entry.id)) node.id,
          ];
          final namedIn = stableSorted([
            for (final id in named[entry.id] ?? const <String>[])
              if (position.containsKey(id) && !linkedIn.contains(id)) id,
          ], (a, b) => position[a]! - position[b]!);
          final seen = stableSorted([...linkedIn, ...namedIn], (a, b) => (position[a] ?? 0) - (position[b] ?? 0));
          final factions = <String>[
            for (final link in links)
              if (byId[link.fromId == entry.id ? link.toId : (link.toId == entry.id ? link.fromId : '')]
                  case final other? when other.category == 'faction')
                other.name,
          ];
          final value = fieldNamed(entry, 'Faction');
          final namedFaction = byId[value]?.name ?? value;
          return _said(
            entry.id,
            (profiles[entry.id] ?? fallback(entry)).id,
            linkedIn,
            namedIn,
            seen.isEmpty ? -1 : (position[seen.first] ?? -1),
            seen.isEmpty ? -1 : (position[seen.last] ?? -1),
            {...factions, if (namedFaction.isNotEmpty && !byId.containsKey(namedFaction)) namedFaction}.toList(),
          );
        }(),
  ];
}

String _said(
  String id,
  String profile,
  List<String> linkedIn,
  List<String> namedIn,
  int first,
  int latest,
  List<String> factions,
) => '$id|$profile|$linkedIn|$namedIn|$first|$latest|$factions';

String said(Listed l) => _said(l.entry.id, l.profile.id, l.linkedIn, l.namedIn, l.first, l.latest, l.factions);

/// The cast listed with each chapter and link read once for all of it: for every character the same chapters, the
/// same places in the book and the same factions, in the same order, as each looking through all of them.
void main() {
  test('a long book: every character listed as before', () {
    final s = largeNovel();
    final entries = [for (final r in s.rows('loreEntries')) Entry(r)];
    final profiles = {for (final r in s.rows('characterProfiles')) str(r['entryId']): CharacterProfile(r)};
    final links = [
      for (final r in s.rows('loreLinks'))
        if (Link(r).isEntryLink) Link(r),
    ];
    // Chapters that link to characters (the long book's link none): a few each, one of them twice.
    final cast = [
      for (final e in entries)
        if (e.category == 'character') e.id,
    ];
    final nodes = [
      for (final (i, r) in s.rows('chapters').indexed)
        StoryNode({
          ...r,
          'mentions': [cast[i % cast.length], cast[(i * 3) % cast.length], cast[i % cast.length]],
        }),
    ];
    final position = StoryOrder.of(nodes).position;
    final read = CharacterChanges(s, now: 0, createId: () => 'x');
    // Names found in the text: some where they are linked too, some elsewhere, some in chapters no longer there.
    final ids = [for (final n in nodes) n.id];
    final named = {
      for (final (i, e) in entries.indexed)
        if (e.category == 'character') e.id: [ids[(i * 7) % ids.length], ids[(i * 13) % ids.length], 'gone-$i'],
    };
    final listed = listCharacters(entries, profiles, links, nodes, position, read.fresh, named: named);
    final before = oldListing(entries, profiles, links, nodes, position, read.fresh, named: named);
    expect(listed.length, before.length);
    expect(listed.length, greaterThan(300));
    for (var i = 0; i < listed.length; i++) {
      expect(said(listed[i]), before[i]);
    }
    expect(listed.where((l) => l.factions.isNotEmpty), isNotEmpty, reason: 'the test compares factions');
    expect(listed.where((l) => l.linkedIn.isNotEmpty), isNotEmpty, reason: 'and chapters');
  });

  test('the hard cases: a link to itself, a chapter naming one twice, a faction linked either way and twice', () {
    Entry entry(String id, String category, {String faction = ''}) => Entry({
      'id': id,
      'name': id.toUpperCase(),
      'category': category,
      if (faction.isNotEmpty)
        'fields': [
          {'id': 'f-$id', 'key': 'Faction', 'value': faction},
        ],
    });
    final entries = [
      entry('mira', 'character', faction: 'The Lantern Guild'),
      entry('kai', 'character', faction: 'guild'),
      entry('sefa', 'character'),
      entry('guild', 'faction'),
      entry('watch', 'faction'),
    ];
    Link link(String id, String from, String to) => Link({'id': id, 'fromId': from, 'toId': to});
    final links = [
      link('l1', 'mira', 'guild'),
      link('l2', 'watch', 'mira'),
      link('l3', 'mira', 'mira'),
      link('l4', 'guild', 'mira'),
      link('l5', 'kai', 'sefa'),
    ];
    StoryNode node(String id, int order, List<String> mentions) =>
        StoryNode({'id': id, 'kind': 'chapter', 'order': order, 'parentId': null, 'mentions': mentions});
    final nodes = [
      node('c2', 1, ['mira', 'mira', 'kai']),
      node('c1', 0, ['kai']),
      node('c3', 2, const []),
      node('c4', 3, ['sefa', 'mira']),
    ];
    final position = StoryOrder.of(nodes).position;
    final named = {
      'mira': ['c3', 'c2'],
      'sefa': ['c1', 'nowhere'],
    };
    CharacterProfile fallback(Entry e) => CharacterProfile({'id': 'p-${e.id}', 'entryId': e.id});
    final listed = listCharacters(entries, const {}, links, nodes, position, fallback, named: named);
    expect([
      for (final l in listed) said(l),
    ], oldListing(entries, const {}, links, nodes, position, fallback, named: named));
    final mira = listed.firstWhere((l) => l.entry.id == 'mira');
    expect(mira.linkedIn, ['c2', 'c4'], reason: 'c2 once, though it names her twice');
    expect(mira.namedIn, ['c3'], reason: 'c2 is linked already');
    expect(mira.factions, ['GUILD', 'WATCH', 'The Lantern Guild'], reason: 'each faction once, in the links\' order');
  });
}
