// SYSTEM SNAPSHOTS on a character's Progression tab: for a novel with a worked-out system, a character's whole state
// against the blueprints (levels, attributes, skills), gear and condition, logged at a chapter. Each is complete in
// itself. The pure parts of flutter_app/lib/features/progression/widgets/snapshots.dart: the section (log one, the
// chips of those logged, then one of three views: the state at a chapter, editing one, comparing two), the state card,
// the comparison, and the editor with what each of its fields changes, as `(current) => edit` for
// SnapshotChanges.updateSnapshot (snapshots.ts), or `(x: SnapshotChanges) => …`.
//
// The section: a box titled "System snapshots" with its caption; a wrap of "Snapshot is true from" (260), "Label for
// the new snapshot" (260) and "Log snapshot"; the hint (small). With snapshots: their chips; a segmented button
// (State at a chapter, Edit snapshot, Compare); then the view. The editor: True from (260) and the label (260); each
// system's part (a box titled with it: the "work it out" checkbox with its subtitle; each track 220 wide, a number for
// levels or a chooser of stages; each value a row: its name (140), a chooser (180) for a choice, else "Their own" /
// "Entered" (160), the worked-out display (error colour for an error), and "Set X by hand" (140); each group's items
// as filter chips; "Now within reach: …"); "Track X in another system…"; Inventory & gear (each a row of name, how it is
// held (140) and remove; then New gear (200), Codex item (200), How it is held (160, with suggestions), Add gear);
// Status (one thing per line); Notes; and "Editing this snapshot never changes any other." with Delete snapshot….

import { localeCompare } from '../../exchange/collation';
import { type JsonMap, mapOrNull } from '../../json';
import { dartSort } from '../../manuscript/dartSort';
import { compareSiblings } from '../../model/storyOrder';
import { type StoryModel } from '../../model/storyModel';
import { maps, strings } from '../../records/jsonRecord';
import { type StoryNode } from '../../records/storyNode';
import { type SysGroup, type SysItem, type SysTrack, type SysVariable, type SystemBlueprint } from '../../records/system';
import { dartDoubleTryParse } from '../../records/dartNum';
import { stableSorted } from '../../reader/stableSort';
import { formatNumber } from '../../systems/formula';
import { dartToUpperCase } from '../../exchange/dartUpperCase';
import { dartTrim } from '../../text/dartString';
import {
  type Comparison,
  type ProgressSnapshot,
  type SnapshotChanges,
  type SnapshotSystem,
  compareSnapshots,
  dimensionHints,
  dimensionLabels,
  gearKinds,
  inStoryOrder,
  linesOf,
  placeOfSnapshot,
  resolveSystem,
  stateAt,
  statusDimensions,
} from '../snapshots';

export type Choice = { value: string; label: string };

/** The chapters and scenes in reading order, each with its depth (manuscript/board.dart's tree, flattened). */
export function documentsOf(nodes: readonly StoryNode[]): { node: StoryNode; depth: number }[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byParent = new Map<string | null, StoryNode[]>();
  for (const node of nodes) {
    const key = node.parentId !== null && ids.has(node.parentId) ? node.parentId : null;
    let list = byParent.get(key);
    if (list === undefined) byParent.set(key, (list = []));
    list.push(node);
  }
  const out: { node: StoryNode; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const node of dartSort([...(byParent.get(parentId) ?? [])], compareSiblings)) {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return out.filter((t) => t.node.kind === 'chapter' || t.node.kind === 'scene');
}

/** Each chapter and scene as a choice: indented two spaces a level, after `prefix`. */
export function chapterChoices(documents: readonly { node: StoryNode; depth: number }[], prefix = ''): Choice[] {
  return documents.map((t) => ({ value: t.node.id, label: `${'  '.repeat(t.depth)}${prefix}${t.node.title}` }));
}

/** A snapshot in a line, for its chip: each system's tracks, "Level 12" (no "of 100"). */
export function snapshotSummary(s: ProgressSnapshot, systems: readonly SystemBlueprint[]): string {
  const out: string[] = [];
  for (const system of systems) {
    const state = s.systems.get(system.id);
    if (state === undefined) continue;
    for (const t of resolveSystem(system, state).tracks) out.push(`${t.track.name} ${t.label.replace(/ of \d+$/, '')}`);
  }
  return out.join(' · ');
}

/** What the section remembers: when a new one is true from, its label, the one chosen, the view, the point of
 * "State at a chapter", and the two compared. */
export type SnapshotsState = {
  at: string;
  label: string;
  selected: string | null;
  view: 'inspect' | 'edit' | 'compare';
  asOf: string;
  from: string | null;
  to: string | null;
};

export const snapshotsStart: SnapshotsState = { at: '', label: '', selected: null, view: 'inspect', asOf: '', from: null, to: null };

export type SnapshotsView = {
  name: string;
  title: string;
  caption: string;
  atLabel: string;
  atChoices: Choice[];
  /** The chosen point, when it is still a chapter; else ''. */
  at: string;
  labelLabel: string;
  labelHint: string;
  log: string;
  hint: string;
  /** Nothing logged yet: no chips and no views. */
  chips: { id: string; label: string; selected: boolean }[];
  views: Choice[];
  inspect: { label: string; choices: Choice[]; asOf: string; found: ProgressSnapshot | null; nothing: string } | null;
  edit: ProgressSnapshot | null;
  compare:
    | { from: ProgressSnapshot; to: ProgressSnapshot; choices: Choice[]; comparison: Comparison }
    | { none: string }
    | null;
};

/** The section for `entryId`, or null when the entry is gone. */
export function snapshotsView(
  model: StoryModel,
  snapshots: readonly ProgressSnapshot[],
  entryId: string,
  state: SnapshotsState,
): SnapshotsView | null {
  const entry = model.entries.get(entryId);
  if (entry === undefined) return null;
  const name = entry.name;
  const nodes = [...model.nodes.values()];
  const mine = inStoryOrder(snapshots, nodes, entry.id);
  const documents = documentsOf(nodes);
  const systems = [...model.systems.values()];
  const selected = mine.find((s) => s.id === state.selected) ?? mine[mine.length - 1] ?? null;
  const asOf = documents.some((t) => t.node.id === state.asOf) ? state.asOf : null;
  const found = stateAt(snapshots, nodes, entry.id, asOf);
  const from = mine.find((s) => s.id === state.from) ?? (mine.length > 1 ? mine[mine.length - 2] : null);
  const to = mine.find((s) => s.id === state.to) ?? mine[mine.length - 1] ?? null;
  const any = mine.length > 0;
  return {
    name,
    title: 'System snapshots',
    caption:
      `For a novel with a worked-out system: ${name}’s whole state against your system blueprints (levels, ` +
      'attributes, skills), gear and condition, logged at a chapter.',
    atLabel: 'Snapshot is true from',
    atChoices: [{ value: '', label: 'Before the story' }, ...chapterChoices(documents)],
    at: documents.some((t) => t.node.id === state.at) ? state.at : '',
    labelLabel: 'Label for the new snapshot',
    labelHint: 'After the evolution',
    log: 'Log snapshot',
    hint: `A new snapshot starts as a copy of ${name}’s state at that point, so you only enter what changed.`,
    chips: mine.map((s) => ({
      id: s.id,
      label: [placeOfSnapshot(s, nodes), ...(s.label.length > 0 ? [s.label] : []), ...(snapshotSummary(s, systems).length > 0 ? [snapshotSummary(s, systems)] : [])].join(' · '),
      selected: s.id === selected?.id && state.view === 'edit',
    })),
    views: [
      { value: 'inspect', label: 'State at a chapter' },
      { value: 'edit', label: 'Edit snapshot' },
      { value: 'compare', label: 'Compare' },
    ],
    inspect:
      any && state.view === 'inspect'
        ? {
            label: 'As of',
            choices: [{ value: '', label: 'As of the end of the story' }, ...chapterChoices(documents, 'As of ')],
            asOf: asOf ?? '',
            found,
            nothing: `Nothing is logged for ${name} by then.`,
          }
        : null,
    edit: any && state.view === 'edit' ? selected : null,
    compare:
      !any || state.view !== 'compare'
        ? null
        : mine.length >= 2 && from !== null && to !== null
          ? {
              from,
              to,
              choices: mine.map((s) => ({ value: s.id, label: `${placeOfSnapshot(s, nodes)}${s.label.length > 0 ? `: ${s.label}` : ''}` })),
              comparison: compareSnapshots(from, to, systems),
            }
          : { none: 'Log two snapshots to compare them.' },
  };
}

/** Logging a new snapshot, and what the section shows next (it, being edited). */
export function logSnapshot(entryId: string, state: SnapshotsState) {
  return {
    change: (x: SnapshotChanges) => x.createSnapshot(entryId, { nodeId: state.at.length === 0 ? null : state.at, label: state.label }),
    after: (made: ProgressSnapshot): SnapshotsState => ({ ...state, label: '', selected: made.id, view: 'edit' }),
  };
}

// ---------------------------------------------------------------------------------------------------- the state card

export type StateCard = {
  heading: string;
  systems: {
    name: string;
    tracks: string[];
    rows: { name: string; display: string; byHand: string | null; systemSays: string | null }[];
    holds: string | null;
  }[];
  gear: { heading: string; lines: string[] } | null;
  status: { heading: string; lines: string[] }[];
  notes: string | null;
};

/** One snapshot as it reads: each system worked out (or as entered), gear, status and notes. */
export function stateCard(model: StoryModel, snapshot: ProgressSnapshot, nodes: readonly StoryNode[]): StateCard {
  const systems: StateCard['systems'] = [];
  for (const [id, state] of snapshot.systems) {
    const system = model.systems.get(id);
    if (system === undefined) continue;
    const r = resolveSystem(system, state);
    systems.push({
      name: system.name,
      tracks: r.tracks.map((t) => `${t.track.name}: ${t.label}`),
      rows: r.rows.map((row) => ({
        name: `${row.variable.name}: `,
        display: row.display,
        byHand: row.byHand ? ' (set by hand)' : null,
        systemSays: row.systemSays === null ? null : ` · the system works out ${row.systemSays}`,
      })),
      holds: r.items.length === 0 ? null : `Holds: ${r.items.map((i) => i.item.name).join(', ')}`,
    });
  }
  return {
    heading: `From the snapshot at ${placeOfSnapshot(snapshot, nodes)}${snapshot.label.length > 0 ? `: ${snapshot.label}` : ''}`,
    systems,
    gear:
      snapshot.gear.length === 0
        ? null
        : {
            heading: 'Inventory & gear',
            lines: snapshot.gear.map((g) => [g.name, ...(g.kind.length > 0 ? [g.kind] : []), ...(g.note.length > 0 ? [g.note] : [])].join(' · ')),
          },
    status: statusDimensions
      .map((d) => ({ heading: dimensionLabels[d], lines: linesOf(snapshot.status(d)).map((l) => `• ${l}`) }))
      .filter((s) => s.lines.length > 0),
    notes: snapshot.notes.length > 0 ? snapshot.notes : null,
  };
}

/** Two snapshots compared, as headed groups of lines; or that nothing differs. */
export function comparisonLines(c: Comparison): { same: string } | { groups: { heading: string; lines: string[] }[] } {
  if (c.same) return { same: 'Nothing differs between the two.' };
  const groups: { heading: string; lines: string[] }[] = [];
  const group = (heading: string, lines: string[]) => {
    if (lines.length > 0) groups.push({ heading, lines });
  };
  group(
    'Values',
    c.stats.map(
      (s) =>
        `${s.system} · ${s.name}: ${s.from} → ${s.to}${s.delta !== null ? ` (${s.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(s.delta))})` : ''}`,
    ),
  );
  group('Advancement', c.advancement.map((a) => `${a.system} · ${a.name}: ${a.from} → ${a.to}`));
  group('Gained', c.gained.map((g) => `${g.group}: ${g.name}`));
  group('Lost', c.lost.map((g) => `${g.group}: ${g.name}`));
  group(
    'Gear',
    c.gear.map((g) => `${dartToUpperCase(g.change[0])}${g.change.substring(1)}: ${g.name}${g.detail.length > 0 ? ` (${g.detail})` : ''}`),
  );
  for (const s of c.status) groups.push({ heading: s.label, lines: [...s.added.map((l) => `+ ${l}`), ...s.removed.map((l) => `− ${l}`)] });
  return { groups };
}

// ---------------------------------------------------------------------------------------------------- the editor

/** An edit of a snapshot, from it as stored (SnapshotChanges.updateSnapshot). */
export type SnapshotEdit = (current: ProgressSnapshot) => JsonMap;
/** An edit of one system of a snapshot, from that system as stored. */
export type SystemEdit = (current: JsonMap) => JsonMap;

/** A change to one system of the snapshot, made from it as stored. */
export function inSystem(systemId: string, change: SystemEdit): SnapshotEdit {
  return (s) => {
    const systems: JsonMap = { ...(mapOrNull(s.raw['systems']) ?? {}) };
    const current: JsonMap = {
      auto: true,
      values: {},
      progress: {},
      itemIds: [],
      overrides: {},
      ...(mapOrNull(systems[systemId]) ?? {}),
    };
    systems[systemId] = { ...current, ...change(current) };
    return { systems };
  };
}

/** The gear with one item changed. */
export function gearWith(s: ProgressSnapshot, id: string, change: JsonMap): JsonMap[] {
  return maps(s.raw['gear']).map((g) => (g['id'] === id ? { ...g, ...change } : g));
}

const without = (map: unknown, id: string): JsonMap => {
  const out: JsonMap = { ...(mapOrNull(map) ?? {}) };
  delete out[id];
  return out;
};

/** What the editor's fields change. Typed fields are saved a moment after typing stops, under their key
 * (`<snapshot>:<key>`, `<snapshot>:<system>:<key>` in a system). */
export const snapshotEdits = {
  /** True from: a chapter, or before the story (''). The "removed" entry changes nothing. */
  nodeId: (v: string): SnapshotEdit | null => (v === 'gone' ? null : () => ({ nodeId: v.length === 0 ? null : v })),
  label: (v: string): SnapshotEdit => () => ({ label: v }),
  notes: (v: string): SnapshotEdit => () => ({ notes: v }),
  status: (dimension: string, v: string): SnapshotEdit => (s) => ({ status: { ...(mapOrNull(s.raw['status']) ?? {}), [dimension]: v } }),
  /** A gear's name: a blank one is not kept. */
  gearName: (id: string, v: string): SnapshotEdit | null => (dartTrim(v).length === 0 ? null : (s) => ({ gear: gearWith(s, id, { name: v }) })),
  gearKind: (id: string, v: string): SnapshotEdit => (s) => ({ gear: gearWith(s, id, { kind: v }) }),
  removeGear: (id: string): SnapshotEdit => (s) => ({ gear: maps(s.raw['gear']).filter((x) => x['id'] !== id) }),
  /** New gear: named as typed, else for its codex item; nothing without a name. */
  addGear: (model: StoryModel, typed: string, entryId: string, kind: string, newId: () => string): SnapshotEdit | null => {
    const named = dartTrim(typed).length > 0 ? dartTrim(typed) : (model.entries.get(entryId)?.name ?? '');
    if (named.length === 0) return null;
    const item = { id: newId(), name: named, kind: dartTrim(kind), entryId: entryId.length === 0 ? null : entryId, note: '' };
    return (s) => ({ gear: [...maps(s.raw['gear']), item] });
  },
  /** Track the character in another system: it joins the snapshot as the system starts. */
  addSystem: (systemId: string): SnapshotEdit => inSystem(systemId, () => ({})),
  auto: (on: boolean): SystemEdit => () => ({ auto: on }),
  /** A level typed: a whole number, at least 1 (1 when it does not read as a number). */
  level: (track: SysTrack, text: string): SystemEdit => (c) => {
    const n = dartDoubleTryParse(dartTrim(text)) ?? 1;
    return { progress: { ...(mapOrNull(c['progress']) ?? {}), [track.id]: n < 1 ? 1 : Math.floor(n + 0.5) } };
  },
  stage: (track: SysTrack, stageId: string): SystemEdit => (c) => ({ progress: { ...(mapOrNull(c['progress']) ?? {}), [track.id]: stageId } }),
  /** A choice: with the calculator off, it is also no longer set by hand. */
  choice: (variable: SysVariable, auto: boolean, v: string): SystemEdit => (c) =>
    auto
      ? { values: { ...(mapOrNull(c['values']) ?? {}), [variable.id]: v } }
      : { values: { ...(mapOrNull(c['values']) ?? {}), [variable.id]: v }, overrides: without(c['overrides'], variable.id) },
  /** "Their own" (or "Entered"): a number, or nothing when blank or not a number. A value worked out from others is
   * set by hand instead. */
  own: (variable: SysVariable, auto: boolean, text: string): SystemEdit => (c) => {
    const n = dartDoubleTryParse(dartTrim(text));
    const value = dartTrim(text).length === 0 || n === null ? null : n;
    const id = variable.id;
    if (variable.kind !== 'derived') {
      const values = value === null ? without(c['values'], id) : { ...(mapOrNull(c['values']) ?? {}), [id]: value };
      return auto ? { values } : { values, overrides: without(c['overrides'], id) };
    }
    return { overrides: value === null ? without(c['overrides'], id) : { ...(mapOrNull(c['overrides']) ?? {}), [id]: value } };
  },
  /** "Set X by hand". */
  byHand: (variable: SysVariable, text: string): SystemEdit => (c) => {
    const n = dartDoubleTryParse(dartTrim(text));
    const id = variable.id;
    return { overrides: dartTrim(text).length === 0 || n === null ? without(c['overrides'], id) : { ...(mapOrNull(c['overrides']) ?? {}), [id]: n } };
  },
  /** An item held or not; a group held one at a time keeps the one chosen. */
  hold: (group: SysGroup, options: readonly SysItem[], item: SysItem, held: boolean): SystemEdit => (c) => {
    const now = strings(c['itemIds']);
    const next = held
      ? [...now.filter((id) => !group.single || !options.some((o) => o.id === id)), item.id]
      : now.filter((id) => id !== item.id);
    return { itemIds: next };
  },
  remove: (snapshotId: string) => (x: SnapshotChanges) => {
    x.removeSnapshot(snapshotId);
    return true;
  },
};

export type SystemPartView = {
  system: SystemBlueprint;
  title: string;
  auto: boolean;
  autoTitle: string;
  autoSubtitle: string;
  tracks: (
    | { track: SysTrack; kind: 'levels'; label: string; value: string }
    | { track: SysTrack; kind: 'stages'; label: string; value: string | null; choices: Choice[] }
  )[];
  rows: {
    variable: SysVariable;
    name: string;
    /** A choice's chooser, with what it shows. */
    choice: { label: string; value: string | null; choices: Choice[] } | null;
    /** "Their own" / "Entered": shown for a value that is not worked out from others, or when nothing is worked out. */
    own: { label: string; hint: string; value: string } | null;
    /** With the calculator on: what is shown (the error, what the system works out when set by hand, or the value). */
    shown: { text: string; error: boolean } | null;
    /** With the calculator on, for any value but a choice: "Set X by hand". */
    byHand: { label: string; value: string } | null;
    /** How a boosted value came out ("10 + 5 from Power"); null when nothing boosts it or it is set by hand. */
    breakdown: string | null;
  }[];
  /** `switchable`: what is held in the group, chosen or given by a stage reached, each with an on/off switch. */
  groups: { group: SysGroup; heading: string; options: SysItem[]; held: string[]; switchable: string[] }[];
  reach: string | null;
};

const numberText = (v: unknown): string => (typeof v === 'number' ? formatNumber(v) : '');

/** One system in a snapshot: worked out from the blueprint (values set by hand win), or entered as is. */
export function systemPart(system: SystemBlueprint, state: SnapshotSystem): SystemPartView {
  const resolved = resolveSystem(system, state);
  const auto = state.auto;
  const items = system.items;
  return {
    system,
    title: system.name,
    auto,
    autoTitle: 'Work out formulas and class effects from the system',
    autoSubtitle: auto
      ? 'Suggestions only: anything you set by hand replaces what the system works out.'
      : 'Nothing is worked out. Every value below is exactly what you enter.',
    tracks: system.tracks.map((track) => {
      const raw = state.progress.get(track.id);
      if (track.kind === 'levels') {
        return { track, kind: 'levels' as const, label: `${track.name} in this snapshot`, value: typeof raw === 'number' ? formatNumber(raw) : '1' };
      }
      return {
        track,
        kind: 'stages' as const,
        label: `${track.name} in this snapshot`,
        value: track.stages.some((s) => s.id === raw) ? (raw as string) : (track.stages[0]?.id ?? null),
        choices: track.stages.map((s) => ({ value: s.id, label: s.name })),
      };
    }),
    rows: resolved.rows.map((row) => {
      const v = row.variable;
      const own = auto ? state.values.get(v.id) : (state.overrides.get(v.id) ?? state.values.get(v.id));
      return {
        variable: v,
        name: v.name,
        choice:
          v.kind === 'choice'
            ? {
                label: `${v.name} in this snapshot`,
                value: v.options.includes(row.value as string) ? (row.value as string) : (v.options[0] ?? null),
                choices: v.options.map((o) => ({ value: o, label: o })),
              }
            : null,
        own:
          v.kind !== 'choice' && (v.kind !== 'derived' || !auto)
            ? { label: auto ? 'Their own' : 'Entered', hint: v.kind === 'derived' ? '—' : formatNumber(v.base), value: numberText(own) }
            : null,
        shown: auto ? { text: row.error ?? (row.byHand ? (row.systemSays ?? row.display) : row.display), error: row.error !== null } : null,
        byHand: auto && v.kind !== 'choice' ? { label: `Set ${v.name} by hand`, value: numberText(state.overrides.get(v.id)) } : null,
        breakdown: row.breakdown,
      };
    }),
    groups: system.groupList
      .map((group) => ({
        group,
        heading: `${group.name} in this snapshot`,
        options: items.filter((i) => i.groupId === group.id),
        held: state.itemIds,
        switchable: resolved.items.filter((i) => i.item.groupId === group.id).map((i) => i.item.id),
      }))
      .filter((g) => g.options.length > 0),
    reach: resolved.available.length === 0 ? null : `Now within reach: ${resolved.available.map((i) => i.name).join(', ')}`,
  };
}

export type SnapshotEditorView = {
  /** True from: '' before the story, 'gone' for a chapter that was removed, else the chapter. */
  at: string;
  atLabel: string;
  atChoices: Choice[];
  label: { label: string; hint: string; value: string };
  systems: SystemPartView[];
  /** "Track X in another system…", with the systems not in the snapshot yet. */
  addSystem: { label: string; tooltip: string; systems: Choice[] } | null;
  gear: {
    title: string;
    items: { id: string; nameLabel: string; name: string; kindLabel: string; kindHint: string; kind: string; removeTooltip: string }[];
    newLabel: string;
    newHint: string;
    /** "Codex item": Not in the codex, then every entry that is not a character, by name. */
    codexItems: Choice[] | null;
    kindLabel: string;
    kindHint: string;
    kindSuggestions: readonly string[];
    add: string;
  };
  status: { title: string; fields: { dimension: string; label: string; hint: string; value: string }[] };
  notes: { label: string; value: string };
  footer: string;
  delete: { label: string; title: string; message: string; confirmLabel: string };
};

/** Editing one snapshot of `name`'s: when it is true from, its label, each system, gear, status and notes. */
export function snapshotEditor(model: StoryModel, snapshot: ProgressSnapshot, name: string): SnapshotEditorView {
  const nodes = [...model.nodes.values()];
  const documents = documentsOf(nodes);
  const here = snapshot.systems;
  const unused = [...model.systems.values()].filter((s) => !here.has(s.id));
  const codexItems = stableSorted(
    [...model.entries.values()].filter((e) => e.category !== 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  const at = snapshot.nodeId === null ? '' : documents.some((t) => t.node.id === snapshot.nodeId) ? snapshot.nodeId : 'gone';
  const systems: SystemPartView[] = [];
  for (const [systemId, state] of here) {
    const system = model.systems.get(systemId);
    if (system !== undefined) systems.push(systemPart(system, state));
  }
  return {
    at,
    atLabel: 'True from',
    atChoices: [
      { value: '', label: 'Before the story' },
      ...(at === 'gone' ? [{ value: 'gone', label: 'A chapter that was removed' }] : []),
      ...chapterChoices(documents),
    ],
    label: { label: 'Snapshot label', hint: 'After the evolution', value: snapshot.label },
    systems,
    addSystem:
      unused.length === 0
        ? null
        : { label: `Track ${name} in another system…`, tooltip: 'Track a system in this snapshot', systems: unused.map((s) => ({ value: s.id, label: s.name })) },
    gear: {
      title: 'Inventory & gear',
      items: snapshot.gear.map((g) => ({
        id: g.id,
        nameLabel: `Name of ${g.name}`,
        name: g.name,
        kindLabel: 'How it is held',
        kindHint: 'Equipped',
        kind: g.kind,
        removeTooltip: `Remove ${g.name}`,
      })),
      newLabel: 'New gear',
      newHint: 'What they have',
      codexItems: codexItems.length === 0 ? null : [{ value: '', label: 'Not in the codex' }, ...codexItems.map((e) => ({ value: e.id, label: e.name }))],
      kindLabel: 'How it is held',
      kindHint: gearKinds[0],
      kindSuggestions: gearKinds,
      add: 'Add gear',
    },
    status: {
      title: 'Status (one thing per line)',
      fields: statusDimensions.map((d) => ({ dimension: d, label: dimensionLabels[d], hint: dimensionHints[d], value: snapshot.status(d) })),
    },
    notes: { label: 'Notes', value: snapshot.notes },
    footer: 'Editing this snapshot never changes any other.',
    delete: {
      label: 'Delete snapshot…',
      title: 'Delete snapshot',
      message: `Delete this snapshot of ${name}? The snapshots before and after it are not changed.`,
      confirmLabel: 'Delete snapshot',
    },
  };
}
