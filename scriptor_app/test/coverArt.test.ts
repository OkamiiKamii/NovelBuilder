import { type CoverPattern, coverInitial, coverLines, coverPatternOf, coverSeed } from '../src/domain/coverArt';

describe('the designed jacket', () => {
  test('the primary genre decides the pattern; the others only when it says nothing', () => {
    expect(coverPatternOf('Fantasy', ['Adventure', 'Mystery'])).toBe('arches');
    expect(coverPatternOf('Mystery', ['Fantasy'])).toBe('rain');
    expect(coverPatternOf('', ['Space opera'])).toBe('orbits');
    expect(coverPatternOf('Literary', [])).toBe('ruled');
    expect(coverPatternOf('LitRPG', ['Fantasy'])).toBe('chevrons');
    expect(coverPatternOf('Sea adventure', [])).toBe('waves');
  });

  test('the medallion takes the first letter past a leading article', () => {
    expect(coverInitial('The Drowned Road')).toBe('D');
    expect(coverInitial('an ending')).toBe('E');
    expect(coverInitial('A')).toBe('A');
    expect(coverInitial('  “Échos” de la mer')).toBe('É');
    expect(coverInitial('1984')).toBe('1');
    expect(coverInitial('')).toBe('✦');
  });

  test('every pattern draws finite lines at the smallest and the largest cover', () => {
    const patterns: CoverPattern[] = ['arches', 'orbits', 'waves', 'rain', 'rings', 'halo', 'chevrons', 'ruled'];
    for (const p of patterns) {
      for (const [w, h] of [[60, 84], [180, 171], [420, 630]]) {
        const { d, dots } = coverLines(p, w, h, coverSeed('x'));
        expect(d.length).toBeGreaterThan(0);
        expect(d).not.toMatch(/NaN|Infinity/);
        for (const [x, y] of dots) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
  });

  test('a book keeps its stars', () => {
    expect(coverLines('orbits', 100, 150, coverSeed('a')).dots).toEqual(coverLines('orbits', 100, 150, coverSeed('a')).dots);
  });
});
