import '../json.dart';
import '../snapshot/novel_snapshot.dart';
import 'connections.dart';
import 'entity_ref.dart';
import 'story_model.dart';
import 'story_order.dart';

/// What deleting a record does to each thing that refers to it. Explicit, per kind, and the same as the original app:
///
/// | Deleted  | Cascade (removed with it)                                                     | Detach (reference cleared, record kept)                            | Left unresolved (reported)             |
/// |----------|-------------------------------------------------------------------------------|---------------------------------------------------------------------|-----------------------------------------|
/// | node     | its whole subtree; their text, plans, alternate drafts, versions; their links  | none                                                                | events, threads, plans, rules naming it |
/// | entry    | its links; its relationships (and their links); profile, secrets, notes,      | journeys (traveller, from, to, via); maps of the place; progress     | events, threads, plans, sheets, fields  |
/// |          | history, progress changes and map pins about it                                | changes that name it as the thing gained                            | naming it                               |
/// | event    | its links                                                                      | none                                                                | events that follow it or are dated from it (flagged) |
/// | thread   | its links                                                                      | events' thread lists; other threads' intersections                  | none                                    |
/// | relation | its links                                                                      | none                                                                | none                                    |
/// | ability  | its links (the item is removed from its blueprint)                            | none                                                                | sheets holding it; items branching from it |
///
/// Nothing is ever prevented, but nothing is silent either: a screen shows the [DeleteOutcome] and asks before it is
/// applied. Unresolved references stay as stored, are reported as broken links, and can be repaired or removed by the
/// author. Records on the other end of a link are never modified.
enum DeleteEffect { cascade, detach, unresolved }

class RowEffect {
  RowEffect(this.collection, this.id, this.effect, this.why);
  final String collection;
  final String id;
  final DeleteEffect effect;
  final String why;
}

class DeleteOutcome {
  DeleteOutcome(this.target, this.snapshot, this.effects, this.unresolved);

  final EntityRef target;

  /// The novel as it would be after the delete. Nothing is applied until the caller stores this.
  final NovelSnapshot snapshot;

  /// Every row removed or changed, and why.
  final List<RowEffect> effects;

  /// Connections that will point at nothing, newly so because of this delete.
  final List<DanglingConnection> unresolved;

  List<RowEffect> get removed => [
    for (final e in effects)
      if (e.effect == DeleteEffect.cascade) e,
  ];
  List<RowEffect> get detached => [
    for (final e in effects)
      if (e.effect == DeleteEffect.detach) e,
  ];
}

/// Works out what deleting [target] would do. Throws [StateError] when the record does not exist.
DeleteOutcome planDelete(NovelSnapshot before, EntityRef target) {
  final model = StoryModel.fromSnapshot(before);
  if (!model.exists(target)) throw StateError('No ${target.type.name} ${target.id} to delete.');
  final effects = <RowEffect>[];
  var s = before;

  void removeWhere(String collection, bool Function(JsonMap row) test, String why) {
    final rows = s.rows(collection);
    final kept = <JsonMap>[];
    for (final r in rows) {
      if (test(r)) {
        effects.add(RowEffect(collection, str(r['id']), DeleteEffect.cascade, why));
      } else {
        kept.add(r);
      }
    }
    if (kept.length != rows.length) s = s.withRows(collection, kept);
  }

  void updateWhere(
    String collection,
    JsonMap? Function(JsonMap row) change,
    String why, {
    DeleteEffect as = DeleteEffect.detach,
  }) {
    var changed = false;
    final rows = <JsonMap>[];
    for (final r in s.rows(collection)) {
      final next = change(r);
      if (next == null) {
        rows.add(r);
        continue;
      }
      changed = true;
      effects.add(RowEffect(collection, str(r['id']), as, why));
      rows.add(next);
    }
    if (changed) s = s.withRows(collection, rows);
  }

  void removeLinksOf(Set<String> ids, String why) =>
      removeWhere('loreLinks', (r) => ids.contains(r['fromId']) || ids.contains(r['toId']), why);

  switch (target.type) {
    case EntityType.node:
      final ids = subtreeIds(model.nodes.values, target.id).toSet();
      removeWhere('chapterContents', (r) => ids.contains(r['id']), 'text of a deleted chapter or scene');
      removeWhere('chapterPlans', (r) => ids.contains(r['id']), 'plan of a deleted chapter or scene');
      removeWhere('chapterBranches', (r) => ids.contains(r['nodeId']), 'alternate draft of a deleted chapter or scene');
      removeWhere('chapterRevisions', (r) => ids.contains(r['nodeId']), 'version of a deleted chapter or scene');
      removeLinksOf(ids, 'connection to a deleted chapter or scene');
      removeWhere('chapters', (r) => ids.contains(r['id']), 'the deleted node or a part of it');

    case EntityType.entry:
      final id = target.id;
      removeLinksOf({id}, 'connection to the deleted entry');
      final relationIds = {
        for (final r in s.rows('characterRelations'))
          if (r['fromId'] == id || r['toId'] == id) str(r['id']),
      };
      removeLinksOf(relationIds, 'connection to a relationship of the deleted entry');
      removeWhere('characterRelations', (r) => relationIds.contains(r['id']), 'relationship of the deleted entry');
      for (final c in [
        'characterProfiles',
        'characterSecrets',
        'characterNotes',
        'characterHistory',
        'progressChanges',
        'mapPins',
      ]) {
        removeWhere(c, (r) => r['entryId'] == id, 'kept about the deleted entry');
      }
      // A journey keeps what it says without whoever or wherever is gone.
      updateWhere('journeys', (j) {
        final travellers = strings(j['travellerIds']);
        final via = strings(j['via']);
        if (!travellers.contains(id) && j['fromId'] != id && j['toId'] != id && !via.contains(id)) return null;
        return {
          ...j,
          'travellerIds': [
            for (final t in listOf(j['travellerIds']))
              if (t != id) t,
          ],
          'fromId': j['fromId'] == id ? null : j['fromId'],
          'toId': j['toId'] == id ? null : j['toId'],
          'via': [
            for (final v in listOf(j['via']))
              if (v != id) v,
          ],
        };
      }, 'travelled with, from, to or through the deleted entry');
      // A map of a place that goes is kept, as a map of the whole world.
      updateWhere(
        'worldMaps',
        (m) => m['placeId'] == id ? {...m, 'placeId': null} : null,
        'was a map of the deleted place',
      );
      // A change that names it (a sword gained) keeps its words and stops linking to it.
      updateWhere('progressChanges', (c) => c['refId'] == id ? {...c, 'refId': null} : null, 'named the deleted entry');
      removeWhere('loreEntries', (r) => r['id'] == id, 'the deleted entry');

    case EntityType.event:
      removeLinksOf({target.id}, 'connection to the deleted event');
      removeWhere('timelineEvents', (r) => r['id'] == target.id, 'the deleted event');

    case EntityType.thread:
      final id = target.id;
      removeLinksOf({id}, 'connection to the deleted thread');
      updateWhere('timelineEvents', (e) {
        final threads = listOf(e['threadIds']);
        return threads.contains(id)
            ? {
                ...e,
                'threadIds': [
                  for (final t in threads)
                    if (t != id) t,
                ],
              }
            : null;
      }, 'belonged to the deleted thread');
      updateWhere('plotThreads', (t) {
        if (t['id'] == id) return null;
        final beats = maps(t['beats']);
        if (!beats.any((b) => listOf(b['withThreadIds']).contains(id))) return null;
        return {
          ...t,
          'beats': [
            for (final b in listOf(t['beats']))
              if (b is Map && listOf(b['withThreadIds']).contains(id))
                {
                  ...b.cast<String, Object?>(),
                  'withThreadIds': [
                    for (final w in listOf(b['withThreadIds']))
                      if (w != id) w,
                  ],
                }
              else
                b,
          ],
        };
      }, 'crossed the deleted thread');
      removeWhere('plotThreads', (r) => r['id'] == id, 'the deleted thread');

    case EntityType.relation:
      removeLinksOf({target.id}, 'connection to the deleted relationship');
      removeWhere('characterRelations', (r) => r['id'] == target.id, 'the deleted relationship');

    case EntityType.ability:
      final slash = target.id.indexOf('/');
      final systemId = target.id.substring(0, slash);
      final itemId = target.id.substring(slash + 1);
      removeWhere(
        'loreLinks',
        (r) =>
            (r['fromType'] == 'ability' && r['fromId'] == target.id) ||
            (r['toType'] == 'ability' && r['toId'] == target.id),
        'connection to the deleted ability',
      );
      updateWhere(
        'systems',
        (b) {
          if (b['id'] != systemId) return null;
          return {
            ...b,
            'items': [
              for (final i in listOf(b['items']))
                if (i is! Map || i['id'] != itemId) i,
            ],
          };
        },
        'the deleted ability (an item of this blueprint)',
        as: DeleteEffect.cascade,
      );
  }

  final danglingBefore = {for (final d in deriveConnections(model).dangling) d.connection.id};
  final after = deriveConnections(StoryModel.fromSnapshot(s)).dangling;
  return DeleteOutcome(target, s, effects, [
    for (final d in after)
      if (!danglingBefore.contains(d.connection.id)) d,
  ]);
}
