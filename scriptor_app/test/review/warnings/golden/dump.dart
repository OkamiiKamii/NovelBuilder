// The Flutter app's own outputs for Review's warnings and record check (warnings.golden.json pins them; outputs.ts
// makes Scriptor's, keyed and shaped the same way). For every novel given, whole and with records removed (its first
// character and its first chapter deleted): the record check's findings (references to deleted records, fields that
// name nothing, look-alikes, values that do not fit, views on unsuited fields, flagged connections); the record-to-record
// rules; every warning the review gathers, with its decisions (as the review data gathers them: the manuscript check
// run, journeys' settings, maps, pins and snapshots read); and the fixes: each broken reference taken out, each field
// pointed at each suggestion, each look-alike pair's merge plan both ways and the merge itself, as hashes of the novel
// that results, refusals said.
//
// dart.exe runs the domain itself (integrity/rules, integrity/fixes, canon/checks, review/collect, continuity/audit).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart warnings.golden.json <the Flutter fixtures>/*.novel.json ../../../model/edge.novel.json \
//        ../../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/canon/checks.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart' show CharacterSecret;
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/continuity/audit.dart';
import 'package:novel_builder/shared/domain/continuity/rules.dart';
import 'package:novel_builder/shared/domain/integrity/fixes.dart';
import 'package:novel_builder/shared/domain/integrity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/places/places.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart' show ProgressSnapshot;
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/review/collect.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/travel/travel.dart';

NovelSnapshot damaged(NovelSnapshot s) {
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

Object? attempt(Object? Function() run) {
  try {
    return run();
  } on ChangeRefused catch (e) {
    return {'refused': e.message};
  }
}

/// A novel's collections, as hashes, for comparing what a fix made.
Object? collectionsOf(NovelSnapshot s) => {
  for (final e in s.collections.entries) e.key: hashOf(e.value),
};

Map<String, Object?> novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final facts = [for (final r in s.rows('canonFacts')) CanonFact(r)];
  final rules = [for (final r in s.rows('continuityRules')) ContinuityRule(r)]
    ..sort((a, b) {
      final c = a.createdAt.compareTo(b.createdAt);
      return c != 0 ? c : a.id.compareTo(b.id);
    });
  final decisions = [for (final r in s.rows('continuityResolutions')) ReviewItem(r)];
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final manuscript = audit(model, docs, rules, decisions);
  final aliases = {for (final p in s.rows('characterProfiles')) str(p['entryId']): strings(p['aliases'])};
  final warnings = collectWarnings(
    ReviewInput(
      model: model,
      facts: facts,
      rules: rules,
      markers: s.rows('structureMarkers'),
      aliases: aliases,
      secrets: [for (final r in s.rows('characterSecrets')) CharacterSecret(r)],
      travel: s.rows('travelSettings').map(TravelSettings.new).firstOrNull,
      maps: [for (final r in s.rows('worldMaps')) WorldMap(r)],
      pins: [for (final r in s.rows('mapPins')) MapPin(r)],
      snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
      manuscript: manuscript.all,
    ),
  );
  final status = withStatus(warnings, decisions, manuscriptChecked: true);
  final broken = brokenReferences(model, s.rows('structureMarkers'));
  final unresolved = unresolvedFields(model);
  final duplicates = duplicateCandidates(model.entries.values.toList(), aliases);
  JsonMap planOut(MergePlan p) => {
    'keep': p.keep['id'],
    'merge': p.merge['id'],
    'repointed': [
      for (final r in p.repointed) {'table': r.table, 'rows': r.rows, 'words': tableWords(r.table)},
    ],
    'combined': p.combined,
    'dropped': p.dropped,
  };
  return {
    'integrity': {
      'broken': [
        for (final b in broken)
          {
            'key': b.key,
            'where': b.where,
            'table': b.table,
            'rowId': b.rowId,
            'missing': '${b.missing.type.name}:${b.missing.id}',
            'says': b.says,
            'fixable': fixable.contains(b.table),
            'whole': goesWhole.contains(b.table),
          },
      ],
      'unresolved': [
        for (final u in unresolved)
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
        for (final d in duplicates) {'key': d.key, 'a': d.a.id, 'b': d.b.id, 'rule': d.rule.name, 'because': d.because},
      ],
      'unfit': [
        for (final u in unfitEntries(model))
          {
            'key': u.key,
            'entry': u.entry.id,
            'issues': [
              for (final i in u.issues) {'defId': i.defId, 'field': i.field, 'problem': i.problem.key, 'message': i.message},
            ],
          },
      ],
      'unsuited': [
        for (final u in unsuitedKinds(model)) {'key': u.key, 'category': u.category.key, 'problems': u.problems},
      ],
      'flagged': [
        for (final c in flaggedConnections(model)) {'id': c.id, 'status': statusOf(c)?.name, 'label': c.label},
      ],
    },
    'records': [
      for (final f in checkRecords(model, facts: facts, rules: rules))
        {
          'key': f.key,
          'rule': f.rule.key,
          'severity': f.severity.name,
          'message': f.message,
          'because': f.because,
          'on': f.on,
          'refs': [for (final r in f.refs) r.toJson()],
        },
    ],
    'warnings': [for (final w in warnings) w.toJson()],
    'warningRefs': [
      for (final w in warnings)
        {'key': w.key, 'select': w.context?.select == null ? null : '${w.context!.select!.type.name}:${w.context!.select!.id}'},
    ],
    'status': {
      'items': [
        for (final i in status.items) {'key': i.warning.key, 'status': i.status, 'decision': i.decision?.id},
      ],
      'gone': [for (final d in status.gone) d.id],
      'goneUnchecked': [for (final d in withStatus(warnings, decisions, manuscriptChecked: false).gone) d.id],
    },
    'removed': [
      for (final b in broken)
        attempt(() => collectionsOf(removeReference(s, b.table, b.rowId, b.missing.id, now: 77))),
    ],
    'pointed': [
      for (final u in unresolved)
        for (final e in u.suggestions) attempt(() => collectionsOf(pointField(s, u.entry.id, u.fieldId, u.value, e.id, now: 78))),
    ],
    'plans': [
      for (final d in duplicates) ...[
        attempt(() => planOut(mergePlan(s, d.a.id, d.b.id))),
        attempt(() => planOut(mergePlan(s, d.b.id, d.a.id))),
      ],
    ],
    'merged': [
      for (final d in duplicates.take(4)) attempt(() => collectionsOf(mergeEntries(s, d.a.id, d.b.id, now: 79))),
    ],
    'refusals': [
      attempt(() => removeReference(s, 'chapters', 'x', 'y', now: 1)),
      attempt(() => removeReference(s, 'loreLinks', 'no-such-row', 'y', now: 1)),
      attempt(() => pointField(s, 'nobody', 'f', 'w', 'nobody-else', now: 1)),
      if (model.entries.isNotEmpty) attempt(() => mergePlan(s, model.entries.keys.first, model.entries.keys.first)),
      if (model.entries.values.map((e) => e.category).toSet().length > 1)
        attempt(() {
          final a = model.entries.values.first;
          final b = model.entries.values.firstWhere((e) => e.category != a.category);
          return mergePlan(s, a.id, b.id);
        }),
    ],
  };
}

/// What has no novel of its own: names compared for likeness, and references taken out of made-up records.
Map<String, Object?> misc() => {
  'names': {
    for (final n in [
      'The Keep',
      'the keep',
      'A Tale',
      'An Apple',
      'Mira-Vance',
      'Mïra  Vance!',
      '  ',
      'Thermopylae',
      'Theodore',
      'ÉLAN, vital',
      'Ångström 1,000',
      'the',
      'The',
    ])
      n: normalizeName(n),
  },
  'without': [
    withoutReference({
      'id': 'x',
      'nodeIds': ['a', 'b'],
      'characters': [
        {'id': 'b', 'age': 3},
        {'id': 'c'},
      ],
      'locationId': 'b',
      'value': 'a\nb\nc',
      'deep': {
        'a': {
          'b': {
            'c': {
              'd': {
                'e': {'f': 'b'},
              },
            },
          },
        },
      },
    }, 'b'),
    withoutReference(['b', 'b', 'c', {'id': 'b'}, {'id': 'c', 'x': 'b'}], 'b'),
  ],
  'tableWords': {for (final t in ['loreLinks', 'chapterContents', 'unknownTable', 'journeys']) t: tableWords(t)},
};

String canonical(Object? v) {
  if (v == null) return 'null';
  if (v is bool) return '$v';
  if (v is num) {
    if (v.isFinite && v == v.truncateToDouble() && v.abs() < 9007199254740992) return '${v.toInt()}';
    return '$v';
  }
  if (v is String) return '"${v.replaceAllMapped(RegExp(r'["\\]'), (m) => '\\${m[0]}')}"';
  if (v is List) return '[${v.map(canonical).join(',')}]';
  if (v is Map) {
    final keys = [for (final k in v.keys) '$k']..sort();
    return '{${keys.map((k) => '${canonical(k)}:${canonical(v[k])}').join(',')}}';
  }
  return canonical('$v');
}

String hashOf(Object? v) {
  var h = 0x811c9dc5;
  for (final c in canonical(v).codeUnits) {
    h ^= c;
    h = (h * 0x01000193) & 0xffffffff;
  }
  return h.toRadixString(16).padLeft(8, '0');
}

/// With FULL set, every part whole; else each part of each novel as its hash (`misc` is always whole).
void main(List<String> args) {
  final full = Platform.environment['FULL'] != null;
  final out = <String, Object?>{};
  for (final path in args.skip(1)) {
    final name = path.split(RegExp(r'[\\/]')).last.replaceAll('.novel.json', '');
    final s = NovelSnapshot.fromJson(jsonDecode(File(path).readAsStringSync()) as JsonMap);
    for (final (key, snap) in [(name, s), ('$name-damaged', damaged(s))]) {
      final parts = novel(snap);
      out[key] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
    }
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
