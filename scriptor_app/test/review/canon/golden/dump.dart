// The Flutter app's own outputs for phase 7's canon port (canon.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: the canon review (each statement's flags, the pairs), every
// source named as a reader would cite it, the marks laid over the views (with the records check, the timeline review
// and the manuscript check under them) and all of them merged, "What depends on this" for every chapter, scene and
// group, every event and every plot development, and a script of canon changes run on a copy (each step's statements
// or refusal). And `misc`: a script on a made-up novel that reaches every change and refusal.
//
// To make the golden again: run.sh in the scratchpad's `rcanon` folder (it holds the package config).

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/canon/canon_changes.dart';
import 'package:novel_builder/shared/domain/canon/checks.dart';
import 'package:novel_builder/shared/domain/canon/facts.dart';
import 'package:novel_builder/shared/domain/canon/overlay.dart';
import 'package:novel_builder/shared/domain/canon/review.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/consequences/consequences.dart';
import 'package:novel_builder/shared/domain/continuity/audit.dart';
import 'package:novel_builder/shared/domain/continuity/rules.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/manuscript/prose.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/canon.dart';
import 'package:novel_builder/shared/domain/records/category.dart';
import 'package:novel_builder/shared/domain/records/review.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/system.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/timeline/review.dart';

// ---------------------------------------------------------------------------------------------------- as JSON

Object? flagJson(Flag f) => {
  'key': f.key,
  'kind': f.kind,
  'otherId': f.otherId,
  'message': f.message,
  'dismiss': f.dismiss == null ? null : {'factId': f.dismiss!.factId, 'entryId': f.dismiss!.entryId, 'field': f.dismiss!.field},
};

Object? canonJson(({List<FactReview> reviews, List<FactPair> pairs}) r) => {
  'reviews': [
    for (final x in r.reviews) {'fact': x.fact.id, 'flags': [for (final f in x.flags) flagJson(f)]},
  ],
  'pairs': [
    for (final p in r.pairs) {'a': p.a.id, 'b': p.b.id, 'stated': p.stated},
  ],
};

Object? markJson(OverlayMark? m) {
  if (m == null) return null;
  final badge = badgeOf(m);
  return {
    'status': m.status == null
        ? null
        : {'key': m.status!.key, 'label': m.status!.label, 'hint': m.status!.hint, 'glyph': m.status!.glyph},
    'warnings': [
      for (final w in m.warnings)
        {
          'key': w.key,
          'source': w.source.name,
          'severity': w.severity.name,
          'title': w.title,
          'rule': w.rule,
          'message': w.message,
          'because': w.because,
        },
    ],
    'badge': badge == null ? null : {'glyph': badge.glyph, 'tone': badge.tone?.name},
    'words': markWords(m),
  };
}

String kindName(ConsequenceKind k) => switch (k) {
  ConsequenceKind.characterState => 'characterState',
  _ => k.name,
};

Object? consequenceJson(Consequence c) => {
  'key': c.key,
  'tier': c.tier.name,
  'kind': kindName(c.kind),
  'message': c.message,
  'basis': c.basis,
  'target': c.target,
  'excerpt': c.excerpt,
  'match': c.match,
  'nodeId': c.nodeId,
  'entryIds': c.entryIds,
  'threadId': c.threadId,
  'relationId': c.relationId,
  'eventId': c.eventId,
  'factId': c.factId,
};

Object? reportJson(Report r) => {
  'title': r.title,
  'found': r.found,
  'anchorIds': r.anchorIds,
  'seeds': [for (final e in r.seeds) e['id']],
  'suggested': [for (final e in r.suggested) e['id']],
  'established': [for (final c in r.established) consequenceJson(c)],
  'potential': [for (final c in r.potential) consequenceJson(c)],
  'summary': [
    for (final p in r.summary) {'label': p.label, 'count': p.count},
  ],
  'summaryLine': r.summaryLine,
  'downstream': r.downstream,
};

// ------------------------------------------------------------------------------------------------------ a novel

List<ContinuityRule> stableRules(List<ContinuityRule> rules) => [...rules]
  ..sort((a, b) {
    final c = a.createdAt.compareTo(b.createdAt);
    return c != 0 ? c : a.id.compareTo(b.id);
  });

World worldOf(NovelSnapshot s) => World(
  nodes: [for (final r in s.rows('chapters')) StoryNode(r)],
  docs: {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']},
  plans: s.rows('chapterPlans'),
  entries: s.rows('loreEntries'),
  relations: s.rows('characterRelations'),
  threads: s.rows('plotThreads'),
  events: s.rows('timelineEvents'),
  facts: s.rows('canonFacts'),
  rules: s.rows('continuityRules'),
  snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
  systems: [for (final r in s.rows('systems')) SystemBlueprint(r)],
);

/// A script of canon changes on a copy: each step's statements (or the refusal), ids handed out in turn.
List<Object?> script(NovelSnapshot start) {
  var snapshot = start;
  var clock = 5000;
  var ids = 0;
  final out = <Object?>[];
  void step(String name, Object? Function(CanonChanges c) change) {
    final c = CanonChanges(snapshot, now: ++clock, createId: () => 'id${++ids}');
    try {
      final result = change(c);
      snapshot = c.snapshot;
      out.add({'step': name, 'result': result is FactSource ? result.raw : result, 'facts': snapshot.rows('canonFacts')});
    } on ChangeRefused catch (e) {
      out.add({'step': name, 'refused': e.message});
    }
  }

  final model = StoryModel.fromSnapshot(start);
  final docs = [
    for (final n in model.nodes.values)
      if (isDocument(n.kind) && model.order.position.containsKey(n.id)) n,
  ]..sort((a, b) => model.order.position[a.id]!.compareTo(model.order.position[b.id]!));
  final entry = model.entries.values.firstOrNull?.id;
  final event = model.events.values.firstOrNull?.id;
  final doc = docs.firstOrNull?.id;
  String? quote;
  if (doc != null) {
    final blocks = docBlocks(start.rows('chapterContents').where((r) => r['id'] == doc).firstOrNull?['doc']);
    final text = blocks.where((b) => b.text.trim().length > 12).lastOrNull?.text.trim();
    if (text != null) quote = text.substring(2, text.length > 30 ? 30 : text.length).toUpperCase();
  }
  final existing = [for (final r in start.rows('canonFacts')) str(r['id'])];

  step('create', (c) => c.create(subject: '  The Academy ', statement: ' Founded long ago ', entryIds: [?entry, 'gone', ?entry]).id);
  step('create canon', (c) => c.create(subject: 'The Academy', statement: 'Founded 900 years ago', status: CanonStatus.canon, kind: 'nope').id);
  step('create blank', (c) => c.create().id);
  step('update provisional', (c) => c.update('id1', statement: 'Founded 1,000 years ago', subject: '   ', kind: 'rule', notes: 'Check'));
  step('update established', (c) => c.update('id3', statement: 'Other'));
  step('update missing', (c) => c.update('nope', notes: 'x'));
  step('set status', (c) => c.setStatus('id1', CanonStatus.canon, reason: '  Decided '));
  step('set same status', (c) => c.setStatus('id1', CanonStatus.canon));
  step('revise retcon', (c) => c.revise('id1', 'Founded 500 years ago', reason: 'Book two'));
  step('revise minor', (c) => c.revise('id1', 'Founded 500 years ago.', minor: true));
  step('revise same', (c) => c.revise('id1', 'Founded 500 years ago.'));
  step('annotate', (c) => c.annotate('id1', 'id2', 'Settled'));
  step('annotate missing', (c) => c.annotate('id1', 'nope', 'x'));
  if (doc != null) step('source chapter', (c) => c.addSource('id1', type: 'chapter', refId: doc, quote: quote ?? 'nothing'));
  if (doc != null) step('source chapter block', (c) => c.addSource('id1', type: 'chapter', refId: doc, block: 3));
  if (entry != null) step('source entry', (c) => c.addSource('id1', type: 'entry', refId: entry, block: 2));
  if (event != null) step('source event', (c) => c.addSource('id1', type: 'event', refId: event));
  step('source gone', (c) => c.addSource('id1', type: 'event', refId: 'gone', note: ' notebook '));
  step('source odd', (c) => c.addSource('id1', type: 'odd', note: 'p. 12'));
  step('link', (c) => c.linkConflict('id1', 'id3'));
  step('link self', (c) => c.linkConflict('id1', 'id1'));
  if (existing.isNotEmpty) step('link existing', (c) => c.linkConflict(existing.first, 'id1'));
  step('unlink', (c) => c.unlinkConflict('id3', 'id1'));
  step('dismiss fact', (c) => c.dismiss('id3', (factId: 'id1', entryId: null, field: null)));
  step('dismiss twice', (c) => c.dismiss('id3', (factId: 'id1', entryId: null, field: null)));
  step('dismiss field', (c) => c.dismiss('id1', (factId: null, entryId: entry ?? 'x', field: 'Age')));
  step('dismiss nothing', (c) => c.dismiss('id1', (factId: null, entryId: null, field: 'Age')));
  step('undismiss', (c) => c.undismiss('id1'));
  step('replaced', (c) => c.update('id1', replacedById: (value: 'id3')));
  step('replaced self', (c) => c.update('id3', replacedById: (value: 'id3')));
  step('entries', (c) => c.update('id1', entryIds: [?entry, 'nope']));
  if (doc != null) step('locate', (c) => c.locate(doc, quote ?? 'nothing'));
  step('remove source', (c) => c.removeSource('id1', 'id9'));
  step('remove', (c) => c.removeFact('id5'));
  step('remove missing', (c) => c.removeFact('nope'));
  return out;
}

Map<String, Object?> novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final facts = [for (final r in s.rows('canonFacts')) CanonFact(r)];
  final rules = stableRules([for (final r in s.rows('continuityRules')) ContinuityRule(r)]);
  final decisions = [for (final r in s.rows('continuityResolutions')) ReviewItem(r)];
  Category? categoryOf(String k) => model.categories[k];
  final canon = reviewCanon(facts, [...model.entries.values], [...model.nodes.values], categoryOf);
  final records = checkRecords(model, facts: facts, rules: rules);
  final timeline = reviewTimeline(model, [for (final r in rules) r.raw]);
  final docs = {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']};
  final audited = audit(model, docs, rules, decisions);
  final overlay = canonOverlay(model, records: records, timeline: timeline, canon: canon.reviews, continuity: audited.open);
  final world = worldOf(s);
  final reports = <String, Object?>{};
  // subtreeIds never finishes on a parent cycle (edge has one), so there it is left out on both sides.
  final parent = {for (final n in world.nodes) n.id: n.parentId};
  final cycles = world.nodes.any((n) {
    final seen = <String>{};
    String? x = n.id;
    while (x != null && !seen.contains(x)) {
      seen.add(x);
      x = parent[x];
    }
    return x != null;
  });
  if (cycles) reports['skipped'] = 'a parent cycle';
  for (final n in cycles ? const <StoryNode>[] : world.nodes) {
    reports['node:${n.id}'] = reportJson(analyze(world, NodeSubject(n.id)));
  }
  for (final e in cycles ? const <JsonMap>[] : world.events) {
    reports['event:${e['id']}'] = reportJson(analyze(world, EventSubject(str(e['id']))));
  }
  for (final t in cycles ? const <JsonMap>[] : world.threads) {
    for (final b in maps(t['beats'])) {
      reports['beat:${t['id']}/${b['id']}'] = reportJson(analyze(world, BeatSubject(str(t['id']), str(b['id']))));
    }
  }
  // The author's own choices: the first entry left out and the last taken in, for the first chapter.
  if (!cycles && world.nodes.isNotEmpty && world.entries.isNotEmpty) {
    reports['chosen'] = reportJson(
      analyze(
        world,
        NodeSubject(world.nodes.first.id),
        include: [str(world.entries.last['id']), 'gone'],
        exclude: [str(world.entries.first['id'])],
      ),
    );
  }
  return {
    'canon': canonJson(canon),
    'sources': [
      for (final f in facts)
        for (final source in f.factSources)
          () {
            final d = describeSource(
              source,
              node: (id) => model.nodes[id],
              entry: (id) => model.entries[id],
              event: (id) => model.events[id]?.name,
              category: categoryOf,
            );
            return {'label': d.label, 'missing': d.missing};
          }(),
    ],
    'overlay': {for (final MapEntry(:key, :value) in overlay.entries) key: markJson(value)},
    'merged': markJson(mergeMarks(overlay.values)),
    'consequences': reports,
    'script': script(s),
  };
}

// --------------------------------------------------------------------------------------------------------- misc

Map<String, Object?> misc() {
  JsonMap fact(String id, String subject, String statement, String status, {List<String> entryIds = const [], List<String> conflicts = const [], List<JsonMap> sources = const [], List<JsonMap> dismissed = const [], int createdAt = 0}) => {
    'id': id,
    'subject': subject,
    'statement': statement,
    'status': status,
    'entryIds': entryIds,
    'conflictsWith': conflicts,
    'sources': sources,
    'dismissed': dismissed,
    'createdAt': createdAt,
  };
  final snapshot = NovelSnapshot(
    project: {'id': 'p', 'title': 'Misc'},
    collections: {
      'loreEntries': [
        {
          'id': 'alex',
          'category': 'character',
          'name': 'Alex',
          'fields': [
            {'id': 'f1', 'key': 'Age', 'value': '19', 'type': 'text'},
            {'id': 'f2', 'key': 'Eyes', 'value': 'grey', 'type': 'text'},
          ],
        },
      ],
      'chapters': [
        {'id': 'c1', 'kind': 'chapter', 'title': 'Chapter 1', 'order': 0},
      ],
    },
  );
  final model = StoryModel.fromSnapshot(snapshot);
  final facts = [
    CanonFact(fact('a', 'Age', 'Alex is 19', 'canon', entryIds: ['alex'])),
    CanonFact(fact('b', 'Age', 'Alex is 20', 'provisional', entryIds: ['alex'], createdAt: 1)),
    CanonFact(fact('c', 'Eyes', 'Blue', 'conflicting', entryIds: ['alex'], sources: [
      {'id': 's', 'type': 'chapter', 'refId': 'c1', 'block': 4},
    ])),
    CanonFact(fact('d', 'Moons', 'Two', 'canon', conflicts: ['e'])),
    CanonFact(fact('e', 'Moons', 'Three', 'retconned')),
    CanonFact(fact('f', 'Moons', 'One', 'provisional', dismissed: [
      {'factId': 'd'},
    ])),
    CanonFact(fact('g', 'Weather', 'Rain', 'conflicting')),
    CanonFact(fact('h', 'MOONS!', ' two ', 'provisional')),
  ];
  final r = reviewCanon(facts, [...model.entries.values], [...model.nodes.values], (k) => model.categories[k]);
  return {
    'review': canonJson(r),
    'normalize': [for (final t in ['Réal Café', 'ÉLAN, vital!', '  spaced  out ', 'naïve—ﬁne', '']) normalize(t)],
    'quoted': [quoted('short'), quoted('  ${'x' * 100}  ')],
    'words': [for (final f in facts) f.words],
    'keys': [canonKey('a', 'fact:b'), canonKey('a', 'field:alex:age'), canonKey('a', 'unpaired')],
  };
}

// ------------------------------------------------------------------------------------------------------- hashing

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
    final parts = novel(s);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(jsonDecode(jsonEncode(value)))};
  }
  out['misc'] = jsonDecode(jsonEncode(misc()));
  File(args.first).writeAsStringSync(jsonEncode(out));
}
