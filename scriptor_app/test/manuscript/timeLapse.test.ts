// A port of flutter_app/test/shared/domain/time_lapse_test.dart.

import { timeLapse } from '../../src/domain/manuscript/timeLapse';

test('frames oldest first, a save that changed nothing left out, what each adds marked', () => {
  const frames = timeLapse([
    { at: 30, paragraphs: ['The gate was open.', 'Nobody guarded it.', 'Orrin went in.'] },
    { at: 10, paragraphs: ['The gate was open.', ''] },
    { at: 20, paragraphs: ['The gate was open.', 'Nobody guarded it.'] },
    { at: 25, paragraphs: ['The gate was open.', 'Nobody guarded it.'] },
  ]);
  expect(frames.map((f) => f.at)).toEqual([10, 20, 30]);
  expect(frames.map((f) => f.words)).toEqual([4, 7, 10]);
  expect(frames.map((f) => f.fresh)).toEqual([new Set([0]), new Set([1]), new Set([2])]);
});

test('a paragraph rewritten is new where it stands; one cut leaves nothing marked', () => {
  const rewritten = timeLapse([
    { at: 1, paragraphs: ['A.', 'B.', 'C.'] },
    { at: 2, paragraphs: ['A.', 'B, changed.', 'C.'] },
    { at: 3, paragraphs: ['A.', 'C.'] },
  ]);
  expect(rewritten[1].fresh).toEqual(new Set([1]));
  expect(rewritten[2].fresh).toEqual(new Set());
  expect(rewritten[2].words).toBe(2);
});

test('nothing saved, nothing to show', () => {
  expect(timeLapse([])).toEqual([]);
});
