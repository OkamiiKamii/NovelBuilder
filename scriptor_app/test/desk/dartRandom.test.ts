// Dart's Random, List.shuffle and String.hashCode on the VM. Every value below was printed by Dart 3.10 (Flutter
// 3.38.9's `dart`) running the same calls.

import { DartRandom, dartShuffled, dartStringHash } from '../../src/domain/desk/dartRandom';

const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// seed, six nextInt(10), three nextInt(1000000007), nextInt(1 << 32), nextInt(8); three nextDouble(); a shuffle of 0..9.
const printed: [number, number[], number[], number, number, number[], number[]][] = [
  [0, [5, 9, 4, 9, 6, 1], [249241694, 410351881, 815154820], 99294569, 7, [0.8255140718871702, 0.8863148172405516, 0.424722653321134], [8, 3, 6, 2, 1, 0, 7, 4, 9, 5]],
  [1, [4, 7, 5, 9, 5, 7], [270779841, 105046169, 183405195], 2500936781, 2, [0.5785012864412081, 0.25563430262583553, 0.9199665121717772], [5, 3, 9, 8, 2, 1, 6, 7, 0, 4]],
  [2, [3, 9, 0, 4, 4, 6], [782926367, 910914469, 312047105], 3307144841, 4, [0.0007835923093592045, 0.009621562914079451, 0.5579650219760721], [7, 5, 2, 9, 8, 0, 1, 4, 6, 3]],
  [42, [7, 8, 4, 5, 7, 4], [283265935, 505223464, 590394787], 3903089919, 4, [0.15092545597797424, 0.6041479725361217, 0.6616810157870647], [2, 0, 1, 5, 8, 3, 9, 4, 6, 7]],
  [-1, [1, 6, 6, 5, 5, 4], [925559199, 347985119, 555364680], 3160002075, 5, [0.7720972841262559, 0.5830866438362797, 0.7681775856352291], [0, 3, 7, 6, 4, 5, 9, 8, 2, 1]],
  [2026001, [4, 8, 3, 7, 7, 2], [996731336, 218354257, 560854960], 2621280101, 4, [0.12800321603882714, 0.4161707140012397, 0.43302380473283475], [8, 3, 1, 0, 2, 5, 6, 7, 9, 4]],
  [1099511627776, [9, 7, 7, 3, 0, 7], [575404902, 947838983, 966817340], 2263926515, 5, [0.21344452585736218, 0.1812512776519407, 0.0011032526052449088], [3, 1, 6, 4, 5, 2, 8, 7, 0, 9]],
  [3000000000, [2, 4, 3, 5, 2, 3], [835231591, 997757464, 591538595], 16179043, 0, [0.14834756436177687, 0.29012036244432327, 0.9713643914714428], [5, 1, 6, 0, 3, 9, 4, 7, 8, 2]],
  [-987654321, [9, 6, 8, 6, 0, 6], [319359712, 327332025, 607227229], 2867343709, 0, [0.8264140442913404, 0.13131467044670053, 0.7190816718693596], [6, 4, 3, 5, 1, 7, 0, 8, 2, 9]],
];

describe('DartRandom', () => {
  test.each(printed)('seed %p gives what Dart gives', (seed, tens, bigs, full, eight, doubles, shuffled) => {
    const r = new DartRandom(seed);
    expect(Array.from({ length: 6 }, () => r.nextInt(10))).toEqual(tens);
    expect(Array.from({ length: 3 }, () => r.nextInt(1000000007))).toEqual(bigs);
    expect(r.nextInt(2 ** 32)).toBe(full);
    expect(r.nextInt(8)).toBe(eight);
    const d = new DartRandom(seed);
    expect(Array.from({ length: 3 }, () => d.nextDouble())).toEqual(doubles);
    expect(dartShuffled(ten, new DartRandom(seed))).toEqual(shuffled);
  });

  test('a max out of range is refused, as Dart refuses it', () => {
    expect(() => new DartRandom(1).nextInt(0)).toThrow(RangeError);
    expect(() => new DartRandom(1).nextInt(2 ** 32 + 1)).toThrow(RangeError);
  });

  test('shuffling leaves the list it was given as it was', () => {
    const list = [...ten];
    dartShuffled(list, new DartRandom(3));
    expect(list).toEqual(ten);
  });
});

describe('dartStringHash', () => {
  test.each([
    ['', 1],
    ['a', 170824770],
    ['abc', 756227931],
    ['Main draft', 479846783],
    ['2026-11-11', 300730295],
    ['0f8fad5b-d9cb-469f-a165-70867728950e', 632681915],
    ['é', 1028356693],
    ['Ωmega', 323571686],
    ['😀x', 782366035],
    ['n1', 859400742],
  ])('%p hashes as in Dart', (text, hash) => {
    expect(dartStringHash(text)).toBe(hash);
  });
});
