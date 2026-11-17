// One codex entry's sheet on one blueprint: where it stands on each track, experience and points, its own values, and
// what it holds. A sheet keeps only what is its own; everything a class or skill brings is read from the blueprint.
// And LEVELLING: experience and points for one sheet. Nothing stores a level: the author logs what was earned and
// where, and the level is read off the track's curve; points are placed by hand, and placing more than were earned is
// shown, never refused. The pure parts of flutter_app/lib/features/progression/widgets/sheet_editor.dart: what each
// field shows, and what a press changes, as `(c: SystemChanges) => …` (typing through autosave under `key`).
//
// Drawn: the fields in a wrap 12 apart (a track 240 wide, a value 200); a single group a chooser 300 wide ("None"
// first), any other its label and a chip per thing ("Name · Rank"); the sheet in a box ("<Name>’s sheet"); "Take
// <Name> off <System>" last. Experience: a box "Experience" with "Counts towards" (180, when more than one track), the
// amount (140), where it came from (160), where in the story (200), what happened (200), and Log; then the log, each a
// dense row ("+50 XP  Combat · Chapter 2" over "Level 4 (up)", the up in the primary colour) with ×. Points: a box
// headed as `pointsBox` says, a row a variable: its name, −, the number (36 wide, centred), +.

import { newId } from '../../ids';
import { type JsonMap, mapOrNull } from '../../json';
import { type StoryModel } from '../../model/storyModel';
import { maps } from '../../records/jsonRecord';
import { type SysTrack, type SystemBlueprint, type SystemSheet, type XpEntry } from '../../records/system';
import { SheetProfile, computeSheet, takesPoints, xpHistory } from '../compute';
import { dartRound } from '../faceOff';
import { formatNumber } from '../formula';
import { dartSort } from '../../manuscript/dartSort';
import { type SystemChanges } from '../systemChanges';
import { dartDoubleTryParse } from './parts';

type Change = (c: SystemChanges) => void;

/** Where a sheet's level starts on a track: its number, or 1 (Dart's `_level`). */
export function startLevel(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? dartDoubleTryParse(raw) : null;
  return n === null || n === 0 ? 1 : n;
}

export type EditorField =
  | { kind: 'level'; key: string; trackId: string; label: string; value: string }
  | { kind: 'stage'; key: string; trackId: string; label: string; value: string | null; options: { value: string; label: string }[] }
  | { kind: 'choice'; key: string; variableId: string; label: string; value: string | null; options: string[] }
  | { kind: 'number'; key: string; variableId: string; label: string; hint: string; value: string };

export type EditorGroup =
  | { kind: 'single'; groupId: string; label: string; value: string; options: { value: string; label: string }[] }
  | { kind: 'many'; groupId: string; label: string; chips: { id: string; label: string; selected: boolean }[] };

/** The editor's fields and groups, and its last button. */
export function sheetEditor(system: SystemBlueprint, sheet: SystemSheet, name: string): { fields: EditorField[]; groups: EditorGroup[]; title: string; takeOff: string } {
  const fields: EditorField[] = [];
  for (const track of system.tracks) {
    if (track.kind === 'levels') {
      fields.push({
        kind: 'level',
        key: `${sheet.id}:${track.id}`,
        trackId: track.id,
        label: `${track.name}${sheet.xp.some((e) => e.trackId === track.id) ? ' (where they started)' : ''}`,
        value: formatNumber(startLevel(sheet.progress.get(track.id))),
      });
    } else {
      const at = sheet.progress.get(track.id);
      fields.push({
        kind: 'stage',
        key: `${sheet.id}:${track.id}:${String(at)}`,
        trackId: track.id,
        label: track.name,
        value: track.stages.some((s) => s.id === at) ? (at as string) : (track.stages[0]?.id ?? null),
        options: track.stages.map((s) => ({ value: s.id, label: s.name })),
      });
    }
  }
  for (const v of system.variables.filter((x) => x.kind !== 'derived')) {
    const own = sheet.values.get(v.id);
    if (v.kind === 'choice') {
      fields.push({
        kind: 'choice',
        key: `${sheet.id}:${v.id}:${String(own)}`,
        variableId: v.id,
        label: v.name,
        value: typeof own === 'string' && v.options.includes(own) ? own : (v.options[0] ?? null),
        options: v.options,
      });
    } else {
      fields.push({
        kind: 'number',
        key: `${sheet.id}:${v.id}`,
        variableId: v.id,
        label: `${v.name}${v.unit.length > 0 ? ` (${v.unit})` : ''}`,
        hint: `${formatNumber(v.base)} (the system’s starting value)`,
        value: typeof own === 'number' ? formatNumber(own) : '',
      });
    }
  }
  const items = system.items;
  const groups: EditorGroup[] = [];
  for (const group of system.groupList) {
    const options = items.filter((i) => i.groupId === group.id);
    if (options.length === 0) continue;
    if (group.single) {
      const held = options.filter((o) => sheet.itemIds.includes(o.id));
      groups.push({
        kind: 'single',
        groupId: group.id,
        label: group.name,
        value: held.length === 0 ? '' : held[held.length - 1].id,
        options: [{ value: '', label: 'None' }, ...options.map((o) => ({ value: o.id, label: o.name }))],
      });
    } else {
      groups.push({
        kind: 'many',
        groupId: group.id,
        label: group.name,
        chips: options.map((item) => ({
          id: item.id,
          label: system.rankName(item).length === 0 ? item.name : `${item.name} · ${system.rankName(item)}`,
          selected: sheet.itemIds.includes(item.id),
        })),
      });
    }
  }
  return { fields, groups, title: `${name}’s sheet`, takeOff: `Take ${name} off ${system.name}` };
}

const progressOf = (c: SystemSheet): JsonMap => ({ ...(mapOrNull(c.raw['progress']) ?? {}) });

/** A level typed (through autosave): at least 1, rounded. */
export const setLevel = (sheetId: string, trackId: string, text: string): Change => (c) =>
  c.updateSheet(sheetId, (cur) => {
    const n = dartDoubleTryParse(text) ?? 1;
    return { progress: { ...progressOf(cur), [trackId]: n < 1 ? 1 : Math.floor(n + 0.5) } };
  });

/** A stage chosen. */
export const setStage = (sheetId: string, trackId: string, stageId: string | null): Change => (c) =>
  c.updateSheet(sheetId, (cur) => ({ progress: { ...progressOf(cur), [trackId]: stageId } }));

/** A choice chosen. */
export const setChoice = (sheetId: string, variableId: string, chosen: string | null): Change => (c) =>
  c.updateSheet(sheetId, (cur) => ({ values: { ...(mapOrNull(cur.raw['values']) ?? {}), [variableId]: chosen } }));

/** A value typed (through autosave): a number keeps it, anything else takes the sheet's own value away. */
export const setNumber = (sheetId: string, variableId: string, text: string): Change => (c) =>
  c.updateSheet(sheetId, (cur) => {
    const values: JsonMap = { ...(mapOrNull(cur.raw['values']) ?? {}) };
    delete values[variableId];
    const n = dartDoubleTryParse(text);
    return { values: { ...values, ...(text.trim().length > 0 && n !== null && Number.isFinite(n) ? { [variableId]: n } : {}) } };
  });

/** One of a single group chosen (or none, ''). */
export const chooseSingle = (sheetId: string, optionIds: readonly string[], chosen: string | null): Change => (c) =>
  c.updateSheet(sheetId, (cur) => ({
    itemIds: [...cur.itemIds.filter((id) => !optionIds.includes(id)), ...(chosen !== null && chosen.length > 0 ? [chosen] : [])],
  }));

/** A thing held or let go. */
export const holdItem = (sheetId: string, itemId: string, held: boolean): Change => (c) =>
  c.updateSheet(sheetId, (cur) => ({ itemIds: held ? [...cur.itemIds, itemId] : cur.itemIds.filter((id) => id !== itemId) }));

/** Takes the sheet off its system. */
export const removeSheet = (sheetId: string): Change => (c) => c.removeSheet(sheetId);

/** Experience logged: an entry at the end of the log. Null when the amount is not a number other than 0. */
export function logXp(
  sheetId: string,
  entry: { trackId: string; amountText: string; source: string; nodeId: string; note: string },
  createId: () => string = newId,
): Change | null {
  const amount = dartDoubleTryParse(entry.amountText);
  if (amount === null || !Number.isFinite(amount) || amount === 0) return null;
  const row = { id: createId(), trackId: entry.trackId, amount, source: entry.source, nodeId: entry.nodeId.length === 0 ? null : entry.nodeId, note: entry.note };
  return (c) => c.updateSheet(sheetId, (cur) => ({ xp: [...maps(cur.raw['xp']), row] }));
}

/** An entry taken out of the log. */
export const removeXp = (sheetId: string, entryId: string): Change => (c) =>
  c.updateSheet(sheetId, (cur) => ({ xp: maps(cur.raw['xp']).filter((x) => x['id'] !== entryId) }));

/** A point placed on (1) or taken from (−1) a variable; at none, it is no longer kept. */
export const givePoint = (sheetId: string, variableId: string, by: number): Change => (c) =>
  c.updateSheet(sheetId, (cur) => {
    const spent: JsonMap = { ...(mapOrNull(cur.raw['spent']) ?? {}) };
    const before = spent[variableId];
    const next = (typeof before === 'number' ? before : 0) + by;
    if (next <= 0) delete spent[variableId];
    else spent[variableId] = next;
    return { spent };
  });

/** The log as it is shown: each entry with the level after it and whether it rose. */
export type LogRow = { entryId: string; title: string; subtitle: string; rose: boolean; removeLabel: string };

/** LEVELLING for a sheet: null when there is nothing to show (no track with a curve, and no points). */
export function leveling(
  model: StoryModel,
  system: SystemBlueprint,
  sheet: SystemSheet,
  name: string,
  chosenTrack: string | null,
): {
  experience: {
    track: SysTrack;
    tracks: { value: string; label: string }[] | null;
    amountLabel: string;
    amountHint: string;
    sourceHint: string;
    places: { value: string; label: string }[];
    empty: string | null;
    log: LogRow[];
  } | null;
  points: { title: string; caption: string; rows: { variableId: string; name: string; placed: string; canTake: boolean; take: string; place: string; semanticsLabel: string }[] } | null;
} | null {
  const tracks = system.tracks.filter((t) => t.kind === 'levels' && t.curve.trim().length > 0);
  const points = computeSheet(system, SheetProfile.of(sheet)).points;
  if (tracks.length === 0 && points === null) return null;
  const track = tracks.find((t) => t.id === chosenTrack) ?? tracks[0] ?? null;
  const nodes = [...model.nodes.values()];
  const position = model.order.position;
  const documents = dartSort(
    nodes.filter((n) => n.kind === 'chapter' || n.kind === 'scene'),
    (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
  );
  const history = xpHistory(system, SheetProfile.of(sheet), (id) => (id === null ? -1 : (position.get(id) ?? 9007199254740991)));
  const place = (id: string | null): string => (id === null ? 'Before the story' : (nodes.find((n) => n.id === id)?.title ?? 'A chapter that was removed'));

  let experience = null;
  if (track !== null) {
    const log: LogRow[] = history.map((h, i) => {
      const earlier = history.slice(0, i).filter((x) => x.track.id === h.track.id);
      const before = earlier.length === 0 ? dartRound(startLevel(sheet.progress.get(h.track.id))) : earlier[earlier.length - 1].level;
      const rose = h.level > before;
      const e: XpEntry = h.entry;
      const what = [e.source, e.note].filter((x) => x.length > 0).join(' · ');
      return {
        entryId: e.id,
        title: `${e.amount > 0 ? '+' : '−'}${formatNumber(Math.abs(e.amount))} ${h.track.curveUnit}  ${what.length === 0 ? 'Unlabelled' : what} · ${place(e.nodeId)}`,
        subtitle: `${h.track.name} ${h.level}${rose ? ' (up)' : ''}`,
        rose,
        removeLabel: `Remove ${formatNumber(e.amount)} ${h.track.curveUnit} from ${e.source.length === 0 ? place(e.nodeId) : e.source}`,
      };
    });
    experience = {
      track,
      tracks: tracks.length > 1 ? tracks.map((t) => ({ value: t.id, label: t.name })) : null,
      amountLabel: `${track.curveUnit.length === 0 ? 'Experience' : track.curveUnit} gained`,
      amountHint: '− for a loss',
      sourceHint: track.sources.length === 0 ? 'Source' : track.sources.join(', '),
      places: [{ value: '', label: 'Before the story' }, ...documents.map((n) => ({ value: n.id, label: `${n.kind === 'scene' ? '  ' : ''}${n.title}` }))],
      empty:
        history.length === 0
          ? `Nothing logged: ${name}’s ${track.name.toLowerCase()} is the number set above. Log what they earn and the level is worked out from the curve, starting from that number.`
          : null,
      log,
    };
  }

  const pointsBox =
    points === null
      ? null
      : {
          title: points.unspent >= 0 ? `Points: ${formatNumber(points.unspent)} to place` : `Points: ${formatNumber(-points.unspent)} more placed than earned`,
          caption: `${formatNumber(points.earned)} earned from levels, ${formatNumber(points.spent)} placed. ${
            points.unspent < 0
              ? 'Nothing stops you: this is only a note that the sheet has more than the levels gave.'
              : 'A point placed adds one to the attribute.'
          }`,
          rows: system.variables.filter(takesPoints).map((v) => {
            const placed = sheet.spent.get(v.id) ?? 0;
            return {
              variableId: v.id,
              name: v.name,
              placed: formatNumber(placed),
              canTake: placed > 0,
              take: `Take a point from ${v.name}`,
              place: `Place a point on ${v.name}`,
              semanticsLabel: `Points placed on ${v.name}: ${formatNumber(placed)}`,
            };
          }),
        };
  return { experience, points: pointsBox };
}

export const levelingWords = {
  experience: 'Experience',
  countsTowards: 'Counts towards',
  source: 'Where it came from',
  where: 'Where in the story',
  note: 'What happened (optional)',
  log: 'Log',
} as const;
