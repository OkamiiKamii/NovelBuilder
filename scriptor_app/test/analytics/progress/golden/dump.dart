// The Flutter app's own outputs for the Progress page (progress.golden.json pins them; outputs.ts makes Scriptor's,
// keyed and shaped the same way). For every novel given, read at noon on October 25, 2026, with its own writing log
// and goals, and again with a made-up log and goals: the progress report, the journal, and what the page says and
// draws (the head, the journal hero, the shelf, the year, the seals, the tiles, the chart, the statuses, deadlines,
// tasks, recent sessions); and a script of goal changes with its refusals. And `misc`: lengths of fiction, numbers.
//
// The page's logic lives in Flutter widgets (progress_page.dart, journal_view.dart, length_shelf.dart, bars.dart); it is
// copied here word for word, and the domain under it (progress.dart, journal.dart, goal_changes.dart) is run as it is.
//
// Run from a scratch dir holding the package config that names novel_builder:
//   dart run dump.dart progress.golden.json <the Flutter fixtures>/*.novel.json edge.novel.json the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/analytics/goal_changes.dart';
import 'package:novel_builder/shared/domain/analytics/journal.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';
import 'package:novel_builder/shared/domain/codex/codex_changes.dart' show ChangeRefused;
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/manuscript/board.dart' show TreeItem, buildTree, flattenTree;
import 'package:novel_builder/shared/domain/records/novel.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

/// Noon on October 25, 2026: the day the page is read on.
final now = DateTime(2026, 10, 25, 12).millisecondsSinceEpoch;

// ------------------------------------------------------------------------------------------- bars.dart, word for word

String compactNumber(int n) {
  final abs = n.abs();
  if (abs < 1000) return '$n';
  final k = n / 1000;
  return '${k == k.roundToDouble() || abs >= 10000 ? (k + 0.5).floor() : k.toStringAsFixed(1)}K';
}

String signed(int n) => '${n < 0 ? '−' : ''}${grouped(n.abs())}';

// ----------------------------------------------------------------------------------- length_shelf.dart, word for word

const storyLengths = <({String name, int end})>[
  (name: 'Flash fiction', end: 1000),
  (name: 'Short story', end: 7500),
  (name: 'Novelette', end: 17500),
  (name: 'Novella', end: 40000),
  (name: 'Novel', end: 100000),
  (name: 'Long novel', end: 1 << 62),
];
const wordsPerManuscriptPage = 250;

({int index, double through}) lengthOf(int words) {
  var start = 0;
  for (final (i, l) in storyLengths.indexed) {
    if (words < l.end) {
      final last = i == storyLengths.length - 1;
      return (index: i, through: last ? 1.0 : ((words - start) / (l.end - start)).clamp(0.0, 1.0));
    }
    start = l.end;
  }
  return (index: storyLengths.length - 1, through: 1);
}

String lengthSentence(int words) {
  final at = lengthOf(words);
  final now = storyLengths[at.index];
  final pages = (words / wordsPerManuscriptPage).round();
  final pagesText = words == 0
      ? 'No pages yet'
      : pages < 1
      ? 'Less than a manuscript page'
      : 'About ${grouped(pages)} manuscript ${pages == 1 ? 'page' : 'pages'}';
  final next = at.index + 1 < storyLengths.length ? storyLengths[at.index + 1] : null;
  final toGo = now.end - words;
  final nextText = next == null
      ? 'Long enough for any shelf.'
      : '${grouped(toGo)} more ${toGo == 1 ? 'word' : 'words'} and it is the length of a ${next.name.toLowerCase()}.';
  return '$pagesText, the length of ${_article(now.name)}. $nextText';
}

String _article(String name) => name == 'Flash fiction' ? 'flash fiction' : 'a ${name.toLowerCase()}';

List<Object?> spines(int words) {
  final at = lengthOf(words);
  return [
    for (var i = 0; i < storyLengths.length; i++)
      {
        'name': storyLengths[i].name,
        'height': 46 + i * 13.0,
        'fill': i < at.index ? 1 : (i == at.index ? at.through : 0),
        'current': i == at.index,
      },
  ];
}

// ------------------------------------------------------------------------------------ progress_page.dart, word for word

String _plural(int n, String word) => '${grouped(n)} $word${n == 1 ? '' : 's'}';
String duration(int minutes) => minutes < 60 ? '$minutes min' : '${minutes ~/ 60} h ${minutes % 60} min';
bool parseDayOrNull(String key) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(key);

String health(ProgressReport report) => [
  if (report.targetWords case final t?)
    '${grouped(report.totalWords)} / ${grouped(t)} words'
  else
    _plural(report.totalWords, 'word'),
  if (report.percent != null) '${report.percent}% complete',
  if (report.chapters.total > 0) '${report.chapters.completed} / ${report.chapters.total} chapters complete',
  '${grouped(report.week.net < 0 ? 0 : report.week.net)} words this week',
].join(' • ');

Object? period(String label, PeriodTotals totals, ({Goal goal, int words, int target, int percent})? target, String empty) => {
  'label': label,
  'value': totals.sessions == 0 ? '0' : '${totals.net > 0 ? '+' : ''}${signed(totals.net)}',
  'detail': totals.sessions == 0
      ? empty
      : totals.removed > 0
      ? '${grouped(totals.added)} written, ${grouped(totals.removed)} trimmed'
      : 'words in ${_plural(totals.sessions, 'session')}',
  'meter': target == null
      ? null
      : {
          'percent': target.percent,
          'label': '$label target',
          'caption': target.percent >= 100 ? 'Target reached' : '${target.percent}% of ${grouped(target.target)}',
        },
};

typedef DeadlineRow = ({Goal goal, String? scope, int words, int? target, int? percent, int daysLeft, int? perDay, bool reached});

String deadlineText(DeadlineRow d) {
  final when = d.daysLeft > 0
      ? '${_plural(d.daysLeft, 'day')} to go'
      : d.daysLeft == 0
      ? 'Due today'
      : '${_plural(-d.daysLeft, 'day')} past the date';
  if (d.target == null || d.target == 0) return when;
  final count = '${grouped(d.words)} / ${grouped(d.target!)} words';
  if (d.reached) return '$count · reached';
  return '$count · $when${d.perDay != null ? ' · about ${grouped(d.perDay!)} a day gets there' : ''}';
}

String deadlineWhen(DeadlineRow d) =>
    '${mediumDay(d.goal.dueDate!)}'
    '${d.scope != null
        ? ' · ${d.scope}'
        : d.goal.nodeId != null
        ? ''
        : ' · whole manuscript'}';

List<Goal> tasksInOrder(List<Goal> goals) =>
    [
      for (final g in goals)
        if (g.kind == 'task') g,
    ]..sort((a, b) {
      final c = (a.done ? 1 : 0).compareTo(b.done ? 1 : 0);
      return c != 0 ? c : (a.raw['createdAt'] as num? ?? 0).compareTo(b.raw['createdAt'] as num? ?? 0);
    });

String taskLine(Goal task) =>
    '${taskLabels[task.raw['category']] ?? 'Other'}'
    '${task.dueDate != null && parseDayOrNull(task.dueDate!) ? ' · ${mediumDay(task.dueDate!)}' : ''}'
    '${task.done && task.raw['doneAt'] is num ? ' · done ${shortDay(dayKeyOf(task.raw['doneAt']! as num))}' : ''}';

String summary(ProgressReport report) => [
  '${report.chapters.completed} of ${report.chapters.total} chapters complete',
  if (report.scenes.total > 0) '${report.scenes.completed} of ${report.scenes.total} scenes complete',
  'average chapter ${grouped(report.averageChapterWords)} words',
  if (report.sessionCount > 0)
    '${_plural(report.sessionCount, 'session')}, ${duration(report.totalMinutes)} in all, '
        'about ${grouped(report.averageWordsPerSession < 0 ? 0 : report.averageWordsPerSession)} words each',
  '${report.daysWrittenLast30} of the last 30 days written',
].join(' · ');

String targetLine(Novel novel) =>
    'Manuscript target: '
    '${novel.targetWordCount != null ? '${grouped(novel.targetWordCount!)} words' : 'none'}'
    '${novel.deadline != null && parseDayOrNull(novel.deadline!) ? ' by ${mediumDay(novel.deadline!)}' : ''}. '
    'Change it in the Library, under the novel’s details.';

List<Object?> recent(List<WritingSession> sessions) {
  final list = [...sessions]..sort((a, b) => b.startedAt.compareTo(a.startedAt));
  return [
    for (final s in list.take(12))
      [
        weekdayDay(s.day),
        clockTime(s.startedAt),
        duration(sessionMinutes(s)),
        '${s.netWords > 0 ? '+' : ''}${signed(s.netWords)}${s.netWords <= 0 ? ' · revising' : ''}',
      ],
  ];
}

Object? trend(List<TrendPoint> points, String periodLabel) {
  String words(int n) => '${signed(n)} ${n.abs() == 1 ? 'word' : 'words'}';
  return {
    'empty': points.every((p) => p.net == 0),
    'bars': [
      for (final p in points)
        {
          'key': p.key,
          'short': p.label,
          'value': p.net,
          'current': p.current,
          'label': '${periodLabel.isEmpty ? '' : '$periodLabel '}${p.label}${p.current ? ' (so far)' : ''}',
          'said': '${periodLabel.isEmpty ? '' : '$periodLabel '}${p.label}${p.current ? ' (so far)' : ''}: ${words(p.net)}',
          'top': compactNumber(p.net),
        },
    ],
    'rows': [
      for (final p in points) [p.label, p.net],
    ],
  };
}

List<Object?> statuses(ProgressReport report) {
  final total = report.chapters.total + report.scenes.total;
  return [
    for (final status in NodeStatus.values)
      {
        'key': status.key,
        'label': status.label,
        'count': report.statusCounts[status],
        'share': total == 0 ? 0 : report.statusCounts[status]! / total,
      },
  ];
}

String? typedTarget(String text) {
  final t = text.trim();
  final n = t.isEmpty ? null : int.tryParse(t);
  final next = n == null || n <= 0 ? null : n;
  return next?.toString();
}

List<Object?> scopes(List<StoryNode> nodes) => [
  for (final t in flattenTree(buildTree(nodes)))
    if (t.node.kind != NodeKind.scene) '${'  ' * t.depth}${t.node.title.trim().isEmpty ? 'Untitled' : t.node.title}',
];

// ------------------------------------------------------------------------------------- journal_view.dart, word for word

String _days(int n) => '${grouped(n)} ${n == 1 ? 'day' : 'days'}';

Object? hero(Journal journal, ProgressReport report) {
  final target = report.targetWords;
  final percent = report.percent;
  final pace = journal.pacePerDay;
  final reached = target != null && report.totalWords >= target;
  return {
    'run': {
      'number': '${journal.currentRun}',
      'label': journal.currentRun == 1 ? 'day in a row' : 'days in a row',
      'best': 'Best: ${_days(journal.bestRun)}',
      'semantics': '${_days(journal.currentRun)} in a row. Best: ${_days(journal.bestRun)}.',
    },
    'manuscript': {
      'number': grouped(report.totalWords),
      'caption': target != null ? 'of ${grouped(target)} words · $percent%' : 'words so far',
      'fill': target == null ? null : (percent ?? 0) / 100,
      'semantics': '${grouped(report.totalWords)} words${target != null ? ' of ${grouped(target)}, $percent%' : ''}',
    },
    'ahead': reached
        ? {'kind': 'reached', 'label': 'Target reached'}
        : journal.finishDay != null
        ? {
            'kind': 'finish',
            'label': 'Finished around',
            'day': mediumDay(journal.finishDay!),
            'note': 'At your pace of the last 30 days: about ${grouped(pace!)} ${pace == 1 ? 'word' : 'words'} a day',
          }
        : pace != null
        ? {'kind': 'pace', 'label': 'About ${grouped(pace)} ${pace == 1 ? 'word' : 'words'} a day', 'note': 'over the last 30 days'}
        : {'kind': 'none', 'label': 'No words logged in the last 30 days'},
  };
}

const _weeks = 53;
const _labels = 30.0;
const _months = 18.0;
const _monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

String first(Journal j) => addDays(weekStart(j.today), -(_weeks - 1) * 7);

String describe(Journal j, String day) {
  final d = j.days[day];
  final when = '${weekdayDay(day)}, ${parseDay(day).year}';
  if (d == null) return '$when: nothing logged';
  final net = d.net > 0 ? '+${grouped(d.net)} words' : '${signed(d.net)} words, revising';
  return '$when: $net in ${d.sessions == 1 ? '1 session' : '${d.sessions} sessions'}';
}

String? dayAt(Journal j, double x, double y, double step) {
  final col = ((x - _labels) / step).floor();
  final row = ((y - _months) / step).floor();
  if (col < 0 || col >= _weeks || row < 0 || row > 6) return null;
  final day = addDays(first(j), col * 7 + row);
  return day.compareTo(j.today) > 0 ? null : day;
}

Object? year(Journal j, double width) {
  final step = ((width - _labels) / _weeks).clamp(14.0, 22.0);
  final cell = step - 3;
  final cells = <Object?>[];
  final months = <Object?>[];
  int? lastMonth;
  for (var col = 0; col < _weeks; col++) {
    final monday = addDays(first(j), col * 7);
    final month = parseDay(monday).month;
    if (month != lastMonth && col < _weeks - 1) {
      if (lastMonth != null || parseDay(monday).day <= 7) {
        months.add({'text': _monthNames[month - 1], 'x': _labels + col * step});
      }
      lastMonth = month;
    }
    for (var row = 0; row < 7; row++) {
      final day = addDays(monday, row);
      if (day.compareTo(j.today) > 0) break;
      cells.add([day, _labels + col * step, _months + row * step, j.level(day), day == j.today]);
    }
  }
  final written = [
    for (final d in j.days.keys)
      if (d.compareTo(first(j)) >= 0 && d.compareTo(j.today) <= 0) d,
  ]..sort((a, b) => b.compareTo(a));
  return {
    'step': step,
    'cell': cell,
    'width': _labels + step * _weeks,
    'height': _months + step * 7,
    'cells': cells,
    'months': months,
    'weekdays': [
      for (final (row, name) in const [(0, 'Mon'), (2, 'Wed'), (4, 'Fri')]) {'text': name, 'y': _months + row * step + cell / 2 - 7},
    ],
    'label': 'A year of writing: ${_days(written.length)} written',
    'table': [
      for (final d in written) ['${weekdayDay(d)}, ${parseDay(d).year}', signed(j.days[d]!.net), j.days[d]!.sessions],
    ],
    'said': [for (final d in written.take(40)) describe(j, d)],
    'today': describe(j, j.today),
    'at': [
      for (final p in const [(31.0, 19.0), (100.0, 40.0), (500.0, 100.0), (0.0, 0.0), (1200.0, 300.0), (900.0, 150.0)])
        dayAt(j, p.$1, p.$2, step),
    ],
  };
}

Object? seal(Milestone m) => {
  'icon': m.kind,
  'label': m.label,
  'reached': m.reached,
  'toGo': m.toGo,
  'next': m.toGo != null,
  'semantics':
      '${m.label}, ${m.reached
          ? 'reached'
          : m.toGo != null
          ? 'not yet: ${m.toGo}'
          : 'not yet'}',
};

// -------------------------------------------------------------------------------------------------------- the report

JsonMap _trend(TrendPoint p) => {'key': p.key, 'label': p.label, 'net': p.net, 'current': p.current};
JsonMap? _target(({Goal goal, int words, int target, int percent})? t) =>
    t == null ? null : {'goal': t.goal.raw, 'words': t.words, 'target': t.target, 'percent': t.percent};

JsonMap progressJson(ProgressReport p) => {
  'totalWords': p.totalWords,
  'targetWords': p.targetWords,
  'percent': p.percent,
  'today': p.today.toJson(),
  'week': p.week.toJson(),
  'month': p.month.toJson(),
  'chapters': {'total': p.chapters.total, 'completed': p.chapters.completed},
  'scenes': {'total': p.scenes.total, 'completed': p.scenes.completed},
  'averageChapterWords': p.averageChapterWords,
  'statusCounts': {for (final MapEntry(:key, :value) in p.statusCounts.entries) key.key: value},
  'sessionCount': p.sessionCount,
  'averageWordsPerSession': p.averageWordsPerSession,
  'totalMinutes': p.totalMinutes,
  'currentRun': p.currentRun,
  'daysWrittenLast30': p.daysWrittenLast30,
  'lastWritingDay': p.lastWritingDay,
  'days': p.days.map(_trend).toList(),
  'weeks': p.weeks.map(_trend).toList(),
  'daily': _target(p.daily),
  'weekly': _target(p.weekly),
  'deadlines': [
    for (final d in p.deadlines)
      {
        'goal': d.goal.raw,
        'scope': d.scope,
        'words': d.words,
        'target': d.target,
        'percent': d.percent,
        'daysLeft': d.daysLeft,
        'perDay': d.perDay,
        'reached': d.reached,
      },
  ],
  'tasks': {'total': p.tasks.total, 'done': p.tasks.done},
};

JsonMap journalJson(Journal j) => {
  'today': j.today,
  'days': [
    for (final d in j.days.values) {'day': d.day, 'net': d.net, 'sessions': d.sessions},
  ],
  'currentRun': j.currentRun,
  'bestRun': j.bestRun,
  'pacePerDay': j.pacePerDay,
  'finishDay': j.finishDay,
  'milestones': [
    for (final m in j.milestones) {'label': m.label, 'kind': m.kind, 'reached': m.reached, 'toGo': m.toGo},
  ],
};

/// A made-up writing log around today, the same on both sides: sessions on most of the last 400 days, some cutting,
/// some of two sessions, a long run up to yesterday.
List<JsonMap> madeUpLog(String projectId) {
  final today = dayKeyOf(now);
  final out = <JsonMap>[];
  for (var i = 0; i < 400; i++) {
    final day = addDays(today, -i);
    if (i > 12 && (i * 7) % 5 == 0) continue;
    if (i == 0) continue;
    final added = (i * 137) % 900;
    final removed = i % 9 == 0 ? (i * 31) % 400 : 0;
    final start = parseDay(day).add(Duration(hours: 6 + i % 13, minutes: (i * 17) % 60)).millisecondsSinceEpoch;
    out.add({
      'id': 's$i',
      'projectId': projectId,
      'day': day,
      'startedAt': start,
      'lastActiveAt': start + ((i * 523) % 7200) * 1000,
      'netWords': added - removed,
      'added': added,
      'removed': removed,
    });
    if (i % 4 == 1) {
      out.add({
        'id': 't$i',
        'projectId': projectId,
        'day': day,
        'startedAt': start + 3 * 3600000,
        'lastActiveAt': start + 3 * 3600000 + 25 * 60000,
        'netWords': -(i % 50),
        'added': 0,
        'removed': i % 50,
      });
    }
  }
  return out;
}

/// Made-up goals: targets, deadlines (past, due, ahead, over a part, reached), tasks done and to do.
List<JsonMap> madeUpGoals(String projectId, List<StoryNode> nodes) {
  final today = dayKeyOf(now);
  final part = nodes.where((n) => n.kind != NodeKind.scene).firstOrNull;
  JsonMap g(String id, String kind, {String title = '', int? target, String? due, String? nodeId, String? category, bool done = false, num? doneAt, int created = 0}) => {
    'id': id,
    'projectId': projectId,
    'kind': kind,
    'title': title,
    'targetWords': target,
    'dueDate': due,
    'nodeId': nodeId,
    'category': category,
    'done': done,
    'doneAt': doneAt,
    'createdAt': created,
    'updatedAt': created,
  };
  return [
    g('gd', 'daily', target: 300),
    g('gw', 'weekly', target: 2500),
    g('d1', 'deadline', title: 'Draft', target: 90000, due: addDays(today, 40), created: 3),
    g('d2', 'deadline', title: 'Today', due: today, created: 4),
    g('d3', 'deadline', title: 'Late', target: 50, due: addDays(today, -6), created: 5),
    g('d4', 'deadline', title: 'Part', target: 2000, due: addDays(today, 9), nodeId: part?.id, created: 6),
    g('d5', 'deadline', title: 'Gone part', target: 10, due: addDays(today, 2), nodeId: 'nowhere', created: 7),
    g('t1', 'task', title: 'Map', category: 'worldbuilding', due: addDays(today, 3), created: 9),
    g('t2', 'task', title: 'Outline', category: 'planning', done: true, doneAt: now - 86400000 * 2, created: 8),
    g('t3', 'task', title: 'Fix', category: 'nonsense', created: 2),
    g('t4', 'task', title: 'Edit', category: 'editing', due: 'not a date', created: 10),
  ];
}

Object? page(NovelSnapshot s, List<WritingSession> sessions, List<Goal> goals) {
  final novel = Novel(s.project);
  final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
  final report = computeProgress(targetWordCount: novel.targetWordCount, nodes: nodes, sessions: sessions, goals: goals, now: now);
  final journal = computeJournal(
    sessions: sessions,
    totalWords: report.totalWords,
    targetWords: report.targetWords,
    chapters: report.chapters,
    now: now,
  );
  return {
    'report': progressJson(report),
    'journal': journalJson(journal),
    'health': health(report),
    'hero': hero(journal, report),
    'shelf': {'sentence': lengthSentence(report.totalWords), 'spines': spines(report.totalWords)},
    'year': [year(journal, 390), year(journal, 1400)],
    'seals': [for (final m in journal.milestones) seal(m)],
    'tiles': [
      period('Today', report.today, report.daily, 'Nothing logged yet today'),
      period('This week', report.week, report.weekly, 'Nothing logged yet this week'),
      period('This month', report.month, null, 'Nothing logged yet this month'),
    ],
    'summary': summary(report),
    'trend': trend(report.weeks, 'Week of'),
    'statuses': statuses(report),
    'targetLine': targetLine(novel),
    'deadlines': [
      for (final d in report.deadlines) {'title': d.goal.title, 'when': deadlineWhen(d), 'text': deadlineText(d)},
    ],
    'tasks': [
      for (final t in tasksInOrder(goals)) {'title': t.title, 'line': taskLine(t)},
    ],
    'tasksCount': report.tasks.total > 0 ? '${report.tasks.done} of ${report.tasks.total} done' : null,
    'recent': recent(sessions),
    'scopes': scopes(nodes),
  };
}

/// A script of goal changes: targets set, changed and removed; deadlines and tasks added, changed, checked off and
/// removed; and the refusals.
Object? script(NovelSnapshot s) {
  var n = 0;
  final c = GoalChanges(s, now: now, createId: () => 'g${n++}');
  final out = <Object?>[];
  void step(String name, void Function() run) {
    try {
      run();
      out.add({'step': name, 'goals': [for (final g in c.goals) g.raw]});
    } on ChangeRefused catch (e) {
      out.add({'step': name, 'refused': e.message});
    }
  }

  final part = [for (final r in s.rows('chapters')) StoryNode(r)].where((x) => x.kind != NodeKind.scene).firstOrNull?.id ?? '';
  step('daily 500.4', () => c.setTarget('daily', '500.4'));
  step('daily 750', () => c.setTarget('daily', 750));
  step('weekly lots', () => c.setTarget('weekly', 'lots'));
  step('weekly 3000', () => c.setTarget('weekly', ' 3000 '));
  step('daily 0', () => c.setTarget('daily', 0));
  step('weekly -5', () => c.setTarget('weekly', -5));
  step('weekly 2.6', () => c.setTarget('weekly', 2.6));
  step('deadline blank', () => c.addGoal('deadline', const GoalInput(title: ' ', dueDate: '2026-12-31')));
  step('deadline bad date', () => c.addGoal('deadline', const GoalInput(title: 'Draft', dueDate: '31/12/2026')));
  step('task blank', () => c.addGoal('task', const GoalInput(title: '')));
  step('kind', () => c.addGoal('daily', const GoalInput(title: 'x')));
  step('deadline', () => c.addGoal('deadline', GoalInput(title: ' Draft ', dueDate: '2026-12-31', targetWords: '0', nodeId: part)));
  step('task', () => c.addGoal('task', const GoalInput(title: 'Map', category: 'sailing', nodeId: 'c1', dueDate: '')));
  step('task 2', () => c.addGoal('task', const GoalInput(title: 'Edit', category: 'editing', dueDate: '2026-11-02')));
  final ids = [for (final g in c.goals) g.id];
  if (ids.length >= 3) {
    final d = ids[ids.length - 3];
    final t = ids[ids.length - 2];
    step('update deadline', () => c.updateGoal(d, const GoalInput(title: '', dueDate: '', targetWords: 2000, nodeId: '')));
    step('update task', () => c.updateGoal(t, const GoalInput(title: 'Map the river', category: 'worldbuilding', dueDate: '2026-11-09')));
    step('task kind kept', () => c.updateGoal(t, const GoalInput(category: 'bogus')));
    step('done', () => c.setDone(t, true));
    step('undone', () => c.setDone(t, false));
    step('remove', () => c.removeGoal(d));
    step('remove again', () => c.removeGoal(d));
    step('done gone', () => c.setDone(d, true));
  }
  return out;
}

Map<String, Object?> novel(NovelSnapshot s) {
  final own = page(
    s,
    [for (final r in s.rows('writingSessions')) WritingSession(r)],
    [for (final r in s.rows('goals')) Goal(r)],
  );
  final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
  final made = page(
    s,
    [for (final r in madeUpLog(s.projectId)) WritingSession(r)],
    [for (final r in madeUpGoals(s.projectId, nodes)) Goal(r)],
  );
  return {'own': own, 'made': made, 'script': script(s)};
}

Object? misc() {
  final counts = [0, 1, 24, 124, 125, 126, 249, 250, 251, 999, 1000, 1001, 4250, 7499, 7500, 17499, 17500, 39999, 40000, 80000, 99999, 100000, 120000, 250000];
  return {
    'lengths': [
      for (final w in counts) {'words': w, 'at': [lengthOf(w).index, lengthOf(w).through], 'sentence': lengthSentence(w)},
    ],
    'compact': [for (final x in [0, 7, -7, 999, 1000, 1049, 1050, 1250, 9999, 10000, 15400, -1250, -25000]) compactNumber(x)],
    'signed': [for (final x in [0, 5, -5, 1234, -1234567]) signed(x)],
    'duration': [for (final x in [1, 59, 60, 61, 125, 600]) duration(x)],
    'typed': [for (final t in ['', ' 500 ', '0', '-3', '+7', '12a', '0500']) typedTarget(t)],
    'days': [
      for (final d in ['2026-10-25', '2026-01-01', '2024-02-29', '2026-03-29', '2026-11-01'])
        [mediumDay(d), longDay(d), weekdayDay(d), shortDay(d), weekStart(d), monthOf(d), daysBetween('2026-10-25', d)],
    ],
    'clock': [for (final h in [0, 1, 9, 11, 12, 13, 23]) clockTime(DateTime(2026, 10, 25, h, 5).millisecondsSinceEpoch)],
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
