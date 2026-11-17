// WRITING SPRINTS: a stretch of time to write in without stopping. The author picks a length, the desk clears into
// focus mode, a ring of time runs out beside the words added in the sprint, and when it ends a card says what was
// written. Words are counted from the chapters themselves, as the meter's "this session" is (net: deleting counts
// against), across every chapter written in during the sprint. Nothing is stored but the best sprint on this device
// (`write.bestSprint` in the device's settings, `{words, seconds}`); a sprint is for the moment, like focus mode.
// Pure TypeScript. A port of the logic of flutter_app/lib/features/write/sprint.dart: the sprint as values and the
// steps that change it; the screen keeps the one-second timer, the focus mode and the settings store.
//
// The steps, as the Dart notifier takes them:
// - Start (`startSprint`): the result card is cleared, focus mode turned on, and a timer ticks every second.
// - Each second (`tickSprint`): on reaching the length, finish (finished).
// - The open chapter reports its words (`reportSprint`) when the sprint starts with it open, when it is opened
//   during a sprint, and 300 ms after each change to its text.
// - Stop (`stopSprint`): under a minute in, the sprint is dropped and focus mode turned off, nothing said; after
//   that, finish (stopped).
// - Finish (`finishSprint`): the timer stops, the best kept if beaten, the sprint ends, focus mode is turned off and
//   the card shows the result. "Another sprint" starts one of the same length; "Done" clears the card.

import { type JsonMap, isMap } from '../json';
import { dartRound, formatNumber, plural } from '../desk/format';

/** The lengths offered, in minutes. */
export const sprintLengths: readonly number[] = [10, 15, 25, 45];

/** Where the best sprint on this device is kept (the device's settings): `{words: int, seconds: int}`. */
export const bestSprintKey = 'write.bestSprint';

/** A sprint under way: its length, the seconds gone, and for each chapter written in, its words when it joined the
 * sprint ([bases]) and now ([counts]). Leaving a chapter and coming back keeps its first count, so nothing is lost or
 * counted twice. */
export type Sprint = {
  minutes: number;
  elapsed: number;
  bases: ReadonlyMap<string, number>;
  counts: ReadonlyMap<string, number>;
};

/** What a finished (or stopped) sprint came to. [best] when it is the most words in a sprint on this device. */
export type SprintResult = { words: number; seconds: number; minutes: number; finished: boolean; best: boolean };

/** A new sprint of [minutes]. */
export function startSprint(minutes: number): Sprint {
  return { minutes, elapsed: 0, bases: new Map(), counts: new Map() };
}

/** The words a sprint has added, over every chapter written in. */
export function sprintWords(s: Sprint): number {
  let sum = 0;
  for (const [id, n] of s.counts) sum += n - (s.bases.get(id) ?? n);
  return sum;
}

/** A chapter's words now. Its first report during the sprint is where it starts from. The same sprint (the same
 * object) when nothing changed; else a new one (new maps), so a screen's state sees the change. */
export function reportSprint(s: Sprint, nodeId: string, words: number): Sprint {
  if (s.counts.get(nodeId) === words) return s;
  return {
    minutes: s.minutes,
    elapsed: s.elapsed,
    bases: s.bases.has(nodeId) ? s.bases : new Map(s.bases).set(nodeId, words),
    counts: new Map(s.counts).set(nodeId, words),
  };
}

/** What a second passing does: the sprint a second on, or, on reaching its length, time to finish it. */
export type SprintTick = { kind: 'running'; sprint: Sprint } | { kind: 'finish'; finished: true; elapsed: number };

export function tickSprint(s: Sprint): SprintTick {
  const elapsed = s.elapsed + 1;
  if (elapsed >= s.minutes * 60) return { kind: 'finish', finished: true, elapsed };
  return { kind: 'running', sprint: { ...s, elapsed } };
}

/** What Stop does: under a minute in, drop the sprint and say nothing; after that, finish it (stopped). */
export type SprintStop = { kind: 'drop' } | { kind: 'finish'; finished: false; elapsed: number };

export const sprintSilentUnderSeconds = 60;

export function stopSprint(s: Sprint): SprintStop {
  return s.elapsed < sprintSilentUnderSeconds ? { kind: 'drop' } : { kind: 'finish', finished: false, elapsed: s.elapsed };
}

/** The words of the best sprint kept on this device ([stored]: what `write.bestSprint` holds), 0 when none: a map
 * whose `words` is a whole number. */
export function bestSprintWords(stored: unknown): number {
  if (!isMap(stored)) return 0;
  const w = stored['words'];
  return typeof w === 'number' && Number.isInteger(w) ? w : 0;
}

/** A sprint finished ([finished]: its time ran out; else stopped) after [elapsed] seconds, against the best stored:
 * the result for the card, and the new best to store under `write.bestSprint` (null: keep what is there). A best is
 * more than nothing and more than the best before. */
export function finishSprint(
  s: Sprint,
  { finished, elapsed, stored }: { finished: boolean; elapsed: number; stored: unknown },
): { result: SprintResult; newBest: JsonMap | null } {
  const words = sprintWords(s);
  const best = words > 0 && words > bestSprintWords(stored);
  return {
    result: { words, seconds: elapsed, minutes: s.minutes, finished, best },
    newBest: best ? { words, seconds: elapsed } : null,
  };
}

// ---------------------------------------------------------------------------------------------------- words on screen

/** "9:05": seconds as minutes and seconds (Dart's `~/` and `%`: a negative count reads as Dart would). */
export function clockOf(seconds: number): string {
  const m = Math.trunc(seconds / 60);
  const r = ((seconds % 60) + 60) % 60;
  return `${m === 0 ? 0 : m}:${String(r).padStart(2, '0')}`;
}

/** "+12 words", "−3 words" (a true minus sign), "+1 word". */
export function signedWords(words: number): string {
  const n = Math.abs(words);
  return `${words < 0 ? '−' : '+'}${formatNumber(n)} ${n === 1 ? 'word' : 'words'}`;
}

// The button that starts one.
export const sprintButtonLabel = 'Sprint';
export const sprintButtonTooltip = 'Start a writing sprint';

/** "Sprint for 25 minutes", each length in the menu. */
export function sprintMenuLabel(minutes: number): string {
  return `Sprint for ${minutes} minutes`;
}

/** The bar under the page while a sprint runs: the ring of time left (it empties as the sprint runs), the clock of
 * time left, the words added, and Stop. */
export type SprintBarView = {
  ringValue: number;
  clock: string;
  words: string;
  ringLabel: string;
  ringValueLabel: string;
  stop: string;
};

export function sprintBarOf(s: Sprint): SprintBarView {
  const total = s.minutes * 60;
  const left = total - s.elapsed;
  return {
    ringValue: 1 - s.elapsed / total,
    clock: clockOf(left),
    words: `${signedWords(sprintWords(s))} this sprint`,
    ringLabel: 'Time left in the sprint',
    ringValueLabel: `${clockOf(left)} of ${s.minutes} minutes`,
    stop: 'Stop',
  };
}

/** The whole minutes a stopped sprint ran, rounded, at least 1 (and at most 2^30, as the Dart clamps it). */
export function minutesRun(seconds: number): number {
  return Math.min(2 ** 30, Math.max(1, dartRound(seconds / 60)));
}

/** The words a minute, rounded; 0 (none shown) under 50 words, as "1 word a minute" says nothing. */
export function wordsPerMinute(words: number, seconds: number): number {
  if (words < 50 || seconds <= 0) return 0;
  return dartRound(words / (seconds / 60));
}

/** The card when a sprint ends: a ticket with the heading and words won, its stub the time and pace; "Your best
 * sprint yet" when it is; and "Another sprint" (of the same length) or "Done". */
export type SprintCardView = {
  heading: string;
  words: string;
  time: string;
  pace: string | null;
  best: string | null;
  again: string;
  done: string;
};

export function sprintCardOf(r: SprintResult): SprintCardView {
  const pace = wordsPerMinute(r.words, r.seconds);
  return {
    heading: r.finished ? 'Sprint complete' : 'Sprint stopped',
    words: signedWords(r.words),
    time: r.finished
      ? `in ${plural(r.minutes, 'minute')}`
      : `in ${plural(minutesRun(r.seconds), 'minute')} of ${r.minutes}`,
    pace: pace > 0 ? `${formatNumber(pace)} ${pace === 1 ? 'word' : 'words'} a minute` : null,
    best: r.best ? 'Your best sprint yet' : null,
    again: 'Another sprint',
    done: 'Done',
  };
}
