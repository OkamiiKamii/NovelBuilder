import 'progress.dart';

/// One day of the writing log: its net words and how many sessions it took.
typedef JournalDay = ({String day, int net, int sessions});

/// A threshold the author has passed, or has yet to.
typedef Milestone = ({String label, String kind, bool reached, String? toGo});

/// THE WRITING JOURNAL: the writing log read as a year of days, a run of days written, a pace and the milestones
/// passed. Worked out from the log and the manuscript as they are; nothing here is stored.
class Journal {
  Journal._({
    required this.today,
    required this.days,
    required this.currentRun,
    required this.bestRun,
    required this.pacePerDay,
    required this.finishDay,
    required this.milestones,
  });

  final String today;

  /// Every day with a session, by day.
  final Map<String, JournalDay> days;

  /// Days written in a row, up to today (or yesterday, while today is still open).
  final int currentRun;
  final int bestRun;

  /// Net words a day over the last 30 days, when any were written.
  final int? pacePerDay;

  /// When the manuscript reaches its target at that pace; null without a target, a pace, or once reached.
  final String? finishDay;

  final List<Milestone> milestones;

  /// How strongly [day] is shaded, 0 (nothing logged) to 4, against the author's own days: a day of revising is 1,
  /// a day with words added is 1 to 4 by where it falls among the days they added words.
  int level(String day) {
    final d = days[day];
    if (d == null) return 0;
    if (d.net <= 0) return 1;
    final rank = _positive.indexWhere((n) => n >= d.net);
    final share = (rank < 0 ? _positive.length : rank + 1) / _positive.length;
    return share <= 0.25
        ? 1
        : share <= 0.5
        ? 2
        : share <= 0.75
        ? 3
        : 4;
  }

  late final List<int> _positive = [
    for (final d in days.values)
      if (d.net > 0) d.net,
  ]..sort();
}

const wordMilestones = [1000, 10000, 25000, 50000, 100000];
const runMilestones = [7, 30, 100];

Journal computeJournal({
  required List<WritingSession> sessions,
  required int totalWords,
  required int? targetWords,
  required ({int total, int completed}) chapters,
  required num now,
}) {
  final today = dayKeyOf(now);
  final days = <String, JournalDay>{};
  for (final s in sessions) {
    if (s.day.isEmpty) continue;
    final d = days[s.day];
    days[s.day] = (day: s.day, net: (d?.net ?? 0) + s.netWords, sessions: (d?.sessions ?? 0) + 1);
  }

  var currentRun = 0;
  for (var day = days.containsKey(today) ? today : addDays(today, -1); days.containsKey(day); day = addDays(day, -1)) {
    currentRun++;
  }
  var bestRun = 0;
  var run = 0;
  String? previous;
  for (final day in days.keys.toList()..sort()) {
    run = previous != null && addDays(previous, 1) == day ? run + 1 : 1;
    if (run > bestRun) bestRun = run;
    previous = day;
  }

  final from = addDays(today, -29);
  var recent = 0;
  for (final d in days.values) {
    if (d.day.compareTo(from) >= 0 && d.day.compareTo(today) <= 0) recent += d.net;
  }
  final pace = recent > 0 ? (recent / 30).ceil() : null;
  String? finishDay;
  if (pace != null && targetWords != null && targetWords > totalWords) {
    finishDay = addDays(today, ((targetWords - totalWords) / pace).ceil());
  }

  String words(int n) => '${grouped(n)} ${n == 1 ? 'word' : 'words'}';
  final milestones = <Milestone>[];
  var nextWords = true;
  for (final m in {...wordMilestones, ?targetWords}.toList()..sort()) {
    if (m <= 0) continue;
    final reached = totalWords >= m;
    milestones.add((
      label: m == targetWords ? 'Your target: ${grouped(m)}' : words(m),
      kind: 'words',
      reached: reached,
      toGo: !reached && nextWords ? '${words(m - totalWords)} to go' : null,
    ));
    if (!reached) nextWords = false;
  }
  var nextRun = true;
  for (final m in runMilestones) {
    final reached = bestRun >= m;
    milestones.add((
      label: '$m days in a row',
      kind: 'run',
      reached: reached,
      toGo: !reached && nextRun ? '${m - currentRun} more ${m - currentRun == 1 ? 'day' : 'days'}' : null,
    ));
    if (!reached) nextRun = false;
  }
  if (chapters.total > 0) {
    milestones.add((label: 'First chapter complete', kind: 'chapters', reached: chapters.completed >= 1, toGo: null));
    if (chapters.total > 1) {
      final left = chapters.total - chapters.completed;
      milestones.add((
        label: 'Every chapter complete',
        kind: 'chapters',
        reached: left == 0,
        toGo: left > 0 && chapters.completed > 0 ? '$left to go' : null,
      ));
    }
  }

  return Journal._(
    today: today,
    days: days,
    currentRun: currentRun,
    bestRun: bestRun,
    pacePerDay: pace,
    finishDay: finishDay,
    milestones: milestones,
  );
}
