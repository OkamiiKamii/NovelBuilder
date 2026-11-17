// THE PLAN of one chapter or scene (Plan › a chapter's plan): status, objective, summary, labels, the beats, the entries
// involved, who appears, the narrative dynamics, the ending, a web serial's notes, its timeline events and plot threads,
// its connections and private notes. Everything here is stored in the planning layer; there is deliberately no action
// that puts any of it into the manuscript. The pure parts of flutter_app/lib/features/plot/chapter_plan_page.dart and
// widgets/label_picker.dart: what is shown, and each press as a change (`(c: PlotChanges) => …`, inside
// PlotService.change; typing through autosave under `planSaveKey`).

import { localeCompare } from '../../collation';
import { categoriesOf } from '../../codex/codexChanges';
import { type JsonMap, str } from '../../json';
import type { StoryModel } from '../../model/storyModel';
import { stableSorted } from '../../reader/stableSort';
import { maps } from '../../records/jsonRecord';
import { nodeStatuses } from '../../records/nodeStatus';
import type { ChapterPlan, NodeStatus, StoryNode } from '../../records/storyNode';
import type { NovelSnapshot } from '../../snapshot/novelSnapshot';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import { kindName } from '../board';
import { suggestedLabels, usedLabels } from '../labels';
import { threadsByNode } from '../lanes';
import { type PlotChanges, planLabels } from '../plotChanges';
import { boardPath } from '../plotService';

/** What each planning field asks. */
export const planPlaceholders: Readonly<Record<string, string>> = {
  objective: 'Why this exists: what it must accomplish for the story.',
  conflict: 'Who wants what, and what stands in the way.',
  emotionalArc: 'Where the reader starts and ends emotionally.',
  dialogue: 'Lines or exchanges you want to land.',
  foreshadowing: 'What to plant now for later.',
  reveals: 'What the reader learns here.',
  openQuestions: 'What should be left hanging.',
  ending: 'The resolution, turn or cliffhanger to end on.',
};

/** The fields under "Narrative dynamics", in order. */
export const planDynamics: readonly string[] = ['conflict', 'emotionalArc', 'dialogue', 'foreshadowing', 'reveals', 'openQuestions'];

export type PlanField = { field: string; label: string; hint: string; value: string; lines: number };

export type Choice = { value: string; label: string };

export type PlanPageView =
  | { missing: true; title: string; message: string; action: string; actionPath: string }
  | {
      missing: false;
      node: StoryNode;
      plan: ChapterPlan | null;
      title: string;
      subtitle: string;
      /** "this chapter" / "this scene". */
      here: string;
      actions: { write: string; consequences: string; board: { label: string; path: string } };
      status: { label: string; steps: { status: NodeStatus; label: string; selected: boolean; done: boolean }[] };
      objective: PlanField;
      summary: { label: string; hint: string; value: string };
      labels: LabelPickerView;
      beats: { title: string; items: { id: string; number: number; text: string; label: string; up: string | null; down: string | null; remove: string }[] };
      entities: { label: string; chosen: string[]; options: Choice[] } | { none: string };
      inText: { title: string; entries: { id: string; name: string; character: boolean; tip: string }[] } | null;
      appearances: AppearancesView | null;
      dynamics: { title: string; fields: PlanField[] };
      ending: PlanField;
      serial: { title: string; caption: string; fields: { field: 'noteBefore' | 'noteAfter'; label: string; hint: string; value: string }[] } | null;
      events: { title: string; caption: string | null; items: { id: string; name: string }[] };
      threads: { title: string; caption: string | null; items: { id: string; title: string; beats: string | null }[] };
      notes: { label: string; hint: string; value: string };
    };

/** The plan page of `nodeId` (a chapter or scene), or why there is none. */
export function planPage(model: StoryModel, snapshot: NovelSnapshot, nodeId: string): PlanPageView {
  const node = model.nodes.get(nodeId);
  if (node === undefined || (node.kind !== 'chapter' && node.kind !== 'scene')) {
    return {
      missing: true,
      title: 'This chapter or scene is not here',
      message: 'It may have been deleted. The scene board shows every chapter and scene.',
      action: 'Open the scene board',
      actionPath: boardPath(),
    };
  }
  const id = node.id;
  const plan = model.plans.get(id) ?? null;
  const kind = dartToLowerCase(kindName(node) || 'chapter');
  const here = `this ${kind}`;
  const title = node.title.length === 0 ? 'Untitled' : node.title;
  const field = (f: string, lines = 2): PlanField => ({ field: f, label: planLabels[f], hint: planPlaceholders[f], value: str(plan?.raw[f]), lines });
  const categories = categoriesOf(snapshot);
  const entries = stableSorted(model.entries.values(), (a, b) => localeCompare(a.name, b.name));
  const inText = stableSorted(
    node.mentions.flatMap((m) => {
      const e = model.entries.get(m);
      return e === undefined ? [] : [e];
    }),
    (a, b) => localeCompare(a.name, b.name),
  );
  const events = [...model.events.values()].filter((e) => e.nodeIds.includes(id));
  const threads = threadsByNode(model).get(id) ?? [];
  const current = nodeStatuses.findIndex((s) => s.key === node.status);
  const beats = plan === null ? [] : maps(plan.raw['beats']);
  return {
    missing: false,
    node,
    plan,
    title: `Plan: ${title}`,
    subtitle: kindName(node),
    here,
    actions: {
      write: 'Write it',
      consequences: `What depends on this ${node.kind === null ? 'chapter' : dartToLowerCase(kindName(node))}?`,
      board: { label: 'Scene board', path: boardPath() },
    },
    status: {
      label: 'Status',
      steps: nodeStatuses.map((s, i) => ({ status: s.key, label: s.label, selected: s.key === node.status, done: i < current })),
    },
    objective: field('objective'),
    summary: { label: 'Summary', hint: `What happens in ${here}, in a sentence or two.`, value: node.summary },
    labels: labelPicker(plan?.labels ?? [], usedLabels(model), here),
    beats: {
      title: 'Key events & plot beats',
      items: beats.map((b, i) => ({
        id: str(b['id']),
        number: i + 1,
        text: str(b['text']),
        label: `Beat ${i + 1}`,
        up: i === 0 ? null : `Move beat ${i + 1} up`,
        down: i === beats.length - 1 ? null : `Move beat ${i + 1} down`,
        remove: `Remove beat ${i + 1}`,
      })),
    },
    entities:
      entries.length === 0
        ? { none: 'Create characters, and places and items under World, to attach them here.' }
        : {
            label: 'Entities involved',
            chosen: (plan?.entityIds ?? []).filter((e) => model.entries.has(e)),
            options: entries.map((e) => ({ value: e.id, label: `${e.name} · ${categories.get(e.category)?.singular ?? e.category}` })),
          },
    inText:
      inText.length === 0
        ? null
        : { title: 'Linked in the text', entries: inText.map((e) => ({ id: e.id, name: e.name, character: e.category === 'character', tip: `Open ${e.name}` })) },
    appearances: appearancesView(model, node, plan),
    dynamics: { title: 'Narrative dynamics', fields: planDynamics.map((f) => field(f)) },
    ending: field('ending'),
    serial:
      node.kind === 'chapter'
        ? {
            title: 'Notes for a web serial',
            caption: 'Printed before and after the chapter when the book is read or exported as a web serial. Never part of the story text.',
            fields: [
              { field: 'noteBefore', label: 'Note before the chapter', hint: 'A word to readers before the chapter starts.', value: str(node.raw['noteBefore']) },
              { field: 'noteAfter', label: 'Note after the chapter', hint: 'Thanks, a schedule, what comes next.', value: str(node.raw['noteAfter']) },
            ],
          }
        : null,
    events: {
      title: 'Timeline events',
      caption: events.length === 0 ? `No timeline events are linked to ${here} yet.` : null,
      items: events.map((e) => ({ id: e.id, name: e.name.length === 0 ? 'Untitled event' : e.name })),
    },
    threads: {
      title: 'Plot threads',
      caption: threads.length === 0 ? `No plot threads develop in ${here} yet.` : null,
      items: threads.map((h) => {
        const titles = h.thread.beats.filter((b) => b.nodeId === id && dartTrim(b.title).length > 0).map((b) => b.title);
        return { id: h.thread.id, title: h.thread.title.length === 0 ? 'Untitled thread' : h.thread.title, beats: titles.length === 0 ? null : titles.join(', ') };
      }),
    },
    notes: { label: 'Private notes', hint: 'Scratchpad: loose ideas, reminders, things to fix.', value: typeof node.raw['notes'] === 'string' ? node.raw['notes'] : '' },
  };
}

// ---------------------------------------------------------------------------------------------------- who appears

export type AppearancesView = {
  title: string;
  caption: string;
  lists: { field: 'appearIds' | 'mentionIds' | 'povIds'; label: string; chosen: string[]; options: Choice[]; addTip: string }[];
  /** Characters linked in the text with no record yet: one press records them. */
  linked: { title: string; people: { id: string; name: string; appears: string; mentioned: string }[] } | null;
};

/** Who appears in a chapter or scene, and who is only mentioned, as the author records it. Characters linked in the
 * text are offered to record with a tap; nothing is recorded for the author, and no text is searched for names. Null
 * when the novel has no characters. */
export function appearancesView(model: StoryModel, node: StoryNode, plan: ChapterPlan | null): AppearancesView | null {
  const characters = stableSorted(
    [...model.entries.values()].filter((e) => e.category === 'character'),
    (a, b) => localeCompare(a.name, b.name),
  );
  if (characters.length === 0) return null;
  const byId = new Map(characters.map((c) => [c.id, c]));
  const known = (ids: readonly string[]) => ids.filter((id) => byId.has(id));
  const appear = known(plan?.appearIds ?? []);
  const mention = known(plan?.mentionIds ?? []);
  const pov = known(plan?.povIds ?? []);
  const recorded = new Set([...appear, ...mention]);
  const linked = node.mentions.filter((id) => byId.has(id) && !recorded.has(id));
  const here = `this ${node.kind === null ? 'chapter' : dartToLowerCase(kindName(node))}`;
  const options = (field: string, ids: readonly string[]): Choice[] =>
    characters.map((c) => ({
      value: c.id,
      label: field !== 'povIds' && recorded.has(c.id) && !ids.includes(c.id) ? `${c.name} (moves from the other list)` : c.name,
    }));
  const list = (label: string, ids: string[], field: 'appearIds' | 'mentionIds' | 'povIds') => ({
    field,
    label,
    chosen: ids,
    options: options(field, ids),
    addTip: `Add to ${label}`,
  });
  return {
    title: 'Who appears here',
    caption:
      `Your record of who is on the page in ${here}, who is only mentioned, and whose point of view it is told ` +
      'from. The Character appearances view shows these; a character with no record is “not recorded”, not absent.',
    lists: [list('Appears', appear, 'appearIds'), list('Mentioned, not on the page', mention, 'mentionIds'), list('Point of view', pov, 'povIds')],
    linked:
      linked.length === 0
        ? null
        : {
            title: 'Linked in the text, with no record yet',
            people: linked.map((id) => ({
              id,
              name: byId.get(id)!.name,
              appears: `Record ${byId.get(id)!.name} as appearing in ${here}`,
              mentioned: `Record ${byId.get(id)!.name} as mentioned in ${here}`,
            })),
          },
  };
}

// ---------------------------------------------------------------------------------------------------- the labels

export type LabelPickerView = {
  label: string;
  labels: { label: string; removeTip: string }[];
  none: string | null;
  addTip: string;
  /** The suggestions and the labels used elsewhere, not already chosen (ignoring case); then "Your own…". */
  offered: string[];
  own: string;
  ownPrompt: { title: string; label: string; confirm: string };
};

/** The author's labels for a chapter, scene or event: the suggestions and the labels already used in the novel are
 * offered, and their own words are welcome. A label is the same whatever its capitals. `of`: what is labelled, for a
 * screen reader ("this scene"). */
export function labelPicker(labels: readonly string[], used: readonly string[] = [], of = ''): LabelPickerView {
  const offered: string[] = [];
  for (const l of [...suggestedLabels, ...used]) {
    const taken = [...labels, ...offered].some((x) => dartToLowerCase(x) === dartToLowerCase(l));
    if (!taken) offered.push(l);
  }
  return {
    label: 'Labels',
    labels: labels.map((l) => ({ label: l, removeTip: `Remove the label ${l}` })),
    none: labels.length === 0 ? 'None' : null,
    addTip: of.length === 0 ? 'Add a label' : `Add a label to ${of}`,
    offered,
    own: 'Your own…',
    ownPrompt: { title: 'Add a label', label: 'Label', confirm: 'Add' },
  };
}

/** The labels after one is added (an own label trimmed; empty adds nothing). */
export function withLabel(labels: readonly string[], label: string): string[] | null {
  const l = dartTrim(label);
  return l.length === 0 ? null : [...labels, l];
}

export const withoutLabel = (labels: readonly string[], label: string): string[] => labels.filter((x) => x !== label);

// ---------------------------------------------------------------------------------------------------- the changes

/** The autosave key of a typed change on the plan page (`plot:<novel>:<this>`). */
export const planSaveKey = (nodeId: string, key: string): string => `plan:${nodeId}:${key}`;
export const nodeSaveKey = (nodeId: string, key: string): string => `node:${nodeId}:${key}`;

const stored = (plan: JsonMap) => maps(plan['beats']);

function swap(beats: JsonMap[], id: unknown, by: number): JsonMap[] {
  const out = [...beats];
  const at = out.findIndex((b) => b['id'] === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= out.length) return out;
  const b = out[at];
  out[at] = out[to];
  out[to] = b;
  return out;
}

/** The changes the plan page makes, each a function to run inside PlotService.change. */
export const planChanges = {
  /** A planning field typed (`objective`, `conflict`…), or labels, entities, who appears: as updatePlan takes them. */
  plan: (nodeId: string, fields: JsonMap) => (c: PlotChanges) => c.updatePlan(nodeId, () => fields),
  /** The node's own summary, notes, status, or a serial note. */
  node: (nodeId: string, fields: Parameters<PlotChanges['updateNode']>[1]) => (c: PlotChanges) => c.updateNode(nodeId, fields),
  /** A beat added: null for nothing typed. `newId` makes its id (the plan keeps it). */
  addBeat: (nodeId: string, text: string, newId: () => string) => {
    const t = dartTrim(text);
    return t.length === 0 ? null : (c: PlotChanges) => c.updatePlan(nodeId, (s) => ({ beats: [...stored(s), { id: newId(), text: t }] }));
  },
  /** A beat retyped: a beat emptied by typing is kept until it is removed on purpose (null: nothing saved). */
  beatText: (nodeId: string, beatId: string, text: string) =>
    dartTrim(text).length === 0
      ? null
      : (c: PlotChanges) => c.updatePlan(nodeId, (s) => ({ beats: stored(s).map((b) => (b['id'] === beatId ? { ...b, text } : b)) })),
  moveBeat: (nodeId: string, beatId: string, by: -1 | 1) => (c: PlotChanges) => c.updatePlan(nodeId, (s) => ({ beats: swap(stored(s), beatId, by) })),
  removeBeat: (nodeId: string, beatId: string) => (c: PlotChanges) =>
    c.updatePlan(nodeId, (s) => ({ beats: stored(s).filter((b) => b['id'] !== beatId) })),
  /** A character linked in the text recorded as appearing (or mentioned) in one press. */
  record: (nodeId: string, field: 'appearIds' | 'mentionIds', current: readonly string[], id: string) => (c: PlotChanges) =>
    c.updatePlan(nodeId, () => ({ [field]: [...current, id] })),
};
