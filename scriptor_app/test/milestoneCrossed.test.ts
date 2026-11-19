import { milestoneCrossed, milestonesFor } from '../src/domain/analytics/milestones';

const road = milestonesFor(80000);

describe('a milestone passed while writing', () => {
  test('passing a milestone names it', () => {
    expect(milestoneCrossed(990, 1004, road)?.name).toBe('the first thousand');
    expect(milestoneCrossed(17400, 17520, road)?.short).toBe('17.5k');
  });
  test('nothing passed, nothing named; going down passes nothing', () => {
    expect(milestoneCrossed(1200, 1300, road)).toBeNull();
    expect(milestoneCrossed(1010, 990, road)).toBeNull();
  });
  test('a paste past two names the furthest', () => {
    expect(milestoneCrossed(900, 8000, road)?.words).toBe(7500);
  });
  test('the whole draft at the target', () => {
    expect(milestoneCrossed(79990, 80001, road)?.name).toBe('the whole draft');
  });
});
