// The Flutter app's own project analytics (analytics.golden.json pins them; ../json.ts makes Scriptor's, shaped the
// same way). For every novel given, its analytics read at three moments (noon on October 25, 2026; noon on November
// 17, 2026; noon on January 3, 2031), each with only the names as entered and with every name Characters finds them by
// (namesToFind over the cast as CastData reads it). And `misc`: ranges.
//
// Run from a scratch dir holding the package config that names novel_builder:
//   dart run dump.dart analytics.golden.json <the Flutter fixtures>/*.novel.json edge.novel.json the-drowned-road.novel.json

import 'dart:convert';
import 'dart:io';

import 'package:novel_builder/shared/domain/analytics/analytics.dart';
import 'package:novel_builder/shared/domain/analytics/progress.dart';
import 'package:novel_builder/shared/domain/characters/character_records.dart';
import 'package:novel_builder/shared/domain/characters/named_in.dart';
import 'package:novel_builder/shared/domain/json.dart';
import 'package:novel_builder/shared/domain/model/story_model.dart';
import 'package:novel_builder/shared/domain/progression/snapshots.dart';
import 'package:novel_builder/shared/domain/snapshot/novel_snapshot.dart';

JsonMap _trend(TrendPoint p) => {'key': p.key, 'label': p.label, 'net': p.net, 'current': p.current};
JsonMap? _place(Place? p) => p == null ? null : {'nodeId': p.nodeId, 'title': p.title, 'number': p.number};
JsonMap? _placeWords(PlaceWords? p) =>
    p == null ? null : {'nodeId': p.nodeId, 'title': p.title, 'number': p.number, 'words': p.words};
JsonMap _count(Count c) => {'key': c.key, 'label': c.label, 'count': c.count};

/// analytics_test.dart's analyticsJson, word for word.
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

/// The moments the reports are read at, in the author's own time.
final moments = {
  'oct25': DateTime(2026, 10, 25, 12).millisecondsSinceEpoch,
  'nov17': DateTime(2026, 11, 17, 12).millisecondsSinceEpoch,
  'jan2031': DateTime(2031, 1, 3, 12).millisecondsSinceEpoch,
};

/// CastData's findNames (features/characters/characters_providers.dart), as it reads entries and profiles.
Map<String, List<String>> findNames(StoryModel model, NovelSnapshot s) {
  final entries = [...model.entries.values]..sort((a, b) => a.id.compareTo(b.id));
  final profiles = {
    for (final r in [...s.rows('characterProfiles')]..sort((a, b) => str(b['id']).compareTo(str(a['id']))))
      str(r['entryId']): CharacterProfile(r),
  };
  return namesToFind(entries, profiles);
}

JsonMap novel(NovelSnapshot s) {
  final model = StoryModel.fromSnapshot(s);
  final names = findNames(model, s);
  Analytics run(num now, Map<String, List<String>>? n) => computeAnalytics(
    model,
    targetWordCount: intOrNull(s.project['targetWordCount']),
    docs: {for (final r in s.rows('chapterContents')) str(r['id']): r['doc']},
    snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
    sessions: [for (final r in s.rows('writingSessions')) WritingSession(r)],
    goals: [for (final r in s.rows('goals')) Goal(r)],
    now: now,
    names: n,
  );
  return {
    for (final MapEntry(:key, :value) in moments.entries) ...{
      key: analyticsJson(run(value, null)),
      '$key-names': analyticsJson(run(value, names)),
    },
  };
}

JsonMap misc() => {
  'ranges': [
    for (final list in [
      <int>[],
      [4],
      [1, 2, 3, 7, 12],
      [1, 3, 4, 5, 9, 10],
      [2, 3],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ])
      ranges(list),
  ],
};

/// The test's canonical JSON and its FNV-1a hash (as test/characters/golden/dump.dart).
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
