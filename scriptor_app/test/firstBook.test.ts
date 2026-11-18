import { wantsFirstBook } from '../src/domain/libraryView';
import { Novel } from '../src/domain/novel';

const novel = (raw: Record<string, unknown>) => new Novel({ id: String(raw['id'] ?? 'n'), title: 't', ...raw });

describe('the first book', () => {
  test('is offered with no novels, or only the sample', () => {
    expect(wantsFirstBook([])).toBe(true);
    expect(wantsFirstBook([novel({ id: 's', scriptorSample: true })])).toBe(true);
  });

  test('is not offered once the writer has a book of their own', () => {
    expect(wantsFirstBook([novel({ id: 's', scriptorSample: true }), novel({ id: 'mine' })])).toBe(false);
  });

  test('an archived book of their own does not count', () => {
    expect(wantsFirstBook([novel({ id: 'old', archived: true })])).toBe(true);
  });
});
