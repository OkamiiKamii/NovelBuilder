// The Flutter app's own outputs for Visualize's story views (story.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given: the length bars, part bands, facts, words by label and the
// fact line at both grains, for the whole book and each part, and with each label picked out; the markers placed,
// their bars and words; a script of marker changes with its refusals; every lane's cells in words, its lines and its
// sequence; a script of appearance records; and the ability paths: the tree, what does not add up, the layout, each
// ability's paths, the list, each path drawn, every path in words, the view under several choices, and each
// character's holdings and standings at the end and at every chapter and scene. And `misc`: a few round numbers.
//
// What is the widgets' (plot_lanes_page.dart, structure_page.dart, appearances_page.dart, ability_paths_page.dart) is
// copied here word for word but for Flutter's types, since those files need Flutter: dart.exe runs the domain itself
// (pacing, lanes, paths, plot_changes, story_model, narrative, outline).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart story.golden.json <the Flutter fixtures>/*.novel.json ../../../model/edge.novel.json \
//        ../../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/abilities/paths.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show isDocument;
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/model/story_order.dart' show readingOrder;
import 'package:novel_builder/shared/domain/plot/lanes.dart';
import 'package:novel_builder/shared/domain/plot/plot_changes.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/link.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/thread.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/structure/pacing.dart';

// ------------------------------------------------------------------------------------------- core/format.dart

String formatNumber(num n) {
  final digits = n.round().abs().toString();
  final out = StringBuffer(n < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

String plural(int n, String one, [String? many]) => '${formatNumber(n)} ${n == 1 ? one : (many ?? '${one}s')}';

// ------------------------------------------------------------------------------------------- plot_lanes_page.dart

String eventName(StoryModel model, String id) => model.events[id]?.name ?? 'an event';
String whereIn(StoryModel model, String nodeId, String chapterId) =>
    nodeId == chapterId ? '' : ' in “${model.nodes[nodeId]?.title ?? 'a scene'}”';
String beatWords(ThreadBeat b) =>
    '${beatRoleLabels[roleKey(b)]!.toLowerCase()}${b.title.trim().isEmpty ? '' : ' “${b.title.trim()}”'}';

String cellWords(StoryModel model, Lanes lanes, Lane lane, int col) {
  final c = lane.cells[col];
  final parts = [
    for (final p in c.places) ...[
      for (final b in p.beats) '${beatWords(b)}${whereIn(model, p.nodeId, p.chapterId)}',
      for (final id in p.eventIds) 'event “${eventName(model, id)}”${whereIn(model, p.nodeId, p.chapterId)}',
    ],
  ];
  final gap = lane.gaps.where((g) => col >= g.from && col <= g.to).firstOrNull;
  final crossedBy = [
    for (final o in lanes.lanes)
      if (o.crossings.any((x) => x.column == col && x.otherId == lane.thread.id)) o.thread.title,
  ];
  final what = parts.isNotEmpty
      ? parts.join('; ')
      : gap != null
      ? 'nothing recorded (${chaptersWords(lanes, gap.from, gap.to)}: ${gap.chapters} '
            '${gap.chapters == 1 ? 'chapter' : 'chapters'} with nothing recorded)'
      : 'nothing recorded';
  return '${lane.thread.title}, Ch ${lanes.chapters[col].number}: $what'
      '${crossedBy.isEmpty ? '' : '; crossed by ${crossedBy.join(', ')}'}';
}

/// The painter's lines between marks.
List<JsonMap> laneLines(Lane lane) {
  final marked = [
    for (final (i, c) in lane.cells.indexed)
      if (c.places.isNotEmpty) i,
  ];
  return [
    for (var i = 1; i < marked.length; i++)
      {'from': marked[i - 1], 'to': marked[i], 'gap': marked[i] - marked[i - 1] > 1, 'between': marked[i] - marked[i - 1] - 1},
  ];
}

JsonMap lanesOut(StoryModel model) {
  final ids = [for (final t in stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title))) t.id];
  final lanes = threadLanes(model, ids);
  return {
    'chapters': [for (final c in lanes.chapters) '${c.id}|${c.number}|${c.title}'],
    'lanes': [
      for (final lane in lanes.lanes)
        {
          'thread': lane.thread.id,
          'cells': [for (var col = 0; col < lanes.chapters.length; col++) cellWords(model, lanes, lane, col)],
          'roles': [for (final c in lane.cells) c.role],
          'lines': laneLines(lane),
          'unplaced': lane.unplaced.isEmpty ? null : 'Not placed in a chapter: ${lane.unplaced.map<String>(beatWords).join('; ')}.',
          'untold': lane.untold.isEmpty
              ? null
              : 'Its events told in no chapter: ${lane.untold.map<String>((id) => eventName(model, id)).join(', ')}.',
        },
    ],
  };
}

// ------------------------------------------------------------------------------------------- structure_page.dart

double niceMax(int n) {
  if (n <= 0) return 100;
  final step = math.pow(10, (math.log(n) / math.ln10).floor()).toDouble();
  return (n / step).ceil() * step;
}

String short(List<LengthBar> bars, int i) {
  final mine = bars.where((b) => b.chapterId == bars[i].chapterId).length;
  if (mine <= 1) return '${bars[i].chapterNumber}';
  final n = bars.take(i + 1).where((b) => b.chapterId == bars[i].chapterId).length;
  return '${bars[i].chapterNumber}.$n';
}

String factLine(List<LengthBar> bars, Grain grain, String? label, int picked) {
  final facts = lengthFacts(bars);
  final perWord = grain == Grain.chapters ? 'chapter' : 'bar';
  return bars.isEmpty
      ? 'Nothing in this part of the book yet.'
      : [
          '${plural(facts.count, perWord)} · ${plural(facts.total, 'word')}',
          if (facts.average > 0)
            ' · average ${formatNumber(facts.average)} and median ${formatNumber(facts.median)} words, over the '
                '${plural(facts.count - facts.empty, perWord)} with words',
          if (facts.longest != null && facts.shortest != null && facts.longest != facts.shortest)
            ' · longest ${facts.longest!.label} (${formatNumber(facts.longest!.words)}), shortest '
                '${facts.shortest!.label} (${formatNumber(facts.shortest!.words)})',
          if (facts.empty > 0)
            ' · ${plural(facts.empty, grain == Grain.chapters ? 'chapter has' : 'bar has', grain == Grain.chapters ? 'chapters have' : 'bars have')} no words yet',
          ' · ${facts.labelled} of ${facts.count} labelled',
          if (label != null) ' · $picked with “$label”',
        ].join();
}

String barWords(StoryModel model, LengthBar bar, List<String>? markers) {
  String? partTitle(String? id) => id == null ? null : model.nodes[id]?.title;
  return [
    '${bar.label}: ${bar.words > 0 ? plural(bar.words, 'word') : 'no words yet'}',
    if (bar.labels.isNotEmpty) 'labels: ${bar.labels.join(', ')}',
    if (bar.partId != null) 'in ${partTitle(bar.partId)}',
    if (markers?.isNotEmpty ?? false) 'markers: ${markers!.join(', ')}',
  ].join('; ');
}

JsonMap barOut(LengthBar b) => {
  'nodeId': b.nodeId,
  'chapterId': b.chapterId,
  'chapterNumber': b.chapterNumber,
  'label': b.label,
  'words': b.words,
  'labels': b.labels,
  'partId': b.partId,
};

JsonMap structureOut(StoryModel model, NovelSnapshot s, Grain grain, String? partId) {
  final bars = lengthBars(model, grain: grain, partId: partId);
  final facts = lengthFacts(bars);
  final dist = labelDistribution(bars, model, grain);
  final markers = stableSorted([
    for (final r in s.rows('structureMarkers')) StructureMarker(r),
  ], (a, b) => a.createdAt.compareTo(b.createdAt));
  final placed = placeMarkers(markers, model);
  final onBars = <int, List<String>>{};
  for (final p in placed) {
    final i = barOf(p, bars, model);
    if (i >= 0) (onBars[i] ??= []).add(p.marker.kind);
  }
  final labels = usedLabels(model);
  return {
    'bars': [for (final b in bars) barOut(b)],
    'bands': [
      for (final b in partBands(bars, model)) {'partId': b.partId, 'title': b.title, 'kind': b.kind, 'from': b.from, 'to': b.to},
    ],
    'facts': {
      'count': facts.count,
      'total': facts.total,
      'average': facts.average,
      'median': facts.median,
      'longest': facts.longest?.nodeId,
      'shortest': facts.shortest?.nodeId,
      'empty': facts.empty,
      'labelled': facts.labelled,
    },
    'dist': {
      'labels': dist.labels,
      'cells': [
        for (final c in dist.cells) {'nodeId': c.nodeId, 'words': c.words, 'unlabelled': c.unlabelled},
      ],
      'totals': [
        for (final t in dist.totals) {'label': t.label, 'words': t.words, 'bars': t.bars},
      ],
      'unlabelled': dist.unlabelled,
    },
    'onBars': {for (final MapEntry(:key, :value) in onBars.entries) '$key': value},
    'short': [for (var i = 0; i < bars.length; i++) short(bars, i)],
    'words': [for (final (i, b) in bars.indexed) barWords(model, b, onBars[i])],
    'max': niceMax(facts.longest?.words ?? 0),
    'fact': factLine(bars, grain, null, bars.length),
    'picked': {
      for (final l in labels)
        l: factLine(
          bars,
          grain,
          l,
          bars.where((b) => b.labels.any((x) => x.toLowerCase() == l.toLowerCase())).length,
        ),
    },
  };
}

JsonMap markersOut(StoryModel model, NovelSnapshot s) {
  final markers = stableSorted([
    for (final r in s.rows('structureMarkers')) StructureMarker(r),
  ], (a, b) => a.createdAt.compareTo(b.createdAt));
  final placed = placeMarkers(markers, model);
  String where(String? nodeId) => nodeId == null ? 'Not placed' : nodeLabel(model, nodeId);
  return {
    'placed': [
      for (final p in placed)
        {
          'id': p.marker.id,
          'nodeId': p.nodeId,
          'via': p.via,
          'missing': p.missing,
          'title': '${p.marker.kind}${p.marker.title.isEmpty ? '' : ' — ${p.marker.title}'}',
          'subtitle': [
            p.missing && p.nodeId == null ? 'Its chapter was removed' : where(p.nodeId),
            if (p.via == 'event') '(where “${model.events[p.marker.eventId]?.name}” is told)',
            if (p.marker.eventId != null && p.via != 'event' && model.events.containsKey(p.marker.eventId))
              '· at “${model.events[p.marker.eventId]!.name}”',
            if (p.marker.note.isNotEmpty) '· ${p.marker.note}',
          ].join(' '),
          'remove': 'Remove the marker ${p.marker.kind}${p.marker.title.isEmpty ? '' : ': ${p.marker.title}'}',
        },
    ],
  };
}

/// timeline/narrative.dart's nodeLabel, as the dump uses it.
String nodeLabel(StoryModel model, String nodeId) {
  final node = model.nodes[nodeId];
  if (node == null) return 'A deleted chapter';
  final n = model.order.chapterNumber[nodeId];
  final kind = node.kind;
  final title = node.title.trim().isNotEmpty ? node.title.trim() : 'Untitled ${kind?.label.toLowerCase() ?? 'chapter'}';
  if (kind == NodeKind.chapter && n != null && n != 0) return 'Ch $n: $title';
  if (kind == NodeKind.scene && n != null && n != 0) return 'Ch $n, scene: $title';
  return title;
}

List<JsonMap> markerScript(NovelSnapshot s, StoryModel model) {
  var ids = 0;
  var snapshot = s;
  final out = <JsonMap>[];
  final chapters = model.order.chapters;
  final firstEvent = stableSorted(model.events.values, (a, b) => localeCompare(a.id, b.id)).firstOrNull;
  final steps = <(String, String? Function(MarkerChanges))>[
    ('add', (m) => m.save(null, {'kind': '  Turning   point ', 'title': ' The bridge falls ', 'nodeId': chapters.firstOrNull?.id})),
    ('empty', (m) => m.save(null, {'kind': '   '})),
    ('bad node', (m) => m.save(null, {'kind': 'Climax', 'nodeId': 'nowhere'})),
    ('bad event', (m) => m.save(null, {'kind': 'Climax', 'eventId': 'nowhere'})),
    ('event', (m) => m.save(null, {'kind': 'Midpoint', 'eventId': firstEvent?.id, 'note': 'Halfway'})),
    ('long', (m) => m.save(null, {'kind': 'x' * 50, 'title': 'y' * 130})),
    ('change', (m) => m.save(m.list().first.id, {'kind': 'Climax', 'nodeId': chapters.lastOrNull?.id})),
    ('gone', (m) => m.save('nowhere', {'kind': 'Climax'})),
    ('remove', (m) {
      m.removeMarker(m.list().last.id);
      return null;
    }),
  ];
  for (final (name, step) in steps) {
    final m = MarkerChanges(snapshot, now: 5000 + out.length, createId: () => 'm${ids++}');
    try {
      final r = step(m);
      snapshot = m.snapshot;
      out.add({
        'step': name,
        'result': r,
        'markers': [
          for (final x in m.list())
            {'id': x.id, 'kind': x.kind, 'title': x.title, 'nodeId': x.nodeId, 'eventId': x.eventId, 'note': x.note, 'createdAt': x.createdAt},
        ],
      });
    } on ChangeRefused catch (e) {
      out.add({'step': name, 'refused': e.message});
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- appearances_page.dart

List<JsonMap> appearanceScript(NovelSnapshot s, StoryModel model) {
  final who = stableSorted(
    model.entries.values.where((e) => e.category == 'character'),
    (a, b) => localeCompare(a.id, b.id),
  ).firstOrNull;
  if (who == null) return const [];
  final nodes = [for (final n in readingOrder(model.nodes.values)) if (isDocument(n.kind)) n].take(3).toList();
  var snapshot = s;
  var ids = 0;
  final out = <JsonMap>[];
  for (final node in nodes) {
    for (final as in ['appears', 'mentioned', null, 'appears']) {
      final x = PlotChanges(snapshot, now: 7000, createId: () => 'p${ids++}');
      x.updatePlan(node.id, (stored) {
        final appear = [
          for (final id in strings(stored['appearIds']))
            if (id != who.id) id,
        ];
        final mention = [
          for (final id in strings(stored['mentionIds']))
            if (id != who.id) id,
        ];
        return switch (as) {
          'appears' => {
            'appearIds': [...appear, who.id],
          },
          'mentioned' => {
            'mentionIds': [...mention, who.id],
          },
          _ => {'appearIds': appear, 'mentionIds': mention},
        };
      });
      snapshot = x.snapshot;
      final after = StoryModel.fromSnapshot(snapshot);
      final plan = after.plans[node.id];
      out.add({
        'node': node.id,
        'as': as,
        'appear': plan?.appearIds,
        'mention': plan?.mentionIds,
        'own': (plan?.appearIds ?? const []).contains(who.id)
            ? 'appears'
            : (plan?.mentionIds ?? const []).contains(who.id)
            ? 'mentioned'
            : null,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- ability_paths_page.dart

String pathWords(PathEdge edge, {required bool fromSide, required String Function(String key) name}) {
  if (fromSide) return '${edge.label} ${name(edge.to)}';
  if (edge.role == PathRole.branch) return 'Branches from ${name(edge.from)}';
  if (edge.role == PathRole.rule) return 'Its requirement rule names ${name(edge.from)}';
  final inverse = connectionTypes.where((t) => t.label == edge.label).firstOrNull?.inverse;
  if (inverse == null) {
    final l = edge.label;
    return '${name(edge.from)} ${l.isEmpty ? l : '${l[0].toLowerCase()}${l.substring(1)}'} this';
  }
  return '${inverse == ConnectionType.same ? edge.label : inverse} ${name(edge.from)}';
}

const _style = {
  PathRole.prerequisite: true,
  PathRole.alternative: true,
  PathRole.rule: true,
  PathRole.upgrade: true,
  PathRole.evolution: true,
  PathRole.fusion: true,
  PathRole.replacement: true,
  PathRole.branch: true,
  PathRole.exclusive: false,
  PathRole.other: true,
};

double r3(double n) => n.isNegative ? -((-n * 1000).round() / 1000) : (n * 1000).round() / 1000;
String f(double v) => v == v.truncateToDouble() ? '${v.toInt()}' : '$v';

/// The painter's path for an edge, as SVG, and its arrowhead.
JsonMap edgeShape(PathEdge e, TreeLayout layout, ({double x, double y}) Function(String key) at, double boxHeight) {
  const circle = 48.0;
  ({double x, double y}) centre(String key) {
    final p = at(key);
    return (x: p.x, y: p.y - boxHeight / 2 + circle / 2);
  }

  final a = centre(e.from);
  final b = centre(e.to);
  final la = layout.at[e.from]!.layer;
  final lb = layout.at[e.to]!.layer;
  String d;
  ({double x, double y}) end;
  ({double x, double y}) towards;
  if (e.role == PathRole.exclusive) {
    d = 'M${f(r3(a.x))} ${f(r3(a.y))} L${f(r3(b.x))} ${f(r3(b.y))}';
    end = b;
    towards = a;
  } else if (layout.back.contains(e.id) || lb <= la) {
    final bow = 70 + (b.y - a.y).abs() * 0.15;
    final p0 = (x: a.x + circle / 2, y: a.y);
    final p3 = (x: b.x + circle / 2, y: b.y);
    d =
        'M${f(r3(p0.x))} ${f(r3(p0.y))} C${f(r3(p0.x + bow))} ${f(r3(p0.y))} ${f(r3(p3.x + bow))} ${f(r3(p3.y))} ${f(r3(p3.x))} ${f(r3(p3.y))}';
    end = p3;
    towards = (x: p3.x + bow, y: p3.y);
  } else {
    final y1 = a.y + circle / 2;
    final y2 = b.y - circle / 2;
    final dy = math.max(30.0, (y2 - y1) / 2);
    d = 'M${f(r3(a.x))} ${f(r3(y1))} C${f(r3(a.x))} ${f(r3(y1 + dy))} ${f(r3(b.x))} ${f(r3(y2 - dy))} ${f(r3(b.x))} ${f(r3(y2))}';
    end = (x: b.x, y: y2);
    towards = (x: b.x, y: y2 - dy);
  }
  if (!_style[e.role]!) return {'d': d, 'arrow': null};
  final dx = end.x - towards.x;
  final dy = end.y - towards.y;
  final len = math.sqrt(dx * dx + dy * dy);
  if (len <= 0) return {'d': d, 'arrow': null};
  final u = (x: dx / len, y: dy / len);
  final n = (x: -u.y, y: u.x);
  return {
    'd': d,
    'arrow': [
      {'x': r3(end.x), 'y': r3(end.y)},
      {'x': r3(end.x - u.x * 10 + n.x * 5), 'y': r3(end.y - u.y * 10 + n.y * 5)},
      {'x': r3(end.x - u.x * 10 - n.x * 5), 'y': r3(end.y - u.y * 10 - n.y * 5)},
    ],
  };
}

/// The page's build, from the tree to what is drawn, for given choices.
JsonMap abilityView(
  AbilityTree tree,
  List<PathProblem> problems, {
  Set<String> hiddenSources = const {},
  Set<String> hiddenRoles = const {},
  String? focusAsked,
  bool all = false,
  String text = '',
}) {
  final byKey = {for (final n in tree.nodes) n.key: n};
  String name(String key) => byKey[key]?.name ?? 'something deleted';
  final focus = focusAsked != null && byKey.containsKey(focusAsked) ? focusAsked : null;
  final t = text.trim().toLowerCase();
  final sources = <String, String>{for (final n in tree.nodes) n.sourceKey: n.source};
  var nodes = [
    for (final n in tree.nodes)
      if (!hiddenSources.contains(n.sourceKey)) n,
  ];
  if (focus != null) {
    final near = pathsOf(tree, focus);
    nodes = [
      for (final n in nodes)
        if (near.contains(n.key)) n,
    ];
  }
  final shown = {for (final n in nodes) n.key};
  var edges = [
    for (final e in tree.edges)
      if (!hiddenRoles.contains(e.role.name) && shown.contains(e.from) && shown.contains(e.to)) e,
  ];
  if (t.isNotEmpty) {
    final hits = {
      for (final n in nodes)
        if (n.name.toLowerCase().contains(t)) n.key,
    };
    for (final e in [...edges]) {
      if (hits.contains(e.from) || hits.contains(e.to)) hits.addAll([e.from, e.to]);
    }
    nodes = [
      for (final n in nodes)
        if (hits.contains(n.key)) n,
    ];
    edges = [
      for (final e in edges)
        if (hits.contains(e.from) && hits.contains(e.to)) e,
    ];
  }
  final pathed = {
    for (final e in edges) ...[e.from, e.to],
  };
  final lone = nodes.where((n) => !pathed.contains(n.key)).length;
  if (!all && edges.isNotEmpty && focus == null) {
    nodes = [
      for (final n in nodes)
        if (pathed.contains(n.key)) n,
    ];
  }
  final flagged = <String, String>{};
  for (final p in problems) {
    for (final k in p.nodes) {
      if (flagged[k] != 'problem') flagged[k] = p.severity;
    }
  }
  final roles = [
    for (final r in PathRole.values)
      if (tree.edges.any((e) => e.role == r)) r.name,
  ];
  final left = [
    if (hiddenSources.isNotEmpty)
      'Sources hidden: ${[for (final MapEntry(:key, :value) in sources.entries)
        if (hiddenSources.contains(key)) value].join(', ')}.',
    if (hiddenRoles.isNotEmpty)
      'Paths hidden: ${[for (final r in PathRole.values)
        if (hiddenRoles.contains(r.name)) r.label].join(', ')}.',
    if (focus != null) 'Only the paths of ${name(focus)}.',
  ];
  return {
    'nodes': [for (final n in nodes) n.key],
    'edges': [for (final e in edges) e.id],
    'focus': focus,
    'sources': sources,
    'lone': lone,
    'flagged': flagged,
    'roles': roles,
    'left': left,
  };
}

JsonMap abilitiesOut(StoryModel model, NovelSnapshot s) {
  final snaps = [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)];
  final tree = abilityTree(model, snaps);
  final problems = pathProblems(tree, model);
  final byKey = {for (final n in tree.nodes) n.key: n};
  String name(String key) => byKey[key]?.name ?? 'something deleted';
  final keys = [for (final n in tree.nodes) n.key];
  final layout = treeLayout(keys, tree.edges);
  const pad = 24.0;
  const h = 96.0;
  ({double x, double y}) at(String key) {
    final p = layout.at[key]!;
    return (x: p.x + 160 / 2 + pad, y: p.y + h / 2 + pad);
  }

  final documents = [
    for (final n in readingOrder(model.nodes.values))
      if (isDocument(n.kind)) n,
  ];
  final characters = stableSorted(
    model.entries.values.where((e) => e.category == 'character'),
    (a, b) => localeCompare(a.id, b.id),
  );
  final first = tree.nodes.firstOrNull;
  return {
    'nodes': [
      for (final n in tree.nodes)
        {
          'key': n.key,
          'name': n.name,
          'source': n.source,
          'sourceKey': n.sourceKey,
          'color': n.color,
          'rank': n.rank,
          'requires': n.requires,
          'limits': n.limits,
          'holders': [for (final x in n.holders) '${x.id}|${x.name}|${x.how}'],
          'acquired': [
            for (final a in n.acquired) '${a.entryId}|${a.name}|${a.action}|${a.when}|${a.changeId}|${a.snapshotId}',
          ],
        },
    ],
    'edges': [
      for (final e in tree.edges)
        {'id': e.id, 'from': e.from, 'to': e.to, 'role': e.role.name, 'label': e.label, 'directed': e.directed, 'linkId': e.linkId},
    ],
    'notDrawn': [for (final x in tree.notDrawn) '${x.connection.id}|${x.connection.label}|${x.reason}'],
    'problems': [
      for (final p in problems) {'key': p.key, 'kind': p.kind.name, 'severity': p.severity, 'message': p.message, 'nodes': p.nodes},
    ],
    'layout': {
      'at': {
        for (final MapEntry(:key, :value) in layout.at.entries) key: [value.x, value.y, value.layer],
      },
      'back': [...layout.back]..sort(),
      'width': layout.width,
      'height': layout.height,
    },
    'paths': {for (final k in keys) k: [...pathsOf(tree, k)]..sort()},
    'shapes': {for (final e in tree.edges) e.id: edgeShape(e, layout, at, h)},
    'words': {
      for (final e in tree.edges) e.id: [pathWords(e, fromSide: true, name: name), pathWords(e, fromSide: false, name: name)],
    },
    'list': [
      for (final n in tree.nodes)
        () {
          final edges = tree.edges;
          final into = edges.where((e) => e.to == n.key && e.role != PathRole.exclusive);
          final out = edges.where((e) => e.from == n.key && e.role != PathRole.exclusive);
          final excl = [
            for (final e in edges)
              if (e.role == PathRole.exclusive && (e.from == n.key || e.to == n.key))
                name(e.from == n.key ? e.to : e.from),
          ];
          return [
            for (final e in into) pathWords(e, fromSide: false, name: name),
            for (final e in out) pathWords(e, fromSide: true, name: name),
            if (excl.isNotEmpty) 'Mutually exclusive with ${excl.join(', ')}',
            if (n.holders.isNotEmpty) 'Held by ${n.holders.map((h) => '${h.name} (${h.how})').join(', ')}',
          ];
        }(),
    ],
    'views': [
      abilityView(tree, problems),
      abilityView(tree, problems, all: true),
      if (first != null) abilityView(tree, problems, hiddenSources: {first.sourceKey}),
      abilityView(tree, problems, hiddenRoles: {'prerequisite', 'exclusive'}),
      if (first != null) abilityView(tree, problems, focusAsked: first.key),
      abilityView(tree, problems, focusAsked: 'nowhere'),
      abilityView(tree, problems, text: ' A '),
      abilityView(tree, problems, text: 'zzz'),
    ],
    'characters': {
      for (final c in characters)
        c.id: [
          for (final atNode in [null, ...documents.map((d) => d.id)])
            () {
              final held = heldBy(model, snaps, c.id, atNodeId: atNode);
              final st = standings(tree, held);
              final when = atNode == null ? 'at the end of the story' : 'as of ${model.nodes[atNode]!.displayTitle}';
              return {
                'at': atNode,
                'held': [...held]..sort(),
                'standings': {for (final MapEntry(:key, :value) in st.entries) key: value.name},
                'lines': {
                  for (final MapEntry(:key, :value) in st.entries)
                    key: switch (value) {
                      Standing.held => '${c.name} holds it $when.',
                      Standing.available => '${c.name} can gain it $when: every prerequisite recorded for it is held.',
                      Standing.locked => 'Locked for ${c.name} $when. ${lockedBecause(tree, key, held, name)}'.trim(),
                    },
                },
              };
            }(),
        ],
    },
  };
}

// --------------------------------------------------------------------------------------------------------- main

JsonMap novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final parts = stableSorted(
    model.nodes.values.where((n) => n.kind?.isGroup == true),
    (a, b) => (model.order.position[a.id] ?? 0).compareTo(model.order.position[b.id] ?? 0),
  );
  return {
    for (final grain in Grain.values) ...{
      'structure:${grain.name}': structureOut(model, s, grain, null),
      for (final p in parts) 'structure:${grain.name}:${p.id}': structureOut(model, s, grain, p.id),
    },
    'usedLabels': usedLabels(model),
    'markers': markersOut(model, s),
    'markerScript': markerScript(s, model),
    'lanes': lanesOut(model),
    'appearances': appearanceScript(s, model),
    'abilities': abilitiesOut(model, s),
  };
}

JsonMap misc() => {
  'niceMax': [for (final n in [-3, 0, 1, 7, 9, 10, 11, 99, 100, 101, 999, 1234, 5000, 98765, 1000000]) niceMax(n)],
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
    final parts = novel(s);
    out[name] = full ? parts : {for (final MapEntry(:key, :value) in parts.entries) key: hashOf(value)};
  }
  out['misc'] = misc();
  File(args.first).writeAsStringSync(jsonEncode(out));
}
