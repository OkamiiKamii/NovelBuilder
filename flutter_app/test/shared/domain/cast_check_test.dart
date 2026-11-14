import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/cast_check.dart';

CastMember m(String name, List<int> chapters, {List<String> roles = const [], int ties = 0, bool gone = false}) =>
    (id: name.toLowerCase(), name: name, roles: roles, chapters: {...chapters}, ties: ties, gone: gone);

void main() {
  test('a principal the book forgets', () {
    final notes = castCheck([
      m('Wren', [for (var i = 1; i <= 10; i++) i], roles: ['Protagonist']),
      m('Ilse', [2, 9], roles: ['Supporting'], ties: 2),
      m('Crane', [], roles: ['Antagonist']),
    ], chapters: 10);
    expect(
      [for (final n in notes) n.says],
      [
        'Ilse is one of your principals, but in 2 of 10 chapters.',
        'Crane is your antagonist, but not yet in any of the 10 chapters.',
      ],
    );
  });

  test('gone quiet: there for a stretch, then nothing long before the end; not the dead', () {
    final notes = castCheck([
      m('Nan', [3, 5, 8], ties: 1),
      m('Kit', [1, 2, 3], ties: 1, gone: true),
      m('Sefa', [4, 9, 15], ties: 1),
    ], chapters: 15);
    expect(notes, hasLength(1));
    expect(notes.single.says, 'Nan is in chapters 3 to 8, then gone: 7 chapters without them. A thread left hanging?');
  });

  test('always together: two, neither a lead, on the same pages; once each', () {
    final notes = castCheck([
      m('Jory', [3, 5, 8], ties: 1),
      m('Doran', [3, 5, 8], ties: 1),
      m('Wren', [3, 5, 8], roles: ['Protagonist'], ties: 3),
      m('Tam', [3, 5, 8, 9], ties: 1),
    ], chapters: 9);
    final together = notes.where((n) => n.kind == NoteKind.together).toList();
    expect(together, hasLength(1), reason: 'a person in one note');
    expect(together.single.who, ['jory', 'doran']);
    expect(together.single.says, contains('every time (chapters 3, 5 and 8)'));
  });

  test('light: one chapter, no ties, not a principal; and nothing said of a young book', () {
    final notes = castCheck([
      m('Bram', [2]),
      m('Ada', [2], ties: 1),
    ], chapters: 4);
    expect([for (final n in notes) n.who.single], ['bram']);
    expect(
      castCheck([
        m('Bram', [2]),
      ], chapters: 2),
      isEmpty,
    );
  });

  test('the weightiest kind first, at most four', () {
    final cast = [
      m('Lead', [1], roles: ['Protagonist']),
      for (var i = 0; i < 6; i++) m('Extra$i', [i + 2]),
    ];
    final notes = castCheck(cast, chapters: 10);
    expect(notes, hasLength(4));
    expect(notes.first.kind, NoteKind.forgotten);
  });
}
