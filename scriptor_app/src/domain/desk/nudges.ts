// STUCK? A NUDGE: once the page has sat still a while with the caret on it, a way forward is offered: prompts to think
// with, the story's own first (how the last line ends, the chapter's plan, its threads, who is on the page), then a
// writer's moves in an order that changes with the day. Nothing is ever written for the author. Pure TypeScript. A port
// of flutter_app/lib/features/write/nudge.dart and the nudge's line and seed in chapter_editor.dart.

import { dartTrim } from '../text/dartString';
import { DartRandom, dartShuffled, dartStringHash } from './dartRandom';
import type { MarginNotes } from './pageAround';

/** What kind of nudge it is ("Your last line", "Your plan", "A thread", "Who is here", "A move"), and the nudge. */
export type Nudge = { kind: string; text: string };

/** How long the page sits still, with the caret on it, before "Stuck? A nudge" is offered (40 seconds). The next key,
 * a move of the caret or the page losing focus puts it away and starts the wait again; so does "Back to it". */
export const stuckAfterMs = 40_000;

/** Whether nudges are offered, kept on this device (on unless stored as `false`). */
export const nudgesKey = 'write.nudges';

/** Moves writers make when a scene stalls. Shuffled by the day, after the story's own. */
export const craftNudges: readonly string[] = [
  'Make it worse: what is the next thing that could go wrong, right now?',
  'Cut to the moment after. Skip what the reader can imagine.',
  'Someone says the wrong thing, or the true thing at the wrong time.',
  'Add one sound from outside the room.',
  'Give someone a small lie to tell.',
  'Write the scene’s last line now, then find the way to it.',
  'A secret almost slips. Who notices?',
  'Slow down: one gesture, in more detail than feels right.',
  'Change the light, the weather, or the time. What does it show?',
  'What does the point-of-view character refuse to think about?',
];

const spoke = /[”"]\s*$/;
const spokeSaid = /[”"][^“"”]*\b(said|asked)\b[^“"”]*$/;
const asked = /\?[”"’]?\s*$/;
const trailing = /(…|\.\.\.|—|–)\s*$/;

/** The nudges for a page, the story's own first: a reaction to how [lastLine] ends (someone spoke, a question, a
 * thought left hanging); the next of the chapter's planned beats and the two after it; what the chapter is for; up to
 * two threads that move here; whose eyes it is seen through and up to two others on the page (or, with nobody on the
 * page, the first one mentioned); then the ten moves, shuffled by [seed] (see [nudgeSeed]). The card shows the first,
 * and "Another" the next, round again after the last. */
export function nudgesFor(
  notes: Pick<MarginNotes, 'beats' | 'objective' | 'threads' | 'people' | 'mentioned'>,
  { lastLine, seed }: { lastLine: string; seed: number },
): Nudge[] {
  const out: Nudge[] = [];
  const line = dartTrim(lastLine);
  if (line !== '') {
    if (spoke.test(line) || spokeSaid.test(line)) {
      out.push({ kind: 'Your last line', text: 'Someone just spoke. What is said back, or pointedly not said?' });
    } else if (asked.test(line)) {
      out.push({ kind: 'Your last line', text: 'A question hangs there. Answer it, or have someone avoid it.' });
    } else if (trailing.test(line)) {
      out.push({ kind: 'Your last line', text: 'You stopped mid-thought. Finish the sentence badly, then keep going.' });
    }
  }
  if (notes.beats.length > 0) {
    out.push({ kind: 'Your plan', text: `A beat for this chapter: “${notes.beats[0]}”. Write towards it.` });
    for (const b of notes.beats.slice(1, 3)) {
      out.push({ kind: 'Your plan', text: `Later in the plan: “${b}”. What has to happen first?` });
    }
  }
  if (notes.objective !== '') {
    out.push({ kind: 'Your plan', text: `This chapter is for: “${notes.objective}”. What is the next step towards it?` });
  }
  for (const t of notes.threads.slice(0, 2)) {
    const development = dartTrim(t.development);
    const how = development === '' ? '' : `: “${development}”`;
    out.push({ kind: 'A thread', text: `“${t.title}” moves here${how}. Let it surface in a line.` });
  }
  const pov = notes.people.find((p) => p.pov);
  if (pov) {
    out.push({ kind: 'Who is here', text: `Through ${pov.name}’s eyes: one thing only they would notice right now.` });
  }
  for (const p of notes.people.filter((x) => !x.pov).slice(0, 2)) {
    out.push({ kind: 'Who is here', text: `What does ${p.name} want in this moment, and what is in the way?` });
  }
  if (notes.people.length === 0 && notes.mentioned.length > 0) {
    out.push({ kind: 'Who is here', text: `${notes.mentioned[0]} is meant to come up. Bring them in sideways.` });
  }
  for (const m of dartShuffled(craftNudges, new DartRandom(seed))) out.push({ kind: 'A move', text: m });
  return out;
}

/** The day's shuffle for a page: `year * 1000 + month * 40 + day` of the local date at [nowMs], plus the Dart hash of
 * the chapter's id, so each page has its own order and it changes from one day to the next. */
export function nudgeSeed(nowMs: number, nodeId: string): number {
  const now = new Date(Math.trunc(nowMs));
  return now.getFullYear() * 1000 + (now.getMonth() + 1) * 40 + now.getDate() + dartStringHash(nodeId);
}

/** The line the nudges read: the paragraph the caret is in (by index), when it has words; else the last paragraph on
 * the page with words; else "". */
export function nudgeLine(paragraphs: readonly string[], caretAt: number | null): string {
  const here = caretAt === null ? undefined : paragraphs[caretAt];
  if (here !== undefined && dartTrim(here) !== '') return here;
  let line = '';
  for (const p of paragraphs) if (dartTrim(p) !== '') line = p;
  return line;
}
