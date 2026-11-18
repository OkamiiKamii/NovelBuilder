// The pure parts of the four story views of Visualize: the plot board's lanes (plot_lanes_page.dart), structure and
// pacing (structure_page.dart), character appearances (appearances_page.dart) and ability paths
// (features/abilities/ability_paths_page.dart). What each says in words, the numbers each is drawn with, and what a
// press changes; the screens are src/ui/visualize/*View.tsx.

import {
  type AbilityNode,
  type AbilityTree,
  type PathEdge,
  type PathRole,
  type Standing,
  type TreeLayout,
  lockedBecause,
  pathRoleLabel,
  pathRoles,
  pathsOf,
  standingLabel,
} from '../../abilities/paths';
import type { CellEvidence } from '../../characters/appearances';
import { formatNumber, plural } from '../../desk/format';
import type { JsonMap } from '../../json';
import { strings } from '../../records/jsonRecord';
import type { StoryModel } from '../../model/storyModel';
import { type Lane, type Lanes, beatRoleLabels, chaptersWords, roleKey } from '../../plot/lanes';
import type { PlotChanges } from '../../plot/plotChanges';
import { ConnectionType, connectionTypes } from '../../records/link';
import type { ThreadBeat } from '../../records/thread';
import { dartToLowerCase, dartTrim } from '../../text/dartString';
import type { Grain, LengthBar, LengthFacts, PlacedMarker } from './pacing';

// ------------------------------------------------------------------------------------------------------ plot lanes

/** The lanes' sizes: the head row, a lane, a chapter column (48 square: the whole cell is the tap target). */
export const lanesHead = 34;
export const laneRow = 48;
export const laneColumn = 48;
/** The thread names' column: narrower on a phone. */
export const laneNameWidth = (compact: boolean) => (compact ? 120 : 180);

const eventName = (model: StoryModel, id: string) => model.events.get(id)?.name ?? 'an event';
const whereIn = (model: StoryModel, nodeId: string, chapterId: string) =>
  nodeId === chapterId ? '' : ` in “${model.nodes.get(nodeId)?.title ?? 'a scene'}”`;

/** A beat in words: "development “The seal breaks”". */
export function beatWords(b: ThreadBeat): string {
  return `${dartToLowerCase(beatRoleLabels[roleKey(b)])}${dartTrim(b.title).length === 0 ? '' : ` “${dartTrim(b.title)}”`}`;
}

/** What a cell of the lanes holds, in words (for the chosen cell and for screen readers). */
export function laneCellWords(model: StoryModel, lanes: Lanes, lane: Lane, col: number): string {
  const c = lane.cells[col];
  const parts = c.places.flatMap((p) => [
    ...p.beats.map((b) => `${beatWords(b)}${whereIn(model, p.nodeId, p.chapterId)}`),
    ...p.eventIds.map((id) => `event “${eventName(model, id)}”${whereIn(model, p.nodeId, p.chapterId)}`),
  ]);
  const gap = lane.gaps.find((g) => col >= g.from && col <= g.to);
  const crossedBy = lanes.lanes.filter((o) => o.crossings.some((x) => x.column === col && x.otherId === lane.thread.id)).map((o) => o.thread.title);
  const what =
    parts.length > 0
      ? parts.join('; ')
      : gap !== undefined
        ? `nothing recorded (${chaptersWords(lanes, gap.from, gap.to)}: ${gap.chapters} ${gap.chapters === 1 ? 'chapter' : 'chapters'} with nothing recorded)`
        : 'nothing recorded';
  return `${lane.thread.title}, Ch ${lanes.chapters[col].number}: ${what}${crossedBy.length === 0 ? '' : `; crossed by ${crossedBy.join(', ')}`}`;
}

/** The lines between a lane's marks: solid between neighbouring chapters, dashed across chapters with nothing recorded
 * (with how many). Columns, in reading order. */
export function laneLines(lane: Lane): { from: number; to: number; gap: boolean; between: number }[] {
  const marked = lane.cells.flatMap((c, i) => (c.places.length > 0 ? [i] : []));
  const out: { from: number; to: number; gap: boolean; between: number }[] = [];
  for (let i = 1; i < marked.length; i++) {
    const from = marked[i - 1];
    const to = marked[i];
    out.push({ from, to, gap: to - from > 1, between: to - from - 1 });
  }
  return out;
}

export const lanesWords = {
  title: 'Plot board',
  noThreads: { title: 'No plot threads yet', message: 'Start one on the Plot threads page, and record where it is introduced, develops and is resolved.' },
  noChapters: { title: 'No chapters yet', message: 'There is nothing to lay the threads along. Add chapters in Write.' },
  choose: 'Choose a cell to see what is recorded there, or a thread’s name to select it.',
  legend: 'What the lanes show',
  event: 'An event of the thread, told in that chapter',
  neighbours: 'Recorded in neighbouring chapters',
  between: 'Chapters in between with nothing recorded (how many)',
  crossing: 'An intersection with another thread',
  nothingPlaced: 'Nothing placed in a chapter yet.',
  board: 'Its chapters and scenes on the scene board',
  edit: 'Edit the thread',
  lanes: 'Lanes',
  list: 'List',
} as const;

/** The words of a lane's whole sequence: its ends, and what is not placed. */
export function laneSequence(model: StoryModel, lane: Lane): { unplaced: string | null; untold: string | null } {
  return {
    unplaced: lane.unplaced.length === 0 ? null : `Not placed in a chapter: ${lane.unplaced.map(beatWords).join('; ')}.`,
    untold: lane.untold.length === 0 ? null : `Its events told in no chapter: ${lane.untold.map((id) => eventName(model, id)).join(', ')}.`,
  };
}

/** What the drawing says for a screen reader. */
export function lanesLabel(lanes: Lanes): string {
  const n = lanes.lanes.length;
  const cols = lanes.chapters.length;
  return `Plot-thread lanes: ${n} ${n === 1 ? 'thread' : 'threads'} across ${cols} ${cols === 1 ? 'chapter' : 'chapters'}. Arrow keys move between cells, Enter shows what a cell holds.`;
}

// ------------------------------------------------------------------------------------------ structure and pacing

export const structureChart = { axis: 58, bar: 48, top: 46, plot: 190, bottom: 26 } as const;

/** A round number at or above `n`, for the top of the scale. */
export function niceMax(n: number): number {
  if (n <= 0) return 100;
  const step = Math.pow(10, Math.floor(Math.log(n) / Math.LN10));
  return Math.ceil(n / step) * step;
}

/** The short name of a bar under the chart: the chapter's number, and the scene's after a point when a chapter has
 * several bars. */
export function shortName(bars: readonly LengthBar[], i: number): string {
  const mine = bars.filter((b) => b.chapterId === bars[i].chapterId).length;
  if (mine <= 1) return `${bars[i].chapterNumber}`;
  const n = bars.slice(0, i + 1).filter((b) => b.chapterId === bars[i].chapterId).length;
  return `${bars[i].chapterNumber}.${n}`;
}

/** The line of plain facts over the charts. */
export function factLine(bars: readonly LengthBar[], facts: LengthFacts, grain: Grain, label: string | null, picked: number): string {
  if (bars.length === 0) return 'Nothing in this part of the book yet.';
  const perWord = grain === 'chapters' ? 'chapter' : 'bar';
  return [
    `${plural(facts.count, perWord)} · ${plural(facts.total, 'word')}`,
    ...(facts.average > 0
      ? [
          ` · average ${formatNumber(facts.average)} and median ${formatNumber(facts.median)} words, over the ${plural(facts.count - facts.empty, perWord)} with words`,
        ]
      : []),
    ...(facts.longest !== null && facts.shortest !== null && facts.longest !== facts.shortest
      ? [
          ` · longest ${facts.longest.label} (${formatNumber(facts.longest.words)}), shortest ${facts.shortest.label} (${formatNumber(facts.shortest.words)})`,
        ]
      : []),
    ...(facts.empty > 0
      ? [
          ` · ${plural(facts.empty, grain === 'chapters' ? 'chapter has' : 'bar has', grain === 'chapters' ? 'chapters have' : 'bars have')} no words yet`,
        ]
      : []),
    ` · ${facts.labelled} of ${facts.count} labelled`,
    ...(label !== null ? [` · ${picked} with “${label}”`] : []),
  ].join('');
}

/** A bar in words. */
export function barWords(model: StoryModel, bar: LengthBar, markers: readonly string[] | undefined): string {
  const partTitle = bar.partId === null ? null : (model.nodes.get(bar.partId)?.title ?? null);
  return [
    `${bar.label}: ${bar.words > 0 ? plural(bar.words, 'word') : 'no words yet'}`,
    ...(bar.labels.length > 0 ? [`labels: ${bar.labels.join(', ')}`] : []),
    ...(bar.partId !== null ? [`in ${partTitle}`] : []),
    ...(markers !== undefined && markers.length > 0 ? [`markers: ${markers.join(', ')}`] : []),
  ].join('; ');
}

/** A placed marker in words, under its kind: where it is, and its event and note. */
export function markerWords(model: StoryModel, p: PlacedMarker, where: (nodeId: string) => string): { title: string; subtitle: string; remove: string } {
  const m = p.marker;
  const event = m.eventId === null ? undefined : model.events.get(m.eventId);
  return {
    title: `${m.kind}${m.title.length === 0 ? '' : ` — ${m.title}`}`,
    subtitle: [
      p.missing && p.nodeId === null ? 'Its chapter was removed' : p.nodeId === null ? 'Not placed' : where(p.nodeId),
      ...(p.via === 'event' ? [`(where “${event?.name}” is told)`] : []),
      ...(m.eventId !== null && p.via !== 'event' && event !== undefined ? [`· at “${event.name}”`] : []),
      ...(m.note.length > 0 ? [`· ${m.note}`] : []),
    ].join(' '),
    remove: `Remove the marker ${m.kind}${m.title.length === 0 ? '' : `: ${m.title}`}`,
  };
}

export const structureWords = {
  title: 'Structure and pacing',
  what: 'What these charts are. ',
  whatText:
    'Word counts the editor keeps, and the parts, labels and markers you record, laid out in reading order. They describe the manuscript as it stands. They do not measure quality, how a chapter reads, or whether a structure is right, and no storytelling formula is assumed: the markers are only the ones you add.',
  noChapters: { title: 'No chapters yet', message: 'Add chapters in Write; their lengths, and the labels and markers you give them, appear here.' },
  notWritten: 'No words are written yet: the bars fill in as you write.',
  noLabels: {
    title: 'No labels yet',
    message: 'No chapter or scene has a label yet. Give some a label in their plan (Action, Dialogue, Quiet moment, or your own), and this fills in.',
  },
  markers: 'Structural markers',
  noMarkers: 'No markers yet.',
  add: 'Add a structural marker',
  kind: 'Kind of marker',
  kindHint: 'Turning point, Climax, your own…',
  ownWords: 'Its own words',
  ownWordsHint: 'Optional: the bridge falls',
  node: 'Chapter or scene',
  event: 'Event',
  notSaid: 'Not said',
  note: 'Note',
  noteHint: 'Optional',
  addButton: 'Add marker',
  pickLabel: 'Pick out a label',
  noPick: 'No label picked out',
  part: 'Part of the book',
  wholeBook: 'The whole book',
  legend: 'What the chart shows',
  nothingWritten: 'Nothing written yet',
  average: 'The average length',
  marker: 'A structural marker you placed',
  band: 'A part of the book (volume, act or arc), shaded behind its chapters',
  charts: 'Charts',
  list: 'List',
} as const;

export const lengthHeading = (grain: Grain) => `Length, ${grain === 'chapters' ? 'chapter by chapter' : 'scene by scene'}`;
export const labelHeading = (grain: Grain) => `Words by label, ${grain === 'chapters' ? 'chapter by chapter' : 'scene by scene'}`;

// ------------------------------------------------------------------------------------------ character appearances

/** Recording a character as appearing or mentioned in a chapter or scene (`as` null: removing the record). */
export function recordAppearance(nodeId: string, who: string, as: 'appears' | 'mentioned' | null): (c: PlotChanges) => void {
  return (c) =>
    c.updatePlan(nodeId, (stored: JsonMap) => {
      const appear = strings(stored['appearIds']).filter((id) => id !== who);
      const mention = strings(stored['mentionIds']).filter((id) => id !== who);
      return as === 'appears' ? { appearIds: [...appear, who] } : as === 'mentioned' ? { mentionIds: [...mention, who] } : { appearIds: appear, mentionIds: mention };
    });
}

/** The author's own record for a character in a chapter or scene, if any. */
export function ownAppearance(model: StoryModel, nodeId: string, who: string): 'appears' | 'mentioned' | null {
  const plan = model.plans.get(nodeId);
  return (plan?.appearIds ?? []).includes(who) ? 'appears' : (plan?.mentionIds ?? []).includes(who) ? 'mentioned' : null;
}

export const appearanceGlyph = { appears: '●', mentioned: '◐', other: '○', none: '' } as const;
export const appearanceCell = 48;
export const appearanceName = 150;
/** About how many cells the matrix draws at first; more rows are drawn when asked. */
export const appearanceBudget = 6000;

export const appearancesWords = {
  title: 'Character appearances',
  noCharacters: { title: 'No characters yet', message: 'Make one on the Characters page; then record, in each chapter’s plan, who appears there.' },
  noChapters: { title: 'No chapters yet', message: 'Add chapters in Write; then record, in each one’s plan, who appears there.' },
  fromRecords: 'From what is recorded. ',
  fromRecordsText:
    'Each cell shows your appearance record (appears, or only mentioned) if you made one, and otherwise any other record tying the character to that chapter: a link in the text, the plan’s “Entities involved”, or an event they take part in that the chapter tells. Nothing is read from the text itself. A blank cell means nothing is recorded, not that the character is absent.',
  showAll: 'Show characters with nothing recorded here',
  nothingHere: { title: 'Nothing recorded here', message: 'Nothing is recorded for anyone in these chapters. That is not the same as nobody being in them.' },
  nothingTies: 'Nothing ties them to it in your records. They may still be in the text.',
  recordAppears: 'Record: appears here',
  recordMentioned: 'Record: mentioned here',
  removeRecord: 'Remove my record',
  sceneNote: 'A record made here is on the chapter itself; its scenes keep their own.',
  showEvent: 'Show the event',
  plan: 'Its plan',
  legendTitle: 'What a cell shows',
  /** The legend's last three lines; the first two are the cell states' own labels (cellStateLabel). */
  legendOther: 'Other records (a link in the text, the plan, an event)',
  legendBlank: 'Blank: nothing recorded (not the same as absent)',
  notOnPage: ', not on the page',
  nothingMatches: { title: 'Nothing matches', message: 'No chapters match these filters.', action: 'Clear filters' },
  showEvery: 'Show every character',
  thread: 'Plot thread',
  place: 'Place',
  status: 'Status',
  any: 'Any',
  matrix: 'Matrix',
  list: 'List',
  from: 'From chapter',
  to: 'To chapter',
  first: 'The first',
  last: 'The last',
} as const;

// ---------------------------------------------------------------------------------------------------- ability paths

/** Each kind of path by colour and by line, never by colour alone (null colour: the theme's text colour). */
export const pathStyle: Readonly<Record<PathRole, { color: string | null; dash: number[]; width: number; arrow: boolean }>> = {
  prerequisite: { color: null, dash: [], width: 2, arrow: true },
  alternative: { color: '#2b7a8c', dash: [6, 4], width: 2, arrow: true },
  rule: { color: '#8a8276', dash: [1, 4], width: 2.2, arrow: true },
  upgrade: { color: '#4f7a2b', dash: [], width: 3, arrow: true },
  evolution: { color: '#7a4fa3', dash: [], width: 3, arrow: true },
  fusion: { color: '#a3622b', dash: [10, 4], width: 3, arrow: true },
  replacement: { color: '#4f5fa3', dash: [6, 2, 1.5, 2], width: 2.5, arrow: true },
  branch: { color: '#8a8276', dash: [], width: 1.3, arrow: true },
  exclusive: { color: '#a8436b', dash: [3, 3], width: 2, arrow: false },
  other: { color: '#6b7a2b', dash: [4, 2, 1, 2], width: 1.8, arrow: true },
};

/** A node: a circle of 48, its name beneath, in a box 160 wide and 96 high. */
export const abilityBox = { width: 160, height: 96, circle: 48, pad: 24 } as const;

/** A path in words, from one end: "Prerequisite for Iron Fortress", "Evolves from Squire". */
export function pathWords(edge: PathEdge, fromSide: boolean, name: (key: string) => string): string {
  if (fromSide) return `${edge.label} ${name(edge.to)}`;
  if (edge.role === 'branch') return `Branches from ${name(edge.from)}`;
  if (edge.role === 'rule') return `Its requirement rule names ${name(edge.from)}`;
  const inverse = connectionTypes.find((t) => t.label === edge.label)?.inverse ?? null;
  // A kind of the author's own reads one way only: said from the other end as it stands.
  if (inverse === null) {
    const l = edge.label;
    return `${name(edge.from)} ${l.length === 0 ? l : `${dartToLowerCase(l[0])}${l.substring(1)}`} this`;
  }
  return `${inverse === ConnectionType.same ? edge.label : inverse} ${name(edge.from)}`;
}

export type AbilityChoices = {
  hiddenSources: ReadonlySet<string>;
  hiddenRoles: ReadonlySet<string>;
  focus: string | null;
  all: boolean;
  text: string;
};

/** What the tree shows for the choices: the nodes and paths drawn, the sources and kinds of path to toggle, what is
 * left out (said in words), how many have no paths, and what is flagged. */
export function abilityView(tree: AbilityTree, problems: readonly { severity: string; nodes: readonly string[] }[], choices: AbilityChoices) {
  const byKey = new Map(tree.nodes.map((n) => [n.key, n]));
  const name = (key: string) => byKey.get(key)?.name ?? 'something deleted';
  const focus = choices.focus !== null && byKey.has(choices.focus) ? choices.focus : null;
  const text = dartToLowerCase(dartTrim(choices.text));
  const sources = new Map<string, string>();
  for (const n of tree.nodes) sources.set(n.sourceKey, n.source);
  let nodes = tree.nodes.filter((n) => !choices.hiddenSources.has(n.sourceKey));
  if (focus !== null) {
    const near = pathsOf(tree, focus);
    nodes = nodes.filter((n) => near.has(n.key));
  }
  const shown = new Set(nodes.map((n) => n.key));
  let edges = tree.edges.filter((e) => !choices.hiddenRoles.has(e.role) && shown.has(e.from) && shown.has(e.to));
  if (text.length > 0) {
    const hits = new Set(nodes.filter((n) => dartToLowerCase(n.name).includes(text)).map((n) => n.key));
    for (const e of [...edges]) {
      if (hits.has(e.from) || hits.has(e.to)) {
        hits.add(e.from);
        hits.add(e.to);
      }
    }
    nodes = nodes.filter((n) => hits.has(n.key));
    edges = edges.filter((e) => hits.has(e.from) && hits.has(e.to));
  }
  const pathed = new Set(edges.flatMap((e) => [e.from, e.to]));
  const lone = nodes.filter((n) => !pathed.has(n.key)).length;
  if (!choices.all && edges.length > 0 && focus === null) nodes = nodes.filter((n) => pathed.has(n.key));
  const flagged = new Map<string, string>();
  for (const p of problems) {
    for (const k of p.nodes) if (flagged.get(k) !== 'problem') flagged.set(k, p.severity);
  }
  const roles = pathRoles.filter((r) => tree.edges.some((e) => e.role === r));
  const left = [
    ...(choices.hiddenSources.size > 0 ? [`Sources hidden: ${[...sources].filter(([k]) => choices.hiddenSources.has(k)).map(([, v]) => v).join(', ')}.`] : []),
    ...(choices.hiddenRoles.size > 0 ? [`Paths hidden: ${pathRoles.filter((r) => choices.hiddenRoles.has(r)).map((r) => pathRoleLabelOf(r)).join(', ')}.`] : []),
    ...(focus !== null ? [`Only the paths of ${name(focus)}.`] : []),
  ];
  return { nodes, edges, focus, name, sources, lone, flagged, roles, left, byKey };
}

const pathRoleLabelOf = (r: PathRole) => pathRoleLabel[r];

/** The line saying where the selected ability stands for the character the tree is seen through. */
export function standingLine(tree: AbilityTree, key: string, standing: Standing, who: string, whenWords: string, held: ReadonlySet<string>, name: (key: string) => string): string {
  switch (standing) {
    case 'held':
      return `${who} holds it ${whenWords}.`;
    case 'available':
      return `${who} can gain it ${whenWords}: every prerequisite recorded for it is held.`;
    default:
      return dartTrim(`Locked for ${who} ${whenWords}. ${lockedBecause(tree, key, held, name)}`);
  }
}

/** An ability in the list: its title line and its paths in words. */
export function abilityListItem(
  n: AbilityNode,
  edges: readonly PathEdge[],
  name: (key: string) => string,
  standing: Standing | undefined,
  held: boolean,
  flag: string | undefined,
): { title: string; lines: string[] } {
  const into = edges.filter((e) => e.to === n.key && e.role !== 'exclusive');
  const out = edges.filter((e) => e.from === n.key && e.role !== 'exclusive');
  const excl = edges.filter((e) => e.role === 'exclusive' && (e.from === n.key || e.to === n.key)).map((e) => name(e.from === n.key ? e.to : e.from));
  return {
    title: [
      n.name,
      ...(n.rank !== null ? [n.rank] : []),
      ...(standing !== undefined ? [dartToLowerCase(standingLabel[standing])] : held ? ['held'] : []),
      ...(flag === 'problem' ? ['see what does not add up'] : []),
    ].join(' · '),
    lines: [
      ...into.map((e) => pathWords(e, false, name)),
      ...out.map((e) => pathWords(e, true, name)),
      ...(excl.length > 0 ? [`Mutually exclusive with ${excl.join(', ')}`] : []),
      ...(n.holders.length > 0 ? [`Held by ${n.holders.map((h) => `${h.name} (${h.how})`).join(', ')}`] : []),
    ],
  };
}

/** What a character's gaining or losing an ability says, under the details. */
export function acquiredWords(a: { name: string; action: string; when: string }): string {
  const did = a.action === 'gain' ? 'gained' : a.action === 'lose' ? 'lost' : a.action === 'happen' ? 'named in a moment' : 'held';
  return `${a.name}: ${did} ${a.action === 'snapshot' ? a.when : `(${a.when})`}`;
}

export type Point = { x: number; y: number };

/** Rounded to thousandths, half away from zero, as Dart rounds. */
const r3 = (n: number) => (n < 0 ? -(Math.round(-n * 1000) / 1000) : Math.round(n * 1000) / 1000);

/** A path as drawn: an SVG path (`d`), and its arrowhead's three points when it has one. The circle's centre is at
 * the top of each node's box; `at` gives each node's centre. Exclusions are straight; a path running back against the
 * layers (or within one) bows out to the right; the rest drop from the circle's foot to the next one's head. */
export function edgeShape(edge: PathEdge, layout: TreeLayout, at: (key: string) => Point, boxHeight: number): { d: string; arrow: Point[] | null } {
  const circle = abilityBox.circle;
  const centre = (key: string): Point => {
    const p = at(key);
    return { x: p.x, y: p.y - boxHeight / 2 + circle / 2 };
  };
  const a = centre(edge.from);
  const b = centre(edge.to);
  const la = layout.at.get(edge.from)!.layer;
  const lb = layout.at.get(edge.to)!.layer;
  let d: string;
  let end: Point;
  let towards: Point;
  if (edge.role === 'exclusive') {
    d = `M${r3(a.x)} ${r3(a.y)} L${r3(b.x)} ${r3(b.y)}`;
    end = b;
    towards = a;
  } else if (layout.back.has(edge.id) || lb <= la) {
    const bow = 70 + Math.abs(b.y - a.y) * 0.15;
    const p0 = { x: a.x + circle / 2, y: a.y };
    const p3 = { x: b.x + circle / 2, y: b.y };
    d = `M${r3(p0.x)} ${r3(p0.y)} C${r3(p0.x + bow)} ${r3(p0.y)} ${r3(p3.x + bow)} ${r3(p3.y)} ${r3(p3.x)} ${r3(p3.y)}`;
    end = p3;
    towards = { x: p3.x + bow, y: p3.y };
  } else {
    const y1 = a.y + circle / 2;
    const y2 = b.y - circle / 2;
    const dy = Math.max(30, (y2 - y1) / 2);
    d = `M${r3(a.x)} ${r3(y1)} C${r3(a.x)} ${r3(y1 + dy)} ${r3(b.x)} ${r3(y2 - dy)} ${r3(b.x)} ${r3(y2)}`;
    end = { x: b.x, y: y2 };
    towards = { x: b.x, y: y2 - dy };
  }
  if (!pathStyle[edge.role].arrow) return { d, arrow: null };
  const dx = end.x - towards.x;
  const dy = end.y - towards.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= 0) return { d, arrow: null };
  const u = { x: dx / len, y: dy / len };
  const n = { x: -u.y, y: u.x };
  return {
    d,
    arrow: [
      { x: r3(end.x), y: r3(end.y) },
      { x: r3(end.x - u.x * 10 + n.x * 5), y: r3(end.y - u.y * 10 + n.y * 5) },
      { x: r3(end.x - u.x * 10 - n.x * 5), y: r3(end.y - u.y * 10 - n.y * 5) },
    ],
  };
}

export const abilityWords = {
  title: 'Ability paths',
  empty: {
    title: 'No abilities yet',
    message:
      'They come from your system blueprints (Organize → Systems) and from any kind of record you set to show here (World → Categories & fields → In the ability tree).',
    action: 'Open Systems',
  },
  showAll: 'Show every path again',
  alsoDraw: (n: number) => `Also draw the ${n} with no paths`,
  asOf: (name: string) => `For ${name}, as of`,
  endOfStory: 'The end of the story',
  nothingShown: { title: 'Nothing shown', message: 'Nothing is shown with these sources, kinds of path and filters.', action: 'Restore the full view' },
  problems: 'What does not add up',
  nothing: 'Nothing.',
  problem: 'Problem',
  note: 'Note',
  showPaths: (name: string) => `Show ${name}’s paths`,
  notDrawn: (items: readonly { connection: { label: string }; reason: string }[]) =>
    `Not drawn: ${items.map((x) => `a “${x.connection.label}” connection (${x.reason})`).join('; ')}.`,
  nobody: 'Nobody is recorded as holding it.',
  heldBy: (n: AbilityNode) => `Held by ${n.holders.map((h) => `${h.name} (${h.how})`).join(', ')}.`,
  every: 'Every path',
  noPaths: 'No paths yet.',
  fromBlueprint: ' (from a blueprint)',
  remove: 'Remove',
  addPath: 'Add a path',
  whichWay: 'Which way',
  fromTo: (name: string) => `From ${name} to…`,
  toFrom: (name: string) => `To ${name} from…`,
  kind: 'Kind of path',
  own: 'Your own…',
  ownLabel: 'Your own kind of path',
  ownHint: 'Unlocks, Teaches, Corrupts into…',
  other: 'The other ability',
  add: 'Add the path',
  added: 'Path added.',
  removed: 'Path removed.',
  nameOwn: 'Name your own kind of path.',
  tree: 'Tree',
  list: 'List',
  hint: 'Drag to move; pinch or use the buttons to zoom.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  label: (nodes: number, paths: number) =>
    `Ability paths: ${nodes} ${nodes === 1 ? 'ability' : 'abilities'} and ${paths} ${paths === 1 ? 'path' : 'paths'}, from what comes first at the top. The List view gives every path in words.`,
} as const;

/** The kinds of path the "Add a path" form offers, in the order the connection types list them, then your own. */
export function pathKindChoices(pathTypeKeys: ReadonlySet<string>): { value: string; label: string }[] {
  return [...connectionTypes.filter((t) => pathTypeKeys.has(t.key)).map((t) => ({ value: t.key, label: t.label })), { value: 'own', label: abilityWords.own }];
}

/** The matrix's line of counts: characters × chapters (or columns), cells with a record, those left out. */
export function matrixSummary(rows: readonly { recorded: number }[], columns: number, hidden: number, grain: 'chapters' | 'scenes', filtered: boolean): string {
  const perColumn = grain === 'chapters' ? 'chapter' : 'column';
  return (
    `${plural(rows.length, 'character')} × ${plural(columns, perColumn)} · ` +
    `${plural(rows.reduce((n, r) => n + r.recorded, 0), 'cell')} with a record` +
    `${hidden > 0 ? ` · ${plural(hidden, 'character')} with nothing recorded here not shown` : ''}` +
    `${filtered ? ' · filtered' : ''}`
  );
}

/** A cell in words: "Wren, Ch 1: The Bell: appears (…)". */
export function matrixCellWords(
  model: StoryModel,
  row: { name: string; cells: readonly { state: 'appears' | 'mentioned' | 'other' | 'none'; evidence: readonly CellEvidence[] }[] },
  column: { label: string; nodeId: string },
  col: number,
  evidenceWords: (evidence: readonly CellEvidence[], model: StoryModel, nodeId: string) => string[],
  stateLabel: Readonly<Record<string, string>>,
): string {
  const cell = row.cells[col];
  return `${row.name}, ${column.label}: ${dartToLowerCase(stateLabel[cell.state])}${cell.evidence.length === 0 ? '' : ` (${evidenceWords(cell.evidence, model, column.nodeId).join('; ')})`}`;
}

/** The labels of the columns where a row's cells are in `state` (the list form). */
export function rowLabels(row: { cells: readonly { state: string }[] }, columns: readonly { label: string }[], state: string): string[] {
  return columns.filter((_, c) => row.cells[c].state === state).map((c) => c.label);
}
