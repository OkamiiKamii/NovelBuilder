import 'package:flutter/foundation.dart';

/// The kinds of record a view can point at.
///
///  node      a volume, act, arc, chapter or scene (`chapters` collection)
///  entry     a codex entry: character, location, faction, item, power, lore, or a kind the author made (`loreEntries`)
///  event     a timeline event (`timelineEvents`)
///  thread    a plot thread (`plotThreads`)
///  relation  a relationship between two characters (`characterRelations`)
///  ability   a class, skill, title… inside a system blueprint (`systems`), named `<systemId>/<itemId>`
enum EntityType { node, entry, event, thread, relation, ability }

EntityType? entityTypeOf(Object? value) {
  for (final t in EntityType.values) {
    if (t.name == value) return t;
  }
  return null;
}

/// A record, by its stable id. Never by its name, title or position.
@immutable
class EntityRef {
  const EntityRef(this.type, this.id);

  final EntityType type;
  final String id;

  /// One string (`entry:<id>`), for addresses and map keys.
  String get key => '${type.name}:$id';

  /// Reads a ref back from [key]. Null for anything that is not one.
  static EntityRef? parse(String key) {
    final at = key.indexOf(':');
    if (at <= 0) return null;
    final type = entityTypeOf(key.substring(0, at));
    final id = key.substring(at + 1);
    return type == null || id.isEmpty ? null : EntityRef(type, id);
  }

  Map<String, Object?> toJson() => {'type': type.name, 'id': id};

  static EntityRef? fromJson(Object? json) {
    if (json is! Map) return null;
    final type = entityTypeOf(json['type']);
    final id = json['id'];
    return type == null || id is! String ? null : EntityRef(type, id);
  }

  @override
  bool operator ==(Object other) => other is EntityRef && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);

  @override
  String toString() => key;
}

/// What a view shows for any record: its name as it is now, and what kind of thing it is.
@immutable
class EntityView {
  const EntityView(this.ref, this.label, this.kind);

  final EntityRef ref;
  final String label;

  /// The node kind (`chapter`, `scene`…), the codex category key (`character`, `custom-…`), or the entity type.
  final String kind;
}

/// An ability's id: the blueprint and the item, since items live inside their blueprint.
String abilityId(String systemId, String itemId) => '$systemId/$itemId';
