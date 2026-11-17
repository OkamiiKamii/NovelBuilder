// Dart's `Random(seed)`, `List.shuffle(random)` and `String.hashCode` as the Dart VM (Android, Windows) runs them, so
// what the desk puts "in an order that changes with the day" comes out in the same order as in the Flutter app. Pure
// TypeScript. Checked against Dart 3.10 (Flutter 3.38.9): test/desk/dartRandom.test.ts holds the values it printed.

const mask64 = (1n << 64n) - 1n;
const mask32 = 0xffffffffn;
const pow2_32 = 0x100000000;

// Thomas Wang's 64-bit mix, which the VM runs over a seed (runtime/lib/math.cc, `Random_setupSeed`).
function mix64(seed: bigint): bigint {
  let n = seed;
  n = (~n + (n << 21n)) & mask64;
  n = n ^ (n >> 24n);
  n = (n * 265n) & mask64;
  n = n ^ (n >> 14n);
  n = (n * 21n) & mask64;
  n = n ^ (n >> 28n);
  n = (n + (n << 31n)) & mask64;
  return n;
}

/** Dart's `math.Random(seed)` on the VM: multiply-with-carry, base 2^32, its seed mixed and cranked four times. */
export class DartRandom {
  private lo: bigint;
  private hi: bigint;

  /** [seed] is a Dart int: a whole number (a safe JavaScript integer), read as 64 bits. */
  constructor(seed: number) {
    let s = mix64(BigInt.asUintN(64, BigInt(Math.trunc(seed))));
    if (s === 0n) s = 0x5a17n;
    this.lo = s & mask32;
    this.hi = s >> 32n;
    // "Crank a couple of times to distribute the seed bits a bit further."
    for (let i = 0; i < 4; i++) this.nextState();
  }

  private nextState(): void {
    const state = (0xffffda61n * this.lo + this.hi) & mask64;
    this.lo = state & mask32;
    this.hi = state >> 32n;
  }

  /** A whole number from 0 up to, not including, [max] (1 to 2^32). */
  nextInt(max: number): number {
    if (!(max > 0) || max > pow2_32 || !Number.isInteger(max)) {
      throw new RangeError(`max must be in 1..2^32, not ${max}`);
    }
    if (Number.isInteger(Math.log2(max))) {
      // Fast case for powers of two: the low bits (`state & (max - 1)`, the same as the remainder).
      this.nextState();
      return Number(this.lo) % max;
    }
    let rnd32: number;
    let result: number;
    do {
      this.nextState();
      rnd32 = Number(this.lo);
      result = rnd32 % max;
    } while (rnd32 - result + max > pow2_32);
    return result;
  }

  /** A number from 0 up to, not including, 1. */
  nextDouble(): number {
    return (this.nextInt(1 << 26) * 134217728 + this.nextInt(1 << 27)) / 9007199254740992;
  }
}

/** A copy of [list] shuffled as Dart's `List.shuffle(random)` shuffles it in place. */
export function dartShuffled<T>(list: readonly T[], random: DartRandom): T[] {
  const out = [...list];
  let length = out.length;
  while (length > 1) {
    const pos = random.nextInt(length);
    length -= 1;
    const tmp = out[length];
    out[length] = out[pos];
    out[pos] = tmp;
  }
  return out;
}

/** Dart's `String.hashCode` on the VM: a one-at-a-time hash over the UTF-16 code units, kept to 30 bits, never 0. */
export function dartStringHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash + text.charCodeAt(i)) >>> 0;
    hash = (hash + (hash << 10)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }
  hash = (hash + (hash << 3)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  hash = (hash + (hash << 15)) >>> 0;
  hash = hash & ((1 << 30) - 1);
  return hash === 0 ? 1 : hash;
}
