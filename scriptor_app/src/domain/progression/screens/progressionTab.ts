// A character's PROGRESSION tab, and their STATUS tab (the first thing a character's page shows in a novel with
// systems). The pure parts of flutter_app/lib/features/progression/progression_tab.dart and
// flutter_app/lib/features/characters/tabs/status_tab.dart: what each shows, in words, and what a press changes, as
// `(x: SystemChanges) => …` (systemChanges.ts) to run inside the novel's change.
//
// Progression: the tracker (tracker.ts), then a box "System sheets" with its caption (each sheet of theirs a section
// titled with its system, open when it is the only one, holding the sheet editor; "Add X to a system…" with the systems
// they are not on), then the snapshots (snapshotsView.ts). Nothing is assumed: a character with nothing recorded has
// no level, no statistics and no empty rows.
//
// Status: with several systems, a chip for each; the status window (the system's own screen, drawn by the Systems
// screens) with its caption; "Give X a sheet in Y" (filled, add-chart icon) when they have none, else "Change their
// numbers" / "Done" (tonal, tune / check) and "Their whole sheet" (outlined, edit); and beside it (from 760 wide; under
// it on a phone, 16 apart, the window taking three parts to its two) the profile summary: a sparkle icon (18, primary)
// and PROFILE SUMMARY (heading face 12, bold, primary, spacing 2), the summary (16; "No summary yet." italic and
// muted), a rule, four counts (each the label at 15 and the number bold), a rule, GO TO and four buttons to the other
// tabs. Nothing at all in a novel without systems.

import { type Listed } from '../../characters/cast';
import { type CastData } from '../../characters/castData';
import { localeCompare } from '../../exchange/collation';
import { type JsonMap, mapOrNull } from '../../json';
import { maps } from '../../records/jsonRecord';
import { compareNum } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { type SystemBlueprint, type SystemSheet } from '../../records/system';
import { stableSorted } from '../../reader/stableSort';
import { formatNumber } from '../../desk/format';
import { type SystemChanges } from '../../systems/systemChanges';
import { dartToLowerCase, dartTrim } from '../../text/dartString';

// ---------------------------------------------------------------------------------------------------- progression

export type ProgressionSheets = {
  title: string;
  caption: string;
  /** With no blueprints in the novel: the line, and "Open Systems". */
  none: { line: string; open: string } | null;
  sheets: { sheet: SystemSheet; system: SystemBlueprint; title: string; open: boolean }[];
  /** "Add X to a system…", with the systems they are not on, by name. */
  add: { label: string; tooltip: string; systems: { id: string; name: string }[] } | null;
};

/** The "System sheets" box of `entryId`'s Progression tab (`name` theirs). */
export function progressionSheets(model: StoryModel, entryId: string, name: string): ProgressionSheets {
  const sheets = stableSorted(
    model.sheets.filter((s) => s.entryId === entryId && model.systems.has(s.systemId)),
    (a, b) => localeCompare(model.systems.get(a.systemId)!.name, model.systems.get(b.systemId)!.name),
  );
  const free = stableSorted(
    [...model.systems.values()].filter((s) => !sheets.some((x) => x.systemId === s.id)),
    (a, b) => localeCompare(a.name, b.name),
  );
  return {
    title: 'System sheets',
    caption:
      `Put ${name} on one of the novel’s system blueprints to give them a sheet. A sheet keeps only what is ` +
      'their own; everything a class or skill brings is read from the blueprint.',
    none: model.systems.size === 0 ? { line: 'This novel has no system blueprints.', open: 'Open Systems' } : null,
    sheets: sheets.map((sheet) => {
      const system = model.systems.get(sheet.systemId)!;
      return { sheet, system, title: system.name, open: sheets.length === 1 };
    }),
    add:
      free.length === 0
        ? null
        : { label: `Add ${name} to a system…`, tooltip: `Add ${name} to a system`, systems: free.map((s) => ({ id: s.id, name: s.name })) },
  };
}

/** Putting `entryId` on a system: a sheet of their own in it. */
export const addSheet = (systemId: string, entryId: string) => (x: SystemChanges) => x.addSheet(systemId, entryId);

// ---------------------------------------------------------------------------------------------------- status

/** A change made in the status window: a level or a stage (`track`), or one of their own numbers or choices. */
export type StatusEdit = { track: boolean; id: string; value: unknown };

export type StatusView = {
  systems: { id: string; name: string; selected: boolean }[];
  /** The chips, only with more than one system. */
  chips: boolean;
  system: SystemBlueprint;
  sheet: SystemSheet | null;
  caption: string;
  /** "Give X a sheet in Y" when they have none. */
  give: string | null;
  /** "Change their numbers" or "Done", and "Their whole sheet", when they have one. */
  change: { label: string; done: boolean } | null;
  wholeSheet: string | null;
  summary: {
    heading: string;
    text: string;
    empty: boolean;
    counts: { label: string; value: string }[];
    goTo: string;
    tabs: { tab: string; icon: string; label: string }[];
  };
};

/** The Status tab of `listed` with `systemId` chosen (null: the first) and the window `editing` or not; null in a novel
 * without systems. */
export function statusView(cast: CastData, listed: Listed, systemId: string | null, editing: boolean): StatusView | null {
  const model = cast.model;
  const entry = listed.entry;
  const name = entry.name;
  const systems = stableSorted([...model.systems.values()], (a, b) => {
    const c = compareNum(a.createdAt, b.createdAt);
    return c !== 0 ? c : localeCompare(a.name, b.name);
  });
  if (systems.length === 0) return null;
  const system = systems.find((s) => s.id === systemId) ?? systems[0];
  const sheet = model.sheets.find((s) => s.entryId === entry.id && s.systemId === system.id) ?? null;
  const ties = [...model.relations.values()].filter((r) => r.fromId === entry.id || r.toId === entry.id).length;
  const summary = dartTrim(entry.summary);
  return {
    systems: systems.map((s) => ({ id: s.id, name: s.name, selected: s.id === system.id })),
    chips: systems.length > 1,
    system,
    sheet,
    caption:
      sheet === null
        ? `As ${name} would begin in ${system.name}: not on a sheet yet.`
        : editing
          ? 'Each change is kept at once: a number, a stage, a power given or taken away. What follows (the most of each, damage…) the system works out.'
          : `${name} in ${system.name}. Their numbers and what they hold are changed here; experience and points, on their whole sheet.`,
    give: sheet === null ? `Give ${name} a sheet in ${system.name}` : null,
    change: sheet === null ? null : { label: editing ? 'Done' : 'Change their numbers', done: editing },
    wholeSheet: sheet === null ? null : 'Their whole sheet',
    summary: {
      heading: 'PROFILE SUMMARY',
      text: summary.length === 0 ? 'No summary yet.' : summary,
      empty: summary.length === 0,
      counts: [
        { label: 'Chapters linked', value: formatNumber(listed.linkedIn.length) },
        { label: 'In the text', value: formatNumber(listed.seenIn.length) },
        { label: 'Relationships', value: formatNumber(ties) },
        { label: 'Systems', value: formatNumber(model.sheets.filter((s) => s.entryId === entry.id).length) },
      ],
      goTo: 'GO TO',
      tabs: [
        { tab: 'progression', icon: 'trending_up', label: 'Their sheet and progression' },
        { tab: 'relationships', icon: 'hub_outlined', label: 'Relationships' },
        { tab: 'details', icon: 'badge_outlined', label: 'Details' },
        { tab: 'history', icon: 'history', label: 'History' },
      ],
    },
  };
}

/** What the status window's presses change. */
export const statusChanges = {
  /** A level, a stage, one of their own numbers or choices: kept at once. */
  apply: (sheetId: string, e: StatusEdit) => (x: SystemChanges) =>
    x.updateSheet(sheetId, (c) =>
      e.track
        ? { progress: { ...(mapOrNull(c.raw['progress']) ?? {}), [e.id]: e.value } }
        : { values: { ...(mapOrNull(c.raw['values']) ?? {}), [e.id]: e.value } },
    ),
  /** A power, a class, a title given or taken away. */
  hold: (sheetId: string, itemId: string, hold: boolean) => (x: SystemChanges) =>
    x.updateSheet(sheetId, (c) => ({ itemIds: [...c.itemIds.filter((id) => id !== itemId), ...(hold ? [itemId] : [])] })),
  /** The prompt for one new to the system, named here and held by `name`. */
  newPrompt: (group: string, name: string) => ({
    title: `New in ${group}`,
    label: 'Name',
    hint: `Held by ${name}, and in the system for anyone after.`,
    confirmLabel: `Give it to ${name}`,
  }),
  /** One new to the system, named `typed`: made in `groupId` and held by them, in one change. A name the group has
   * already (letter case aside) is that one, held: never two of the same. Null for a blank name. */
  newItem: (systemId: string, sheetId: string, groupId: string, typed: string) => {
    const named = dartTrim(typed);
    if (named.length === 0) return null;
    return (x: SystemChanges) => {
      const system = x.systems().find((s) => s.id === systemId);
      if (system === undefined) throw new Error('Bad state: No element');
      const same = system.items.find((i) => i.groupId === groupId && dartToLowerCase(dartTrim(i.name)) === dartToLowerCase(named));
      const id = same?.id ?? x.newId();
      if (same === undefined) {
        x.updateSystem(systemId, (c) => ({ items: [...maps(c.raw['items']), { id, groupId, name: named } as JsonMap] }));
      }
      x.updateSheet(sheetId, (c) => ({ itemIds: [...c.itemIds.filter((i) => i !== id), id] }));
    };
  },
};
