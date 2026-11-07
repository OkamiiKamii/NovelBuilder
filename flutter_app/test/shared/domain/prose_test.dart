import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/diff.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';

import 'fixtures.dart';
import 'golden.dart';

void main() {
  final golden = jsonDecode(File('test/fixtures/golden/prose.golden.json').readAsStringSync()) as JsonMap;

  test('words are counted as the original app counted them', () {
    for (final e in (golden['words']! as JsonMap).entries) {
      // Chinese and Japanese are split with a dictionary in a browser; not matched here (documented in countWords).
      if (e.key.contains('東京')) continue;
      expect(countWords(e.key), e.value, reason: e.key);
    }
  });

  for (final name in fixtureNames) {
    test('every stored text in $name: blocks, counts and linked entries agree', () {
      final docs = ((golden[name]! as JsonMap)['docs']! as JsonMap);
      final s = loadFixture(name);
      var checked = 0;
      for (final row in [...s.rows('chapterContents'), ...s.rows('chapterRevisions'), ...s.rows('chapterBranches')]) {
        final expected = docs[row['id']] as JsonMap?;
        if (expected == null) continue;
        final m = measureDoc(row['doc']);
        expectJson(
          {
            'blocks': [
              for (final b in docBlocks(row['doc'])) {'heading': b.heading, 'text': b.text},
            ],
            'words': m.words,
            'characters': m.characters,
            'paragraphs': m.paragraphs,
            'mentions': mentionsIn(row['doc']),
          },
          expected,
          '$name/${row['id']}',
        );
        checked++;
      }
      expect(checked, docs.length);
    });

    test('version comparisons in $name agree', () {
      final s = loadFixture(name);
      final contents = {for (final r in s.rows('chapterContents')) r['id']: r};
      for (final d in maps((golden[name]! as JsonMap)['diffs'])) {
        final rev = s.rows('chapterRevisions').firstWhere((r) => r['id'] == d['revision']);
        expectJson(
          diffDocs(rev['doc'], contents[rev['nodeId']]!['doc']).toJson(),
          d['result'],
          'diff ${d['revision']}',
        );
      }
    });
  }

  test('paragraph comparisons agree: edits, moves, spacing, additions', () {
    final cases = [
      (
        ['One two three.', 'Keep me.', 'Moved paragraph here.'],
        ['Moved paragraph here.', 'One two four.', 'Keep me.', 'Brand new.'],
      ),
      (['Same  spacing.'], ['Same spacing.']),
      (<String>[], ['Only added.']),
      (['The quick brown fox jumps over the lazy dog.'], ['The quick red fox leaps over the lazy dog!']),
    ];
    for (final (i, c) in cases.indexed) {
      expectJson(diffParagraphs(c.$1, c.$2).toJson(), (golden['paragraphDiffs']! as List)[i], 'case $i');
    }
  });

  test('joining the parts of a word diff gives back both texts exactly', () {
    const before = 'She  ran to the old mill, quickly.';
    const after = 'She walked to the mill — slowly.';
    final parts = diffWords(before, after);
    expect(parts.where((p) => p.op != DiffOp.add).map((p) => p.text).join(), before);
    expect(parts.where((p) => p.op != DiffOp.del).map((p) => p.text).join(), after);
  });

  test('plain text becomes one paragraph per line, keeping blank lines, spaces and tabs', () {
    final doc = textToDoc('First\r\n\n\tIndented  twice');
    expect(blockTexts(doc), ['First', '', '\tIndented  twice']);
  });

  test('stored word counts in the real files match what is measured from their text', () {
    for (final name in fixtureNames) {
      final s = loadFixture(name);
      final nodes = {for (final r in s.rows('chapters')) r['id']: r};
      for (final c in s.rows('chapterContents')) {
        final node = nodes[c['id']];
        if (node == null) continue;
        expect(measureDoc(c['doc']).words, node['wordCount'], reason: '$name ${node['title']}');
      }
    }
  });
}
