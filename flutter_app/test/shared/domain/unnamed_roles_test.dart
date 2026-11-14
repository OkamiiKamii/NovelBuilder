import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/unnamed_roles.dart';

void main() {
  List<UnnamedRole> read(List<List<String>> chapters, {Set<String> taken = const {}, Set<String> aside = const {}}) =>
      unnamedRoles([for (final (i, p) in chapters.indexed) (id: 'c$i', paragraphs: p)], taken: taken, setAside: aside);

  test('the people the pages keep coming back to without a name, the most first, as the page puts them', () {
    final found = read([
      [
        'James sat down. The waitress came over at once.',
        '"One Elegant Cat," he said. The waitress nodded and left. A guard watched the door.',
      ],
      ['The old guard was asleep. The waitress returned with the cat.', 'The guard snored.'],
    ]);
    expect(
      [for (final r in found) (r.role, r.phrase, r.times, r.chapters)],
      [('waitress', 'the waitress', 3, 2), ('guard', 'the guard', 3, 2)],
    );
    expect(found.first.said, 'The waitress came over at once.');
    expect((found.first.chapter, found.first.block), (1, 0));
  });

  test('not once only, not too general to be anyone, not one the cast already is, not set aside', () {
    expect(
      read([
        ['The captain spoke once. The man left. The man came back.'],
      ]),
      isEmpty,
    );
    final taken = read(
      [
        ['The innkeeper laughed. The innkeeper poured. The smith hammered. The smith swore.'],
      ],
      taken: {'the innkeeper'},
      aside: {'smith'},
    );
    expect(taken, isEmpty);
    final plural = read([
      ['The guards marched. The guards halted.'],
    ]);
    expect(plural, isEmpty, reason: 'many, not someone');
  });

  test('a title written with a capital is the names’ business, not one waiting for a name', () {
    expect(
      read([
        ['A Warden stood there. The Warden smiled.'],
      ]),
      isEmpty,
    );
  });
}
