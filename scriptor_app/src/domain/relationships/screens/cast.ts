// What the relationship screens read of the cast: the characters by name, the chapters and scenes to choose from, and
// how a chapter is named. Small ports of CastData.characters / CastData.documents
// (flutter_app/lib/features/characters/characters_providers.dart) and documentLabel / documentName
// (features/characters/widgets/parts.dart), from the story model alone. The characters domain has its own copies; these
// are the same rules, kept here so the relationship screens do not wait on it.

import { localeCompare } from '../../collation';
import { dartSort } from '../../manuscript/dartSort';
import { type StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import { type Entry } from '../../records/entry';
import { type StoryNode } from '../../records/storyNode';

/** Dart's `String.compareTo`: by UTF-16 code units. */
export const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Every entry in id order, as the original app reads them (which decides the order of characters with one name). */
export function entriesById(model: StoryModel): Entry[] {
  return dartSort([...model.entries.values()], (a, b) => compareCodeUnits(a.id, b.id));
}

/** The characters, by name, for choosing who is related; `except` one. */
export function charactersOf(model: StoryModel, except: string | null = null): Entry[] {
  return stableSorted(
    entriesById(model).filter((e) => e.category === 'character' && e.id !== except),
    (a, b) => localeCompare(a.name, b.name),
  );
}

/** The chapters and scenes in reading order, for choosing where something happens. */
export function documentsOf(model: StoryModel): StoryNode[] {
  return stableSorted(
    [...model.nodes.values()].filter((n) => n.kind === 'chapter' || n.kind === 'scene'),
    (a, b) => (model.order.position.get(a.id) ?? 0) - (model.order.position.get(b.id) ?? 0),
  );
}

/** A chapter or scene as a chooser shows it: "Ch 3: The Seal", a scene indented under its chapter. */
export function documentLabel(model: StoryModel, node: StoryNode): string {
  const number = model.order.chapterNumber.get(node.id);
  return node.kind === 'scene'
    ? `    ${node.displayTitle}`
    : number === undefined
      ? node.displayTitle
      : `Ch ${number}: ${node.displayTitle}`;
}

/** Where a chapter or scene is named in a sentence: its title, or that it is gone. */
export function documentName(model: StoryModel, nodeId: string | null): string {
  return nodeId === null ? 'Not set' : (model.nodes.get(nodeId)?.displayTitle ?? 'A deleted chapter');
}

/** One choice in a chooser: what it stores, and what it says. */
export type Choice<T = string> = { value: T; label: string };

/** A chooser's current value, with every choice it offers. */
export type Chooser<T = string> = { label: string; value: T; choices: Choice<T>[] };

/** The value a chooser shows for a record that is gone (an event or chapter since deleted). */
export const goneChoice = '\u0000gone';

/** Choosing one chapter or scene, or none (`DocumentChooser`): '' for none, `goneChoice` for one since deleted. */
export function documentChooser(model: StoryModel, label: string, value: string | null, none = 'Not set'): Chooser {
  const docs = documentsOf(model);
  const known = value === null || docs.some((d) => d.id === value);
  return {
    label,
    value: known ? (value ?? '') : goneChoice,
    choices: [
      { value: '', label: none },
      ...(known ? [] : [{ value: goneChoice, label: 'A deleted chapter' }]),
      ...docs.map((d) => ({ value: d.id, label: documentLabel(model, d) })),
    ],
  };
}

/** What choosing in a document or event chooser gives: the id, or null for none; `undefined` when the choice was the
 * deleted one (nothing changes). */
export function chosenId(v: string | null): string | null | undefined {
  if (v === goneChoice) return undefined;
  return v === null || v.length === 0 ? null : v;
}
