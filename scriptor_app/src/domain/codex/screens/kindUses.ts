// WHAT EACH VIEW READS (FEATURES.md #215): the "Visualizations" box of a category, where the author chooses which field
// each view reads. Nothing is worked out from a field's name. Each menu offers only the fields of a type the view can
// read; a setting whose field was later retyped or removed is still shown, with what is wrong, until the author
// changes it. Groups: On a timeline (date, optional end), On a map (across, up), By rank, By who holds it (the
// connection that means holding it, and an optional current-holder field), In the ability tree, In the knowledge graph
// (its label, and which link fields are drawn).
//
// The pure parts of flutter_app/lib/features/codex/widgets/kind_uses_editor.dart. Each change is a function of the
// settings as stored when it runs (`(stored) => next`), saved with `saveUses`, so quick changes build on each other.

import { type JsonMap, mapOrNull, strOrNull } from '../../json';
import { type Category, fieldTypeLabel } from '../../records/category';
import { strings } from '../../records/jsonRecord';
import { connectionType, connectionTypes, type Link } from '../../records/link';
import { type KindView, missingFor, type Slot, fieldsFor, typeWords } from '../capabilities';
import type { CodexChanges } from '../codexChanges';

export const kindUsesWords = {
  title: 'Visualizations',
  caption: (name: string) =>
    `Choose the field each view reads. Nothing is worked out from field names. A view ${name} is not set up for shows ` +
    'its records as a table instead.',
  timeline: 'On a timeline',
  timelineNote: 'A Number is a year of the story’s calendar; a Date is a day.',
  map: 'On a map',
  rank: 'By rank',
  rankNote: 'A Choice (one) ranks by the order of its choices, lowest first.',
  ownership: 'By who holds it',
  ownershipNote: 'A holder is the record a connection of this type comes from: “Mira owns the Ember Crown”.',
  holding: 'Connection that means holding it',
  notSet: 'Not set',
  tree: 'In the ability tree',
  treeLabel: 'Its records are abilities, skills, classes or the like',
  treeNote:
    'Kept for the Ability paths view in Visualize, with the paths you record between them: prerequisites, upgrades, ' +
    'evolutions, fusions, replacements, exclusions.',
  graph: 'In the knowledge graph',
  graphLinksIntro: 'Link fields drawn as connections:',
  setUp: 'Set up: shown under Visualize → Records by kind.',
  notSetUp: 'Not set up.',
} as const;

/** A change of the settings, saved on the category `kindKey`, made from the settings as stored when it runs. */
export function saveUses(kindKey: string, change: (stored: JsonMap) => JsonMap): (c: CodexChanges) => Category {
  return (c) => c.saveCategory(kindKey, (current) => ({ uses: change({ ...(mapOrNull(current?.raw['uses']) ?? {}) }) }));
}

/** `key` set to `value`. */
export function setUse(key: string, value: unknown): (stored: JsonMap) => JsonMap {
  return (stored) => ({ ...stored, [key]: value });
}

/** `key.sub` set to `value` (a null value removes `sub`). */
export function setUseIn(key: string, sub: string, value: unknown): (stored: JsonMap) => JsonMap {
  return (stored) => {
    const part: JsonMap = { ...(mapOrNull(stored[key]) ?? {}), [sub]: value };
    for (const k of Object.keys(part)) if (part[k] === null || part[k] === undefined) delete part[k];
    return { ...stored, [key]: part };
  };
}

/** A menu of the fields that can fill a slot: "none" first, the fitting fields ("Rank (Number)"), and the stored
 * choice when it no longer fits ("Rank (does not suit now)", or "A field that is gone"). */
export function slotMenu(
  category: Category,
  slot: Slot,
  label: string,
  value: unknown,
  none: string,
): { slot: Slot; label: string; value: string; choices: { value: string; label: string }[] } {
  const fitting = fieldsFor(category, slot);
  const current = typeof value === 'string' && value.length > 0 ? value : '';
  const fits = fitting.some((f) => f.id === current);
  const stale = current.length > 0 && !fits ? (category.fields.find((f) => f.id === current) ?? null) : null;
  return {
    slot,
    label,
    value: current,
    choices: [
      { value: '', label: none },
      ...fitting.map((f) => ({ value: f.id, label: `${f.name} (${fieldTypeLabel[f.type ?? 'text']})` })),
      ...(current.length > 0 && !fits
        ? [{ value: current, label: stale !== null ? `${stale.name} (does not suit now)` : 'A field that is gone' }]
        : []),
    ],
  };
}

/** What a menu's choice saves: '' is nothing chosen (null). */
export function chosenField(v: string | null): string | null {
  return v === null || v.length === 0 ? null : v;
}

/** Whether a view can be shown, in words: not set up (or what to add first), what is still missing, or ready. */
export function viewState(
  category: Category,
  view: KindView,
  isSet: boolean,
  slot: Slot,
): { kind: 'note'; text: string } | { kind: 'issues'; items: string[] } {
  const missing = missingFor(category, view);
  if (!isSet) {
    return {
      kind: 'note',
      text: fieldsFor(category, slot).length > 0 ? kindUsesWords.notSetUp : `Add ${typeWords(slot)} to set this up.`,
    };
  }
  if (missing.length > 0) return { kind: 'issues', items: missing };
  return { kind: 'note', text: kindUsesWords.setUp };
}

/** The connection kinds offered as "holding": "Not set", every built-in kind, and the author's own kinds found on
 * the novel's connections (and the one set now), "(your own)". */
export function holdingMenu(
  category: Category,
  links: readonly Link[],
): { value: string; choices: { value: string; label: string }[] } {
  const ownership = mapOrNull(category.uses['ownership']) ?? {};
  const holding = strOrNull(ownership['type']);
  const builtin = new Set(connectionTypes.map((t) => t.key));
  const own = new Set<string>();
  for (const t of [...links.map((l) => l.type ?? ''), strOrNull(ownership['type']) ?? '']) {
    if (t.length > 0 && !builtin.has(t)) own.add(t);
  }
  return {
    value: holding ?? '',
    choices: [
      { value: '', label: kindUsesWords.notSet },
      ...connectionTypes.map((t) => ({ value: t.key, label: t.label })),
      ...[...own].map((t) => ({ value: t, label: `${connectionType(t).label} (your own)` })),
    ],
  };
}

/** The whole box, as shown. */
export function kindUses(
  category: Category,
  links: readonly Link[],
): {
  title: string;
  caption: string;
  timeline: { start: ReturnType<typeof slotMenu>; end: ReturnType<typeof slotMenu>; state: ReturnType<typeof viewState> };
  map: { x: ReturnType<typeof slotMenu>; y: ReturnType<typeof slotMenu>; state: ReturnType<typeof viewState> };
  rank: { menu: ReturnType<typeof slotMenu>; state: ReturnType<typeof viewState> };
  ownership: {
    holding: ReturnType<typeof holdingMenu>;
    field: ReturnType<typeof slotMenu>;
    state: ReturnType<typeof viewState>;
  };
  tree: boolean;
  graph: {
    label: ReturnType<typeof slotMenu>;
    links: { id: string; name: string; on: boolean; label: string }[];
    issues: string[];
  };
} {
  const uses = category.uses;
  const timeline = mapOrNull(uses['timeline']) ?? {};
  const map = mapOrNull(uses['map']) ?? {};
  const ownership = mapOrNull(uses['ownership']) ?? {};
  const set = (k: string) => uses[k] !== null && uses[k] !== undefined;
  const chosenLinks = Array.isArray(uses['graphLinks']) ? strings(uses['graphLinks']) : null;
  return {
    title: kindUsesWords.title,
    caption: kindUsesWords.caption(category.name),
    timeline: {
      start: slotMenu(category, 'timeline.start', 'Date on the timeline', timeline['start'], 'Not on a timeline'),
      end: slotMenu(category, 'timeline.end', 'End on the timeline (optional)', timeline['end'], 'No end'),
      state: viewState(category, 'timeline', set('timeline'), 'timeline.start'),
    },
    map: {
      x: slotMenu(category, 'map.x', 'Across on the map', map['x'], kindUsesWords.notSet),
      y: slotMenu(category, 'map.y', 'Up on the map', map['y'], kindUsesWords.notSet),
      state: viewState(category, 'map', set('map'), 'map.x'),
    },
    rank: {
      menu: slotMenu(category, 'rank', 'Rank', uses['rank'], 'Not ranked'),
      state: viewState(category, 'rank', set('rank'), 'rank'),
    },
    ownership: {
      holding: holdingMenu(category, links),
      field: slotMenu(category, 'ownership.field', 'Current holder field (optional)', ownership['field'], 'None'),
      state: viewState(category, 'ownership', set('ownership'), 'ownership.field'),
    },
    tree: uses['tree'] === true,
    graph: {
      label: slotMenu(category, 'graphLabel', 'Label in the knowledge graph', uses['graphLabel'], 'Its name'),
      links: fieldsFor(category, 'graphLinks').map((def) => ({
        id: def.id,
        name: def.name,
        on: chosenLinks === null || chosenLinks.includes(def.id),
        label: `Draw ${def.name} in the knowledge graph`,
      })),
      issues: [...missingFor(category, 'graphLabel'), ...missingFor(category, 'graphLinks')],
    },
  };
}

/** The ability tree's box ticked or not: `tree` is true, or removed. */
export function treeTicked(on: boolean): (stored: JsonMap) => JsonMap {
  return setUse('tree', on ? true : null);
}

/** A link field ticked or not for the knowledge graph. Every link field ticked is the same as none chosen: all are
 * drawn, including ones added later (stored as null). */
export function graphLinkTicked(category: Category, defId: string, on: boolean): (stored: JsonMap) => JsonMap {
  return (stored) => {
    const live = fieldsFor(category, 'graphLinks').map((d) => d.id);
    const now = (Array.isArray(stored['graphLinks']) ? strings(stored['graphLinks']) : live).filter((id) => id !== defId);
    const next = on ? [...now, defId] : now;
    return { ...stored, graphLinks: live.every((id) => next.includes(id)) ? null : next };
  };
}
