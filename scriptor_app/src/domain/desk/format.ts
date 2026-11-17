// Numbers and plurals as the Flutter app writes them on the writing desk. Ports of `formatNumber` and `plural`
// (flutter_app/lib/core/format.dart) and `grouped` (flutter_app/lib/shared/domain/analytics/progress.dart).

/** Dart's `num.round()`: halves away from zero (JavaScript's Math.round takes -2.5 to -2; Dart to -3). */
export function dartRound(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

function groupDigits(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

/** 12345 → "12,345" (`formatNumber`: the sign is taken from the number before it is rounded). */
export function formatNumber(n: number): string {
  return (n < 0 ? '-' : '') + groupDigits(String(Math.abs(dartRound(n))));
}

/** "1 chapter", "3 chapters", "1,200 words". */
export function plural(n: number, one: string, many?: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/** "1,234" (`grouped`: the sign is taken from the rounded number). */
export function grouped(n: number): string {
  const whole = dartRound(n);
  return (whole < 0 ? '-' : '') + groupDigits(String(Math.abs(whole)));
}
