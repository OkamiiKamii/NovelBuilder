// The Flutter app's own outputs for the shared model (records, story model, connections, delete policy, codex
// changes, calendar, chronology, the two orders), which model.golden.json pins (outputs.ts makes Scriptor's, keyed the
// same way). To make the golden again:
//   1. A package config like flutter_app/.dart_tool/package_config.json, with `flutter` pointing at a stand-in package
//      whose lib/foundation.dart is `export 'package:meta/meta.dart' show immutable;` (the domain code needs no more
//      of Flutter) and `novel_builder` at flutter_app. Keep it outside both apps.
//   2. dart run --packages=<that config> dump.dart <out.json>   (the Dart SDK of flutter-3.38.9)
//   3. node make-golden.js <out.json> model.golden.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/codex/capabilities.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart';
import 'package:novel_builder/shared/domain/codex/field_values.dart';
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/connections.dart';
import 'package:novel_builder/shared/domain/model/delete_policy.dart';
import 'package:novel_builder/shared/domain/model/entity_ref.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart';
import 'package:novel_builder/shared/domain/model/validity.dart';
import 'package:novel_builder/shared/domain/records/branch.dart';
import 'package:novel_builder/shared/domain/records/calendar.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/entry.dart';
import 'package:novel_builder/shared/domain/records/event.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/records/saved_view.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/text/fold.dart';
import 'package:novel_builder/shared/domain/timeline/chronology.dart';
import 'package:novel_builder/shared/domain/timeline/dates.dart';
import 'package:novel_builder/shared/domain/timeline/narrative.dart';

final here = File.fromUri(Platform.script).parent.path;
final fixturesDir = '$here/../../../../flutter_app/test/fixtures';

Object? plain(Object? v) => switch (v) {
  double() when v.isNaN => 'NaN',
  double() when v.isInfinite => v > 0 ? 'Infinity' : '-Infinity',
  Map() => {for (final e in v.entries) '${e.key}': plain(e.value)},
  Iterable() => [for (final x in v) plain(x)],
  _ => v,
};

Object? span(Span? s) => s == null ? null : [s.lo, s.hi];
Object? bounds(EventBounds? b) => b == null ? null : [span(b.start), span(b.end), b.open];

const customCalendar = {
  'kind': 'custom',
  'name': 'The Reckoning',
  'months': [
    {'name': 'Thaw', 'days': 40},
    {'name': 'Bloom', 'days': 40},
    {'name': 'Swelter', 'days': 40},
    {'name': 'Harvest', 'days': 40},
    {'name': 'Fall', 'days': 40},
    {'name': 'Frost', 'days': 40},
    {'name': 'Deep', 'days': 40},
    {'name': 'Dark', 'days': 40},
    {'name': 'Wake', 'days': 40},
    {'name': 'Mud', 'days': 41},
  ],
  'hoursPerDay': 20,
  'daysPerWeek': 6,
  'eras': [
    {'name': 'Second Age', 'startYear': 1000},
    {'name': 'First Age', 'startYear': 0},
  ],
  'seasons': {'spring': 1, 'summer': 3, 'autumn': 6, 'winter': 1},
};

NovelSnapshot withCalendar(NovelSnapshot s) => s.withRows('storyCalendars', [
  {...customCalendar, 'id': 'cal', 'projectId': s.projectId, 'updatedAt': 0},
]);

Object calendarReport(Calendar c) => {
  'standard': c.standard,
  'name': c.name,
  'months': c.months,
  'monthStarts': c.monthStarts,
  'monthLengths': c.monthLengths,
  'minutesPerYear': c.minutesPerYear,
  'minutesPerDay': c.minutesPerDay,
  'hoursPerDay': c.hoursPerDay,
  'daysPerWeek': c.daysPerWeek,
  'eras': [
    for (final e in c.eras) [e.name, e.startYear],
  ],
  'seasons': [
    for (final e in c.seasons.entries) [e.key.name, span(e.value)],
  ],
  'units': [for (final u in TimeUnit.values) c.unitMinutes(u)],
  'daysIn': [for (var m = 0; m <= c.months.length + 1; m++) c.daysIn(m)],
  'monthName': [for (var m = 0; m <= c.months.length + 1; m++) c.monthName(m)],
  'yearName': [for (final y in [-5, 0, 1, 999, 1000, 1001, 5000]) c.yearName(y)],
  'describe': describeCalendar(c),
};

List<EntityRef> allRefs(StoryModel m) => [
  for (final id in m.nodes.keys) EntityRef(EntityType.node, id),
  for (final id in m.entries.keys) EntityRef(EntityType.entry, id),
  for (final id in m.events.keys) EntityRef(EntityType.event, id),
  for (final id in m.threads.keys) EntityRef(EntityType.thread, id),
  for (final id in m.relations.keys) EntityRef(EntityType.relation, id),
  for (final id in m.abilities.keys) EntityRef(EntityType.ability, id),
];

Object? date(EventDate? d) => d?.toJson();

Object modelReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  final novel = m.novel;
  final ctx = m.timeContext;
  return {
    'novel': [
      novel.id,
      novel.projectId,
      novel.title,
      novel.status.key,
      novel.targetWordCount,
      novel.accent,
      novel.language,
      novel.viewsOff,
      novel.secondaryGenres,
      novel.pinned,
      novel.lastOpenedAt,
    ],
    'reading': [for (final n in readingOrder(m.nodes.values)) n.id],
    'position': [
      for (final e in m.order.position.entries) [e.key, e.value],
    ],
    'chapterNumber': [
      for (final e in m.order.chapterNumber.entries) [e.key, e.value],
    ],
    'chapters': [for (final c in m.order.chapters) c.id],
    'nodes': [
      for (final n in m.nodes.values)
        [
          n.id,
          n.parentId,
          n.kindKey,
          n.kind?.name,
          n.title,
          n.displayTitle,
          n.order,
          n.status.key,
          n.mentions,
          n.wordCount,
          n.charCount,
          n.createdAt,
          n.summary,
          // A parent loop never ends subtreeIds, in Dart as in the port.
          n.id.startsWith('loop') ? 'cycle' : subtreeIds(m.nodes.values, n.id),
        ],
    ],
    'plans': [
      for (final p in m.plans.values)
        [
          p.id,
          p.nodeId,
          p.objective,
          [
            for (final b in p.beats) [b.id, b.text],
          ],
          p.entityIds,
          p.appearIds,
          p.mentionIds,
          p.povIds,
          p.labels,
        ],
    ],
    'categories': [
      for (final c in m.categories.values)
        [
          c.key,
          c.name,
          c.singular,
          c.color,
          c.builtin,
          c.order,
          c.archived,
          [
            for (final f in c.fields)
              [f.id, f.name, f.type?.name, f.options, f.archived, f.required, f.help, f.min, f.max, f.target],
          ],
          c.uses,
        ],
    ],
    'entries': [
      for (final e in m.entries.values)
        [
          e.id,
          e.category,
          e.name,
          e.summary,
          e.image,
          e.notes,
          e.tags,
          [
            for (final f in e.fields) [f.id, f.key, f.value, f.type?.name, f.options, f.defId],
          ],
          e.placeLevel,
          e.createdAt,
          e.updatedAt,
        ],
    ],
    'links': [
      for (final l in m.links)
        () {
          final w = wordingOf(l);
          return [
            l.id,
            l.fromType.name,
            l.fromId,
            l.toType.name,
            l.toId,
            l.from.key,
            l.to.key,
            l.type,
            l.fromLabel,
            l.toLabel,
            l.notes,
            l.canon?.key,
            l.how,
            l.endHow,
            l.isEntryLink,
            [w.forward, w.backward, w.reciprocal],
            l.validity?.from?.raw,
            l.validity?.until?.raw,
            anchorIds(l.validity),
          ];
        }(),
    ],
    'relations': [
      for (final r in m.relations.values)
        [
          r.id,
          r.fromId,
          r.toId,
          [
            for (final st in r.stages)
              [
                st.id,
                st.startNodeId,
                st.startUnknown,
                st.preset,
                st.category,
                st.label,
                st.fromRole,
                st.toRole,
                st.directional,
                st.title,
                st.affinity,
                st.event,
                st.attributes,
                [st.attribute('trust').from, st.attribute('trust').to, st.attribute('fear').from],
                st.storyAt,
                st.causeEventId,
              ],
          ],
          [for (final st in sortedStages(r, m.order)) st.id],
          stageAt(r, null, m.order)?.id,
          [for (final id in m.nodes.keys.take(40)) stageAt(r, id, m.order)?.id],
          stageAt(r, 'not-a-node', m.order)?.id,
        ],
    ],
    'events': [
      for (final e in m.events.values)
        [
          e.id,
          e.name,
          date(e.when),
          date(e.end),
          e.duration?.toJson(),
          e.importance.name,
          e.importanceKey,
          e.locationId,
          [
            for (final c in e.characters) [c.id, c.age],
          ],
          e.entryIds,
          e.nodeIds,
          e.afterId,
          e.ongoing,
          e.threadIds,
          e.labels,
          e.statusKey,
          e.canon?.key,
          e.canonKey,
          [
            for (final r in e.reveals.entries) [r.key, r.value.name, r.value.label],
          ],
          span(spanOfEvent(e.id, ctx)),
          bounds(boundsOfEvent(e.id, ctx)),
          span(spanOfDate(e.when, ctx)),
          e.when == null ? null : m.calendar.dateProblem(e.when!),
          e.when == null ? null : span(m.calendar.spanOf(e.when!)),
          formatDate(e.when, (id) => m.events[id]?.name, m.calendar),
          formatDuration(e.duration),
          m.calendar.durationMinutes(e.duration),
        ],
    ],
    'threads': [
      for (final t in m.threads.values)
        [
          t.id,
          t.title,
          t.premise,
          t.category,
          t.statusKey,
          t.status.name,
          t.customStatus,
          t.characterIds,
          t.locationIds,
          t.targetNodeId,
          [
            for (final b in t.beats) [b.id, b.role.name, b.withThreadIds, b.nodeId, b.title, b.note],
          ],
        ],
    ],
    'systems': [
      for (final sys in m.systems.values)
        [
          sys.id,
          sys.name,
          sys.description,
          [
            for (final g in sys.groups) [g.id, g.name],
          ],
          [
            for (final g in sys.groupList) [g.id, g.name, g.single],
          ],
          [
            for (final r in sys.ranks) [r.id, r.name],
          ],
          [
            for (final i in sys.items)
              [
                i.id,
                i.groupId,
                i.name,
                i.parentId,
                i.rankId,
                sys.rankName(i),
                i.requires,
                [
                  for (final x in i.modifiers) [x.id, x.target, x.op, x.value],
                ],
                [
                  for (final x in i.costs) [x.id, x.target, x.amount],
                ],
                i.cooldown,
                i.affinity,
                i.evolution,
              ],
          ],
          [
            for (final v in sys.variables)
              [v.id, v.name, v.key, v.kind, v.unit, v.base, v.formula, v.options, v.note, toFormulaKey(v.name)],
          ],
          [
            for (final t in sys.tracks)
              [
                t.id,
                t.name,
                t.key,
                t.kind,
                t.cap,
                t.curve,
                t.curveUnit,
                t.points,
                t.sources,
                [
                  for (final st in t.stages) [st.id, st.name, st.requires, st.note, st.grants],
                ],
              ],
          ],
          [
            for (final x in sys.matrices)
              [
                x.id,
                x.name,
                [
                  for (final r in x.rows) [r.id, r.name],
                ],
                [
                  for (final c in x.columns) [c.id, c.name],
                ],
                [
                  for (final c in x.cells.entries) [c.key, c.value],
                ],
              ],
          ],
          sys.createdAt,
        ],
    ],
    'abilities': [
      for (final e in m.abilities.entries) [e.key, e.value.system.id, e.value.item.id, e.value.group],
    ],
    'sheets': [
      for (final sh in m.sheets)
        [
          sh.id,
          sh.systemId,
          sh.entryId,
          sh.itemIds,
          [
            for (final e in sh.values.entries) [e.key, e.value],
          ],
          [
            for (final e in sh.progress.entries) [e.key, e.value],
          ],
          [
            for (final e in sh.spent.entries) [e.key, e.value],
          ],
          [
            for (final x in sh.xp) [x.id, x.trackId, x.amount, x.source, x.nodeId, x.note],
          ],
          sh.note,
        ],
    ],
    'calendar': calendarReport(m.calendar),
    'progressCategories': [
      for (final c in m.progressCategories.values) [c.id, c.name, c.shape, c.ladder, c.characterIds, c.order, c.archived],
    ],
    'progress': [
      for (final c in m.progress)
        [
          c.id,
          c.entryId,
          c.categoryId,
          c.action,
          c.subject,
          c.value,
          c.refId,
          c.abilityId,
          c.at?.raw,
          c.createdAt,
          c.cost,
          changeWords(c, m.progressCategories[c.categoryId], m),
        ],
    ],
    'journeys': [
      for (final j in m.journeys)
        [
          j.id,
          j.travellerIds,
          j.fromId,
          j.toId,
          j.via,
          j.departure?.raw,
          j.arrival?.raw,
          j.afterId,
          j.eventIds,
          j.method,
          j.methodId,
          j.duration?.toJson(),
          j.distance,
          j.distanceUnit,
          j.note,
          j.createdAt,
        ],
    ],
    'resolve': [
      for (final r in [
        ...allRefs(m),
        const EntityRef(EntityType.entry, 'not-there'),
        const EntityRef(EntityType.ability, 'no/such'),
      ])
        () {
          final v = m.resolve(r);
          return [r.key, v?.label, v?.kind, m.exists(r)];
        }(),
    ],
    'canon': [
      for (final r in s.rows('canonFacts'))
        () {
          final f = CanonFact(r);
          return [
            f.id,
            f.subject,
            f.statement,
            f.kind,
            f.status.key,
            f.status.label,
            f.entryIds,
            f.conflictsWith,
            f.replacedById,
            f.history.length,
            f.sources.length,
          ];
        }(),
    ],
    'review': [
      for (final r in s.rows('continuityResolutions'))
        () {
          final x = ReviewItem(r);
          return [x.id, x.key, x.decision.name, x.decision.label, x.decision.closes, x.note, x.message, x.nodeId];
        }(),
    ],
    'savedViews': [
      for (final r in s.rows('savedViews'))
        () {
          final v = SavedView(r);
          return [v.id, v.view, v.name, v.filter, v.mode, v.layers, v.scale, v.layout];
        }(),
    ],
  };
}

Object validityReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  final ctx = m.timeContext;
  final probes = <Anchor>[
    for (final id in m.order.position.keys.take(30)) Anchor.node(id),
    for (final id in m.events.keys.take(30)) Anchor.event(id),
    Anchor.date({'precision': 'approximate', 'year': 0, 'month': null, 'season': null}),
    Anchor.date({'precision': 'exact', 'year': 10, 'month': 4, 'day': 2, 'hour': null, 'minute': null}),
    Anchor.date({'precision': 'approximate', 'year': 1000, 'month': null, 'season': 'winter'}),
    Anchor.date({'precision': 'unknown'}),
    Anchor.node('not-a-node'),
  ];
  final validities = <Validity>[
    for (final l in m.links)
      if (l.validity != null) l.validity!,
    for (final c in m.progress) Validity(c.at, null),
    for (final j in m.journeys) Validity(j.departure, j.arrival),
    Validity.always,
  ];
  return {
    'validAt': [
      for (final v in validities) [for (final p in probes) validAt(v, p, ctx).toJson()],
    ],
    'overlaps': [
      for (final a in validities.take(25)) [for (final b in validities.take(25)) overlaps(a, b, ctx).toJson()],
    ],
    'history': [
      for (final i in historyOf(List.generate(validities.length, (i) => i), (i) => validities[i], ctx)) i,
    ],
    'statesAt': [
      for (final p in probes.take(10))
        [
          for (final (i, t) in statesAt(List.generate(validities.length, (i) => i), (i) => validities[i], p, ctx))
            [i, t.toJson()],
        ],
    ],
  };
}

Object connectionsReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  final result = deriveConnections(m);
  return {
    'connections': [for (final c in result.connections) c.toJson()],
    'dangling': [
      for (final d in result.dangling) [d.connection.toJson(), for (final r in d.missing) r.key],
    ],
    'seen': [
      for (final id in m.entries.keys)
        [
          for (final x in connectionsOf(result.connections, EntityRef(EntityType.entry, id)))
            [x.connection.id, x.other.key, x.label, x.theirLabel, x.outgoing],
        ],
    ],
  };
}

List<Object?> writesBetween(NovelSnapshot before, NovelSnapshot after) {
  final out = <Object?>[];
  for (final name in {...before.collections.keys, ...after.collections.keys}) {
    final old = {for (final r in before.rows(name)) str(r['id']): r};
    final next = {for (final r in after.rows(name)) str(r['id']): r};
    for (final e in old.entries) {
      if (!next.containsKey(e.key)) out.add([name, e.key, null, e.value]);
    }
    for (final e in next.entries) {
      final was = old[e.key];
      if (was != null && jsonEquals(was, e.value)) continue;
      out.add([name, e.key, e.value, was]);
    }
  }
  return out;
}

Object deleteReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  return {
    for (final ref in [...allRefs(m), const EntityRef(EntityType.thread, 'ghost')].where((r) => !r.id.startsWith('loop')))
      ref.key: () {
        try {
          final o = planDelete(s, ref);
          return {
            'effects': [
              for (final e in o.effects) [e.collection, e.id, e.effect.name, e.why],
            ],
            'removed': o.removed.length,
            'detached': o.detached.length,
            'unresolved': [
              for (final d in o.unresolved) [d.connection.id, for (final r in d.missing) r.key],
            ],
            'writes': writesBetween(s, o.snapshot),
          };
        } on StateError catch (e) {
          return {'error': e.message};
        }
      }(),
  };
}

Object codexReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  final names = {for (final e in m.entries.values) e.id: e.name};
  final categories = categoriesOf(s);
  final entries = m.entries;
  return {
    'categories': [
      for (final c in categories.values)
        [
          c.key,
          [for (final v in readyViews(c)) v.name],
          [
            for (final v in [...KindView.values, 'graphLabel', 'graphLinks', 'other']) missingFor(c, v),
          ],
          [
            for (final slot in Slot.values) [for (final f in fieldsFor(c, slot)) f.id],
          ],
          [fieldOf(c, Slot.rank, c.uses['rank'])?.id, fieldOf(c, Slot.mapX, mapOrNull(c.uses['map'])?['x'])?.id],
          CodexChanges.kindTemplate(c),
        ],
    ],
    'typeWords': [for (final slot in Slot.values) typeWords(slot)],
    'entries': [
      for (final e in entries.values)
        () {
          final cat = m.categoryOf(e.category);
          final view = viewFields(e, cat);
          return [
            e.id,
            [
              for (final (d, f) in view.category) [d.id, f?.id],
            ],
            [for (final f in view.own) f.id],
            [
              for (final (d, f) in view.archived) [d.id, f.id],
            ],
            [
              for (final i in entryIssues(e, cat, entries, categoryName: (k) => m.categoryOf(k).name))
                [i.defId, i.field, i.problem.key, i.message],
            ],
            [
              for (final f in e.fields)
                displayValue(
                  cat.fields.where((d) => d.id == f.defId).firstOrNull?.type ?? f.type,
                  f.value,
                  (id) => names[id],
                ),
            ],
            [
              for (final r in relatedTo(e.id, entries.values, m.links)) [r.linkId, r.entry.id, r.label, r.theirLabel],
            ],
            [
              for (final q in ['a', 'the', '  ', 'É', 'mira', 'zzz', e.name.length > 2 ? e.name.substring(1, 3) : 'x'])
                matchesEntry(e, q),
            ],
            foldText(e.name),
            foldText(e.description),
            nfkdWords('${e.name} ${e.summary}'),
            toFormulaKey(e.name),
          ];
        }(),
    ],
  };
}

String lastLink(CodexChanges c) => c.rows('loreLinks').isEmpty ? 'none' : str(c.rows('loreLinks').last['id']);

/// A run of codex changes on a novel, each recorded as its result or the reason it was refused.
Object changesReport(NovelSnapshot start, List<JsonMap> template) {
  var s = start;
  var clock = 5000;
  var ids = 0;
  final results = <Object?>[];
  void act(String what, Object? Function(CodexChanges c) change) {
    final c = CodexChanges(s, now: ++clock, createId: () => 'n${++ids}');
    try {
      final r = change(c);
      s = c.snapshot;
      results.add([what, plain(r)]);
    } on ChangeRefused catch (e) {
      results.add([what, 'refused', e.message, '$e']);
    }
  }

  final entryIds = [for (final r in start.rows('loreEntries')) str(r['id'])];
  final nodeIds = [for (final r in start.rows('chapters')) str(r['id'])];
  final eventIds = [for (final r in start.rows('timelineEvents')) str(r['id'])];
  final first = entryIds.isEmpty ? 'none' : entryIds.first;
  final second = entryIds.length < 2 ? 'none' : entryIds[1];
  act('categories', (c) => [for (final x in c.categories()) x.key]);
  act(
    'new kind',
    (c) => c
        .saveCategory(
          null,
          (_) => {
            'name': ' Spells ',
            'fields': [
              {'id': 'a', 'name': 'Rank', 'type': 'number', 'min': '0', 'max': 10, 'required': true, 'help': ' How '},
              {'name': '  ', 'type': 'select', 'options': [' x ', 'x', '', 5, 'y' * 70]},
              {'id': 'c', 'name': 'Known by', 'type': 'references', 'target': 'character', 'future': 1},
              {'id': 'd', 'name': 'Ghost', 'type': 'reference', 'target': 'nowhere'},
              {'id': 'e', 'name': 'Back', 'type': 'number', 'min': 5, 'max': '1'},
              'junk',
            ],
            'uses': {
              'rank': 'a',
              'graphLinks': ['c', 'zz'],
              'tree': true,
            },
            'graph': false,
          },
        )
        .raw,
  );
  act('clash', (c) => c.saveCategory(null, (_) => {'name': 'spells'}).raw);
  act('blank', (c) => c.saveCategory(null, (_) => {'name': ' '}).raw);
  act('unknown', (c) => c.saveCategory('nope', (_) => {'name': 'X'}).raw);
  act('builtin change', (c) => c.saveCategory('location', (cur) => {'name': 'Places', 'archived': true, 'order': 0.5}).raw);
  act(
    'fields kept',
    (c) => c
        .saveCategory(
          'location',
          (cur) => {
            'fields': [
              for (final f in cur!.fields.skip(1)) {...f.raw, 'name': '${f.name}!'},
            ],
          },
        )
        .raw,
  );
  for (final key in ['character', 'location', 'custom-none']) {
    act('create $key', (c) => c.createEntry(key, key == 'location' ? '  Keep  ' : null).raw);
  }
  act('create with id', (c) => c.createEntry('item', 'Blade', 'fixed-id').raw);
  act('update', () {
    return (CodexChanges c) {
      c.updateEntry(
        first,
        name: '  ',
        summary: 'S',
        tags: [' a ', 'a', '', 'b'],
        image: (value: 'javascript:x'),
        category: 'nope',
        notes: 'N',
      );
      return c.owned(first).raw;
    };
  }());
  act('update image', (c) {
    c.updateEntry(second, image: (value: 'https://example.com/x.png'), category: 'location');
    return c.owned(second).raw;
  });
  act('field values', (c) {
    final e = c.owned(first);
    for (final def in c.category(e.category).fields) {
      c.setFieldValue(first, def.id, 'v-${def.name}');
    }
    c.setFieldValue(first, c.category(e.category).fields.isEmpty ? 'x' : c.category(e.category).fields.first.id, 'again');
    return c.owned(first).raw;
  });
  act('bad field', (c) {
    c.setFieldValue(first, 'no-such-field', 'x');
    return null;
  });
  act('own fields', (c) {
    c.setOwnFields(first, [
      {'id': 'o1', 'key': ' Motto ', 'value': 'Hold', 'defId': 'x'},
      {
        'key': 'Rank',
        'value': 'S',
        'options': ['A', 'S', 'S', ' '],
      },
      {'id': '', 'key': '', 'value': ' '},
      {'id': 'o4', 'key': 5, 'value': 'five', 'options': []},
    ]);
    return c.owned(first).raw;
  });
  act('link', (c) => c.linkEntries(first, second, ' Ally ').raw);
  act('link again', (c) => c.linkEntries(second, first).raw);
  act('link self', (c) => c.linkEntries(first, first).raw);
  act('label', (c) {
    final id = lastLink(c);
    c.labelLink(id, second, ' Friend ');
    c.setLinkCanon(id, CanonStatus.nonCanon);
    return c.row('loreLinks', id);
  });
  act('label stranger', (c) {
    c.labelLink(lastLink(c), 'stranger', 'x');
    return null;
  });
  if (nodeIds.isNotEmpty) {
    act(
      'connect',
      (c) => c
          .createConnection(
            from: EntityRef(EntityType.entry, first),
            to: EntityRef(EntityType.node, nodeIds.first),
            type: '  appears-in ',
            label: ' Seen ',
            notes: ' n ',
            canon: CanonStatus.canon,
            startsAt: {'kind': 'node', 'nodeId': nodeIds.first},
            how: 'h' * 100,
          )
          .raw,
    );
    act(
      'connect twin',
      (c) => c
          .createConnection(
            from: EntityRef(EntityType.entry, first),
            to: EntityRef(EntityType.node, nodeIds.first),
            type: 'appears-in',
            startsAt: {'kind': 'node', 'nodeId': nodeIds.first},
          )
          .raw,
    );
    act(
      'connect plain',
      (c) => c
          .createConnection(
            from: EntityRef(EntityType.entry, first),
            to: EntityRef(EntityType.node, nodeIds.first),
            type: 'appears-in',
          )
          .raw,
    );
  }
  act(
    'connect self',
    (c) => c.createConnection(from: EntityRef(EntityType.entry, first), to: EntityRef(EntityType.entry, first)).raw,
  );
  act(
    'connect missing',
    (c) => c.createConnection(from: EntityRef(EntityType.entry, first), to: const EntityRef(EntityType.event, 'zz')).raw,
  );
  act(
    'connect blank',
    (c) => c.createConnection(from: const EntityRef(EntityType.entry, ' '), to: EntityRef(EntityType.entry, first)).raw,
  );
  act(
    'connect bad point',
    (c) => c
        .createConnection(
          from: EntityRef(EntityType.entry, first),
          to: EntityRef(EntityType.entry, second),
          startsAt: {
            'kind': 'date',
            'when': {'precision': 'relative', 'anchorId': 'nowhere'},
          },
        )
        .raw,
  );
  if (eventIds.isNotEmpty) {
    act(
      'connect dated',
      (c) => c
          .createConnection(
            from: EntityRef(EntityType.entry, second),
            to: EntityRef(EntityType.event, eventIds.first),
            type: 'my own words',
            startsAt: {
              'kind': 'date',
              'when': {'precision': 'relative', 'anchorId': eventIds.first, 'amount': 1, 'unit': 'days'},
            },
          )
          .raw,
    );
  }
  final abilities = StoryModel.fromSnapshot(start).abilities.keys.toList();
  if (abilities.length >= 2) {
    act(
      'connect abilities',
      (c) => c
          .createConnection(
            from: EntityRef(EntityType.ability, abilities[0]),
            to: EntityRef(EntityType.ability, abilities[1]),
            type: 'upgrades-to',
          )
          .raw,
    );
  }
  act(
    'connect bad ability',
    (c) => c
        .createConnection(from: EntityRef(EntityType.entry, first), to: const EntityRef(EntityType.ability, 'noslash'))
        .raw,
  );
  act('update connection', (c) {
    final id = lastLink(c);
    return c
        .updateConnection(
          id,
          type: ' ',
          label: ' L ',
          reverseLabel: ' R ',
          notes: ' N ',
          canon: (value: null),
          how: ' ',
          endHow: 'lost',
        )
        .raw;
  });
  act('update connection 2', (c) {
    final id = lastLink(c);
    return c.updateConnection(id, canon: (value: CanonStatus.retconned), how: 'won').raw;
  });
  act('remove connection', (c) {
    c.removeConnection(c.rows('loreLinks').isEmpty ? 'none' : str(c.rows('loreLinks').first['id']));
    return [for (final r in c.rows('loreLinks')) r['id']];
  });
  act('unlink missing', (c) {
    c.unlink('nope');
    return null;
  });
  act('add kinds', (c) => [for (final k in c.addKinds(template)) k.raw]);
  act('add kinds again', (c) => [for (final k in c.addKinds(template)) k.raw]);
  act(
    'add linked kinds',
    (c) => [
      for (final k in c.addKinds([
        {
          'key': 'cells',
          'name': 'Cells',
          'fields': [
            {'id': 'm', 'name': 'Members', 'type': 'references', 'target': 'agents', 'required': true},
            {'id': 'l', 'name': 'Leader', 'type': 'reference', 'target': 'character'},
          ],
          'uses': {
            'graphLinks': ['m', 'l', 'zz'],
            'rank': 'm',
          },
        },
        {'key': 'agents', 'name': 'Agents', 'fields': <Object?>[]},
        {'key': 'agents', 'name': ' ', 'fields': <Object?>[]},
        {
          'key': 'location',
          'builtin': true,
          'name': 'whatever',
          'fields': [
            {'name': 'type', 'type': 'text'},
            {'name': 'Climate', 'type': 'select', 'options': ['Hot']},
          ],
          'uses': {
            'map': {'x': 'zz'},
          },
        },
      ]))
        k.raw,
    ],
  );
  act('schema', (c) => c.schemaSnapshot());
  act('archived kind', (c) {
    final k = c.saveCategory(null, (_) => {'name': 'Starships', 'archived': true, 'color': ''});
    return c.createEntry(k.key).raw;
  });
  return {'results': results, 'writes': writesBetween(start, s)};
}

Object timelineReport(NovelSnapshot s) {
  final m = StoryModel.fromSnapshot(s);
  final cal = m.calendar;
  final orders = twoOrders(m);
  Object telling(StoryTelling t) => [t.eventId, t.nodeId, t.role.name, t.storyRank, t.readingRank, t.back, t.ahead];
  return {
    'chronology': [
      for (final p in resolveChronology(m.events.values, cal))
        [p.event.id, p.value, p.year, p.anchored, p.label, p.issues],
    ],
    'orders': {
      'events': [
        for (final e in orders.events) [e.id, e.title, e.when, e.storyRank, for (final t in e.tellings) telling(t)],
      ],
      'nodes': [
        for (final n in orders.nodes) [n.id, n.label, n.readingRank, for (final t in n.tellings) '${t.eventId}@${t.nodeId}'],
      ],
      'tellings': [for (final t in orders.tellings) telling(t)],
      'words': [for (final t in orders.tellings) [orderWords(t), tellingWords(t, m)]],
      'placed': orders.placed,
      'linear': orders.linear,
    },
    'notes': [
      for (final n in tellingNotes(orders, m)) ['${n.telling.eventId}@${n.telling.nodeId}', n.note],
    ],
    'summary': orderSummary(orders),
    'labels': [for (final id in m.nodes.keys) nodeLabel(m, id)],
    'calendar': calendarReport(cal),
  };
}

Object miscReport() {
  final cals = [Calendar.standardCalendar, Calendar.fromJson(customCalendar)];
  final samples = <Object?>[
    {'precision': 'exact', 'year': 10, 'month': 2, 'day': 31, 'hour': 25, 'minute': 70},
    {'precision': 'exact', 'year': '12', 'month': '13', 'day': 3},
    {'precision': 'exact', 'year': 2.5, 'month': 2.5, 'day': 1.5, 'hour': 0.5},
    {'precision': 'exact', 'year': -2.5, 'month': 1, 'day': 40, 'hour': 19, 'minute': null},
    {'precision': 'exact', 'year': ' 0x1F ', 'month': 1, 'day': 1, 'hour': 12, 'minute': 5},
    {'precision': 'exact', 'year': 9999999.4, 'month': 10, 'day': 41, 'hour': 0, 'minute': 0},
    {'precision': 'exact', 'year': 10000000},
    {'precision': 'approximate', 'year': 7, 'month': 0, 'season': 'winter'},
    {'precision': 'approximate', 'year': 7, 'month': 3, 'season': 'winter'},
    {'precision': 'approximate', 'year': -0.5},
    {'precision': 'approximate', 'year': null},
    {'precision': 'relative', 'anchorId': '', 'amount': -3, 'unit': 'fortnights', 'direction': 'sideways'},
    {'precision': 'relative', 'anchorId': 'x', 'amount': '2.5', 'unit': 'weeks', 'direction': 'after'},
    {'precision': 'relative', 'anchorId': 'x', 'amount': 'Infinity', 'unit': 'days'},
    {'precision': 'nonsense'},
    null,
    'text',
  ];
  final formatted = <Object?>[
    {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 0, 'minute': 5},
    {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 13, 'minute': null},
    {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': 12, 'minute': 0},
    {'precision': 'exact', 'year': 1020, 'month': 5, 'day': 4, 'hour': -1, 'minute': -5},
    {'precision': 'exact', 'year': 1020.5, 'month': 0, 'day': 4, 'hour': 3},
    {'precision': 'exact', 'year': 1500, 'month': 14, 'day': 0, 'hour': 3},
    {'precision': 'approximate', 'year': 1001, 'month': 2, 'season': null},
    {'precision': 'approximate', 'year': 1001.25, 'month': null, 'season': 'autumn'},
    {'precision': 'approximate', 'year': -3, 'month': null, 'season': null},
    {'precision': 'relative', 'anchorId': 'a', 'amount': 1.5, 'unit': 'years', 'direction': 'before'},
    {'precision': 'relative', 'anchorId': 'gone', 'amount': 1, 'unit': 'days', 'direction': 'after'},
    {'precision': 'relative', 'anchorId': null, 'amount': 1234567.891, 'unit': 'minutes', 'direction': 'after'},
    {'precision': 'unknown'},
    null,
  ];
  final calendarInputs = <JsonMap>[
    customCalendar,
    {...customCalendar, 'kind': 'standard'},
    {
      ...customCalendar,
      'name': ' ',
      'months': [
        {'name': 'A', 'days': 0},
        {'name': 'a', 'days': 1.5},
        'x',
        {'name': '  ', 'days': 2000},
      ],
      'hoursPerDay': 0,
      'daysPerWeek': 200,
      'eras': [
        {'name': '', 'startYear': 5},
        {'name': 'B', 'startYear': 5},
        {'name': 'C', 'startYear': 'x'},
        7,
      ],
      'seasons': {'spring': 0, 'summer': 3, 'autumn': 1, 'winter': 1},
    },
    {'kind': 'standard', 'name': 'x', 'months': [], 'hoursPerDay': 0, 'daysPerWeek': 0, 'eras': [], 'seasons': {}},
    {
      'kind': 'custom',
      'name': 'One',
      'months': [
        {'name': 'Only', 'days': 1},
      ],
      'hoursPerDay': 1,
      'daysPerWeek': 1,
      'eras': [],
      'seasons': {'spring': 1, 'summer': 1, 'autumn': 1, 'winter': 1},
    },
    {'kind': 'custom'},
  ];
  final numbers = [
    0, 1, -1, 0.5, -0.5, 0.0005, -0.0005, 0.0004, 1234, 12345.6789, -9876543.21, 1e15, 0.1 + 0.2, 2.675, 1.0005, //
    999.9995, 1e-7, 1 / 3, 2 / 3, 100, 1000000, 400, 410.5,
  ];
  final numberTexts = [
    '', '0', '42', ' 1e3 ', '0xFF', '0XfF', '0o17', '0b101', '0b2', '0x', '1.', '.5', '-.5', '+3', '1e', 'Infinity', //
    '-Infinity', 'NaN', '1_000', '0x10000000000000000', '0x7FFFFFFFFFFFFFFF', '9223372036854775807', '1,000', '٣',
  ];
  final defs = [
    FieldDef({'id': 'd', 'name': 'Power', 'type': 'number', 'options': <String>[], 'min': 1, 'max': 10.5}),
    FieldDef({'id': 'd', 'name': 'Power', 'type': 'number', 'options': <String>[], 'min': -1e21}),
    FieldDef({'id': 'd', 'name': 'When', 'type': 'date', 'options': <String>[], 'required': true}),
    FieldDef({
      'id': 'd',
      'name': 'Kind',
      'type': 'select',
      'options': ['Low', 'High'],
    }),
    FieldDef({
      'id': 'd',
      'name': 'Kinds',
      'type': 'multiselect',
      'options': ['Fire', 'Ash'],
    }),
    FieldDef({'id': 'd', 'name': 'On', 'type': 'toggle', 'options': <String>[]}),
    FieldDef({'id': 'd', 'name': 'Who', 'type': 'reference', 'options': <String>[], 'target': 'character'}),
    FieldDef({'id': 'd', 'name': 'Whom', 'type': 'references', 'options': <String>[]}),
    FieldDef({'id': 'd', 'name': 'Odd', 'type': 'hologram', 'options': <String>[], 'required': true}),
  ];
  final values = [
    '', ' ', '5', '0.5', '11', '1e400', '-1e22', '0x0A', 'many', '2024-02-29', '2023-02-29', '0000-02-29', '1900-02-29', //
    '2000-13-01', '2024-04-31', 'yes', 'Yes', 'Low', 'Mid', 'Fire\nSmoke\n\nDust', 'mira', 'keep', 'mira\nkeep\ngone',
  ];
  final entries = {
    'mira': Entry({'id': 'mira', 'category': 'character', 'name': 'Mira'}),
    'keep': Entry({'id': 'keep', 'category': 'location', 'name': 'The Keep'}),
  };
  final texts = [
    'Émile Ångström',
    'İstanbul ΣΑΣ Straße',
    'Йорк Øster Łódź',
    'é',
    'ﬁre ﬂy Ǆ ǅ',
    'Ŧhe Ωmega ᾼ ᾨ',
    'がぎ パ',
    '한국어',
    '  Max   Health!! ',
    '___',
    '',
    'Café-au-lait 2nd',
  ];
  final sortable = ['zed', 'Émile', 'bran', 'Anna', 'emile', 'Bran', '10 Kings', '#tag', 'ébène', 'Ébène', 'Zoë', 'zoe'];
  return {
    'normalized': [
      for (final c in cals) [for (final x in samples) normalizeDate(x, c)],
    ],
    'formatted': [
      for (final c in cals)
        [
          for (final d in [...formatted, ...samples]) formatDate(EventDate.fromJson(d), (id) => id == 'a' ? 'the Siege' : null, c),
        ],
    ],
    'spans': [
      for (final c in cals)
        [
          for (final d in [...formatted, ...samples])
            () {
              final when = EventDate.fromJson(d);
              return when == null ? 'unread' : [span(c.spanOf(when)), c.dateProblem(when)];
            }(),
        ],
    ],
    'calendars': [
      for (final i in calendarInputs)
        {
          'problems': calendarProblems(i),
          'cleaned': () {
            try {
              return cleanCalendar(i);
            } on ChangeRefused catch (e) {
              return 'refused: ${e.message}';
            }
          }(),
          'settings': calendarSettingsOf(i),
          'calendar': calendarReport(Calendar.fromJson(i)),
        },
    ],
    'defaults': [startingCalendar(), defaultCalendarSettings(), calendarSettingsOf(null)],
    'localeNumber': [for (final n in numbers) localeNumber(n)],
    'jsNum': [for (final n in numbers) jsNum(n)],
    'jsRound': [for (final n in numbers) jsRound(n)],
    'unitLabel': [
      for (final u in TimeUnit.values) [unitLabel(1, u), unitLabel(2.5, u), unitLabel(1000, u)],
    ],
    'ordinal': [for (final n in [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, -1, -11]) ordinal(n)],
    'jsNumber': [for (final t in numberTexts) jsNumber(t)],
    'numTryParse': [for (final t in numberTexts) num.tryParse(t)],
    'checkValue': [
      for (final d in defs)
        [
          for (final v in values)
            checkValue(d, v, entries, categoryName: (k) => k == 'character' ? 'Characters' : k)?.message,
        ],
    ],
    'checkKinds': [
      for (final d in defs) [for (final v in values) checkValue(d, v, entries)?.problem.key],
    ],
    'display': [
      for (final t in [...FieldType.values, null])
        [for (final v in values) displayValue(t, v, (id) => entries[id]?.name)],
    ],
    'splitChoices': [for (final v in values) splitChoices(v)],
    'images': [
      for (final v in [
        'https://example.com/a.png',
        'http://x',
        'HTTPS://X.COM/A B',
        'data:image/jpeg;base64,AAAA',
        'data:image/svg+xml;base64,AAAA',
        'javascript:alert(1)',
        '',
        5,
        null,
        'data:image/png;base64,${'A' * 2000000}',
      ])
        normalizeImage(v),
    ],
    'cleanList': cleanList([' a', 'a ', '', 3, null, 'b', '  ', 'B']),
    'cleanOptions': cleanOptions([' x ', 'x', '', 5, 'y' * 70, ...List.generate(120, (i) => 'o$i')]),
    'cleanDefs': () {
      var n = 0;
      return cleanDefs([
        {'id': 'a', 'name': 'Rank', 'type': 'number', 'min': ' 2 ', 'max': '0x10', 'required': true, 'help': 'h' * 300},
        {'name': 'x' * 80, 'type': 'select', 'options': 'not a list', 'archived': true, 'required': 'yes'},
        {'id': '', 'name': 5, 'type': 'reference', 'target': 'character', 'future': [1, 2]},
        {'id': 'r', 'name': 'R', 'type': 'text', 'target': 'character', 'min': 1},
        {'id': 'n', 'name': 'N', 'type': 'number', 'min': 'Infinity', 'max': 'NaN'},
        null,
      ], () => 'def${++n}');
    }(),
    'uses': [
      for (final raw in <Object?>[
        null,
        <String, Object?>{},
        'x',
        {
          'timeline': {'start': 'a', 'end': 'zz'},
        },
        {
          'map': {'x': 'a', 'y': 'b'},
          'rank': 'c',
          'tree': true,
        },
        {
          'ownership': {'type': '  owns  ', 'field': 'b'},
          'graphLabel': 'a',
          'graphLinks': ['a', 'a', 'zz', 'c', 5],
        },
        {
          'ownership': {'type': '   '},
          'graphLinks': <String>[],
        },
        {
          'rank': 'zz',
          'timeline': {'start': 'zz'},
          'tree': 'yes',
          'extra': 1,
        },
        {
          'ownership': {'type': 'x' * 80},
        },
      ])
        [
          cleanUses(raw, ['a', 'b', 'c']),
          remapUses(cleanUses(raw, ['a', 'b', 'c']), (id) => id == 'c' ? null : '${id}2'),
          mergeUses(cleanUses(raw, ['a', 'b', 'c']), {'rank': 'q', 'tree': true}),
        ],
    ],
    'merged': [
      mergeUses(null, {'rank': 'a'}),
      mergeUses({'rank': 'a'}, null),
      mergeUses({'rank': 'a', 'tree': true, 'map': null}, {'rank': 'b', 'map': {'x': 'a'}}),
      mergeUses({}, {}),
    ],
    'fold': [for (final t in texts) [foldText(t), nfkdWords(t), toFormulaKey(t)]],
    'foldAll': foldText(String.fromCharCodes([for (var c = 0x80; c < 0x3100; c++) c])),
    'sorted': [...sortable]..sort(localeCompare),
    'connectionTypes': [
      for (final k in [null, '', ' ', 'owns', ' owns ', 'excludes', 'considers-rival', 'made up'])
        () {
          final t = connectionType(k);
          return [t.key, t.label, t.inverse == ConnectionType.same ? 'same' : t.inverse, t.reciprocal];
        }(),
    ],
    'refs': [
      for (final k in ['entry:x', 'ability:a/b', 'planet:x', ':x', 'node:', 'nonsense', 'event:a:b'])
        EntityRef.parse(k)?.toJson(),
    ],
    'refsJson': [
      for (final j in <Object?>[
        {'type': 'node', 'id': 'n'},
        {'type': 'node', 'id': 5},
        {'type': 'x', 'id': 'n'},
        'x',
      ])
        EntityRef.fromJson(j)?.key,
    ],
    'builtins': [for (final k in builtinCategoryKeys) Category.builtin(k).raw],
    'unknownCategory': Category.unknown('zz').raw,
    'dates': [
      for (final d in [...formatted, ...samples]) EventDate.fromJson(d)?.toJson(),
    ],
    'durations': [
      for (final d in <Object?>[
        {'amount': 2, 'unit': 'days'},
        {'amount': '2', 'unit': 'days'},
        {'amount': 2, 'unit': 'fortnights'},
        null,
      ])
        EventDuration.fromJson(d)?.toJson(),
    ],
    'anchors': [
      for (final a in <Object?>[
        {'kind': 'node', 'nodeId': 'n'},
        {'kind': 'node', 'nodeId': ' '},
        {'kind': 'event', 'eventId': 'e', 'extra': 1},
        {
          'kind': 'date',
          'when': {'precision': 'relative', 'anchorId': 'e', 'amount': 1, 'unit': 'days'},
        },
        {'kind': 'date', 'when': 'x'},
        {'kind': 'sometime'},
        'x',
      ])
        () {
          final x = Anchor.fromJson(a);
          return [x?.runtimeType.toString(), x?.raw, anchorIds(Validity(x, null))];
        }(),
    ],
    'branches': [
      for (final st in ['main', 'non-canon', 'abandoned', 'weird', null])
        () {
          final b = BranchRecord({'id': 'b', 'parentId': ' ', 'forkNodeId': 'n', 'forkLabel': 'Ch 1', 'status': st});
          return [b.parentId, b.forkNodeId, b.forkLabel, b.status.key, b.status.label, b.status.hint, b.note];
        }(),
    ],
    'novelStatus': [
      for (final st in ['planning', 'on-hold', 'onHold', null]) Novel({'id': 'n', 'status': st}).status.key,
    ],
    'blankSheet': blankSheet(id: 's', projectId: 'p', systemId: 'sys', entryId: 'e', now: 5),
  };
}

Object timed(String what, Object Function() f) {
  final w = Stopwatch()..start();
  final r = f();
  stderr.writeln('$what ${w.elapsedMilliseconds}ms');
  return r;
}

void main(List<String> args) {
  final out = <String, Object?>{};
  final novels = <String, NovelSnapshot>{
    for (final f in Directory(fixturesDir).listSync().whereType<File>().where((f) => f.path.endsWith('.novel.json')))
      f.uri.pathSegments.last.replaceAll('.novel.json', ''): NovelSnapshot.fromJson(
        jsonDecode(f.readAsStringSync()),
      ),
    'edge': NovelSnapshot.fromJson(jsonDecode(File('$here/../edge.novel.json').readAsStringSync())),
    'sample': NovelSnapshot.fromJson(
      jsonDecode(File('$here/../../../assets/sample/the-drowned-road.novel.json').readAsStringSync()),
    ),
  };
  final template = [
    for (final r in novels['kinds']!.rows('loreSchemas')) CodexChanges.kindTemplate(Category(r)),
  ];
  for (final MapEntry(key: name, value: s) in novels.entries) {
    final parts = <String, Object Function()>{
      '$name.model': () => modelReport(s),
      '$name.validity': () => validityReport(s),
      '$name.connections': () => connectionsReport(s),
      '$name.deletes': () => deleteReport(s),
      '$name.codex': () => codexReport(s),
      '$name.changes': () => changesReport(s, template),
      '$name.timeline': () => timelineReport(s),
      '$name+calendar.timeline': () => timelineReport(withCalendar(s)),
      '$name+calendar.validity': () => validityReport(withCalendar(s)),
    };
    for (final MapEntry(key: key, value: make) in parts.entries) {
      out[key] = timed(key, make);
    }
  }
  out['misc'] = timed('misc', miscReport);
  File(args.single).writeAsStringSync(jsonEncode(plain(out)));
}
