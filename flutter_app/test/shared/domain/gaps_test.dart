import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/text/gaps.dart';

void main() {
  group('gapsIn', () {
    test('TK on its own, and a note in double brackets, each found where it is written', () {
      const text = 'The blade was forged in TK, under [[the name of the pass]].';
      final gaps = gapsIn(text);
      expect([for (final g in gaps) text.substring(g.start, g.end)], ['TK', '[[the name of the pass]]']);
      expect([for (final g in gaps) g.note], ['', 'the name of the pass']);
    });

    test('TKTK counts once; an empty [[ ]] is a gap with no note', () {
      expect(gapsIn('He said TKTK and left.').single.note, '');
      expect(gapsIn('He said TKTK and left.').single.end - gapsIn('He said TKTK and left.').single.start, 4);
      expect(gapsIn('Then [[ ]] happened.').single.note, '');
    });

    test('not a gap: TK inside a word, lowercase tk, single brackets (a LitRPG window), an unclosed [[', () {
      expect(gapsIn('The TKO came in the third round.'), isEmpty);
      expect(gapsIn('Atkins and tk are not gaps.'), isEmpty);
      expect(gapsIn('[Skill acquired: Smart Atoms] [Level 3]'), isEmpty);
      expect(gapsIn('She wrote [[ and stopped.'), isEmpty);
    });
  });

  group('bookGaps', () {
    test('every gap, in reading order, with the words either side and its paragraph', () {
      final gaps = bookGaps(
        {
          'c2': ['Second chapter, with TK in it.'],
          'c1': ['Nothing here.', 'Mira rode to [[town name]] at dawn.'],
        },
        ['c1', 'c2'],
      );
      expect([for (final g in gaps) g.nodeId], ['c1', 'c2']);
      expect(gaps.first.block, 1);
      expect(gaps.first.written, '[[town name]]');
      expect(gaps.first.before, 'Mira rode to ');
      expect(gaps.first.after, ' at dawn.');
      expect(gaps.last.note, '');
    });

    test('long paragraphs are cut round the gap at a space', () {
      final long = '${List.filled(30, 'word').join(' ')} TK ${List.filled(30, 'more').join(' ')}';
      final g = bookGaps(
        {
          'c': [long],
        },
        ['c'],
      ).single;
      expect(g.before, startsWith('…'));
      expect(g.after, endsWith('…'));
      expect(g.before.length, lessThanOrEqualTo(gapContextChars + 1));
      expect(g.after.length, lessThanOrEqualTo(gapContextChars + 1));
      expect(g.before, endsWith('word '));
    });

    test('the job reads the chapters as stored, only those asked for', () {
      String stored(String id, String text) => jsonEncode({'id': id, 'doc': textToDoc(text)});
      final gaps = gapsJob(
        [stored('a', 'One TK.'), stored('b', 'Two [[x]].'), stored('z', 'Not asked TK.')],
        ['b', 'a'],
      )();
      expect([for (final g in gaps) g.nodeId], ['b', 'a']);
    });
  });
}
