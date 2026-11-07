import '../json.dart';
import '../json_record.dart';
import '../manuscript/board.dart' show buildTree, flattenTree;
import '../manuscript/outline.dart' show isDocument;
import '../model/story_order.dart' show subtreeIds;
import '../records/story_node.dart';

/// WRITING PROGRESS (as in the original app): the manuscript, the session log and the goals, described. It only
/// describes; nothing here judges. A day without writing is simply a day without an entry.

// ---------------------------------------------------------------------------------------------------- days

String _pad(int n) => n.toString().padLeft(2, '0');

/// The author's local day, written `yyyy-mm-dd`.
String dayOf(DateTime d) => '${d.year}-${_pad(d.month)}-${_pad(d.day)}';
String dayKeyOf(num millis) => dayOf(DateTime.fromMillisecondsSinceEpoch(millis.toInt()));

DateTime parseDay(String key) {
  final p = key.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

String addDays(String key, int days) {
  final d = parseDay(key);
  return dayOf(DateTime(d.year, d.month, d.day + days));
}

/// The Monday on or before the given day.
String weekStart(String key) => addDays(key, -(parseDay(key).weekday - 1));
String monthOf(String key) => key.substring(0, 7);
int daysBetween(String from, String to) =>
    (DateTime.utc(
              parseDay(to).year,
              parseDay(to).month,
              parseDay(to).day,
            ).difference(DateTime.utc(parseDay(from).year, parseDay(from).month, parseDay(from).day)).inHours /
            24)
        .round();

const _shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _longMonths = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];

/// "Oct 25", as the original's dashboard writes a day.
String shortDay(String key) {
  final d = parseDay(key);
  return '${_shortMonths[d.month - 1]} ${d.day}';
}

/// "October 25, 2026".
String longDay(String key) {
  final d = parseDay(key);
  return '${_longMonths[d.month - 1]} ${d.day}, ${d.year}';
}

/// "Oct 25, 2026", as the original's pages write a date.
String mediumDay(String key) {
  final d = parseDay(key);
  return '${_shortMonths[d.month - 1]} ${d.day}, ${d.year}';
}

const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/// "Sat, Oct 24".
String weekdayDay(String key) => '${_weekdays[parseDay(key).weekday - 1]}, ${shortDay(key)}';

/// "9:05 AM", the time of a moment in the author's day.
String clockTime(num millis) {
  final t = DateTime.fromMillisecondsSinceEpoch(millis.toInt());
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${_pad(t.minute)} ${t.hour < 12 ? 'AM' : 'PM'}';
}

/// "1,234" (a whole number, grouped by thousands as the original's English text does).
String grouped(num n) {
  final whole = n.round();
  final digits = whole.abs().toString();
  final out = StringBuffer(whole < 0 ? '-' : '');
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
    out.write(digits[i]);
  }
  return out.toString();
}

// ---------------------------------------------------------------------------------------------------- records

class WritingSession extends JsonRecord {
  WritingSession(super.raw);
  String get day => str(raw['day']);
  num get startedAt => numOrNull(raw['startedAt']) ?? 0;
  num get lastActiveAt => numOrNull(raw['lastActiveAt']) ?? 0;
  int get netWords => intOrNull(raw['netWords']) ?? 0;
  int get added => intOrNull(raw['added']) ?? 0;
  int get removed => intOrNull(raw['removed']) ?? 0;
}

class Goal extends JsonRecord {
  Goal(super.raw);

  /// `daily`, `weekly`, `deadline` or `task`.
  String get kind => str(raw['kind']);
  String get title => str(raw['title']);
  int? get targetWords => intOrNull(raw['targetWords']);
  String? get dueDate => strOrNull(raw['dueDate']);
  String? get nodeId => idOrNull(raw['nodeId']);
  bool get done => raw['done'] == true;
}

/// From "Draft Complete" onward a chapter or scene counts as completed.
const completed = [NodeStatus.draftComplete, NodeStatus.revising, NodeStatus.finalDraft, NodeStatus.published];

class PeriodTotals {
  PeriodTotals(this.net, this.added, this.removed, this.sessions, this.minutes, this.activeDays);
  final int net;
  final int added;
  final int removed;
  final int sessions;
  final int minutes;

  /// Days in the period with any writing or editing.
  final int activeDays;

  JsonMap toJson() => {
    'net': net,
    'added': added,
    'removed': removed,
    'sessions': sessions,
    'minutes': minutes,
    'activeDays': activeDays,
  };
}

typedef TrendPoint = ({String key, String label, int net, bool current});

int sessionMinutes(WritingSession s) {
  final m = ((s.lastActiveAt - s.startedAt) / 60000 + 0.5).floor();
  return m < 1 ? 1 : m;
}

PeriodTotals _totals(Iterable<WritingSession> list) {
  final sessions = list.toList();
  return PeriodTotals(
    sessions.fold(0, (n, s) => n + s.netWords),
    sessions.fold(0, (n, s) => n + s.added),
    sessions.fold(0, (n, s) => n + s.removed),
    sessions.length,
    sessions.fold(0, (n, s) => n + sessionMinutes(s)),
    {for (final s in sessions) s.day}.length,
  );
}

int _percentOf(num value, num target) => ((value / target * 100) + 0.5).floor().clamp(0, 100);

class ProgressReport {
  ProgressReport({
    required this.totalWords,
    required this.targetWords,
    required this.percent,
    required this.today,
    required this.week,
    required this.month,
    required this.chapters,
    required this.scenes,
    required this.averageChapterWords,
    required this.statusCounts,
    required this.sessionCount,
    required this.averageWordsPerSession,
    required this.totalMinutes,
    required this.currentRun,
    required this.daysWrittenLast30,
    required this.lastWritingDay,
    required this.days,
    required this.weeks,
    required this.daily,
    required this.weekly,
    required this.deadlines,
    required this.tasks,
  });
  final int totalWords;
  final int? targetWords;
  final int? percent;
  final PeriodTotals today;
  final PeriodTotals week;
  final PeriodTotals month;
  final ({int total, int completed}) chapters;
  final ({int total, int completed}) scenes;
  final int averageChapterWords;
  final Map<NodeStatus, int> statusCounts;
  final int sessionCount;
  final int averageWordsPerSession;
  final int totalMinutes;

  /// Consecutive days with writing, ending today or yesterday.
  final int currentRun;
  final int daysWrittenLast30;
  final String? lastWritingDay;
  final List<TrendPoint> days;
  final List<TrendPoint> weeks;
  final ({Goal goal, int words, int target, int percent})? daily;
  final ({Goal goal, int words, int target, int percent})? weekly;
  final List<
    ({Goal goal, String? scope, int words, int? target, int? percent, int daysLeft, int? perDay, bool reached})
  >
  deadlines;
  final ({int total, int done}) tasks;
}

int _jsRound(num n) => (n + 0.5).floor();

ProgressReport computeProgress({
  required int? targetWordCount,
  required List<StoryNode> nodes,
  required List<WritingSession> sessions,
  required List<Goal> goals,
  required num now,
}) {
  final today = dayKeyOf(now);
  final thisWeek = weekStart(today);
  final tree = flattenTree(buildTree(nodes));
  final totalWords = nodes.fold(0, (n, node) => n + node.wordCount);
  final chapters = [
    for (final t in tree)
      if (t.node.kind == NodeKind.chapter) t,
  ];
  final scenes = [
    for (final n in nodes)
      if (n.kind == NodeKind.scene) n,
  ];
  final written = [
    for (final t in chapters)
      if (t.totalWords > 0) t,
  ];
  final statusCounts = {for (final s in NodeStatus.values) s: 0};
  for (final node in nodes) {
    if (isDocument(node.kind)) statusCounts[node.status] = statusCounts[node.status]! + 1;
  }
  final byDay = <String, int>{};
  for (final s in sessions) {
    byDay[s.day] = (byDay[s.day] ?? 0) + s.netWords;
  }
  var currentRun = 0;
  for (
    var day = byDay.containsKey(today) ? today : addDays(today, -1);
    byDay.containsKey(day);
    day = addDays(day, -1)
  ) {
    currentRun++;
  }
  final writingDays = byDay.keys.toList()..sort();
  final days = [
    for (var i = 0; i < 14; i++)
      () {
        final key = addDays(today, i - 13);
        return (key: key, label: shortDay(key), net: byDay[key] ?? 0, current: key == today);
      }(),
  ];
  // Each day's week, worked out once: a calendar date is slow to make, and the log has a session or more a day.
  final weeksOf = <String, String>{};
  String weekOf(WritingSession s) => weeksOf[s.day] ??= weekStart(s.day);
  final weeks = [
    for (var i = 0; i < 8; i++)
      () {
        final key = addDays(thisWeek, (i - 7) * 7);
        final net = sessions.where((s) => weekOf(s) == key).fold(0, (n, s) => n + s.netWords);
        return (key: key, label: shortDay(key), net: net, current: key == thisWeek);
      }(),
  ];
  final todayTotals = _totals(sessions.where((s) => s.day == today));
  final weekTotals = _totals(sessions.where((s) => weekOf(s) == thisWeek));
  ({Goal goal, int words, int target, int percent})? target(String kind, int words) {
    final goal = goals.where((g) => g.kind == kind && (g.targetWords ?? 0) != 0).firstOrNull;
    return goal == null
        ? null
        : (goal: goal, words: words, target: goal.targetWords!, percent: _percentOf(words, goal.targetWords!));
  }

  final byId = {for (final n in nodes) n.id: n};
  final deadlines = [
    for (final goal
        in goals.where((g) => g.kind == 'deadline' && (g.dueDate ?? '').isNotEmpty).toList()
          ..sort((a, b) => a.dueDate!.compareTo(b.dueDate!)))
      () {
        final scopeNode = goal.nodeId == null ? null : byId[goal.nodeId];
        final words = scopeNode != null
            ? subtreeIds(nodes, scopeNode.id).fold(0, (n, id) => n + (byId[id]?.wordCount ?? 0))
            : totalWords;
        final daysLeft = daysBetween(today, goal.dueDate!);
        final t = goal.targetWords;
        final reached = t != null && words >= t;
        return (
          goal: goal,
          scope: scopeNode?.title,
          words: words,
          target: t,
          percent: t != null && t != 0 ? _percentOf(words, t) : null,
          daysLeft: daysLeft,
          perDay: t != null && t != 0 && !reached && daysLeft > 0 ? ((t - words) / daysLeft).ceil() : null,
          reached: reached,
        );
      }(),
  ];
  final tasks = [
    for (final g in goals)
      if (g.kind == 'task') g,
  ];
  final all = _totals(sessions);
  return ProgressReport(
    totalWords: totalWords,
    targetWords: targetWordCount,
    percent: targetWordCount != null && targetWordCount != 0 ? _percentOf(totalWords, targetWordCount) : null,
    today: todayTotals,
    week: weekTotals,
    month: _totals(sessions.where((s) => monthOf(s.day) == monthOf(today))),
    chapters: (total: chapters.length, completed: chapters.where((t) => completed.contains(t.node.status)).length),
    scenes: (total: scenes.length, completed: scenes.where((n) => completed.contains(n.status)).length),
    averageChapterWords: written.isEmpty ? 0 : _jsRound(written.fold(0, (n, t) => n + t.totalWords) / written.length),
    statusCounts: statusCounts,
    sessionCount: sessions.length,
    averageWordsPerSession: sessions.isEmpty ? 0 : _jsRound(all.net / sessions.length),
    totalMinutes: all.minutes,
    currentRun: currentRun,
    daysWrittenLast30: byDay.keys.where((d) => daysBetween(d, today) >= 0 && daysBetween(d, today) < 30).length,
    lastWritingDay: writingDays.lastOrNull,
    days: days,
    weeks: weeks,
    daily: target('daily', todayTotals.net),
    weekly: target('weekly', weekTotals.net),
    deadlines: deadlines,
    tasks: (total: tasks.length, done: tasks.where((t) => t.done).length),
  );
}
