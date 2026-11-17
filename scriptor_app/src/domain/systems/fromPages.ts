// YOUR BOOK'S OWN SYSTEM: the system a novel's pages already describe, put together from them, ready to begin. A port
// of flutter_app/lib/shared/domain/systems/from_pages.dart.
//
// - Which kind: the preset whose words the chapters use most ("skill", "level", "class" for a game system; "qi",
//   "realm", "sect" for cultivation; "spell", "mana", "rune" for hard magic; "hero", "powers", "villain" for
//   superheroes), counted as whole words, any case.
// - What it already holds: the novel's powers (its Power System entries, and those its chapters call a skill or a
//   spell, ../codex/worldFinder.ts), set as the preset's own kind of ability (Skills, Techniques, Spells, Powers) in
//   place of the preset's examples there.
// - Who holds them: the protagonist (or the character most in the book) gets a sheet holding every one (the screen's).
//
// Only what is counted. Nothing is made until the author begins it, and everything in it can be changed after.

import { worldFinds } from '../codex/worldFinder';
import { type JsonMap, deepCopy, isMap, str } from '../json';
import { dartSort } from '../manuscript/dartSort';
import { blockTexts } from '../prose';
import { maps } from '../records/jsonRecord';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { type SystemPreset, systemPresets } from './systemPresets';

export type PagesSystem = {
  preset: SystemPreset;
  signs: { word: string; times: number }[];
  powers: string[];
  abilityGroup: string;
  content: JsonMap;
};

const words: Readonly<Record<string, readonly string[]>> = {
  litrpg: [
    'level', 'levels', 'leveled', 'skill', 'skills', 'class', 'stats', 'stat', 'xp', 'experience', 'quest', 'dungeon',
    'status', 'system', 'title', 'hp', 'party', 'loot', 'boss', 'rank',
  ],
  cultivation: [
    'qi', 'realm', 'realms', 'cultivation', 'cultivate', 'cultivator', 'sect', 'dao', 'meridian', 'meridians',
    'breakthrough', 'elder', 'pill', 'pills', 'disciple', 'tribulation', 'dantian', 'technique', 'techniques',
  ],
  'hard-magic': [
    'spell', 'spells', 'mana', 'rune', 'runes', 'sigil', 'sigils', 'wizard', 'mage', 'magic', 'sorcery', 'ward',
    'wards', 'incantation', 'arcane', 'caster', 'enchantment', 'grimoire',
  ],
  superhero: [
    'hero', 'heroes', 'villain', 'villains', 'superpower', 'superpowers', 'powers', 'mutant', 'mask', 'cape', 'suit',
    'vigilante', 'sidekick', 'origin',
  ],
};

/** Each preset's own kind of ability, where the novel's powers go. */
const abilityGroupOf: Readonly<Record<string, string>> = { litrpg: 'Skills', cultivation: 'Techniques', 'hard-magic': 'Spells', superhero: 'Powers' };

/** This many words of a kind, or a power the novel already has, is enough to offer a system. */
export const pagesSystemAtLeast = 3;

const word = /\p{L}+/gu;

/** Dart's `String.compareTo`: by UTF-16 code units. */
const byCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The system `texts` (every paragraph of the book) describe, with `powers` (the novel's power names, in the order
 * they are first met), or null when the pages say nothing of one. */
export function systemFromPages(texts: Iterable<string>, powers: readonly string[]): PagesSystem | null {
  const lookup = new Map<string, string>();
  for (const [preset, list] of Object.entries(words)) for (const w of list) lookup.set(w, preset);
  const counts = new Map<string, Map<string, number>>();
  for (const text of texts) {
    for (const m of text.matchAll(word)) {
      const w = dartToLowerCase(m[0]);
      const preset = lookup.get(w);
      if (preset === undefined) continue;
      let byWord = counts.get(preset);
      if (byWord === undefined) counts.set(preset, (byWord = new Map()));
      // "skills" is counted as "skill", "realms" as "realm": one word to the reader.
      const one = w.endsWith('s') && lookup.get(w.substring(0, w.length - 1)) === preset ? w.substring(0, w.length - 1) : w;
      byWord.set(one, (byWord.get(one) ?? 0) + 1);
    }
  }
  const total = (preset: string): number => [...(counts.get(preset) ?? new Map<string, number>()).values()].reduce((a, b) => a + b, 0);
  const ranked = dartSort([...systemPresets], (a, b) => total(b.id) - total(a.id));
  const preset = ranked[0] ?? null;
  if (preset === null) return null;
  const unique: string[] = [];
  for (const p of powers) {
    const name = dartTrim(p);
    if (name.length > 0 && !unique.some((u) => dartToLowerCase(u) === dartToLowerCase(name))) unique.push(name);
  }
  if (total(preset.id) < pagesSystemAtLeast && unique.length === 0) return null;

  const content = deepCopy(preset.content) as JsonMap;
  const groups = maps(content['groups']);
  const wanted = abilityGroupOf[preset.id];
  const group = groups.find((g) => str(g['name']) === wanted) ?? groups.find((g) => g['single'] !== true) ?? groups[0] ?? null;
  if (group !== null && unique.length > 0) {
    const groupId = str(group['id']);
    content['items'] = [
      // The preset's examples of this kind make way for the novel's own; its other kinds stay as examples.
      ...maps(content['items']).filter((i) => i['groupId'] !== groupId),
      ...unique.map((name, n) => ({
        id: `i-pages-${n}`,
        groupId,
        name,
        description: 'From your pages.',
        parentId: null,
        rankId: null,
        requires: '',
        modifiers: [],
        costs: [],
        cooldown: '',
        affinity: '',
        evolution: '',
      })),
    ];
  }
  const signs = dartSort(
    [...(counts.get(preset.id) ?? new Map<string, number>()).entries()].map(([w, times]) => ({ word: w, times })),
    (a, b) => (b.times !== a.times ? b.times - a.times : byCodeUnits(a.word, b.word)),
  );
  return { preset, signs, powers: unique, abilityGroup: group === null ? '' : str(group['name']), content };
}

/** The system a book's own pages describe, read from its chapters as stored (`storedContents`: chapter content rows as
 * JSON), away from the screen. Chapters are read in `chapterNumber` order (those without a number are not part of the
 * book); `entryPowers` are the names of the novel's Power System entries, offered before those its chapters call a
 * skill or a spell. */
export function ownSystemJob(
  storedContents: readonly string[],
  chapterNumber: ReadonlyMap<string, number>,
  entryPowers: readonly string[],
): () => PagesSystem | null {
  return () => {
    const chapters: [number, string[]][] = [];
    for (const json of storedContents) {
      let row: unknown;
      try {
        row = JSON.parse(json);
      } catch {
        continue;
      }
      if (!isMap(row)) continue;
      const number = chapterNumber.get(String(row['id']));
      if (number !== undefined) chapters.push([number, blockTexts(row['doc'])]);
    }
    dartSort(chapters, (a, b) => a[0] - b[0]);
    const powers = [...entryPowers, ...worldFinds(chapters, { limit: 40 }).filter((f) => f.kind === 'power').map((f) => f.name)];
    return systemFromPages(
      chapters.flatMap(([, blocks]) => blocks),
      powers,
    );
  };
}
