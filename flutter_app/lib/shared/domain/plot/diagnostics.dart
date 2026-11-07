import 'dart:math' as math;

import '../model/story_order.dart';
import '../records/story_node.dart';
import '../records/thread.dart';
import '../stable_sort.dart';

/// A development with the place in the manuscript it points at worked out.
class PlacedBeat {
  PlacedBeat(this.beat, this.node, this.chapter, {required this.missing});
  final ThreadBeat beat;

  /// The chapter or scene, when it still exists.
  final StoryNode? node;

  /// Number of the chapter it falls in, counting chapters in reading order.
  final int? chapter;

  /// The beat names a chapter or scene that is no longer in the manuscript.
  final bool missing;
}

typedef ThreadIssue = ({String kind, String message});

class ThreadReport {
  ThreadReport(this.thread, this.beats, this.quietFor, this.issues, this.silenced);
  final PlotThread thread;

  /// Developments in reading order; ones without a place come last.
  final List<PlacedBeat> beats;

  /// Chapters written since the thread's latest development, when both are known.
  final int? quietFor;

  /// Things the author may want to look at. Empty when the thread is muted.
  final List<ThreadIssue> issues;

  /// How many observations are held back because the author muted the thread.
  final int silenced;
}

class PlotReport {
  PlotReport(this.frontier, this.chapterCount, this.reports);

  /// Number of the furthest chapter that has any words. 0 when nothing is written.
  final int frontier;
  final int chapterCount;
  final List<ThreadReport> reports;
}

/// How many chapters an active thread may go without a development before it is flagged.
const defaultQuietAfter = 20;
const quietChoices = [5, 10, 15, 20, 30, 50];
const openStatuses = ['planned', 'active', 'paused'];
const threadStatusLabels = {
  'planned': 'Planned',
  'active': 'Active',
  'paused': 'Paused',
  'resolved': 'Resolved',
  'abandoned': 'Abandoned',
  'retconned': 'Retconned',
  'custom': 'Custom',
};

String _plural(int n, String word) => '$n $word${n == 1 ? '' : 's'}';

bool _isDocument(StoryNode n) => n.kind == NodeKind.chapter || n.kind == NodeKind.scene;

/// NON-INVASIVE DIAGNOSTIC RULE. Compares each thread with how far the manuscript has got and returns plain
/// observations. It writes nothing, changes no status, and every message states a fact rather than a verdict. Whether a
/// quiet thread is forgotten, implied or resting is the author's call.
PlotReport diagnose(List<PlotThread> threads, List<StoryNode> nodes, [int quietAfter = defaultQuietAfter]) {
  final order = StoryOrder.of(nodes);
  final byId = {for (final n in nodes) n.id: n};
  final chapterCount = order.chapters.length;
  int? chapterOf(String id) {
    final n = order.chapterNumber[id];
    return n == null || chapterCount == 0 ? null : math.min(n, chapterCount);
  }

  final frontier = nodes
      .where((n) => _isDocument(n) && n.wordCount > 0)
      .map((n) => chapterOf(n.id) ?? 0)
      .fold(0, math.max);
  final threshold = math.max(1, quietAfter == 0 ? defaultQuietAfter : quietAfter);
  const top = 9007199254740991;

  final reports = [
    for (final thread in threads)
      () {
        final indexed = [
          for (final (index, beat) in thread.beats.indexed)
            () {
              final node = beat.nodeId == null ? null : byId[beat.nodeId];
              // In reading order; then beats whose chapter is gone; then beats not placed yet.
              final position = node != null ? (order.position[node.id] ?? 0) : (beat.nodeId != null ? top - 1 : top);
              return (
                placed: PlacedBeat(
                  beat,
                  node,
                  node == null ? null : chapterOf(node.id),
                  missing: beat.nodeId != null && node == null,
                ),
                index: index,
                position: position,
              );
            }(),
        ];
        final beats = [
          for (final x in stableSorted(indexed, (a, b) {
            final byPosition = a.position.compareTo(b.position);
            return byPosition != 0 ? byPosition : a.index - b.index;
          }))
            x.placed,
        ];
        final placed = [
          for (final b in beats)
            if (b.chapter != null) b,
        ];
        final reached = [
          for (final b in placed)
            if (b.chapter! <= frontier) b,
        ];
        final last = reached.lastOrNull;
        final quietFor = frontier > 0 && last != null ? frontier - last.chapter! : null;
        final status = thread.statusKey;
        final open = openStatuses.contains(status);
        final issues = <ThreadIssue>[];
        final lastSeen = last == null
            ? ''
            : 'the last was “${last.beat.title}” in chapter ${last.chapter}, and the manuscript has reached chapter $frontier';
        if (status == 'active' && quietFor != null && quietFor >= threshold) {
          issues.add((
            kind: 'quiet',
            message: 'Active, with no development recorded for ${_plural(quietFor, 'chapter')}: $lastSeen.',
          ));
        } else if (status == 'paused' && quietFor != null && quietFor >= threshold * 2) {
          issues.add((kind: 'paused', message: 'Paused for ${_plural(quietFor, 'chapter')}: $lastSeen.'));
        }
        if (status == 'active' && thread.beats.isEmpty && frontier > 0) {
          issues.add((kind: 'no-beats', message: 'Marked Active, with no developments recorded yet.'));
        }
        if (status == 'planned' && reached.isNotEmpty) {
          issues.add((
            kind: 'planned-underway',
            message:
                'Marked Planned, and it already has ${_plural(reached.length, 'development')} in chapters that are written.',
          ));
        }
        if (open) {
          ({int from, int to})? widest;
          for (var i = 1; i < placed.length; i++) {
            final from = placed[i - 1].chapter!;
            final to = placed[i].chapter!;
            if (to - from >= threshold && (widest == null || to - from > widest.to - widest.from)) {
              widest = (from: from, to: to);
            }
          }
          if (widest != null) {
            issues.add((
              kind: 'gap',
              message:
                  'Goes ${_plural(widest.to - widest.from, 'chapter')} without a development, between chapters ${widest.from} and ${widest.to}.',
            ));
          }
          final target = thread.targetNodeId == null ? null : byId[thread.targetNodeId];
          if (target != null) {
            // A volume or arc is "over" after the last chapter inside it.
            final ends = subtreeIds(
              nodes,
              target.id,
            ).where((id) => _isDocument(byId[id]!)).map((id) => chapterOf(id) ?? 0).fold(0, math.max);
            if (ends > 0 && frontier > ends) {
              issues.add((
                kind: 'overdue',
                message:
                    'Meant to resolve by “${target.title}”; the manuscript is ${_plural(frontier - ends, 'chapter')} past it and the thread is still ${threadStatusLabels[status]}.',
              ));
            }
          }
        }
        final gone = beats.where((b) => b.missing).length;
        if (gone > 0) {
          issues.add((
            kind: 'missing-chapter',
            message:
                '${_plural(gone, 'development')} ${gone == 1 ? 'points' : 'point'} at a chapter or scene that is no longer in the manuscript.',
          ));
        }
        final muted = thread.raw['muted'] == true;
        return ThreadReport(thread, beats, quietFor, muted ? const [] : issues, muted ? issues.length : 0);
      }(),
  ];
  return PlotReport(frontier, chapterCount, reports);
}

/// "Ch 3" for a placed development, or why it has no chapter.
String beatPlace(PlacedBeat placed) =>
    placed.chapter != null ? 'Ch ${placed.chapter}' : (placed.missing ? 'Chapter removed' : 'Not placed');
