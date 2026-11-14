/// THE CLIMB: how fast a character rises, the hardest thing to judge in a progression story (too fast and nothing is
/// earned, too slow and nothing happens). From the experience logged on their sheet, chapter by chapter: their level
/// at the end of each chapter, worked out by the system's own curve (`compute.dart`); the pace (the experience a
/// chapter, on average, so far); and, at that pace, where it leads: the level at the end of the chapters written,
/// the next round level, and the cap. And a chapter that gives far more than the others.
///
/// Reads only.
library;

import '../records/system.dart';
import 'compute.dart';
import 'formula.dart' show formatNumber;

/// One numbered track's climb for a sheet: its name, its cap (0: none), the level at the end of each chapter from the
/// story's start (chapter 0) to the last with experience, the same carried on at the pace, the pace, and what it says.
typedef Climb = ({
  String track,
  int cap,
  List<(int chapter, int level)> actual,
  List<(int chapter, int level)> projected,
  double perChapter,
  String unit,
  List<String> says,
});

/// How many chapters on the climb is carried, at most.
const climbAhead = 120;

/// The climbs of [sheet] in [system]: one for each numbered track with a curve that has experience logged. [chapterOf]
/// is the chapter number of each node (a chapter or scene); [chapters] how many chapters the book has; [who] the name
/// for what it says.
List<Climb> climbsOf(
  SystemBlueprint system,
  SystemSheet sheet, {
  required Map<String, int> chapterOf,
  required int chapters,
  String who = 'They',
}) {
  final profile = SheetProfile.of(sheet);
  final out = <Climb>[];
  for (final track in system.tracks) {
    if (track.kind != 'levels' || track.curve.trim().isEmpty) continue;
    // Each entry at its chapter: before the story, 0; a node not in the book is left out.
    final mine = <(int, XpEntry)>[
      for (final e in profile.xp)
        if (e.trackId == track.id && e.amount.isFinite)
          if (e.nodeId == null) (0, e) else if (chapterOf[e.nodeId] case final c?) (c, e),
    ];
    if (mine.isEmpty) continue;
    final last = mine.fold(0, (n, x) => x.$1 > n ? x.$1 : n);
    int levelWith(List<XpEntry> xp) =>
        computeSheet(system, profile.withXp(xp)).tracks.where((t) => t.track.id == track.id).firstOrNull?.level ?? 0;
    final actual = [
      for (var c = 0; c <= last; c++)
        (
          c,
          levelWith([
            for (final x in mine)
              if (x.$1 <= c) x.$2,
          ]),
        ),
    ];
    final earned = mine.where((x) => x.$1 >= 1).fold(0.0, (n, x) => n + x.$2.amount);
    final perChapter = last == 0 ? 0.0 : earned / last;
    final all = [for (final x in mine) x.$2];
    final projected = <(int, int)>[];
    final top = actual.last.$2;
    if (perChapter > 0 && !(track.cap > 0 && top >= track.cap)) {
      for (var k = 1; k <= climbAhead; k++) {
        final level = levelWith([
          ...all,
          XpEntry({'id': 'ahead', 'trackId': track.id, 'amount': perChapter * k}),
        ]);
        projected.add((last + k, level));
        if (track.cap > 0 && level >= track.cap) break;
      }
    }

    final unit = track.curveUnit.trim();
    final pace = '${formatNumber(perChapter.roundToDouble())}${unit.isEmpty ? '' : ' $unit'} a chapter';
    final says = <String>[];
    if (projected.isNotEmpty) {
      final name = track.name.trim().isEmpty ? 'Level' : track.name.trim();
      if (chapters > last) {
        final atEnd = projected.where((p) => p.$1 == chapters).firstOrNull ?? projected.last;
        says.add('At this pace ($pace), $name ${atEnd.$2} by the end of chapter ${atEnd.$1}, the last written.');
      } else {
        says.add('At this pace ($pace).');
      }
      final round = ((top ~/ 10) + 1) * 10;
      if (!(track.cap > 0 && round >= track.cap)) {
        final at = projected.where((p) => p.$2 >= round).firstOrNull;
        says.add(
          at == null ? '$name $round is more than $climbAhead chapters away.' : '$name $round in chapter ${at.$1}.',
        );
      }
      if (track.cap > 0) {
        final at = projected.where((p) => p.$2 >= track.cap).firstOrNull;
        says.add(
          at == null
              ? 'The cap ($name ${track.cap}) is more than $climbAhead chapters away.'
              : 'The cap, $name ${track.cap}, in chapter ${at.$1}.',
        );
      }
    } else if (track.cap > 0 && top >= track.cap) {
      says.add('$who ${track.cap == 1 ? 'is' : 'has reached'} the cap, ${track.name} ${track.cap}.');
    }
    // A chapter that gives far more than the others: three levels or more, and three times the average.
    if (last >= 3) {
      final total = actual.last.$2 - actual.first.$2;
      final average = total / last;
      var most = (chapter: 0, gain: 0);
      for (var c = 1; c <= last; c++) {
        final gain = actual[c].$2 - actual[c - 1].$2;
        if (gain > most.gain) most = (chapter: c, gain: gain);
      }
      if (most.gain >= 3 && most.gain >= 3 * average) {
        says.add('Chapter ${most.chapter} alone gives $who ${most.gain} levels, of $total in the book so far.');
      }
    }
    out.add((
      track: track.name,
      cap: track.cap,
      actual: actual,
      projected: projected,
      perChapter: perChapter,
      unit: unit,
      says: says,
    ));
  }
  return out;
}
