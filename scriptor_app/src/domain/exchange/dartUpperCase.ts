// Dart's String.toUpperCase as the Dart VM (Android, Windows) runs it, for a whole string. Pure TypeScript.
// Characters in the Basic Multilingual Plane map as `dartUpperUnit` says (manuscript/dartUpper.ts). Above it, the Dart
// VM upper-cases only Deseret (U+10428–1044F to U+10400–10427); every other character there (Osage, Vithkuqi, Old
// Hungarian, Garay, Warang Citi, Medefaidrin, Adlam and the rest) stays as it is, and a lone surrogate stays too.
// Checked against Dart 3.10 (Flutter 3.38.9) over every character.

import { dartUpperUnit } from '../manuscript/dartUpper';

export function dartToUpperCase(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xffff) out += dartUpperUnit(ch);
    else out += c >= 0x10428 && c <= 0x1044f ? String.fromCodePoint(c - 0x28) : ch;
  }
  return out;
}
