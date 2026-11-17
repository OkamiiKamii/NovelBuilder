// The input a field's type calls for. Values are always text, whatever the type, so a value written before a field
// changed type is kept as it was and shown as it is. Typing calls `onTyped` (saved through autosave); a choice calls
// `onChosen` (saved at once). The pure parts of flutter_app/lib/features/characters/widgets/typed_input.dart: which
// control each type is, what it offers, and the value each press gives `onChosen`.

import { splitChoices } from '../../codex/fieldValues';
import { type FieldType } from '../../records/category';
import { type Entry } from '../../records/entry';
import { dartTrim } from '../../text/dartString';

/** The value shown for a link to an entry that is gone (kept until the author changes it). */
export const goneLink = '\u0000gone';

export type TypedControl =
  /** A text box (`multiline`: at least 3 lines; `number`: the number keyboard, signed, with decimals). */
  | { kind: 'text'; multiline: boolean; number: boolean }
  /** A text box with the hint "yyyy-mm-dd", and a calendar button ("Choose a date"): `dateChosen` is what a date
   * picked gives (from year 1 to 9999-12-31; starting at the value's date, else today). */
  | { kind: 'date'; hint: string; tooltip: string }
  /** Three segments: Yes, No, and "Not set" (or the value as it is when it is neither yes, no nor empty), one chosen
   * ('' for the third). */
  | { kind: 'toggle'; segments: { value: string; label: string }[]; selected: string }
  /** A few short choices (at most 3, each at most 14 characters) as segments, one press; pressed again, cleared.
   * Their values are the choices; `selected` empty when none. */
  | { kind: 'segments'; choices: string[]; selected: string | null }
  /** A drop-down: "Not set" (''), then the choices (and the value, when it is not among them); a helper "No choices
   * yet: add them under Field settings." when there are none. */
  | { kind: 'dropdown'; items: { value: string; label: string }[]; selected: string; helper: string | null }
  /** Chips to choose several: each choice (and each value chosen that is not one), chosen or not; with none, the note
   * "No choices yet: add them under Field settings." */
  | { kind: 'several'; chips: { value: string; selected: boolean }[]; empty: string | null }
  /** The tags as chips (each with "Remove <tag>"), a box "Add to <label>" (200 wide) and an Add button. */
  | { kind: 'tags'; tags: string[]; hint: string }
  /** A drop-down of entries: "Not linked" (''), "The linked entry was deleted" (`goneLink`) when the value is an
   * entry that is gone, then each entry by name. */
  | { kind: 'link'; items: { value: string; label: string }[]; selected: string }
  /** The links as chips (a deleted one "A deleted entry"; each with "Remove <name>"), and a menu "Link another entry"
   * of the entries not chosen. */
  | {
      kind: 'links';
      chips: { id: string; label: string; removeTooltip: string }[];
      menu: { id: string; label: string }[];
      menuTooltip: string;
    };

const noChoices = 'No choices yet: add them under Field settings.';

/** The control for a field of `type`, its `value`, `options` (for a choice) and `entries` (what a link can point at). */
export function typedControl(
  type: FieldType,
  value: string,
  options: { label?: string; options?: readonly string[]; entries?: readonly Entry[] } = {},
): TypedControl {
  const choicesGiven = options.options ?? [];
  const entries = options.entries ?? [];
  switch (type) {
    case 'text':
      return { kind: 'text', multiline: false, number: false };
    case 'longtext':
      return { kind: 'text', multiline: true, number: false };
    case 'number':
      return { kind: 'text', multiline: false, number: true };
    case 'date':
      return { kind: 'date', hint: 'yyyy-mm-dd', tooltip: 'Choose a date' };
    case 'toggle':
      return {
        kind: 'toggle',
        segments: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: '', label: value === 'yes' || value === 'no' || value.length === 0 ? 'Not set' : value },
        ],
        selected: value === 'yes' || value === 'no' ? value : '',
      };
    case 'select': {
      // A value that is not among the choices (written before they changed) is kept and shown as it is.
      const choices = [...choicesGiven, ...(value.length > 0 && !choicesGiven.includes(value) ? [value] : [])];
      if (choicesGiven.length > 0 && choices.length <= 3 && choices.every((c) => c.length <= 14)) {
        return { kind: 'segments', choices, selected: value.length > 0 ? value : null };
      }
      return {
        kind: 'dropdown',
        items: [{ value: '', label: 'Not set' }, ...choices.map((c) => ({ value: c, label: c }))],
        selected: value,
        helper: choicesGiven.length === 0 ? noChoices : null,
      };
    }
    case 'multiselect': {
      const chosen = splitChoices(value);
      const all = [...choicesGiven, ...chosen.filter((c) => !choicesGiven.includes(c))];
      return {
        kind: 'several',
        chips: all.map((c) => ({ value: c, selected: chosen.includes(c) })),
        empty: all.length === 0 ? noChoices : null,
      };
    }
    case 'tags':
      return { kind: 'tags', tags: splitChoices(value), hint: `Add to ${options.label ?? ''}` };
    case 'reference': {
      const known = entries.some((e) => e.id === value);
      return {
        kind: 'link',
        items: [
          { value: '', label: 'Not linked' },
          // A link to an entry that is gone is kept until the author changes it, and said for what it is.
          ...(value.length > 0 && !known ? [{ value: goneLink, label: 'The linked entry was deleted' }] : []),
          ...entries.map((e) => ({ value: e.id, label: e.name })),
        ],
        selected: value.length === 0 || known ? value : goneLink,
      };
    }
    case 'references': {
      const chosen = splitChoices(value);
      const names = new Map(entries.map((e) => [e.id, e.name]));
      return {
        kind: 'links',
        chips: chosen.map((id) => ({
          id,
          label: names.get(id) ?? 'A deleted entry',
          removeTooltip: `Remove ${names.get(id) ?? 'the deleted entry'}`,
        })),
        menu: entries.filter((e) => !chosen.includes(e.id)).map((e) => ({ id: e.id, label: e.name })),
        menuTooltip: 'Link another entry',
      };
    }
  }
}

/** A date picked, as stored: "0042-03-07". */
export function dateChosen(year: number, month: number, day: number): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
}

/** A segment of a few short choices pressed: the value to keep ('' when the one chosen is pressed again). */
export function segmentPressed(selected: string | null, pressed: string): string {
  return selected === pressed ? '' : pressed;
}

/** A choice of several turned on or off: the value to keep (one a line). */
export function severalToggled(value: string, choice: string, on: boolean): string {
  const chosen = splitChoices(value);
  return (on ? [...chosen, choice] : chosen.filter((x) => x !== choice)).join('\n');
}

/** A tag added (the box's text, trimmed; nothing for blank or a tag already there, null then). */
export function tagAdded(value: string, typed: string): string | null {
  const tag = dartTrim(typed);
  if (tag.length === 0) return null;
  const tags = splitChoices(value);
  return tags.includes(tag) ? null : [...tags, tag].join('\n');
}

/** A tag or a link removed. */
export function removed(value: string, item: string): string {
  return splitChoices(value)
    .filter((x) => x !== item)
    .join('\n');
}

/** A link chosen in the drop-down: the value to keep, or null for the "deleted" line (nothing changes). */
export function linkChosen(chosen: string | null): string | null {
  return chosen === goneLink ? null : (chosen ?? '');
}

/** Another entry linked. */
export function linkAdded(value: string, id: string): string {
  return [...splitChoices(value), id].join('\n');
}
