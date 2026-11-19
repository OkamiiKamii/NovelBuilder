import { widgetSummary } from '../../src/domain/desk/widgetSummary';
import type { JsonMap } from '../../src/domain/json';

const novel = (id: string, lastOpenedAt: number | null, archived = false) => ({ id, title: `T${id}`, archived, lastOpenedAt });
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...ps: string[]) => ({ type: 'doc', content: ps.map(para) });

function run(
  novels: ReturnType<typeof novel>[],
  o: { sessions?: JsonMap[]; goals?: JsonMap[]; doc?: unknown } = {},
) {
  const asked: string[] = [];
  const s = widgetSummary({
    novels,
    sessionsOf: (id) => (asked.push(id), o.sessions ?? []),
    goalsOf: (id) => (asked.push(id), o.goals ?? []),
    lastDocOf: (id) => (asked.push(id), o.doc),
  });
  return { s, asked };
}

describe('widgetSummary', () => {
  it('is null with no candidates', () => {
    expect(run([]).s).toEqual({ version: 1, book: null });
    expect(run([novel('a', null), novel('b', 5, true)]).s.book).toBeNull();
  });

  it('picks the latest opened, skipping archived and never-opened, and asks only for it', () => {
    const { s, asked } = run([novel('a', 10), novel('b', 99, true), novel('c', null), novel('d', 20)]);
    expect(s.book?.title).toBe('Td');
    expect(new Set(asked)).toEqual(new Set(['d']));
  });

  it('sums net per day and marks written, also for added only', () => {
    const { s } = run([novel('a', 1)], {
      sessions: [
        { day: '2026-01-01', netWords: 50, added: 60 },
        { day: '2026-01-01', netWords: -20 },
        { day: '2026-01-02', netWords: -5, added: 10 },
        { day: '2026-01-03', netWords: -5 },
        { day: '2026-01-04' },
        { netWords: 9 },
      ],
    });
    expect(s.book?.days).toEqual({
      '2026-01-01': { net: 30, written: true },
      '2026-01-02': { net: -5, written: true },
      '2026-01-03': { net: -5, written: false },
      '2026-01-04': { net: 0, written: false },
    });
  });

  it('takes the first daily goal with target words', () => {
    const goals = [
      { kind: 'total', targetWords: 5 },
      { kind: 'daily', targetWords: null },
      { kind: 'daily', targetWords: 300 },
      { kind: 'daily', targetWords: 900 },
    ];
    expect(run([novel('a', 1)], { goals }).s.book?.goal).toBe(300);
    expect(run([novel('a', 1)]).s.book?.goal).toBeNull();
  });

  it('takes lines from the doc, cut from a sentence when long', () => {
    const long = `Start. ${'a'.repeat(120)}. Then the last sentence ends the chapter here for good.`;
    expect(run([novel('a', 1)], { doc: doc('One.', 'Last words.', '  ') }).s.book?.lines).toBe('Last words.');
    expect(run([novel('a', 1)], { doc: doc(long) }).s.book?.lines).toBe('Then the last sentence ends the chapter here for good.');
    expect(run([novel('a', 1)], { doc: doc('', ' ') }).s.book?.lines).toBeNull();
    expect(run([novel('a', 1)]).s.book?.lines).toBeNull();
  });
});
