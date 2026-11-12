import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/modules/module_defs.dart';
import 'package:novel_builder/shared/domain/modules/module_match.dart';
import 'package:novel_builder/shared/domain/text/fold.dart';

import 'module_match_reference.dart';

void main() {
  test('the matching agrees with the matching it replaced, on books of every kind of word around its words', () {
    final rnd = Random(2026);
    for (var round = 0; round < 30; round++) {
      final chapters = [for (var c = 0; c < 1 + rnd.nextInt(4); c++) _text(rnd, 5 + rnd.nextInt(40))];
      final genres = [_text(rnd, 1 + rnd.nextInt(2))];
      final tags = [_text(rnd, rnd.nextInt(3))];
      final synopsis = _text(rnd, rnd.nextInt(12));
      final on = {if (rnd.nextBool()) 'progression'};
      final now = fittingModules(genres: genres, tags: tags, synopsis: synopsis, chapters: chapters, on: on, limit: 10);
      final before = referenceFittingModules(
        genres: genres,
        tags: tags,
        synopsis: synopsis,
        chapters: chapters,
        on: on,
        limit: 10,
      );
      expect('$now', '$before', reason: 'round $round: ${chapters.join(' | ')}');
    }
  });

  test('folding leaves plain ASCII as it was (lower case), as the table never held it', () {
    for (var c = 0; c < 0x80; c++) {
      final s = String.fromCharCode(c);
      expect(foldText(s), s.toLowerCase(), reason: 'U+${c.toRadixString(16)}');
    }
    expect(foldText('Émile café Ωmega 𝐀'), 'emile cafe ωmega 𝐀');
  });

  test('the chapters as stored are read and matched together; an unreadable record counts as an empty chapter', () {
    final stored = [
      jsonEncode({'id': 'c1', 'doc': textToDoc('Can create skills.\n\nHave ranks from E to SSS.')}),
      '{not json',
      jsonEncode({'id': 'c2', 'doc': textToDoc('Evolution of ranks.')}),
    ];
    final fits = fittingModulesFromStored(genres: const [], tags: const [], synopsis: '', storedContents: stored);
    expect(fits.first.moduleId, 'progression');
    expect(fits.first.words, containsAll(['ranks', 'skills']));
  });

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

/// The words, half-words, accents, hyphens and phrases a book's text may put around the modules' words.
const _vocab = [
  'magic',
  'magical',
  'Magic',
  'MAGIC',
  'mägic',
  'magic,',
  '(magic)',
  'unmagic',
  'magic2',
  'skills',
  'skill',
  'skill-tree',
  'sci-fi',
  'sci',
  'fi',
  'scifi',
  'science',
  'fiction',
  'science fiction',
  'coming',
  'of',
  'age',
  'slice',
  'life',
  'café',
  'Élan',
  'niño',
  'Ωmega',
  '𝐀lpha',
  'dragon𝐀',
  '𝐀dragon',
  '“love”',
  'it’s',
  'hero’s',
  'level\nup',
  'war.',
  '42',
  'ranks',
  'évolution',
  'evolution',
  'king',
  'queen',
  'Kingdom',
  'the',
  'and',
  '—',
  '…',
];

String _text(Random rnd, int words) => [
  for (var i = 0; i < words; i++) _vocab[rnd.nextInt(_vocab.length)],
].join(const [' ', ' ', '\n', ' — ', '-', ''][rnd.nextInt(6)]);
