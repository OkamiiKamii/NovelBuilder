import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/query.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/validate.dart';
import 'package:novel_builder/shared/domain/records/link.dart';

import 'builder.dart';

void main() {
  const mira = EntityRef(EntityType.entry, 'mira');
  const orrin = EntityRef(EntityType.entry, 'orrin');

  group('typed connections', () {
    test('a one-sided kind says nothing about the other side', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..entry('mira')
              ..entry('orrin')
              ..link('l', 'mira', 'orrin', type: 'considers-rival'))
            .build(),
      );
      final c = deriveConnections(model).connections.single;
      expect(c.directed, isTrue);
      expect(c.label, 'Considers a rival');
      expect(c.reverseLabel, isNull, reason: 'Orrin\'s view is never invented');
      final seenByOrrin = connectionsOf([c], orrin).single;
      expect(seenByOrrin.label, '');
      expect(seenByOrrin.theirLabel, 'Considers a rival');
      expect(seenByOrrin.outgoing, isFalse);
    });

    test('a converse kind reads correctly from both ends; a mutual kind the same both ways', () {
      expect(wordingOf(Link({'id': 'a', 'type': 'owns', 'fromLabel': '', 'toLabel': ''})).backward, 'Owned by');
      final allied = wordingOf(Link({'id': 'b', 'type': 'allied-with', 'fromLabel': '', 'toLabel': ''}));
      expect((allied.forward, allied.backward, allied.reciprocal), ('Allied with', 'Allied with', true));
      // The author's own word is kept as written and treated as one-sided.
      final own = wordingOf(Link({'id': 'c', 'type': 'owes a debt to', 'fromLabel': '', 'toLabel': ''}));
      expect((own.forward, own.backward, own.reciprocal), ('owes a debt to', '', false));
    });

    test('connections store ids only, so a rename shows everywhere at once', () {
      final s =
          (NovelBuilder()
                ..entry('mira')
                ..entry('keep', category: 'location')
                ..event('siege', characters: ['mira'], locationId: 'keep'))
              .build();
      final connections = deriveConnections(StoryModel.fromSnapshot(s)).connections;
      expect({for (final c in connections) c.kind}, {ConnectionKind.participant, ConnectionKind.occursAt});
      expect(connections.every((c) => c.toJson().keys.toSet().containsAll(['from', 'to', 'source'])), isTrue);
    });

    test('a reference field on an entry is a connection, named after the field', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..entry(
                'wardens',
                category: 'faction',
                fields: [
                  {'id': 'f1', 'key': 'Leader', 'value': 'mira', 'type': 'reference'},
                ],
              )
              ..entry('mira'))
            .build(),
      );
      final c = deriveConnections(model).connections.single;
      expect((c.kind, c.label, c.to), (ConnectionKind.field, 'Leader', mira));
    });

    test('a link whose end is deleted is reported as broken, not hidden', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..entry('mira')
              ..link('l', 'mira', 'ghost'))
            .build(),
      );
      final result = deriveConnections(model);
      expect(result.connections, isEmpty);
      expect(result.dangling.single.missing, [const EntityRef(EntityType.entry, 'ghost')]);
    });
  });

  group('validation', () {
    test('a well-formed record has no problems', () {
      expect(
        validateRecord(EntityType.node, {
          'id': 'n',
          'projectId': 'p',
          'kind': 'chapter',
          'title': '',
          'parentId': null,
          'order': 0,
        }),
        isEmpty,
      );
    });

    test('problems are described in words, and the record is not changed', () {
      final row = {'id': '', 'projectId': 'p', 'kind': 'chapterette', 'title': 'x', 'parentId': 5, 'order': 'first'};
      final copy = {...row};
      expect(validateRecord(EntityType.node, row), [
        'id is missing or not an id',
        'parentId is missing or not an id or empty',
        'order is missing or not a number',
        'kind “chapterette” is not one of volume, act, arc, chapter, scene',
      ]);
      expect(row, copy);
      expect(
        validateRecord(EntityType.event, {
          'id': 'e',
          'projectId': 'p',
          'name': 'x',
          'when': {'precision': 'soonish'},
        }),
        ['when has no known precision'],
      );
      expect(validateRecord(EntityType.relation, {'id': 'r', 'projectId': 'p', 'fromId': 'a', 'toId': 'a'}), [
        'a relationship joins a character to themself',
      ]);
      expect(validateRecord(EntityType.entry, 'nope'), ['is not a record']);
    });

    test('connections are checked against their kind and the novel', () {
      final model = StoryModel.fromSnapshot((NovelBuilder()..entry('mira')).build());
      Connection make(ConnectionKind kind, EntityRef from, EntityRef to, {String? until}) => Connection(
        id: 'x',
        kind: kind,
        from: from,
        to: to,
        label: '',
        directed: true,
        source: const ConnectionSource('loreLinks', 'x'),
      );
      expect(validateConnection(model, make(ConnectionKind.participant, const EntityRef(EntityType.node, 'n'), mira)), [
        '“participant” starts from: entry (here: node)',
        '“participant” leads to: event (here: entry)',
        'from: node n does not exist',
      ]);
      expect(validateConnection(model, make(ConnectionKind.link, mira, mira)), ['joins a record to itself']);
      expect(validateRef({'type': 'ability', 'id': 'no-slash'}), ['an ability id is “<systemId>/<itemId>”']);
    });
  });

  group('shared query', () {
    test('a filter that cannot decide says why instead of guessing', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..entry('mira')
              ..event('dated', when: year(10))
              ..event('undated'))
            .build(),
      );
      final result = select(
        model,
        Filter.fromJson({
          'time': {
            'from': {'kind': 'date', 'when': year(5)},
          },
        }),
      );
      expect([for (final v in result.items) v.ref.id], ['dated']);
      final reasons = {
        for (final u in result.undecided) u.reason: [for (final r in u.refs) r.id],
      };
      expect(reasons['no date that can be worked out'], ['undated']);
      expect(reasons['no place in story time (only events have one)'], ['mira']);
    });

    test('records involved with a character include the character and what connects to them', () {
      final model = StoryModel.fromSnapshot(
        (NovelBuilder()
              ..entry('mira')
              ..entry('orrin')
              ..entry('keep', category: 'location')
              ..event('siege', characters: ['mira']))
            .build(),
      );
      final ids = [
        for (final v in select(model, const Filter(characters: ['mira'])).items) v.ref.id,
      ];
      expect(ids, ['mira', 'siege']);
    });
  });

  test('text sorts as the original app does: case and accents ignored first', () {
    final names = ['zed', 'Émile', 'bran', 'Anna', 'emile', 'Bran', '10 Kings', '#tag'];
    expect(names..sort(localeCompare), ['#tag', '10 Kings', 'Anna', 'bran', 'Bran', 'emile', 'Émile', 'zed']);
  });
}
