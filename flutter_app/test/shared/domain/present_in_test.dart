import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/codex/in_chapter.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';

import '../../helpers/large_novel.dart';

/// Who and what a page names, as it was found before: a search per entry of the codex over the page.
List<Present> searchedPerEntry(
  List<String> paragraphs,
  Map<String, List<String>> names, {
  Map<String, int> links = const {},
}) {
  final text = paragraphs.join('\n');
  final counts = <String, int>{};
  for (final MapEntry(key: id, value: list) in names.entries) {
    final wanted = {for (final n in list) n.trim()}.where((n) => n.isNotEmpty).toList()
      ..sort((a, b) => b.length - a.length);
    if (wanted.isEmpty) continue;
    final pattern = RegExp(
      '(?<![\\p{L}\\p{N}])(?:${wanted.map(RegExp.escape).join('|')})(?![\\p{L}\\p{N}])',
      unicode: true,
    );
    final n = pattern.allMatches(text).length;
    if (n > 0) counts[id] = n;
  }
  for (final MapEntry(key: id, value: n) in links.entries) {
    if (n > (counts[id] ?? 0)) counts[id] = n;
  }
  final order = [...names.keys, ...links.keys.where((k) => !names.containsKey(k))];
  final out = [
    for (final id in order)
      if (counts[id] case final n?) (id: id, mentions: n),
  ];
  final at = {for (final (i, id) in order.indexed) id: i};
  out.sort((a, b) => a.mentions != b.mentions ? b.mentions - a.mentions : at[a.id]! - at[b.id]!);
  return out;
}

/// The page read once for its words, the entries that cannot be named in it passed over: exactly what the search per
/// entry found, over a long book's every chapter and the hard cases.
void main() {
  test('a long book’s chapters, first to last: the same entries, the same counts, in the same order', () {
    final s = largeNovel();
    final entries = [for (final r in s.rows('loreEntries')) Entry(r)]..sort((a, b) => a.id.compareTo(b.id));
    final profiles = {
      for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
        str(r['entryId']): CharacterProfile(r),
    };
    // The book's own names, and the first names its pages call people by (shared by many of its characters, so not
    // given by namesToFind): entries a page does name, among the thousand it does not.
    final names = {
      ...namesToFind(entries, profiles),
      for (final n in [
        'Mira',
        'Kai',
        'Ren',
        'Tamsin',
        'Oren',
        'Lise',
        'Bram',
        'Ysolde',
        'Corin',
        'Ada',
        'Hale',
        'Nadia',
      ])
        'called $n': [n],
    };
    expect(names.length, greaterThan(900));
    var named = 0;
    // Every 25th page, from first to last (the search per entry takes most of a second a page: all 600 would be minutes).
    final all = s.rows('chapterContents');
    final pages = [for (var i = 0; i < all.length; i += 25) all[i], all.last];
    for (final r in pages) {
      final paragraphs = blockTexts(r['doc']);
      final found = presentIn(paragraphs, names);
      expect(found, searchedPerEntry(paragraphs, names), reason: str(r['id']));
      named += found.length;
    }
    expect(named, greaterThan(pages.length), reason: 'the pages name people and places: the test compares something');
  });

  test('the hard cases: whole words, capitals as written, names of several words, marks and digits', () {
    final names = {
      'wren': ['Wren Hollis', 'Wren'],
      'bird': ['wren'],
      'obrien': ["O'Brien", 'O’Brien'],
      'mj': ['Mary-Jane'],
      'kai': ['Kai'],
      'droid': ['3PO'],
      'cafe': ['Café Noir'],
      'stars': ['***'],
      'empty': ['  ', ''],
      'none': ['Nobody Here'],
    };
    final cases = [
      ['Wren Hollis came. Wren sat; a wren sang.'],
      ["O'Brien and O’Brien met Mary-Jane, not Mary or Jane."],
      ['Kai2 is not Kai, but Kai is; Kaiser is not.'],
      ['3PO spoke. R3PO did not. 3PO.'],
      ['At the Café Noir, the café noir.', 'Then *** and then ***.'],
      ['', 'Nothing here names anyone.'],
    ];
    for (final paragraphs in cases) {
      expect(presentIn(paragraphs, names), searchedPerEntry(paragraphs, names), reason: paragraphs.join(' / '));
      final links = {'kai': 5, 'linkedOnly': 2};
      expect(presentIn(paragraphs, names, links: links), searchedPerEntry(paragraphs, names, links: links));
    }
    expect(presentIn(['Wren Hollis came. Wren sat; a wren sang.'], names), [
      (id: 'wren', mentions: 2),
      (id: 'bird', mentions: 1),
    ]);
  });
}
