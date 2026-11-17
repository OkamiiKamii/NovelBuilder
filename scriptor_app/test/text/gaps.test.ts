// A port of flutter_app/test/shared/domain/gaps_test.dart, with the cases gaps.dart's comments describe.

import { textToDoc } from '../../src/domain/prose';
import { bookGaps, gapContextChars, gapsIn, gapsJob } from '../../src/domain/text/gaps';

const filled = (n: number, s: string) => Array<string>(n).fill(s);

describe('gapsIn', () => {
  test('TK on its own, and a note in double brackets, each found where it is written', () => {
    const text = 'The blade was forged in TK, under [[the name of the pass]].';
    const gaps = gapsIn(text);
    expect(gaps.map((g) => text.substring(g.start, g.end))).toEqual(['TK', '[[the name of the pass]]']);
    expect(gaps.map((g) => g.note)).toEqual(['', 'the name of the pass']);
  });

  test('TKTK counts once; an empty [[ ]] is a gap with no note', () => {
    const tktk = gapsIn('He said TKTK and left.');
    expect(tktk).toHaveLength(1);
    expect(tktk[0].note).toBe('');
    expect(tktk[0].end - tktk[0].start).toBe(4);
    const empty = gapsIn('Then [[ ]] happened.');
    expect(empty).toHaveLength(1);
    expect(empty[0].note).toBe('');
  });

  test('not a gap: TK inside a word, lowercase tk, single brackets (a LitRPG window), an unclosed [[', () => {
    expect(gapsIn('The TKO came in the third round.')).toEqual([]);
    expect(gapsIn('Atkins and tk are not gaps.')).toEqual([]);
    expect(gapsIn('[Skill acquired: Smart Atoms] [Level 3]')).toEqual([]);
    expect(gapsIn('She wrote [[ and stopped.')).toEqual([]);
  });
});

describe('bookGaps', () => {
  test('every gap, in reading order, with the words either side and its paragraph', () => {
    const gaps = bookGaps(
      new Map([
        ['c2', ['Second chapter, with TK in it.']],
        ['c1', ['Nothing here.', 'Mira rode to [[town name]] at dawn.']],
      ]),
      ['c1', 'c2'],
    );
    expect(gaps.map((g) => g.nodeId)).toEqual(['c1', 'c2']);
    expect(gaps[0].block).toBe(1);
    expect(gaps[0].written).toBe('[[town name]]');
    expect(gaps[0].before).toBe('Mira rode to ');
    expect(gaps[0].after).toBe(' at dawn.');
    expect(gaps[gaps.length - 1].note).toBe('');
  });

  test('long paragraphs are cut round the gap at a space', () => {
    const long = `${filled(30, 'word').join(' ')} TK ${filled(30, 'more').join(' ')}`;
    const gaps = bookGaps(new Map([['c', [long]]]), ['c']);
    expect(gaps).toHaveLength(1);
    const g = gaps[0];
    expect(g.before.startsWith('…')).toBe(true);
    expect(g.after.endsWith('…')).toBe(true);
    expect(g.before.length).toBeLessThanOrEqual(gapContextChars + 1);
    expect(g.after.length).toBeLessThanOrEqual(gapContextChars + 1);
    expect(g.before.endsWith('word ')).toBe(true);
  });

  test('the job reads the chapters as stored, only those asked for', () => {
    const stored = (id: string, text: string) => JSON.stringify({ id, doc: textToDoc(text) });
    const gaps = gapsJob([stored('a', 'One TK.'), stored('b', 'Two [[x]].'), stored('z', 'Not asked TK.')], ['b', 'a'])();
    expect(gaps.map((g) => g.nodeId)).toEqual(['b', 'a']);
  });

  test('a stored record that is not JSON, or a chapter asked for but not stored, is passed over', () => {
    const stored = JSON.stringify({ id: 'a', doc: textToDoc('One TK.') });
    const gaps = gapsJob(['{"id": "b", TK not json', stored], ['b', 'a', 'missing'])();
    expect(gaps.map((g) => [g.nodeId, g.written, g.before, g.after])).toEqual([['a', 'TK', 'One ', '.']]);
  });
});
