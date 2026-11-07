/// Sorted with ties kept in their original order, as JavaScript's `Array.prototype.sort` keeps them. Dart's own
/// `List.sort` does not promise that, and two records can compare equal (two characters both called "Mira").
List<T> stableSorted<T>(Iterable<T> items, int Function(T a, T b) compare) {
  final indexed = [...items.indexed]
    ..sort((a, b) {
      final c = compare(a.$2, b.$2);
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  return [for (final (_, item) in indexed) item];
}
