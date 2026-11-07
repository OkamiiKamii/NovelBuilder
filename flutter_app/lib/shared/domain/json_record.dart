import 'package:flutter/foundation.dart';

import 'json.dart';

/// A stored record: the complete JSON it was read from, with typed fields read on top.
///
/// PRESERVATION RULE: a record keeps every field it was given, including ones this version of the app does not
/// know (written by a newer version, a module that is turned off, or by hand). Changes are made with [merged], which
/// replaces only the named fields, so saving, exporting or migrating a record never drops anything.
///
/// Readers never throw: a missing or mistyped field reads as its default, and `validate.dart` reports it.
@immutable
abstract class JsonRecord {
  JsonRecord(JsonMap raw) : raw = freezeMap(raw);

  /// Everything the record holds, deeply unmodifiable.
  final JsonMap raw;

  String get id => str(raw['id']);

  /// The project this record belongs to.
  String get projectId => str(raw['projectId']);

  /// The record as JSON, a mutable copy safe to change.
  JsonMap toJson() => deepCopy(raw)! as JsonMap;

  /// The stored JSON with [changes] applied: a `null` value stores null (it does not remove the key).
  JsonMap merged(JsonMap changes) => {...toJson(), ...deepCopy(changes)! as JsonMap};

  @override
  bool operator ==(Object other) => other.runtimeType == runtimeType && jsonEquals((other as JsonRecord).raw, raw);

  @override
  int get hashCode => Object.hash(runtimeType, id);

  @override
  String toString() => '$runtimeType($id)';
}
