// Writing progress and creative analytics, ported: agreement with the original app on the progress report (goals,
// deadlines, runs), the project analytics, every chart under many filters, the chart filter read from an address, nice
// steps and the CSV file (tool/golden/analytics.test.ts).
import 'package:flutter_test/flutter_test.dart';
import 'package:novel_builder/shared/domain/analytics/analytics.dart';
import 'package:novel_builder/shared/domain/analytics/charts.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/records/story_node.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

import 'fixtures.dart';
import 'golden.dart';

/// Noon on October 25, 2026: the day the reports are read on.
final now = DateTime(2026, 10, 25, 12).millisecondsSinceEpoch;

JsonMap _trend(TrendPoint p) => {'key': p.key, 'label': p.label, 'net': p.net, 'current': p.current};
JsonMap? _place(Place? p) => p == null ? null : {'nodeId': p.nodeId, 'title': p.title, 'number': p.number};
JsonMap? _placeWords(PlaceWords? p) =>
    p == null ? null : {'nodeId': p.nodeId, 'title': p.title, 'number': p.number, 'words': p.words};
JsonMap _count(Count c) => {'key': c.key, 'label': c.label, 'count': c.count};
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

JsonMap analyticsJson(Analytics a) => {
  'output': {
    'totalWords': a.output.totalWords,
    'targetWords': a.output.targetWords,
    'percent': a.output.percent,
    'today': a.output.today.toJson(),
    'week': a.output.week.toJson(),
    'month': a.output.month.toJson(),
    'averagePerWritingDay': a.output.averagePerWritingDay,
    'averagePerDayLast30': a.output.averagePerDayLast30,
    'days': a.output.days.map(_trend).toList(),
    'weeks': a.output.weeks.map(_trend).toList(),
  },
  'sessions': {
    'count': a.sessions.count,
    'averageWords': a.sessions.averageWords,
    'averageMinutes': a.sessions.averageMinutes,
    'totalMinutes': a.sessions.totalMinutes,
    'longestByWords': a.sessions.longestByWords == null
        ? null
        : {'words': a.sessions.longestByWords!.words, 'day': a.sessions.longestByWords!.day},
    'longestByTime': a.sessions.longestByTime == null
        ? null
        : {'minutes': a.sessions.longestByTime!.minutes, 'day': a.sessions.longestByTime!.day},
    'currentStreak': a.sessions.currentStreak,
    'longestStreak': a.sessions.longestStreak,
    'writingDays': a.sessions.writingDays,
    'lastWritingDay': a.sessions.lastWritingDay,
  },
  'structure': {
    'chapters': a.structure.chapters,
    'scenes': a.structure.scenes,
    'averageChapter': a.structure.averageChapter,
    'averageScene': a.structure.averageScene,
    'longest': _placeWords(a.structure.longest),
    'shortest': _placeWords(a.structure.shortest),
    'lengths': a.structure.lengths.map(_placeWords).toList(),
    'pipeline': a.structure.pipeline.map(_count).toList(),
  },
  'cast': {
    'total': a.cast.total,
    'appearing': a.cast.appearing,
    'rows': [
      for (final r in a.cast.rows)
        {
          'id': r.id,
          'name': r.name,
          'chapters': r.chapters,
          'distribution': r.distribution,
          'first': _place(r.first),
          'latest': _place(r.latest),
          'relationships': r.relationships,
          'milestones': r.milestones,
          'line': r.line,
        },
    ],
  },
  'threads': {
    'total': a.threads.total,
    'groups': a.threads.groups.map(_count).toList(),
    'openMysteries': a.threads.openMysteries,
    'characterArcs': a.threads.characterArcs,
    'rows': [
      for (final r in a.threads.rows)
        {
          'id': r.id,
          'title': r.title,
          'category': r.category,
          'status': r.status,
          'statusLabel': r.statusLabel,
          'beats': r.beats,
          'chapters': r.chapters,
          'density': r.density,
          'quietFor': r.quietFor,
          'line': r.line,
        },
    ],
  },
  'observations': a.observations,
};

JsonMap chartJson(Chart c) => {
  'key': c.key,
  'title': c.title,
  'uses': c.uses,
  'measure': c.measure,
  'units': [c.units.$1, c.units.$2],
  'shape': c.shape,
  'bars': [
    for (final b in c.bars)
      {'key': b.key, 'short': b.short, 'label': b.label, 'value': b.value, 'ref': b.ref?.toJson(), 'detail': b.detail},
  ],
  'empty': c.empty,
  'summary': c.summary,
  'notes': c.notes,
  'table': {'columns': c.columns, 'rows': c.rows},
};

JsonMap filterJson(ChartFilter f) => {
  'from': f.from,
  'to': f.to,
  'threadId': f.threadId,
  'povId': f.povId,
  'label': f.label,
  'yearFrom': f.yearFrom,
  'yearTo': f.yearTo,
  'grain': f.grain,
  'count': f.count,
};

ChartFilter filterOf(JsonMap f) => ChartFilter(
  from: f['from'] as String?,
  to: f['to'] as String?,
  threadId: f['threadId'] as String?,
  povId: f['povId'] as String?,
  label: f['label'] as String?,
  yearFrom: f['yearFrom'] as int?,
  yearTo: f['yearTo'] as int?,
  grain: f['grain']! as String,
  count: f['count']! as String,
);

void main() {
  final golden = readGolden('analytics.golden.json');
  final sources = {for (final name in fixtureNames) name: loadFixture(name), 'analytics': loadFixture('analytics')};
  for (final MapEntry(key: name, value: s) in sources.entries) {
    final expected = golden[name]! as JsonMap;
    final model = StoryModel.fromSnapshot(s);
    final target = intOrNull(s.project['targetWordCount']);
    final sessions = [for (final r in s.rows('writingSessions')) WritingSession(r)];
    final goals = [for (final r in s.rows('goals')) Goal(r)];

    test('$name: the progress report agrees', () {
      final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
      final p = computeProgress(targetWordCount: target, nodes: nodes, sessions: sessions, goals: goals, now: now);
      expectJson(progressJson(p), expected['progress'], '$name.progress');
    });

    test('$name: the analytics agree', () {
      final a = computeAnalytics(
        model,
        targetWordCount: target,
        docs: {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']},
        snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
        sessions: sessions,
        goals: goals,
        now: now,
      );
      expectJson(analyticsJson(a), expected['analytics'], '$name.analytics');
    });

    final filters = expected['filters']! as JsonMap;
    for (final MapEntry(:key, :value) in filters.entries) {
      test('$name: the charts agree, filtered "$key"', () {
        final charts = analyticsCharts(model, filterOf(value! as JsonMap));
        expectJson(charts.map(chartJson).toList(), (expected['charts']! as JsonMap)[key], '$name.charts.$key');
        if (key == 'all') {
          expect([for (final c in charts) toCsv(c.columns, c.rows)], expected['csv']);
        }
      });
    }
  }

  final empty = StoryModel.fromSnapshot(
    NovelSnapshot.fromJson({
      'format': 'novel-builder/project',
      'version': 4,
      'exportedAt': 0,
      'project': {'id': 'x', 'title': 'Empty'},
      'collections': <String, Object?>{},
    }),
  );

  test('an empty novel: every chart says why it is empty', () {
    expectJson(
      analyticsCharts(empty, ChartFilter.of(const {}, empty)).map(chartJson).toList(),
      golden['empty'],
      'empty',
    );
  });

  test('nice steps, the CSV file and the filter read from an address agree', () {
    expect([
      for (final n in [1, 2, 9, 12, 13, 25, 31, 100, 101, 250, 1200, 12001, 99999]) ...[
        niceStep(n, 12),
        niceStep(n, 30),
      ],
    ], golden['steps']);
    expect(
      toCsv(
        ['Name', 'Count'],
        [
          ['=SUM(A1)', 3],
          ['a "quote", here', -2],
          ['+1', 0],
          ['line\nbreak', 7],
          ['@x', 1],
          ['-y', 2],
          ['plain', 4],
        ],
      ),
      golden['csv'],
    );
    final read = [
      for (final q in [
        '',
        'cgrain=scenes&ccount=page&cyfrom=10&cyto=x&clabel=%20Action%20',
        'cyfrom=1.5&cyto=-3&cgrain=words',
        'cyfrom=%20&clabel=%20',
      ])
        filterJson(ChartFilter.of(Uri.splitQueryString(q), empty)),
    ];
    expectJson(read, golden['read'], 'read');
  });

  test('a filter is kept as a saved view keeps it, and read back the same', () {
    final model = StoryModel.fromSnapshot(sources['analytics']!);
    const filter = ChartFilter(
      from: 'c2',
      to: 'c5',
      threadId: 't1',
      povId: 'mira',
      label: 'Action',
      yearFrom: -4,
      yearTo: 320,
      grain: 'scenes',
      count: 'page',
    );
    expect(filterJson(ChartFilter.of(filter.toLayout(), model)), filterJson(filter));
    expect(filter.toLayout(), {
      'cfrom': 'c2',
      'cto': 'c5',
      'cthread': 't1',
      'cpov': 'mira',
      'clabel': 'Action',
      'cyfrom': '-4',
      'cyto': '320',
      'cgrain': 'scenes',
      'ccount': 'page',
    });
    expect(ChartFilter.of({'cfrom': 'gone', 'cthread': 'gone', 'cpov': 'gone'}, model).filtered, isFalse);
  });

  test('days are read in the author’s calendar, in English', () {
    expect(
      [shortDay('2026-10-05'), longDay('2026-01-31'), grouped(1234567), grouped(-1000), grouped(999)],
      ['Oct 5', 'January 31, 2026', '1,234,567', '-1,000', '999'],
    );
    expect(
      [
        weekStart('2026-10-25'),
        weekStart('2026-10-19'),
        addDays('2026-12-31', 1),
        daysBetween('2026-03-01', '2026-03-31'),
      ],
      ['2026-10-19', '2026-10-19', '2027-01-01', 30],
    );
  });
}
