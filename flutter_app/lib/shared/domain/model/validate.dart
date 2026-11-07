import '../json.dart';
import '../records/story_node.dart';
import 'connections.dart';
import 'entity_ref.dart';
import 'story_model.dart';
import 'validity.dart';

enum _Rule { string, number, id, idOrNull, object }

/// What every record of each type must have. Everything else is optional: lists older rows lack read as empty, and
/// fields a later version adds are simply absent here. An empty title is allowed; an id is never empty.
const Map<EntityType, Map<String, _Rule>> _required = {
  EntityType.node: {
    'id': _Rule.id,
    'projectId': _Rule.id,
    'kind': _Rule.string,
    'title': _Rule.string,
    'parentId': _Rule.idOrNull,
    'order': _Rule.number,
  },
  EntityType.entry: {'id': _Rule.id, 'projectId': _Rule.id, 'category': _Rule.string, 'name': _Rule.string},
  EntityType.event: {'id': _Rule.id, 'projectId': _Rule.id, 'name': _Rule.string, 'when': _Rule.object},
  EntityType.thread: {'id': _Rule.id, 'projectId': _Rule.id, 'title': _Rule.string, 'status': _Rule.string},
  EntityType.relation: {'id': _Rule.id, 'projectId': _Rule.id, 'fromId': _Rule.id, 'toId': _Rule.id},
  EntityType.ability: {'id': _Rule.id, 'groupId': _Rule.string, 'name': _Rule.string},
};

bool _isId(Object? v) => v is String && v.trim().isNotEmpty;

bool _fits(_Rule rule, Object? value) => switch (rule) {
  _Rule.string => value is String,
  _Rule.number => value is num && value.isFinite,
  _Rule.id => _isId(value),
  _Rule.idOrNull => value == null || _isId(value),
  _Rule.object => value is Map,
};

String _describe(_Rule rule) => switch (rule) {
  _Rule.idOrNull => 'an id or empty',
  _Rule.id => 'an id',
  _Rule.string => 'a string',
  _Rule.number => 'a number',
  _Rule.object => 'a object',
};

const _precisions = ['exact', 'approximate', 'relative', 'unknown'];

/// What is wrong with a stored record, in words. Empty when it fits its contract. Never changes the record.
List<String> validateRecord(EntityType type, Object? row) {
  if (row is! Map) return ['is not a record'];
  final record = row.cast<String, Object?>();
  final problems = [
    for (final e in _required[type]!.entries)
      if (!_fits(e.value, record[e.key])) '${e.key} is missing or not ${_describe(e.value)}',
  ];
  final kind = record['kind'];
  if (type == EntityType.node && kind is String && NodeKind.of(kind) == null) {
    problems.add('kind “$kind” is not one of ${NodeKind.values.map((k) => k.name).join(', ')}');
  }
  final when = record['when'];
  if (type == EntityType.event && when is Map && !_precisions.contains(when['precision'])) {
    problems.add('when has no known precision');
  }
  if (type == EntityType.relation && _isId(record['fromId']) && record['fromId'] == record['toId']) {
    problems.add('a relationship joins a character to themself');
  }
  return problems;
}

/// What is wrong with a ref's shape. Empty when it is well formed (whether or not the record exists).
List<String> validateRef(Object? value) {
  final m = mapOrNull(value);
  if (m == null) return ['is not a ref'];
  final problems = <String>[];
  final type = entityTypeOf(m['type']);
  if (type == null) {
    problems.add('type “${m['type']}” is not one of ${EntityType.values.map((t) => t.name).join(', ')}');
  }
  final id = m['id'];
  if (!_isId(id)) {
    problems.add('id is missing');
  } else if (type == EntityType.ability && !RegExp(r'^[^/]+/[^/]+$').hasMatch(id! as String)) {
    problems.add('an ability id is “<systemId>/<itemId>”');
  }
  return problems;
}

/// What is wrong with a connection against the novel: ends of the wrong type, a record linked to itself, ends that
/// no longer exist, or a "when it holds" that names a chapter or event that is gone.
List<String> validateConnection(StoryModel model, Connection c) {
  final problems = [
    for (final p in validateRef(c.from.toJson())) 'from: $p',
    for (final p in validateRef(c.to.toJson())) 'to: $p',
  ];
  if (problems.isNotEmpty) return problems;
  final ends = c.kind.endpoints;
  if (ends != null && c.from.type != ends.$1) {
    problems.add('“${c.kind.key}” starts from: ${ends.$1.name} (here: ${c.from.type.name})');
  }
  if (ends != null && c.to.type != ends.$2) {
    problems.add('“${c.kind.key}” leads to: ${ends.$2.name} (here: ${c.to.type.name})');
  }
  if (c.from == c.to) problems.add('joins a record to itself');
  for (final (side, end) in [('from', c.from), ('to', c.to)]) {
    if (!model.exists(end)) problems.add('$side: ${end.type.name} ${end.id} does not exist');
  }
  // When it holds may name a chapter or event since deleted: it then holds at an unknown time.
  for (final id in anchorIds(c.validity)) {
    if (!model.nodes.containsKey(id) && !model.events.containsKey(id)) {
      problems.add('when it holds: $id does not exist');
    }
  }
  return problems;
}
