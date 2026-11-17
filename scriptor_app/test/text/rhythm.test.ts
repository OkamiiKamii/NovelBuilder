// A port of flutter_app/test/shared/domain/rhythm_test.dart.

import { RhythmReport, rhythmOf } from '../../src/domain/text/rhythm';

test('sentences: split at their ends, quotes kept with them, dialogue marked', () => {
  const paragraphs = ['The gate was open. Nobody guarded it!', '“Go,” she said. “Now?”', 'No end mark'];
  const r = rhythmOf(paragraphs);
  const text = (i: number) => paragraphs[r.sentences[i].block].substring(r.sentences[i].start, r.sentences[i].end);
  expect(r.sentences.map((_, i) => text(i))).toEqual([
    'The gate was open.',
    'Nobody guarded it!',
    '“Go,” she said.',
    '“Now?”',
    'No end mark',
  ]);
  expect(r.sentences.map((s) => s.words)).toEqual([4, 3, 3, 1, 3]);
  expect(r.sentences.map((s) => s.spoken)).toEqual([false, false, true, true, false]);
  expect([r.shortest, r.longest, r.usual]).toEqual([1, 4, 3]);
});

test('a run keeps one beat: five or more of nearly one length, four words or more', () => {
  const of = (n: number) => `${Array<string>(n).fill('word').join(' ')}.`;
  const r = rhythmOf([[of(2), of(8), of(9), of(10), of(8), of(11), of(30), of(3)].join(' ')]);
  expect(r.runs).toEqual([{ from: 1, to: 6 }]);
  // Short lines in a row are a beat too.
  expect(rhythmOf([Array<string>(6).fill(of(2)).join(' ')]).runs).toEqual([]);
  // Four is not yet a run.
  expect(rhythmOf([Array<string>(4).fill(of(9)).join(' ')]).runs).toEqual([]);
  expect(RhythmReport.empty.usual).toBe(0);
});
