// THE STATUS WINDOW: a character's sheet as it would begin in a system (or as it stands), worked out by the system
// itself (../compute.ts) and drawn as the story's own screen would be. The pure parts of
// flutter_app/lib/features/progression/widgets/status_window.dart: each kind's dress, what an example sheet holds,
// and everything the window shows, in order, so the screen only draws it.
//
// HOW IT IS DRAWN (sizes in logical pixels, colours as given):
// - The frame: a gradient from `look.top` (top) to `look.bottom` (bottom), radius 6, a border of `look.accent` at 55%
//   1.2 wide, a glow of `look.accent` at 22% (blur 18, spread 1); padded 16 at the sides, 14 above and below. At each
//   corner a bracket: two arms 14 long, 3 in from the edge, in `look.accent` (stroke 1.6). The caption under it (6
//   below; 14.5, italic, the theme's onSurfaceVariant), unless empty.
// - The type: JetBrains Mono when `look.mono`, else the book face; ink #E8F0F6 (`windowInk`); faint ink at 62%; line
//   height 1.3.
// - The head: "[" HEADING "]" centred: the brackets 15 bold in the accent, the heading in capitals 13.5 bold, letter
//   spacing 3, one line, 8 between.
// - A rule between parts: 1 high, the accent at 28%, 8 above and below.
// - A line (`kind: 'line'`): the label at the left (13, ink at 72%), the value at the right (13.5; bold when `strong`
//   or `raised`; in the accent and followed by " ▲" when `raised`), 2 above and below; the value settles into a new
//   figure as it changes.
// - A track's next step (`next`), not in compact windows: 11, faint, 1 above and 2 below.
// - A bar (`kind: 'bar'`): the short name 76 wide (12.5 bold, the accent), the bar 9 high (track: white at 8%, radius
//   2, a border of the accent at 35% 0.8 wide; fill: the accent at 65% to the accent left to right, a glow of the
//   accent at 50% blur 6; the fill grows to `part` as the window opens, over 1100 ms with a spring of stiffness 120 and
//   damping 23, at once with motion reduced), 10 between, then the numbers (12.5); 3 above and below.
// - Attributes not being edited: in two columns from 420 wide (16 apart, 2 between rows), else one.
// - A group's label: in capitals, 10.5 bold, the accent, letter spacing 1.6; 6 below.
// - A held thing (`[Name]` chip): padded 10/6, the accent at 8%, radius 3, a border of the accent at 45%; "[" and "]"
//   in the accent with the name (13 bold) between, its rank after (11, the accent), then its effects joined " · " (11,
//   ink at 65%), then "from <stage>" (10.5, the accent at 85%, weight 600). Chips wrap, 8 apart.
// - Editing (a character's Status): a stepper (`kind: 'stepper'`): the label (13, ink at 72%) over `of` (11.5, ink at
//   60%), then − (48 square), the number (a button at least 56 wide that asks for a number: "Set", "Cancel"), +; a
//   choice (`kind: 'choose'`): the label, then a drop-down (its menu #0B1626, underlined in the accent at 50%).
// - A group being edited: its label ("<Group> · one at a time" for a single one) with Add (an add icon 18 and "Add" 13
//   bold, the accent) when anything can be added; "None held" (12, faint) or the chips, each but those a stage gives
//   with a × (18, ink at 70%) to take it away; the Add menu lists what is not held ("Name · Rank") and, when new ones
//   can be made, "New in <Group>…" after a divider.

import { type JsonMap, str } from '../../json';
import { maps } from '../../records/jsonRecord';
import { type SysItem, SystemBlueprint } from '../../records/system';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { type SheetItem, type SheetRow, type SheetTrack, SheetProfile, computeSheet } from '../compute';

/** How a kind of system's window is dressed: what it is headed, its light, its glass, and its face. */
export type WindowLook = { heading: string; accent: string; top: string; bottom: string; mono: boolean };

/** The window of each kind of system: the blue status screen of a game system, a jade record of cultivation, a violet
 * ledger of hard magic, a red dossier for the gifted. */
export function windowLookOf(presetId: string): WindowLook {
  switch (presetId) {
    case 'litrpg':
      return { heading: 'Status', accent: '#5CD6FF', top: '#0C1C33', bottom: '#07111F', mono: true };
    case 'cultivation':
      return { heading: 'Cultivation record', accent: '#6FDDA8', top: '#0E2A22', bottom: '#081812', mono: false };
    case 'hard-magic':
      return { heading: 'Arcane ledger', accent: '#C3A2FF', top: '#1D1535', bottom: '#110C21', mono: false };
    case 'superhero':
      return { heading: 'Threat dossier', accent: '#FF7A70', top: '#2B1316', bottom: '#180A0C', mono: true };
    default:
      return { heading: 'Character sheet', accent: '#E0B36A', top: '#241C12', bottom: '#15100A', mono: false };
  }
}

/** The windows' ink. */
export const windowInk = '#E8F0F6';

/** The Add menu's choice for one new to the system (no item's id is this). */
export const newOneChoice = '\u0000new';

/** For a preset shown as an example, what its example sheet holds: the first of each of its kinds of class, skill and
 * the like. */
export function exampleHeld(content: JsonMap): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of maps(content['items'])) {
    const g = str(i['groupId']);
    if (seen.has(g)) continue;
    seen.add(g);
    out.push(str(i['id']));
  }
  return out;
}

/** A change made in the window: a track (a level as a whole number, or a stage by its id) or a variable (a number, or
 * a choice's label), by its id. */
export type SheetEdit = { id: string; track: boolean; value: number | string };

/** A number as the window writes it: whole as whole, else to one place under 10 and none above (Dart's
 * `toStringAsFixed`). */
export function windowNumber(n: number): string {
  const whole = n < 0 ? -Math.round(-n) : Math.round(n);
  if (n === whole) return String(whole);
  const digits = Math.abs(n) < 10 ? 1 : 0;
  return Math.abs(n) >= 1e21 ? String(n) : n.toFixed(digits);
}

/** A stepper's limits as said when a number is asked for ("at least 0, at most 230"). */
export function stepperLimits(min: number | null, max: number | null): string {
  return [...(min !== null ? [`at least ${windowNumber(min)}`] : []), ...(max !== null ? [`at most ${windowNumber(max)}`] : [])].join(', ');
}

/** A value kept within a stepper's limits. */
export function within(value: number, min: number | null, max: number | null): number {
  let v = value;
  if (min !== null && v < min) v = min;
  if (max !== null && v > max) v = max;
  return v;
}

export type WindowHeld = { id: string; name: string; rank: string | null; effects: string[]; from: string | null };

export type WindowRow =
  | { kind: 'line'; label: string; value: string; strong: boolean; raised: boolean }
  | { kind: 'next'; text: string }
  | { kind: 'bar'; name: string; value: string; part: number }
  | {
      kind: 'stepper';
      edit: { id: string; track: boolean };
      label: string;
      value: number;
      whole: boolean;
      min: number | null;
      max: number | null;
      of: string | null;
      /** What the number button says to a screen reader. */
      semanticsLabel: string;
      less: string;
      more: string;
    }
  | { kind: 'choose'; edit: { id: string; track: boolean }; label: string; options: { value: string; label: string }[]; current: string };

/** A group of what the sheet holds: shown (`label` and its chips), or being edited (with what can be added). */
export type WindowGroup = {
  id: string;
  label: string;
  held: WindowHeld[];
  /** Editing: what is not held, offered by Add ("Name · Rank"); and whether "New in <Group>…" is offered. */
  more: { id: string; label: string }[] | null;
  canMake: boolean;
  /** Editing: what Add's tooltip says. */
  addLabel: string | null;
};

/** The window's parts, in order: the head, then sections each preceded by a rule. */
export type StatusWindowView = {
  look: WindowLook;
  heading: string;
  semanticsLabel: string;
  /** The name and where they stand, then (each its own section) the resources, the attributes, what follows. */
  standing: WindowRow[];
  resources: WindowRow[];
  attributes: WindowRow[];
  /** Two columns from this width, when the attributes are only shown. */
  attributeColumnsFrom: number;
  follows: WindowRow[];
  groups: WindowGroup[];
  caption: string;
};

/** Everything the window shows. `profile`: a sheet as it stands (else only `held`, as it would begin). `editing`:
 * the window changes the sheet in place (a character's Status); `holding` too, what it holds; `canMakeNew`, new
 * things in a group. */
export function statusWindowView(args: {
  content: JsonMap;
  presetId: string;
  holder: string;
  held: readonly string[];
  caption: string;
  compact?: boolean;
  profile?: SheetProfile | null;
  editing?: boolean;
  holding?: boolean;
  canMakeNew?: boolean;
}): StatusWindowView {
  const look = windowLookOf(args.presetId);
  const system = new SystemBlueprint(args.content);
  const profile = args.profile ?? null;
  const sheet = computeSheet(system, profile ?? new SheetProfile({ itemIds: args.held }));
  const rows = sheet.rows;
  const compact = args.compact ?? false;
  const editing = args.editing ?? false;

  // A resource's most is the "Max …" that follows from the attributes, when there is one.
  const maxOf = (r: SheetRow): SheetRow | null =>
    rows.find((m) => m.variable.kind === 'derived' && dartToLowerCase(m.variable.name) === dartToLowerCase(`max ${r.variable.name}`)) ?? null;
  const resourceRows = rows.filter((r) => r.variable.kind === 'resource');
  const usedAsMost = new Set(resourceRows.map((r) => maxOf(r)?.variable.id).filter((id): id is string => id !== undefined));
  const attributeRows = rows.filter((r) => r.variable.kind === 'number' || r.variable.kind === 'choice');
  const followRows = rows.filter((r) => r.variable.kind === 'derived' && !usedAsMost.has(r.variable.id));
  const ranks = new Map(system.ranks.map((r) => [r.id, r.name]));
  const plain = (r: SheetRow): string => (typeof r.value === 'number' ? windowNumber(r.value) : r.display);
  const own = (variableId: string): number | null => {
    const v = profile?.values.get(variableId);
    return typeof v === 'number' ? v : null;
  };
  // A level its experience gives: where it started is changed on the whole sheet, not here.
  const fromXp = (trackId: string): boolean => profile?.xp.some((e) => e.trackId === trackId) ?? false;

  const line = (label: string, value: string, strong = false, raised = false): WindowRow => ({ kind: 'line', label, value, strong, raised });
  const stepper = (
    edit: { id: string; track: boolean },
    label: string,
    value: number,
    opts: { whole?: boolean; min?: number | null; max?: number | null; of?: string | null },
  ): WindowRow => {
    const whole = opts.whole ?? false;
    const shown = whole ? String(Math.round(value)) : windowNumber(value);
    return {
      kind: 'stepper',
      edit,
      label,
      value,
      whole,
      min: opts.min ?? null,
      max: opts.max ?? null,
      of: opts.of ?? null,
      semanticsLabel: `${label}: ${shown}. Press to type a number.`,
      less: `Less ${label}`,
      more: `More ${label}`,
    };
  };

  const standingRow = (t: SheetTrack): WindowRow => {
    const name = t.track.name;
    const value = t.level !== null ? `${t.level}${t.track.cap > 0 ? ` / ${t.track.cap}` : ''}` : t.label;
    if (editing && t.level !== null && !fromXp(t.track.id)) {
      return stepper({ id: t.track.id, track: true }, name, t.level, { whole: true, min: 1, max: t.track.cap > 0 ? t.track.cap : null });
    }
    if (editing && t.level === null && t.track.stages.length > 0) {
      const at = profile?.progress.get(t.track.id);
      return {
        kind: 'choose',
        edit: { id: t.track.id, track: true },
        label: name,
        options: t.track.stages.map((st) => ({ value: st.id, label: st.name })),
        current: typeof at === 'string' ? at : t.track.stages[0].id,
      };
    }
    return line(name, value, true);
  };

  const standing: WindowRow[] = [line('Name', args.holder, true)];
  for (const t of sheet.tracks) {
    standing.push(standingRow(t));
    if (t.next !== null && !compact) standing.push({ kind: 'next', text: t.next });
  }

  const resources: WindowRow[] = resourceRows.map((r) => {
    const most = maxOf(r);
    const now = typeof r.value === 'number' ? r.value : null;
    const top = most !== null && typeof most.value === 'number' ? most.value : now;
    const part = now === null || top === null || top <= 0 ? 1 : Math.min(1, Math.max(0, now / top));
    const unit = dartTrim(r.variable.unit);
    // HP, MP, SP; or the name's first word ("Mana" for Mana Capacity).
    const short = unit.length > 0 && unit.length <= 3 ? unit : dartTrim(r.variable.name).split(/\s+/)[0];
    if (editing) {
      return stepper({ id: r.variable.id, track: false }, short, own(r.variable.id) ?? now ?? 0, {
        min: 0,
        max: most !== null && typeof most.value === 'number' ? most.value : null,
        of: most === null ? null : `/ ${plain(most)}${unit.length === 0 ? '' : ` ${unit}`}`,
      });
    }
    return {
      kind: 'bar',
      name: short,
      value: most === null ? r.display : `${now === null ? '?' : windowNumber(now)} / ${plain(most)}${unit.length === 0 ? '' : ` ${unit}`}`,
      part,
    };
  });

  const attributes: WindowRow[] = attributeRows.map((r) => {
    if (!editing) return line(r.variable.name, r.display, false, r.sources.length > 0);
    if (r.variable.kind === 'choice') {
      return {
        kind: 'choose',
        edit: { id: r.variable.id, track: false },
        label: r.variable.name,
        options: r.variable.options.map((o) => ({ value: o, label: o })),
        current: typeof r.value === 'string' && r.variable.options.includes(r.value) ? r.value : (r.variable.options[0] ?? ''),
      };
    }
    // Their own number: what a class or skill adds is the blueprint's, and stays out of it.
    return stepper({ id: r.variable.id, track: false }, r.variable.name, own(r.variable.id) ?? r.variable.base, {
      of: r.sources.length > 0 ? `→ ${r.display}` : null,
    });
  });

  const follows: WindowRow[] = compact ? [] : followRows.map((r) => line(r.variable.name, r.display));

  const heldOf = (i: SheetItem): WindowHeld => ({
    id: i.item.id,
    name: i.item.name,
    rank: ranks.get(i.item.rankId ?? '') ?? null,
    effects: [...i.effects, ...i.costs.map((c) => `costs ${c.label}`)],
    from: i.from,
  });

  const groups: WindowGroup[] = [];
  if (args.holding ?? false) {
    const list = [
      ...system.groupList.map((g) => ({ id: g.id, name: g.name, single: g.single })),
      ...(system.items.some((i) => !system.groupList.some((g) => g.id === i.groupId)) ? [{ id: '', name: 'Held', single: false }] : []),
    ];
    for (const g of list) {
      const inGroup = (i: SysItem): boolean => (g.id.length === 0 ? !system.groupList.some((x) => x.id === i.groupId) : i.groupId === g.id);
      const options = system.items.filter(inGroup);
      const canMake = (args.canMakeNew ?? false) && g.id.length > 0;
      if (options.length === 0 && !canMake) continue;
      const held = sheet.items.filter((i) => inGroup(i.item));
      const heldIds = new Set(held.map((i) => i.item.id));
      const more = options
        .filter((o) => !heldIds.has(o.id))
        .map((o) => ({ id: o.id, label: ranks.get(o.rankId ?? '') === undefined ? o.name : `${o.name} · ${ranks.get(o.rankId!)}` }));
      groups.push({
        id: g.id,
        label: g.single ? `${g.name} · one at a time` : g.name,
        held: held.map(heldOf),
        more,
        canMake,
        addLabel: more.length > 0 || canMake ? `Add to ${g.name}` : null,
      });
    }
  } else {
    const byGroup = new Map<string, SheetItem[]>();
    for (const i of sheet.items) {
      const name = i.group?.name ?? 'Held';
      const list = byGroup.get(name) ?? [];
      list.push(i);
      byGroup.set(name, list);
    }
    for (const [name, items] of byGroup) groups.push({ id: name, label: name, held: items.map(heldOf), more: null, canMake: false, addLabel: null });
  }

  return {
    look,
    heading: look.heading.toUpperCase(),
    semanticsLabel: `${look.heading} window for ${args.holder}`,
    standing,
    resources,
    attributes,
    attributeColumnsFrom: 420,
    follows,
    groups,
    caption: args.caption,
  };
}

/** The tooltip of the × that takes a held thing away (not shown on what a stage gives). */
export const takeAwayLabel = (name: string): string => `Take away ${name}`;

/** A held thing's chip, as a screen reader would have it read. */
export function heldWords(h: WindowHeld): string {
  return [h.name, h.rank ?? '', ...h.effects, h.from === null ? '' : `from ${h.from}`].filter((x) => x.length > 0).join(', ');
}
