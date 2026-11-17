// TOGETHER ON THE PAGE: the ties the book already shows. Characters the manuscript keeps putting on the page together
// (togetherAtLeast chapters or more, linked or named there) with no relationship recorded, as cards: the two portraits
// overlapping with a question between them, "Together in 5 chapters · 11–15", and **How are they tied?**, which records
// the tie in a press (friends, rivals, mentor and student…), or **Not tied**, which sets the pair aside for this novel
// (on this device). The most together first; three, then "Show all".
//
// It only says who is on the page together. Nothing is recorded until a press, and then only what was chosen. The pure
// parts of flutter_app/lib/features/characters/widgets/together_on_page.dart.
//
// The card: 14/12/10/6 padding, the low surface, radius 10, an outline. The faces: two circles of 42 (portrait, or the
// monogram on castTone in `inkOn` ink), the second 30 to the right of the first, each ringed 2 in the card's colour; at
// 26 from the left and 4 below them, a circle of 18 in the accent ringed 2 in the card's colour, a "?" (11, weight 800,
// on the accent). Cards in columns: (width + 12) / 300 of them, 1 to 3, 12 apart.

import { formatNumber, plural } from '../../desk/format';
import { CharacterRelation } from '../../records/relation';
import { relationshipPath } from '../../relationships/screens/relationshipPage';
import { relationPresets, typeFor } from '../../relationships/relationTypes';
import { type CastData } from '../castData';
import { type CharacterChanges } from '../characterChanges';
import { castTone, monogram } from '../screens/library';
import { type Together, pairKey, untiedTogether } from '../together';
import { inkOn, relateIn, storedList } from './common';

/** Where the pairs set aside as "Not tied" are kept, per novel (the settings store, on this device). */
export const notTiedKey = (novelId: string): string => `cast.notTied.${novelId}`;

/** How many cards are shown before "Show all". */
export const togetherFirst = 3;

/** The pairs set aside, from what is stored under notTiedKey. */
export function notTiedAside(stored: unknown): Set<string> {
  return new Set(storedList(stored));
}

/** What to store under notTiedKey when `pair` is set aside ("Not tied"). */
export function notTiedAfter(stored: unknown, pair: Together): string[] {
  return [...notTiedAside(stored), pairKey(pair.a, pair.b)];
}

/** Every pair with a relationship recorded, by pairKey. */
export function relatedPairs(cast: CastData): Set<string> {
  return new Set(cast.snapshot.rows('characterRelations').map((r) => {
    const relation = new CharacterRelation(r);
    return pairKey(relation.fromId, relation.toId);
  }));
}

/** The pairs to ask about: together often, untied, not set aside (`stored`: what is under notTiedKey). Their count is
 * what the strip of notes says ('together'). */
export function togetherPairs(cast: CastData, stored: unknown): Together[] {
  return untiedTogether(cast.list, cast.model.order, { related: relatedPairs(cast), setAside: notTiedAside(stored) });
}

/** The ties a press can record between `rowName` and another: every built-in type but Custom, a one-way one saying
 * who takes the first role ("Mentor / Student (Mira the mentor)"). */
export function tieChoices(rowName: string): { value: string; label: string }[] {
  return relationPresets
    .filter((p) => p.key !== 'custom')
    .map((p) => ({
      value: p.key,
      label: p.directional ? `${p.label} (${rowName} the ${p.fromRole.toLowerCase()})` : p.label,
    }));
}

/** One of a pair's faces: a portrait when they have one, else their monogram on their own colour. */
export type PairFace = { id: string; name: string; image: string | null; tone: string; ink: string; monogram: string };

/** One card: the two, what they are called together, how much of the book they share, and the menu of ties. */
export type PairCard = {
  pair: Together;
  a: PairFace;
  b: PairFace;
  title: string;
  said: string;
  tie: { label: string; semanticsLabel: string; tooltip: string; choices: { value: string; label: string }[] };
  notTied: string;
};

/** The panel, or null (nothing drawn, no gap) when there is no pair to ask about. `all`: "Show all" was pressed. */
export function togetherOnPage(
  cast: CastData,
  stored: unknown,
  all: boolean,
): { title: string; caption: string; cards: PairCard[]; toggle: string | null; count: number } | null {
  const pairs = togetherPairs(cast, stored);
  if (pairs.length === 0) return null;
  const shown = all ? pairs : pairs.slice(0, togetherFirst);
  const cards: PairCard[] = [];
  for (const t of shown) {
    const a = cast.listed(t.a);
    const b = cast.listed(t.b);
    if (a === null || b === null) continue;
    const face = (id: string, name: string, image: string | null): PairFace => ({
      id,
      name,
      image,
      tone: castTone(id),
      ink: inkOn(castTone(id)),
      monogram: monogram(name),
    });
    const aName = a.entry.name;
    const bName = b.entry.name;
    const first = t.chapters[0];
    const last = t.chapters[t.chapters.length - 1];
    const span = first === last ? '' : ` · ${first}–${last}`;
    cards.push({
      pair: t,
      a: face(t.a, aName, a.entry.image),
      b: face(t.b, bName, b.entry.image),
      title: `${aName} & ${bName}`,
      said: `Together in ${plural(t.chapters.length, 'chapter')}${span}`,
      tie: {
        label: 'How are they tied?',
        semanticsLabel: `How are ${aName} and ${bName} tied?`,
        tooltip: `Who is ${aName} to ${bName}?`,
        choices: tieChoices(aName),
      },
      notTied: 'Not tied',
    });
  }
  return {
    title: 'Together on the page',
    caption: 'The book keeps putting them side by side, and no tie is recorded.',
    cards,
    toggle: pairs.length > togetherFirst ? (all ? 'Show fewer' : `Show all ${formatNumber(pairs.length)}`) : null,
    count: pairs.length,
  };
}

/** A tie chosen for a pair: records it (inside CharacterService.change; a refusal throws ChangeRefused, said as it
 * is), and what to tell: "Ilse and Wren: Friends.", with **Open** to the relationship. */
export function tiePair(
  c: CharacterChanges,
  pair: Together,
  preset: string,
  names: { a: string; b: string },
): { relation: CharacterRelation; tell: string; action: { label: string; path: string } } {
  const made = relateIn(c, (r) => r.createRelation(pair.a, pair.b, preset));
  return {
    relation: made,
    tell: `${names.a} and ${names.b}: ${typeFor(preset).label}.`,
    action: { label: 'Open', path: relationshipPath(made.id) },
  };
}
