import { lastLines } from '../src/domain/prose';

describe('the last lines, to pick up from', () => {
  test('a chapter with no words has none', () => {
    expect(lastLines([])).toBeNull();
    expect(lastLines(['', '   '])).toBeNull();
  });

  test('a short last paragraph is given whole; empty paragraphs after it are skipped', () => {
    expect(lastLines(['First.', 'The gulls never came back.', '', ' '])).toBe('The gulls never came back.');
  });

  test('a long one starts at a sentence when one starts in reach', () => {
    const p = `${'a'.repeat(300)} end of that. Then a third, and a fourth, and after that they came steadily, rolling out over the roofs.`;
    const got = lastLines([p], 140)!;
    expect(got.startsWith('Then a third')).toBe(true);
    expect(p.endsWith(got)).toBe(true);
  });

  test('else at a word, with … before it, never mid-word', () => {
    const p = 'word '.repeat(100).trim();
    const got = lastLines([p], 50)!;
    expect(got.startsWith('…word')).toBe(true);
    expect(got.length).toBeLessThanOrEqual(51);
  });
});
