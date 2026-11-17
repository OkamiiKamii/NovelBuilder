// IN YOUR PAGES, NOT IN THE SYSTEM, on Systems (pagesNames.ts reads them): the skills, titles, classes and items the
// chapters name the system's way that the blueprint does not hold yet, the most named first, each with its kind,
// rank, how often and where, and the sentence. **Add to Skills** (or Titles…) puts it in the blueprint (its rank when
// the system has a rank of that name), and on the sheet when the system has one; **Not part of it** sets it aside on
// this device; **Add all** when there are several. The pure parts of
// flutter_app/lib/features/progression/widgets/pages_names_view.dart.
//
// The box (surfaceContainerLow, radius 14, outlineVariant border, padded 16 14 16 10): a wand icon (18, primary), the
// heading (heading face 11, bold, primary, spacing 2) and, with several, "Add all N"; the line (14.5, italic); then the
// first eight, each: "[Name]" (numbers face 16, bold) and "Skill · rank E" (14, primary); "Once, from chapter 3: “…”"
// (14, italic, two lines); "Add to Skills" (tonal) and "Not part of it". "And N more." under them. Nothing at all when
// there is none left to show.

import { type StoryModel } from '../../model/storyModel';
import { readingOrder } from '../../model/storyOrder';
import { isDocument } from '../../outline';
import { type JsonMap } from '../../json';
import { SysGroup, SystemBlueprint } from '../../records/system';
import { type SystemChanges } from '../../systems/systemChanges';
import { type PageName, type PageThing, namesInPagesJob, pageThingLabel } from '../../systems/pagesNames';
import { dartToLowerCase, dartTrim } from '../../text/dartString';

/** Where the names set aside ("Not part of it") are kept, for a system: on this device. */
export const setAsideKey = (systemId: string): string => `systems.notPart.${systemId}`;

/** The names set aside, as stored. */
export function setAsideOf(stored: unknown): Set<string> {
  return new Set(Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : []);
}

/** What is stored once `n` is set aside. */
export function notPartAfter(stored: unknown, n: PageName): string[] {
  return [...setAsideOf(stored), n.name];
}

/** The group a kind of thing goes in, of `system`'s: one named for it ("Skills", "Spells", "Techniques", "Powers";
 * "Titles"; "Classes"; "Items", "Equipment"), else none (and one is made, named `groupNameOf`). */
export function groupFor(system: SystemBlueprint, thing: PageThing): SysGroup | null {
  const words =
    thing === 'skill'
      ? ['skill', 'spell', 'technique', 'power', 'abilit', 'art']
      : thing === 'title'
        ? ['title']
        : thing === 'kit'
          ? ['class', 'path', 'calling']
          : ['item', 'equipment', 'gear', 'inventory', 'artifact', 'relic'];
  return system.groupList.find((g) => words.some((w) => dartToLowerCase(g.name).includes(w))) ?? null;
}

/** The name a new group for `thing` is given. */
export function groupNameOf(thing: PageThing): string {
  return thing === 'skill' ? 'Skills' : thing === 'title' ? 'Titles' : thing === 'kit' ? 'Classes' : 'Items';
}

/** The reading, as a job away from the screen: the chapters in reading order, what the blueprint holds, what is set
 * aside. */
export function pagesNamesJob(model: StoryModel, system: SystemBlueprint, storedContents: readonly string[], stored: unknown): () => PageName[] {
  const order = readingOrder(model.nodes.values())
    .filter((n) => isDocument(n.kind))
    .map((n) => n.id);
  return namesInPagesJob(storedContents, order, { known: system.items.map((i) => i.name), setAside: setAsideOf(stored) });
}

/** Adding `names` to the system: each in the group for its kind (a group made when there is none), with its rank when
 * the system has a rank of that name (else the rank written in its description); and on the sheet when the system has
 * exactly one. Returns the change (giving the new items' ids) and what is said after. */
export function addNames(
  model: StoryModel,
  systemId: string,
  names: readonly PageName[],
): { change: (x: SystemChanges) => string[]; said: string } {
  const sheets = model.sheets.filter((s) => s.systemId === systemId);
  const change = (x: SystemChanges): string[] => {
    const ids: string[] = [];
    x.updateSystem(systemId, (current) => {
      const groups: unknown[] = Array.isArray(current.raw['groups']) ? [...(current.raw['groups'] as unknown[])] : [];
      const items: unknown[] = Array.isArray(current.raw['items']) ? [...(current.raw['items'] as unknown[])] : [];
      const groupId = (thing: PageThing): string => {
        const found = groupFor(new SystemBlueprint({ ...current.raw, groups }), thing) ?? new SysGroup({});
        if (found.id.length > 0) return found.id;
        const id = x.newId();
        groups.push({ id, name: groupNameOf(thing), single: thing === 'kit' });
        return id;
      };
      for (const n of names) {
        const id = x.newId();
        ids.push(id);
        const rank = current.ranks.find((r) => dartToLowerCase(r.name) === dartToLowerCase(n.rank));
        const item: JsonMap = { id, groupId: groupId(n.thing), name: n.name };
        if (rank !== undefined) item['rankId'] = rank.id;
        item['description'] = rank === undefined && n.rank.length > 0 ? `Rank ${n.rank}, as the pages say.` : '';
        items.push(item);
      }
      return { groups, items };
    });
    // On the one sheet, held.
    if (sheets.length === 1) x.updateSheet(sheets[0].id, (current) => ({ itemIds: [...current.itemIds, ...ids] }));
    return ids;
  };
  const holder = sheets.length === 1 ? model.entries.get(sheets[0].entryId) : undefined;
  const where = sheets.length === 1 ? ` and on ${holder === undefined ? 'the sheet' : dartTrim(holder.name)}’s sheet` : '';
  return {
    change,
    said: names.length === 1 ? `${names[0].name} is in the system${where}.` : `${names.length} are in the system${where}.`,
  };
}

export const pagesNamesWords = {
  heading: 'IN YOUR PAGES, NOT IN THE SYSTEM',
  line: 'Named in your chapters the system’s way, and not in it yet.',
  notPart: 'Not part of it',
} as const;

/** The box: null when there is nothing left to show (none found, or all added or set aside, `done` in lower case). */
export function pagesNamesView(
  system: SystemBlueprint,
  found: readonly PageName[] | null,
  done: ReadonlySet<string>,
): {
  names: PageName[];
  addAll: string | null;
  shown: { name: PageName; title: string; kind: string; said: string; add: string }[];
  more: string | null;
} | null {
  const names = (found ?? []).filter((n) => !done.has(dartToLowerCase(n.name)));
  if (names.length === 0) return null;
  const shown = names.slice(0, 8);
  return {
    names,
    addAll: names.length > 1 ? `Add all ${names.length}` : null,
    shown: shown.map((n) => ({
      name: n,
      title: `[${n.name}]`,
      kind: [pageThingLabel[n.thing], ...(n.rank.length > 0 ? [`rank ${n.rank}`] : [])].join(' · '),
      said: `${n.times === 1 ? 'Once' : `${n.times} times`}, from chapter ${n.chapter}: “${n.said}”`,
      add: `Add to ${groupFor(system, n.thing)?.name ?? groupNameOf(n.thing)}`,
    })),
    more: names.length > shown.length ? `And ${names.length - shown.length} more.` : null,
  };
}
