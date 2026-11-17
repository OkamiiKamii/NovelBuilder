// SYSTEMS (Organize → Systems): the novel's own blueprints for how characters grow, where nothing is a fixed game
// concept. Variables, tracks, groups ("Classes", "Titles", "Mutations"…), ranks, units and formulas are all named and
// shaped by the author; a character's sheet keeps only what is its own. The pure parts of
// flutter_app/lib/features/progression/systems_page.dart: the page's halves and tabs, the words, and what every press
// changes, as `(c: SystemChanges) => …` (typing through autosave, under the key given).
//
// The page: with no system, the gallery (./gallery.ts) and Levels in your pages; else a chip per system, the two
// halves ("In the story" | "The blueprint", remembered on this device under `systemsModeKey`), and:
// - In the story: the live window, the climb, the face-off, "The system speaks", the number ledger, levels in your
//   pages, names in your pages (the last three are the other Systems views').
// - The blueprint: "A blank system" and "Or start from a preset…" (a menu of the presets, at least 48 tall); the head
//   (System name, What it is, "Delete this system…" in the error colour); then the tabs as chips with their counts,
//   and the live window beside them (400 wide, 24 apart) from 1000 wide, else folded above them ("The window, as it
//   reads now" / "Every change in the tabs below shows in it").

import { newId } from '../../ids';
import { type JsonMap } from '../../json';
import { localeCompare } from '../../exchange/collation';
import { dartSort } from '../../manuscript/dartSort';
import { abilityId } from '../../model/entityRef';
import { type StoryModel } from '../../model/storyModel';
import { maps } from '../../records/jsonRecord';
import { type SysItem, type SysStage, type SysTrack, type SystemBlueprint, type SystemSheet } from '../../records/system';
import { stableSorted } from '../../reader/stableSort';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { curveTable } from '../compute';
import { type PagesSystem } from '../fromPages';
import { type SystemChanges } from '../systemChanges';
import { blankBlueprint } from '../systemPresets';
import { dartDoubleTryParse, dartIntTryParse, formatBase, listOf, moved, patched, splitList, without } from './parts';

type Change = (c: SystemChanges) => void;

/** The two halves of a system's page: in the story, and its blueprint. */
export type SystemsMode = 'story' | 'blueprint';
export const systemsModes: readonly SystemsMode[] = ['story', 'blueprint'];
export const systemsModeLabel: Readonly<Record<SystemsMode, string>> = { story: 'In the story', blueprint: 'The blueprint' };
export const systemsModeIcon: Readonly<Record<SystemsMode, string>> = { story: 'auto_stories_outlined', blueprint: 'architecture' };

/** Where the half last shown is kept: on this device. */
export const systemsModeKey = 'systems.mode';

/** The half a page opens on: a link to a tab or a sheet opens the blueprint; else where the author last was, the
 * story by default. */
export function openingMode(link: { tab: string | null; sheetId: string | null }, stored: unknown): SystemsMode {
  if (link.tab !== null || link.sheetId !== null) return 'blueprint';
  return systemsModes.find((m) => m === stored) ?? 'story';
}

/** The blueprint's tabs, in order. */
export type SystemsTab = 'variables' | 'tracks' | 'kits' | 'tables' | 'sheets';
export const systemsTabs: readonly SystemsTab[] = ['variables', 'tracks', 'kits', 'tables', 'sheets'];
export const systemsTabLabel: Readonly<Record<SystemsTab, string>> = {
  variables: 'Attributes & resources',
  tracks: 'Levels & realms',
  kits: 'Classes, skills & more',
  tables: 'Tables',
  sheets: 'Sheets',
};

/** A tab named in a link, else the first. */
export const tabOf = (tab: string | null): SystemsTab => systemsTabs.find((t) => t === tab) ?? 'variables';

/** A variable's kinds, as the chooser and the add buttons name them. */
export const variableKindLabel: Readonly<Record<string, string>> = { number: 'Attribute', resource: 'Resource pool', derived: 'Formula', choice: 'Choice' };
/** What a held thing does to a value, as the chooser shows it. */
export const modifierOpLabel: Readonly<Record<string, string>> = { add: '+', multiply: '×', set: '=' };

/** From this width (of the page's content) the blueprint's window stands beside it; below, it is folded above it. */
export const blueprintBesideFrom = 1000;

/** Where Systems is: `/organize/systems`, with the system, tab and sheet to open. */
export function systemsPath(args: { systemId?: string | null; tab?: string | null; sheetId?: string | null } = {}): string {
  const query: string[] = [];
  const add = (key: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined) query.push(`${key}=${encodeURIComponent(value)}`);
  };
  add('system', args.systemId);
  add('tab', args.tab);
  add('sheet', args.sheetId);
  return `/organize/systems${query.length === 0 ? '' : `?${query.join('&')}`}`;
}

/** The novel's systems, oldest first (then by name), and the one shown (`chosen`, else the first). */
export function systemsOf(model: StoryModel, chosen: string | null): { systems: SystemBlueprint[]; system: SystemBlueprint | null } {
  const systems = stableSorted(model.systems.values(), (a, b) => {
    const c = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    return c !== 0 ? c : localeCompare(a.name, b.name);
  });
  return { systems, system: systems.find((s) => s.id === chosen) ?? systems[0] ?? null };
}

/** How many a tab holds, for its chip ("Sheets (3)"). */
export function tabCount(s: SystemBlueprint, model: StoryModel, tab: SystemsTab): number {
  switch (tab) {
    case 'variables':
      return s.variables.length;
    case 'tracks':
      return s.tracks.length;
    case 'kits':
      return s.items.length;
    case 'tables':
      return s.matrices.length;
    default:
      return model.sheets.filter((x) => x.systemId === s.id).length;
  }
}

/** A tab's chip. */
export const tabChip = (s: SystemBlueprint, model: StoryModel, tab: SystemsTab): string => `${systemsTabLabel[tab]} (${tabCount(s, model, tab)})`;

export const systemsWords = {
  title: 'Systems',
  blank: 'A blank system',
  preset: 'Or start from a preset…',
  presetTooltip: 'Start from a preset',
  windowFolded: 'The window, as it reads now',
  windowFoldedCaption: 'Every change in the tabs below shows in it',
  name: 'System name',
  description: 'What it is',
  delete: 'Delete this system…',
  speaks: 'The system speaks',
} as const;

// ---------------------------------------------------------------------------------------------------- the head

/** Creates a system from `content` (blank, a preset, or the book's own); the page then shows its blueprint. */
export const createSystem = (content: JsonMap = blankBlueprint) => (c: SystemChanges): SystemBlueprint => c.createSystem(content);

/** The name typed (through autosave under `<systemId>:name`); a name of only spaces changes nothing. */
export function renameSystem(systemId: string, name: string): Change | null {
  if (dartTrim(name).length === 0) return null;
  return (c) => c.updateSystem(systemId, () => ({ name }));
}

/** What it is, typed (through autosave under `<systemId>:description`). */
export const describeSystem = (systemId: string, description: string): Change => (c) => c.updateSystem(systemId, () => ({ description }));

/** Asked before a system is deleted; then `removeSystem` and "Deleted <name>." */
export function deleteSystemDialog(system: SystemBlueprint): { title: string; message: string; confirm: string; done: string } {
  return {
    title: `Delete ${system.name}?`,
    message:
      'The blueprint goes, with the sheets made from it and the paths recorded between its items. Characters and entries are not changed; snapshots keep what they recorded.',
    confirm: 'Delete the system',
    done: `Deleted ${system.name}.`,
  };
}

export const removeSystem = (systemId: string): Change => (c) => c.removeSystem(systemId);

/** Taking items out of a blueprint takes the paths recorded to or from them, and the sheets that hold them stop
 * holding them. When anything would go, the author is told what first (null: nothing to ask). */
export function removingDialog(model: StoryModel, system: SystemBlueprint, itemIds: ReadonlySet<string>, what: string): { title: string; message: string; confirm: string } | null {
  if (itemIds.size === 0) return null;
  const refs = new Set([...itemIds].map((id) => abilityId(system.id, id)));
  const paths = model.links.filter((l) => (l.fromType === 'ability' && refs.has(l.fromId)) || (l.toType === 'ability' && refs.has(l.toId))).length;
  const holders = model.sheets.filter((s) => s.systemId === system.id && s.itemIds.some((id) => itemIds.has(id))).length;
  if (itemIds.size === 1 && paths === 0 && holders === 0) return null;
  return {
    title: `Remove ${what}?`,
    message: [
      ...(itemIds.size > 1 ? [`${itemIds.size} items go with it.`] : []),
      ...(paths > 0 ? [`${paths} recorded ${paths === 1 ? 'path goes' : 'paths go'} with ${itemIds.size > 1 ? 'them' : 'it'}.`] : []),
      ...(holders > 0
        ? [
            `${holders === 1 ? '1 sheet holds' : `${holders} sheets hold`} ${itemIds.size > 1 ? 'some of them' : 'it'}, and will no longer. Snapshots keep what they recorded.`,
          ]
        : []),
    ].join(' '),
    confirm: 'Remove',
  };
}

// ---------------------------------------------------------------------------------------------------- list edits

/** A change to one of a blueprint's lists, worked out from the list as stored at that moment. */
export const editList = (systemId: string, key: string, change: (all: JsonMap[]) => JsonMap[]): Change => (c) =>
  c.updateSystem(systemId, (cur) => ({ [key]: change(listOf(cur, key)) }));

/** The autosave key of a typed change to a blueprint. */
export const laterKey = (systemId: string, ...parts: string[]): string => [systemId, ...parts].join(':');

// ---------------------------------------------------------------------------------------------------- variables

/** A new variable of `kind` ("New attribute", "New formula"…). */
export const addVariable = (systemId: string, kind: string, createId: () => string = newId): Change =>
  editList(systemId, 'variables', (all) => [
    ...all,
    { id: createId(), name: `New ${dartToLowerCase(variableKindLabel[kind] ?? kind)}`, kind, base: 0, formula: '', options: [] },
  ]);

/** A variable's row: what it shows and which fields it has. */
export function variableRow(system: SystemBlueprint, index: number): {
  id: string;
  name: string;
  key: string;
  kind: string;
  base: string | null;
  formula: { label: string; hint: string; value: string } | null;
  options: { label: string; hint: string; value: string } | null;
  unit: { label: string; hint: string; value: string } | null;
  first: boolean;
  last: boolean;
} {
  const variables = system.variables;
  const v = variables[index];
  return {
    id: v.id,
    name: v.name,
    key: `key: ${v.key}`,
    kind: v.kind,
    base: v.kind === 'number' || v.kind === 'resource' ? formatBase(v.base) : null,
    formula: v.kind === 'derived' ? { label: `Formula for ${v.name}`, hint: 'strength * 1.5', value: v.formula } : null,
    options: v.kind === 'choice' ? { label: `Choices for ${v.name}`, hint: 'Fire, Water, Earth', value: v.options.join(', ') } : null,
    unit: v.kind !== 'choice' ? { label: 'Unit', hint: 'HP', value: v.unit } : null,
    first: index === 0,
    last: index === variables.length - 1,
  };
}

/** A variable's field typed or chosen: its name (not when blank), kind, starting value, formula, choices or unit. */
export function variableEdit(systemId: string, variableId: string, field: 'name' | 'kind' | 'base' | 'formula' | 'options' | 'unit', text: string): Change | null {
  let change: JsonMap;
  switch (field) {
    case 'name':
      if (dartTrim(text).length === 0) return null;
      change = { name: dartTrim(text) };
      break;
    case 'base':
      change = { base: dartDoubleTryParse(text) ?? 0 };
      break;
    case 'options':
      change = { options: splitList(text) };
      break;
    default:
      change = { [field]: text };
  }
  return editList(systemId, 'variables', (all) => patched(all, variableId, change));
}

export const moveIn = (systemId: string, key: string, id: string, by: number): Change => editList(systemId, key, (all) => moved(all, id, by));
export const removeFrom = (systemId: string, key: string, id: string): Change => editList(systemId, key, (all) => without(all, id));

// ---------------------------------------------------------------------------------------------------- tracks

/** Numbered levels, or named stages, added. */
export const addTrack = (systemId: string, kind: 'levels' | 'stages', createId: () => string = newId): Change =>
  editList(systemId, 'tracks', (all) => [
    ...all,
    kind === 'levels' ? { id: createId(), name: 'Level', kind: 'levels', cap: 0, curve: '', curveUnit: '' } : { id: createId(), name: 'Realm', kind: 'stages', stages: [] },
  ]);

/** A track's box: its title, fields, and (for levels) what it takes to pass each of the first levels. */
export function trackBox(system: SystemBlueprint, track: SysTrack): {
  title: string;
  key: string;
  cap: string | null;
  points: string | null;
  curve: { label: string; hint: string; value: string } | null;
  unit: string | null;
  sources: { label: string; value: string } | null;
  costs: string | null;
} {
  const levels = track.kind === 'levels';
  const rows = levels ? curveTable(system, track, [1, 2, 3, 5, 10]) : [];
  return {
    title: levels ? 'Numbered levels' : 'Named stages',
    key: `key: ${track.key}`,
    cap: levels ? (track.cap === 0 ? '' : `${track.cap}`) : null,
    points: levels ? (track.points === 0 ? '' : formatBase(track.points)) : null,
    curve: levels ? { label: `Curve of ${track.name}`, hint: `100 * ${track.key} ^ 1.5`, value: track.curve } : null,
    unit: levels ? track.curveUnit : null,
    sources: levels ? { label: `Where ${track.curveUnit.length === 0 ? 'experience' : track.curveUnit} comes from`, value: track.sources.join(', ') } : null,
    costs: rows.length > 0 ? `To pass each level: ${rows.map((r) => `level ${r.level}: ${r.cost}`).join(' · ')}` : null,
  };
}

export const trackWords = { name: 'Name', cap: 'Highest level', capHint: 'No cap', points: 'Points a level', unit: 'Its unit', unitHint: 'XP', sourcesHint: 'Combat, Quest, Training', addStage: 'Add a stage', levels: 'Numbered levels', stages: 'Named stages' } as const;

/** A track's field typed: its name (not when blank), cap, points, curve, unit or sources. */
export function trackEdit(systemId: string, trackId: string, field: 'name' | 'cap' | 'points' | 'curve' | 'unit' | 'sources', text: string): Change | null {
  let change: JsonMap;
  switch (field) {
    case 'name':
      if (dartTrim(text).length === 0) return null;
      change = { name: dartTrim(text) };
      break;
    case 'cap':
      change = { cap: dartIntTryParse(text) ?? 0 };
      break;
    case 'points':
      change = { points: dartDoubleTryParse(text) ?? 0 };
      break;
    case 'unit':
      change = { curveUnit: text };
      break;
    case 'sources':
      change = { sources: splitList(text) };
      break;
    default:
      change = { curve: text };
  }
  return editList(systemId, 'tracks', (all) => patched(all, trackId, change));
}

const stagesOf = (all: readonly JsonMap[], trackId: string): JsonMap[] => maps(all.find((t) => t['id'] === trackId)?.['stages']);

/** A stage's fields: its label ("Stage 2"), what it requires (not for the first), its notes. */
export function stageRow(track: SysTrack, index: number): { label: string; requires: { label: string; hint: string; value: string } | null; note: { label: string; hint: string; value: string }; first: boolean; last: boolean } {
  const stage = track.stages[index];
  return {
    label: `Stage ${index + 1}`,
    requires: index > 0 ? { label: `What ${stage.name} requires`, hint: 'qi >= 1000 AND Pill: Foundation Pill', value: stage.requires } : null,
    note: { label: `Notes on ${stage.name}`, hint: 'The bottleneck, the breakthrough, the price', value: stage.note },
    first: index === 0,
    last: index === track.stages.length - 1,
  };
}

/** A stage's field typed: its name (not when blank), requirement or notes. */
export function stageEdit(systemId: string, trackId: string, stageId: string, field: 'name' | 'requires' | 'note', text: string): Change | null {
  if (field === 'name' && dartTrim(text).length === 0) return null;
  const value = field === 'name' ? dartTrim(text) : text;
  return editList(systemId, 'tracks', (all) => patched(all, trackId, { stages: patched(stagesOf(all, trackId), stageId, { [field]: value }) }));
}

export const addStage = (systemId: string, trackId: string, createId: () => string = newId): Change =>
  editList(systemId, 'tracks', (all) => patched(all, trackId, { stages: [...stagesOf(all, trackId), { id: createId(), name: 'New stage', requires: '', note: '' }] }));
export const moveStage = (systemId: string, trackId: string, stageId: string, by: number): Change =>
  editList(systemId, 'tracks', (all) => patched(all, trackId, { stages: moved(stagesOf(all, trackId), stageId, by) }));
export const removeStage = (systemId: string, trackId: string, stageId: string): Change =>
  editList(systemId, 'tracks', (all) => patched(all, trackId, { stages: without(stagesOf(all, trackId), stageId) }));
/** What reaching a stage gives, set. */
export const setGrants = (systemId: string, trackId: string, stageId: string, grants: readonly string[]): Change =>
  editList(systemId, 'tracks', (all) => patched(all, trackId, { stages: patched(stagesOf(all, trackId), stageId, { grants: [...grants] }) }));

/** What reaching a stage gives: "every new tier, a new power". What it gives now (each to be taken off), and what else
 * can be given, by group; "(make powers under Classes, skills & more first)" when the system has no items. */
export function stageGrants(system: SystemBlueprint, stage: SysStage): {
  label: string;
  given: { id: string; name: string; removeTooltip: string }[];
  none: string | null;
  offered: { group: string; items: { id: string; name: string }[] }[];
  giveTooltip: string | null;
  makeFirst: string | null;
} {
  const byId = new Map(system.items.map((i) => [i.id, i]));
  const given = stage.grants.map((id) => byId.get(id)).filter((i): i is SysItem => i !== undefined);
  const givenIds = new Set(given.map((i) => i.id));
  const offered = system.groups
    .map((g) => ({ group: g.name, items: system.items.filter((i) => i.groupId === g.id && !givenIds.has(i.id)).map((i) => ({ id: i.id, name: i.name })) }))
    .filter((g) => g.items.length > 0);
  return {
    label: `Reaching ${stage.name} gives`,
    given: given.map((i) => ({ id: i.id, name: i.name, removeTooltip: `No longer given by ${stage.name}: ${i.name}` })),
    none: given.length === 0 ? 'nothing yet' : null,
    offered,
    giveTooltip: offered.length > 0 ? `Give something on reaching ${stage.name}` : null,
    makeFirst: offered.length === 0 && system.items.length === 0 ? '(make powers under Classes, skills & more first)' : null,
  };
}

// ---------------------------------------------------------------------------------------------------- classes, skills…

/** A named list (ranks; a table's rows or columns): each "Name of <noun> <n>", and the add button ("Add a rank
 * (Common, Advanced, Unique…)" while empty). */
export function namedList(noun: string, names: readonly { id: string; name: string }[], hint: string): { rows: { id: string; label: string; value: string; first: boolean; last: boolean }[]; add: string } {
  return {
    rows: names.map((n, i) => ({ id: n.id, label: `Name of ${noun} ${i + 1}`, value: n.name, first: i === 0, last: i === names.length - 1 })),
    add: `Add a ${noun}${names.length === 0 ? ` (${hint})` : ''}`,
  };
}

/** A new name in a named list ("New rank"). */
export const newNamed = (noun: string, createId: () => string = newId): JsonMap => ({ id: createId(), name: `New ${noun}` });

export const kitsWords = {
  ranks: 'Ranks, lowest first',
  ranksHint: 'Common, Advanced, Unique…',
  groupName: 'Group name',
  single: 'Held one at a time',
  addGroup: 'A group',
} as const;

/** A group's box: its things (each a tile: its name and "Rank · requires …"), and its buttons. */
export function groupBox(system: SystemBlueprint, groupId: string): {
  name: string;
  single: boolean;
  removeLabel: string;
  removeSemantics: string;
  removeWhat: string;
  itemIds: string[];
  items: { id: string; title: string; subtitle: string }[];
  add: string;
} {
  const group = system.groupList.find((g) => g.id === groupId)!;
  const items = system.items.filter((i) => i.groupId === groupId);
  return {
    name: group.name,
    single: group.single,
    removeLabel: `Remove ${group.name}`,
    removeSemantics: `Remove the group ${group.name} and its items`,
    removeWhat: `the group ${group.name}`,
    itemIds: items.map((i) => i.id),
    items: items.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: [system.rankName(item), item.requires.length > 0 ? `requires ${item.requires}` : ''].filter((x) => x.length > 0).join(' · '),
    })),
    add: `Add to ${group.name}`,
  };
}

export const addGroup = (systemId: string, createId: () => string = newId): Change =>
  editList(systemId, 'groups', (all) => [...all, { id: createId(), name: 'New group', single: false }]);
export const addToGroup = (systemId: string, group: { id: string; name: string }, createId: () => string = newId): Change =>
  editList(systemId, 'items', (all) => [...all, { id: createId(), groupId: group.id, name: `New ${dartToLowerCase(group.name)}` }]);

/** An item's editor: its fields, its changes and costs, and its buttons. */
export function itemEditor(system: SystemBlueprint, item: SysItem): {
  rank: { label: string; value: string; options: { value: string; label: string }[] };
  parent: { label: string; value: string; options: { value: string; label: string }[] };
  description: { label: string; hint: string; value: string };
  requires: { label: string; hint: string; value: string };
  modifiers: { id: string; target: string | null; targetLabel: string; op: string; how: string; howSemantics: string; value: string; valueLabel: string; valueHint: string }[];
  costs: { id: string; target: string | null; targetLabel: string; amount: string; amountLabel: string; amountHint: string }[];
  targets: { value: string; label: string }[];
  canAdd: boolean;
  more: { key: 'cooldown' | 'affinity' | 'evolution'; label: string; hint: string; value: string }[];
  remove: string;
  removeSemantics: string;
} {
  const variables = system.variables.filter((v) => v.kind !== 'choice');
  const others = system.items.filter((i) => i.id !== item.id);
  return {
    rank: {
      label: `Rank of ${item.name}`,
      value: system.ranks.some((r) => r.id === item.rankId) ? item.rankId! : '',
      options: [{ value: '', label: 'No rank' }, ...system.ranks.map((r) => ({ value: r.id, label: r.name }))],
    },
    parent: {
      label: `${item.name} grows out of`,
      value: others.some((o) => o.id === item.parentId) ? item.parentId! : '',
      options: [{ value: '', label: 'Nothing' }, ...others.map((o) => ({ value: o.id, label: o.name }))],
    },
    description: { label: `Description of ${item.name}`, hint: 'What it is', value: item.description },
    requires: { label: `What ${item.name} requires`, hint: 'Class: Void Mage AND level >= 50', value: item.requires },
    modifiers: item.modifiers.map((m) => ({
      id: m.id,
      target: variables.some((v) => v.key === m.target) ? m.target : null,
      targetLabel: `What ${item.name} changes`,
      op: m.op,
      how: 'How',
      howSemantics: `How ${item.name} changes it`,
      value: m.value,
      valueLabel: `Amount ${item.name} gives`,
      valueHint: '5',
    })),
    costs: item.costs.map((c) => ({
      id: c.id,
      target: variables.some((v) => v.key === c.target) ? c.target : null,
      targetLabel: `What ${item.name} costs`,
      amount: c.amount,
      amountLabel: `Amount ${item.name} costs`,
      amountHint: '20',
    })),
    targets: variables.map((v) => ({ value: v.key, label: v.name })),
    canAdd: variables.length > 0,
    more: [
      { key: 'cooldown', label: `Cooldown of ${item.name}`, hint: '30 seconds · once a day · a full verse', value: item.cooldown },
      { key: 'affinity', label: `Affinity of ${item.name}`, hint: 'Fire', value: item.affinity },
      { key: 'evolution', label: `Evolution of ${item.name}`, hint: 'Becomes Inferno after 1,000 casts', value: item.evolution },
    ],
    remove: `Remove ${item.name}`,
    removeSemantics: `Remove ${item.name} from ${system.name}`,
  };
}

export const itemWords = { name: 'Name', addChange: 'A change it makes', addCost: 'A cost', removeChange: 'Remove this change', removeCost: 'Remove this cost' } as const;

/** A change to one item, worked out from it as stored. */
export const editItem = (systemId: string, itemId: string, change: (item: JsonMap) => JsonMap): Change =>
  editList(systemId, 'items', (all) => all.map((i) => (i['id'] === itemId ? { ...i, ...change(i) } : i)));

/** An item's field typed or chosen: name (not when blank), rank, parent, description, requirement, cooldown, affinity,
 * evolution. A rank or parent of '' is none. */
export function itemEdit(
  systemId: string,
  itemId: string,
  field: 'name' | 'rankId' | 'parentId' | 'description' | 'requires' | 'cooldown' | 'affinity' | 'evolution',
  text: string | null,
): Change | null {
  if (field === 'name') return text === null || dartTrim(text).length === 0 ? null : editItem(systemId, itemId, () => ({ name: dartTrim(text) }));
  if (field === 'rankId' || field === 'parentId') return editItem(systemId, itemId, () => ({ [field]: text === null || text.length === 0 ? null : text }));
  return editItem(systemId, itemId, () => ({ [field]: text ?? '' }));
}

/** A change it makes (`+1` to the first variable), or a cost (1 of the first variable), added. */
export const addModifier = (systemId: string, itemId: string, firstKey: string, createId: () => string = newId): Change =>
  editItem(systemId, itemId, (i) => ({ modifiers: [...maps(i['modifiers']), { id: createId(), target: firstKey, op: 'add', value: '1' }] }));
export const addCost = (systemId: string, itemId: string, firstKey: string, createId: () => string = newId): Change =>
  editItem(systemId, itemId, (i) => ({ costs: [...maps(i['costs']), { id: createId(), target: firstKey, amount: '1' }] }));
/** A change it makes, or a cost, changed (`target`, `op`, `value`; `target`, `amount`). */
export const editModifier = (systemId: string, itemId: string, modifierId: string, change: JsonMap): Change =>
  editItem(systemId, itemId, (i) => ({ modifiers: patched(maps(i['modifiers']), modifierId, change) }));
export const editCost = (systemId: string, itemId: string, costId: string, change: JsonMap): Change =>
  editItem(systemId, itemId, (i) => ({ costs: patched(maps(i['costs']), costId, change) }));
export const removeModifier = (systemId: string, itemId: string, modifierId: string): Change =>
  editItem(systemId, itemId, (i) => ({ modifiers: without(maps(i['modifiers']), modifierId) }));
export const removeCost = (systemId: string, itemId: string, costId: string): Change =>
  editItem(systemId, itemId, (i) => ({ costs: without(maps(i['costs']), costId) }));

// ---------------------------------------------------------------------------------------------------- tables

export const tableWords = { name: 'Table name', addTable: 'A table', hint: 'Fire, Water…', cellHint: '—' } as const;

/** A new table. */
export const addTable = (systemId: string, createId: () => string = newId): Change =>
  editList(systemId, 'matrices', (all) => [...all, { id: createId(), name: 'New table', rows: [], columns: [], cells: {} }]);

/** A change to one table, worked out from it as stored. */
export const editTable = (systemId: string, tableId: string, change: (m: JsonMap) => JsonMap): Change =>
  editList(systemId, 'matrices', (all) => all.map((m) => (m['id'] === tableId ? { ...m, ...change(m) } : m)));

/** A cell typed: "<row> against <column>". */
export const cellEdit = (systemId: string, tableId: string, rowId: string, columnId: string, text: string): Change =>
  editTable(systemId, tableId, (m) => ({ cells: { ...((m['cells'] as JsonMap | undefined) ?? {}), [`${rowId}|${columnId}`]: text } }));

/** A table's grid: a head row (120 blank, then each column 140), then each row (its name 120, a cell 140 a column,
 * padded 2), sideways when wider than the page; only with rows and columns both. */
export function tableGrid(system: SystemBlueprint, tableId: string): { columns: { id: string; name: string }[]; rows: { id: string; name: string; cells: { columnId: string; label: string; value: string }[] }[] } | null {
  const m = system.matrices.find((x) => x.id === tableId);
  if (m === undefined || m.rows.length === 0 || m.columns.length === 0) return null;
  const cells = m.cells;
  return {
    columns: m.columns,
    rows: m.rows.map((r) => ({
      id: r.id,
      name: r.name,
      cells: m.columns.map((c) => ({ columnId: c.id, label: `${r.name} against ${c.name}`, value: cells.get(`${r.id}|${c.id}`) ?? '' })),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------- sheets

/** The Sheets tab: a chip per sheet (by name), "Add a character or entry…" with those not on it, the note when the
 * novel has nothing, and the sheet chosen with "Open profile". */
export function sheetsTab(model: StoryModel, system: SystemBlueprint, chosen: string | null): {
  sheets: { id: string; label: string; selected: boolean }[];
  free: { id: string; name: string }[];
  addLabel: string;
  addTooltip: string;
  empty: string | null;
  selected: { sheet: SystemSheet; name: string; character: boolean; open: string } | null;
} {
  const mine = stableSorted(
    model.sheets.filter((s) => s.systemId === system.id && model.entries.has(s.entryId)),
    (a, b) => localeCompare(model.entries.get(a.entryId)!.name, model.entries.get(b.entryId)!.name),
  );
  const selected = mine.find((s) => s.id === chosen) ?? null;
  const free = stableSorted(
    [...model.entries.values()].filter((e) => !mine.some((s) => s.entryId === e.id)),
    (a, b) => localeCompare(a.name, b.name),
  );
  return {
    sheets: mine.map((s) => ({ id: s.id, label: model.entries.get(s.entryId)!.name, selected: s.id === selected?.id })),
    free: free.map((e) => ({ id: e.id, name: e.name })),
    addLabel: 'Add a character or entry…',
    addTooltip: 'Add a codex entry to this system',
    empty: model.entries.size === 0 ? 'Create a character, or an item under World, first; then it can be given a sheet here.' : null,
    selected:
      selected === null
        ? null
        : {
            sheet: selected,
            name: model.entries.get(selected.entryId)!.name,
            character: model.entries.get(selected.entryId)!.category === 'character',
            open: 'Open profile',
          },
  };
}

/** An entry put on the system; the tab then shows its sheet. */
export const addSheet = (systemId: string, entryId: string) => (c: SystemChanges): SystemSheet => c.addSheet(systemId, entryId);

// ---------------------------------------------------------------------------------------------------- the book's own

/** Who holds the book's own system's powers: the protagonist, or the one most in the book (by how many chapters
 * name them). Null when it holds no powers. */
export function ownSystemHolder(
  system: PagesSystem,
  cast: readonly { entry: { id: string; name: string }; profile: { roles: readonly string[] }; seenIn: readonly unknown[] }[],
): { holderId: string | null; holderName: string | null } {
  const sorted = dartSort([...cast], (a, b) => b.seenIn.length - a.seenIn.length);
  const holder = sorted.find((l) => l.profile.roles.includes('Protagonist')) ?? sorted.find((l) => l.seenIn.length > 0) ?? null;
  return {
    holderId: system.powers.length === 0 ? null : (holder?.entry.id ?? null),
    holderName: system.powers.length === 0 ? null : (holder?.entry.name ?? null),
  };
}

/** Begins the book's own system, and the holder's sheet holding every power in it, in one change. The page then
 * shows it in the story, their window first. */
export const beginOwn = (own: PagesSystem, holderId: string | null) => (c: SystemChanges): SystemBlueprint => {
  const system = c.createSystem(own.content);
  if (holderId !== null) {
    const sheet = c.addSheet(system.id, holderId);
    const names = new Set(own.powers.map(dartToLowerCase));
    const held = c
      .systems()
      .find((s) => s.id === system.id)!
      .items.filter((i) => names.has(dartToLowerCase(i.name)))
      .map((i) => i.id);
    c.updateSheet(sheet.id, () => ({ itemIds: held }));
  }
  return system;
};

/** What the book's own system is read from, so a reading is kept while none of it changes: the novel, the count of
 * writes to its text, its chapters' order, and its Power System entries. */
export function ownReadingKey(novelId: string, textVersion: number, chapterNumber: ReadonlyMap<string, number>, entryPowers: readonly string[]): string {
  return [novelId, String(textVersion), [...chapterNumber].map(([k, v]) => `${k}:${v}`).join(','), entryPowers.join('|')].join('\u0000');
}
