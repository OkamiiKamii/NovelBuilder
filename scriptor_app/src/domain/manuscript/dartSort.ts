// Dart's List.sort, as the Dart VM runs it (dart:_internal's Sort): an insertion sort for up to 33 elements, a
// dual-pivot quicksort above. It is not stable, so where a port sorts with a comparison that can tie, it sorts with
// this to put tied elements in the order the Flutter app puts them. Pure TypeScript.

const insertionSortThreshold = 32;

/** Sorts [list] in place, exactly as Dart's `List.sort(compare)` does. */
export function dartSort<E>(list: E[], compare: (a: E, b: E) => number): E[] {
  doSort(list, 0, list.length - 1, compare);
  return list;
}

function doSort<E>(a: E[], left: number, right: number, compare: (a: E, b: E) => number): void {
  if (right - left <= insertionSortThreshold) {
    insertionSort(a, left, right, compare);
  } else {
    dualPivotQuicksort(a, left, right, compare);
  }
}

function insertionSort<E>(a: E[], left: number, right: number, compare: (a: E, b: E) => number): void {
  for (let i = left + 1; i <= right; i++) {
    const el = a[i];
    let j = i;
    while (j > left && compare(a[j - 1], el) > 0) {
      a[j] = a[j - 1];
      j--;
    }
    a[j] = el;
  }
}

function dualPivotQuicksort<E>(a: E[], left: number, right: number, compare: (a: E, b: E) => number): void {
  const sixth = Math.trunc((right - left + 1) / 6);
  const index1 = left + sixth;
  const index5 = right - sixth;
  const index3 = Math.trunc((left + right) / 2);
  const index2 = index3 - sixth;
  const index4 = index3 + sixth;

  let el1 = a[index1];
  let el2 = a[index2];
  let el3 = a[index3];
  let el4 = a[index4];
  let el5 = a[index5];

  // A sorting network for the five.
  if (compare(el1, el2) > 0) [el1, el2] = [el2, el1];
  if (compare(el4, el5) > 0) [el4, el5] = [el5, el4];
  if (compare(el1, el3) > 0) [el1, el3] = [el3, el1];
  if (compare(el2, el3) > 0) [el2, el3] = [el3, el2];
  if (compare(el1, el4) > 0) [el1, el4] = [el4, el1];
  if (compare(el3, el4) > 0) [el3, el4] = [el4, el3];
  if (compare(el2, el5) > 0) [el2, el5] = [el5, el2];
  if (compare(el2, el3) > 0) [el2, el3] = [el3, el2];
  if (compare(el4, el5) > 0) [el4, el5] = [el5, el4];

  const pivot1 = el2;
  const pivot2 = el4;

  a[index1] = el1;
  a[index3] = el3;
  a[index5] = el5;

  a[index2] = a[left];
  a[index4] = a[right];

  let less = left + 1;
  let great = right - 1;

  const pivotsAreEqual = compare(pivot1, pivot2) === 0;
  if (pivotsAreEqual) {
    const pivot = pivot1;
    for (let k = less; k <= great; k++) {
      const ak = a[k];
      let comp = compare(ak, pivot);
      if (comp === 0) continue;
      if (comp < 0) {
        if (k !== less) {
          a[k] = a[less];
          a[less] = ak;
        }
        less++;
      } else {
        for (;;) {
          comp = compare(a[great], pivot);
          if (comp > 0) {
            great--;
            continue;
          } else if (comp < 0) {
            a[k] = a[less];
            a[less++] = a[great];
            a[great--] = ak;
            break;
          } else {
            a[k] = a[great];
            a[great--] = ak;
            break;
          }
        }
      }
    }
  } else {
    for (let k = less; k <= great; k++) {
      const ak = a[k];
      const compPivot1 = compare(ak, pivot1);
      if (compPivot1 < 0) {
        if (k !== less) {
          a[k] = a[less];
          a[less] = ak;
        }
        less++;
      } else {
        const compPivot2 = compare(ak, pivot2);
        if (compPivot2 > 0) {
          for (;;) {
            let comp = compare(a[great], pivot2);
            if (comp > 0) {
              great--;
              if (great < k) break;
              continue;
            } else {
              comp = compare(a[great], pivot1);
              if (comp < 0) {
                a[k] = a[less];
                a[less++] = a[great];
                a[great--] = ak;
              } else {
                a[k] = a[great];
                a[great--] = ak;
              }
              break;
            }
          }
        }
      }
    }
  }

  a[left] = a[less - 1];
  a[less - 1] = pivot1;
  a[right] = a[great + 1];
  a[great + 1] = pivot2;

  doSort(a, left, less - 2, compare);
  doSort(a, great + 2, right, compare);

  if (pivotsAreEqual) return;

  if (less < index1 && great > index5) {
    while (compare(a[less], pivot1) === 0) less++;
    while (compare(a[great], pivot2) === 0) great--;
    for (let k = less; k <= great; k++) {
      const ak = a[k];
      const compPivot1 = compare(ak, pivot1);
      if (compPivot1 === 0) {
        if (k !== less) {
          a[k] = a[less];
          a[less] = ak;
        }
        less++;
      } else {
        const compPivot2 = compare(ak, pivot2);
        if (compPivot2 === 0) {
          for (;;) {
            let comp = compare(a[great], pivot2);
            if (comp === 0) {
              great--;
              if (great < k) break;
              continue;
            } else {
              comp = compare(a[great], pivot1);
              if (comp < 0) {
                a[k] = a[less];
                a[less++] = a[great];
                a[great--] = ak;
              } else {
                a[k] = a[great];
                a[great--] = ak;
              }
              break;
            }
          }
        }
      }
    }
    doSort(a, less, great, compare);
  } else {
    doSort(a, less, great, compare);
  }
}

/** Dart's `compareTo` on two numbers (ints or doubles that are neither NaN nor -0.0 against 0.0). */
export function compareNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
