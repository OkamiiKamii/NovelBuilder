// The record check, ported: agreement with the original app on both real files (whole and damaged), and its
// connection, fix and merge behaviour (src/modules/connections, src/modules/integrity tests).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/characters/character_changes.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/integrity/fixes.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

NovelSnapshot _damaged(NovelSnapshot s) {
  final character = s.rows('loreEntries').where((e) => e['category'] == 'character').firstOrNull?['id'];
  final chapter = s.rows('chapters').where((n) => n['kind'] == 'chapter').firstOrNull?['id'];
  return s
      .withRows('loreEntries', [
        for (final r in s.rows('loreEntries'))
          if (r['id'] != character) r,
      ])
      .withRows('chapters', [
        for (final r in s.rows('chapters'))
          if (r['id'] != chapter) r,
      ]);
}

JsonMap _report(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final aliases = {for (final p in s.rows('characterProfiles')) str(p['entryId']): strings(p['aliases'])};
  return {
    'broken': [
      for (final b in brokenReferences(model, s.rows('structureMarkers')))
        {
          'key': b.key,
          'where': b.where,
          'table': b.table,
          'rowId': b.rowId,
          'missing': {'type': b.missing.type.name, 'id': b.missing.id},
          'says': b.says,
        },
    ],
    'unresolved': [
      for (final u in unresolvedFields(model))
        {
          'key': u.key,
          'entry': u.entry.id,
          'fieldId': u.fieldId,
          'fieldName': u.fieldName,
          'value': u.value,
          'suggestions': [for (final e in u.suggestions) e.id],
        },
    ],
    'duplicates': [
      for (final d in duplicateCandidates(model.entries.values.toList(), aliases))
        {
          'key': d.key,
          'a': d.a.id,
          'b': d.b.id,
          'rule': d.rule == DuplicateRule.sameName ? 'same-name' : 'alias',
          'because': d.because,
        },
    ],
    'unfit': [
      for (final u in unfitEntries(model))
        {
          'key': u.key,
          'entry': u.entry.id,
          'issues': [
            for (final i in u.issues)
              {'defId': i.defId, 'field': i.field, 'problem': i.problem.key, 'message': i.message},
          ],
        },
    ],
    'statuses': [for (final c in deriveConnections(model).connections) statusOf(c)?.name],
  };
}

/// A small novel to change, step by step, as the app does.
class Novel {
  NovelSnapshot s = NovelSnapshot(project: {'id': 'novel', 'title': 'Integrity'}, collections: const {});
  int clock = 1000;
  int _ids = 0;

  T act<T>(T Function(CharacterChanges c) change) {
    final c = CharacterChanges(s, now: ++clock, createId: () => 'id${++_ids}');
    final r = change(c);
    s = c.snapshot;
    return r;
  }

  void put(String collection, JsonMap row) => s = s.putRow(collection, {'projectId': 'novel', ...row});
  JsonMap? row(String collection, String id) => s.rows(collection).where((r) => r['id'] == id).firstOrNull;
}

JsonMap _linked(String entryId, String text) => {
  'type': 'doc',
  'content': [
    {
      'type': 'paragraph',
      'content': [
        {
          'type': 'text',
          'text': text,
          'marks': [
            {
              'type': 'entityLink',
              'attrs': {'entryId': entryId},
            },
          ],
        },
      ],
    },
  ],
};

void main() {
  group('agrees with the original app’s record check', () {
    final golden = readGolden('integrity.golden.json');
    for (final name in fixtureNames) {
      test('on $name', () => expectJson(_report(loadFixture(name)), golden[name], name));
      test('on $name with records removed', () {
        expectJson(_report(_damaged(loadFixture(name))), golden['$name-damaged'], '$name-damaged');
      });
    }
    test('names compared for likeness, and references taken out', () {
      final names = golden['names']! as JsonMap;
      expectJson({for (final n in names.keys) n: normalizeName(n)}, names, 'names');
      expectJson(
        [
          withoutReference({
            'id': 'x',
            'nodeIds': ['a', 'b'],
            'characters': [
              {'id': 'b', 'age': 3},
              {'id': 'c'},
            ],
            'locationId': 'b',
            'value': 'a\nb\nc',
          }, 'b'),
          withoutReference({
            'fields': [
              {'id': 'f', 'key': 'Leader', 'value': 'b'},
            ],
            'beats': [
              {'id': 'bt', 'nodeId': 'b', 'note': 'keep'},
            ],
          }, 'b'),
          withoutReference([
            'b',
            {'id': 'b'},
            'c',
          ], 'b'),
        ],
        golden['without'],
        'without',
      );
    });
  });

  group('typed connections', () {
    test('join any two records by id, with kind, wording, notes and status; the author’s own kind kept as written', () {
      final w = Novel();
      final mira = w.act((c) => c.create(name: 'Mira')).id;
      final keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
      w.put('timelineEvents', {'id': 'siege', 'name': 'The siege'});
      final link = w.act(
        (c) => c.createConnection(
          from: EntityRef(EntityType.entry, mira),
          to: const EntityRef(EntityType.event, 'siege'),
          type: '  sworn against ',
          label: 'Vowed to end',
          notes: ' n ',
          canon: CanonStatus.provisional,
        ),
      );
      expect(
        [link.type, link.fromLabel, link.notes, link.canon, link.fromType, link.toType],
        ['sworn against', 'Vowed to end', 'n', CanonStatus.provisional, EntityType.entry, EntityType.event],
      );
      // From the other end, a kind of the author's own says nothing.
      final model = StoryModel.fromSnapshot(w.s);
      final seen = connectionsOf(deriveConnections(model).connections, const EntityRef(EntityType.event, 'siege'));
      expect([seen.single.label, seen.single.theirLabel], ['', 'Vowed to end']);
      // A known fact reads its plain converse.
      w.act(
        (c) => c.createConnection(
          from: EntityRef(EntityType.entry, mira),
          to: EntityRef(EntityType.entry, keep),
          type: 'member-of',
        ),
      );
      final keepSees = connectionsOf(
        deriveConnections(StoryModel.fromSnapshot(w.s)).connections,
        EntityRef(EntityType.entry, keep),
      );
      expect(keepSees.single.label, 'Has member');
      w.act((c) => c.updateConnection(link.id, canon: (value: CanonStatus.conflicting), label: 'Swore to end'));
      expect(
        [w.row('loreLinks', link.id)!['canon'], w.row('loreLinks', link.id)!['fromLabel']],
        ['conflicting', 'Swore to end'],
      );
      w.act((c) => c.removeConnection(link.id));
      expect(w.row('loreLinks', link.id), isNull);
      expect(w.row('timelineEvents', 'siege'), isNotNull, reason: 'the ends are not touched');
    });

    test('refuse missing and self-connected ends, and the same statement twice, saying which', () {
      final w = Novel();
      final mira = EntityRef(EntityType.entry, w.act((c) => c.create(name: 'Mira')).id);
      Matcher refused(String words) =>
          throwsA(isA<ChangeRefused>().having((e) => e.message, 'message', contains(words)));
      expect(() => w.act((c) => c.createConnection(from: mira, to: mira)), refused('itself'));
      expect(
        () => w.act((c) => c.createConnection(from: mira, to: const EntityRef(EntityType.node, 'nowhere'))),
        refused('The second end'),
      );
      w.put('chapters', {'id': 'one', 'kind': 'chapter', 'title': 'One'});
      const one = EntityRef(EntityType.node, 'one');
      w.act((c) => c.createConnection(from: mira, to: one, type: 'appears-in'));
      expect(
        () => w.act((c) => c.createConnection(from: mira, to: one, type: 'appears-in')),
        refused('already exists'),
      );
      w.act((c) => c.createConnection(from: mira, to: one, type: 'knows-about'));
      expect(w.s.rows('loreLinks'), hasLength(2), reason: 'a different kind is a different connection');
    });
  });

  group('fixes, only when chosen', () {
    test('a connection with a missing end goes whole; elsewhere only the reference goes', () {
      final w = Novel();
      w.put('loreLinks', {'id': 'l', 'fromId': 'gone', 'toId': 'x', 'fromLabel': '', 'toLabel': ''});
      w.put('timelineEvents', {
        'id': 'e',
        'name': 'Siege',
        'characters': [
          {'id': 'gone', 'age': null},
          {'id': 'kept', 'age': 4},
        ],
        'nodeIds': ['n1'],
        'updatedAt': 1,
      });
      w.s = removeReference(w.s, 'loreLinks', 'l', 'gone', now: 5);
      expect(w.row('loreLinks', 'l'), isNull);
      w.s = removeReference(w.s, 'timelineEvents', 'e', 'gone', now: 5);
      expect(w.row('timelineEvents', 'e')!['characters'], [
        {'id': 'kept', 'age': 4},
      ]);
      expect([w.row('timelineEvents', 'e')!['name'], w.row('timelineEvents', 'e')!['updatedAt']], ['Siege', 5]);
      expect(
        () => removeReference(w.s, 'chapters', 'n1', 'gone', now: 5),
        throwsA(isA<ChangeRefused>()),
        reason: 'text is changed in the editor, never from here',
      );
    });

    test('a field holding words is pointed at the entry the author chooses', () {
      final w = Novel();
      final guild = w.act((c) => c.createEntry('faction', 'Ash Guild')).id;
      w.put('loreEntries', {
        'id': 'keep',
        'category': 'location',
        'name': 'Keep',
        'fields': [
          {'id': 'f', 'key': 'Owner', 'value': 'Ash Guild\nsomeone', 'type': 'references'},
        ],
      });
      final found = unresolvedFields(StoryModel.fromSnapshot(w.s));
      expect(
        [
          for (final u in found) [u.value, ...u.suggestions.map((e) => e.id)],
        ],
        [
          ['Ash Guild', guild],
          ['someone'],
        ],
      );
      w.s = pointField(w.s, 'keep', 'f', 'Ash Guild', guild, now: 9);
      expect(maps(w.row('loreEntries', 'keep')!['fields']).single['value'], '$guild\nsomeone');
    });
  });

  group('merging, only when asked, keeping every reference', () {
    ({Novel w, String mira, String twin, String keep, String secret}) twins() {
      final w = Novel();
      final mira = w.act((c) => c.create(name: 'Mira')).id;
      final orrin = w.act((c) => c.create(name: 'Orrin')).id;
      final keep = w.act((c) => c.createEntry('location', 'The Keep')).id;
      final twin = w.act((c) => c.create(name: 'mira ')).id;
      w.act((c) => c.identity(twin, const IdentityChanges(aliases: ['The Wanderer'])));
      w.put('chapters', {
        'id': 'two',
        'kind': 'chapter',
        'title': 'Two',
        'mentions': [twin],
      });
      w.put('chapterContents', {'id': 'two', 'doc': _linked(twin, 'mira')});
      w.put('chapterPlans', {
        'id': 'two',
        'appearIds': [twin],
      });
      w.put('timelineEvents', {
        'id': 'siege',
        'name': 'Siege',
        'characters': [
          {'id': mira, 'age': null},
          {'id': twin, 'age': null},
        ],
      });
      w.put('plotThreads', {
        'id': 'quest',
        'title': 'Quest',
        'characterIds': [mira, twin],
      });
      w.act(
        (c) => c.createConnection(
          from: EntityRef(EntityType.entry, twin),
          to: EntityRef(EntityType.entry, keep),
          type: 'knows-about',
        ),
      );
      w.put('characterRelations', {'id': 'rel', 'fromId': mira, 'toId': twin, 'stages': <Object?>[]});
      final secret = w
          .act(
            (c) => c.saveSecret(orrin, null, {
              'title': 'The vault',
              'knows': [twin],
            }),
          )
          .id;
      return (w: w, mira: mira, twin: twin, keep: keep, secret: secret);
    }

    test('the plan says what would happen, before anything does', () {
      final t = twins();
      final before = t.w.s.toJson();
      final plan = mergePlan(t.w.s, t.mira, t.twin);
      expect(
        [for (final r in plan.repointed) r.table],
        containsAll([
          'chapterContents',
          'chapterPlans',
          'chapters',
          'characterRelations',
          'characterSecrets',
          'loreLinks',
          'plotThreads',
          'timelineEvents',
        ]),
      );
      expect(plan.dropped.join(' | '), contains('1 relationship between the two'));
      expect(plan.dropped.join(' | '), contains('the profile layout of “mira”'));
      expect(jsonEquals(t.w.s.toJson(), before), isTrue, reason: 'reading the plan changes nothing');
      expect(() => mergePlan(t.w.s, t.mira, t.keep), throwsA(isA<ChangeRefused>()));
    });

    test('merged: nothing points at the merged entry, nothing is left broken, nothing is doubled', () {
      final t = twins();
      final after = mergeEntries(t.w.s, t.mira, t.twin, now: 99);
      t.w.s = after;
      expect(after.toJson().toString().contains(t.twin), isFalse);
      expect(brokenReferences(StoryModel.fromSnapshot(after)), isEmpty);
      expect(t.w.row('chapterContents', 'two').toString(), contains(t.mira));
      expect(t.w.row('chapterContents', 'two').toString(), contains('text: mira'), reason: 'the words are not changed');
      expect(t.w.row('timelineEvents', 'siege')!['characters'], [
        {'id': t.mira, 'age': null},
      ]);
      expect(t.w.row('plotThreads', 'quest')!['characterIds'], [t.mira]);
      expect(t.w.row('characterSecrets', t.secret)!['knows'], [t.mira]);
      expect(after.rows('characterRelations'), isEmpty);
      expect([for (final l in after.rows('loreLinks')) l['type']], ['knows-about']);
      final profile = after.rows('characterProfiles').where((p) => p['entryId'] == t.mira).single;
      expect(strings(profile['aliases']), containsAll(['mira', 'The Wanderer']));
      expect(str(t.w.row('loreEntries', t.mira)!['notes']), contains('Merged “mira” into this entry.'));
      expect(t.w.row('loreEntries', t.twin), isNull);
    });
  });
}
