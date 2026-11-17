// A port of the pure expectations in flutter_app/test/features/write/draft_road_test.dart.

import { milestonesFor, roadPosition, shortCount, whereOnRoad } from '../../src/domain/analytics/milestones';

test('the marks on the road: the lengths fiction is measured by, up to the novel’s own target', () => {
  expect(milestonesFor(null).map((m) => m.words)).toEqual([1000, 7500, 17500, 40000, 80000]);
  expect(milestonesFor(30000).map((m) => m.words)).toEqual([1000, 7500, 17500, 30000]);
  expect(milestonesFor(120000).at(-1)).toEqual({ words: 120000, name: 'the whole draft', short: '120k' });
  expect([shortCount(950), shortCount(7500), shortCount(80000), shortCount(92500)]).toEqual([
    '950',
    '7.5k',
    '80k',
    '92.5k',
  ]);
});

test('where the words stand: by orders of magnitude, the next mark and the last passed', () => {
  expect(roadPosition(0, 80000)).toBe(0);
  expect(Math.abs(roadPosition(1000, 80000) - 0.344)).toBeLessThanOrEqual(0.001);
  expect(roadPosition(80000, 80000)).toBe(1);
  expect(roadPosition(200000, 80000)).toBe(1);
  const road = milestonesFor(null);
  expect(whereOnRoad(766, road)).toEqual({ passed: null, next: road[0] });
  expect(whereOnRoad(8000, road)).toEqual({ passed: road[1], next: road[2] });
  expect(whereOnRoad(90000, road)).toEqual({ passed: road.at(-1), next: null });
});
