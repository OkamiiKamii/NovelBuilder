// Dart's trim and toLowerCase as the Dart VM runs them. Every expectation here was read from Dart 3.10.8 (Flutter
// 3.38.9) running the same strings.

import { dartToLowerCase, dartTrim, dartTrimLeft, dartTrimRight } from '../../src/domain/text/dartString';
import { redPencil } from '../../src/domain/text/redPencil';

test('trim: Dart also trims U+0085, as JavaScript does not', () => {
  expect(dartTrim('\u0085 note \u0085')).toBe('note');
  expect(dartTrimLeft('\u0085﻿　 a ')).toBe('a ');
  expect(dartTrimRight(' a  \u0085')).toBe(' a');
  expect(dartTrim('᠎')).toBe('᠎');
});

test('lower case: character by character, no final sigma, no dotted i, older tables', () => {
  expect(dartToLowerCase('ΛΌΓΟΣ')).toBe('λόγοσ');
  expect(dartToLowerCase('ΟΔΟΣ ΟΔΟΣ. ΣΑΣ İSTANBUL 𐐀𐐁 ǅ ẞ')).toBe('οδοσ οδοσ. σασ istanbul 𐐨𐐩 ǆ ß');
  expect(dartToLowerCase('İ')).toHaveLength(1);
  expect(dartToLowerCase('ᎠᏍᎦᏯ Ʞ Ϳ')).toBe('ᎠᏍᎦᏯ Ʞ Ϳ');
  expect(dartToLowerCase('The Road')).toBe('the road');
});

test('the red pencil reads words in those lower cases', () => {
  const marks = (text: string) => redPencil([text]).findings.map((f) => [f.kind, f.start, f.end, f.word]);
  expect(marks('ΔΡΟΜΟΣ ήταν. ΔΡΟΜΟΣ πάλι.')).toEqual([
    ['echo', 0, 6, 'δρομοσ'],
    ['echo', 13, 19, 'δρομοσ'],
  ]);
  expect(marks('İSTANBUL kaldı. İSTANBUL yine.')).toEqual([
    ['echo', 0, 8, 'istanbul'],
    ['echo', 16, 24, 'istanbul'],
  ]);
  expect(marks('ᎠᏍᎦᏯ went. ᎠᏍᎦᏯ came.')).toEqual([
    ['echo', 0, 4, 'ᎠᏍᎦᏯ'],
    ['echo', 11, 15, 'ᎠᏍᎦᏯ'],
  ]);
});
