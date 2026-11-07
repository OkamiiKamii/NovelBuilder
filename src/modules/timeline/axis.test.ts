import { describe, expect, it } from 'vitest';
import { eventRecords } from '@/modules/model/events';
import { buildModel } from '@/modules/model/model';
import { AXIS_WIDTH, layoutAxis } from './axis';
import { YEAR } from './chronology';
import type { EventDate, TimelineEvent } from './types';

const exact = (year: number, month: number | null = null, day: number | null = null): EventDate => ({ precision: 'exact', year, month, day, hour: null, minute: null });
const event = (id: string, name: string, when: EventDate, more: Partial<TimelineEvent> = {}): TimelineEvent => ({ id, projectId: 'p', name, description: '', when, duration: null, importance: 'minor', locationId: null, characters: [], entryIds: [], nodeIds: [], afterId: null, createdAt: 0, updatedAt: 0, ...more });
const records = (events: TimelineEvent[]) => eventRecords(buildModel({ project: { id: 'p' } as never, nodes: [], plans: [], entries: [], schemas: [], links: [], relations: [], events, threads: [], systems: [], sheets: [] }));

describe('the drawn timeline', () => {
  it('orders dated events by when they begin, ties by name, and puts the far past first', () => {
    const axis = layoutAxis(records([
      event('a', 'Siege', exact(10, 6, 1)),
      event('b', 'Founding', exact(-500)),
      event('c', 'Coronation', exact(10, 6, 1)),
      event('d', 'Fall', exact(40)),
    ]));
    expect(axis.marks.map((m) => m.title)).toEqual(['Founding', 'Coronation', 'Siege', 'Fall']);
    expect(axis.marks.map((m) => m.x)).toEqual([...axis.marks.map((m) => m.x)].sort((x, y) => x - y));
    expect(axis.marks.every((m) => m.x >= 0 && m.x + m.width <= AXIS_WIDTH)).toBe(true);
  });

  it('shows how much is known about each date, and never guesses a position for one with none', () => {
    const axis = layoutAxis(records([
      event('day', 'A day', exact(10, 6, 1)),
      event('year', 'Some time that year', exact(12)),
      event('season', 'A summer', { precision: 'approximate', year: 14, month: null, season: 'summer' }),
      event('war', 'A war', exact(15), { duration: { amount: 5, unit: 'years' } }),
      event('curse', 'A curse', exact(16), { ongoing: true }),
      event('rumour', 'A rumour', { precision: 'unknown' }),
      event('after', 'Two days after the rumour', { precision: 'relative', anchorId: 'rumour', amount: 2, unit: 'days', direction: 'after' }),
      event('orphan', 'After something deleted', { precision: 'relative', anchorId: 'gone', amount: 2, unit: 'days', direction: 'after' }),
    ]));
    expect(Object.fromEntries(axis.marks.map((m) => [m.id, m.kind]))).toEqual({ day: 'moment', year: 'uncertain', season: 'uncertain', war: 'lasting', curse: 'ongoing' });
    // A stretch is drawn as wide as the time it could be; a war as long as it lasts; a curse to the edge.
    const mark = (id: string) => axis.marks.find((m) => m.id === id)!;
    expect(mark('year').width).toBeGreaterThan(mark('season').width);
    expect(mark('war').width).toBeGreaterThan(mark('year').width * 4);
    expect(mark('curse').x + mark('curse').width).toBeCloseTo(AXIS_WIDTH);
    expect(axis.unplaced).toEqual([
      { id: 'rumour', title: 'A rumour', reason: 'No date yet' },
      { id: 'orphan', title: 'After something deleted', reason: 'Dated from an event that no longer exists' },
      { id: 'after', title: 'Two days after the rumour', reason: 'Dated from an event that has no date yet' },
    ]);
  });

  it('keeps marks and their labels from covering one another', () => {
    const axis = layoutAxis(records(Array.from({ length: 12 }, (_, i) => event(`e${i}`, `Event ${i}`, exact(100 + (i % 3)), i % 4 === 0 ? { duration: { amount: 2, unit: 'years' } } : {}))));
    for (const a of axis.marks) {
      for (const b of axis.marks) {
        if (a === b || a.lane !== b.lane) continue;
        const [first, second] = a.x <= b.x ? [a, b] : [b, a];
        expect(second.x, `${a.title} / ${b.title}`).toBeGreaterThanOrEqual(Math.max(first.x + first.width, first.x + 150));
      }
    }
    expect(axis.lanes).toBeGreaterThan(1);
  });

  it('draws one event with room either side, and nothing at all when there is no dated event', () => {
    const one = layoutAxis(records([event('a', 'Alone', exact(7, 3, 2))]));
    // A day is drawn from its start, the day itself centred: within a pixel of the middle.
    expect(Math.abs(one.marks[0].x - AXIS_WIDTH / 2)).toBeLessThan(1);
    expect(one.to - one.from).toBeGreaterThan(2 * YEAR);
    expect(layoutAxis(records([event('r', 'Rumour', { precision: 'unknown' })]))).toMatchObject({ marks: [], lanes: 0, unplaced: [{ id: 'r' }] });
    expect(layoutAxis([])).toMatchObject({ marks: [], unplaced: [] });
  });
});
