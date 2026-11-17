// THE CLIMB: how fast a character rises. From the experience logged on their sheet, chapter by chapter: their level
// at the end of each chapter, worked out by the system's own curve (./compute.ts); the pace (the experience a chapter,
// on average, so far); and, at that pace, where it leads: the level at the end of the chapters written, the next round
// level, and the cap. And a chapter that gives far more than the others. Reads only. A port of
// flutter_app/lib/shared/domain/systems/climb.dart.

import { type SystemBlueprint, type SystemSheet, type XpEntry } from '../records/system';
import { dartTrim } from '../text/dartString';
import { SheetProfile, computeSheet, xpEntry } from './compute';
import { dartRound } from './faceOff';
import { formatNumber } from './formula';

/** One numbered track's climb for a sheet: its name, its cap (0: none), the level at the end of each chapter from the
 * story's start (chapter 0) to the last with experience, the same carried on at the pace, the pace, and what it
 * says. Points are [chapter, level]. */
export type Climb = {
  track: string;
  cap: number;
  actual: [number, number][];
  projected: [number, number][];
  perChapter: number;
  unit: string;
  says: string[];
};

/** How many chapters on the climb is carried, at most. */
export const climbAhead = 120;

/** The climbs of `sheet` in `system`: one for each numbered track with a curve that has experience logged.
 * `chapterOf` is the chapter number of each node (a chapter or scene); `chapters` how many chapters the book has;
 * `who` the name for what it says. */
export function climbsOf(
  system: SystemBlueprint,
  sheet: SystemSheet,
  args: { chapterOf: ReadonlyMap<string, number>; chapters: number; who?: string },
): Climb[] {
  const who = args.who ?? 'They';
  const profile = SheetProfile.of(sheet);
  const out: Climb[] = [];
  for (const track of system.tracks) {
    if (track.kind !== 'levels' || dartTrim(track.curve).length === 0) continue;
    // Each entry at its chapter: before the story, 0; a node not in the book is left out.
    const mine: [number, XpEntry][] = [];
    for (const e of profile.xp) {
      if (e.trackId !== track.id || !Number.isFinite(e.amount)) continue;
      if (e.nodeId === null) mine.push([0, e]);
      else {
        const c = args.chapterOf.get(e.nodeId);
        if (c !== undefined) mine.push([c, e]);
      }
    }
    if (mine.length === 0) continue;
    const last = mine.reduce((n, x) => (x[0] > n ? x[0] : n), 0);
    const levelWith = (xp: readonly XpEntry[]): number =>
      computeSheet(system, profile.withXp(xp)).tracks.find((t) => t.track.id === track.id)?.level ?? 0;
    const actual: [number, number][] = [];
    for (let c = 0; c <= last; c++) actual.push([c, levelWith(mine.filter((x) => x[0] <= c).map((x) => x[1]))]);
    const earned = mine.filter((x) => x[0] >= 1).reduce((n, x) => n + x[1].amount, 0);
    const perChapter = last === 0 ? 0 : earned / last;
    const all = mine.map((x) => x[1]);
    const projected: [number, number][] = [];
    const top = actual[actual.length - 1][1];
    if (perChapter > 0 && !(track.cap > 0 && top >= track.cap)) {
      for (let k = 1; k <= climbAhead; k++) {
        const level = levelWith([...all, xpEntry({ id: 'ahead', trackId: track.id, amount: perChapter * k })]);
        projected.push([last + k, level]);
        if (track.cap > 0 && level >= track.cap) break;
      }
    }

    const unit = dartTrim(track.curveUnit);
    const pace = `${formatNumber(dartRound(perChapter))}${unit.length === 0 ? '' : ` ${unit}`} a chapter`;
    const says: string[] = [];
    if (projected.length > 0) {
      const name = dartTrim(track.name).length === 0 ? 'Level' : dartTrim(track.name);
      if (args.chapters > last) {
        const atEnd = projected.find((p) => p[0] === args.chapters) ?? projected[projected.length - 1];
        says.push(`At this pace (${pace}), ${name} ${atEnd[1]} by the end of chapter ${atEnd[0]}, the last written.`);
      } else {
        says.push(`At this pace (${pace}).`);
      }
      const round = (Math.trunc(top / 10) + 1) * 10;
      if (!(track.cap > 0 && round >= track.cap)) {
        const at = projected.find((p) => p[1] >= round);
        says.push(at === undefined ? `${name} ${round} is more than ${climbAhead} chapters away.` : `${name} ${round} in chapter ${at[0]}.`);
      }
      if (track.cap > 0) {
        const at = projected.find((p) => p[1] >= track.cap);
        says.push(
          at === undefined
            ? `The cap (${name} ${track.cap}) is more than ${climbAhead} chapters away.`
            : `The cap, ${name} ${track.cap}, in chapter ${at[0]}.`,
        );
      }
    } else if (track.cap > 0 && top >= track.cap) {
      says.push(`${who} ${track.cap === 1 ? 'is' : 'has reached'} the cap, ${track.name} ${track.cap}.`);
    }
    // A chapter that gives far more than the others: three levels or more, and three times the average.
    if (last >= 3) {
      const total = actual[actual.length - 1][1] - actual[0][1];
      const average = total / last;
      let most = { chapter: 0, gain: 0 };
      for (let c = 1; c <= last; c++) {
        const gain = actual[c][1] - actual[c - 1][1];
        if (gain > most.gain) most = { chapter: c, gain };
      }
      if (most.gain >= 3 && most.gain >= 3 * average) {
        says.push(`Chapter ${most.chapter} alone gives ${who} ${most.gain} levels, of ${total} in the book so far.`);
      }
    }
    out.push({ track: track.name, cap: track.cap, actual, projected, perChapter, unit, says });
  }
  return out;
}
