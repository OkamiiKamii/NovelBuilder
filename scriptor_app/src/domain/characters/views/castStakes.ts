// THE STAKES BOARD (stakes.ts reads it): the cast by what drives them, one card each: what they **want**, what **stands
// in their way**, what is **at stake**, and where they **end**, each from whichever field of their profile answers it.
// What no field answers yet is the question, asked of them ("What does Wren want?"): a press, a line, and it is in
// their profile. Above, **where they collide**: two whose wants name each other, or want the same thing. And how many
// of them the author knows the wants of.
//
// The pure parts of flutter_app/lib/features/characters/widgets/cast_stakes.dart.
//
// The count over a bar (4 high) of how many wants are known. Each collision: a card tinted errorContainer at 18%, a
// border error at 35%, radius 14: the two faces (36) either side of a bolt (22, error), why (13, bold, error), then each
// one's name and want (14, italic, three lines), each a press to them. Then the cards, in columns of width / 340, 1 to
// 4, 12 apart: the face (44 × 52.8, radius 22%), the name (16, bold) and roles (14, italic), four dots of 7 lit (the
// accent) for each board stake answered; then each stake: its label in capitals (10, bold, spacing 1.2; the accent when
// answered) in 78, and the answer (15.5, three lines) or the question (an add icon, 15, italic, the accent).

import { formatNumber, plural } from '../../desk/format';
import { type Entry } from '../../records/entry';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type Listed } from '../cast';
import { type CharacterChanges } from '../characterChanges';
import { recordStake } from '../recordLook';
import {
  type Collision,
  type Stake,
  type StakeHolder,
  askStake,
  boardStakes,
  collisions,
  stakeLabel,
  stakesOf,
} from '../stakes';

/** A character's fields, by name in lower case (a later field of the same name in place of an earlier one). */
export function stakeFields(e: Entry): Map<string, string> {
  return new Map(e.fields.map((f) => [dartToLowerCase(dartTrim(f.key)), f.value]));
}

/** The names a want is read for: the whole name, and the first word when it is three letters or more and not the
 * whole. */
export function stakeNames(e: Entry): string[] {
  const name = dartTrim(e.name);
  const first = name.split(/\s+/)[0];
  return [name, ...(first.length >= 3 && first !== name ? [first] : [])];
}

/** The example a question's prompt shows. */
export const stakeHint: Readonly<Record<Stake, string>> = {
  wants: 'To finish the chart her master left blank',
  needs: 'To trust someone else with the road',
  inTheWay: 'The Provost, who keeps the true tables',
  atStake: 'Her place, and her master’s name',
  ends: 'She walks the road, and comes back',
};

/** One stake on a card: its label (in capitals on the card), and the answer or the question. */
export type StakeLine = {
  stake: Stake;
  label: string;
  heading: string;
  text: string | null;
  ask: string;
  semanticsLabel: string;
};

/** One character's card. */
export type StakeCard = {
  listed: Listed;
  name: string;
  roles: string | null;
  answered: number;
  marks: boolean[];
  openLabel: string;
  lines: StakeLine[];
};

/** The board for `found`: the line on how many wants are known and its bar, the collisions, the cards. */
export function castStakes(found: readonly Listed[]): {
  said: string;
  part: number;
  collide: {
    heading: string;
    clashes: { collision: Collision; a: Listed; b: Listed; why: string; wants: [string, string] }[];
  } | null;
  cards: StakeCard[];
} {
  const holders: StakeHolder[] = found.map((l) => ({
    id: l.entry.id,
    name: dartTrim(l.entry.name),
    names: stakeNames(l.entry),
    stakes: stakesOf(stakeFields(l.entry)),
  }));
  const byId = new Map(found.map((l) => [l.entry.id, l]));
  const known = holders.filter((h) => h.stakes.has('wants')).length;
  const clashes = collisions(holders);
  const collide: ReturnType<typeof castStakes>['collide'] =
    clashes.length === 0
      ? null
      : {
          heading: 'WHERE THEY COLLIDE',
          clashes: clashes.flatMap((c) => {
            const a = byId.get(c.a);
            const b = byId.get(c.b);
            if (a === undefined || b === undefined) return [];
            const want = (l: Listed) => stakesOf(stakeFields(l.entry)).get('wants') ?? '';
            return [{ collision: c, a, b, why: c.why, wants: [want(a), want(b)] as [string, string] }];
          }),
        };
  return {
    said:
      known === holders.length
        ? holders.length === 1
          ? 'You know what they want.'
          : 'You know what every one of them wants.'
        : known === 0
          ? 'No one’s wants are written yet. A story runs on wants: press a question to answer it.'
          : `You know what ${formatNumber(known)} of ${plural(holders.length, 'character')} want. ` +
            'A story runs on wants: press a question to answer it.',
    part: holders.length === 0 ? 0 : known / holders.length,
    collide,
    cards: found.map(stakeCard),
  };
}

function stakeCard(l: Listed): StakeCard {
  const stakes = stakesOf(stakeFields(l.entry));
  const name = dartTrim(l.entry.name).length === 0 ? 'Unnamed' : dartTrim(l.entry.name);
  const answered = boardStakes.filter((s) => stakes.has(s)).length;
  const shown: Stake[] = [boardStakes[0], ...(stakes.has('needs') ? (['needs'] as Stake[]) : []), ...boardStakes.slice(1)];
  return {
    listed: l,
    name,
    roles: l.profile.roles.length > 0 ? l.profile.roles.join(' · ') : null,
    answered,
    marks: boardStakes.map((_, i) => i < answered),
    openLabel: `Open ${name}`,
    lines: shown.map((s) => {
      const text = stakes.get(s) ?? null;
      return {
        stake: s,
        label: stakeLabel[s],
        heading: stakeLabel[s].toUpperCase(),
        text,
        ask: askStake(s, name),
        semanticsLabel: text === null ? askStake(s, name) : `${stakeLabel[s]}: ${text}. Press to change it.`,
      };
    }),
  };
}

/** A question pressed: the prompt it opens (its current answer to start from). The name asked of is "they" when the
 * character has none. */
export function stakePrompt(
  l: Listed,
  stake: Stake,
  current: string,
): { title: string; label: string; initial: string; hint: string; confirmLabel: string } {
  const name = dartTrim(l.entry.name).length === 0 ? 'they' : dartTrim(l.entry.name);
  return { title: askStake(stake, name), label: stakeLabel[stake], initial: current, hint: stakeHint[stake], confirmLabel: 'Keep' };
}

/** What the prompt's answer changes (inside CharacterService.change), or null for nothing (cancelled, or the same as
 * it was). */
export function stakeAnswered(
  entryId: string,
  stake: Stake,
  current: string,
  text: string | null,
): ((c: CharacterChanges) => void) | null {
  if (text === null || dartTrim(text) === dartTrim(current)) return null;
  return (c) => recordStake(c, entryId, stake, dartTrim(text));
}
