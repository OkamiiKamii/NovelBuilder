// What the profile's tabs share: a chapter or scene named, chosen or listed, and a choice of several records. The pure
// parts of flutter_app/lib/features/characters/widgets/parts.dart, and of `formatRelative` and the Material dates the
// tabs write (flutter_app/lib/core/format.dart; the app's English).

import { formatNumber } from '../../desk/format';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { type StoryNode } from '../../records/storyNode';
import { type CastData } from '../castData';

/** A chapter or scene as a chooser shows it: "Ch 3: The Seal", a scene indented under its chapter. */
export function documentLabel(cast: CastData, node: StoryNode): string {
  const number = cast.model.order.chapterNumber.get(node.id);
  return node.kind === 'scene'
    ? `    ${node.displayTitle}`
    : number === undefined
      ? node.displayTitle
      : `Ch ${number}: ${node.displayTitle}`;
}

/** Where a chapter or scene is named in a sentence: its title, or that it is gone. */
export function documentName(cast: CastData, nodeId: string | null): string {
  return nodeId === null ? 'Not set' : (cast.model.nodes.get(nodeId)?.displayTitle ?? 'A deleted chapter');
}

export function capitalized(s: string): string {
  return s.length === 0 ? s : `${dartToUpperCase(s[0])}${s.substring(1)}`;
}

/** The value a chooser shows for a chapter or scene that is gone, so it is never shown as another. */
export const goneChoice = '\u0000gone';

export type Choice<T> = { value: T; label: string };

/** Choosing one chapter or scene, or none (Dart's DocumentChooser): what it offers, and what a choice stores (null:
 * none; undefined: nothing to change, the "deleted chapter" line was chosen). */
export function documentChooser(
  cast: CastData,
  value: string | null,
  none = 'Not set',
): { selected: string; items: Choice<string>[]; pick: (v: string | null) => string | null | undefined } {
  const docs = cast.documents;
  const known = value === null || docs.some((d) => d.id === value);
  return {
    selected: known ? (value ?? '') : goneChoice,
    items: [
      { value: '', label: none },
      ...(known ? [] : [{ value: goneChoice, label: 'A deleted chapter' }]),
      ...docs.map((d) => ({ value: d.id, label: documentLabel(cast, d) })),
    ],
    pick: (v) => (v === goneChoice ? undefined : v === null || v.length === 0 ? null : v),
  };
}

/** The chapters and scenes as a choice of several (`IdPicker` options): each by id and label, trimmed. */
export function documentOptions(cast: CastData): Choice<string>[] {
  return cast.documents.map((d) => ({ value: d.id, label: documentLabel(cast, d).trim() }));
}

/** Choosing several records (Dart's IdPicker): the chosen ones as chips, each with its name (a deleted record says so)
 * and what removing it leaves; what can still be added; "None" when nothing is chosen. */
export function idPicker(args: {
  label: string;
  chosen: readonly string[];
  options: readonly Choice<string>[];
  nameOf?: ((id: string) => string | null) | null;
}): {
  chips: { id: string; name: string; removeTooltip: string; without: string[] }[];
  empty: string | null;
  addable: Choice<string>[];
  addTooltip: string;
  add: (id: string) => string[];
} {
  const { label, chosen, options, nameOf } = args;
  const names = new Map(options.map((o) => [o.value, o.label]));
  const name = (id: string) => names.get(id) ?? nameOf?.(id) ?? 'A deleted record';
  return {
    chips: chosen.map((id) => ({
      id,
      name: name(id),
      removeTooltip: `Remove ${name(id)}`,
      without: chosen.filter((x) => x !== id),
    })),
    empty: chosen.length === 0 ? 'None' : null,
    addable: options.filter((o) => !chosen.includes(o.value)),
    addTooltip: `Add to ${label}`,
    add: (id) => [...chosen, id],
  };
}

// ---------------------------------------------------------------------------------------------------- dates

const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Material's English medium date: "Tue, Nov 17". */
export function formatMediumDate(at: Date): string {
  return `${shortWeekdays[at.getDay()]}, ${shortMonths[at.getMonth()]} ${at.getDate()}`;
}

/** Material's English time of day: "3:04 PM". */
export function formatTimeOfDay(at: Date): string {
  const h = at.getHours();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const plural = (n: number, one: string) => `${formatNumber(n)} ${n === 1 ? one : `${one}s`}`;

/** When something happened, in words: "just now", "5 minutes ago", "yesterday", or the date (Dart's
 * `formatRelative`, in local time). */
export function formatRelative(millis: number | null, now: Date = new Date()): string {
  if (millis === null || millis <= 0) return 'never';
  const at = new Date(Math.trunc(millis));
  const ago = now.getTime() - at.getTime();
  if (Math.trunc(ago / 1000) < 60) return 'just now';
  const minutes = Math.trunc(ago / 60000);
  if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
  const hours = Math.trunc(ago / 3600000);
  if (hours < 24 && at.getDate() === now.getDate()) return `${plural(hours, 'hour')} ago`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  // As Dart's Duration.inDays: whole days between the two local midnights, truncated.
  if (Math.trunc((today.getTime() - day.getTime()) / 86400000) === 1) return 'yesterday';
  return formatMediumDate(at);
}
