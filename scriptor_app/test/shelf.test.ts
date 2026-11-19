import { shelfRows, spineHeight, spineThickness } from '../src/domain/libraryView';

describe('the shelf', () => {
  test('a spine thickens as the book is written, within bounds', () => {
    expect(spineThickness(0)).toBe(30);
    expect(spineThickness(10000)).toBe(50);
    expect(spineThickness(10000)).toBeGreaterThan(spineThickness(1000));
    expect(spineThickness(10_000_000)).toBe(78);
  });

  test('a book keeps its height', () => {
    expect(spineHeight('abc')).toBe(spineHeight('abc'));
    for (const id of ['a', 'bb', 'novel-1', 'x9']) expect(spineHeight(id)).toBeGreaterThanOrEqual(168);
  });

  test('rows fill the width and every book is placed once', () => {
    const books = [40, 40, 40, 40, 90].map((thickness, i) => ({ id: i, thickness }));
    const rows = shelfRows(books, 130, 4);
    expect(rows.map((r) => r.map((b) => b.id))).toEqual([[0, 1, 2], [3], [4]]);
    expect(shelfRows([], 100, 4)).toEqual([]);
  });
});
