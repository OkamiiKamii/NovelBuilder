// THE ROAD TO THE DRAFT: the lengths a manuscript passes on the way to a whole draft. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/analytics/milestones.dart.

/** A length a manuscript passes on the way to a draft: how many words, and what it is called. */
export type Milestone = { words: number; name: string; short: string };

const lengths: readonly Milestone[] = [
  { words: 1000, name: 'the first thousand', short: '1k' },
  { words: 7500, name: 'a short story’s length', short: '7.5k' },
  { words: 17500, name: 'a novelette’s length', short: '17.5k' },
  { words: 40000, name: 'a novella’s length', short: '40k' },
];

/** The lengths fiction is measured by (the usual word counts for a short story, a novelette and a novella), then the
 * whole draft at the novel's own target (80,000 words, a common length for a novel, when none is set). */
export function milestonesFor(target: number | null | undefined): Milestone[] {
  const end = target != null && target > 0 ? target : 80000;
  return [
    ...lengths.filter((m) => m.words < end).map((m) => ({ ...m })),
    { words: end, name: 'the whole draft', short: shortCount(end) },
  ];
}

/** "1k", "7.5k", "80k", "120k"; under a thousand as it is. [words] is a whole number. */
export function shortCount(words: number): string {
  if (words < 1000) return `${words}`;
  const k = words / 1000;
  if (k === Math.round(k)) return `${Math.round(k)}k`;
  // Dart writes a double that is a whole number with ".0" ("2.0k" for 1,999).
  const tenths = Math.round(k * 10) / 10;
  return Number.isInteger(tenths) ? `${tenths}.0k` : `${tenths}k`;
}

/** Where [words] stands on a road ending at [end]: 0 to 1, measured by orders of magnitude from a hundred words, so
 * the first thousand is a real distance and not a sliver beside the last. */
export function roadPosition(words: number, end: number): number {
  if (words <= 100 || end <= 100) return words <= 0 ? 0 : 0.02;
  return Math.min(1, Math.max(0, (Math.log(words) - Math.log(100)) / (Math.log(end) - Math.log(100))));
}

/** The next milestone not yet reached (null when all are), and the last one passed. */
export function whereOnRoad(
  words: number,
  road: readonly Milestone[],
): { passed: Milestone | null; next: Milestone | null } {
  const passed = road.filter((m) => words >= m.words);
  return { passed: passed.length > 0 ? passed[passed.length - 1] : null, next: road.find((m) => words < m.words) ?? null };
}
