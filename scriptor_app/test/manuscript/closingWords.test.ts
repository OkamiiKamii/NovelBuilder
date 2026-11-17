// A port of flutter_app/test/shared/domain/closing_words_test.dart.

import { closingWords } from '../../src/domain/manuscript/closingWords';
import { emptyDoc, textToDoc } from '../../src/domain/prose';

test('the closing words are the last paragraphs, exactly as written, headings left out', () => {
  const doc = textToDoc('One.\n\nTwo, then three.');
  expect(closingWords(doc)).toEqual({ text: 'One.\n\nTwo, then three.', cut: false });
  expect(closingWords(emptyDoc())).toEqual({ text: '', cut: false });
  expect(closingWords(null)).toEqual({ text: '', cut: false });
  expect(
    closingWords({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Part one' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'It began.' }] },
      ],
    }),
  ).toEqual({ text: 'It began.', cut: false });
});

test('a long ending is cut at a space, never inside a word, and says it was cut', () => {
  const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  const closing = closingWords(textToDoc(`Earlier.\n\n${words}`), { max: 60 });
  expect(closing.cut).toBe(true);
  expect(words.endsWith(closing.text)).toBe(true);
  // Starts on a whole word.
  expect(closing.text.startsWith('word')).toBe(true);
  expect(closing.text.length).toBeLessThanOrEqual(60);
  expect(closing.text.endsWith('word199')).toBe(true);
});

test('earlier paragraphs that do not fit are left out whole', () => {
  // Too little room is left for a useful part of it.
  const closing = closingWords(textToDoc(`${'a '.repeat(100)}\n\nShort end.`), { max: 50 });
  expect(closing).toEqual({ text: 'Short end.', cut: true });
  // With room, the end of the earlier one too.
  const roomy = closingWords(textToDoc(`${'a '.repeat(100)}\n\nShort end.`), { max: 80 });
  expect(roomy.text.endsWith('a a\n\nShort end.')).toBe(true);
});

test('one unbroken run longer than the room keeps its end', () => {
  const closing = closingWords(textToDoc('x'.repeat(100)), { max: 60 });
  expect(closing).toEqual({ text: 'x'.repeat(60), cut: true });
});
