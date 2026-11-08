import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/modules/module_match.dart';

void main() {
  test('every module has its words, and every listed id is a module', () {
    expect(moduleWords.keys.toSet(), {for (final m in builtinModules) m.id});
  });

  test('a story of skills and ranks calls for progression; words count where they are', () {
    final fits = fittingModules(
      genres: const [],
      tags: const [],
      synopsis: '',
      chapters: const ['Skill Creator. Can create skills. Have ranks from E to SSS. Have 4 evolution from Ranks.'],
    );
    expect(fits.first.moduleId, 'progression');
    expect(fits.first.words, containsAll(['ranks']));
    expect(fits.first.words.where((w) => w.startsWith('skill')), hasLength(1), reason: 'one form of a word');
  });

  test('a genre outweighs a stray word; modules already on, and weak matches, are left out', () {
    final fits = fittingModules(
      genres: const ['Mystery'],
      tags: const [],
      synopsis: 'A detective in a haunted town.',
      chapters: const ['He saw a ghost once.'],
      on: const {'horror'},
    );
    expect(fits.map((f) => f.moduleId), ['mystery']);
    expect(
      fittingModules(genres: const [], tags: const [], synopsis: '', chapters: const ['They had a heart.']),
      isEmpty,
      reason: 'one word in one chapter is not enough',
    );
  });

  test('whole words only: "class" is not found in "classic", "level" not in "levelled"', () {
    final fits = fittingModules(
      genres: const [],
      tags: const [],
      synopsis: '',
      chapters: const ['A classic tale.', 'The ground was levelled.'],
    );
    expect(fits, isEmpty);
  });
}
