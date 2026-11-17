// A port of flutter_app/test/shared/domain/storyboard_test.dart.

import { storyboardJob, storyCardOf, storyLineChars } from '../../src/domain/manuscript/storyboard';
import { textToDoc } from '../../src/domain/prose';

function blocks(paragraphs: string[], heading?: string): { heading: boolean; text: string }[] {
  return [
    ...(heading !== undefined ? [{ heading: true, text: heading }] : []),
    ...paragraphs.map((p) => ({ heading: false, text: p })),
  ];
}

const names = {
  wren: ['Wren Hollis', 'Wren'],
  ilse: ['Ilse Marrow', 'Ilse'],
  vell: ['Vell'],
};

test('the first sentence, the last, and who is there, most present first', () => {
  const card = storyCardOf(
    blocks(
      [
        'The bell had not rung in thirty-one years. Wren dropped the ink.',
        '“Wren,” Ilse said. “What is that?”',
        'Wren ran to the window. Far off, the sea was going away.',
      ],
      'The Bell',
    ),
    names,
  );
  expect(card.opening).toBe('The bell had not rung in thirty-one years.');
  expect(card.closing).toBe('Far off, the sea was going away.');
  // Wren four times, Ilse once; Vell not at all.
  expect(card.present).toEqual(['wren', 'ilse']);
});

test('a closing quotation stays with its sentence', () => {
  const card = storyCardOf(blocks(['She left.', 'He called after her. “Come back!”']), names);
  expect(card.closing).toBe('“Come back!”');
});

test('one sentence only: an opening and no ending; nothing written: neither', () => {
  expect(storyCardOf(blocks(['Only this.']), names).closing).toBe('');
  const none = storyCardOf(blocks(['', '  '], 'Empty'), names);
  expect(none.opening).toBe('');
  expect(none.closing).toBe('');
  expect(none.present).toEqual([]);
});

test('a long sentence is cut at a word: the opening at its end, the closing at its start', () => {
  const long = Array<string>(60).fill('word').join(' ');
  const card = storyCardOf(blocks([`${long}.`, `Then ${long} end.`]), names);
  expect(card.opening.length).toBeLessThanOrEqual(storyLineChars + 1);
  expect(card.opening.endsWith('…')).toBe(true);
  expect(card.closing.startsWith('…')).toBe(true);
  expect(card.closing.endsWith('end.')).toBe(true);
});

test('the job reads every stored chapter by id', () => {
  const stored = (id: string, text: string) => JSON.stringify({ id, doc: textToDoc(text) });
  const cards = storyboardJob([stored('a', 'Wren sang.\nIlse slept.'), stored('b', 'Vell burned.')], names)();
  expect(cards.get('a')!.opening).toBe('Wren sang.');
  expect(cards.get('a')!.closing).toBe('Ilse slept.');
  expect(cards.get('b')!.present).toEqual(['vell']);
});
