// THE WRITER'S RANK AND LEVEL (new in Scriptor, from the owner's mock-ups; FEATURES.md "New in Scriptor"). Earned only
// by writing, read from the writing log every novel keeps on this device:
//
//   1 XP for every word written (words added in writing sessions; deleting never costs XP)
//   100 XP for every day written (a day with words added, in any novel)
//   250 XP for every chapter or scene finished (status Final or Published)
//
// Level n needs 50 × (n − 1)² XP in all: level 2 at 50 XP, level 10 at 4,050, level 50 at 120,050, level 125 at about
// 770,000. Ranks by level: F 1–9, E 10–19, D 20–29, C 30–44, B 45–59, A 60–79, S 80–99, SS 100–119, SSS 120 and up.

export const xpPerDayWritten = 100;
export const xpPerChapterFinished = 250;

export const ranks = [
  { name: 'F', from: 1 },
  { name: 'E', from: 10 },
  { name: 'D', from: 20 },
  { name: 'C', from: 30 },
  { name: 'B', from: 45 },
  { name: 'A', from: 60 },
  { name: 'S', from: 80 },
  { name: 'SS', from: 100 },
  { name: 'SSS', from: 120 },
] as const;

export type RankName = (typeof ranks)[number]['name'];

/** The XP needed in all to reach `level`. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) ** 2;
}

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1);
}

export function rankForLevel(level: number): RankName {
  let name: RankName = 'F';
  for (const r of ranks) if (level >= r.from) name = r.name;
  return name;
}

export type WriterRank = {
  xp: number;
  level: number;
  rank: RankName;
  /** How far through the current level, 0–1. */
  progress: number;
  xpToNext: number;
  wordsWritten: number;
  daysWritten: number;
  chaptersFinished: number;
};

/** From every writing session (`added` words and the `day` it was on) and how many chapters are finished. */
export function writerRank(
  sessions: ReadonlyArray<{ added: number; day: string | null }>,
  chaptersFinished: number,
): WriterRank {
  let wordsWritten = 0;
  const days = new Set<string>();
  for (const s of sessions) {
    const added = Number.isFinite(s.added) && s.added > 0 ? Math.floor(s.added) : 0;
    wordsWritten += added;
    if (added > 0 && s.day) days.add(s.day);
  }
  const xp = wordsWritten + days.size * xpPerDayWritten + Math.max(0, chaptersFinished) * xpPerChapterFinished;
  const level = levelForXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return {
    xp,
    level,
    rank: rankForLevel(level),
    progress: (xp - from) / (to - from),
    xpToNext: to - xp,
    wordsWritten,
    daysWritten: days.size,
    chaptersFinished,
  };
}
