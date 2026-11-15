import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/cast_names.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import '../../helpers/large_novel.dart';

/// What the searches the finder replaces found: every place each name stands, per name, per character.
Set<(int, int, String, int)> searched(String text, List<({String id, List<String> names})> people) => {
  for (final p in people)
    for (final (i, n) in p.names.indexed)
      if (n.trim().isNotEmpty)
        for (final m in RegExp('(?<![\\p{L}])${RegExp.escape(n.trim())}(?![\\p{L}])', unicode: true).allMatches(text))
          (m.start, m.end, p.id, i),
};

Set<(int, int, String, int)> found(String text, CastNames names) => {
  for (final h in names.all(text)) (h.start, h.end, h.id, h.name),
};

void main() {
  test('the same places the per-name searches found, over a whole large novel and its four hundred characters', () {
    final s = largeNovel();
    final people = [
      for (final e in s.rows('loreEntries'))
        if (e['category'] == 'character')
          (
            id: '${e['id']}',
            names: [
              '${e['name']}',
              // A first name alone, as the cast's names are found by.
              '${e['name']}'.split(' ').first,
            ],
          ),
    ];
    expect(people.length, 400);
    final names = CastNames(people);
    var paragraphs = 0;
    var hits = 0;
    for (final row in s.rows('chapterContents').take(120)) {
      for (final b in docBlocks(row['doc'])) {
        paragraphs++;
        final want = searched(b.text, people);
        expect(found(b.text, names), want, reason: b.text);
        hits += want.length;
      }
    }
    expect(paragraphs, greaterThan(500));
    expect(hits, greaterThan(100), reason: 'a real test: the prose names its cast');
  });

  test('a word of its own, case and all; possessives, punctuation, accents, shared names, names not starting with a '
      'letter', () {
    const people = [
      (id: 'kade', names: ['Kade Ash', 'Kade']),
      (id: 'zoe', names: ['Zoë']),
      (id: 'obrien', names: ['O’Brien']),
      (id: 'king1', names: ['the King']),
      (id: 'king2', names: ['the King']),
      (id: 'droid', names: ['3PO']),
      (id: 'mary', names: ['Mary-Jane']),
    ];
    const text =
        'Kade Ash came. Kade’s bow, Kaden’s too, and kade. Zoë and Zoëy; O’Brien. the King spoke to 3PO and Mary-Jane, '
        'not Mary-Janet.';
    final names = CastNames(people);
    expect(found(text, names), searched(text, people));
    final all = names.all(text);
    expect(
      [for (final h in all) text.substring(h.start, h.end)],
      ['Kade Ash', 'Kade', 'Kade', 'Zoë', 'O’Brien', 'the King', 'the King', '3PO', 'Mary-Jane'],
    );
    expect(names.named('Nothing here but Kaden.'), isEmpty);
    expect(names.named('the King nodded.'), {'king1', 'king2'});
    expect(CastNames(const []).isEmpty, isTrue);
  });
}
