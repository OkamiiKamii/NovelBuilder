// THE EMPTY CHAIRS, at the head of a small cast in place of its photograph: the lead on a lit stage, and round them,
// dashed and empty, the places a story usually has that this one has not filled (emptyChairs.ts). Each asks its
// question by name ("Who taught Wren?"); a press opens the new character's card with the line begun (", Wren's
// mentor"), so only a name is left to write, and they join the cast already tied to the lead. A filled chair is gone
// from the stage. **Not now** puts the chairs away for this novel. The pure parts of
// flutter_app/lib/features/characters/widgets/empty_chairs.dart (and where characters_page.dart sets them out).
//
// What a press changes: a chair opens the casting call (screens/create.ts) with `{ line: chair.line }`; what it makes
// is the casting call's ("Add to the cast": the character, and the tie its line names to the lead). "Not now" writes
// `true` to the device's settings under `emptyChairsKey(novelId)`. Nothing else.

import { type CharacterRelation } from '../../records/relation';
import { dartTrim } from '../../text/dartString';
import { type Listed } from '../cast';
import { type EmptyChair, chairsLead, emptyChairs } from '../emptyChairs';

/** Where "Not now" on the empty chairs is kept, per novel. */
export function emptyChairsKey(novelId: string): string {
  return `cast.emptyChairs.hidden.${novelId}`;
}

/** The most in the cast for the chairs still to be set out: past this, the cast stands for its own photograph. */
export const chairsUntil = 3;

/** The lead and their empty chairs, when the chairs are to be set out: a cast (those not archived) of `chairsUntil`
 * or fewer, a lead, a chair still empty, and not put away for this novel (`hidden`: what the settings hold under
 * `emptyChairsKey`, `true` when put away). Null otherwise: the cast photograph is shown instead (castPhoto.ts). */
export function chairsFor(
  cast: readonly Listed[],
  relations: Iterable<CharacterRelation>,
  hidden: unknown,
): { lead: Listed; chairs: EmptyChair[] } | null {
  if (cast.length > chairsUntil || hidden === true) return null;
  const lead = chairsLead(cast);
  if (lead === null) return null;
  const chairs = emptyChairs(lead, cast, relations);
  return chairs.length === 0 ? null : { lead, chairs };
}

/** The lead's first name, as the chairs ask by it. */
export function chairsFirstName(lead: Listed): string {
  return dartTrim(lead.entry.name).split(/\s+/)[0];
}

export const emptyChairsWords = {
  heading: (first: string) => `Who else is in ${first}’s story?`,
  /** The whole stage, to a screen reader. */
  label: (first: string) => `Who else is in ${first}’s story`,
  intro: (first: string) =>
    `Each empty place is a question. Answer one with a name, and they join the cast already tied to ${first}.`,
  hide: 'Not now',
} as const;

/** How the stage is laid out in `width`: wide (a row: the first half of the chairs, the lead, the rest, 12 apart,
 * standing on a line 1.5 high, 8 below), when the width holds 104 for each chair and 1.4 more, and 12 between; else the
 * lead above (14 below it) and the chairs wrapped under, centred, 12 apart and 14 between rows. The light on the lead,
 * a radial gradient of the lead's colour at 20% to nothing, is centred (radius 0.6) when wide, else at (0, −0.6)
 * (radius 0.9). The lead stands 104 × 131 (their portrait or cameo, bare), their name on a plate 6 under it. */
export function chairsStage(
  width: number,
  chairs: readonly EmptyChair[],
): {
  wide: boolean;
  chairWidth: number;
  left: EmptyChair[];
  right: EmptyChair[];
  light: { center: { x: number; y: number }; radius: number; opacity: number };
} {
  const chairWidth = 104;
  const wide = width >= chairWidth * (chairs.length + 1.4) + 12 * chairs.length;
  const half = Math.floor(chairs.length / 2);
  return {
    wide,
    chairWidth: wide ? chairWidth : Math.min(chairWidth, (width - 24) / 3),
    left: wide ? chairs.slice(0, half) : [],
    right: wide ? chairs.slice(half) : [...chairs],
    light: { center: wide ? { x: 0, y: 0 } : { x: 0, y: -0.6 }, radius: wide ? 0.6 : 0.9, opacity: 0.2 },
  };
}

/** An empty chair as drawn in its 72 × 90 box: a dashed oval (inset 2; dashes 5 long every 9 along it, stroke 1.6, the
 * primary colour at 80%); in it a faint bust (the on-surface-variant colour at 22%): a head and, clipped to the oval,
 * shoulders; and a "+" in a primary circle of 24 at (0, 0.9) of the box. Its question under it (3 lines at most). */
export function chairDrawing(width = 72, height = 90): {
  oval: { cx: number; cy: number; rx: number; ry: number };
  dash: { on: number; off: number; width: number; opacity: number };
  head: { cx: number; cy: number; r: number };
  shoulders: { cx: number; cy: number; rx: number; ry: number };
  bustOpacity: number;
  plus: { cx: number; cy: number; r: number };
} {
  const ow = width - 4;
  const oh = height - 4;
  const cx = 2 + ow / 2;
  const top = 2;
  const bottom = 2 + oh;
  return {
    oval: { cx, cy: 2 + oh / 2, rx: ow / 2, ry: oh / 2 },
    dash: { on: 5, off: 4, width: 1.6, opacity: 0.8 },
    head: { cx, cy: top + oh * 0.36, r: ow * 0.19 },
    shoulders: { cx, cy: bottom + oh * 0.02, rx: (ow * 0.86) / 2, ry: (oh * 0.62) / 2 },
    bustOpacity: 0.22,
    plus: { cx: width / 2, cy: height / 2 + 0.9 * ((height - 24) / 2), r: 12 },
  };
}
