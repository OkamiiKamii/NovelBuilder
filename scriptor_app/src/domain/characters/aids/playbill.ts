// DRAMATIS PERSONAE: an empty cast is a playbill to fill, not a note and a button. Its lines: the hero, who stands
// against them, who stands by them, and as many more as wanted ("Add another part", up to 8 lines). **Raise the
// curtain** makes them all at once, each with the part's role (Protagonist, Antagonist, Supporting), and records the
// hero's ties: the one against as Enemies, the one beside as Friends, so the relationship map has its first lines. Any
// line can be left empty; nothing is made until the press. One at a time is still "Create a character" (the casting
// call). The pure parts of flutter_app/lib/features/characters/widgets/playbill.dart.
//
// What a press changes: "Raise the curtain" (pressable once any line has a name), in one change:
// `raiseTheCurtain(c, lines)`: `create({ name, roles: [part.role] })` for each name written, in order, then, when one
// is the hero, `createRelation(hero, id, part.tie)` for each with a tie (RelationChanges); then says `curtainMessage`.

import { RelationChanges } from '../../relationships/relationChanges';
import { dartTrim } from '../../text/dartString';
import { type CharacterChanges } from '../characterChanges';

/** One part on the playbill: what the line says, the role the character takes, an example name, and the tie to the
 * hero it records (none for the hero, or for the cast beyond). */
export type PlaybillPart = { part: string; role: string; hint: string; tie: string | null };

export const playbillParts: readonly PlaybillPart[] = [
  { part: 'The hero', role: 'Protagonist', hint: 'Mira Vance', tie: null },
  { part: 'Who stands against them', role: 'Antagonist', hint: 'The Grey Abbot', tie: 'enemies' },
  { part: 'Who stands by them', role: 'Supporting', hint: 'Kai', tie: 'friends' },
];

/** Further parts, added a line at a time: the cast beyond, supporting, with no tie assumed. */
export const playbillMore: PlaybillPart = { part: 'And', role: 'Supporting', hint: 'Orrin', tie: null };

/** The most lines the playbill takes. */
export const playbillMost = 8;

/** Makes the cast of a filled playbill in one change: a character for each name written (as written), with the part's
 * role, and the hero's ties to those who stand against and by them. Returns how many characters were made. */
export function raiseTheCurtain(c: CharacterChanges, lines: readonly (readonly [PlaybillPart, string])[]): number {
  const named = lines.filter(([, name]) => dartTrim(name).length > 0).map(([part, name]) => [part, dartTrim(name)] as const);
  if (named.length === 0) return 0;
  const r = new RelationChanges(c.snapshot, { now: c.now, createId: () => c.newId() });
  const ids = named.map(([part, name]) => [part, r.create({ name, roles: [part.role] }).id] as const);
  const hero = ids.find(([part]) => part.tie === null && part.role === 'Protagonist')?.[1] ?? null;
  if (hero !== null) {
    for (const [part, id] of ids) if (part.tie !== null) r.createRelation(hero, id, part.tie);
  }
  c.snapshot = r.snapshot;
  return named.length;
}

/** What is said once the cast is made. */
export function curtainMessage(made: number): string | null {
  if (made <= 0) return null;
  return made === 1 ? 'Your first character is in the cast.' : `Your cast of ${made} is ready.`;
}

export const playbillWords = {
  title: 'Dramatis personae',
  intro: 'Who is in your story? Name them on the playbill; leave any line empty.',
  add: 'Add another part',
  raise: 'Raise the curtain',
  create: 'Create a character',
  note: 'The hero’s ties are recorded too: against them as Enemies, beside them as Friends.',
} as const;

/** The playbill's lines as typed. */
export class PlaybillState {
  readonly lines: [PlaybillPart, string][] = playbillParts.map((p) => [p, '']);

  type(index: number, text: string): void {
    this.lines[index][1] = text;
  }

  /** "Add another part": pressable until there are 8 lines. */
  get canAdd(): boolean {
    return this.lines.length < playbillMost;
  }

  add(): void {
    if (this.canAdd) this.lines.push([playbillMore, '']);
  }

  /** "Raise the curtain" is pressable once a name is written. */
  get any(): boolean {
    return this.lines.some(([, text]) => dartTrim(text).length > 0);
  }

  /** A line as shown: its part over or beside the field (beside it, 200 wide, from 420 wide up), the example name as
   * the hint, the role under it; and its words to a screen reader ("And, Supporting 2" for the further parts). */
  line(index: number): { part: string; hint: string; helper: string; label: string } {
    const [part] = this.lines[index];
    const more = index >= playbillParts.length ? ` ${index - playbillParts.length + 2}` : '';
    return { part: part.part, hint: part.hint, helper: part.role, label: `${part.part}, ${part.role}${more}` };
  }
}
