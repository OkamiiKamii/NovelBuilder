import 'dart:collection';

/// A JSON object as decoded by `dart:convert`.
typedef JsonMap = Map<String, Object?>;

/// A deep, mutable copy of a JSON value: maps and lists are copied, everything else is shared (it is immutable).
Object? deepCopy(Object? value) => switch (value) {
  final Map<String, Object?> m => <String, Object?>{for (final e in m.entries) e.key: deepCopy(e.value)},
  final Map<Object?, Object?> m => <String, Object?>{for (final e in m.entries) '${e.key}': deepCopy(e.value)},
  final List<Object?> l => [for (final v in l) deepCopy(v)],
  _ => value,
};

/// A deep, unmodifiable copy: what records hold, so nothing can change a record behind its back.
Object? deepFreeze(Object? value) => switch (value) {
  final Map<Object?, Object?> m => UnmodifiableMapView<String, Object?>({
    for (final e in m.entries) '${e.key}': deepFreeze(e.value),
  }),
  final List<Object?> l => List<Object?>.unmodifiable([for (final v in l) deepFreeze(v)]),
  _ => value,
};

JsonMap freezeMap(JsonMap map) => deepFreeze(map)! as JsonMap;

/// Structural equality of two JSON values. Numbers compare by value, so `5` equals `5.0`.
bool jsonEquals(Object? a, Object? b) {
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (!b.containsKey(key) || !jsonEquals(a[key], b[key])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!jsonEquals(a[i], b[i])) return false;
    }
    return true;
  }
  return a == b;
}

// Readers that never throw. A value of the wrong type reads as absent; the record keeps it unchanged.

String str(Object? value, [String fallback = '']) => value is String ? value : fallback;

String? strOrNull(Object? value) => value is String ? value : null;

/// A non-empty string, as an id must be.
String? idOrNull(Object? value) => value is String && value.trim().isNotEmpty ? value : null;

num? numOrNull(Object? value) => value is num && value.isFinite ? value : null;

int? intOrNull(Object? value) =>
    value is int ? value : (value is double && value.isFinite && value == value.roundToDouble() ? value.toInt() : null);

bool boolOf(Object? value, {bool fallback = false}) => value is bool ? value : fallback;

/// A list read leniently: anything that is not a list is empty.
List<Object?> listOf(Object? value) => value is List ? value.cast<Object?>() : const [];

/// The strings of a list; other values are skipped (and stay in the stored record).
List<String> strings(Object? value) => [for (final v in listOf(value)) ?strOrNull(v)];

/// The objects of a list; other values are skipped (and stay in the stored record).
List<JsonMap> maps(Object? value) => [
  for (final v in listOf(value))
    if (v is Map) v.cast<String, Object?>(),
];

JsonMap? mapOrNull(Object? value) => value is Map ? value.cast<String, Object?>() : null;
