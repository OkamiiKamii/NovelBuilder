import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

/// Builds small, hand-made novels for tests. Ids are readable on purpose.
class NovelBuilder {
  NovelBuilder([this.projectId = 'novel']);

  final String projectId;
  final Map<String, List<JsonMap>> collections = {};
  var _created = 0;

  JsonMap _row(String collection, JsonMap row) {
    final full = {'projectId': projectId, 'createdAt': ++_created, ...row};
    (collections[collection] ??= []).add(full);
    return full;
  }

  void node(
    String id, {
    String kind = 'chapter',
    String? parent,
    num order = 0,
    String? title,
    List<String> mentions = const [],
  }) => _row('chapters', {
    'id': id,
    'parentId': parent,
    'kind': kind,
    'title': title ?? id,
    'order': order,
    'summary': '',
    'notes': '',
    'status': 'drafting',
    'mentions': mentions,
    'wordCount': 0,
    'charCount': 0,
  });

  void entry(String id, {String category = 'character', String? name, List<JsonMap> fields = const []}) =>
      _row('loreEntries', {'id': id, 'category': category, 'name': name ?? id, 'fields': fields, 'tags': <String>[]});

  void link(
    String id,
    String from,
    String to, {
    String? type,
    String fromType = 'entry',
    String toType = 'entry',
    JsonMap? validity,
  }) => _row('loreLinks', {
    'id': id,
    'fromId': from,
    'toId': to,
    'fromType': fromType,
    'toType': toType,
    'fromLabel': '',
    'toLabel': '',
    'type': ?type,
    'validity': ?validity,
  });

  void event(
    String id, {
    JsonMap? when,
    List<String> characters = const [],
    List<String> nodeIds = const [],
    String? locationId,
    String? afterId,
    List<String> threadIds = const [],
    JsonMap? duration,
  }) => _row('timelineEvents', {
    'id': id,
    'name': id,
    'description': '',
    'when': when ?? {'precision': 'unknown'},
    'duration': duration,
    'importance': 'minor',
    'locationId': locationId,
    'characters': [
      for (final c in characters) {'id': c, 'age': null},
    ],
    'entryIds': <String>[],
    'nodeIds': nodeIds,
    'afterId': afterId,
    'threadIds': threadIds,
  });

  void relation(String id, String from, String to, List<JsonMap> stages) =>
      _row('characterRelations', {'id': id, 'fromId': from, 'toId': to, 'stages': stages});

  void thread(String id, {List<String> characterIds = const [], List<JsonMap> beats = const []}) =>
      _row('plotThreads', {
        'id': id,
        'title': id,
        'status': 'active',
        'category': 'main',
        'characterIds': characterIds,
        'locationIds': <String>[],
        'beats': beats,
        'targetNodeId': null,
      });

  void journey(
    String id, {
    List<String> travellers = const [],
    String? from,
    String? to,
    List<String> via = const [],
  }) => _row('journeys', {
    'id': id,
    'travellerIds': travellers,
    'fromId': from,
    'toId': to,
    'via': via,
    'eventIds': <String>[],
  });

  void row(String collection, JsonMap row) => _row(collection, row);

  NovelSnapshot build() =>
      NovelSnapshot(project: {'id': projectId, 'title': 'Test novel', 'status': 'drafting'}, collections: collections);
}

JsonMap year(num y, {int? month, String? season}) => {
  'precision': 'approximate',
  'year': y,
  'month': month,
  'season': season,
};

JsonMap exact(num y, {int? month, int? day}) => {
  'precision': 'exact',
  'year': y,
  'month': month,
  'day': day,
  'hour': null,
  'minute': null,
};

JsonMap stage(
  String id, {
  String? startNodeId,
  String title = '',
  bool directional = false,
  String fromRole = '',
  String toRole = '',
}) => {
  'id': id,
  'startNodeId': startNodeId,
  'preset': 'custom',
  'category': 'custom',
  'label': '',
  'fromRole': fromRole,
  'toRole': toRole,
  'directional': directional,
  'title': title,
  'affinity': 'neutral',
  'event': '',
  'notes': '',
};
