import { describe, expect, it } from 'vitest';
import type { Filter } from '@/modules/model/query';
import { nearestInDirection, stepGrid, stepIndex, toggleSelection } from './focus';
import { limitedLine, undecidedLines } from './notice';
import { activeFilters, decodeAnchor, decodeFilter, decodeSelection, encodeAnchor, encodeFilter, encodeSelection, viewModeOf } from './params';
import { applyCommand, boundsOf, clampScale, commandForKey, fitTo, IDENTITY, pinch, toScreen, toWorld, zoomAt } from './zoom';

describe('zoom and pan', () => {
  it('zooms about a point, keeping what is under it where it was', () => {
    const view = { x: 40, y: -10, k: 1.5 };
    const at = { x: 300, y: 200 };
    const before = toWorld(view, at);
    const zoomed = zoomAt(view, 2, at);
    expect(zoomed.k).toBe(3);
    expect(toScreen(zoomed, before).x).toBeCloseTo(at.x);
    expect(toScreen(zoomed, before).y).toBeCloseTo(at.y);
  });

  it('stays within its limits however far it is pushed', () => {
    expect(clampScale(100)).toBe(4);
    expect(clampScale(0)).toBe(0.1);
    let view = IDENTITY;
    for (let i = 0; i < 50; i++) view = zoomAt(view, 2, { x: 0, y: 0 });
    expect(view.k).toBe(4);
  });

  it('fits everything into the space, centred, with room around it', () => {
    const view = fitTo({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, { width: 448, height: 448 }, 24);
    expect(view.k).toBe(2);
    expect(toScreen(view, { x: 100, y: 50 })).toEqual({ x: 224, y: 224 });
    // Something tiny is not blown up past the limit.
    expect(fitTo({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { width: 800, height: 600 }).k).toBe(4);
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ x: 3, y: -1 }, { x: -2, y: 5 }])).toEqual({ minX: -2, minY: -1, maxX: 3, maxY: 5 });
  });

  it('zooms with two fingers by how far they spread, and follows them as they move', () => {
    const view = pinch(IDENTITY, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    expect(view.k).toBeCloseTo(2);
    expect(toScreen(view, { x: 150, y: 100 })).toEqual({ x: 150, y: 100 });
    const moved = pinch(IDENTITY, [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 30, y: 40 }, { x: 40, y: 40 }]);
    expect(moved).toEqual({ x: 30, y: 40, k: 1 });
  });

  it('answers the keyboard: + − zoom about the centre, 0 fits, arrows look around, other keys do nothing', () => {
    const size = { width: 400, height: 300 };
    expect(['+', '=', '-', '_', '0', 'ArrowLeft', 'ArrowUp', 'a', 'Enter'].map(commandForKey)).toEqual(['in', 'in', 'out', 'out', 'fit', 'left', 'up', null, null]);
    const zoomed = applyCommand(IDENTITY, 'in', size, null);
    expect(toScreen(zoomed, { x: 200, y: 150 })).toEqual({ x: 200, y: 150 });
    expect(applyCommand(IDENTITY, 'right', size, null).x).toBeLessThan(0);
    expect(applyCommand(IDENTITY, 'up', size, null).y).toBeGreaterThan(0);
    expect(applyCommand({ x: 5, y: 5, k: 3 }, 'fit', size, null)).toEqual(IDENTITY);
    expect(applyCommand({ x: 5, y: 5, k: 3 }, 'reset', size, null)).toEqual(IDENTITY);
  });
});

describe('moving the keyboard focus', () => {
  it('steps through a list without wrapping, and jumps to the ends', () => {
    expect(['ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End', 'x'].map((k) => stepIndex(5, 2, k))).toEqual([3, 3, 1, 0, 4, null]);
    expect(stepIndex(5, 4, 'ArrowDown')).toBe(4);
    expect(stepIndex(5, 0, 'ArrowUp')).toBe(0);
    expect(stepIndex(5, 2, 'ArrowDown', 'horizontal')).toBeNull();
    expect(stepIndex(0, 0, 'ArrowDown')).toBeNull();
  });

  it('moves through a grid by rows and columns, staying inside it', () => {
    // 3 columns, 7 cells: the last row has one.
    expect(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].map((k) => stepGrid(7, 3, 4, k))).toEqual([5, 3, 4, 1, 3, 5]);
    expect(stepGrid(7, 3, 3, 'ArrowDown')).toBe(6);
    expect(stepGrid(7, 3, 6, 'ArrowRight')).toBe(6);
    expect(stepGrid(7, 3, 6, 'End')).toBe(6);
  });

  it('on a drawing, goes to the nearest mark the arrow points at, not one off to the side', () => {
    const marks = [
      { id: 'here', x: 0, y: 0 },
      { id: 'ahead', x: 100, y: 0 },
      { id: 'near-but-aside', x: 50, y: 45 },
      { id: 'behind', x: -10, y: 0 },
      { id: 'below', x: 0, y: 80 },
    ];
    expect(nearestInDirection(marks, 'here', 'ArrowRight')?.id).toBe('ahead');
    expect(nearestInDirection(marks, 'here', 'ArrowLeft')?.id).toBe('behind');
    expect(nearestInDirection(marks, 'here', 'ArrowDown')?.id).toBe('below');
    expect(nearestInDirection(marks, 'here', 'ArrowUp')).toBeNull();
    expect(nearestInDirection(marks, 'nobody', 'ArrowUp')).toBeNull();
    expect([toggleSelection('a', 'a'), toggleSelection('a', 'b'), toggleSelection(null, 'b')]).toEqual([null, 'b', 'b']);
  });
});

describe('saying what is not shown', () => {
  it('gives one line per reason, counted and named', () => {
    expect(undecidedLines([
      { filter: 'time', reason: 'no date that can be worked out', refs: [{ type: 'event', id: 'a' }, { type: 'event', id: 'b' }, { type: 'event', id: 'c' }] },
      { filter: 'chapters', reason: 'not told in any chapter', refs: [{ type: 'event', id: 'd' }] },
      { filter: 'time', reason: 'no place in story time (only events have one)', refs: [{ type: 'entry', id: 'e' }, { type: 'node', id: 'f' }] },
    ])).toEqual([
      '3 events not shown: no date that can be worked out.',
      '1 event not shown: not told in any chapter.',
      '2 records not shown: no place in story time (only events have one).',
    ]);
    expect(undecidedLines([])).toEqual([]);
    expect(limitedLine(40, 1200)).toBe('Showing 40 of 1,200');
    expect(limitedLine(5, 5)).toBeNull();
  });
});

describe('views in the page address', () => {
  it('writes a filter into the address and reads the same filter back', () => {
    const filter: Filter = {
      types: ['event', 'entry'], characters: ['c1', 'c2'], canon: ['canon', 'non-canon'], text: 'siege',
      chapters: { from: 'n1', to: 'n9' },
      time: { from: { kind: 'date', when: { precision: 'approximate', year: -40, month: null, season: 'summer' } }, until: { kind: 'event', eventId: 'e7' } },
    };
    const params = new URLSearchParams(encodeFilter(filter));
    expect(decodeFilter(params)).toEqual(filter);
    expect(activeFilters(filter)).toBe(6);
    expect(encodeFilter({})).toEqual([]);
    expect(activeFilters({})).toBe(0);
  });

  it('ignores what it cannot read in an old or hand-edited address, and leaves other parameters alone', () => {
    const params = new URLSearchParams('types=event,planet,,event&canon=maybe&after=d:{bad json&before=x:1&from=&q=%20%20&rel=r1');
    expect(decodeFilter(params)).toEqual({ types: ['event'] });
    expect(decodeAnchor('n:')).toBeNull();
    expect(decodeAnchor(encodeAnchor({ kind: 'node', nodeId: 'n1' }))).toEqual({ kind: 'node', nodeId: 'n1' });
    expect(decodeAnchor('d:{"precision":"someday"}')).toBeNull();
    expect(decodeSelection(encodeSelection({ type: 'ability', id: 'sys/item' }))).toEqual({ type: 'ability', id: 'sys/item' });
    expect([decodeSelection('chapter:1'), decodeSelection('entry:'), decodeSelection(null)]).toEqual([null, null, null]);
    expect([viewModeOf(new URLSearchParams('as=list')), viewModeOf(new URLSearchParams('as=table')), viewModeOf(new URLSearchParams())]).toEqual(['list', 'visual', 'visual']);
  });
});
