import 'dart:math' as math;

/// A length a manuscript passes on the way to a draft: how many words, and what it is called.
typedef Milestone = ({int words, String name, String short});

/// The lengths fiction is measured by (the usual word counts for a short story, a novelette and a novella), then the
/// whole draft at the novel's own target (80,000 words, a common length for a novel, when none is set).
List<Milestone> milestonesFor(int? target) {
  final end = target != null && target > 0 ? target : 80000;
  return [
    for (final m in const <Milestone>[
      (words: 1000, name: 'the first thousand', short: '1k'),
      (words: 7500, name: 'a short story’s length', short: '7.5k'),
      (words: 17500, name: 'a novelette’s length', short: '17.5k'),
      (words: 40000, name: 'a novella’s length', short: '40k'),
    ])
      if (m.words < end) m,
    (words: end, name: 'the whole draft', short: shortCount(end)),
  ];
}

/// "1k", "7.5k", "80k", "120k"; under a thousand as it is.
String shortCount(int words) {
  if (words < 1000) return '$words';
  final k = words / 1000;
  return k == k.roundToDouble() ? '${k.round()}k' : '${(k * 10).round() / 10}k';
}

/// Where [words] stands on a road ending at [end]: 0 to 1, measured by orders of magnitude from a hundred words, so the
/// first thousand is a real distance and not a sliver beside the last.
double roadPosition(int words, int end) {
  if (words <= 100 || end <= 100) return words <= 0 ? 0 : 0.02;
  return ((math.log(words) - math.log(100)) / (math.log(end) - math.log(100))).clamp(0.0, 1.0);
}

/// The next milestone not yet reached (null when all are), and the last one passed.
({Milestone? passed, Milestone? next}) whereOnRoad(int words, List<Milestone> road) =>
    (passed: road.where((m) => words >= m.words).lastOrNull, next: road.where((m) => words < m.words).firstOrNull);
