// The Flutter app's own outputs for Plan's plot threads, the loom, a thread's page, the scene board and a chapter's plan
// (plot.screens.golden.json pins them; outputs.ts makes Scriptor's, keyed and shaped the same way). For every novel
// given: the thread list grouped three ways under several filters at two quiet limits; every thread's strand on the loom
// (its plan, its words and its drawing at two widths); every thread's page; the scene board under four filters, with
// every card's moves and thread chips; the board's undo history; every chapter's and scene's plan; and a script of
// changes with its refusals. And `misc`: the legend's marks, made-up strands, labels, the questions an empty list asks.
//
// What is the widgets' (threads_page.dart, widgets/loom.dart and its painter, thread_page.dart, board_page.dart,
// chapter_plan_page.dart, widgets/label_picker.dart, widgets/story_questions.dart) is copied here word for word but
// for Flutter's types, since those files need Flutter: dart.exe runs the domain itself (diagnostics, lanes,
// plot_changes, manuscript/board, story_model, navigate, narrative, pacing, event_changes).
//
// To make the golden again (from the scratch dir holding the package config that names novel_builder):
//   dart run dump.dart plot.screens.golden.json <the Flutter fixtures>/*.novel.json ../../model/edge.novel.json \
//        ../../../assets/sample/the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused, categoriesOf;
import 'package:novel_builder/shared/domain/collation.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/board.dart';
import 'package:novel_builder/shared/domain/manuscript/outline.dart' show siblingsOf, moveError;
import 'package:novel_builder/shared/domain/model/navigate.dart' show threadStatusName;
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/plot/diagnostics.dart';
import 'package:novel_builder/shared/domain/plot/lanes.dart';
import 'package:novel_builder/shared/domain/plot/plot_changes.dart';
import 'package:novel_builder/shared/domain/records/novel.dart' show novelAccents;
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/records/thread.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';
import 'package:novel_builder/shared/domain/stable_sort.dart';
import 'package:novel_builder/shared/domain/structure/pacing.dart' show usedLabels, labelOrder;
import 'package:novel_builder/shared/domain/text/fold.dart';
import 'package:novel_builder/shared/domain/timeline/event_changes.dart' show cleanLabels, suggestedLabels;
import 'package:novel_builder/shared/domain/timeline/narrative.dart' show nodeLabel;

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

/// cast_card.dart's `castTone`, as its hex.
String castToneHex(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return novelAccents[h % novelAccents.length];
}

// ------------------------------------------------------------------------------------------- widgets/loom.dart

class StrandPlan {
  StrandPlan._(this.knots, this.target, this.open, this.tied, this.faded, this.dashed, this.quiet, this.gap);

  factory StrandPlan.of(ThreadReport report, int? targetChapter) {
    final status = report.thread.statusKey;
    final knots = [
      for (final b in report.beats)
        if (b.chapter != null && !b.missing) (chapter: b.chapter!, role: b.beat.role),
    ];
    ({int from, int to})? gap;
    if (report.issues.any((i) => i.kind == 'gap')) {
      final chapters = {for (final k in knots) k.chapter}.toList()..sort();
      for (var i = 1; i < chapters.length; i++) {
        if (gap == null || chapters[i] - chapters[i - 1] > gap.to - gap.from) {
          gap = (from: chapters[i - 1], to: chapters[i]);
        }
      }
    }
    return StrandPlan._(
      knots,
      targetChapter,
      openStatuses.contains(status),
      status == 'resolved',
      status == 'abandoned' || status == 'retconned',
      status == 'paused' || status == 'planned',
      report.issues.any((i) => i.kind == 'quiet' || i.kind == 'paused'),
      gap,
    );
  }

  final List<({int chapter, BeatRole role})> knots;
  final int? target;
  final bool open;
  final bool tied;
  final bool faded;
  final bool dashed;
  final bool quiet;
  final ({int from, int to})? gap;

  int? get first => knots.isEmpty ? null : knots.map((k) => k.chapter).reduce(math.min);
  int? get last => knots.isEmpty ? null : knots.map((k) => k.chapter).reduce(math.max);

  String describe(int chapterCount, int frontier) {
    if (chapterCount == 0) return 'No chapters yet';
    final parts = <String>[
      if (knots.isEmpty)
        'No developments placed in chapters'
      else
        'Developments in chapter${knots.length == 1 ? '' : 's'} '
            '${{for (final k in knots) k.chapter}.join(', ')} of $chapterCount',
      if (tied) 'tied off at chapter $last',
      if (open && last != null && frontier > last!) 'loose since chapter $last, words written to chapter $frontier',
      if (quiet) 'gone quiet, worth a look',
      if (gap != null) 'a long gap between chapters ${gap!.from} and ${gap!.to}, worth a look',
      if (target != null) 'to resolve in chapter $target',
    ];
    return parts.join('; ');
  }

  JsonMap toJson() => {
    'knots': [
      for (final k in knots) {'chapter': k.chapter, 'role': k.role.name},
    ],
    'target': target,
    'open': open,
    'tied': tied,
    'faded': faded,
    'dashed': dashed,
    'quiet': quiet,
    'gap': gap == null ? null : {'from': gap!.from, 'to': gap!.to},
    'first': first,
    'last': last,
  };
}

/// ThreadStrandCard's `_span`.
String span(StrandPlan plan, int frontier) {
  final first = plan.first;
  final last = plan.last;
  if (first == null || last == null) return 'Not placed in any chapter yet';
  final reach = first == last ? 'Chapter $first' : 'Chapters $first–$last';
  if (plan.tied) return '$reach · tied off';
  if (plan.open && frontier > last) return '$reach · loose for ${plural(frontier - last, 'chapter')}';
  return reach;
}

double n2(double v) => (v * 1000).round() / 1000;

/// A number in an SVG path as JavaScript writes it: a whole one without ".0".
String f(num v) => v == v.truncateToDouble() ? '${v.toInt()}' : '$v';

String diamond(double cx, double cy, double r) =>
    'M${f(n2(cx))} ${f(n2(cy - r))} L${f(n2(cx + r))} ${f(n2(cy))} L${f(n2(cx))} ${f(n2(cy + r))} L${f(n2(cx - r))} ${f(n2(cy))} Z';

JsonMap paint(String color, double alpha) => {'color': color, 'alpha': alpha};
JsonMap stroke(String color, double alpha, double width, {bool round = false}) => {
  'color': color,
  'alpha': alpha,
  'width': width,
  if (round) 'cap': 'round',
};

/// `_drawKnot`, as shapes: `tone` the colour, `alpha` its own (the strand's).
List<JsonMap> knot(double cx, double cy, String mark, String color, double alpha) => switch (mark) {
  'introduction' => [
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 6, 'fill': paint(color, 0.2)},
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 6, 'stroke': stroke(color, alpha, 2)},
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 2.5, 'fill': paint(color, alpha)},
  ],
  'development' => [
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 4.5, 'fill': paint(color, alpha)},
  ],
  'intersection' => [
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 4, 'fill': paint(color, alpha)},
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 7, 'stroke': stroke(color, alpha, 1.2)},
  ],
  'resolution' => [
    {'shape': 'path', 'd': diamond(cx, cy, 6.5), 'fill': paint(color, alpha)},
  ],
  'appears' => [
    {'shape': 'circle', 'cx': cx, 'cy': cy, 'r': 3, 'stroke': stroke(color, alpha, 1.5)},
  ],
  'target' => [
    {'shape': 'path', 'd': diamond(cx, cy, 6), 'stroke': stroke(color, 0.8, 1.2)},
  ],
  _ => const [],
};

List<JsonMap> fray(double x, double y) => [
  for (final (dy, reach) in [(-6.0, 9.0), (-2.0, 11.0), (2.5, 8.0), (6.0, 10.0)])
    {
      'shape': 'path',
      'd': 'M${f(n2(x))} ${f(n2(y))} Q${f(n2(x + reach * 0.5))} ${f(n2(y + dy * 0.2))} ${f(n2(x + reach))} ${f(n2(y + dy))}',
      'stroke': stroke('fray', 1, 1.4, round: true),
    },
];

/// `_dashes` along a horizontal line.
List<JsonMap> dashes(double ax, double bx, double y, JsonMap paint, double on, double off) {
  final length = (bx - ax).abs();
  if (length <= 0) return const [];
  final step = (bx - ax) / length;
  return [
    for (var d = 0.0; d < length; d += on + off)
      {'shape': 'line', 'x1': n2(ax + step * d), 'y1': y, 'x2': n2(ax + step * math.min(d + on, length)), 'y2': y, 'stroke': paint},
  ];
}

/// `_StrandPainter.paint`, as shapes.
List<JsonMap> strandDrawing(StrandPlan plan, int chapterCount, int frontier, double width, [double height = 30]) {
  if (chapterCount == 0) return const [];
  final out = <JsonMap>[];
  const inset = 10.0;
  final w = width - inset * 2 - 10;
  final y = height / 2;
  double x(int chapter) => inset + w * (chapter - 0.5) / chapterCount;
  final alpha = plan.faded ? 0.5 : 1.0;
  final warp = stroke('track', 0.7, 1);
  out.add({'shape': 'line', 'x1': inset, 'y1': y, 'x2': n2(inset + w), 'y2': y, 'stroke': warp});
  final every = chapterCount > 60 ? 10 : (chapterCount > 24 ? 5 : 1);
  for (var n = 1; n <= chapterCount; n++) {
    if (n % every != 0 && n != 1) continue;
    out.add({'shape': 'line', 'x1': n2(x(n)), 'y1': y - 3, 'x2': n2(x(n)), 'y2': y + 3, 'stroke': warp});
  }
  if (frontier > 0 && frontier <= chapterCount) {
    final fx = n2(x(frontier) + w / chapterCount / 2);
    out.add({'shape': 'line', 'x1': fx, 'y1': 1, 'x2': fx, 'y2': height - 1, 'stroke': stroke('ink', 0.6, 1.5)});
  }
  if (plan.target != null && plan.target! >= 1 && plan.target! <= chapterCount) {
    out.addAll(knot(x(plan.target!), y, 'target', 'tone', alpha));
  }
  final first = plan.first;
  final last = plan.last;
  if (first == null || last == null) return out;
  final strand = stroke('tone', alpha, 3, round: true);
  if (plan.dashed) {
    out.addAll(dashes(x(first), x(last), y, strand, 6, 4));
  } else if (last > first) {
    out.add({'shape': 'line', 'x1': n2(x(first)), 'y1': y, 'x2': n2(x(last)), 'y2': y, 'stroke': strand});
  }
  if (plan.open && frontier > last && frontier <= chapterCount) {
    final end = x(frontier) + w / chapterCount / 2 - (plan.quiet ? 11 : 0);
    out.addAll(dashes(x(last), end, y, stroke('tone', 0.45, 2, round: true), 3, 4));
    if (plan.quiet) out.addAll(fray(end, y));
  }
  if (plan.gap case final gap?) {
    final a = x(gap.from) + 8;
    final b = x(gap.to) - 8;
    if (b > a) {
      final top = y - 9;
      out.add({
        'shape': 'path',
        'd': 'M${f(n2(a))} ${f(n2(y - 4))} L${f(n2(a))} ${f(n2(top))} L${f(n2(b))} ${f(n2(top))} L${f(n2(b))} ${f(n2(y - 4))}',
        'stroke': stroke('fray', 1, 1.5),
      });
    }
  }
  for (final k in plan.knots) {
    out.addAll(knot(x(k.chapter), y, k.role.name, 'tone', alpha));
  }
  if (plan.tied && plan.knots.every((k) => k.chapter != last || k.role != BeatRole.resolution)) {
    out.addAll(knot(x(last), y, 'resolution', 'tone', alpha));
  }
  return out;
}

/// `_MarkPainter.paint`, as shapes.
List<JsonMap> legendDrawing(String mark, [double width = 18, double height = 14]) {
  final cx = width / 2;
  final cy = height / 2;
  return switch (mark) {
    'frontier' => [
      {'shape': 'line', 'x1': cx, 'y1': 0, 'x2': cx, 'y2': height, 'stroke': stroke('ink', 1, 1.5)},
    ],
    'fray' => fray(cx - 5, cy),
    'gap' => [
      {'shape': 'path', 'd': 'M1 ${f(cy + 4)} L1 ${f(cy - 3)} L${f(width - 1)} ${f(cy - 3)} L${f(width - 1)} ${f(cy + 4)}', 'stroke': stroke('fray', 1, 1.5)},
    ],
    _ => knot(cx, cy, mark, 'ink', 1),
  };
}

const legend = [
  ('introduction', 'Introduced'),
  ('development', 'Develops'),
  ('intersection', 'Crosses another'),
  ('resolution', 'Resolved'),
  ('target', 'Meant to resolve'),
  ('frontier', 'Written so far'),
  ('fray', 'Gone quiet'),
  ('gap', 'Long gap'),
];

/// ThreadStrandCard's words and its strand.
JsonMap strandCard(ThreadReport report, StoryModel model, int frontier, int chapterCount) {
  final thread = report.thread;
  final people = [for (final id in thread.characterIds) ?model.entries[id]?.name];
  final targetTitle = model.nodes[thread.targetNodeId]?.title ?? '';
  final target = targetTitle.isNotEmpty ? targetTitle : '${thread.raw['targetNote'] ?? ''}'.trim();
  final plan = StrandPlan.of(report, thread.targetNodeId == null ? null : model.order.chapterNumber[thread.targetNodeId]);
  final status = threadStatusName(thread) ?? thread.statusKey;
  return {
    'threadId': thread.id,
    'title': thread.title.isEmpty ? 'Untitled thread' : thread.title,
    'kind': '${categoryName(thread)} · $status',
    'premise': thread.premise.trim().isNotEmpty ? thread.premise : null,
    'tone': castToneHex(thread.id),
    'plan': plan.toJson(),
    'semanticsLabel': chapterCount == 0 ? null : plan.describe(chapterCount, frontier),
    'noChapters': chapterCount == 0 ? 'No chapters yet: the strand is drawn across them once there are some.' : null,
    'span': chapterCount == 0 ? null : span(plan, frontier),
    'follows': people.isNotEmpty || target.isNotEmpty
        ? [if (people.isNotEmpty) people.join(', '), if (target.isNotEmpty) 'Resolves: $target'].join(' · ')
        : null,
    'developments': [
      for (final placed in report.beats)
        {
          'text': '${beatPlace(placed)} · ${placed.beat.title.isEmpty ? '(appears)' : placed.beat.title}',
          'struck': placed.missing,
        },
    ],
    'noDevelopments': report.beats.isEmpty ? 'No developments recorded yet.' : null,
    'issues': [for (final i in report.issues) i.message],
    'drawing360': strandDrawing(plan, chapterCount, frontier, 360),
    'drawing900': strandDrawing(plan, chapterCount, frontier, 900),
  };
}

// ------------------------------------------------------------------------------------------- threads_page.dart

typedef Filters = ({String query, String? status, String? category, bool onlyFlagged});

JsonMap threadsView(StoryModel model, String novelTitle, Filters f, String grouping, int quietAfter) {
  final report = diagnose([...model.threads.values], [...model.nodes.values], quietAfter);
  final needle = foldText(f.query.trim());
  final visible = stableSorted([
    for (final r in report.reports)
      if ((f.category == null || r.thread.category == f.category) &&
          (f.status == null || r.thread.statusKey == f.status) &&
          (!f.onlyFlagged || r.issues.isNotEmpty) &&
          (needle.isEmpty ||
              [
                r.thread.title,
                r.thread.premise,
                categoryName(r.thread),
                ...r.thread.beats.map((b) => b.title),
              ].any((t) => foldText(t).contains(needle))))
        r,
  ], (a, b) => localeCompare(a.thread.title, b.thread.title));
  final groups = <({String key, String heading, List<ThreadReport> items})>[];
  if (grouping == 'status') {
    for (final key in threadStatusOrder) {
      groups.add((
        key: key,
        heading: threadStatusLabels[key]!,
        items: [
          for (final r in visible)
            if (r.thread.statusKey == key) r,
        ],
      ));
    }
  } else if (grouping == 'category') {
    int rank(String name) {
      final i = threadCategories.indexWhere((c) => threadCategoryLabels[c] == name);
      return i == -1 ? threadCategories.length : i;
    }

    final names = stableSorted({for (final r in visible) categoryName(r.thread)}, (a, b) {
      final byRank = rank(a) - rank(b);
      return byRank != 0 ? byRank : localeCompare(a, b);
    });
    for (final name in names) {
      groups.add((
        key: name,
        heading: name,
        items: [
          for (final r in visible)
            if (categoryName(r.thread) == name) r,
        ],
      ));
    }
  } else {
    final cast0 = stableSorted({
      for (final r in visible)
        for (final id in r.thread.characterIds) ?model.entries[id],
    }, (a, b) => localeCompare(a.name, b.name));
    for (final c in cast0) {
      groups.add((
        key: c.id,
        heading: c.name,
        items: [
          for (final r in visible)
            if (r.thread.characterIds.contains(c.id)) r,
        ],
      ));
    }
    groups.add((
      key: 'nobody',
      heading: 'No character attached',
      items: [
        for (final r in visible)
          if (!r.thread.characterIds.any(model.entries.containsKey)) r,
      ],
    ));
  }
  final flagged = stableSorted([
    for (final r in report.reports)
      if (r.issues.isNotEmpty) r,
  ], (a, b) => localeCompare(a.thread.title, b.thread.title));
  final active = report.reports.where((r) => r.thread.statusKey == 'active').length;
  final total = report.reports.length;
  return {
    'subtitle':
        '$novelTitle · ${plural(total, 'thread')}'
        '${total > 0 ? ' · $active active' : ''}'
        '${flagged.isNotEmpty ? ' · ${flagged.length} to check' : ''}',
    'flagged': [
      for (final r in flagged)
        for (final i in r.issues) {'threadId': r.thread.id, 'title': r.thread.title, 'message': i.message},
    ],
    'empty': total == 0,
    'noResults': total > 0 && visible.isEmpty,
    'showLegend': total > 0 && report.chapterCount > 0,
    'groups': [
      for (final g in groups)
        if (g.items.isNotEmpty)
          {
            'key': g.key,
            'label': '${g.heading}  ${g.items.length}',
            'items': [for (final r in g.items) r.thread.id],
          },
    ],
    'statusChoices': [
      {'value': '', 'label': 'Any status'},
      for (final s in threadStatusOrder) {'value': s, 'label': threadStatusLabels[s]},
    ],
    'categoryChoices': [
      {'value': '', 'label': 'Any category'},
      for (final c in threadCategories)
        if (report.reports.any((r) => r.thread.category == c)) {'value': c, 'label': threadCategoryLabels[c]},
    ],
    'footer': total == 0
        ? null
        : '${report.frontier > 0 ? 'The manuscript has words up to chapter ${report.frontier} of ${report.chapterCount}; quiet threads are measured against that.' : 'Quiet threads are measured against the last chapter that has words. Nothing is written yet, so only gaps between developments are flagged.'}'
              '${visible.length != total ? ' Showing ${visible.length} of $total threads.' : ''}',
  };
}

// ------------------------------------------------------------------------------------------- thread_page.dart

String indent(TreeItem t) => '${'  ' * t.depth}${t.node.title.isEmpty ? 'Untitled' : t.node.title}';

JsonMap threadPage(StoryModel model, String threadId) {
  final thread = model.threads[threadId];
  if (thread == null) {
    return {
      'missing': true,
      'title': 'This thread is not here',
      'message': 'It may have been deleted. Plot threads lists every thread the novel has.',
      'action': 'Open Plot threads',
      'actionPath': '/plan/threads',
    };
  }
  final id = thread.id;
  final report = diagnose([thread], [...model.nodes.values]).reports.single;
  final others = stableSorted([
    for (final t in model.threads.values)
      if (t.id != id) t,
  ], (a, b) => localeCompare(a.title, b.title));
  final tree = flattenTree(buildTree([...model.nodes.values]));
  final documents = [
    for (final t in tree)
      if (t.node.kind == NodeKind.chapter || t.node.kind == NodeKind.scene) t,
  ];
  final status = thread.statusKey;
  final characters = stableSorted([
    for (final e in model.entries.values)
      if (e.category == 'character') e,
  ], (a, b) => localeCompare(a.name, b.name));
  final locations = stableSorted(
    model.entries.values.where((e) => e.category == 'location'),
    (a, b) => localeCompare(a.name, b.name),
  );
  final documentChoices = [
    for (final t in documents) {'value': t.node.id, 'label': indent(t)},
  ];
  return {
    'missing': false,
    'title': thread.title.isEmpty ? 'Untitled thread' : thread.title,
    'subtitle': '${threadStatusName(thread) ?? status} · ${categoryName(thread)}',
    'checks': report.issues.isEmpty
        ? null
        : {
            'title': 'Things to check',
            'lines': [for (final i in report.issues) '• ${i.message}'],
          },
    'category': {
      'value': threadCategories.contains(thread.category) ? thread.category : 'subplot',
      'choices': [
        for (final c in threadCategories) {'value': c, 'label': threadCategoryLabels[c]},
      ],
    },
    'status': {
      'value': threadStatuses.contains(status) ? status : 'planned',
      'choices': [
        for (final s in threadStatuses) {'value': s, 'label': threadStatusLabels[s]},
      ],
    },
    'customStatus': status == 'custom' ? thread.customStatus ?? '' : null,
    'customCategory': thread.category == 'custom' ? str(thread.raw['customCategory']) : null,
    'premise': thread.premise,
    'characters': {
      'chosen': thread.characterIds,
      'options': [
        for (final c in characters) {'value': c.id, 'label': c.name},
      ],
    },
    'locations': {
      'chosen': thread.locationIds,
      'options': [
        for (final e in locations) {'value': e.id, 'label': e.name},
      ],
    },
    'target': {
      'value': model.nodes.containsKey(thread.targetNodeId) ? thread.targetNodeId : '',
      'choices': [
        {'value': '', 'label': 'Not decided'},
        for (final t in tree) {'value': t.node.id, 'label': indent(t)},
      ],
      'note': str(thread.raw['targetNote']),
    },
    'caption': report.beats.isEmpty
        ? 'Record each step this thread takes and the chapter it happens in: a setup, a clue, a reversal, the payoff.'
        : null,
    'beats': [
      for (final (i, placed) in report.beats.indexed)
        () {
          final beat = placed.beat;
          final name = 'development ${i + 1}';
          final role = roleKey(beat);
          final crossing = [for (final id in beat.withThreadIds) ?model.threads[id]];
          return {
            'beatId': beat.id,
            'name': name,
            'place': beatPlace(placed),
            'struck': placed.missing,
            'node': {
              'label': 'Chapter for $name',
              'value': placed.missing ? '\u0000gone' : (beat.nodeId ?? ''),
              'choices': [
                {'value': '', 'label': 'Not placed yet'},
                if (placed.missing) {'value': '\u0000gone', 'label': 'A chapter that was removed'},
                ...documentChoices,
              ],
            },
            'role': {'label': 'Role of $name', 'value': beatRoles.contains(role) ? role : 'development'},
            'crosses': role == 'intersection'
                ? {
                    'chosen': [for (final t in crossing) t.id],
                    'options': [
                      for (final t in others) {'value': t.id, 'label': t.title},
                    ],
                  }
                : null,
            'title': {'label': 'Title of $name', 'value': beat.title},
            'note': {'label': 'Note for $name', 'value': beat.note},
            'open': placed.node == null ? null : {'label': 'Open ${nodeLabel(model, placed.node!.id)}', 'nodeId': placed.node!.id},
            'consequencesTip': 'What depends on $name?',
            'removeTip': 'Remove $name',
          };
        }(),
    ],
    'newBeatNode': [
      {'value': '', 'label': documents.isEmpty ? 'No chapters yet' : 'Not placed yet'},
      ...documentChoices,
    ],
    'roleChoices': [
      for (final r in beatRoles) {'value': r, 'label': beatRoleLabels[r]},
    ],
    'board': '/plan/board?thread=$id',
    'notes': str(thread.raw['notes']),
    'muted': {
      'label': 'Don’t flag this thread${report.silenced > 0 ? ' (${report.silenced} held back)' : ''}',
      'value': thread.raw['muted'] == true,
    },
    'deleteDialog': () {
      final title = thread.title.isEmpty ? 'Untitled thread' : thread.title;
      final beats = thread.beats.length;
      return {
        'title': 'Delete $title?',
        'message':
            'It and its $beats ${beats == 1 ? 'development' : 'developments'} go. Chapters, scenes and entries are not changed; events stop belonging to it. You can undo this.',
      };
    }(),
  };
}

// ------------------------------------------------------------------------------------------- board_page.dart

const roleWords = {
  'introduction': 'introduced',
  'development': 'develops',
  'intersection': 'crosses',
  'resolution': 'resolved',
  'appears': 'appears',
};

String title(StoryNode n) => n.title.isEmpty ? 'Untitled' : n.title;
String pathLabel(List<StoryNode> path) => path.map((n) => n.title).join(' › ');

JsonMap partsOut(List<BoardPart> parts) => {
  'parts': [
    for (final p in parts)
      {
        'key': p.key,
        'columns': [
          for (final c in p.columns)
            {
              'chapter': c.chapter.id,
              'words': c.words,
              'scenes': [for (final s in c.scenes) s.node.id],
            },
        ],
      },
  ],
};

JsonMap boardView(StoryModel model, ({String text, NodeStatus? status, String? threadId}) f) {
  final all = [...model.nodes.values];
  final parts = boardOf(all);
  final thread = f.threadId == null ? null : model.threads[f.threadId];
  final threadNodes = thread == null ? null : {for (final p in placesOf(thread, model)) p.nodeId};
  final filter = BoardFilter(status: f.status, text: f.text, nodeIds: threadNodes);
  final shown = filterBoard(parts, filter);
  final chapters = all.where((n) => n.kind == NodeKind.chapter).length;
  final scenes = all.where((n) => n.kind == NodeKind.scene).length;
  final groups = all.where((n) => n.kind?.isGroup == true).length;
  final words = buildTree(all).fold(0, (n, t) => n + t.totalWords);
  final threads = stableSorted(model.threads.values, (a, b) => localeCompare(a.title, b.title));
  return {
    'subtitle': '${plural(chapters, 'chapter')} · ${plural(scenes, 'scene')} · ${plural(words, 'word')}',
    'shown': partsOut(shown),
    'filtered': filter.filtered,
    'filteredNote': filter.filtered ? 'Moving is off while the board is filtered, so nothing lands where you cannot see it.' : null,
    'showTitles': groups > 0,
    'thread': thread == null || threadNodes == null
        ? null
        : 'Showing where “${thread.title}” is recorded: '
              '${plural(threadNodes.length, 'chapter or scene', 'chapters and scenes')}, from its '
              'developments and the events that belong to it.',
    'threadChoices': threads.isEmpty
        ? null
        : [
            {'value': '', 'label': 'Every plot thread'},
            for (final t in threads) {'value': t.id, 'label': t.title},
          ],
    'empty': chapters == 0 && groups == 0
        ? 'No chapters yet'
        : shown.isEmpty
        ? 'Nothing matches'
        : null,
    'heads': [
      for (final part in shown)
        {
          'kind': part.path.isNotEmpty ? (part.path.last.kind?.label ?? '').toUpperCase() : null,
          'label': part.path.isEmpty ? 'Not in a volume, act or arc' : pathLabel(part.path),
          'empty': part.columns.isEmpty ? (filter.filtered ? 'Nothing here matches.' : 'No chapters here yet.') : null,
          'end': {
            'place': {'parentId': part.parentId, 'beforeId': part.columns.isEmpty ? null : part.endBeforeId},
            'label':
                'Drop here to move it to the end of ${part.path.isEmpty ? 'this run of chapters' : '“${part.path.isEmpty ? 'Not in a volume, act or arc' : pathLabel(part.path)}”'}',
          },
        },
    ],
  };
}

/// Every card of the whole board: its moves, its controls and its thread chips.
JsonMap cards(StoryModel model) {
  final all = [...model.nodes.values];
  final parts = boardOf(all);
  final groups = [...all.where((n) => n.kind?.isGroup == true)];
  final orderedChapters = [
    for (final p in parts)
      for (final c in p.columns) c.chapter,
  ];
  final threadsHere = threadsByNode(model);
  JsonMap chips(StoryNode node) {
    final here = threadsHere[node.id] ?? const <ThreadHere>[];
    final addable = stableSorted(
      model.threads.values.where((t) => !here.any((h) => h.thread.id == t.id)),
      (a, b) => localeCompare(a.title, b.title),
    );
    if (here.isEmpty && addable.isEmpty) return {'none': true};
    final name = title(node);
    return {
      'chips': [
        for (final h in here)
          {
            'label':
                '${h.thread.title} · ${[for (final r in h.roles) roleWords[r] ?? r, if (h.events > 0) plural(h.events, 'event')].join(', ')}',
            'tip': 'Open ${h.thread.title}',
            'remove': h.plainIds.isNotEmpty && h.roles.length == 1 && h.events == 0
                ? {'tip': 'Take $name out of ${h.thread.title}', 'ids': h.plainIds}
                : null,
          },
      ],
      'add': addable.isEmpty
          ? null
          : {
              'tip': 'Add $name to a plot thread',
              'threads': [for (final t in addable) t.id],
            },
    };
  }

  return {
    'chapters': [
      for (final p in parts)
        for (final column in p.columns)
          () {
            final chapter = column.chapter;
            final siblings = siblingsOf(all, chapter.parentId);
            final at = siblings.indexWhere((n) => n.id == chapter.id);
            final homes = [
              null,
              ...groups,
            ].where((g) => (g?.id) != chapter.parentId && moveError(all, chapter.id, g?.id) == null).toList();
            final sceneCount = all.where((n) => n.parentId == chapter.id && n.kind == NodeKind.scene).length;
            final name = title(chapter);
            return {
              'name': name,
              'meta': '${plural(column.words, 'word')} · ${plural(sceneCount, 'scene')}',
              'earlier': {'tip': 'Move $name earlier', 'enabled': at > 0},
              'later': {'tip': 'Move $name later', 'enabled': at != siblings.length - 1},
              'into': groups.isNotEmpty && homes.isNotEmpty
                  ? {
                      'tip': 'Move $name into',
                      'homes': [
                        for (final g in homes)
                          {
                            'value': g?.id,
                            'label': g == null
                                ? 'The top level'
                                : '${g.kind?.label ?? 'Group'}: ${pathLabel(pathTo(all, g.id))}',
                          },
                      ],
                    }
                  : null,
              'sceneEnd': 'Drop here to move it to the end of “$name”',
              'addScene': 'Add a scene to $name',
              'controls': {'open': 'Open $name', 'planTip': 'Plan for $name', 'status': chapter.status.key},
              'chips': chips(chapter),
              'scenes': [
                for (final card in column.scenes)
                  () {
                    final node = card.node;
                    final siblings = siblingsOf(all, node.parentId);
                    final at = siblings.indexWhere((n) => n.id == node.id);
                    final name = title(node);
                    final others = [
                      for (final c in orderedChapters)
                        if (c.id != node.parentId) c,
                    ];
                    return {
                      'name': name,
                      'meta': plural(card.words, 'word'),
                      'earlier': {'tip': 'Move $name earlier', 'enabled': at > 0},
                      'later': {'tip': 'Move $name later', 'enabled': at != siblings.length - 1},
                      'toChapter': others.isEmpty
                          ? null
                          : {
                              'tip': 'Move $name to chapter',
                              'chapters': [
                                for (final c in others) {'value': c.id, 'label': title(c)},
                              ],
                            },
                      'controls': {'open': 'Open $name', 'planTip': 'Plan for $name', 'status': node.status.key},
                      'chips': chips(node),
                    };
                  }(),
              ],
            };
          }(),
    ],
  };
}

/// `nudge` and the bulk dialog, for every chapter and scene.
JsonMap moves(StoryModel model) {
  final all = [...model.nodes.values];
  final groups = [...all.where((n) => n.kind?.isGroup == true)];
  JsonMap? nudge(StoryNode node, int by) {
    final siblings = siblingsOf(all, node.parentId);
    final at = siblings.indexWhere((n) => n.id == node.id);
    if (by < 0 && at <= 0) return null;
    if (by > 0 && at == siblings.length - 1) return null;
    final before = by < 0 ? siblings[at - 1] : (at + 2 < siblings.length ? siblings[at + 2] : null);
    return {'parentId': node.parentId, 'beforeId': before?.id};
  }

  JsonMap? bulk(StoryNode node, Place drop) {
    final b = bulkOf(all, node.id, drop);
    if (b == null) return null;
    final where = drop.parentId == null
        ? 'to the top level'
        : 'into “${all.where((n) => n.id == drop.parentId).firstOrNull?.title ?? ''}”';
    return {
      'title': 'Move a chapter with its scenes',
      'message':
          'Move “${title(node)}” and its ${plural(b.scenes, 'scene')} (${plural(b.words, 'word')}) $where? '
          'Everything inside it goes with it, and you can undo this.',
    };
  }

  return {
    for (final n in all)
      if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene)
        n.id: {
          'earlier': nudge(n, -1),
          'later': nudge(n, 1),
          'bulk': [
            for (final g in [null, ...groups]) bulk(n, (parentId: g?.id, beforeId: null)),
          ],
        },
  };
}

/// The board's history: twenty-five status changes remembered (the oldest dropped), then each undo line.
JsonMap history(StoryModel model) {
  final all = [...model.nodes.values];
  final docs = [
    for (final n in all)
      if (n.kind == NodeKind.chapter || n.kind == NodeKind.scene) n,
  ];
  if (docs.isEmpty) return {'none': true};
  final kept = <BoardChange>[];
  final said = <String>[];
  for (var i = 0; i < 25; i++) {
    final n = docs[i % docs.length];
    final to = NodeStatus.values[i % NodeStatus.values.length];
    kept.add(StatusChange(n.id, n.title, n.status, to));
    if (kept.length > 20) kept.removeAt(0);
    said.add(boardChangeWords(kept.last, all));
  }
  final first = docs.first;
  final from = placeOf(all, first.id)!;
  kept.add(MoveChange(first.id, first.title, from, from));
  if (kept.length > 20) kept.removeAt(0);
  said.add(boardChangeWords(kept.last, all));
  final undone = <JsonMap>[];
  while (kept.isNotEmpty) {
    final last = kept.last;
    undone.add({
      'label': 'Undo ${last is MoveChange ? 'move' : 'status'} of “${last.title}”',
      'problem': undoProblem(all, last),
      'words': boardChangeWords(last, all),
    });
    kept.removeLast();
  }
  return {'said': said, 'undone': undone};
}

// ------------------------------------------------------------------------------------------- chapter_plan_page.dart

const placeholders = {
  'objective': 'Why this exists: what it must accomplish for the story.',
  'conflict': 'Who wants what, and what stands in the way.',
  'emotionalArc': 'Where the reader starts and ends emotionally.',
  'dialogue': 'Lines or exchanges you want to land.',
  'foreshadowing': 'What to plant now for later.',
  'reveals': 'What the reader learns here.',
  'openQuestions': 'What should be left hanging.',
  'ending': 'The resolution, turn or cliffhanger to end on.',
};
const dynamics = ['conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions'];

JsonMap labelPicker(List<String> labels, List<String> used, String of) {
  final offered = <String>[];
  for (final l in [...suggestedLabels, ...used]) {
    final taken = [...labels, ...offered].any((x) => x.toLowerCase() == l.toLowerCase());
    if (!taken) offered.add(l);
  }
  return {
    'labels': [
      for (final l in labels) {'label': l, 'removeTip': 'Remove the label $l'},
    ],
    'none': labels.isEmpty ? 'None' : null,
    'addTip': of.isEmpty ? 'Add a label' : 'Add a label to $of',
    'offered': offered,
  };
}

JsonMap planPage(StoryModel model, NovelSnapshot snapshot, String nodeId) {
  final node = model.nodes[nodeId];
  if (node == null || (node.kind != NodeKind.chapter && node.kind != NodeKind.scene)) {
    return {'missing': true};
  }
  final id = node.id;
  final plan = model.plans[id];
  final kind = node.kind?.label.toLowerCase() ?? 'chapter';
  final here = 'this $kind';
  final title0 = node.title.isEmpty ? 'Untitled' : node.title;
  JsonMap field(String f) => {'field': f, 'label': planLabels[f], 'hint': placeholders[f], 'value': str(plan?.raw[f])};
  final categories = categoriesOf(snapshot);
  final entries = stableSorted(model.entries.values, (a, b) => localeCompare(a.name, b.name));
  final inText = stableSorted([
    for (final m in node.mentions) ?model.entries[m],
  ], (a, b) => localeCompare(a.name, b.name));
  final events = [
    for (final e in model.events.values)
      if (e.nodeIds.contains(id)) e,
  ];
  final threads = threadsByNode(model)[id] ?? const <ThreadHere>[];
  final current = NodeStatus.values.indexOf(node.status);
  final beats = plan == null ? const <JsonMap>[] : [for (final b in maps(plan.raw['beats'])) b];
  // Who appears here.
  final characters = stableSorted([
    for (final e in model.entries.values)
      if (e.category == 'character') e,
  ], (a, b) => localeCompare(a.name, b.name));
  JsonMap? appearances() {
    if (characters.isEmpty) return null;
    final byId = {for (final c in characters) c.id: c};
    List<String> known(List<String> ids) => [
      for (final id in ids)
        if (byId.containsKey(id)) id,
    ];
    final appear = known(plan?.appearIds ?? const []);
    final mention = known(plan?.mentionIds ?? const []);
    final pov = known(plan?.povIds ?? const []);
    final recorded = {...appear, ...mention};
    final linked = [
      for (final id in node.mentions)
        if (byId.containsKey(id) && !recorded.contains(id)) id,
    ];
    final here = 'this ${node.kind?.label.toLowerCase() ?? 'chapter'}';
    List<JsonMap> options(String field, List<String> ids) => [
      for (final c in characters)
        {
          'value': c.id,
          'label': field != 'povIds' && recorded.contains(c.id) && !ids.contains(c.id)
              ? '${c.name} (moves from the other list)'
              : c.name,
        },
    ];
    JsonMap list(String title, List<String> ids, String field) => {
      'field': field,
      'label': title,
      'chosen': ids,
      'options': options(field, ids),
      'addTip': 'Add to $title',
    };
    return {
      'caption':
          'Your record of who is on the page in $here, who is only mentioned, and whose point of view it is told '
          'from. The Character appearances view shows these; a character with no record is “not recorded”, not '
          'absent.',
      'lists': [
        list('Appears', appear, 'appearIds'),
        list('Mentioned, not on the page', mention, 'mentionIds'),
        list('Point of view', pov, 'povIds'),
      ],
      'linked': [
        for (final id in linked)
          {
            'id': id,
            'name': byId[id]!.name,
            'appears': 'Record ${byId[id]!.name} as appearing in $here',
            'mentioned': 'Record ${byId[id]!.name} as mentioned in $here',
          },
      ],
    };
  }

  return {
    'title': 'Plan: $title0',
    'subtitle': node.kind?.label,
    'consequences': 'What depends on this ${node.kind?.label.toLowerCase() ?? 'chapter'}?',
    'steps': [
      for (final (i, s) in NodeStatus.values.indexed) {'status': s.key, 'selected': s == node.status, 'done': i < current},
    ],
    'objective': field('objective'),
    'summary': {'hint': 'What happens in $here, in a sentence or two.', 'value': node.summary},
    'labels': labelPicker(plan?.labels ?? const [], usedLabels(model), here),
    'beats': [
      for (final (i, b) in beats.indexed)
        {
          'id': str(b['id']),
          'text': str(b['text']),
          'label': 'Beat ${i + 1}',
          'up': i == 0 ? null : 'Move beat ${i + 1} up',
          'down': i == beats.length - 1 ? null : 'Move beat ${i + 1} down',
          'remove': 'Remove beat ${i + 1}',
        },
    ],
    'entities': entries.isEmpty
        ? 'Create characters, and places and items under World, to attach them here.'
        : {
            'chosen': [
              for (final e in plan?.entityIds ?? const <String>[])
                if (model.entries.containsKey(e)) e,
            ],
            'options': [
              for (final e in entries) {'value': e.id, 'label': '${e.name} · ${categories[e.category]?.singular ?? e.category}'},
            ],
          },
    'inText': [
      for (final e in inText) {'id': e.id, 'name': e.name, 'character': e.category == 'character'},
    ],
    'appearances': appearances(),
    'dynamics': [for (final f in dynamics) field(f)],
    'ending': field('ending'),
    'serial': node.kind == NodeKind.chapter ? [str(node.raw['noteBefore']), str(node.raw['noteAfter'])] : null,
    'events': {
      'caption': events.isEmpty ? 'No timeline events are linked to $here yet.' : null,
      'items': [
        for (final e in events) {'id': e.id, 'name': e.name.isEmpty ? 'Untitled event' : e.name},
      ],
    },
    'threads': {
      'caption': threads.isEmpty ? 'No plot threads develop in $here yet.' : null,
      'items': [
        for (final h in threads)
          {
            'id': h.thread.id,
            'title': h.thread.title.isEmpty ? 'Untitled thread' : h.thread.title,
            'beats': () {
              final titles = [
                for (final b in h.thread.beats)
                  if (b.nodeId == id && b.title.trim().isNotEmpty) b.title,
              ];
              return titles.isEmpty ? null : titles.join(', ');
            }(),
          },
      ],
    },
    'notes': node.raw['notes'] is String ? node.raw['notes']! as String : '',
  };
}

// ------------------------------------------------------------------------------------------- changes

class Novel {
  Novel(this.snapshot);
  NovelSnapshot snapshot;
  var clock = 1000;
  var ids = 0;

  Object? act(Object? Function(PlotChanges c) change) {
    final c = PlotChanges(snapshot, now: ++clock, createId: () => 'id${++ids}');
    try {
      final result = change(c);
      snapshot = c.snapshot;
      return {'ok': result};
    } on ChangeRefused catch (e) {
      return {'refused': e.message};
    }
  }
}

/// widgets/story_questions.dart's askTheQuestions, on a change.
int askTheQuestions(PlotChanges x, List<(({String asks, String hint, String category}), String)> lines) {
  final asked = [
    for (final (q, text) in lines)
      if (text.trim().isNotEmpty) (q, text.trim()),
  ];
  for (final (q, text) in asked) {
    final id = x.createThread(RegExp(r'[?!.…]$').hasMatch(text) ? text : '$text?');
    x.updateThread(id, (_) => {'category': q.category});
  }
  return asked.length;
}

const storyQuestions = [
  (asks: 'The question the whole book answers', hint: 'Will Ren master his deadly skill?', category: 'main'),
  (asks: 'A mystery the reader wants solved', hint: 'Who sealed the SSS rank, and why?', category: 'mystery'),
  (asks: 'Who might fall for whom', hint: 'Will Ilse forgive him?', category: 'romance'),
  (asks: 'What someone is hiding', hint: 'What is the Grey Abbot not saying?', category: 'villain'),
];

JsonMap changes(NovelSnapshot s) {
  final n = Novel(s);
  final model = StoryModel.fromSnapshot(s);
  final docs = [
    for (final x in model.nodes.values)
      if (x.kind == NodeKind.chapter || x.kind == NodeKind.scene) x.id,
  ];
  final groupId = model.nodes.values.where((x) => x.kind?.isGroup == true).firstOrNull?.id;
  final character = model.entries.values.where((e) => e.category == 'character').firstOrNull?.id;
  final location = model.entries.values.where((e) => e.category == 'location').firstOrNull?.id;
  final other = model.entries.values.where((e) => e.category != 'character' && e.category != 'location').firstOrNull?.id;
  final existing = model.threads.keys.firstOrNull;
  final doc = docs.firstOrNull;
  final doc2 = docs.length > 1 ? docs[1] : null;
  final steps = <Object?>[];
  void step(Object? r) => steps.add(r);

  step(n.act((x) => x.createThread()));
  step(n.act((x) => x.createThread('  The stolen key  ')));
  step(n.act((x) => askTheQuestions(x, [
        (storyQuestions[0], 'Can Ren survive'),
        (storyQuestions[1], '  '),
        (storyQuestions[2], 'Will she forgive him?'),
        (storyQuestions[3], 'What is hidden…'),
      ])));
  final key = 'id2';
  step(n.act((x) => x.updateThread(key, (_) => {
        'title': '   ',
        'premise': 'Who took it?',
        'notes': 'n',
        'targetNote': 'the end',
        'customCategory': 'x' * 70,
        'muted': true,
        'category': 'mystery',
        'status': 'active',
        'customStatus': 'y' * 50,
        'characterIds': [character, character, location, 'nope', 3],
        'locationIds': [location, character],
        'targetNodeId': groupId ?? doc,
      })));
  step(n.act((x) => x.updateThread(key, (_) => {'category': 'nonsense', 'status': 'nonsense', 'targetNodeId': 'nope'})));
  step(n.act((x) => x.updateThread('nope', (_) => {'title': 'x'})));
  step(n.act((x) => x.addBeat(key, title: '  Missing  ', nodeId: doc, role: 'introduction', note: 'n')));
  step(n.act((x) => x.addBeat(key, nodeId: doc2, role: 'appears')));
  step(n.act((x) => x.addBeat(key, title: '', nodeId: groupId, role: 'odd')));
  step(n.act((x) => x.addBeat(key, title: 'Crossed', nodeId: 'nope', role: 'intersection', withThreadIds: ['id1', key, 'nope', existing, 'id1'])));
  step(n.act((x) => x.addBeat('nope', title: 'x')));
  final beats = [for (final b in maps(n.snapshot.rows('plotThreads').firstWhere((r) => r['id'] == key)['beats'])) b['id'] as String];
  step(n.act((x) => x.updateBeat(key, beats[0], {'title': '   ', 'nodeId': null})));
  step(n.act((x) => x.updateBeat(key, beats[1], {'title': '  ', 'role': 'appears', 'note': 'here'})));
  step(n.act((x) => x.updateBeat(key, beats[2], {'nodeId': doc2, 'withThreadIds': ['id1'], 'role': 'bogus', 'title': ' New '})));
  step(n.act((x) => x.removeBeat(key, beats[3])));
  step(n.act((x) => x.removeBeat(key, 'nope')));
  if (doc != null) {
    step(n.act((x) => x.updatePlan(doc, (stored) => {
          'objective': 'Get inside',
          'conflict': 5,
          'beats': [
            {'text': 'one'},
            {'id': 'b2', 'text': '  '},
            {'id': '', 'text': 'three'},
            {'id': 'b4', 'text': 'four'},
          ],
          'entityIds': [character, other, 'nope'],
          'labels': ['  action ', 'Mine', 'mine', 'x' * 50, 7],
          'appearIds': [character, location],
          'povIds': [character],
        })));
    step(n.act((x) => x.updatePlan(doc, (stored) => {'mentionIds': [character], 'labels': null})));
    step(n.act((x) => x.updateNode(doc, summary: 'They reach it.', status: NodeStatus.revising, noteBefore: 'Hi', noteAfter: 'Bye')));
    step(n.act((x) => x.updateNode(doc, notes: 'scratch')));
  }
  if (groupId != null) step(n.act((x) => x.updatePlan(groupId, (_) => {'objective': 'x'})));
  step(n.act((x) => x.updatePlan('nope', (_) => {'objective': 'x'})));
  step(n.act((x) => x.updateNode('nope', summary: 'x')));
  return {
    'steps': steps,
    'threads': n.snapshot.rows('plotThreads'),
    'plans': n.snapshot.rows('chapterPlans'),
    'chapters': [
      for (final r in n.snapshot.rows('chapters'))
        if (r['id'] == doc || r['id'] == groupId) r,
    ],
  };
}

// ------------------------------------------------------------------------------------------- the dump

JsonMap novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final title0 = str(s.project['title']);
  final threads = [...model.threads.values];
  final firstStatus = model.nodes.values.where((n) => n.kind == NodeKind.chapter).firstOrNull?.status;
  final firstCategory = threads.firstOrNull?.category;
  final filterSets = <Filters>[
    (query: '', status: null, category: null, onlyFlagged: false),
    (query: 'the', status: null, category: null, onlyFlagged: false),
    (query: '', status: 'active', category: null, onlyFlagged: false),
    (query: '', status: null, category: firstCategory, onlyFlagged: false),
    (query: '', status: null, category: null, onlyFlagged: true),
  ];
  return {
    for (final grouping in ['status', 'category', 'character'])
      'threads.$grouping': [
        for (final f in filterSets)
          for (final q in [5, 20]) threadsView(model, title0, f, grouping, q),
      ],
    'loom': () {
      final report = diagnose(threads, [...model.nodes.values]);
      return [for (final r in report.reports) strandCard(r, model, report.frontier, report.chapterCount)];
    }(),
    'loom5': () {
      final report = diagnose(threads, [...model.nodes.values], 5);
      return [
        for (final r in report.reports)
          strandCard(r, model, report.frontier, report.chapterCount)..removeWhere((k, _) => k == 'drawing900'),
      ];
    }(),
    'threadPages': [for (final t in threads) threadPage(model, t.id), threadPage(model, 'nope')],
    'board.none': boardView(model, (text: '', status: null, threadId: null)),
    'board.text': boardView(model, (text: 'a', status: null, threadId: null)),
    'board.status': boardView(model, (text: '', status: firstStatus, threadId: null)),
    'board.thread': boardView(model, (text: '', status: null, threadId: threads.firstOrNull?.id)),
    'cards': cards(model),
    'moves': moves(model),
    'history': history(model),
    'plans': [
      for (final n in model.nodes.values) planPage(model, s, n.id),
      planPage(model, s, 'nope'),
    ],
    'changes': changes(s),
  };
}

/// `base`: a novel to start from; its threads are cleared for the questions an empty list asks.
JsonMap misc(NovelSnapshot base) {
  final empty = base.withRows('plotThreads', const []);
  final asked = Novel(empty);
  final count = asked.act((x) => askTheQuestions(x, [
        for (final (i, q) in storyQuestions.indexed) (q, ['Can Ren survive the SSS rank', 'Who made the first skill?', '', '  Why? '][i]),
      ]));
  return {
    'legend': [
      for (final (mark, text) in legend) {'mark': mark, 'text': text, 'drawing': legendDrawing(mark)},
    ],
    'asked': {
      'count': count,
      'threads': [
        for (final r in asked.snapshot.rows('plotThreads')) {'title': r['title'], 'category': r['category']},
      ],
    },
    'cleanLabels': [
      for (final l in [
        ['  action ', 'Mine', 'mine', 'x' * 50, 7, 'Quiet   moment', 'mystery CLUE', ''],
        [for (var i = 0; i < 20; i++) 'L$i'],
        'not a list',
      ])
        cleanLabels(l),
    ],
    'labelOrder': labelOrder(['zeta', 'Dialogue', 'alpha', 'Action', 'Beta', 'action', 'Quiet moment']),
    'pickers': [
      labelPicker(const [], const [], ''),
      labelPicker(const ['action', 'Mine'], const ['mine', 'Theirs', 'Romance'], 'this scene'),
    ],
    'statusNames': [
      for (final raw in [
        {'status': 'custom', 'customStatus': '  Dormant '},
        {'status': 'custom', 'customStatus': '  '},
        {'status': 'active'},
        {'status': 'weird'},
        {},
      ])
        threadStatusName(PlotThread({'id': 't', ...raw})),
    ],
    'categoryNames': [
      for (final raw in [
        {'category': 'custom', 'customCategory': ' Heist '},
        {'category': 'custom', 'customCategory': ''},
        {'category': 'political'},
        {'category': 'odd'},
        {},
      ])
        categoryName(PlotThread({'id': 't', ...raw})),
    ],
  };
}

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
  out['misc'] = misc(NovelSnapshot.fromJson(jsonDecode(File(args.last).readAsStringSync()) as JsonMap));
  File(args.first).writeAsStringSync(jsonEncode(out));
}
