// Sorting with ties kept in their original order. A port of flutter_app/lib/shared/domain/stable_sort.dart. Pure
// TypeScript: it does not rely on the engine's own sort being stable.

/** The items sorted by [compare], ties kept in the order they came in, as JavaScript's `Array.prototype.sort` keeps
 * them and as the Flutter app's `stableSorted` does. A new array: the input is not changed. */
export function stableSorted<T>(items: Iterable<T>, compare: (a: T, b: T) => number): T[] {
  const indexed = Array.from(items, (item, i) => [i, item] as const);
  indexed.sort((a, b) => {
    const c = compare(a[1], b[1]);
    return c !== 0 ? c : a[0] - b[0];
  });
  return indexed.map(([, item]) => item);
}
