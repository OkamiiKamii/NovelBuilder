// A port of flutter_app/test/shared/domain/book_setting_test.dart, and of the plain-text expectations in
// flutter_app/test/features/write/book_setting_test.dart (whose widget checks are not ported).

import { chapterOpening, isSceneBreak } from '../../src/domain/text/bookSetting';

test('scene breaks as writers type them', () => {
  for (const t of ['***', '* * *', '#', '  ~~~  ', '⁂', '• • •', '*-*-*']) {
    expect([t, isSceneBreak(t)]).toEqual([t, true]);
  }
  for (const t of ['', '---', '— —', '*Really*', 'The end.', '# Heading', '1 * 2']) {
    expect([t, isSceneBreak(t)]).toEqual([t, false]);
  }
});

describe('chapterOpening', () => {
  function parts(text: string): string {
    const o = chapterOpening(text)!;
    return `${text.substring(0, o.initialEnd)}|${text.substring(o.initialEnd, o.capsEnd)}|`;
  }

  test('the first letter raised, the rest of the first words in small capitals', () => {
    expect(parts('The bell in the Wardens’ tower had not rung.')).toBe('T|he bell in the|');
  });

  test('stops at the first comma or stop', () => {
    expect(parts('A top of the Mimir Forest, a figure was flying.')).toBe('A| top of the Mimir|');
    expect(parts('Rain, and then nothing.')).toBe('R|ain|');
    expect(parts('Go.')).toBe('G|o|');
  });

  test('an opening quotation mark goes up with the letter; the small capitals stop at the closing one', () => {
    expect(parts('“Wren,” Master Marrow said.')).toBe('“W|ren|');
    expect(parts('"Here you go." The receptionist gave it.')).toBe('"H|ere you go|');
  });

  test('nothing to raise without a letter to begin with', () => {
    expect(chapterOpening('— and then she was gone.')).toBeNull();
    expect(chapterOpening('   ')).toBeNull();
  });
});

test('the chapter of the page test: its opening, its break, and a paragraph that is neither', () => {
  // flutter_app/test/features/write/book_setting_test.dart sets this chapter and finds "T" raised, "he bell in the" in
  // small capitals, and "* * *" drawn as an ornament.
  const text =
    'The bell in the tower had not rung in thirty-one years, and when it rang, Wren dropped the ink.\n' +
    '* * *\n' +
    'Nobody guarded the gate.';
  const [first, rule, last] = text.split('\n');
  const o = chapterOpening(first)!;
  expect(first.substring(0, o.initialEnd)).toBe('T');
  expect(first.substring(o.initialEnd, o.capsEnd)).toBe('he bell in the');
  expect(isSceneBreak(rule)).toBe(true);
  expect(isSceneBreak(first)).toBe(false);
  expect(isSceneBreak(last)).toBe(false);
});
