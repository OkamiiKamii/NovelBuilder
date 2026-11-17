// THE FIRST LINE ON THE MAP: an empty relationship map is where the first relationship is drawn, not a note saying to
// go elsewhere. The logic of flutter_app/lib/features/relationships/first_tie.dart. With two characters or more it is
// the cast's table of pairs (`CastTies`, a characters screen): a "+" in a pair records a tie, and the map draws it.
// With fewer it is a sentence to finish, "___ and ___ are Rivals.", that makes whoever is not yet in the cast and their
// relationship in one press (a character already there is named, not asked for).

import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type RelationChanges } from '../relationChanges';
import { presetFor, relationPresets } from '../relationTypes';
import { type Choice } from './cast';

/** A character as the first tie knows them. `people` are the cast's characters as listed, without the archived. */
export type TiePerson = { id: string; name: string };

/** What is typed and chosen: the two names and the type (it starts as Friends). */
export type FirstTieDraft = { first: string; second: string; preset: string };

export const initialFirstTie: FirstTieDraft = { first: '', second: '', preset: 'friends' };

/** The types offered: every built-in type but Custom. */
export const firstTieTypes: readonly Choice[] = relationPresets
  .filter((p) => p.key !== 'custom')
  .map((p) => ({ value: p.key, label: p.label }));

export type FirstTieView =
  | { kind: 'pairs'; heading: string; text: string }
  | {
      kind: 'sentence';
      heading: string;
      text: string;
      /** The character already in the cast, named; null: asked for (`firstField`). */
      known: TiePerson | null;
      firstField: { hint: string; helper: string } | null;
      and: string;
      secondField: { hint: string; helper: string };
      are: string;
      /** For a one-way type: who is which, as it will be drawn. */
      roles: string | null;
      draw: { label: string; enabled: boolean };
    };

/** What the empty map shows, for the cast and the draft. */
export function firstTieView(people: readonly TiePerson[], draft: FirstTieDraft): FirstTieView {
  const heading = 'Draw the first lines';
  if (people.length >= 2) {
    return {
      kind: 'pairs',
      heading,
      text: 'Who is each of your characters to the others? Press a “+” to say, and the map draws it.',
    };
  }
  const known = people[0] ?? null;
  const firstName = known?.name ?? dartTrim(draft.first);
  const second = dartTrim(draft.second);
  const preset = presetFor(draft.preset);
  return {
    kind: 'sentence',
    heading,
    text: 'Name two people and what they are to each other, and the map has its first line.',
    known,
    firstField: known === null ? { hint: 'Mira', helper: 'A character' } : null,
    and: 'and',
    secondField: { hint: 'Kai', helper: 'Another' },
    are: 'are',
    roles: preset.directional
      ? `${firstName.length === 0 ? 'The first' : firstName} is the ${dartToLowerCase(preset.fromRole)}, ` +
        `${second.length === 0 ? 'the second' : second} the ${dartToLowerCase(preset.toRole)}.`
      : null,
    draw: { label: 'Draw it on the map', enabled: firstName.length > 0 && second.length > 0 },
  };
}

/** "Draw it on the map": makes whoever is not in the cast yet (`createCharacter`, which is CharacterChanges.create on
 * the same change, returning the new character's id) and their relationship. Returns what to tell the author. */
export function drawFirstTie(
  r: RelationChanges,
  people: readonly TiePerson[],
  draft: FirstTieDraft,
  createCharacter: (name: string) => string,
): string {
  const known = people[0] ?? null;
  const firstName = known?.name ?? dartTrim(draft.first);
  const second = dartTrim(draft.second);
  const a = known?.id ?? createCharacter(firstName);
  const b = createCharacter(second);
  r.createRelation(a, b, draft.preset);
  return `${firstName} and ${second} are on the map.`;
}
