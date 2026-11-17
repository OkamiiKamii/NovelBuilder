// Scriptor's outputs for what dump.dart dumps of the Flutter app: the thread list, the loom, every thread's page, the
// scene board and its cards, moves and history, every plan, and a script of changes, keyed and shaped the same way,
// made by the ported code (src/domain/plot/*, src/domain/plot/screens/*).

import { ChangeRefused } from '../../../src/domain/codex/codexChanges';
import { type JsonMap, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { nodeStatuses } from '../../../src/domain/records/nodeStatus';
import type { NodeStatus } from '../../../src/domain/records/storyNode';
import { PlotThread } from '../../../src/domain/records/thread';
import type { NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';
import { type BoardChange, type BoardPart, BoardHistory, nudgePlace, placeOf } from '../../../src/domain/plot/board';
import { diagnose } from '../../../src/domain/plot/diagnostics';
import { cleanLabels, labelOrder } from '../../../src/domain/plot/labels';
import { PlotChanges, categoryName } from '../../../src/domain/plot/plotChanges';
import { boardView, bulkDialog, cardControls, chapterCard, partEnd, partHead, sceneCard, threadChips } from '../../../src/domain/plot/screens/boardPage';
import { type LoomShape, type StrandCard, legendDrawing, loomLegend, strandCard, strandDrawing } from '../../../src/domain/plot/screens/loom';
import { labelPicker, planPage } from '../../../src/domain/plot/screens/planPage';
import { deleteThreadDialog, threadPage } from '../../../src/domain/plot/screens/threadPage';
import { type ThreadFilters, type ThreadGrouping, askTheQuestions, storyQuestions, threadStatusName, threadsView } from '../../../src/domain/plot/screens/threads';

// ---------------------------------------------------------------------------------------------------- the loom

const shapes = (list: LoomShape[]): JsonMap[] => list as unknown as JsonMap[];

function cardOut(c: StrandCard, chapterCount: number, frontier: number, wide = true): JsonMap {
  const p = c.plan;
  return {
    threadId: c.threadId,
    title: c.title,
    kind: c.kind,
    premise: c.premise,
    tone: c.tone,
    plan: {
      knots: p.knots,
      target: p.target,
      open: p.open,
      tied: p.tied,
      faded: p.faded,
      dashed: p.dashed,
      quiet: p.quiet,
      gap: p.gap,
      first: p.first,
      last: p.last,
    },
    semanticsLabel: c.semanticsLabel,
    noChapters: c.noChapters,
    span: c.span,
    follows: c.follows,
    developments: c.developments,
    noDevelopments: c.noDevelopments,
    issues: c.issues,
    drawing360: shapes(strandDrawing(p, chapterCount, frontier, 360)),
    ...(wide ? { drawing900: shapes(strandDrawing(p, chapterCount, frontier, 900)) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------- the pages

function threadsOut(model: StoryModel, title: string, f: ThreadFilters, grouping: ThreadGrouping, quiet: number): JsonMap {
  const v = threadsView(model, title, f, grouping, quiet);
  return {
    subtitle: v.subtitle,
    flagged: v.flagged,
    empty: v.empty,
    noResults: v.noResults,
    showLegend: v.showLegend,
    groups: v.groups.map((g) => ({ key: g.key, label: g.label, items: g.items.map((r) => r.thread.id) })),
    statusChoices: v.statusChoices,
    categoryChoices: v.categoryChoices,
    footer: v.footer,
  };
}

function threadPageOut(model: StoryModel, threadId: string): JsonMap {
  const v = threadPage(model, threadId);
  if (v.missing) return { missing: true, title: v.title, message: v.message, action: v.action, actionPath: v.actionPath };
  const dialog = deleteThreadDialog(v.thread);
  return {
    missing: false,
    title: v.title,
    subtitle: v.subtitle,
    checks: v.checks,
    category: { value: v.category.value, choices: v.category.choices },
    status: { value: v.status.value, choices: v.status.choices },
    customStatus: v.customStatus?.value ?? null,
    customCategory: v.customCategory?.value ?? null,
    premise: v.premise.value,
    characters: { chosen: v.characters.chosen, options: v.characters.options },
    locations: { chosen: v.locations.chosen, options: v.locations.options },
    target: { value: v.target.value, choices: v.target.choices, note: v.target.note.value },
    caption: v.developments.caption,
    beats: v.developments.beats.map((b) => ({
      beatId: b.beatId,
      name: b.name,
      place: b.place,
      struck: b.struck,
      node: b.node,
      role: { label: b.role.label, value: b.role.value },
      crosses: b.crosses === null ? null : { chosen: b.crosses.chosen, options: b.crosses.options },
      title: b.title,
      note: { label: b.note.label, value: b.note.value },
      open: b.open,
      consequencesTip: b.consequencesTip,
      removeTip: b.removeTip,
    })),
    newBeatNode: v.newBeat.node.choices,
    roleChoices: v.newBeat.role.choices,
    board: v.links.board.path,
    notes: v.notes.value,
    muted: v.muted,
    deleteDialog: { title: dialog.title, message: dialog.message },
  };
}

const partsOut = (parts: readonly BoardPart[]) => ({
  parts: parts.map((p) => ({
    key: p.key,
    columns: p.columns.map((c) => ({ chapter: c.chapter.id, words: c.words, scenes: c.scenes.map((s) => s.node.id) })),
  })),
});

function boardOut(model: StoryModel, f: { text: string; status: NodeStatus | null; threadId: string | null }): JsonMap {
  const v = boardView(model, f);
  return {
    subtitle: v.subtitle,
    shown: partsOut(v.shown),
    filtered: v.filtered,
    filteredNote: v.filteredNote,
    showTitles: v.showTitles,
    thread: v.thread?.banner ?? null,
    threadChoices: v.threadChoices,
    empty: v.empty?.title ?? null,
    heads: v.shown.map((part) => {
      const head = partHead(part, v.filtered);
      const end = partEnd(part);
      return { kind: head.kind, label: head.label, empty: head.empty, end: { place: end.place, label: end.label } };
    }),
  };
}

function cards(model: StoryModel): JsonMap {
  const v = boardView(model, { text: '', status: null, threadId: null });
  const chips = (node: Parameters<typeof threadChips>[2]): JsonMap => {
    const c = threadChips(v, model, node);
    if (c === null) return { none: true };
    return {
      chips: c.chips.map((ch) => ({
        label: ch.label,
        tip: ch.tip,
        remove: ch.remove === null ? null : { tip: ch.remove.tip, ids: (v.threadsHere.get(node.id) ?? []).find((h) => h.thread.id === ch.threadId)!.plainIds },
      })),
      add: c.add === null ? null : { tip: c.add.tip, threads: c.add.threads.map((t) => t.value) },
    };
  };
  return {
    chapters: v.parts.flatMap((p) =>
      p.columns.map((column) => {
        const c = chapterCard(v, column);
        return {
          name: c.name,
          meta: c.meta,
          earlier: c.earlier,
          later: c.later,
          into: c.into,
          sceneEnd: c.sceneEnd.label,
          addScene: c.addScene,
          controls: cardControls(column.chapter),
          chips: chips(column.chapter),
          scenes: column.scenes.map((card) => {
            const s = sceneCard(v, card.node, card.words);
            return {
              name: s.name,
              meta: s.meta,
              earlier: s.earlier,
              later: s.later,
              toChapter: s.toChapter,
              controls: cardControls(card.node),
              chips: chips(card.node),
            };
          }),
        };
      }),
    ),
  };
}

function moves(model: StoryModel): JsonMap {
  const all = [...model.nodes.values()];
  const groups = all.filter((n) => n.kind === 'volume' || n.kind === 'act' || n.kind === 'arc');
  const out: JsonMap = {};
  for (const n of all) {
    if (n.kind !== 'chapter' && n.kind !== 'scene') continue;
    out[n.id] = {
      earlier: nudgePlace(all, n, -1),
      later: nudgePlace(all, n, 1),
      bulk: [null, ...groups].map((g) => {
        const d = bulkDialog(all, n, { parentId: g?.id ?? null, beforeId: null });
        return d === null ? null : { title: d.title, message: d.message };
      }),
    };
  }
  return out;
}

function history(model: StoryModel): JsonMap {
  const all = [...model.nodes.values()];
  const docs = all.filter((n) => n.kind === 'chapter' || n.kind === 'scene');
  if (docs.length === 0) return { none: true };
  let h = BoardHistory.empty;
  const said: string[] = [];
  for (let i = 0; i < 25; i++) {
    const n = docs[i % docs.length];
    const to = nodeStatuses[i % nodeStatuses.length].key as NodeStatus;
    h = h.remember({ kind: 'status', nodeId: n.id, title: n.title, from: n.status, to }, all);
    said.push(h.said);
  }
  const first = docs[0];
  const from = placeOf(all, first.id)!;
  h = h.remember({ kind: 'move', nodeId: first.id, title: first.title, from, to: from } as BoardChange, all);
  said.push(h.said);
  const undone: JsonMap[] = [];
  for (let guard = 0; guard < 100 && h.last !== null; guard++) {
    const label = h.undoLabel;
    const taken = h.takeLast(all)!;
    undone.push({ label, problem: taken.problem, words: taken.words });
    h = taken.history;
  }
  return { said, undone };
}

function planOut(model: StoryModel, s: NovelSnapshot, nodeId: string): JsonMap {
  const v = planPage(model, s, nodeId);
  if (v.missing) return { missing: true };
  const ap = v.appearances;
  return {
    title: v.title,
    subtitle: v.subtitle,
    consequences: v.actions.consequences,
    steps: v.status.steps.map((s0) => ({ status: s0.status, selected: s0.selected, done: s0.done })),
    objective: { field: v.objective.field, label: v.objective.label, hint: v.objective.hint, value: v.objective.value },
    summary: { hint: v.summary.hint, value: v.summary.value },
    labels: { labels: v.labels.labels, none: v.labels.none, addTip: v.labels.addTip, offered: v.labels.offered },
    beats: v.beats.items.map((b) => ({ id: b.id, text: b.text, label: b.label, up: b.up, down: b.down, remove: b.remove })),
    entities: 'none' in v.entities ? v.entities.none : { chosen: v.entities.chosen, options: v.entities.options },
    inText: (v.inText?.entries ?? []).map((e) => ({ id: e.id, name: e.name, character: e.character })),
    appearances:
      ap === null
        ? null
        : {
            caption: ap.caption,
            lists: ap.lists,
            linked: (ap.linked?.people ?? []).map((p) => ({ id: p.id, name: p.name, appears: p.appears, mentioned: p.mentioned })),
          },
    dynamics: v.dynamics.fields.map((f) => ({ field: f.field, label: f.label, hint: f.hint, value: f.value })),
    ending: { field: v.ending.field, label: v.ending.label, hint: v.ending.hint, value: v.ending.value },
    serial: v.serial === null ? null : v.serial.fields.map((f) => f.value),
    events: { caption: v.events.caption, items: v.events.items },
    threads: { caption: v.threads.caption, items: v.threads.items },
    notes: v.notes.value,
  };
}

// ---------------------------------------------------------------------------------------------------- changes

class Novel {
  clock = 1000;
  ids = 0;
  constructor(public snapshot: NovelSnapshot) {}

  act(change: (c: PlotChanges) => unknown): JsonMap {
    const c = new PlotChanges(this.snapshot, { now: ++this.clock, createId: () => `id${++this.ids}` });
    try {
      const result = change(c);
      this.snapshot = c.snapshot;
      return { ok: result === undefined ? null : result };
    } catch (e) {
      if (e instanceof ChangeRefused) return { refused: e.message };
      throw e;
    }
  }
}

function changes(s: NovelSnapshot): JsonMap {
  const n = new Novel(s);
  const model = StoryModel.fromSnapshot(s);
  const docs = [...model.nodes.values()].filter((x) => x.kind === 'chapter' || x.kind === 'scene').map((x) => x.id);
  const groupId = [...model.nodes.values()].find((x) => x.kind === 'volume' || x.kind === 'act' || x.kind === 'arc')?.id ?? null;
  const entries = [...model.entries.values()];
  const character = entries.find((e) => e.category === 'character')?.id ?? null;
  const location = entries.find((e) => e.category === 'location')?.id ?? null;
  const other = entries.find((e) => e.category !== 'character' && e.category !== 'location')?.id ?? null;
  const existing = [...model.threads.keys()][0] ?? null;
  const doc = docs[0] ?? null;
  const doc2 = docs.length > 1 ? docs[1] : null;
  const steps: unknown[] = [];
  const step = (r: unknown) => steps.push(r);

  step(n.act((x) => x.createThread()));
  step(n.act((x) => x.createThread('  The stolen key  ')));
  step(
    n.act((x) =>
      askTheQuestions(x, [
        [storyQuestions[0], 'Can Ren survive'],
        [storyQuestions[1], '  '],
        [storyQuestions[2], 'Will she forgive him?'],
        [storyQuestions[3], 'What is hidden…'],
      ]),
    ),
  );
  const key = 'id2';
  step(
    n.act((x) =>
      x.updateThread(key, () => ({
        title: '   ',
        premise: 'Who took it?',
        notes: 'n',
        targetNote: 'the end',
        customCategory: 'x'.repeat(70),
        muted: true,
        category: 'mystery',
        status: 'active',
        customStatus: 'y'.repeat(50),
        characterIds: [character, character, location, 'nope', 3],
        locationIds: [location, character],
        targetNodeId: groupId ?? doc,
      })),
    ),
  );
  step(n.act((x) => x.updateThread(key, () => ({ category: 'nonsense', status: 'nonsense', targetNodeId: 'nope' }))));
  step(n.act((x) => x.updateThread('nope', () => ({ title: 'x' }))));
  step(n.act((x) => x.addBeat(key, { title: '  Missing  ', nodeId: doc, role: 'introduction', note: 'n' })));
  step(n.act((x) => x.addBeat(key, { nodeId: doc2, role: 'appears' })));
  step(n.act((x) => x.addBeat(key, { title: '', nodeId: groupId, role: 'odd' })));
  step(n.act((x) => x.addBeat(key, { title: 'Crossed', nodeId: 'nope', role: 'intersection', withThreadIds: ['id1', key, 'nope', existing, 'id1'] })));
  step(n.act((x) => x.addBeat('nope', { title: 'x' })));
  const beats = (n.snapshot.rows('plotThreads').find((r) => r['id'] === key)!['beats'] as JsonMap[]).map((b) => b['id'] as string);
  step(n.act((x) => x.updateBeat(key, beats[0], { title: '   ', nodeId: null })));
  step(n.act((x) => x.updateBeat(key, beats[1], { title: '  ', role: 'appears', note: 'here' })));
  step(n.act((x) => x.updateBeat(key, beats[2], { nodeId: doc2, withThreadIds: ['id1'], role: 'bogus', title: ' New ' })));
  step(n.act((x) => x.removeBeat(key, beats[3])));
  step(n.act((x) => x.removeBeat(key, 'nope')));
  if (doc !== null) {
    step(
      n.act((x) =>
        x.updatePlan(doc, () => ({
          objective: 'Get inside',
          conflict: 5,
          beats: [{ text: 'one' }, { id: 'b2', text: '  ' }, { id: '', text: 'three' }, { id: 'b4', text: 'four' }],
          entityIds: [character, other, 'nope'],
          labels: ['  action ', 'Mine', 'mine', 'x'.repeat(50), 7],
          appearIds: [character, location],
          povIds: [character],
        })),
      ),
    );
    step(n.act((x) => x.updatePlan(doc, () => ({ mentionIds: [character], labels: null }))));
    step(n.act((x) => x.updateNode(doc, { summary: 'They reach it.', status: 'revising', noteBefore: 'Hi', noteAfter: 'Bye' })));
    step(n.act((x) => x.updateNode(doc, { notes: 'scratch' })));
  }
  if (groupId !== null) step(n.act((x) => x.updatePlan(groupId, () => ({ objective: 'x' }))));
  step(n.act((x) => x.updatePlan('nope', () => ({ objective: 'x' }))));
  step(n.act((x) => x.updateNode('nope', { summary: 'x' })));
  return {
    steps,
    threads: n.snapshot.rows('plotThreads'),
    plans: n.snapshot.rows('chapterPlans'),
    chapters: n.snapshot.rows('chapters').filter((r) => r['id'] === doc || r['id'] === groupId),
  };
}

// ---------------------------------------------------------------------------------------------------- the dump

export function novel(s: NovelSnapshot): Record<string, unknown> {
  const model = StoryModel.fromSnapshot(s);
  const title = str(s.project['title']);
  const threads = [...model.threads.values()];
  const firstStatus = [...model.nodes.values()].find((n) => n.kind === 'chapter')?.status ?? null;
  const firstCategory = threads[0]?.category ?? null;
  const filterSets: ThreadFilters[] = [
    { query: '', status: null, category: null, onlyFlagged: false },
    { query: 'the', status: null, category: null, onlyFlagged: false },
    { query: '', status: 'active', category: null, onlyFlagged: false },
    { query: '', status: null, category: firstCategory, onlyFlagged: false },
    { query: '', status: null, category: null, onlyFlagged: true },
  ];
  const out: Record<string, unknown> = {};
  for (const grouping of ['status', 'category', 'character'] as const) {
    out[`threads.${grouping}`] = filterSets.flatMap((f) => [5, 20].map((q) => threadsOut(model, title, f, grouping, q)));
  }
  const report = diagnose(threads, [...model.nodes.values()]);
  out['loom'] = report.reports.map((r) => cardOut(strandCard(r, model, report.frontier, report.chapterCount), report.chapterCount, report.frontier));
  const report5 = diagnose(threads, [...model.nodes.values()], 5);
  out['loom5'] = report5.reports.map((r) =>
    cardOut(strandCard(r, model, report5.frontier, report5.chapterCount), report5.chapterCount, report5.frontier, false),
  );
  out['threadPages'] = [...threads.map((t) => threadPageOut(model, t.id)), threadPageOut(model, 'nope')];
  out['board.none'] = boardOut(model, { text: '', status: null, threadId: null });
  out['board.text'] = boardOut(model, { text: 'a', status: null, threadId: null });
  out['board.status'] = boardOut(model, { text: '', status: firstStatus, threadId: null });
  out['board.thread'] = boardOut(model, { text: '', status: null, threadId: threads[0]?.id ?? null });
  out['cards'] = cards(model);
  out['moves'] = moves(model);
  out['history'] = history(model);
  out['plans'] = [...[...model.nodes.values()].map((n) => planOut(model, s, n.id)), planOut(model, s, 'nope')];
  out['changes'] = changes(s);
  return out;
}

export function misc(base: NovelSnapshot): Record<string, unknown> {
  const asked = new Novel(base.withRows('plotThreads', []));
  const texts = ['Can Ren survive the SSS rank', 'Who made the first skill?', '', '  Why? '];
  const count = asked.act((x) => askTheQuestions(x, storyQuestions.map((q, i) => [q, texts[i]] as const)));
  return {
    legend: loomLegend.map((l) => ({ mark: l.mark, text: l.text, drawing: legendDrawing(l.mark) })),
    asked: { count, threads: asked.snapshot.rows('plotThreads').map((r) => ({ title: r['title'], category: r['category'] })) },
    cleanLabels: [
      ['  action ', 'Mine', 'mine', 'x'.repeat(50), 7, 'Quiet   moment', 'mystery CLUE', ''],
      Array.from({ length: 20 }, (_, i) => `L${i}`),
      'not a list',
    ].map((l) => cleanLabels(l)),
    labelOrder: labelOrder(['zeta', 'Dialogue', 'alpha', 'Action', 'Beta', 'action', 'Quiet moment']),
    pickers: [labelPicker([], [], ''), labelPicker(['action', 'Mine'], ['mine', 'Theirs', 'Romance'], 'this scene')].map((p) => ({
      labels: p.labels,
      none: p.none,
      addTip: p.addTip,
      offered: p.offered,
    })),
    statusNames: [
      { status: 'custom', customStatus: '  Dormant ' },
      { status: 'custom', customStatus: '  ' },
      { status: 'active' },
      { status: 'weird' },
      {},
    ].map((raw) => threadStatusName(new PlotThread({ id: 't', ...raw }))),
    categoryNames: [{ category: 'custom', customCategory: ' Heist ' }, { category: 'custom', customCategory: '' }, { category: 'political' }, { category: 'odd' }, {}].map(
      (raw) => categoryName(new PlotThread({ id: 't', ...raw })),
    ),
  };
}
