import 'dart:math' as math;

import '../collation.dart';
import '../continuity/text.dart' show findWords, paragraphsOf;
import '../manuscript/board.dart' show buildTree, flattenTree;
import '../manuscript/outline.dart' show isDocument;
import '../model/navigate.dart' show threadStatusName;
import '../model/story_model.dart';
import '../plot/diagnostics.dart' show diagnose;
import '../plot/plot_changes.dart' show categoryName;
import '../progression/snapshots.dart' show ProgressSnapshot;
import '../records/story_node.dart';
import '../stable_sort.dart';
import 'progress.dart';

/// Runs of letters and digits: the words [findWords] matches whole.
final _wordRuns = RegExp(r'[\p{L}\p{N}]+', unicode: true);
Set<String> _runsOf(String text) => {for (final m in _wordRuns.allMatches(text)) m[0]!};

/// PROJECT ANALYTICS (as in the original app)
/// OBJECTIVE DIAGNOSTICS RULE: counts things. Every number here is read straight off the project: the manuscript's
/// tree and saved text, the writing log, the Codex, recorded relationships, snapshots and plot threads. Nothing is
/// scored, graded or compared with how a book "should" go, and every sentence it produces says what is, never what it
/// means. Whether a number is as intended is for the author.

typedef Place = ({String nodeId, String title, int number});
typedef PlaceWords = ({String nodeId, String title, int number, int words});

class CharacterRow {
  CharacterRow(
    this.id,
    this.name,
    this.chapters,
    this.distribution,
    this.first,
    this.latest,
    this.relationships,
    this.milestones,
    this.line,
  );
  final String id;
  final String name;

  /// Numbers of the chapters they appear in, in order.
  final List<int> chapters;

  /// The same as ranges: "1–3, 7, 12".
  final String distribution;
  final Place? first;
  final Place? latest;
  final int relationships;
  final int milestones;
  final String line;
}

class ThreadRow {
  ThreadRow(
    this.id,
    this.title,
    this.category,
    this.status,
    this.statusLabel,
    this.beats,
    this.chapters,
    this.density,
    this.quietFor,
    this.line,
  );
  final String id;
  final String title;
  final String category;
  final String status;
  final String statusLabel;
  final int beats;
  final List<int> chapters;

  /// Share of the manuscript's chapters it has a development in, 0 to 1.
  final double density;

  /// Written chapters since its latest development. Null when that cannot be measured.
  final int? quietFor;
  final String line;
}

const pipeline = [
  (key: 'planned', label: 'Planned', statuses: ['idea', 'planned']),
  (key: 'drafting', label: 'Drafting', statuses: ['drafting']),
  (key: 'revision', label: 'In Revision', statuses: ['draft-complete', 'revising']),
  (key: 'completed', label: 'Completed', statuses: ['final', 'published']),
];

const threadGroups = [
  (key: 'active', label: 'Active', statuses: ['active']),
  (key: 'resolved', label: 'Resolved', statuses: ['resolved']),
  (key: 'paused', label: 'Dormant / Paused', statuses: ['paused']),
  (key: 'abandoned', label: 'Abandoned', statuses: ['abandoned', 'retconned']),
  (key: 'planned', label: 'Planned', statuses: ['planned']),
];

typedef Count = ({String key, String label, int count});

class Analytics {
  Analytics({
    required this.output,
    required this.sessions,
    required this.structure,
    required this.cast,
    required this.threads,
    required this.observations,
    required this.progress,
  });

  final ({
    int totalWords,
    int? targetWords,
    int? percent,
    PeriodTotals today,
    PeriodTotals week,
    PeriodTotals month,
    int averagePerWritingDay,
    int averagePerDayLast30,
    List<TrendPoint> days,
    List<TrendPoint> weeks,
  })
  output;
  final ({
    int count,
    int averageWords,
    int averageMinutes,
    int totalMinutes,
    ({int words, String day})? longestByWords,
    ({int minutes, String day})? longestByTime,
    int currentStreak,
    int longestStreak,
    int writingDays,
    String? lastWritingDay,
  })
  sessions;
  final ({
    int chapters,
    int scenes,
    int averageChapter,
    int averageScene,
    PlaceWords? longest,
    PlaceWords? shortest,
    List<PlaceWords> lengths,
    List<Count> pipeline,
  })
  structure;
  final ({int total, int appearing, List<CharacterRow> rows}) cast;
  final ({int total, List<Count> groups, int openMysteries, int characterArcs, List<ThreadRow> rows}) threads;

  /// Plain statements of fact drawn from the numbers above.
  final List<String> observations;

  /// The writing progress these build on: goals, deadlines and tasks included.
  final ProgressReport progress;
}

String _plural(int n, String one, [String? many]) => '${grouped(n)} ${n == 1 ? one : (many ?? '${one}s')}';

/// "1–3, 7, 12" for a sorted list of chapter numbers.
String ranges(List<int> numbers) {
  final out = <String>[];
  for (var i = 0; i < numbers.length; i++) {
    var end = i;
    while (end + 1 < numbers.length && numbers[end + 1] == numbers[end] + 1) {
      end++;
    }
    out.add(end > i ? '${numbers[i]}–${numbers[end]}' : '${numbers[i]}');
    i = end;
  }
  return out.join(', ');
}

int _jsRound(num n) => (n + 0.5).floor();

Analytics computeAnalytics(
  StoryModel model, {
  required int? targetWordCount,
  required Map<String, Object?> docs,
  required List<ProgressSnapshot> snapshots,
  required List<WritingSession> sessions,
  required List<Goal> goals,
  required num now,
}) {
  final nodes = [...model.nodes.values];
  final today = dayKeyOf(now);
  final base = computeProgress(
    targetWordCount: targetWordCount,
    nodes: nodes,
    sessions: sessions,
    goals: goals,
    now: now,
  );
  final order = model.order;
  final tree = flattenTree(buildTree(nodes));
  final chapters = [
    for (final t in tree)
      if (t.node.kind == NodeKind.chapter) t,
  ];
  final scenes = [
    for (final n in nodes)
      if (n.kind == NodeKind.scene) n,
  ];
  final documents = [
    for (final n in nodes)
      if (isDocument(n.kind)) n,
  ];
  final chapterAt = {for (final (i, n) in order.chapters.indexed) i + 1: n};
  Place place(int number) => (nodeId: chapterAt[number]!.id, title: chapterAt[number]!.title, number: number);
  int? numberOf(String nodeId) {
    final n = order.chapterNumber[nodeId];
    return n != null && n >= 1 && n <= order.chapters.length ? n : null;
  }

  // ---- Output and sessions
  final byDay = <String, int>{};
  for (final s in sessions) {
    byDay[s.day] = (byDay[s.day] ?? 0) + s.netWords;
  }
  final writingDays = byDay.keys.toList()..sort();
  var longestStreak = 0;
  var run = 0;
  for (final (i, day) in writingDays.indexed) {
    run = i > 0 && addDays(writingDays[i - 1], 1) == day ? run + 1 : 1;
    longestStreak = math.max(longestStreak, run);
  }
  final net = sessions.fold(0, (n, s) => n + s.netWords);
  final days = [
    for (var i = 0; i < 30; i++)
      () {
        final key = addDays(today, i - 29);
        return (key: key, label: shortDay(key), net: byDay[key] ?? 0, current: key == today);
      }(),
  ];
  final byWords = stableSorted(sessions, (a, b) => b.netWords.compareTo(a.netWords)).firstOrNull;
  final byTime = stableSorted(sessions, (a, b) => sessionMinutes(b).compareTo(sessionMinutes(a))).firstOrNull;

  // ---- Structure
  final lengths = <PlaceWords>[
    for (final t in chapters)
      () {
        final p = place(numberOf(t.node.id)!);
        return (nodeId: p.nodeId, title: p.title, number: p.number, words: t.totalWords);
      }(),
  ];
  final written = [
    for (final c in lengths)
      if (c.words > 0) c,
  ];
  final sceneWords = [
    for (final s in scenes)
      if (s.wordCount > 0) s,
  ];
  final pipelineCounts = [
    for (final g in pipeline)
      (key: g.key, label: g.label, count: chapters.where((t) => g.statuses.contains(t.node.status.key)).length),
  ];
  PlaceWords? pick(bool Function(int a, int b) better) =>
      written.isEmpty ? null : written.reduce((a, b) => better(b.words, a.words) ? b : a);

  // ---- Cast: a character appears in a chapter when they are linked there, listed in its plan, or named in its text.
  final text = {
    for (final d in documents) d.id: [for (final p in paragraphsOf(docs[d.id])) p.text].join('\n'),
  };
  final characters = [
    for (final e in model.entries.values)
      if (e.category == 'character') e,
  ];
  final parts = [
    for (final doc in documents)
      if (numberOf(doc.id) case final number?)
        (
          number: number,
          mentions: doc.mentions.toSet(),
          involved: (model.plans[doc.id]?.entityIds ?? const <String>[]).toSet(),
          text: text[doc.id] ?? '',
          words: _runsOf(text[doc.id] ?? ''),
        ),
  ];
  Map<String, int> count(Iterable<String> ids) {
    final m = <String, int>{};
    for (final id in ids) {
      m[id] = (m[id] ?? 0) + 1;
    }
    return m;
  }

  final relationCount = count([
    for (final r in model.relations.values) ...(r.fromId == r.toId ? [r.fromId] : [r.fromId, r.toId]),
  ]);
  final snapshotCount = count([for (final s in snapshots) s.entryId]);
  final rows = [
    for (final entry in characters)
      () {
        final numbers = <int>{};
        final name = entry.name.trim();
        // A name found as whole words has each of its runs of letters and digits as a whole word of the text, so a
        // chapter lacking one of them cannot match: it is skipped before the slower search, with the same result.
        final runs = _runsOf(name);
        for (final part in parts) {
          if (numbers.contains(part.number)) continue;
          // The name search is exact and case-sensitive, so text without the name cannot match: it is skipped.
          if (part.mentions.contains(entry.id) ||
              part.involved.contains(entry.id) ||
              (name.isNotEmpty &&
                  runs.every(part.words.contains) &&
                  part.text.contains(name) &&
                  findWords(part.text, [entry.name]).isNotEmpty)) {
            numbers.add(part.number);
          }
        }
        final list = numbers.toList()..sort();
        final relationships = relationCount[entry.id] ?? 0;
        final milestones = snapshotCount[entry.id] ?? 0;
        final first = list.isEmpty ? null : place(list.first);
        final latest = list.isEmpty ? null : place(list.last);
        final line = list.isNotEmpty
            ? '${entry.name}: appears in ${_plural(list.length, 'chapter')}, first: Ch. ${first!.number}, latest: Ch. '
                  '${latest!.number}, relationships: $relationships, progression snapshots: $milestones'
            : '${entry.name}: no appearances recorded, relationships: $relationships, progression snapshots: $milestones';
        return CharacterRow(entry.id, entry.name, list, ranges(list), first, latest, relationships, milestones, line);
      }(),
  ];
  final sortedRows = stableSorted(rows, (a, b) {
    final c = b.chapters.length.compareTo(a.chapters.length);
    return c != 0 ? c : localeCompare(a.name, b.name);
  });

  // ---- Plot threads
  final threads = [...model.threads.values];
  final reports = {for (final r in diagnose(threads, nodes).reports) r.thread.id: r};
  final threadRows = stableSorted(
    [
      for (final thread in threads)
        () {
          final numbers = {
            for (final b in thread.beats)
              if (b.nodeId != null) ?numberOf(b.nodeId!),
          }.toList()..sort();
          final density = chapters.isEmpty ? 0.0 : numbers.length / chapters.length;
          final quietFor = reports[thread.id]?.quietFor;
          return ThreadRow(
            thread.id,
            thread.title,
            categoryName(thread),
            thread.statusKey,
            threadStatusName(thread) ?? '',
            thread.beats.length,
            numbers,
            density,
            quietFor,
            '${thread.title}: ${_plural(thread.beats.length, 'development')} in ${numbers.length} of '
            '${_plural(chapters.length, 'chapter')} (${_jsRound(density * 100)}%)'
            '${numbers.isNotEmpty ? ', chapters ${ranges(numbers)}' : ''}',
          );
        }(),
    ],
    (a, b) {
      final c = b.chapters.length.compareTo(a.chapters.length);
      return c != 0 ? c : localeCompare(a.title, b.title);
    },
  );
  const open = ['planned', 'active', 'paused'];

  // ---- Statements of fact
  final observations = <String>[];
  final empty = lengths.where((c) => c.words == 0).length;
  if (chapters.isNotEmpty && empty > 0) {
    observations.add('${_plural(empty, 'chapter')} of ${chapters.length} ${empty == 1 ? 'has' : 'have'} no text yet.');
  }
  if (written.length > 1) {
    final longest = pick((a, b) => a > b)!;
    final shortest = pick((a, b) => a < b)!;
    if (longest.words != shortest.words) {
      observations.add(
        'The longest chapter with text (“${longest.title}”, ${_plural(longest.words, 'word')}) is '
        '${(longest.words / shortest.words).toStringAsFixed(1)} times the length of the shortest (“${shortest.title}”, '
        '${_plural(shortest.words, 'word')}).',
      );
    }
  }
  final absent = [
    for (final r in sortedRows)
      if (r.chapters.isEmpty) r,
  ];
  if (absent.isNotEmpty) {
    observations.add(
      '${_plural(absent.length, 'character')} ${absent.length == 1 ? 'has' : 'have'} no appearance recorded in any '
      'chapter: ${absent.take(6).map((r) => r.name).join(', ')}${absent.length > 6 ? ', and others' : ''}.',
    );
  }
  for (final row in stableSorted(
    threadRows.where((t) => t.status == 'active' && (t.quietFor ?? 0) > 0),
    (a, b) => b.quietFor!.compareTo(a.quietFor!),
  ).take(5)) {
    observations.add(
      'The active thread “${row.title}” has no recorded development across the last '
      '${_plural(row.quietFor!, 'written chapter')}.',
    );
  }
  final noBeats = [
    for (final t in threadRows)
      if (t.status == 'active' && t.beats == 0) t,
  ];
  if (noBeats.isNotEmpty) {
    observations.add(
      '${_plural(noBeats.length, 'active thread')} ${noBeats.length == 1 ? 'has' : 'have'} no developments recorded: '
      '${noBeats.map((t) => t.title).join(', ')}.',
    );
  }
  if (base.lastWritingDay != null && base.lastWritingDay != today) {
    observations.add('The most recent day with writing logged is ${longDay(base.lastWritingDay!)}.');
  }

  return Analytics(
    progress: base,
    output: (
      totalWords: base.totalWords,
      targetWords: base.targetWords,
      percent: base.percent,
      today: base.today,
      week: base.week,
      month: base.month,
      averagePerWritingDay: writingDays.isEmpty ? 0 : _jsRound(net / writingDays.length),
      averagePerDayLast30: _jsRound(days.fold(0, (n, d) => n + d.net) / 30),
      days: days,
      weeks: base.weeks,
    ),
    sessions: (
      count: sessions.length,
      averageWords: base.averageWordsPerSession,
      averageMinutes: sessions.isEmpty ? 0 : _jsRound(base.totalMinutes / sessions.length),
      totalMinutes: base.totalMinutes,
      longestByWords: byWords == null ? null : (words: byWords.netWords, day: byWords.day),
      longestByTime: byTime == null ? null : (minutes: sessionMinutes(byTime), day: byTime.day),
      currentStreak: base.currentRun,
      longestStreak: longestStreak,
      writingDays: writingDays.length,
      lastWritingDay: base.lastWritingDay,
    ),
    structure: (
      chapters: chapters.length,
      scenes: scenes.length,
      averageChapter: written.isEmpty ? 0 : _jsRound(written.fold(0, (n, c) => n + c.words) / written.length),
      averageScene: sceneWords.isEmpty
          ? 0
          : _jsRound(sceneWords.fold(0, (n, s) => n + s.wordCount) / sceneWords.length),
      longest: pick((a, b) => a > b),
      shortest: pick((a, b) => a < b),
      lengths: lengths,
      pipeline: pipelineCounts,
    ),
    cast: (
      total: characters.length,
      appearing: sortedRows.where((r) => r.chapters.isNotEmpty).length,
      rows: sortedRows,
    ),
    threads: (
      total: threads.length,
      groups: [
        for (final g in threadGroups)
          (key: g.key, label: g.label, count: threads.where((t) => g.statuses.contains(t.statusKey)).length),
      ],
      openMysteries: threads.where((t) => t.category == 'mystery' && open.contains(t.statusKey)).length,
      characterArcs: threads.where((t) => t.category == 'character-arc').length,
      rows: threadRows,
    ),
    observations: observations,
  );
}
