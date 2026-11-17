// Dart's String.trim, trimLeft, trimRight and toLowerCase as the Dart VM (Android, Windows) runs them, for the text
// ports that use them, where JavaScript's differ. Pure TypeScript (it also runs in the editor's WebView).
//
// Trim: Dart also trims U+0085 (NEXT LINE), which is Unicode White_Space; JavaScript does not. Dart's set:
// U+0009–000D, U+0020, U+0085, U+00A0, U+1680, U+2000–200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF.

const ws = '\\t-\\r \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
const leading = new RegExp(`^[${ws}]+`);
const trailing = new RegExp(`[${ws}]+$`);

/** The text without white space at either end, as Dart's `String.trim` reads white space. */
export function dartTrim(text: string): string {
  return dartTrimRight(dartTrimLeft(text));
}

/** The text without white space at its start, as Dart's `String.trimLeft`. */
export function dartTrimLeft(text: string): string {
  return text.replace(leading, '');
}

/** The text without white space at its end, as Dart's `String.trimRight`. */
export function dartTrimRight(text: string): string {
  return text.replace(trailing, '');
}

// Lower case: the Dart VM maps each character on its own by the simple Unicode mapping, from older tables. So, unlike
// JavaScript, a final sigma stays "σ" (not "ς"), "İ" is "i" (not "i̇", two characters), and the letters below, which
// later Unicode versions gave a lower case (Cherokee, Osage, Adlam, Latin Extended-D and others), stay as they are.
// Checked against Dart 3.10 (Flutter 3.38.9) over every character to U+1FFFF; none above has a lower case.
const dartUncased: readonly number[] = [
  0x37f, 0x37f, 0x524, 0x524, 0x526, 0x526, 0x528, 0x528, 0x52a, 0x52a, 0x52c, 0x52c, 0x52e, 0x52e, 0x10c7, 0x10c7,
  0x10cd, 0x10cd, 0x13a0, 0x13f5, 0x1c89, 0x1c89, 0x1c90, 0x1cba, 0x1cbd, 0x1cbf, 0x2c2f, 0x2c2f, 0x2c70, 0x2c70,
  0x2c7e, 0x2c7f, 0x2ceb, 0x2ceb, 0x2ced, 0x2ced, 0x2cf2, 0x2cf2, 0xa660, 0xa660, 0xa698, 0xa698, 0xa69a, 0xa69a,
  0xa78d, 0xa78d, 0xa790, 0xa790, 0xa792, 0xa792, 0xa796, 0xa796, 0xa798, 0xa798, 0xa79a, 0xa79a, 0xa79c, 0xa79c,
  0xa79e, 0xa79e, 0xa7a0, 0xa7a0, 0xa7a2, 0xa7a2, 0xa7a4, 0xa7a4, 0xa7a6, 0xa7a6, 0xa7a8, 0xa7a8, 0xa7aa, 0xa7ae,
  0xa7b0, 0xa7b4, 0xa7b6, 0xa7b6, 0xa7b8, 0xa7b8, 0xa7ba, 0xa7ba, 0xa7bc, 0xa7bc, 0xa7be, 0xa7be, 0xa7c0, 0xa7c0,
  0xa7c2, 0xa7c2, 0xa7c4, 0xa7c7, 0xa7c9, 0xa7c9, 0xa7cb, 0xa7cc, 0xa7ce, 0xa7ce, 0xa7d0, 0xa7d0, 0xa7d2, 0xa7d2,
  0xa7d4, 0xa7d4, 0xa7d6, 0xa7d6, 0xa7d8, 0xa7d8, 0xa7da, 0xa7da, 0xa7dc, 0xa7dc, 0xa7f5, 0xa7f5, 0x104b0, 0x104d3,
  0x10570, 0x1057a, 0x1057c, 0x1058a, 0x1058c, 0x10592, 0x10594, 0x10595, 0x10c80, 0x10cb2, 0x10d50, 0x10d65,
  0x118a0, 0x118bf, 0x16e40, 0x16e5f, 0x16ea0, 0x16eb8, 0x1e900, 0x1e921,
];

function uncasedInDart(c: number): boolean {
  for (let i = 0; i < dartUncased.length; i += 2) {
    if (c < dartUncased[i]) return false;
    if (c <= dartUncased[i + 1]) return true;
  }
  return false;
}

const ascii = /^[\x00-\x7f]*$/;

/** The text in lower case, as Dart's `String.toLowerCase` on the Dart VM. */
export function dartToLowerCase(text: string): string {
  if (ascii.test(text)) return text.toLowerCase();
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    out += c === 0x130 ? 'i' : uncasedInDart(c) ? ch : ch.toLowerCase();
  }
  return out;
}
