// THE GENRE SHELF and SEE IT IN YOUR BOOK, their pure parts: on a phone the genre modules as tiles two by two (each the
// module's sign on a band of its own colour, its name, its kind of story, how many tools, whether it is on here, and
// the one press it most needs), and, under a module not on, what turning it on would do to this novel. Ports of
// flutter_app/lib/features/modules/genre_shelf.dart and try_on_panel.dart.
//
// The shelf (genre_shelf.dart): tiles in two columns 12 apart; the open module's full card spans the row with "Back
// to the shelf" under it. A tile: radius 12, surfaceContainerLow, a border of the primary 2 wide when on, else
// outlineVariant at 70% 1 wide; a band 64 high in `moduleTone` with the sign (30, the tone's ink) centred and, when
// on, a check (a warning when it needs attention) at its top right (18); then the name (13, bold, three lines), the
// genre (14, italic, two lines), the line "6 tools · On here" (13.5; primary when on); and the button.
//
// The try-on panel (try_on_panel.dart): a toggle "See it in your book" / "Hide what it adds"; open, the heading "In
// “<title>”, with <module>" (11.5, bold), the shelf of volumes (each a spine `spineWidth` wide, 92 high, 108 and lit
// with NEW above it when new, a "+" when it gains fields; in `shelfOrder`), the kinds line, each gain line after a
// "+" mark, the tools line and each tool with its icon (six on a phone, then "and N more"), the system line, and the
// closing promise.

import { formatNumber, plural } from '../../desk/format';
import { str } from '../../json';
import { type Category } from '../../records/category';
import { isDark } from '../../characters/views/common';
import { dartToLowerCase } from '../../text/dartString';
import { type ModuleState, moduleStateLabel } from '../moduleChanges';
import { type ModuleDefinition, builtinModules } from '../moduleDefs';
import { type ModuleTryOn, type TryOnGain } from '../tryOn';

/** Each built-in module's own colour, in their order (ten, none the same); a module of the author's own, by its id. */
export const moduleTones: readonly string[] = [
  '#2B7A8C',
  '#B4532A',
  '#3D5FA8',
  '#5C6370',
  '#A8436B',
  '#3F7D4E',
  '#7A4FA3',
  '#8A6D1F',
  '#4F7A6A',
  '#9A5B2E',
];

export function moduleTone(m: ModuleDefinition): string {
  const at = builtinModules.findIndex((b) => b.id === m.id);
  if (at >= 0) return moduleTones[at % moduleTones.length];
  let h = 0;
  for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) & 0x7fffffff;
  return moduleTones[h % moduleTones.length];
}

/** A tile on the genre shelf. `writes`: modules can be turned on here (a review copy cannot). */
export function shelfTile(
  m: ModuleDefinition,
  state: ModuleState,
  writes: boolean,
): {
  tone: string;
  ink: string;
  sign: string;
  on: boolean;
  badge: { icon: 'warning' | 'check'; label: string } | null;
  name: string;
  genre: string | null;
  line: string;
  button: { kind: 'open' | 'turnOn' | 'more'; label: string; semanticsLabel: string };
} {
  const tone = moduleTone(m);
  const on = state === 'enabled' || state === 'attention';
  const tools = m.tools.length;
  return {
    tone,
    ink: isDark(tone) ? '#FFF8EC' : '#1B140E',
    sign: m.icon.length === 0 ? [...m.name][0] ?? '' : m.icon,
    on,
    badge: on ? { icon: state === 'attention' ? 'warning' : 'check', label: moduleStateLabel[state] } : null,
    name: m.name,
    genre: m.genre.length > 0 ? m.genre : null,
    line: [...(tools > 0 ? [`${tools} ${tools === 1 ? 'tool' : 'tools'}`] : []), on ? 'On here' : state === 'disabled' ? 'Switched off' : 'Not on'].join(
      ' · ',
    ),
    button: on
      ? { kind: 'open', label: 'Open', semanticsLabel: `Open ${m.name}` }
      : writes
        ? { kind: 'turnOn', label: state === 'disabled' ? 'Turn on again' : 'Turn on', semanticsLabel: `Turn on ${m.name}` }
        : { kind: 'more', label: 'More', semanticsLabel: `More about ${m.name}` },
  };
}

export const shelfWords = { back: 'Back to the shelf', close: (m: ModuleDefinition) => `Close ${m.name}` } as const;

// --------------------------------------------------------------------------------------------- see it in your book

/** The sign of each kind of tool (Material Icons' names), as the module's workspace draws it. */
export function toolIcon(type: string): string {
  switch (type) {
    case 'registry':
      return 'menu_book_outlined';
    case 'board':
      return 'view_kanban_outlined';
    case 'table':
      return 'table_chart_outlined';
    case 'matrix':
      return 'grid_on';
    case 'meters':
      return 'speed';
    case 'log':
      return 'history_edu';
    case 'calculator':
      return 'calculate_outlined';
    case 'ranks':
      return 'military_tech_outlined';
    case 'inventory':
      return 'backpack_outlined';
    case 'lineage':
      return 'account_tree_outlined';
    default:
      return 'open_in_new';
  }
}

/** "a, b and c" (at most `most`, then "and N more"). */
function listOf(words: readonly string[], most = 3): string {
  if (words.length <= most) {
    return words.length <= 1 ? words.join('') : `${words.slice(0, words.length - 1).join(', ')} and ${words[words.length - 1]}`;
  }
  return `${words.slice(0, most).join(', ')} and ${words.length - most} more`;
}

/** What one kind of record gains: "James gains Power Rank.", "Your 12 characters gain 2 fields: …". */
export function gainLine(g: TryOnGain): string {
  const fields = listOf(g.fields);
  if (g.entries.length === 0) return `${g.kind.name} gain ${plural(g.fields.length, 'field')}: ${fields}.`;
  if (g.entries.length === 1) return `${g.entries[0]} gains ${fields}.`;
  if (g.entries.length <= 3) return `${listOf(g.entries)} each gain ${fields}.`;
  return `Your ${formatNumber(g.entries.length)} ${dartToLowerCase(g.kind.name)} gain ${fields}.`;
}

export type ShelfVolume = { kind: Category; fresh: boolean; more: boolean };

/** The volumes on the try-on shelf: the novel's kinds as they are, then the module's new ones. */
export function tryOnShelf(t: ModuleTryOn): ShelfVolume[] {
  return [
    ...t.before.map((kind) => ({ kind, fresh: false, more: t.gains.some((g) => g.kind.key === kind.key) })),
    ...t.added.map((kind) => ({ kind, fresh: true, more: false })),
  ];
}

/** The spines' width and gap on a shelf `maxWidth` wide, and the order they stand in: when they cannot all fit at
 * their narrowest, the new ones first, so every new kind stays in view. */
export function shelfLayout(
  shelf: readonly ShelfVolume[],
  maxWidth: number,
): { width: number; gap: number; fits: boolean; order: ShelfVolume[] } {
  const n = shelf.length;
  const widthWith = (gap: number) => (maxWidth - gap * (n - 1)) / n;
  const gap = widthWith(4) >= 14 ? 4 : 2;
  const width = Math.min(30, Math.max(11, widthWith(gap)));
  const fits = width * n + gap * (n - 1) <= maxWidth + 0.5;
  return { width, gap, fits, order: fits ? [...shelf] : [...shelf.filter((s) => s.fresh), ...shelf.filter((s) => !s.fresh)] };
}

/** A volume: 108 high and lit with NEW over it when new, else 92. */
export const spineHeight = (fresh: boolean): number => (fresh ? 108 : 92);

/** The try-on panel's words, for a novel titled `novelTitle`, on a screen `screenWidth` wide. */
export function tryOnView(
  t: ModuleTryOn,
  module: ModuleDefinition,
  novelTitle: string,
  screenWidth: number,
): {
  heading: string;
  shelfLabel: string | null;
  kinds: string;
  gains: string[];
  toolsHeading: string | null;
  tools: { type: string; title: string; icon: string }[];
  moreTools: string | null;
  system: string | null;
  promise: string;
} {
  const title = novelTitle.trim().length === 0 ? 'your book' : `“${novelTitle.trim()}”`;
  const shown = screenWidth < 600 ? 6 : t.tools.length;
  const shelf = tryOnShelf(t);
  return {
    heading: `In ${title}, with ${module.name}`,
    shelfLabel:
      shelf.length === 0
        ? null
        : `Kinds of record: ${t.before.length} now, ${t.before.length + t.added.length} with it. New: ${t.added.map((c) => c.name).join(', ')}`,
    kinds:
      t.added.length === 0
        ? `${plural(t.before.length, 'kind')} of record, the same with it.`
        : `${plural(t.before.length, 'kind')} of record now, ${formatNumber(t.before.length + t.added.length)} with it: ${listOf(
            t.added.map((c) => c.name),
            4,
          )}.`,
    gains: t.gains.map(gainLine),
    toolsHeading: t.tools.length === 0 ? null : `Its workspace opens with ${plural(t.tools.length, 'tool')}`,
    tools: t.tools.slice(0, shown).map((tool) => ({ ...tool, icon: toolIcon(tool.type) })),
    moreTools: t.tools.length > shown ? `and ${formatNumber(t.tools.length - shown)} more` : null,
    system: t.offersSystem ? `And an example system, “${str(module.system!['name'])}”, added only if you ask for it.` : null,
    promise: 'Nothing is made until you add it, and turning it off later deletes nothing you wrote.',
  };
}

export const tryOnWords = { see: 'See it in your book', hide: 'Hide what it adds', isNew: 'NEW' } as const;

/** What tells the panel the novel changed (its last change, its kinds, the module): worked out again only then. */
export const tryOnKey = (updatedAt: unknown, kinds: number, moduleId: string): string => JSON.stringify([updatedAt ?? null, kinds, moduleId]);
