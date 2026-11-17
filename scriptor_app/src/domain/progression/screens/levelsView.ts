// LEVELS IN YOUR PAGES (levelsInPages.ts reads them): everything the chapters give a level to, kept as the book is
// written, never by hand, and kept with whose it is. A character's levels (their own, and those of what they carry)
// are on their page (`theirLevels`); on Systems (`levelsOnSystems`), what is no one's, and who holds the rest. Each
// thing with the level it is at now and since when, a line of its steps, and, pressed, every step: its chapter, its
// level, the sentence, and **Read it there**. A level lower than before, where the page does not say it fell, is
// marked. The author's word over the reading: **Not theirs**, **Give to…** and **Not a level**, kept on this device.
// It only reads the book. The pure parts of flutter_app/lib/features/progression/widgets/levels_view.dart.
//
// The heading: a stairs icon (20, primary), LEVELS (heading face 12, bold, primary, spacing 2), the line under it (14,
// onSurfaceVariant). On Systems: "Reading the book…" while it is read, the empty line (14.5, italic), ON THEIR PAGES
// (11, bold, primary, spacing 1.6) with a chip per holder, the most first ("Kade: their level, Hunter Armor"), and NO
// ONE'S with the list. The list: the slips line (14, error) when some go back down; a card per thing, or per family
// ("ARMOR · 2 versions" over its versions, a divider between). A thing: its title (heading face 16, bold) over "since
// chapter 9 · 3 steps from Level 1" (13); its steps drawn in 70 × 28 when it has more than one (`stepsDrawing`); the
// level in a box (primaryContainer, radius 10: LEVEL 8, the number 20 heavy); an expand arrow. Opened: each step,
// latest first ("Ch. 9\nLevel 4" in 74, error when it went back; the sentence in quotes, italic; the notes; Read it
// there), then the presses at the right.

import { type CastData } from '../../characters/castData';
import { dartSort } from '../../manuscript/dartSort';
import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { type LevelStep, type Levelled, levelsInPagesJob } from '../../systems/levelsInPages';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartToLowerCase } from '../../text/dartString';

/** Where the names set aside ("Not a level") are kept, for a novel: on this device. */
export const levelsAsideKey = (novelId: string): string => `levels.aside.${novelId}`;

/** Where the author's word on whose a thing is ("Not theirs", "Give to…") is kept, for a novel: on this device. A map
 * of names (in lower case) to a character's id, or '' for no one's. */
export const levelsOwnersKey = (novelId: string): string => `levels.owners.${novelId}`;

/** The names set aside, as stored. */
export function levelsAside(stored: unknown): Set<string> {
  return new Set(Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : []);
}

/** The author's word on whose each thing is, as stored. */
export function levelsAssigned(stored: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (stored !== null && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) if (typeof value === 'string') out.set(key, value);
  }
  return out;
}

/** What the reading is made from that comes of the cast: the chapters in reading order, who can hold a level (each
 * character not archived with names to find), and the two in words for the reading's key. */
export function levelsInputs(cast: CastData): {
  order: string[];
  people: { id: string; names: string[] }[];
  chapters: string;
  who: string;
} {
  const order = readingOrder(cast.model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  const names = cast.findNames;
  const people = cast.list
    .filter((l) => !l.profile.archived && (names[l.entry.id] ?? []).length > 0)
    .map((l) => ({ id: l.entry.id, names: names[l.entry.id] }));
  return {
    order,
    people,
    chapters: order.map((id) => `${id}:${cast.model.nodes.get(id)?.wordCount}`).join(','),
    who: people.map((p) => `${p.id}:${p.names.join('|')}`).join(','),
  };
}

/** Everything the reading is made of, as one key: the novel, its chapters and their words, who can hold a level, the
 * author's word, and the text as stored (the store's count of writes to it). The same key is the same reading, kept
 * and shared by Systems and every character's page. */
export function levelsReadingKey(cast: CastData, aside: ReadonlySet<string>, assigned: ReadonlyMap<string, string>, textVersion: number): string {
  const from = levelsInputs(cast);
  return [
    cast.novelId,
    from.chapters,
    from.who,
    [...aside].join('|'),
    [...assigned].map(([k, v]) => `${k}=${v}`).join('|'),
    `${textVersion}`,
  ].join('\u0000');
}

/** The reading, as a job away from the screen, over the chapters as stored. */
export function levelsJob(
  cast: CastData,
  storedContents: readonly string[],
  aside: ReadonlySet<string>,
  assigned: ReadonlyMap<string, string>,
): () => Levelled[] {
  const from = levelsInputs(cast);
  return levelsInPagesJob(storedContents, from.order, aside, { people: from.people, assigned });
}

/** "Not a level": what is stored, and what is said. */
export function setAsideLevel(stored: unknown, l: Levelled): { store: string[]; said: string } {
  return { store: [...levelsAside(stored), dartToLowerCase(l.name)], said: `${l.name} is set aside: not a level.` };
}

/** "Give to…" (`to` a character's id) or "Not theirs" (`to` null): what is stored. */
export function giveLevel(stored: unknown, l: Levelled, to: string | null): Record<string, string> {
  return { ...Object.fromEntries(levelsAssigned(stored)), [dartToLowerCase(l.name)]: to ?? '' };
}

export const levelsWords = {
  heading: 'LEVELS',
  systemsLine:
    'Everything your chapters give a level to, kept as you write. A character’s levels, and those of what ' +
    'they carry, are on their page.',
  reading: 'Reading the book…',
  empty:
    'Nothing in your chapters has a level yet. Write “the Hunter Armor reached Level 2”, or “Hunter Armor ' +
    'Lv. 2”, and it is kept from that chapter on, on the page of whoever it is.',
  onTheirPages: 'ON THEIR PAGES',
  noOnes: 'NO ONE’S',
  give: 'Give to…',
  notALevel: 'Not a level',
  notTheirs: 'Not theirs',
  readThere: 'Read it there',
} as const;

/** On Systems: who holds what (the most first), and what is no one's. */
export function levelsOnSystems(
  cast: CastData,
  levels: readonly Levelled[] | null,
): {
  holders: { id: string; key: string; label: string }[];
  noOnes: Levelled[];
} {
  const all = levels ?? [];
  const held = new Map<string, Levelled[]>();
  for (const l of all) {
    if (l.owner === null) continue;
    let list = held.get(l.owner);
    if (list === undefined) held.set(l.owner, (list = []));
    list.push(l);
  }
  const holders = dartSort([...held], (a, b) => b[1].length - a[1].length);
  return {
    holders: holders.map(([id, things]) => ({
      id,
      key: `holder-${id}`,
      label: `${cast.nameOf(id) ?? 'Someone'}: ${things.map((t) => (t.self ? 'their level' : t.name)).join(', ')}`,
    })),
    noOnes: all.filter((l) => l.owner === null),
  };
}

/** "Whose is X?": the characters not archived to give it to; and what is said once given. */
export function giveChoices(cast: CastData, l: Levelled): { title: string; people: { id: string; name: string }[]; said: (id: string) => string } {
  const people = cast.list.filter((x) => !x.profile.archived).map((x) => ({ id: x.entry.id, name: x.entry.name }));
  return {
    title: `Whose is ${l.name}?`,
    people,
    said: (id) => `${l.name} is ${people.find((p) => p.id === id)?.name ?? ''}’s now: on their page.`,
  };
}

/** On a character's page: their own level first, then those of what they carry; null when they have none. */
export function theirLevels(
  cast: CastData,
  entryId: string,
  levels: readonly Levelled[] | null,
): { line: string; things: Levelled[]; titleOf: (l: Levelled) => string; notTheirsSaid: (l: Levelled) => string } | null {
  const name = cast.nameOf(entryId) ?? 'They';
  const theirs = dartSort(
    (levels ?? []).filter((l) => l.owner === entryId),
    (a, b) => (a.self ? 0 : 1) - (b.self ? 0 : 1),
  );
  if (theirs.length === 0) return null;
  return {
    line: `${name}’s level and those of what they carry, kept as you write: where each is now.`,
    things: theirs,
    titleOf: (l) => (l.self ? `${name}’s level` : l.name),
    notTheirsSaid: (l) => `${l.name} is no one’s now: on Systems.`,
  };
}

/** The list: the slips line, and the things grouped, each family together (its heading), each other thing on its own. */
export function levelsList(levels: readonly Levelled[]): {
  slips: string | null;
  groups: { key: string; heading: string | null; things: Levelled[] }[];
} {
  const groups = new Map<string, Levelled[]>();
  for (const l of levels) {
    const key = l.family.length === 0 ? `\u0000${l.name}` : l.family;
    let list = groups.get(key);
    if (list === undefined) groups.set(key, (list = []));
    list.push(l);
  }
  const slips = levels.filter((l) => l.steps.some((s) => s.backwards)).length;
  return {
    slips: slips > 0 ? `${slips === 1 ? 'One goes' : `${slips} go`} back down where the page does not say it fell: marked below.` : null,
    groups: [...groups].map(([key, things]) => ({
      key,
      heading: key.startsWith('\u0000') ? null : `${dartToUpperCase(key)} · ${things.length} versions`,
      things,
    })),
  };
}

/** One thing as shown: the level it is at now, since when and how far it came, and each step (latest first). */
export function levelledThing(l: Levelled): {
  key: string;
  level: string;
  since: string;
  steps: { step: LevelStep; when: string; sentence: string; up: string | null; backwards: string | null }[];
} {
  const now = l.steps[l.steps.length - 1];
  const changes = l.steps.length - 1;
  return {
    key: `level-${l.name}`,
    level: `${now.level}`,
    since: [
      `since chapter ${now.chapter}`,
      ...(changes > 0 ? [`${changes === 1 ? '1 step' : `${changes} steps`} from Level ${l.steps[0].level}`] : []),
    ].join(' · '),
    steps: [...l.steps].reverse().map((s) => ({
      step: s,
      when: `Ch. ${s.chapter}\nLevel ${s.level}`,
      sentence: `“${s.sentence}”`,
      up: s.up ? 'Leveled up: one more than before.' : null,
      backwards: s.backwards ? 'Lower than before, and the page does not say it fell.' : null,
    })),
  };
}

/** Where "Read it there" goes: the chapter, opened with find on the sentence, at that paragraph. */
export function stepReadThere(s: LevelStep): { nodeId: string; term: string; block: number } {
  return { nodeId: s.nodeId, term: s.sentence, block: s.block };
}

/** The colour of a step that went back down, as the Flutter app draws it. */
export const backwardsColour = '#C0392B';

/** A thing's steps as a line, low to high, left to right through the book, in a box `width` × `height` (70 × 28): a
 * level holds until the next step, flat, then up or down (stroke 2, round dots of 2.5, the steps that went back in
 * `backwardsColour`). Only drawn with more than one step. */
export function stepsDrawing(
  steps: readonly LevelStep[],
  width = 70,
  height = 28,
): { path: string; dots: { x: number; y: number; backwards: boolean }[] } {
  const low = steps.reduce((m, s) => Math.min(m, s.level), Number.POSITIVE_INFINITY);
  const high = steps.reduce((m, s) => Math.max(m, s.level), Number.NEGATIVE_INFINITY);
  const first = steps[0].chapter;
  const last = Math.max(steps[steps.length - 1].chapter, first + 1);
  const at = (s: LevelStep) => ({
    x: ((s.chapter - first) / (last - first)) * width,
    y: high === low ? height / 2 : height - ((s.level - low) / (high - low)) * height,
  });
  let before = at(steps[0]);
  const parts = [`M${before.x} ${before.y}`];
  for (const s of steps.slice(1)) {
    const p = at(s);
    parts.push(`L${p.x} ${before.y}`, `L${p.x} ${p.y}`);
    before = p;
  }
  return { path: parts.join(' '), dots: steps.map((s) => ({ ...at(s), backwards: s.backwards })) };
}
