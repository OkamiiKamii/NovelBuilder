import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../shared/data/novel_store.dart';
import '../../shared/data/providers.dart';
import '../../shared/domain/analytics/analytics.dart';
import '../../shared/domain/analytics/goal_changes.dart';
import '../../shared/domain/analytics/journal.dart';
import '../../shared/domain/analytics/progress.dart';
import '../../shared/domain/codex/codex_changes.dart' show ChangeRefused;
import '../../shared/domain/ids.dart';
import '../../shared/domain/json.dart';
import '../../shared/domain/manuscript/board.dart' show TreeItem, buildTree, flattenTree;
import '../../shared/domain/progression/snapshots.dart' show ProgressSnapshot;
import '../../shared/domain/records/novel.dart';
import '../../shared/domain/records/story_node.dart';
import '../characters/character_actions.dart';
import '../characters/characters_providers.dart';

/// The clock the progress pages read "today" from (a test sets its own).
final progressClockProvider = Provider<DateTime Function()>((ref) => DateTime.now);

/// Everything the progress pages read, worked out only while one of them is open, from what is already saved: the
/// writing log, the goals and the manuscript. The editor does no extra work for it.
class ProgressData {
  ProgressData({
    required this.novelId,
    required this.novel,
    required this.sessions,
    required this.goals,
    required this.report,
    required this.journal,
    required this.analytics,
    required this.scopes,
  });

  final String novelId;
  final Novel novel;
  final List<WritingSession> sessions;
  final List<Goal> goals;
  final ProgressReport report;
  final Journal journal;
  final Analytics analytics;

  /// Parts of the manuscript a deadline can cover: everything but scenes, in reading order.
  final List<TreeItem> scopes;
}

final progressDataProvider = Provider.autoDispose<ProgressData?>((ref) {
  final cast = ref.watch(castProvider);
  if (cast == null) return null;
  final store = ref.watch(novelStoreProvider);
  final now = ref.watch(progressClockProvider)().millisecondsSinceEpoch;
  final s = cast.snapshot;
  final novel = Novel(s.project);
  final sessions = [for (final r in store.rowsIn(cast.novelId, 'writingSessions')) WritingSession(r)];
  final goals = [for (final r in store.rowsIn(cast.novelId, 'goals')) Goal(r)];
  final nodes = [for (final r in s.rows('chapters')) StoryNode(r)];
  final report = computeProgress(
    targetWordCount: novel.targetWordCount,
    nodes: nodes,
    sessions: sessions,
    goals: goals,
    now: now,
  );
  return ProgressData(
    novelId: cast.novelId,
    novel: novel,
    sessions: sessions,
    goals: goals,
    report: report,
    journal: computeJournal(
      sessions: sessions,
      totalWords: report.totalWords,
      targetWords: report.targetWords,
      chapters: report.chapters,
      now: now,
    ),
    analytics: computeAnalytics(
      cast.model,
      targetWordCount: novel.targetWordCount,
      docs: {for (final r in store.rowsIn(cast.novelId, 'chapterContents')) str(r['id']): r['doc']},
      snapshots: [for (final r in s.rows('progressSnapshots')) ProgressSnapshot(r)],
      sessions: sessions,
      goals: goals,
      now: now,
    ),
    scopes: [
      for (final t in flattenTree(buildTree(nodes)))
        if (t.node.kind != NodeKind.scene) t,
    ],
  );
});

/// Goals: every change one transaction, made on the records as stored at that moment and refused if they changed
/// elsewhere since.
class GoalService {
  GoalService(this.store, {DateTime Function()? clock, String Function()? createId})
    : _clock = clock ?? DateTime.now,
      _createId = createId ?? newId;

  final NovelStore store;
  final DateTime Function() _clock;
  final String Function() _createId;

  T change<T>(String projectId, T Function(GoalChanges c) apply) {
    final before =
        store.loadPart(projectId, goalCollections) ?? (throw StateError('That novel is no longer in the library.'));
    final now = _clock().millisecondsSinceEpoch;
    final changes = GoalChanges(before, now: now, createId: _createId);
    final result = apply(changes);
    store.saveChanges(before, changes.snapshot.copyWith(project: {...before.project, 'updatedAt': now}));
    return result;
  }
}

final goalServiceProvider = Provider<GoalService>((ref) => GoalService(ref.watch(novelStoreProvider)));

/// Changes to goals from a screen, beside everything a character screen can do.
class ProgressActions extends CharacterActions {
  ProgressActions(super.context, super.novelId);

  /// Makes the change; says why when it cannot be made. True when it was made.
  bool goals(void Function(GoalChanges c) apply) {
    try {
      container.read(goalServiceProvider).change(novelId, apply);
      return true;
    } on ChangeRefused catch (e) {
      tell(e.message);
    } on StaleWriteException catch (e) {
      tell('$e');
    }
    return false;
  }
}
