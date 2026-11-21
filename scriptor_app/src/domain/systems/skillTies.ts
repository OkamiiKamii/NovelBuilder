// A World entry tied to one skill (an item) of a system: one thing seen from two sides. The tie is stored on the entry
// row as `ability: "<systemId>/<itemId>"` (written only when tied). Ties to an Off system show nothing from the system.

import type { JsonMap } from '../json';
import { localeCompare } from '../collation';
import { abilityId } from '../model/entityRef';
import { type AbilityRecord, type StoryModel } from '../model/storyModel';
import { type Category, standIn } from '../records/category';
import { Entry } from '../records/entry';
import { maps } from '../records/jsonRecord';
import { type SysItem, type SystemBlueprint, isSystemOn } from '../records/system';
import { dartToLowerCase, dartTrim } from '../text/dartString';
import { SheetProfile, computeSheet } from './compute';

const same = (a: string, b: string) => dartToLowerCase(dartTrim(a)) === dartToLowerCase(dartTrim(b));

/** The skill an entry is tied to (`<systemId>/<itemId>`), or null. */
export function tiedAbilityId(entry: Entry | JsonMap): string | null {
  const v = (entry instanceof Entry ? entry.raw : entry)['ability'];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Where Skills go in this novel: the built-in `skill`, or the category that stands in for it. */
export function skillKindKey(categories: readonly Category[]): string {
  return categories.some((c) => c.key === 'skill' && !c.archived) ? 'skill' : (standIn('skill', categories)?.key ?? 'skill');
}

export const skillsGroupOf = (system: SystemBlueprint) => system.groupList.find((g) => same(g.name, 'Skills')) ?? null;

/** The Leveling Job: stamped `preset: 'leveling-job'`, or (older copies) named "The Job" with a "Skills" group. */
export function isJobSystem(system: SystemBlueprint): boolean {
  return system.raw['preset'] === 'leveling-job' || (same(system.name, 'The Job') && skillsGroupOf(system) !== null);
}

/** The Job systems that still have a Skills group (`model.systems` holds only the On ones), in model order. */
export const jobSystems = (model: StoryModel): SystemBlueprint[] => [...model.systems.values()].filter((s) => isJobSystem(s) && skillsGroupOf(s) !== null);

export type SkillTie = {
  abilityId: string;
  system: SystemBlueprint;
  item: SysItem;
  group: string;
  rank: string | null;
  /** Short plain lines: "Strength ×20 at rank S". */
  boosts: string[];
  cost: string[];
  cooldown: string;
  /** Characters whose sheet on that system holds the skill and has not switched it off. */
  holders: { entryId: string; name: string }[];
};

/** What the system says about a skill, from the entry's side. Null when untied, dangling, or the system is Off. */
export function skillTieOf(model: StoryModel, entryId: string): SkillTie | null {
  const entry = model.entries.get(entryId);
  const id = entry === undefined ? null : tiedAbilityId(entry);
  const ability = id === null ? undefined : model.abilities.get(id);
  if (id === null || ability === undefined || !isSystemOn(ability.system)) return null;
  const { system, item } = ability;
  // One modifier at a time, so each line knows whether it came from the rank.
  const boosts = item.modifiers.flatMap((m) => {
    const only = system.withFields({ items: maps(system.raw['items']).map((i) => (i['id'] === item.id ? { ...i, modifiers: [m.raw] } : i)) });
    // The sheet writes "× 20"; a short line reads "×20".
    const line = computeSheet(only, new SheetProfile({ itemIds: [item.id] })).items[0]?.effects[0]?.replace('× ', '×');
    return line === undefined ? [] : [m.byRank && system.rankName(item).length > 0 ? `${line} at rank ${system.rankName(item)}` : line];
  });
  const costs = computeSheet(system, new SheetProfile({ itemIds: [item.id] })).items[0]?.costs ?? [];
  const holders: SkillTie['holders'] = [];
  for (const s of model.sheets) {
    const who = model.entries.get(s.entryId);
    if (s.systemId === system.id && s.itemIds.includes(item.id) && !s.offIds.includes(item.id) && who !== undefined) {
      holders.push({ entryId: who.id, name: who.name });
    }
  }
  return { abilityId: id, system, item, group: ability.group, rank: system.rankName(item) || null, boosts, cost: costs.map((c) => c.label), cooldown: item.cooldown, holders };
}

/** The entry tied to a skill, if any. */
export function entryForAbility(model: StoryModel, abilityId: string): Entry | null {
  for (const e of model.entries.values()) if (tiedAbilityId(e) === abilityId) return e;
  return null;
}

/** Skills of On systems that no entry is tied to: system order, then group, then item order. */
export function untiedSkills(model: StoryModel): AbilityRecord[] {
  const tied = new Set<string>();
  for (const e of model.entries.values()) {
    const id = tiedAbilityId(e);
    if (id !== null) tied.add(id);
  }
  const out: AbilityRecord[] = [];
  for (const system of model.systems.values()) {
    for (const g of system.groups) {
      for (const item of system.items) {
        const id = abilityId(system.id, item.id);
        const ability = model.abilities.get(id);
        if (item.groupId === g.id && ability !== undefined && !tied.has(id) && loggable(system, item)) out.push(ability);
      }
    }
  }
  return out;
}

/** Whether a skill can be logged in World from its system: the system is On and the item is not a one-at-a-time kind
 * (a class or job is not a skill). */
export function loggable(system: SystemBlueprint, item: SysItem): boolean {
  return isSystemOn(system) && system.groupList.find((g) => g.id === item.groupId)?.single !== true;
}

export type SkillSortItem = {
  entry: Entry;
  from: Category;
  to: Category;
  abilityId: string;
  ability: AbilityRecord;
  choices: [{ action: 'keep'; label: string }, { action: 'move'; label: string }];
};

/** Power entries named like a skill nobody is tied to, not yet decided (`skillSorted`): offered "Move to Skills and
 * tie". A separate decision from the merged-type sort, so a `typeSorted` Power is still offered. */
export function skillsToSort(model: StoryModel): SkillSortItem[] {
  const to = model.categories.get(skillKindKey([...model.categories.values()]));
  const from = model.categories.get('power');
  if (to === undefined || to.archived || from === undefined) return [];
  const skills = untiedSkills(model);
  const claimed = new Set<string>();
  const items: SkillSortItem[] = [];
  for (const entry of model.entries.values()) {
    if (entry.category !== 'power' || tiedAbilityId(entry) !== null || entry.raw['skillSorted'] === true) continue;
    const ability = skills.find((a) => !claimed.has(abilityId(a.system.id, a.item.id)) && same(a.item.name, entry.name));
    if (ability === undefined) continue;
    const id = abilityId(ability.system.id, ability.item.id);
    claimed.add(id);
    items.push({
      entry, from, to, abilityId: id, ability,
      choices: [{ action: 'keep', label: `Keep as ${from.singular}` }, { action: 'move', label: `Move to ${to.name} and tie` }],
    });
  }
  return items.sort((a, b) => localeCompare(a.entry.name, b.entry.name));
}
